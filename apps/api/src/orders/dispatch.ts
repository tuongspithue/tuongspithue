import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { OrderEvent, OrderState } from '@sqt/domain';
import { PoolClient } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { BusinessError } from '../common/errors';
import { ROOKIE_DEFAULT_SCORE } from '@sqt/domain';
import { point } from '../common/geo';
import { DATABASE, Database } from '../database/database';
import { ConfigCenter } from '../config-center/config.service';
import { JobsService } from './jobs';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';

const ACTIVE_RIDER_STATES = [
  OrderState.SHIPPER_DA_NHAN,
  OrderState.SHIPPER_DEN_QUAN,
  OrderState.DA_LAY_HANG,
  OrderState.DANG_GIAO,
  OrderState.DA_DEN_NOI,
];

/** Điều kiện SQL: shipper `r` không bị Admin tắt quyền nhận đơn COD (Phần 15.2). */
export const RIDER_COD_ALLOWED = `(SELECT e.value FROM user_entitlements e
  WHERE e.subject_type = 'RIDER' AND e.subject_id = r.user_id AND e.key = 'rider.cod.enabled'
    AND e.status = 'ACTIVE' AND e.effective_to > now() ORDER BY e.created_at DESC LIMIT 1) IS DISTINCT FROM 'false'::jsonb`;

/**
 * Điều phối shipper theo vòng mở rộng (Phần 3.4.1). Shipper phải tự bấm nhận chuyến (Cổng B);
 * hệ thống chỉ gửi lời mời.
 */
