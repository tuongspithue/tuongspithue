import { Injectable } from '@nestjs/common';
import { TrustService } from '../trust/trust.service';
import { ActorRole, OrderEvent, OrderState, TransitionContext, transition } from '@sqt/domain';
import { PoolClient } from 'pg';
import { BusinessError } from '../common/errors';
import { LatLng, point } from '../common/geo';

export interface Actor {
  id: number | null;
  role: ActorRole;
  channel: 'APP' | 'OPS_CALL' | 'WEB' | 'SYSTEM';
}

export const SYSTEM_ACTOR: Actor = { id: null, role: 'SYSTEM', channel: 'SYSTEM' };

export type OrderRow = Record<string, any> & { id: string; state: OrderState; version: number };

/** Cột được phép cập nhật cùng lúc với chuyển trạng thái. */
const UPDATABLE = new Set([
  'prep_state',
  'fulfillment',
  'prep_time_min',
  'accepted_by',
  'accepted_channel',
  'accepted_at',
  'allergy_ack_by',
  'allergy_ack_at',
  'rider_id',
  'rider_accepted_at',
  'proof_photo_url',
  'cancel_reason',
  'cancelled_by_role',
  'refund_kind',
  'store_missed',
]);

/**
 * Nơi duy nhất thay đổi trạng thái đơn (Phần 3.2, quy tắc 1–2): kiểm tra bảng chuyển hợp lệ ở
 * gói domain, ghi sự kiện bất biến vào order_events và outbox trong cùng transaction.
 */
/** Sự kiện làm thay đổi điểm uy tín của quán/shipper (Phần 11). */
const TRUST_EVENTS = new Set<string>(['MERCHANT_ACCEPT', 'MERCHANT_REJECT', 'MERCHANT_TIMEOUT', 'SWITCH_TO_PROXY', 'RIDER_RELEASE', 'RIDER_RECONFIRM_MISSED', 'DELIVERED']);

@Injectable()
export class OrderLifecycle {
  constructor(private readonly trust: TrustService) {}

  async lock(client: PoolClient, orderId: number): Promise<OrderRow> {
    const { rows } = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!rows[0]) throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
    return rows[0];
  }

  contextOf(order: OrderRow, extra: TransitionContext = {}): TransitionContext {
    return {
      isScheduled: order.is_scheduled,
      isSelfPickup: order.delivery_mode === 'SELF_PICKUP',
      prepReady: order.prep_state === 'READY',
      hasAllergens: order.has_allergens,
      allergyAcknowledged: Boolean(order.allergy_ack_at),
      ...extra,
    };
  }

  async apply(
    client: PoolClient,
    order: OrderRow,
    event: OrderEvent,
    actor: Actor,
    opts: { ctx?: TransitionContext; set?: Record<string, unknown>; payload?: Record<string, unknown>; at?: LatLng } = {},
  ): Promise<OrderRow> {
    const result = transition(order.state, event, actor.role, this.contextOf(order, opts.ctx));
    const set = opts.set ?? {};
    const columns = Object.keys(set);
    for (const c of columns) {
      if (!UPDATABLE.has(c)) throw new Error(`Cột ${c} không được cập nhật qua lifecycle`);
    }
    const assignments = columns.map((c, i) => `${c} = $${i + 3}`);
    const { rows } = await client.query<OrderRow>(
      `UPDATE orders SET state = $2, version = version + 1, updated_at = now()${assignments.length ? ', ' + assignments.join(', ') : ''}
       WHERE id = $1 RETURNING *`,
      [order.id, result.to, ...columns.map((c) => set[c])],
    );
    await this.recordEvent(client, order.id, order.state, result.to, event, actor, opts.payload, opts.at);
    if (TRUST_EVENTS.has(event) || result.to === 'HOAN_THANH') {
      if (order.store_id) await this.trust.enqueue(client, 'STORE', order.store_id);
      if (order.rider_id) await this.trust.enqueue(client, 'RIDER', order.rider_id);
    }
    if (result.to === 'DA_HUY' && order.is_scheduled && order.scheduled_pickup_at) {
      // Trả lại chỗ trong lịch năng lực của quán (Phần 10.4).
      await client.query(
        `UPDATE store_capacity_slots SET booked = GREATEST(booked - 1, 0)
         WHERE store_id = $1 AND slot_start = to_timestamp(floor(extract(epoch FROM $2::timestamptz) / 900) * 900)`,
        [order.store_id, order.scheduled_pickup_at],
      );
    }
    return rows[0];
  }

  /** Ghi sự kiện không đổi trạng thái (VD món đã sẵn sàng) hoặc sự kiện tạo đơn. */
  async recordEvent(
    client: PoolClient,
    orderId: string | number,
    from: OrderState | null,
    to: OrderState,
    event: string,
    actor: Actor,
    payload: Record<string, unknown> = {},
    at?: LatLng,
  ) {
    const params: unknown[] = [orderId, from, to, event, actor.id, actor.role, actor.channel, JSON.stringify(payload)];
    let location = 'NULL';
    if (at) {
      params.push(at.lng, at.lat);
      location = point(9, 10);
    }
    await client.query(
      `INSERT INTO order_events (order_id, from_state, to_state, event, actor_id, actor_role, channel, payload, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${location})`,
      params,
    );
    await client.query(
      `INSERT INTO outbox (aggregate, aggregate_id, event_type, payload) VALUES ('order', $1, $2, $3)`,
      [orderId, `order.${event.toLowerCase()}`, JSON.stringify({ from, to, actorRole: actor.role, ...payload })],
    );
  }
}
