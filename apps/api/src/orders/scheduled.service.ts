import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BOARD_DELAY_MINUTES, MAX_SCHEDULED_CLAIMS, OrderEvent, OrderState } from '@sqt/domain';
import { TrustService } from '../trust/trust.service';
import { EntitlementService } from '../config-center/entitlements.service';
import { PoolClient } from 'pg';
import { AuthUser, worksAtStore } from '../common/auth';
import { BusinessError } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE, Database } from '../database/database';
import { DispatchService } from './dispatch';
import { JobsService } from './jobs';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';

import { RIDER_COD_ALLOWED } from './dispatch';

const MINUTE = 60_000;
const SLOT_MS = 15 * MINUTE;

export const slotStart = (d: Date) => new Date(Math.floor(d.getTime() / SLOT_MS) * SLOT_MS);
const minus = (d: Date, minutes: number) => new Date(d.getTime() - minutes * MINUTE);

export interface ScheduleInput {
  type: 'PICKUP' | 'DELIVERY';
  at: string;
}

export interface SchedulePlan {
  type: 'PICKUP' | 'DELIVERY';
  scheduledFor: Date;
  pickupAt: Date;
}

/**
 * Đơn hẹn giờ (Phần 10): quán nhận trên tab "Đơn hẹn", shipper giữ chuyến trên "Chợ chuyến hẹn",
 * hai bên xác nhận lại trước giờ. Mọi mốc thời gian là việc hẹn giờ bền vững.
 */
