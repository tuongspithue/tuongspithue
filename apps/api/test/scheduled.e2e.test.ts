import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let merchant: string;
let customer: string;
let riderA: { token: string; userId: number };
let riderB: { token: string; userId: number };
let storeId: number;
let itemId: number;

const MIN = 60_000;
const dropoff = { ...offset(1000), address: '12 Lê Lợi, Quận 1' };

/** Khung 15 phút đầu tiên sau `minutes` phút nữa. */
const slotAfter = (minutes: number) => new Date(Math.ceil((Date.now() + minutes * MIN) / (15 * MIN)) * 15 * MIN);

/**
 * "Tua thời gian": dời mọi mốc của đơn hẹn và việc hẹn giờ về trước `minutes` phút, như thể thời gian đã trôi qua.
 */
async function travel(minutes: number) {
  const iv = `${minutes} minutes`;
  await t.pool.query(
    `UPDATE scheduled_jobs SET run_at = run_at - $1::interval;
     UPDATE orders SET scheduled_pickup_at = scheduled_pickup_at - $1::interval, scheduled_for = scheduled_for - $1::interval,
       merchant_reply_deadline = merchant_reply_deadline - $1::interval, proposed_pickup_at = proposed_pickup_at - $1::interval
     WHERE is_scheduled;
     UPDATE store_capacity_slots SET slot_start = slot_start - $1::interval;`.replace(/\$1/g, `'${iv}'`),
  );
}

/** Tua tới lúc còn đúng `minutes` phút trước giờ lấy hàng của đơn. */
async function travelUntil(orderId: number, minutes: number) {
  const { rows } = await t.pool.query('SELECT scheduled_pickup_at FROM orders WHERE id = $1', [orderId]);
  const remaining = (new Date(rows[0].scheduled_pickup_at).getTime() - Date.now()) / MIN;
  await travel(remaining - minutes);
}

async function placeScheduled(at: Date, extra: Record<string, unknown> = {}, token = customer) {
  return t
    .http()
    .post('/v1/orders')
    .set(auth(token))
    .set('Idempotency-Key', idemKey())
    .send({
      storeId,
      deliveryMode: 'PLATFORM',
      paymentMethod: 'VIETQR',
      dropoff,
      items: [{ itemId, quantity: 2 }],
      schedule: { type: 'PICKUP', at: at.toISOString() },
      ...extra,
    });
}

/** Đặt đơn hẹn thanh toán online và giả lập cổng báo đã thu tiền. */
async function paidScheduled(at: Date, extra: Record<string, unknown> = {}) {
  const res = await placeScheduled(at, extra);
  expect(res.status).toBe(201);
  const paid = await t.http().post(`/v1/webhooks/payments/dev/${res.body.id}/paid`).expect(200);
  expect(paid.body.state).toBe('HEN_CHO_QUAN_NHAN');
  return res.body;
}

const state = async (orderId: number) =>
  (await t.http().get(`/v1/orders/${orderId}`).set(auth(customer)).expect(200)).body;

const accept = (orderId: number) =>
  t.http().post(`/v1/merchant/orders/${orderId}/accept`).set(auth(merchant)).send({ prepTimeMin: 15 }).expect(200);

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  customer = (await t.login('0922222222')).token;
  riderA = await t.login('0933333333');
  riderB = await t.login('0944444444');

  storeId = (
    await t
      .http()
      .post('/v1/merchant/stores')
      .set(auth(merchant))
      .send({ name: 'Bánh Kem Hồng', category: 'FOOD', ...STORE_AT, address: '5 Pasteur, Quận 1', phone: '0911111111' })
      .expect(201)
  ).body.id;
  itemId = (
    await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Bánh su kem', price: 30_000 }).expect(201)
  ).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  // Quán vẫn đóng cửa: đơn hẹn vẫn đặt được (VD đặt trước cho buổi chiều).

  for (const r of [riderA, riderB]) {
    await t.http().post('/v1/rider/register').set(auth(r.token)).send({ vehicleType: 'MOTORBIKE' }).expect(201);
    await t.http().post(`/v1/admin/riders/${r.userId}/approve`).set(auth(admin)).expect(200);
  }
});

