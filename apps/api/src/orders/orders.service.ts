import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  OrderEvent,
  OrderState,
  computeDeliveryFee,
  computeSubtotal,
  decideCustomerCancellation,
  sanitizeItemNote,
  sanitizeNoteText,
  ORDER_NOTE_MAX_LENGTH,
} from '@sqt/domain';
import { randomBytes, randomInt } from 'crypto';
import { PoolClient } from 'pg';
import { AuthUser, hasRole, worksAtStore } from '../common/auth';
import { BusinessError } from '../common/errors';
import { point } from '../common/geo';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE, Database, Queryable } from '../database/database';
import { DispatchService } from './dispatch';
import { CreateOrderDto, MerchantAcceptDto } from './dto';
import { JobsService } from './jobs';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newOrderCode = () =>
  'SQT-' + Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const PAYMENT_TTL_SECONDS = 600;

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly lifecycle: OrderLifecycle,
    private readonly jobs: JobsService,
    private readonly dispatch: DispatchService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Các mốc Cổng A (Phần 3.3). Chỉ AUTO_CANCEL đổi trạng thái; các mốc khác chỉ nhắc/leo thang.
    this.jobs.register('GATE_A_STEP', async (job, client) => {
      const order = await this.lifecycle.lock(client, Number(job.order_id));
      if (order.state !== OrderState.CHO_QUAN_XAC_NHAN && order.state !== OrderState.HEN_CHO_QUAN_NHAN) return;
      const action: string = job.payload.action;
      const info = { orderId: Number(order.id), code: order.code };
      switch (action) {
        case 'REMIND':
          await this.notifications.toStore(client, order.store_id, 'ZNS', 'NEW_ORDER_REMINDER', info);
          break;
        case 'IVR_CALL':
          await this.notifications.toStore(client, order.store_id, 'IVR', 'NEW_ORDER_IVR', {
            ...info,
            script: await this.ivrScript(client, order),
          });
          break;
        case 'SUGGEST_SCHEDULE':
          await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'SUGGEST_SCHEDULE', info);
          break;
        case 'OPS_QUEUE':
          await this.notifications.enqueue(client, null, 'PUSH', 'OPS_STUCK_ORDER', { ...info, reason: 'MERCHANT_SILENT' });
          break;
        case 'AUTO_CANCEL':
          await this.lifecycle.apply(client, order, OrderEvent.MERCHANT_TIMEOUT, SYSTEM_ACTOR, {
            set: { cancel_reason: 'MERCHANT_TIMEOUT', cancelled_by_role: 'SYSTEM', refund_kind: 'FULL' },
          });
          await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'ORDER_CANCELLED_MERCHANT_SILENT', info);
          break;
      }
    });

    this.jobs.register('PAYMENT_EXPIRE', async (job, client) => {
      const order = await this.lifecycle.lock(client, Number(job.order_id));
      if (order.state !== OrderState.CHO_THANH_TOAN) return;
      await this.lifecycle.apply(client, order, OrderEvent.PAYMENT_EXPIRED, SYSTEM_ACTOR, {
        set: { cancel_reason: 'PAYMENT_EXPIRED', cancelled_by_role: 'SYSTEM' },
      });
    });
  }

  /** Lời đọc IVR có cả ghi chú và cảnh báo dị ứng (Phần 2.2.3). */
  private async ivrScript(client: PoolClient, order: OrderRow): Promise<string> {
    const { rows } = await client.query(
      'SELECT name_snapshot, quantity, note, note_tags, allergens FROM order_items WHERE order_id = $1 ORDER BY id',
      [order.id],
    );
    const parts = rows.map((r, i) => {
      const notes = [...r.note_tags, r.note].filter(Boolean).join(', ');
      const text = `Món ${i + 1}: ${r.quantity} ${r.name_snapshot}`;
      return notes ? `${text}, ghi chú: ${notes.length > 60 ? 'có ghi chú, vui lòng xem trên app' : notes}` : text;
    });
    const allergens = [...new Set(rows.flatMap((r) => r.allergens))];
    const warn = allergens.length ? ` Lưu ý dị ứng: ${allergens.join(', ')}.` : '';
    return `Quán có đơn mới ${Number(order.total).toLocaleString('vi-VN')} đồng. ${parts.join('. ')}.${warn} Bấm 1 để nhận, bấm 2 để từ chối.`;
  }

  private async scheduleGateA(client: PoolClient, order: OrderRow, from: Date) {
    for (const step of this.config.business.gateASteps) {
      await this.jobs.schedule(client, 'GATE_A_STEP', order.id, new Date(from.getTime() + step.afterSeconds * 1000), {
        action: step.action,
      });
    }
    await this.notifications.toStore(client, order.store_id, 'PUSH', 'NEW_ORDER', { orderId: Number(order.id) });
  }

  async create(user: AuthUser, dto: CreateOrderDto, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      const { rows: storeRows } = await client.query(
        `SELECT *, ST_Distance(location, ${point(2, 3)}) AS distance_m FROM stores WHERE id = $1 FOR SHARE`,
        [dto.storeId, dto.dropoff?.lng ?? 0, dto.dropoff?.lat ?? 0],
      );
      const store = storeRows[0];
      if (!store || store.status !== 'APPROVED') throw new BusinessError('STORE_NOT_FOUND', 'Không tìm thấy quán', 404);
      if (!store.is_open) throw new BusinessError('STORE_CLOSED', 'Quán đang đóng cửa');

      const isDelivery = dto.deliveryMode === 'PLATFORM';
      if (isDelivery && !dto.dropoff) throw new BusinessError('DROPOFF_REQUIRED', 'Cần địa chỉ giao hàng');
      const straightM = isDelivery ? Number(store.distance_m) : 0;
      if (isDelivery && straightM > store.delivery_radius_m) {
        throw new BusinessError('OUT_OF_DELIVERY_AREA', 'Địa chỉ nằm ngoài khu vực giao của quán');
      }

      const itemIds = dto.items.map((i) => i.itemId);
      const { rows: menu } = await client.query('SELECT * FROM menu_items WHERE store_id = $1 AND id = ANY($2)', [
        store.id,
        itemIds,
      ]);
      const byId = new Map(menu.map((m) => [Number(m.id), m]));
      const lines = dto.items.map((i) => {
        const m = byId.get(i.itemId);
        if (!m) throw new BusinessError('ITEM_NOT_FOUND', `Món #${i.itemId} không thuộc quán này`, 404);
        if (!m.is_available) throw new BusinessError('ITEM_UNAVAILABLE', `Món "${m.name}" đã hết`);
        const note = sanitizeItemNote(
          { note: i.note, tags: i.noteTags, allergens: i.allergens },
          { notesDisabled: m.notes_disabled },
        );
        return { menu: m, quantity: i.quantity, note, policy: i.substitutionPolicy ?? 'CONTACT_ME' };
      });

      const subtotal = computeSubtotal(lines.map((l) => ({ unitPrice: Number(l.menu.price), quantity: l.quantity })));
      // Chưa tích hợp dịch vụ định tuyến: ước tính đường đi = đường chim bay × hệ số (Phần 5.11).
      const routeKm = (straightM * this.config.business.routeFactor) / 1000;
      const deliveryFee = isDelivery ? computeDeliveryFee(routeKm, this.config.business.deliveryFee) : 0;
      const serviceFee = this.config.business.serviceFee;
      const total = subtotal + deliveryFee + serviceFee;
      const hasAllergens = lines.some((l) => l.note.allergens.length > 0);
      const needsPin = isDelivery && total >= this.config.business.pinThreshold;
      const state = dto.paymentMethod === 'COD' ? OrderState.CHO_QUAN_XAC_NHAN : OrderState.CHO_THANH_TOAN;

      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (code, customer_id, store_id, state, delivery_mode, dropoff_location, dropoff_address, dropoff_note,
           recipient_name, recipient_phone, order_note, distance_m, subtotal, delivery_fee, service_fee, total,
           payment_method, has_allergens, delivery_pin)
         VALUES ($1, $2, $3, $4, $5, ${point(6, 7)}, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING *`,
        [
          newOrderCode(),
          user.id,
          store.id,
          state,
          dto.deliveryMode,
          dto.dropoff?.lng ?? null,
          dto.dropoff?.lat ?? null,
          dto.dropoff?.address ?? null,
          sanitizeNoteText(dto.dropoff?.note, ORDER_NOTE_MAX_LENGTH),
          dto.recipient?.name ?? null,
          dto.recipient?.phone ?? null,
          sanitizeNoteText(dto.orderNote, ORDER_NOTE_MAX_LENGTH),
          isDelivery ? Math.round(routeKm * 1000) : null,
          subtotal,
          deliveryFee,
          serviceFee,
          total,
          dto.paymentMethod,
          hasAllergens,
          needsPin ? String(randomInt(0, 10_000)).padStart(4, '0') : null,
        ],
      );
      const order = rows[0];
      for (const l of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, item_id, name_snapshot, unit_price, quantity, note, note_tags, allergens, substitution_policy)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [order.id, l.menu.id, l.menu.name, l.menu.price, l.quantity, l.note.note, l.note.tags, l.note.allergens, l.policy],
        );
      }
      await this.lifecycle.recordEvent(client, order.id, null, state, 'ORDER_PLACED', {
        id: user.id,
        role: 'CUSTOMER',
        channel: 'APP',
      });
      if (state === OrderState.CHO_QUAN_XAC_NHAN) {
        await this.scheduleGateA(client, order, now);
      } else {
        await this.jobs.schedule(client, 'PAYMENT_EXPIRE', order.id, new Date(now.getTime() + PAYMENT_TTL_SECONDS * 1000));
      }
      return this.view(client, Number(order.id), user);
    });
  }

  /** Cổng thanh toán báo đã thu tiền (webhook đã xác thực chữ ký ở tầng trên). */
  async markPaid(orderId: number, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      const paid = await this.lifecycle.apply(client, order, OrderEvent.PAYMENT_SUCCEEDED, SYSTEM_ACTOR);
      if (paid.state === OrderState.CHO_QUAN_XAC_NHAN) await this.scheduleGateA(client, paid, now);
      return { id: Number(paid.id), state: paid.state };
    });
  }

  // ---------------- Quán ----------------

  private async lockForStore(client: PoolClient, user: AuthUser, orderId: number) {
    const order = await this.lifecycle.lock(client, orderId);
    if (!worksAtStore(user, Number(order.store_id))) {
      throw new BusinessError('NOT_STORE_MEMBER', 'Đơn này không thuộc quán của bạn', 403);
    }
    return order;
  }

  private async afterAccepted(client: PoolClient, accepted: OrderRow) {
    await this.notifications.enqueue(client, accepted.customer_id, 'PUSH', 'MERCHANT_ACCEPTED', { orderId: Number(accepted.id) });
    if (accepted.delivery_mode === 'SELF_PICKUP') {
      return this.lifecycle.apply(client, accepted, OrderEvent.START_PICKUP_WAIT, SYSTEM_ACTOR);
    }
    return this.dispatch.start(client, accepted);
  }

  /** Cổng A qua app của quán. */
  async merchantAccept(user: AuthUser, orderId: number, dto: MerchantAcceptDto) {
    return this.acceptAs(orderId, { id: user.id, role: 'MERCHANT', channel: 'APP' }, dto, (client) =>
      this.lockForStore(client, user, orderId),
    );
  }

  /** Cổng A do Ops gọi điện xác nhận với quán (Phần 3.3 mốc 150 giây). */
  async opsAcceptOnBehalf(user: AuthUser, orderId: number, dto: MerchantAcceptDto) {
    return this.acceptAs(orderId, { id: user.id, role: 'OPS', channel: 'OPS_CALL' }, dto, (client) =>
      this.lifecycle.lock(client, orderId),
    );
  }

  private async acceptAs(orderId: number, actor: Actor, dto: MerchantAcceptDto, lock: (c: PoolClient) => Promise<OrderRow>) {
    return this.db.tx(async (client) => {
      const order = await lock(client);
      const ack = order.has_allergens && dto.allergyAck === true;
      const now = new Date();
      const accepted = await this.lifecycle.apply(client, order, OrderEvent.MERCHANT_ACCEPT, actor, {
        ctx: { allergyAcknowledged: ack || Boolean(order.allergy_ack_at) },
        set: {
          prep_time_min: dto.prepTimeMin,
          prep_state: 'PREPARING',
          accepted_by: actor.id,
          accepted_channel: actor.channel,
          accepted_at: now,
          ...(ack ? { allergy_ack_by: actor.id, allergy_ack_at: now } : {}),
        },
        payload: { prepTimeMin: dto.prepTimeMin, allergyAck: ack },
      });
      const next = await this.afterAccepted(client, accepted);
      return { id: Number(next.id), state: next.state };
    });
  }

  async merchantReject(user: AuthUser, orderId: number, reason: string) {
    return this.db.tx(async (client) => {
      const order = await this.lockForStore(client, user, orderId);
      const rejected = await this.lifecycle.apply(client, order, OrderEvent.MERCHANT_REJECT, {
        id: user.id,
        role: 'MERCHANT',
        channel: 'APP',
      }, {
        set: { cancel_reason: reason, cancelled_by_role: 'MERCHANT', refund_kind: 'FULL' },
        payload: { reason },
      });
      await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'MERCHANT_REJECTED', { orderId, reason });
      return { id: Number(rejected.id), state: rejected.state };
    });
  }

  async merchantReady(user: AuthUser, orderId: number) {
    return this.db.tx(async (client) => {
      const order = await this.lockForStore(client, user, orderId);
      if (order.prep_state !== 'PREPARING') throw new BusinessError('NOT_PREPARING', 'Đơn chưa ở bước chuẩn bị', 409);
      await client.query(`UPDATE orders SET prep_state = 'READY', updated_at = now() WHERE id = $1`, [order.id]);
      await this.lifecycle.recordEvent(client, order.id, order.state, order.state, 'PREP_READY', {
        id: user.id,
        role: 'MERCHANT',
        channel: 'APP',
      });
      if (order.rider_id) await this.notifications.enqueue(client, order.rider_id, 'PUSH', 'PREP_READY', { orderId });
      return { id: orderId, state: order.state, prepState: 'READY' };
    });
  }

  /** Bàn giao cho khách tự đến lấy: khách đọc mã đơn tại quầy. */
  async merchantHandover(user: AuthUser, orderId: number, code: string) {
    return this.db.tx(async (client) => {
      const order = await this.lockForStore(client, user, orderId);
      if (order.code !== code.trim().toUpperCase()) throw new BusinessError('CODE_MISMATCH', 'Mã đơn không khớp');
      const done = await this.lifecycle.apply(client, order, OrderEvent.PICKUP_HANDOVER, {
        id: user.id,
        role: 'MERCHANT',
        channel: 'APP',
      });
      return { id: Number(done.id), state: done.state };
    });
  }

  async storeOrders(user: AuthUser, storeId: number, state?: string) {
    if (!worksAtStore(user, storeId)) throw new BusinessError('NOT_STORE_MEMBER', 'Bạn không thuộc quán này', 403);
    const { rows } = await this.db.query(
      `SELECT id FROM orders WHERE store_id = $1 AND ($2::text IS NULL OR state = $2) ORDER BY created_at DESC LIMIT 100`,
      [storeId, state ?? null],
    );
    const orders = [];
    for (const r of rows) orders.push(await this.view(this.db, Number(r.id), user));
    return { orders };
  }

  // ---------------- Khách ----------------

  async cancelByCustomer(user: AuthUser, orderId: number, now: Date = new Date()) {
    return this.db.tx(async (client) => {
      const order = await this.lifecycle.lock(client, orderId);
      if (Number(order.customer_id) !== user.id) throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM orders WHERE customer_id = $1 AND cancel_reason = 'CUSTOMER_FREE'
           AND created_at >= date_trunc('month', $2::timestamptz)`,
        [user.id, now],
      );
      const decision = decideCustomerCancellation({
        state: order.state,
        prepStarted: order.prep_state === 'READY',
        secondsSinceAccepted: order.accepted_at ? (now.getTime() - new Date(order.accepted_at).getTime()) / 1000 : null,
        freeCancellationsUsedThisMonth: Number(rows[0].n),
      });
      if (!decision.allowed) {
        throw new BusinessError('CANCEL_NOT_ALLOWED', 'Shipper đã lấy hàng, không thể huỷ đơn. Vui lòng liên hệ hỗ trợ.', 409);
      }
      const cancelled = await this.lifecycle.apply(client, order, OrderEvent.CUSTOMER_CANCEL, {
        id: user.id,
        role: 'CUSTOMER',
        channel: 'APP',
      }, {
        set: {
          cancel_reason: decision.countsAsFreeCancellation ? 'CUSTOMER_FREE' : `CUSTOMER_${decision.reason}`,
          cancelled_by_role: 'CUSTOMER',
          refund_kind: decision.refund,
        },
        payload: { refund: decision.refund },
      });
      await client.query(`UPDATE dispatch_offers SET status = 'SUPERSEDED' WHERE order_id = $1 AND status = 'SENT'`, [order.id]);
      await this.notifications.toStore(client, order.store_id, 'PUSH', 'ORDER_CANCELLED', { orderId });
      return { id: Number(cancelled.id), state: cancelled.state, refund: decision.refund };
    });
  }

  /** Chi tiết đơn kèm dòng thời gian xác nhận — ai, lúc nào, qua kênh nào (Phần 2.1.6). */
  async view(q: Queryable, orderId: number, viewer: AuthUser) {
    const { rows } = await q.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const o = rows[0];
    const isCustomer = o && Number(o.customer_id) === viewer.id;
    const isStore = o && worksAtStore(viewer, Number(o.store_id));
    const isRider = o && o.rider_id && Number(o.rider_id) === viewer.id;
    if (!o || !(isCustomer || isStore || isRider || hasRole(viewer, 'OPS', 'ADMIN'))) {
      throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
    }
    const items = await q.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
    const events = await q.query(
      `SELECT e.event, e.from_state, e.to_state, e.actor_role, e.channel, e.created_at, u.full_name
       FROM order_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.order_id = $1 ORDER BY e.id`,
      [orderId],
    );
    return {
      id: Number(o.id),
      code: o.code,
      state: o.state,
      prepState: o.prep_state,
      deliveryMode: o.delivery_mode,
      storeId: Number(o.store_id),
      riderId: o.rider_id ? Number(o.rider_id) : null,
      paymentMethod: o.payment_method,
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.delivery_fee),
      serviceFee: Number(o.service_fee),
      total: Number(o.total),
      orderNote: o.order_note,
      hasAllergens: o.has_allergens,
      allergyAcknowledged: Boolean(o.allergy_ack_at),
      prepTimeMin: o.prep_time_min,
      refund: o.refund_kind,
      // Mã PIN chỉ khách xem; shipper phải hỏi khách khi giao (Phần 2.1.6).
      ...(isCustomer ? { deliveryPin: o.delivery_pin } : {}),
      items: items.rows.map((i) => ({
        itemId: Number(i.item_id),
        name: i.name_snapshot,
        unitPrice: Number(i.unit_price),
        quantity: i.quantity,
        note: i.note,
        noteTags: i.note_tags,
        allergens: i.allergens,
        substitutionPolicy: i.substitution_policy,
      })),
      timeline: events.rows.map((e) => ({
        event: e.event,
        from: e.from_state,
        to: e.to_state,
        byRole: e.actor_role,
        byName: e.full_name,
        channel: e.channel,
        at: e.created_at,
      })),
    };
  }

  async get(user: AuthUser, orderId: number) {
    return this.view(this.db, orderId, user);
  }
}