@Injectable()
export class ScheduledService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly lifecycle: OrderLifecycle,
    private readonly jobs: JobsService,
    private readonly dispatch: DispatchService,
    private readonly notifications: NotificationsService,
    private readonly trust: TrustService,
    private readonly entitlements: EntitlementService,
  ) {}

  private get rules() {
    return this.config.business.scheduled;
  }

  // ---------------- Lập lịch khi tạo đơn ----------------

  /** Quy đổi giờ khách chọn ra giờ lấy hàng tại quán và kiểm tra giới hạn (Phần 10.2). */
  plan(input: ScheduleInput, routeKm: number, now: Date): SchedulePlan {
    const scheduledFor = new Date(input.at);
    if (Number.isNaN(scheduledFor.getTime())) throw new BusinessError('SCHEDULE_INVALID', 'Giờ hẹn không hợp lệ', 400);
    if (scheduledFor.getTime() % SLOT_MS !== 0) {
      throw new BusinessError('SCHEDULE_NOT_ON_SLOT', 'Giờ hẹn phải theo khung 15 phút (VD 11:30, 11:45)');
    }
    const travel = input.type === 'DELIVERY' ? Math.ceil(((routeKm / this.rules.riderSpeedKmh) * 60) / 5) * 5 + 5 : 0;
    const pickupAt = minus(scheduledFor, travel);
    if (pickupAt.getTime() < now.getTime() + this.rules.minLeadMinutes * MINUTE) {
      throw new BusinessError('SCHEDULE_TOO_SOON', `Hẹn giờ sớm nhất sau ${this.rules.minLeadMinutes} phút; gần hơn hãy đặt giao ngay`);
    }
    if (scheduledFor.getTime() > now.getTime() + this.rules.maxDaysAhead * 24 * 60 * MINUTE) {
      throw new BusinessError('SCHEDULE_TOO_FAR', `Chỉ hẹn trước tối đa ${this.rules.maxDaysAhead} ngày`);
    }
    return { type: input.type, scheduledFor, pickupAt };
  }

  /** Giữ chỗ trong lịch năng lực của quán; khung kín thì từ chối. */
  async reserveSlot(client: PoolClient, storeId: number | string, pickupAt: Date, capacity: number) {
    const { rows } = await client.query(
      `INSERT INTO store_capacity_slots (store_id, slot_start, max_orders, booked) VALUES ($1, $2, $3, 1)
       ON CONFLICT (store_id, slot_start) DO UPDATE SET booked = store_capacity_slots.booked + 1
         WHERE store_capacity_slots.booked < store_capacity_slots.max_orders
       RETURNING booked`,
      [storeId, slotStart(pickupAt), capacity],
    );
    if (!rows[0]) throw new BusinessError('SLOT_FULL', 'Khung giờ này quán đã kín, vui lòng chọn giờ khác');
  }

  async releaseSlot(client: PoolClient, storeId: number | string, pickupAt: Date) {
    await client.query(
      'UPDATE store_capacity_slots SET booked = GREATEST(booked - 1, 0) WHERE store_id = $1 AND slot_start = $2',
      [storeId, slotStart(pickupAt)],
    );
  }

  /** Khách được dùng COD cho đơn hẹn khi đã có đủ đơn thành công (Phần 10.7). */
  async assertCodAllowed(client: PoolClient, customerId: number) {
    const { rows } = await client.query<{ done: number; refused: number }>(
      `SELECT count(*) FILTER (WHERE state = 'HOAN_THANH')::int AS done,
              count(*) FILTER (WHERE cancel_reason = 'COD_REFUSED' AND created_at > now() - interval '90 days')::int AS refused
       FROM orders WHERE customer_id = $1`,
      [customerId],
    );
    if (rows[0].done < this.rules.codMinCompletedOrders || rows[0].refused > 0) {
      throw new BusinessError(
        'SCHEDULED_COD_NOT_ALLOWED',
        `Đơn hẹn trả tiền mặt cần ít nhất ${this.rules.codMinCompletedOrders} đơn đã giao thành công. Vui lòng chọn thanh toán online.`,
      );
    }
  }

  /** Hạn trả lời của quán = min(30 phút, 50% thời gian còn lại), tối thiểu 5 phút; nhắc thưa dần (Phần 10.4). */
  async scheduleMerchantReply(client: PoolClient, order: OrderRow, now: Date) {
    const untilPickup = new Date(order.scheduled_pickup_at).getTime() - now.getTime();
    const window = Math.max(this.rules.replyMinMinutes * MINUTE, Math.min(this.rules.replyMaxMinutes * MINUTE, untilPickup / 2));
    const deadline = new Date(now.getTime() + window);
    await client.query('UPDATE orders SET merchant_reply_deadline = $2 WHERE id = $1', [order.id, deadline]);
    const steps: Array<[number, string]> = [
      [1 / 3, 'REMIND'],
      [2 / 3, 'OPS_CALL'],
      [1, 'AUTO_CANCEL'],
    ];
    for (const [fraction, action] of steps) {
      await this.jobs.schedule(client, 'GATE_A_STEP', order.id, new Date(now.getTime() + window * fraction), { action });
    }
    await this.notifications.toStore(client, order.store_id, 'PUSH', 'NEW_SCHEDULED_ORDER', {
      orderId: Number(order.id),
      pickupAt: order.scheduled_pickup_at,
      replyBy: deadline,
    });
  }

  /** Sau khi quán nhận đơn hẹn: đăng lên chợ chuyến (hoặc chờ khách tự đến lấy) và đặt các mốc trước giờ. */
  async afterAccepted(client: PoolClient, order: OrderRow, now: Date = new Date()): Promise<OrderRow> {
    const pickupAt = new Date(order.scheduled_pickup_at);
    const prep = Number(order.prep_time_min ?? 15);
    await this.jobs.schedule(client, 'SCHEDULED_PREP_REMINDER', order.id, minus(pickupAt, prep + 5));
    await this.jobs.schedule(client, 'MERCHANT_RECONFIRM_REQUEST', order.id, minus(pickupAt, this.rules.merchantReconfirmAtMinutes));
    await this.jobs.schedule(
      client,
      'MERCHANT_RECONFIRM_DEADLINE',
      order.id,
      minus(pickupAt, this.rules.merchantReconfirmAtMinutes - this.rules.merchantReconfirmGraceMinutes),
    );

    if (order.delivery_mode === 'SELF_PICKUP') {
      await this.jobs.schedule(client, 'SCHEDULED_PICKUP_OPEN', order.id, minus(pickupAt, prep));
      return order;
    }
    const posted = await this.lifecycle.apply(client, order, OrderEvent.POST_TO_BOARD, SYSTEM_ACTOR);
    await client.query('UPDATE orders SET posted_to_board_at = $2 WHERE id = $1', [order.id, now]);
    await this.jobs.schedule(client, 'BOARD_BONUS', order.id, minus(pickupAt, this.rules.boardBonusAtMinutes));
    await this.jobs.schedule(client, 'BOARD_UNCLAIMED', order.id, minus(pickupAt, this.rules.boardUnclaimedAtMinutes));
    await this.jobs.schedule(client, 'RIDER_RECONFIRM_DEADLINE', order.id, minus(pickupAt, this.rules.riderReconfirmAtMinutes));
    await this.jobs.schedule(client, 'SCHEDULED_SLOT_START', order.id, minus(pickupAt, this.rules.slotStartMinutes));
    return posted;
  }

  // ---------------- Việc hẹn giờ ----------------

  onModuleInit() {
    const onOrder = (kind: string, fn: (client: PoolClient, order: OrderRow, now: Date) => Promise<void>) =>
      this.jobs.register(kind, async (job, client, now) => fn(client, await this.lifecycle.lock(client, Number(job.order_id)), now));

    onOrder('SCHEDULED_PREP_REMINDER', async (client, order) => {
      if (![OrderState.HEN_QUAN_DA_NHAN, OrderState.HEN_TREN_CHO_CHUYEN, OrderState.HEN_SHIPPER_DA_GIU, OrderState.HEN_SAN_SANG].includes(order.state as never)) return;
      await this.notifications.toStore(client, order.store_id, 'PUSH', 'START_PREP_NOW', { orderId: Number(order.id) });
    });

    onOrder('MERCHANT_RECONFIRM_REQUEST', async (client, order) => {
      if (!order.is_scheduled || order.merchant_reconfirmed_at || !order.state.startsWith('HEN_')) return;
      await this.notifications.toStore(client, order.store_id, 'PUSH', 'RECONFIRM_SCHEDULED', { orderId: Number(order.id) });
    });

    onOrder('MERCHANT_RECONFIRM_DEADLINE', async (client, order) => {
      if (!order.is_scheduled || order.merchant_reconfirmed_at || !order.state.startsWith('HEN_')) return;
      if (order.state === OrderState.HEN_SHIPPER_DA_GIU) {
        await this.lifecycle.apply(client, order, OrderEvent.MERCHANT_RECONFIRM_MISSED, SYSTEM_ACTOR);
      }
      // Điều phối viên gọi quán để hỏi lại (mở app gọi từ Admin Console).
      const store = (await client.query('SELECT name, phone FROM stores WHERE id = $1', [order.store_id])).rows[0];
      await this.notifications.enqueue(client, null, 'PUSH', 'OPS_CALL_STORE', {
        orderId: Number(order.id),
        code: order.code,
        reason: 'MERCHANT_NOT_RECONFIRMED',
        storeName: store.name,
        storePhone: store.phone,
      });
    });

    onOrder('SCHEDULED_PICKUP_OPEN', async (client, order) => {
      if (order.state !== OrderState.HEN_QUAN_DA_NHAN) return;
      await this.lifecycle.apply(client, order, OrderEvent.START_PICKUP_WAIT, SYSTEM_ACTOR);
    });

    onOrder('BOARD_BONUS', async (client, order) => {
      if (order.state !== OrderState.HEN_TREN_CHO_CHUYEN) return;
      await client.query('UPDATE orders SET board_bonus = board_bonus + $2 WHERE id = $1', [order.id, this.rules.boardBonus]);
    });

    onOrder('BOARD_UNCLAIMED', async (client, order, now) => {
      if (order.state !== OrderState.HEN_TREN_CHO_CHUYEN) return;
      const searching = await this.lifecycle.apply(client, order, OrderEvent.BOARD_UNCLAIMED, SYSTEM_ACTOR);
      await this.dispatch.sendWave(client, searching, 1, now);
    });

    onOrder('RIDER_RECONFIRM_DEADLINE', async (client, order, now) => {
      if (order.state !== OrderState.HEN_SHIPPER_DA_GIU || order.rider_reconfirmed_at) return;
      const searching = await this.lifecycle.apply(client, order, OrderEvent.RIDER_RECONFIRM_MISSED, SYSTEM_ACTOR, {
        set: { rider_id: null, rider_accepted_at: null },
        payload: { riderId: Number(order.rider_id) },
      });
      await this.dispatch.sendWave(client, searching, 1, now);
    });

    onOrder('PROPOSAL_TIMEOUT', async (client, order) => {
      if (order.state !== OrderState.HEN_CHO_KHACH_DUYET_GIO) return;
      await this.lifecycle.apply(client, order, OrderEvent.CHANGES_TIMEOUT, SYSTEM_ACTOR, {
        set: { cancel_reason: 'PROPOSAL_EXPIRED', cancelled_by_role: 'SYSTEM', refund_kind: 'FULL' },
      });
    });

    onOrder('SCHEDULED_SLOT_START', async (client, order) => {
      if (order.state !== OrderState.HEN_SAN_SANG) return;
      await this.lifecycle.apply(client, order, OrderEvent.SLOT_START, SYSTEM_ACTOR);
      await this.notifications.enqueue(client, order.rider_id, 'PUSH', 'SCHEDULED_TRIP_START', { orderId: Number(order.id) });
    });
  }

  /** Đủ cả hai xác nhận lại thì chuyển sang sẵn sàng. */
  private async maybeReady(client: PoolClient, order: OrderRow) {
    if (order.state === OrderState.HEN_SHIPPER_DA_GIU && order.merchant_reconfirmed_at && order.rider_reconfirmed_at) {
      return this.lifecycle.apply(client, order, OrderEvent.RECONFIRMED, SYSTEM_ACTOR);
    }
    return order;
  }

  // ---------------- Quán ----------------

  async merchantReconfirm(user: AuthUser, orderId: number, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      let order = await this.lifecycle.lock(client, orderId);
      if (!worksAtStore(user, Number(order.store_id))) throw new BusinessError('NOT_STORE_MEMBER', 'Đơn này không thuộc quán của bạn', 403);
      if (!order.is_scheduled || !order.state.startsWith('HEN_') || order.state === OrderState.HEN_CHO_QUAN_NHAN) {
        throw new BusinessError('NOT_RECONFIRMABLE', 'Đơn không ở bước xác nhận lại', 409);
      }
      const opensAt = minus(new Date(order.scheduled_pickup_at), this.rules.merchantReconfirmWindowMinutes);
      if (now < opensAt) throw new BusinessError('RECONFIRM_TOO_EARLY', 'Chưa tới lúc xác nhận lại', 409);
      const { rows } = await client.query<OrderRow>(
        'UPDATE orders SET merchant_reconfirmed_at = $2 WHERE id = $1 RETURNING *',
        [order.id, now],
      );
      await this.lifecycle.recordEvent(client, order.id, order.state, order.state, 'MERCHANT_RECONFIRMED', {
        id: user.id,
        role: 'MERCHANT',
        channel: 'APP',
      });
      order = await this.maybeReady(client, rows[0]);
      return { id: orderId, state: order.state };
    });
  }

  /** Quán nhận có điều kiện với giờ khác; khách đồng ý thì đơn coi như quán đã nhận (Phần 10.4). */
  async proposeTime(user: AuthUser, orderId: number, input: { at: string; prepTimeMin: number; allergyAck?: boolean }, now: Date = new Date()) {
    const at = input.at;
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      if (!worksAtStore(user, Number(order.store_id))) throw new BusinessError('NOT_STORE_MEMBER', 'Đơn này không thuộc quán của bạn', 403);
      const proposed = new Date(at);
      if (Number.isNaN(proposed.getTime()) || proposed.getTime() % SLOT_MS !== 0 || proposed.getTime() < now.getTime() + this.rules.minLeadMinutes * MINUTE) {
        throw new BusinessError('SCHEDULE_INVALID', 'Giờ đề xuất phải theo khung 15 phút và sau ít nhất 45 phút');
      }
      const ack = order.has_allergens && input.allergyAck === true;
      const next = await this.lifecycle.apply(client, order, OrderEvent.MERCHANT_PROPOSE_TIME, { id: user.id, role: 'MERCHANT', channel: 'APP' }, {
        ctx: { allergyAcknowledged: ack || Boolean(order.allergy_ack_at) },
        set: {
          prep_time_min: input.prepTimeMin,
          accepted_by: user.id,
          accepted_channel: 'APP',
          accepted_at: now,
          ...(ack ? { allergy_ack_by: user.id, allergy_ack_at: now } : {}),
        },
        payload: { proposedPickupAt: proposed },
      });
      await client.query('UPDATE orders SET proposed_pickup_at = $2 WHERE id = $1', [order.id, proposed]);
      await this.jobs.schedule(client, 'PROPOSAL_TIMEOUT', order.id, new Date(now.getTime() + this.rules.proposalReplyMinutes * MINUTE));
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'MERCHANT_PROPOSED_TIME', { orderId, proposedPickupAt: proposed });
      return { id: orderId, state: next.state, proposedPickupAt: proposed };
    });
  }

  // ---------------- Shipper: chợ chuyến hẹn ----------------

  /** Shipper uy tín cao thấy chuyến sớm hơn; nhóm "Cần cải thiện" không thấy chợ (Phần 10.5). */
  async board(riderId: number, now: Date = new Date()) {
    const trust = await this.trust.get(this.db, 'RIDER', riderId);
    const delay = BOARD_DELAY_MINUTES[trust.tier];
    if (delay === null) return { tier: trust.tier, trips: [] };
    const { rows } = await this.db.query(
      `SELECT o.id, o.code, o.scheduled_pickup_at, o.delivery_fee, o.board_bonus, o.payment_method, o.total, o.distance_m,
              s.name AS store_name, s.address_text AS store_address, ST_Distance(s.location, r.location) AS to_store_m
       FROM orders o JOIN stores s ON s.id = o.store_id JOIN riders r ON r.user_id = $1
       WHERE o.state = 'HEN_TREN_CHO_CHUYEN' AND r.status = 'APPROVED' AND r.location IS NOT NULL
         AND ST_DWithin(s.location, r.location, $2)
         AND (o.payment_method <> 'COD' OR (r.cod_balance + o.total <= r.cod_limit AND ${RIDER_COD_ALLOWED}))
         AND o.posted_to_board_at <= $3::timestamptz - make_interval(mins => $4)
       ORDER BY o.scheduled_pickup_at
       LIMIT 100`,
      [riderId, this.rules.boardRadiusM, now, delay],
    );
    return {
      tier: trust.tier,
      trips: rows.map((r) => ({
        orderId: Number(r.id),
        pickupAt: r.scheduled_pickup_at,
        storeName: r.store_name,
        storeAddress: r.store_address,
        distanceToStoreM: Math.round(Number(r.to_store_m)),
        tripDistanceM: r.distance_m,
        earning: Math.floor((Number(r.delivery_fee) * this.config.business.riderEarningShare) / 1000) * 1000 + Number(r.board_bonus),
        bonus: Number(r.board_bonus),
        cashToCollect: r.payment_method === 'COD' ? Number(r.total) : 0,
      })),
    };
  }

  /** Cổng B cho đơn hẹn: giữ chuyến là cam kết (Phần 10.5). */
  async claim(riderId: number, orderId: number) {
    return this.db.tx(async (client) => {
      const rider = (await client.query('SELECT * FROM riders WHERE user_id = $1 FOR UPDATE', [riderId])).rows[0];
      if (!rider || rider.status !== 'APPROVED') throw new BusinessError('RIDER_NOT_APPROVED', 'Hồ sơ shipper chưa được duyệt', 403);
      const order = await this.lifecycle.lock(client, orderId);
      if (order.state !== OrderState.HEN_TREN_CHO_CHUYEN) {
        throw new BusinessError('TRIP_TAKEN', 'Chuyến vừa có người giữ hoặc không còn trên chợ', 409);
      }
      const pickupAt = new Date(order.scheduled_pickup_at);
      const { rows: mine } = await client.query(
        `SELECT scheduled_pickup_at FROM orders WHERE rider_id = $1 AND state IN ('HEN_SHIPPER_DA_GIU', 'HEN_SAN_SANG')`,
        [riderId],
      );
      // Admin có thể đặt số chuyến riêng cho từng shipper (Phần 15.2); mặc định theo cấp uy tín.
      const override = await this.entitlements.get<number | null>(client, 'RIDER', riderId, 'rider.scheduled_claims.max');
      const limit = override ?? MAX_SCHEDULED_CLAIMS[(await this.trust.get(client, 'RIDER', riderId)).tier];
      if (mine.length >= limit) throw new BusinessError('CLAIM_LIMIT', `Bạn đang giữ tối đa ${limit} chuyến hẹn`, 409);
      const conflict = mine.some((m) => Math.abs(new Date(m.scheduled_pickup_at).getTime() - pickupAt.getTime()) < this.rules.claimGapMinutes * MINUTE);
      if (conflict) throw new BusinessError('CLAIM_CONFLICT', 'Bạn đã giữ một chuyến khác quá sát giờ này', 409);
      if (order.payment_method === 'COD' && Number(rider.cod_balance) + Number(order.total) > Number(rider.cod_limit)) {
        throw new BusinessError('COD_LIMIT', 'Vượt hạn mức tiền mặt, hãy nộp tiền trước khi giữ chuyến COD', 409);
      }
      const actor: Actor = { id: riderId, role: 'RIDER', channel: 'APP' };
      const claimed = await this.lifecycle.apply(client, order, OrderEvent.RIDER_CLAIM, actor, {
        set: { rider_id: riderId, rider_accepted_at: new Date() },
      });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'SCHEDULED_RIDER_CLAIMED', { orderId });
      return { id: orderId, state: claimed.state };
    });
  }

  async releaseClaim(riderId: number, orderId: number, reason: string, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      if (Number(order.rider_id) !== riderId) throw new BusinessError('NOT_YOUR_TRIP', 'Đơn này không phải chuyến của bạn', 403);
      const hoursBefore = (new Date(order.scheduled_pickup_at).getTime() - now.getTime()) / (60 * MINUTE);
      const released = await this.lifecycle.apply(client, order, OrderEvent.RIDER_RELEASE, { id: riderId, role: 'RIDER', channel: 'APP' }, {
        set: { rider_id: null, rider_accepted_at: null },
        // Nhả sát giờ (< 2 giờ) sẽ bị tính vào điểm uy tín — Phần 10.5, 11.
        payload: { reason, late: hoursBefore < this.rules.freeReleaseHours },
      });
      await client.query('UPDATE orders SET rider_reconfirmed_at = NULL WHERE id = $1', [order.id]);
      return { id: orderId, state: released.state, late: hoursBefore < this.rules.freeReleaseHours };
    });
  }

  async riderReconfirm(riderId: number, orderId: number, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      if (Number(order.rider_id) !== riderId || order.state !== OrderState.HEN_SHIPPER_DA_GIU) {
        throw new BusinessError('NOT_RECONFIRMABLE', 'Không có chuyến hẹn nào của bạn cần xác nhận', 409);
      }
      const opensAt = minus(new Date(order.scheduled_pickup_at), this.rules.riderReconfirmWindowMinutes);
      if (now < opensAt) throw new BusinessError('RECONFIRM_TOO_EARLY', 'Chưa tới lúc xác nhận sẵn sàng', 409);
      const rider = (await client.query('SELECT is_online FROM riders WHERE user_id = $1', [riderId])).rows[0];
      if (!rider?.is_online) throw new BusinessError('RIDER_OFFLINE', 'Bạn cần bật trực tuyến để xác nhận sẵn sàng');
      const { rows } = await client.query<OrderRow>('UPDATE orders SET rider_reconfirmed_at = $2 WHERE id = $1 RETURNING *', [order.id, now]);
      await this.lifecycle.recordEvent(client, order.id, order.state, order.state, 'RIDER_RECONFIRMED', { id: riderId, role: 'RIDER', channel: 'APP' });
      const next = await this.maybeReady(client, rows[0]);
      return { id: orderId, state: next.state };
    });
  }

  // ---------------- Khách ----------------

  async slots(storeId: number, date: string, now: Date = new Date()) {
    const store = await this.db.one('SELECT slot_capacity FROM stores WHERE id = $1 AND status = $2', [storeId, 'APPROVED']);
    if (!store) throw new BusinessError('STORE_NOT_FOUND', 'Không tìm thấy quán', 404);
    const dayStart = new Date(`${date}T00:00:00+07:00`);
    if (Number.isNaN(dayStart.getTime())) throw new BusinessError('DATE_INVALID', 'Ngày không hợp lệ (YYYY-MM-DD)', 400);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * MINUTE);
    const earliest = new Date(Math.ceil((now.getTime() + this.rules.minLeadMinutes * MINUTE) / SLOT_MS) * SLOT_MS);
    const { rows } = await this.db.query('SELECT slot_start, max_orders, booked FROM store_capacity_slots WHERE store_id = $1 AND slot_start >= $2 AND slot_start < $3', [
      storeId,
      dayStart,
      dayEnd,
    ]);
    const booked = new Map(rows.map((r) => [new Date(r.slot_start).getTime(), r]));
    const slots = [];
    for (let t = Math.max(dayStart.getTime(), earliest.getTime()); t < dayEnd.getTime(); t += SLOT_MS) {
      const r = booked.get(t);
      const max = r ? r.max_orders : store.slot_capacity;
      const used = r ? r.booked : 0;
      slots.push({ start: new Date(t), remaining: Math.max(0, max - used), status: used >= max ? 'FULL' : used >= max - 1 ? 'BUSY' : 'OPEN' });
    }
    return { storeId, date, slots };
  }

  async respondToProposal(user: AuthUser, orderId: number, accept: boolean, afterAccepted: (c: PoolClient, o: OrderRow) => Promise<OrderRow>) {
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      if (Number(order.customer_id) !== user.id) throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
      const actor: Actor = { id: user.id, role: 'CUSTOMER', channel: 'APP' };
      if (!accept) {
        const cancelled = await this.lifecycle.apply(client, order, OrderEvent.CUSTOMER_REJECT_CHANGES, actor, {
          set: { cancel_reason: 'CUSTOMER_REJECTED_PROPOSAL', cancelled_by_role: 'CUSTOMER', refund_kind: 'FULL' },
        });
        return { id: orderId, state: cancelled.state };
      }
      if (order.state === OrderState.HEN_CHO_KHACH_DUYET_GIO) {
        const store = (await client.query('SELECT slot_capacity FROM stores WHERE id = $1', [order.store_id])).rows[0];
        const proposed = new Date(order.proposed_pickup_at);
        await this.releaseSlot(client, order.store_id, new Date(order.scheduled_pickup_at));
        await this.reserveSlot(client, order.store_id, proposed, store.slot_capacity);
        await client.query('UPDATE orders SET scheduled_pickup_at = proposed_pickup_at, proposed_pickup_at = NULL WHERE id = $1', [order.id]);
        order.scheduled_pickup_at = proposed;
      }
      const accepted = await this.lifecycle.apply(client, order, OrderEvent.CUSTOMER_ACCEPT_CHANGES, actor);
      const next = await afterAccepted(client, accepted);
      return { id: orderId, state: next.state };
    });
  }
}