afterAll(() => t.close());

beforeEach(async () => {
  await t.pool.query(
    `TRUNCATE dispatch_offers, scheduled_jobs, notifications, outbox, idempotency_keys, store_capacity_slots RESTART IDENTITY;
     ALTER TABLE order_events DISABLE TRIGGER order_events_immutable;
     DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders;
     ALTER TABLE order_events ENABLE TRIGGER order_events_immutable;
     UPDATE riders SET is_online = false, cod_balance = 0;
     UPDATE stores SET slot_capacity = 4;`,
  );
});

describe('đặt đơn hẹn', () => {
  it('khung giờ: trả về các khung còn nhận, sớm nhất sau 45 phút', async () => {
    const date = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const res = await t.http().get(`/v1/stores/${storeId}/slots`).query({ date }).expect(200);
    for (const s of res.body.slots) {
      expect(new Date(s.start).getTime()).toBeGreaterThanOrEqual(Date.now() + 45 * MIN - 1000);
      expect(s.status).toBe('OPEN');
    }
  });

  it('từ chối hẹn quá sớm, sai khung 15 phút, quá 7 ngày', async () => {
    expect((await placeScheduled(slotAfter(15))).body.error.code).toBe('SCHEDULE_TOO_SOON');
    expect((await placeScheduled(new Date(slotAfter(90).getTime() + 5 * MIN))).body.error.code).toBe('SCHEDULE_NOT_ON_SLOT');
    expect((await placeScheduled(slotAfter(8 * 24 * 60))).body.error.code).toBe('SCHEDULE_TOO_FAR');
  });

  it('khách mới chưa đủ đơn thành công thì chưa được hẹn trả tiền mặt', async () => {
    const res = await placeScheduled(slotAfter(120), { paymentMethod: 'COD' });
    expect(res.body.error.code).toBe('SCHEDULED_COD_NOT_ALLOWED');
  });

  it('khung kín thì từ chối; huỷ đơn trả lại chỗ', async () => {
    await t.pool.query('UPDATE stores SET slot_capacity = 1 WHERE id = $1', [storeId]);
    const at = slotAfter(120);
    const first = await paidScheduled(at);
    expect((await placeScheduled(at)).body.error.code).toBe('SLOT_FULL');
    const cancelled = await t.http().post(`/v1/orders/${first.id}/cancel`).set(auth(customer)).expect(200);
    expect(cancelled.body.refund).toBe('FULL');
    expect((await placeScheduled(at)).status).toBe(201);
  });

  it('kiểu "giờ tôi nhận hàng" trừ thời gian đi đường để ra giờ lấy hàng', async () => {
    const at = slotAfter(180);
    const order = await paidScheduled(at, { schedule: { type: 'DELIVERY', at: at.toISOString() } });
    const v = await state(order.id);
    // 1 km × 1,3 = 1,3 km ở 20 km/h ≈ 4 phút → làm tròn 5 phút + 5 phút dự phòng = 10 phút.
    expect(new Date(v.schedule.pickupAt).getTime()).toBe(at.getTime() - 10 * MIN);
  });
});