@Injectable()
export class DispatchService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly lifecycle: OrderLifecycle,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly configCenter: ConfigCenter,
  ) {}

  onModuleInit() {
    this.jobs.register('DISPATCH_WAVE_EXPIRE', async (job, client, now) => {
      const order = await this.lifecycle.lock(client, Number(job.order_id));
      if (order.state !== OrderState.DANG_TIM_SHIPPER) return;
      await client.query(
        `UPDATE dispatch_offers SET status = 'EXPIRED' WHERE order_id = $1 AND wave = $2 AND round = $3 AND status = 'SENT'`,
        [order.id, job.payload.wave, order.dispatch_round],
      );
      await this.sendWave(client, order, job.payload.wave + 1, now);
    });

    // Lượt mời thứ hai sau khi đã gọi lại quán (Phần 3.4).
    this.jobs.register('DISPATCH_RETRY', async (job, client) => {
      const order = await this.lifecycle.lock(client, Number(job.order_id));
      if (order.state !== OrderState.DANG_TIM_SHIPPER || order.rider_id) return;
      await this.sendWave(client, order, 1, job.run_at ? new Date(job.run_at) : new Date());
    });
  }

  /** Có điều phối viên (Admin/Ops) đang mở Admin Console không. */
  async opsOnDuty(q: { query: PoolClient['query'] } | Database, now: Date = new Date()): Promise<boolean> {
    const minutes = this.configCenter.get<number>('ops.on_duty_minutes', {});
    const { rows } = await (q as PoolClient).query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users u
       WHERE u.console_seen_at > $1::timestamptz - make_interval(mins => $2)
         AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('ADMIN', 'OPS'))`,
      [now, minutes],
    );
    return rows[0].n > 0;
  }

  /** Quán vừa nhận đơn giao bởi shipper → bắt đầu tìm shipper. */
  async start(client: PoolClient, order: OrderRow, now: Date = new Date()) {
    const searching = await this.lifecycle.apply(client, order, OrderEvent.START_DISPATCH, SYSTEM_ACTOR);
    return this.sendWave(client, searching, 1, now);
  }

  private riderEarning(order: OrderRow, bonus: number) {
    const share = Math.floor((Number(order.delivery_fee) * this.config.business.riderEarningShare) / 1000) * 1000;
    return share + bonus;
  }

  /**
   * Gửi lời mời vòng `wave`; vòng không có ai thì chuyển ngay vòng sau; hết vòng thì chuyển Ops.
   * Trả về đơn ở trạng thái mới nhất.
   */
  async sendWave(client: PoolClient, order: OrderRow, wave: number, now: Date = new Date()): Promise<OrderRow> {
    const waves = this.config.business.dispatchWaves;
    for (let w = wave; w <= waves.length; w++) {
      const cfg = waves[w - 1];
      const codNeeded = order.payment_method === 'COD' ? Number(order.total) : 0;
      const { rows } = await client.query<{ user_id: string; distance_m: number }>(
        `WITH p AS (
           SELECT COALESCE(o.pickup_location, s.location) AS location FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = $1
         )
         SELECT r.user_id, ST_Distance(r.location, s.location) AS distance_m
         FROM riders r CROSS JOIN p s
         LEFT JOIN trust_scores ts ON ts.subject_type = 'RIDER' AND ts.subject_id = r.user_id
         WHERE r.status = 'APPROVED' AND r.is_online AND r.location IS NOT NULL
           AND r.location_at > $2::timestamptz - interval '2 minutes'
           AND ST_DWithin(r.location, s.location, $3)
           AND r.cod_balance + $4 <= r.cod_limit
           -- Mua hộ: shipper phải ứng trước tiền món, chỉ mời người có hạn mức ứng đủ (Phần 3.8).
           AND ($9 = 0 OR r.advance_limit >= $9)
           AND ($4 = 0 OR ${RIDER_COD_ALLOWED})
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.rider_id = r.user_id AND o.state = ANY($5))
           AND NOT EXISTS (SELECT 1 FROM dispatch_offers d WHERE d.rider_id = r.user_id AND d.order_id = $6 AND d.round = $10)
           AND NOT EXISTS (SELECT 1 FROM dispatch_offers d WHERE d.rider_id = r.user_id AND d.status = 'SENT' AND d.expires_at > $2)
         -- Khoảng cách điều chỉnh theo uy tín: điểm 100 như gần hơn 20%, điểm 0 như xa hơn 20% (Phần 3.4.1, w3).
         ORDER BY ST_Distance(r.location, s.location) * (1 - (LEAST(GREATEST(COALESCE(ts.score, $8), 0), 100) - 50) / 250)
         LIMIT $7`,
        [order.id, now, cfg.radiusM, codNeeded, ACTIVE_RIDER_STATES, order.id, cfg.maxRiders, ROOKIE_DEFAULT_SCORE, order.fulfillment === 'PROXY' ? Number(order.subtotal) : 0, order.dispatch_round ?? 1],
      );
      if (rows.length === 0) continue;

      const expiresAt = new Date(now.getTime() + cfg.offerSeconds * 1000);
      for (const r of rows) {
        await client.query(
          `INSERT INTO dispatch_offers (order_id, rider_id, wave, distance_m, earning, expires_at, round) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, r.user_id, w, Math.round(r.distance_m), this.riderEarning(order, cfg.bonus), expiresAt, order.dispatch_round ?? 1],
        );
        await this.notifications.enqueue(client, r.user_id, 'PUSH', 'RIDER_OFFER', { orderId: Number(order.id), wave: w });
      }
      await this.jobs.schedule(client, 'DISPATCH_WAVE_EXPIRE', order.id, expiresAt, { wave: w });
      return order;
    }
    return this.noRider(client, order, now);
  }

  /**
   * Hết vòng mời mà không shipper nào nhận (Phần 3.4):
   *  1. Lượt đầu: gọi lại quán (quán chưa nhận thì nhắc nhận đơn) và hẹn mời shipper thêm một lượt.
   *  2. Lượt hai vẫn không ai nhận: có điều phối viên đang trực thì chuyển họ xử lý; không có thì huỷ,
   *     hoàn tiền và báo khách — không để khách chờ một "điều phối viên" không tồn tại.
   */
  private async noRider(client: PoolClient, order: OrderRow, now: Date): Promise<OrderRow> {
    const info = { orderId: Number(order.id), code: order.code };
    if ((order.dispatch_round ?? 1) < 2) {
      await client.query('UPDATE orders SET dispatch_round = 2 WHERE id = $1', [order.id]);
      if (order.store_id) {
        // Quán chưa nhận (đơn mua hộ) thì nhắc nhận đơn; quán đã nhận thì báo đang tìm thêm shipper.
        await this.notifications.toStore(client, order.store_id, 'PUSH', order.accepted_at ? 'NO_RIDER_YET' : 'NEW_ORDER_REMINDER', info);
      }
      if (await this.opsOnDuty(client, now)) await this.notifications.enqueue(client, null, 'PUSH', 'OPS_STUCK_ORDER', { ...info, reason: 'NO_RIDER_RETRY' });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'NO_RIDER_RETRYING', info);
      const delay = this.configCenter.get<number>('dispatch.retry_delay_seconds', {});
      await this.jobs.schedule(client, 'DISPATCH_RETRY', order.id, new Date(now.getTime() + delay * 1000));
      return { ...order, dispatch_round: 2 };
    }
    if (await this.opsOnDuty(client, now)) {
      const stuck = await this.lifecycle.apply(client, order, OrderEvent.DISPATCH_EXHAUSTED, SYSTEM_ACTOR);
      await this.notifications.enqueue(client, null, 'PUSH', 'OPS_STUCK_ORDER', { ...info, reason: 'NO_RIDER' });
      return stuck;
    }
    const cancelled = await this.lifecycle.apply(client, order, OrderEvent.NO_RIDER_CANCEL, SYSTEM_ACTOR, {
      set: { cancel_reason: 'NO_RIDER', cancelled_by_role: 'SYSTEM', refund_kind: 'FULL' },
    });
    await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'ORDER_CANCELLED_NO_RIDER', info);
    if (order.store_id) await this.notifications.toStore(client, order.store_id, 'PUSH', 'ORDER_CANCELLED_NO_RIDER', info);
    return cancelled;
  }

  async offersFor(riderId: number) {
    const { rows } = await this.db.query(
      `SELECT d.id, d.order_id, d.wave, d.distance_m, d.earning, d.expires_at, o.kind, o.fee_payer, o.parcel_size, o.dropoff_address, o.fulfillment, o.subtotal,
              COALESCE(s.name, '📦 Gửi hàng') AS store_name, COALESCE(s.address_text, o.pickup_address) AS store_address,
              o.payment_method, o.total, o.distance_m AS trip_m
       FROM dispatch_offers d JOIN orders o ON o.id = d.order_id LEFT JOIN stores s ON s.id = o.store_id
       WHERE d.rider_id = $1 AND d.status = 'SENT' AND d.expires_at > now()
       ORDER BY d.sent_at`,
      [riderId],
    );
    return {
      offers: rows.map((r) => ({
        id: Number(r.id),
        orderId: Number(r.order_id),
        wave: r.wave,
        storeName: r.store_name,
        storeAddress: r.store_address,
        distanceToStoreM: r.distance_m,
        tripDistanceM: r.trip_m,
        earning: Number(r.earning),
        cashToCollect: r.payment_method === 'COD' ? Number(r.total) : 0,
        expiresAt: r.expires_at,
        kind: r.kind,
        // Gửi hàng: thu tiền ở điểm lấy (người gửi trả) hay điểm giao (người nhận trả).
        feePayer: r.fee_payer,
        parcelSize: r.parcel_size,
        dropoffAddress: r.dropoff_address,
        // Mua hộ: shipper tới quán đặt món và ứng trước tiền món.
        fulfillment: r.fulfillment,
        advanceAmount: r.fulfillment === 'PROXY' ? Number(r.subtotal) : 0,
      })),
    };
  }

  /** Cổng B: shipper bấm nhận chuyến. Khoá đơn để hai shipper không cùng nhận được. */
  async accept(riderId: number, offerId: number) {
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM dispatch_offers WHERE id = $1 AND rider_id = $2 FOR UPDATE`,
        [offerId, riderId],
      );
      const offer = rows[0];
      if (!offer) throw new BusinessError('OFFER_NOT_FOUND', 'Không tìm thấy lời mời', 404);
      if (offer.status !== 'SENT' || new Date(offer.expires_at).getTime() <= Date.now()) {
        throw new BusinessError('OFFER_EXPIRED', 'Lời mời đã hết hạn hoặc đã có người nhận', 409);
      }
      const order = await this.lifecycle.lock(client, Number(offer.order_id));
      const actor: Actor = { id: riderId, role: 'RIDER', channel: 'APP' };
      const accepted = await this.lifecycle.apply(client, order, OrderEvent.RIDER_ACCEPT, actor, {
        set: { rider_id: riderId, rider_accepted_at: new Date() },
        payload: { offerId },
      });
      await client.query(`UPDATE dispatch_offers SET status = 'ACCEPTED', responded_at = now() WHERE id = $1`, [offerId]);
      await client.query(
        `UPDATE dispatch_offers SET status = 'SUPERSEDED' WHERE order_id = $1 AND id <> $2 AND status = 'SENT'`,
        [order.id, offerId],
      );
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'RIDER_ASSIGNED', { orderId: Number(order.id) });
      return accepted;
    });
  }

  async decline(riderId: number, offerId: number) {
    const { rowCount } = await this.db.query(
      `UPDATE dispatch_offers SET status = 'DECLINED', responded_at = now()
       WHERE id = $1 AND rider_id = $2 AND status = 'SENT'`,
      [offerId, riderId],
    );
    if (!rowCount) throw new BusinessError('OFFER_NOT_FOUND', 'Không tìm thấy lời mời còn hiệu lực', 404);
    return { declined: true };
  }

  async setStatus(riderId: number, online: boolean, lat?: number, lng?: number) {
    const rider = await this.db.one('SELECT status FROM riders WHERE user_id = $1', [riderId]);
    if (!rider) throw new BusinessError('NOT_A_RIDER', 'Bạn chưa đăng ký làm shipper', 403);
    if (online && rider.status !== 'APPROVED') {
      throw new BusinessError('RIDER_NOT_APPROVED', 'Hồ sơ shipper chưa được duyệt');
    }
    const hasLocation = lat !== undefined && lng !== undefined;
    await this.db.query(
      `UPDATE riders SET is_online = $2${hasLocation ? `, location = ${point(3, 4)}, location_at = now()` : ''} WHERE user_id = $1`,
      hasLocation ? [riderId, online, lng, lat] : [riderId, online],
    );
    return { online };
  }
}
