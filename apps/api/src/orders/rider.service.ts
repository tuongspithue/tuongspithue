import { Inject, Injectable } from '@nestjs/common';
import { OrderEvent } from '@sqt/domain';
import { PoolClient } from 'pg';
import { BusinessError } from '../common/errors';
import { LatLng, point } from '../common/geo';
import { APP_CONFIG, AppConfig } from '../config';
import { ConfigCenter } from '../config-center/config.service';
import { DATABASE, Database } from '../database/database';
import { DispatchService } from './dispatch';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';
import { OrdersService } from './orders.service';

export interface StepInput extends LatLng {
  /** Ảnh chụp tại chỗ khi GPS yếu — cho phép xác nhận ngoài geofence, đơn bị gắn cờ hậu kiểm (Phần 2.3.4). */
  photoUrl?: string;
}

/** Các bước thực hiện chuyến của shipper (Phần 2.3.4). */
@Injectable()
export class RiderService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly lifecycle: OrderLifecycle,
    private readonly dispatch: DispatchService,
    private readonly notifications: NotificationsService,
    private readonly orders: OrdersService,
    private readonly configCenter: ConfigCenter,
  ) {}

  private actor(riderId: number): Actor {
    return { id: riderId, role: 'RIDER', channel: 'APP' };
  }

  private async lockOwn(client: PoolClient, riderId: number, orderId: number): Promise<OrderRow> {
    const order = await this.lifecycle.lock(client, orderId);
    if (!order.rider_id || Number(order.rider_id) !== riderId) {
      throw new BusinessError('NOT_YOUR_TRIP', 'Đơn này không phải chuyến của bạn', 403);
    }
    return order;
  }

  /** Trong vùng cho phép, hoặc có ảnh chụp thì cho qua và gắn cờ. */
  private async checkGeofence(client: PoolClient, order: OrderRow, distanceM: number, limitM: number, input: StepInput, flag: string) {
    if (distanceM <= limitM) return;
    if (!input.photoUrl) {
      throw new BusinessError('OUTSIDE_GEOFENCE', `Bạn đang cách điểm đến ${Math.round(distanceM)} m. Nếu GPS yếu, hãy chụp ảnh tại chỗ để xác nhận.`);
    }
    await client.query('UPDATE orders SET flags = array_append(flags, $2) WHERE id = $1', [order.id, flag]);
  }

  async register(userId: number, vehicleType: string, plateNumber?: string) {
    await this.db.tx(async (client) => {
      await client.query(
        `INSERT INTO riders (user_id, vehicle_type, plate_number) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type, plate_number = EXCLUDED.plate_number`,
        [userId, vehicleType, plateNumber ?? null],
      );
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'RIDER') ON CONFLICT DO NOTHING`, [userId]);
    });
    return { status: 'PENDING' };
  }

  async trips(user: { id: number; roles: any[] }) {
    const { rows } = await this.db.query(
      `SELECT id FROM orders WHERE rider_id = $1
         AND state IN ('SHIPPER_DA_NHAN','SHIPPER_DEN_QUAN','DA_LAY_HANG','DANG_GIAO','DA_DEN_NOI','HEN_SHIPPER_DA_GIU','HEN_SAN_SANG')
       ORDER BY COALESCE(scheduled_pickup_at, created_at)`,
      [user.id],
    );
    const trips = [];
    for (const r of rows) trips.push(await this.orders.view(this.db, Number(r.id), user as any));
    return { trips };
  }

  async updateLocation(riderId: number, at: LatLng) {
    const { rowCount } = await this.db.query(
      `UPDATE riders SET location = ${point(2, 3)}, location_at = now() WHERE user_id = $1`,
      [riderId, at.lng, at.lat],
    );
    if (!rowCount) throw new BusinessError('NOT_A_RIDER', 'Bạn chưa đăng ký làm shipper', 403);
    return { ok: true };
  }

  async arrivedStore(riderId: number, orderId: number, input: StepInput) {
    return this.db.tx(async (client) => {
      const order = await this.lockOwn(client, riderId, orderId);
      // Điểm lấy hàng: quán, hoặc địa chỉ người gửi với đơn gửi hàng.
      const { rows } = await client.query<{ d: number }>(
        `SELECT ST_Distance(COALESCE(o.pickup_location, s.location), ${point(2, 3)}) AS d FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = $1`,
        [order.id, input.lng, input.lat],
      );
      const d = Number(rows[0]?.d ?? Infinity);
      await this.checkGeofence(client, order, d, this.config.business.storeGeofenceM, input, 'GEOFENCE_OVERRIDE_STORE');
      const next = await this.lifecycle.apply(client, order, OrderEvent.RIDER_ARRIVED_STORE, this.actor(riderId), {
        at: input,
        payload: { distanceM: Math.round(d), photoUrl: input.photoUrl ?? null },
      });
      return { id: orderId, state: next.state };
    });
  }

  /** Lấy hàng (quét mã đơn) rồi bắt đầu giao. */
  async pickedUp(riderId: number, orderId: number, code: string, at: LatLng) {
    return this.db.tx(async (client) => {
      const order = await this.lockOwn(client, riderId, orderId);
      if (order.fulfillment === 'PROXY') throw new BusinessError('USE_PROXY_PURCHASED', 'Đơn mua hộ: bấm "Đã mua & nhận món" và nhập tiền món thật', 409);
      if (order.code !== code.trim().toUpperCase()) {
        throw new BusinessError('CODE_MISMATCH', order.kind === 'PARCEL' ? 'Mã đơn không khớp, hỏi lại người gửi' : 'Mã đơn không khớp, kiểm tra đúng túi hàng');
      }
      const picked = await this.lifecycle.apply(client, order, OrderEvent.RIDER_PICKED_UP, this.actor(riderId), { at });
      const delivering = await this.lifecycle.apply(client, picked, OrderEvent.START_DELIVERY, SYSTEM_ACTOR);
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'ON_THE_WAY', { orderId });
      return { id: orderId, state: delivering.state };
    });
  }

  // ---------------- Mua hộ (Phần 3.8) ----------------

  private async lockProxy(client: PoolClient, riderId: number, orderId: number) {
    const order = await this.lockOwn(client, riderId, orderId);
    if (order.fulfillment !== 'PROXY') throw new BusinessError('NOT_PROXY', 'Đơn này quán đã nhận trên app — chỉ cần lấy món', 409);
    if (order.state !== 'SHIPPER_DEN_QUAN') throw new BusinessError('NOT_AT_STORE', 'Bấm "Đã tới quán" trước', 409);
    return order;
  }

  /**
   * Shipper đặt món trực tiếp với quán — đây là người thật xác nhận thay Cổng A (kênh RIDER_PROXY).
   * Đơn có ghi chú dị ứng thì shipper phải xác nhận đã đọc cho quán.
   */
  async proxyOrdered(riderId: number, orderId: number, allergyAck: boolean) {
    return this.db.tx(async (client) => {
      const order = await this.lockProxy(client, riderId, orderId);
      if (order.accepted_at) return { id: orderId, state: order.state, alreadyOrdered: true };
      if (order.has_allergens && !allergyAck) throw new BusinessError('ALLERGY_ACK_REQUIRED', 'Đơn có ghi chú dị ứng — hãy đọc cho quán và tick xác nhận');
      const now = new Date();
      await client.query(
        `UPDATE orders SET accepted_by = $2, accepted_channel = 'RIDER_PROXY', accepted_at = $3, prep_state = 'PREPARING',
           allergy_ack_by = CASE WHEN has_allergens THEN $2 ELSE allergy_ack_by END, allergy_ack_at = CASE WHEN has_allergens THEN $3 ELSE allergy_ack_at END, updated_at = now()
         WHERE id = $1`,
        [order.id, riderId, now],
      );
      await this.lifecycle.recordEvent(client, order.id, order.state, order.state, 'PROXY_ORDERED', this.actor(riderId), { allergyAck });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'PROXY_ORDERED', { orderId });
      return { id: orderId, state: order.state };
    });
  }

  /**
   * Shipper đã trả tiền cho quán và nhận món. Giá thật lệch quá ngưỡng thì phải gọi khách đồng ý trước.
   * Tổng tiền khách trả được tính lại theo tiền món thật + phí ship + phí dịch vụ.
   */
  async proxyPurchased(riderId: number, orderId: number, input: { amount: number; receiptUrl?: string; customerAgreed?: boolean; at: LatLng }) {
    return this.db.tx(async (client) => {
      const order = await this.lockProxy(client, riderId, orderId);
      if (!order.accepted_at) throw new BusinessError('NOT_ORDERED', 'Bấm "Đã đặt món với quán" trước', 409);
      const listed = Number(order.subtotal);
      const diffPct = listed ? (Math.abs(input.amount - listed) / listed) * 100 : 0;
      const tolerancePct = this.configCenter.get<number>('proxy.price_tolerance_pct', { storeId: Number(order.store_id) });
      if (diffPct > tolerancePct && !input.customerAgreed) {
        throw new BusinessError('PRICE_CHANGED', `Tiền món thật ${input.amount.toLocaleString('vi-VN')}đ lệch ${Math.round(diffPct)}% so với app. Gọi khách đồng ý rồi tick "Khách đã đồng ý".`, 422);
      }
      const total = input.amount + Number(order.delivery_fee) + Number(order.service_fee);
      const ready = (
        await client.query(
          `UPDATE orders SET prep_state = 'READY', subtotal = $2, total = $3, proxy_paid_amount = $2, proxy_receipt_url = $4, updated_at = now() WHERE id = $1 RETURNING *`,
          [order.id, input.amount, total, input.receiptUrl ?? null],
        )
      ).rows[0] as OrderRow;
      const picked = await this.lifecycle.apply(client, ready, OrderEvent.RIDER_PICKED_UP, this.actor(riderId), {
        at: input.at,
        payload: { proxy: true, listedSubtotal: listed, paidAmount: input.amount, customerAgreed: !!input.customerAgreed, receiptUrl: input.receiptUrl ?? null },
      });
      const delivering = await this.lifecycle.apply(client, picked, OrderEvent.START_DELIVERY, SYSTEM_ACTOR);
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'ON_THE_WAY', { orderId });
      return { id: orderId, state: delivering.state, subtotal: input.amount, total };
    });
  }

  /** Tới nơi quán đóng cửa / hết món: huỷ, hoàn tiền cho khách; ghi tiền bù chuyến đi cho shipper để đối soát. */
  async proxyStoreUnavailable(riderId: number, orderId: number, reason: string) {
    return this.db.tx(async (client) => {
      const order = await this.lockProxy(client, riderId, orderId);
      const failedTripFee = this.configCenter.get<number>('proxy.failed_trip_fee', {});
      const cancelled = await this.lifecycle.apply(client, order, OrderEvent.PROXY_STORE_UNAVAILABLE, this.actor(riderId), {
        set: { cancel_reason: 'STORE_UNAVAILABLE', cancelled_by_role: 'RIDER', refund_kind: 'FULL' },
        payload: { reason, failedTripFee },
      });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'PROXY_STORE_UNAVAILABLE', { orderId, reason });
      return { id: orderId, state: cancelled.state, failedTripFee };
    });
  }

  async arrivedDropoff(riderId: number, orderId: number, input: StepInput) {
    return this.db.tx(async (client) => {
      const order = await this.lockOwn(client, riderId, orderId);
      const { rows } = await client.query<{ d: number }>(
        `SELECT ST_Distance(dropoff_location, ${point(2, 3)}) AS d FROM orders WHERE id = $1`,
        [order.id, input.lng, input.lat],
      );
      const d = Number(rows[0].d);
      await this.checkGeofence(client, order, d, this.config.business.dropoffGeofenceM, input, 'GEOFENCE_OVERRIDE_DROPOFF');
      const next = await this.lifecycle.apply(client, order, OrderEvent.RIDER_ARRIVED_DROPOFF, this.actor(riderId), {
        at: input,
        payload: { distanceM: Math.round(d) },
      });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'RIDER_ARRIVED', { orderId });
      return { id: orderId, state: next.state };
    });
  }

  async delivered(riderId: number, orderId: number, input: { pin?: string; photoUrl?: string }) {
    return this.db.tx(async (client) => {
      const order = await this.lockOwn(client, riderId, orderId);
      if (order.delivery_pin && input.pin !== order.delivery_pin) {
        throw new BusinessError('PIN_MISMATCH', 'Mã nhận hàng không đúng, vui lòng hỏi lại khách');
      }
      const done = await this.lifecycle.apply(client, order, OrderEvent.DELIVERED, this.actor(riderId), {
        set: { proof_photo_url: input.photoUrl ?? null },
      });
      if (order.payment_method === 'COD') {
        await client.query('UPDATE riders SET cod_balance = cod_balance + $2 WHERE user_id = $1', [riderId, order.total]);
      }
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'DELIVERED_RATE_US', { orderId });
      return { id: orderId, state: done.state };
    });
  }

  /** Nhả chuyến (VD chờ món quá lâu) → tìm shipper khác, không mời lại người vừa nhả. */
  async release(riderId: number, orderId: number, reason: string) {
    return this.db.tx(async (client) => {
      const order = await this.lockOwn(client, riderId, orderId);
      // Đã tới quán ≥ 25 phút mà món chưa xong thì được nhả không bị trừ điểm (Phần 2.3.4).
      const { rows } = await client.query<{ waited: number }>(
        `SELECT extract(epoch FROM now() - max(created_at)) / 60 AS waited FROM order_events
         WHERE order_id = $1 AND event = 'RIDER_ARRIVED_STORE' AND actor_id = $2`,
        [order.id, riderId],
      );
      const excused = order.prep_state !== 'READY' && Number(rows[0]?.waited ?? 0) >= this.config.business.maxStoreWaitMinutes;
      const released = await this.lifecycle.apply(client, order, OrderEvent.RIDER_RELEASE, this.actor(riderId), {
        set: { rider_id: null, rider_accepted_at: null },
        payload: { reason, excused },
      });
      const after = await this.dispatch.sendWave(client, released, 1);
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'RIDER_CHANGED', { orderId });
      return { id: orderId, state: after.state };
    });
  }
}