describe('quán nhận đơn hẹn (Cổng A)', () => {
  it('quán im lặng tới hạn trả lời: nhắc, gọi IVR, báo Ops rồi huỷ và hoàn tiền', async () => {
    const order = await paidScheduled(slotAfter(240));
    const v = await state(order.id);
    expect(new Date(v.schedule.merchantReplyDeadline).getTime()).toBeLessThanOrEqual(Date.now() + 30 * MIN + 1000);

    await t.jobs.runDue(new Date(Date.now() + 31 * MIN));
    const after = await state(order.id);
    expect(after).toMatchObject({ state: 'DA_HUY', refund: 'FULL' });
    const templates = (await t.pool.query('SELECT template FROM notifications')).rows.map((r) => r.template);
    expect(templates).toEqual(expect.arrayContaining(['NEW_SCHEDULED_ORDER', 'NEW_ORDER_REMINDER', 'NEW_ORDER_IVR', 'OPS_STUCK_ORDER']));
  });

  it('quán đề xuất giờ khác, khách đồng ý → đơn lên chợ chuyến với giờ mới', async () => {
    const order = await paidScheduled(slotAfter(120));
    const newAt = slotAfter(180);
    const proposed = await t
      .http()
      .post(`/v1/merchant/orders/${order.id}/propose-time`)
      .set(auth(merchant))
      .send({ at: newAt.toISOString(), prepTimeMin: 20 })
      .expect(200);
    expect(proposed.body.state).toBe('HEN_CHO_KHACH_DUYET_GIO');

    const res = await t.http().post(`/v1/orders/${order.id}/proposal`).set(auth(customer)).send({ accept: true }).expect(200);
    expect(res.body.state).toBe('HEN_TREN_CHO_CHUYEN');
    const v = await state(order.id);
    expect(new Date(v.schedule.pickupAt).getTime()).toBe(newAt.getTime());
    expect(v.timeline.find((e: any) => e.event === 'MERCHANT_PROPOSE_TIME').byRole).toBe('MERCHANT');
  });

  it('khách không trả lời đề xuất trong 15 phút → huỷ, hoàn tiền', async () => {
    const order = await paidScheduled(slotAfter(120));
    await t.http().post(`/v1/merchant/orders/${order.id}/propose-time`).set(auth(merchant)).send({ at: slotAfter(180).toISOString(), prepTimeMin: 20 }).expect(200);
    await t.jobs.runDue(new Date(Date.now() + 16 * MIN));
    expect((await state(order.id)).state).toBe('DA_HUY');
  });
});

