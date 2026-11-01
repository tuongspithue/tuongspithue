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
  TERMINAL_STATES,
} from '@sqt/domain';
import { randomBytes, randomInt } from 'crypto';
import { PoolClient } from 'pg';
import { AuthUser, hasRole, ownsOrder, worksAtStore } from '../common/auth';
import { BusinessError } from '../common/errors';
import { point } from '../common/geo';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE, Database, Queryable } from '../database/database';
import { DispatchService } from './dispatch';
import { CreateOrderDto, MerchantAcceptDto } from './dto';
import { JobsService } from './jobs';
import { Actor, OrderLifecycle, OrderRow, SYSTEM_ACTOR } from './lifecycle';
import { NotificationsService } from './notifications';
import { ScheduledService, SchedulePlan } from './scheduled.service';
import { ConfigCenter } from '../config-center/config.service';
import { EntitlementService } from '../config-center/entitlements.service';
import { SlaStep } from '@sqt/domain';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newOrderCode = () =>
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
    private readonly scheduled: ScheduledService,
    private readonly configCenter: ConfigCenter,
    private readonly entitlements: EntitlementService,
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
          await this.notifications.toStore(client, order.store_id, 'PUSH', 'NEW_ORDER_REMINDER', info);
          break;
        case 'OPS_CALL':
          await this.requestOpsCall(client, order, 'MERCHANT_SILENT');
          break;
        case 'SUGGEST_SCHEDULE':
          await this.notifications.enqueue(client, order.customer_id, 'PUSH', 'SUGGEST_SCHEDULE', info);
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

  /**
   * Nhờ điều phối viên gọi quán: Admin Console hiện số quán (bấm để mở app gọi) và lời đọc đơn.
   * Thay cho cuộc gọi tự động trả phí (Phần 3.3).
   */
  async requestOpsCall(client: PoolClient, order: OrderRow, reason: string) {
    const store = (await client.query<{ phone: string; name: string }>('SELECT phone, name FROM stores WHERE id = $1', [order.store_id])).rows[0];
    await this.notifications.enqueue(client, null, 'PUSH', 'OPS_CALL_STORE', {
      orderId: Number(order.id),
      code: order.code,
      reason,
      storeName: store.name,
      storePhone: store.phone,
      script: await this.callScript(client, order),
    });
  }

  /** Lời đọc đơn cho quán qua điện thoại, có cả ghi chú và cảnh báo dị ứng (Phần 2.2.3). */
  private async callScript(client: PoolClient, order: OrderRow): Promise<string> {
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
    return `Quán có đơn mới ${order.code}, ${Number(order.total).toLocaleString('vi-VN')} đồng. ${parts.join('. ')}.${warn}`;
  }

  private async scheduleGateA(client: PoolClient, order: OrderRow, from: Date) {
    const { rows } = await client.query<{ category: string }>('SELECT category FROM stores WHERE id = $1', [order.store_id]);
    const steps = this.configCenter.get<SlaStep[]>('sla.gate_a.steps', { category: rows[0]?.category });
    for (const step of steps) {
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
      // Đơn hẹn được đặt cả khi quán đang đóng (VD đặt trước cho sáng mai) — Phần 10.1.
      if (!store.is_open && !dto.schedule) throw new BusinessError('STORE_CLOSED', 'Quán đang đóng cửa');
      const scope = { storeId: store.id, category: store.category };
      const mine = await this.entitlements.effective(client, 'CUSTOMER', user.id);
      if (dto.paymentMethod === 'COD' && (!this.configCenter.get<boolean>('feature.cod', scope) || mine['customer.cod.enabled'] === false)) {
        throw new BusinessError('COD_NOT_AVAILABLE', 'Thanh toán tiền mặt hiện không khả dụng, vui lòng chọn thanh toán online');
      }
      if (dto.schedule) {
        const storeAllows = await this.entitlements.get<boolean>(client, 'STORE', store.id, 'store.scheduled.enabled');
        if (!this.configCenter.get<boolean>('feature.scheduled_orders', scope) || mine['customer.scheduled.enabled'] === false || !storeAllows) {
          throw new BusinessError('SCHEDULED_NOT_AVAILABLE', 'Đơn hẹn giờ hiện không khả dụng cho đơn này');
        }
      }

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
      const deliveryFee = isDelivery
        ? computeDeliveryFee(routeKm, {
            ...this.config.business.deliveryFee,
            minimumFee: this.configCenter.get<number>('fees.delivery_min', scope),
            includedKm: this.configCenter.get<number>('fees.delivery_included_km', scope),
            perKmFee: this.configCenter.get<number>('fees.delivery_per_km', scope),
          })
        : 0;
      const serviceFee = this.configCenter.get<number>('fees.service_fee', scope);
      const total = subtotal + deliveryFee + serviceFee;
      if (dto.paymentMethod === 'COD' && total > Number(mine['customer.cod.max_value'])) {
        throw new BusinessError('COD_LIMIT_EXCEEDED', 'Đơn vượt giá trị tối đa cho phép trả tiền mặt, vui lòng chọn thanh toán online');
      }
      const hasAllergens = lines.some((l) => l.note.allergens.length > 0);
      const needsPin = isDelivery && total >= this.config.business.pinThreshold;
      let plan: SchedulePlan | null = null;
      if (dto.schedule) {
        plan = this.scheduled.plan(dto.schedule, routeKm, now);
        if (dto.paymentMethod === 'COD') await this.scheduled.assertCodAllowed(client, user.id);
        await this.scheduled.reserveSlot(client, store.id, plan.pickupAt, store.slot_capacity);
      }
      const waitingMerchant = plan ? OrderState.HEN_CHO_QUAN_NHAN : OrderState.CHO_QUAN_XAC_NHAN;
      const state = dto.paymentMethod === 'COD' ? waitingMerchant : OrderState.CHO_THANH_TOAN;

      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (code, customer_id, store_id, state, delivery_mode, dropoff_location, dropoff_address, dropoff_note,
           recipient_name, recipient_phone, order_note, distance_m, subtotal, delivery_fee, service_fee, total,
           payment_method, has_allergens, delivery_pin, is_scheduled, schedule_type, scheduled_for, scheduled_pickup_at, customer_device,
           pickup_location, pickup_address)
         VALUES ($1, $2, $3, $4, $5, ${point(6, 7)}, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
           (SELECT location FROM stores WHERE id = $3), (SELECT address_text FROM stores WHERE id = $3))
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
          plan !== null,
          plan?.type ?? null,
          plan?.scheduledFor ?? null,
          plan?.pickupAt ?? null,
          user.device ?? null,
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
      } else if (state === OrderState.HEN_CHO_QUAN_NHAN) {
        await this.scheduled.scheduleMerchantReply(client, order, now);
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
      if (paid.state === OrderState.HEN_CHO_QUAN_NHAN) await this.scheduled.scheduleMerchantReply(client, paid, now);
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

  /** Sau Cổng A: đơn hẹn lên lịch; đơn ngay thì tìm shipper hoặc chờ khách tới lấy. */
  readonly afterAccepted = async (client: PoolClient, accepted: OrderRow): Promise<OrderRow> => {
    await this.notifications.enqueue(client, accepted.customer_id, 'PUSH', 'MERCHANT_ACCEPTED', { orderId: Number(accepted.id) });
    if (accepted.is_scheduled) return this.scheduled.afterAccepted(client, accepted);
    if (accepted.delivery_mode === 'SELF_PICKUP') {
      return this.lifecycle.apply(client, accepted, OrderEvent.START_PICKUP_WAIT, SYSTEM_ACTOR);
    }
    return this.dispatch.start(client, accepted);
  };

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
      if (!ownsOrder(user, order)) throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM orders WHERE customer_id = $1 AND cancel_reason = 'CUSTOMER_FREE'
           AND created_at >= date_trunc('month', $2::timestamptz)`,
        [user.id, now],
      );
      const decision = decideCustomerCancellation({
        state: order.state,
        // Gửi hàng không có bước chuẩn bị món: huỷ trước khi lấy hàng như đơn chưa làm.
        prepStarted: order.kind !== 'PARCEL' && order.prep_state === 'READY',
        secondsSinceAccepted: order.accepted_at ? (now.getTime() - new Date(order.accepted_at).getTime()) / 1000 : null,
        secondsUntilSlot: order.scheduled_pickup_at ? (new Date(order.scheduled_pickup_at).getTime() - now.getTime()) / 1000 : null,
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
    const isCustomer = o && ownsOrder(viewer, o);
    const isStore = o && worksAtStore(viewer, Number(o.store_id));
    const isRider = o && o.rider_id && Number(o.rider_id) === viewer.id;
    if (!o || !(isCustomer || isStore || isRider || hasRole(viewer, 'OPS', 'ADMIN'))) {
      throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
    }
    const items = await q.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
    // Khách thấy cấp uy tín của shipper; quán/shipper thấy số đơn thành công của khách (Phần 11.5).
    const extra = await q.query(
      `SELECT (SELECT tier FROM trust_scores WHERE subject_type = 'RIDER' AND subject_id = $1) AS rider_tier,
              (SELECT count(*)::int FROM orders WHERE customer_id = $2 AND state = 'HOAN_THANH') AS customer_done,
              (SELECT phone FROM users WHERE id = $2) AS customer_phone,
              (SELECT full_name FROM users WHERE id = $2) AS customer_name,
              (SELECT phone FROM users WHERE id = $1) AS rider_phone,
              (SELECT phone FROM stores WHERE id = $3) AS store_phone,
              (SELECT name FROM stores WHERE id = $3) AS store_name`,
      [o.rider_id, o.customer_id, o.store_id],
    );
    const x = extra.rows[0];
    // Liên hệ bằng app gọi/SMS/Zalo trên máy người dùng (không dùng dịch vụ số ẩn trả phí).
    // Chỉ lộ SĐT cho các bên của đơn và chỉ khi đơn còn đang chạy (Phần 5.8).
    const active = !TERMINAL_STATES.has(o.state);
    const isOps = hasRole(viewer, 'OPS', 'ADMIN');
    const receiverPhone = o.recipient_phone ?? x.customer_phone;
    const contacts: Record<string, string | null> = {};
    if (active || isOps) {
      if (!isCustomer || isOps) contacts.customer = receiverPhone;
      if ((!isStore || isOps) && x.store_phone) contacts.store = x.store_phone;
      if (o.rider_id && (!isRider || isOps)) contacts.rider = x.rider_phone;
      // Gửi hàng: shipper và Ops cần gọi người gửi ở điểm lấy hàng.
      if (o.kind === 'PARCEL' && (isRider || isOps)) contacts.sender = o.sender_phone;
    }
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
      kind: o.kind ?? 'FOOD',
      storeId: o.store_id ? Number(o.store_id) : null,
      riderId: o.rider_id ? Number(o.rider_id) : null,
      storeName: x.store_name ?? (o.kind === 'PARCEL' ? 'Gửi hàng' : null),
      riderTier: o.rider_id ? (x.rider_tier ?? 'ROOKIE') : null,
      contacts,
      recipientName: o.recipient_name,
      recipientPhone: o.kind === 'PARCEL' && (isCustomer || isRider || isOps) ? o.recipient_phone : undefined,
      pickupAddress: o.pickup_address,
      pickupNote: o.pickup_note,
      ...(o.kind === 'PARCEL'
        ? { parcel: { type: o.parcel_type, size: o.parcel_size, feePayer: o.fee_payer, senderName: o.sender_name, senderPhone: isCustomer || isRider || isOps ? o.sender_phone : undefined } }
        : {}),
      dropoffAddress: o.dropoff_address,
      dropoffNote: o.dropoff_note,
      // Khách không cần xác minh khi đặt: quán/shipper xem tên và số đơn đã thành công để gọi xác minh (Phần 13.9).
      ...(isCustomer ? {} : { customerName: o.recipient_name ?? x.customer_name, customerCompletedOrders: x.customer_done }),
      paymentMethod: o.payment_method,
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.delivery_fee),
      serviceFee: Number(o.service_fee),
      total: Number(o.total),
      orderNote: o.order_note,
      hasAllergens: o.has_allergens,
      allergyAcknowledged: Boolean(o.allergy_ack_at),
      prepTimeMin: o.prep_time_min,
      schedule: o.is_scheduled
        ? {
            type: o.schedule_type,
            scheduledFor: o.scheduled_for,
            pickupAt: o.scheduled_pickup_at,
            proposedPickupAt: o.proposed_pickup_at,
            merchantReplyDeadline: o.merchant_reply_deadline,
            merchantReconfirmed: Boolean(o.merchant_reconfirmed_at),
            riderReconfirmed: Boolean(o.rider_reconfirmed_at),
          }
        : null,
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
