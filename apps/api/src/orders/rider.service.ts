import { Inject, Injectable } from '@nestjs/common';
import { OrderEvent } from '@sqt/domain';
import { PoolClient } from 'pg';
import { BusinessError } from '../common/errors';
import { LatLng, distanceToStoreM, point } from '../common/geo';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE, Database } from '../database/database';
import { DispatchService } from './dispatch';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';

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
      const d = await distanceToStoreM(client, Number(order.store_id), input);
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
      if (order.code !== code.trim().toUpperCase()) throw new BusinessError('CODE_MISMATCH', 'Mã đơn không khớp, kiểm tra đúng túi hàng');
      const picked = await this.lifecycle.apply(client, order, OrderEvent.RIDER_PICKED_UP, this.actor(riderId), { at });
      const delivering = await this.lifecycle.apply(client, picked, OrderEvent.START_DELIVERY, SYSTEM_ACTOR);
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'ON_THE_WAY', { orderId });
      return { id: orderId, state: delivering.state };
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