describe('chợ chuyến hẹn (Cổng B) và xác nhận lại', () => {
  it('luồng chuẩn: lên chợ → shipper giữ → hai bên xác nhận lại → đến giờ chạy như đơn thường', async () => {
    await t.http().post('/v1/rider/status').set(auth(riderA.token)).send({ online: true, ...offset(500) }).expect(200);
    await t.http().post('/v1/rider/status').set(auth(riderB.token)).send({ online: true, ...offset(800) }).expect(200);
    const order = await paidScheduled(slotAfter(90));
    expect((await accept(order.id)).body.state).toBe('HEN_TREN_CHO_CHUYEN');

    const board = await t.http().get('/v1/rider/scheduled-board').set(auth(riderA.token)).expect(200);
    expect(board.body.trips).toHaveLength(1);
    expect(board.body.trips[0]).toMatchObject({ orderId: order.id, storeName: 'Bánh Kem Hồng', cashToCollect: 0 });

    const claimed = await t.http().post(`/v1/rider/scheduled-trips/${order.id}/claim`).set(auth(riderA.token)).expect(200);
    expect(claimed.body.state).toBe('HEN_SHIPPER_DA_GIU');
    const late = await t.http().post(`/v1/rider/scheduled-trips/${order.id}/claim`).set(auth(riderB.token));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('TRIP_TAKEN');
    expect((await t.http().get('/v1/rider/scheduled-board').set(auth(riderB.token))).body.trips).toHaveLength(0);

    // Còn hơn 40 phút: chưa tới lúc shipper xác nhận sẵn sàng.
    expect((await t.http().post(`/v1/rider/scheduled-trips/${order.id}/ready`).set(auth(riderA.token))).body.error.code).toBe(
      'RECONFIRM_TOO_EARLY',
    );

    await travelUntil(order.id, 35);
    await t.http().post(`/v1/merchant/orders/${order.id}/reconfirm`).set(auth(merchant)).expect(200);
    const ready = await t.http().post(`/v1/rider/scheduled-trips/${order.id}/ready`).set(auth(riderA.token)).expect(200);
    expect(ready.body.state).toBe('HEN_SAN_SANG');

    await travelUntil(order.id, 14);
    await t.jobs.runDue();
    const v = await state(order.id);
    expect(v.state).toBe('SHIPPER_DA_NHAN');
    expect(v.riderId).toBe(riderA.userId);
    expect(v.timeline.map((e: any) => `${e.event}:${e.byRole}`)).toEqual(
      expect.arrayContaining(['MERCHANT_ACCEPT:MERCHANT', 'RIDER_CLAIM:RIDER', 'MERCHANT_RECONFIRMED:MERCHANT', 'RIDER_RECONFIRMED:RIDER', 'SLOT_START:SYSTEM']),
    );
  });

  it('còn 30 phút chưa ai giữ chuyến → chuyển sang điều phối chủ động', async () => {
    const order = await paidScheduled(slotAfter(90));
    await accept(order.id);
    await t.http().post('/v1/rider/status').set(auth(riderA.token)).send({ online: true, ...offset(300) }).expect(200);
    await travelUntil(order.id, 29);
    await t.jobs.runDue();
    expect((await state(order.id)).state).toBe('DANG_TIM_SHIPPER');
    expect((await t.http().get('/v1/rider/offers').set(auth(riderA.token))).body.offers).toHaveLength(1);
    const { rows } = await t.pool.query('SELECT board_bonus FROM orders WHERE id = $1', [order.id]);
    expect(Number(rows[0].board_bonus)).toBe(3_000);
  });

  it('shipper giữ chuyến nhưng không xác nhận sẵn sàng trước T−20 → mất chuyến, đơn được mời lại', async () => {
    await t.http().post('/v1/rider/status').set(auth(riderA.token)).send({ online: true, ...offset(300) }).expect(200);
    const order = await paidScheduled(slotAfter(90));
    await accept(order.id);
    await t.http().post(`/v1/rider/scheduled-trips/${order.id}/claim`).set(auth(riderA.token)).expect(200);
    await t.http().post('/v1/rider/status').set(auth(riderB.token)).send({ online: true, ...offset(600) }).expect(200);
    await travelUntil(order.id, 35);
    await t.http().post(`/v1/merchant/orders/${order.id}/reconfirm`).set(auth(merchant)).expect(200);
    await travelUntil(order.id, 19);
    await t.jobs.runDue();
    const v = await state(order.id);
    expect(v.state).toBe('DANG_TIM_SHIPPER');
    expect(v.riderId).toBeNull();
    expect(v.timeline.some((e: any) => e.event === 'RIDER_RECONFIRM_MISSED')).toBe(true);
  });

  it('không giữ được hai chuyến quá sát giờ nhau; nhả chuyến thì chuyến quay lại chợ', async () => {
    await t.http().post('/v1/rider/status').set(auth(riderA.token)).send({ online: true, ...offset(300) }).expect(200);
    const at = slotAfter(180);
    const o1 = await paidScheduled(at);
    const o2 = await paidScheduled(at);
    await accept(o1.id);
    await accept(o2.id);
    await t.http().post(`/v1/rider/scheduled-trips/${o1.id}/claim`).set(auth(riderA.token)).expect(200);
    expect((await t.http().post(`/v1/rider/scheduled-trips/${o2.id}/claim`).set(auth(riderA.token))).body.error.code).toBe('CLAIM_CONFLICT');

    const released = await t.http().post(`/v1/rider/scheduled-trips/${o1.id}/release`).set(auth(riderA.token)).send({ reason: 'Bận việc gia đình' }).expect(200);
    expect(released.body).toMatchObject({ state: 'HEN_TREN_CHO_CHUYEN', late: false });
  });

  it('quán không xác nhận lại trước giờ → gọi IVR, chuyển cần can thiệp', async () => {
    await t.http().post('/v1/rider/status').set(auth(riderA.token)).send({ online: true, ...offset(300) }).expect(200);
    const order = await paidScheduled(slotAfter(90));
    await accept(order.id);
    await t.http().post(`/v1/rider/scheduled-trips/${order.id}/claim`).set(auth(riderA.token)).expect(200);
    await travelUntil(order.id, 35);
    await t.http().post(`/v1/rider/scheduled-trips/${order.id}/ready`).set(auth(riderA.token)).expect(200);
    await travelUntil(order.id, 19);
    await t.jobs.runDue();
    expect((await state(order.id)).state).toBe('CAN_CAN_THIEP');
    const ivr = await t.pool.query(`SELECT 1 FROM notifications WHERE template = 'RECONFIRM_SCHEDULED_IVR'`);
    expect(ivr.rowCount).toBe(1);
  });
});
