import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let merchant: string;
let customer: string;
let riderA: { token: string; userId: number };
let riderB: { token: string; userId: number };
let storeId: number;
let phoId: number;
let teaId: number;
let packagedId: number;

const dropoff = { ...offset(1000), address: '12 Lê Lợi, Quận 1', note: 'Gọi trước 5 phút' };

async function goOnline(rider: { token: string }, at: { lat: number; lng: number }) {
  await t.http().post('/v1/rider/status').set(auth(rider.token)).send({ online: true, ...at }).expect(200);
}

async function placeOrder(body: Record<string, unknown> = {}) {
  const res = await t
    .http()
    .post('/v1/orders')
    .set(auth(customer))
    .set('Idempotency-Key', idemKey())
    .send({
      storeId,
      deliveryMode: 'PLATFORM',
      paymentMethod: 'COD',
      dropoff,
      items: [{ itemId: teaId, quantity: 1 }],
      ...body,
    });
  expect(res.status).toBe(201);
  return res.body;
}

async function resetTrips() {
  await t.pool.query(
    `TRUNCATE dispatch_offers, scheduled_jobs, notifications, outbox, idempotency_keys RESTART IDENTITY;
     ALTER TABLE order_events DISABLE TRIGGER order_events_immutable;
     DELETE FROM reviews; DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders;
     ALTER TABLE order_events ENABLE TRIGGER order_events_immutable;
     UPDATE riders SET is_online = false, cod_balance = 0;
     DELETE FROM trust_scores;`,
  );
}

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  customer = (await t.login('0922222222')).token;
  riderA = await t.login('0933333333');
  riderB = await t.login('0944444444');

  const store = await t
    .http()
    .post('/v1/merchant/stores')
    .set(auth(merchant))
    .send({ name: 'Phở Cô Lan', category: 'FOOD', ...STORE_AT, address: '1 Nguyễn Huệ, Quận 1', phone: '0911111111' })
    .expect(201);
  storeId = store.body.id;

  const add = (body: object) =>
    t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send(body).expect(201);
  phoId = (await add({ name: 'Phở bò tái', price: 55_000, quickNotes: ['Không hành', 'Ít bánh', 'Tái riêng'] })).body.id;
  teaId = (await add({ name: 'Trà đá', price: 5_000 })).body.id;
  packagedId = (await add({ name: 'Nước suối đóng chai', price: 10_000, notesDisabled: true })).body.id;

  // Quán chưa duyệt thì chưa mở cửa được.
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(422);
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);

  for (const r of [riderA, riderB]) {
    await t.http().post('/v1/rider/register').set(auth(r.token)).send({ vehicleType: 'MOTORBIKE', plateNumber: '59X1-12345' }).expect(201);
    await t.http().post(`/v1/admin/riders/${r.userId}/approve`).set(auth(admin)).expect(200);
  }
});

afterAll(() => t.close());
beforeEach(resetTrips);

describe('khám phá "Quanh tôi"', () => {
  it('trả về quán đang mở trong bán kính, kèm khoảng cách', async () => {
    const res = await t.http().get('/v1/discovery/nearby').query(offset(800)).expect(200);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0]).toMatchObject({ id: storeId, name: 'Phở Cô Lan', isOpen: true });
    expect(res.body.stores[0].distanceM).toBeGreaterThan(750);
  });

  it('không trả quán ở xa ngoài bán kính tìm', async () => {
    const res = await t.http().get('/v1/discovery/nearby').query({ ...offset(4000), radius: 2000 }).expect(200);
    expect(res.body.stores).toHaveLength(0);
  });

  it('trang quán có menu và chip ghi chú nhanh', async () => {
    const res = await t.http().get(`/v1/stores/${storeId}`).expect(200);
    const pho = res.body.menu.find((m: any) => m.id === phoId);
    expect(pho.quickNotes).toEqual(['Không hành', 'Ít bánh', 'Tái riêng']);
  });
});

describe('luồng đầy đủ: đặt đơn → Cổng A → Cổng B → giao hàng', () => {
  it('đi hết các bước, đúng người xác nhận ở mỗi cổng', async () => {
    await goOnline(riderA, offset(300));
    await goOnline(riderB, offset(2000));

    const order = await placeOrder({
      items: [
        {
          itemId: phoId,
          quantity: 1,
          noteTags: ['Không hành', 'Không hành'],
          note: 'Cho mình xin thêm ớt, gọi 0901234567',
          allergens: ['PEANUT'],
        },
        { itemId: teaId, quantity: 2 },
      ],
      orderNote: 'Gói riêng từng phần',
    });
    expect(order.state).toBe('CHO_QUAN_XAC_NHAN');
    expect(order.subtotal).toBe(65_000);
    expect(order.deliveryFee).toBe(15_000); // 1 km × 1,3 = 1,3 km ≤ 2 km
    expect(order.total).toBe(65_000 + 15_000 + 2_000);
    expect(order.hasAllergens).toBe(true);
    expect(order.items[0]).toMatchObject({
      noteTags: ['Không hành'],
      note: 'Cho mình xin thêm ớt, gọi [đã ẩn]',
      allergens: ['PEANUT'],
    });

    // Cổng A: đơn có dị ứng mà quán chưa xác nhận đã đọc → bị chặn.
    const noAck = await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 });
    expect(noAck.status).toBe(409);
    expect(noAck.body.error.code).toBe('ALLERGY_ACK_REQUIRED');

    // Người ngoài quán không nhận đơn được.
    await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(customer)).send({ prepTimeMin: 10, allergyAck: true }).expect(403);

    const accepted = await t
      .http()
      .post(`/v1/merchant/orders/${order.id}/accept`)
      .set(auth(merchant))
      .send({ prepTimeMin: 10, allergyAck: true })
      .expect(200);
    expect(accepted.body.state).toBe('DANG_TIM_SHIPPER');

    // Vòng 1 (≤ 1,5 km, 1 người): chỉ shipper A gần nhất được mời.
    const offersA = await t.http().get('/v1/rider/offers').set(auth(riderA.token)).expect(200);
    const offersB = await t.http().get('/v1/rider/offers').set(auth(riderB.token)).expect(200);
    expect(offersA.body.offers).toHaveLength(1);
    expect(offersB.body.offers).toHaveLength(0);
    const offer = offersA.body.offers[0];
    expect(offer).toMatchObject({ orderId: order.id, cashToCollect: order.total, earning: 12_000 });

    // Shipper B không nhận hộ lời mời của A được.
    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(riderB.token)).expect(404);

    // Cổng B.
    const taken = await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(riderA.token)).expect(200);
    expect(taken.body.state).toBe('SHIPPER_DA_NHAN');
    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(riderA.token)).expect(409);

    // Đến quán: xa quá mà không có ảnh → chặn; ở gần → được.
    const far = await t.http().post(`/v1/rider/orders/${order.id}/arrived-store`).set(auth(riderA.token)).send(offset(600));
    expect(far.status).toBe(422);
    expect(far.body.error.code).toBe('OUTSIDE_GEOFENCE');
    await t.http().post(`/v1/rider/orders/${order.id}/arrived-store`).set(auth(riderA.token)).send(offset(40)).expect(200);

    // Chưa xong món thì chưa lấy hàng được.
    const notReady = await t.http().post(`/v1/rider/orders/${order.id}/picked-up`).set(auth(riderA.token)).send({ ...offset(40), code: order.code });
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.code).toBe('PREP_NOT_READY');
    await t.http().post(`/v1/merchant/orders/${order.id}/ready`).set(auth(merchant)).expect(200);
    await t.http().post(`/v1/rider/orders/${order.id}/picked-up`).set(auth(riderA.token)).send({ ...offset(40), code: 'SQT-WRONG1' }).expect(422);
    const picked = await t.http().post(`/v1/rider/orders/${order.id}/picked-up`).set(auth(riderA.token)).send({ ...offset(40), code: order.code }).expect(200);
    expect(picked.body.state).toBe('DANG_GIAO');

    // Khách không huỷ được khi hàng đã lên đường.
    const cancel = await t.http().post(`/v1/orders/${order.id}/cancel`).set(auth(customer));
    expect(cancel.status).toBe(409);

    await t.http().post(`/v1/rider/orders/${order.id}/arrived-dropoff`).set(auth(riderA.token)).send(offset(1020)).expect(200);
    const done = await t.http().post(`/v1/rider/orders/${order.id}/delivered`).set(auth(riderA.token)).send({ photoUrl: 'https://cdn/x.jpg' }).expect(200);
    expect(done.body.state).toBe('HOAN_THANH');

    const { rows } = await t.pool.query('SELECT cod_balance FROM riders WHERE user_id = $1', [riderA.userId]);
    expect(Number(rows[0].cod_balance)).toBe(order.total);

    const view = await t.http().get(`/v1/orders/${order.id}`).set(auth(customer)).expect(200);
    const timeline = view.body.timeline.map((e: any) => `${e.event}:${e.byRole}:${e.channel}`);
    expect(timeline).toEqual([
      'ORDER_PLACED:CUSTOMER:APP',
      'MERCHANT_ACCEPT:MERCHANT:APP',
      'START_DISPATCH:SYSTEM:SYSTEM',
      'RIDER_ACCEPT:RIDER:APP',
      'RIDER_ARRIVED_STORE:RIDER:APP',
      'PREP_READY:MERCHANT:APP',
      'RIDER_PICKED_UP:RIDER:APP',
      'START_DELIVERY:SYSTEM:SYSTEM',
      'RIDER_ARRIVED_DROPOFF:RIDER:APP',
      'DELIVERED:RIDER:APP',
    ]);
    expect(view.body.allergyAcknowledged).toBe(true);
    expect(view.body.riderTier).toBe('ROOKIE');

    // Đánh giá tách riêng quán và shipper; điểm uy tín tính lại.
    await t.http().post(`/v1/orders/${order.id}/review`).set(auth(customer)).send({ store: { stars: 5, tags: ['Ngon'] }, rider: { stars: 4 } }).expect(201);
    await t.http().post(`/v1/orders/${order.id}/review`).set(auth(customer)).send({ store: { stars: 1 } }).expect(409);
    await t.jobs.runDue();
    const riderTrust = await t.http().get('/v1/me/trust').set(auth(riderA.token)).expect(200);
    expect(riderTrust.body).toMatchObject({ subject: 'RIDER', tier: 'ROOKIE', completed: 1, reviewCount: 1 });
    expect(riderTrust.body.components.completion).toBe(100);
    const reviews = await t.http().get(`/v1/stores/${storeId}/reviews`).expect(200);
    expect(reviews.body.reviewCount).toBe(1);
    // Sao Bayes kéo về trung bình chung khi mới có ít đánh giá.
    expect(reviews.body.stars).toBeGreaterThan(4.5);
    expect(reviews.body.stars).toBeLessThan(5);
    const storeTrust = await t.http().get('/v1/me/trust').query({ storeId }).set(auth(merchant)).expect(200);
    expect(storeTrust.body.components.acceptance).toBe(100);
    await t.http().get('/v1/me/trust').query({ storeId }).set(auth(customer)).expect(403);
  });

  it('chỉ đánh giá được đơn đã giao xong', async () => {
    const order = await placeOrder();
    await t.http().post(`/v1/orders/${order.id}/review`).set(auth(customer)).send({ store: { stars: 5 } }).expect(409);
  });

  it('quán bỏ lỡ đơn thì tỷ lệ nhận đơn giảm', async () => {
    const order = await placeOrder();
    await t.jobs.runDue(new Date(Date.now() + 181_000));
    const { rows } = await t.pool.query(`SELECT components FROM trust_scores WHERE subject_type = 'STORE' AND subject_id = $1`, [storeId]);
    expect(rows[0].components.acceptance).toBe(0);
  });

  it('nhật ký sự kiện không sửa/xoá được', async () => {
    const order = await placeOrder();
    await expect(t.pool.query('UPDATE order_events SET actor_role = $1 WHERE order_id = $2', ['OPS', order.id])).rejects.toThrow(
      /bất biến/,
    );
  });
});

describe('Cổng A — hẹn giờ và dự phòng', () => {
  it('quán im lặng: nhắc, gọi IVR có đọc ghi chú, báo Ops, 180 giây thì huỷ và hoàn tiền', async () => {
    const order = await placeOrder({ items: [{ itemId: phoId, quantity: 1, noteTags: ['Không hành'], allergens: ['SEAFOOD'] }] });
    const placedAt = Date.now();

    await t.jobs.runDue(new Date(placedAt + 100_000));
    let view = await t.http().get(`/v1/orders/${order.id}`).set(auth(customer)).expect(200);
    expect(view.body.state).toBe('CHO_QUAN_XAC_NHAN');
    const ivr = await t.pool.query(`SELECT payload FROM notifications WHERE channel = 'IVR'`);
    expect(ivr.rows[0].payload.script).toContain('ghi chú: Không hành');
    expect(ivr.rows[0].payload.script).toContain('Lưu ý dị ứng: SEAFOOD');

    await t.jobs.runDue(new Date(placedAt + 181_000));
    view = await t.http().get(`/v1/orders/${order.id}`).set(auth(customer)).expect(200);
    expect(view.body.state).toBe('DA_HUY');
    expect(view.body.refund).toBe('FULL');
    const templates = (await t.pool.query('SELECT template FROM notifications ORDER BY id')).rows.map((r) => r.template);
    expect(templates).toEqual(
      expect.arrayContaining(['NEW_ORDER', 'NEW_ORDER_REMINDER', 'NEW_ORDER_IVR', 'SUGGEST_SCHEDULE', 'OPS_STUCK_ORDER', 'ORDER_CANCELLED_MERCHANT_SILENT']),
    );
  });

  it('quán đã nhận thì các mốc nhắc sau đó không làm gì', async () => {
    const order = await placeOrder({ deliveryMode: 'SELF_PICKUP', dropoff: undefined });
    await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    await t.jobs.runDue(new Date(Date.now() + 200_000));
    const view = await t.http().get(`/v1/orders/${order.id}`).set(auth(customer)).expect(200);
    expect(view.body.state).toBe('CHO_KHACH_DEN_LAY');
  });

  it('Ops gọi điện xác nhận thay quán được ghi kênh OPS_CALL', async () => {
    const order = await placeOrder();
    await t.http().post(`/v1/ops/orders/${order.id}/accept-on-behalf`).set(auth(customer)).send({ prepTimeMin: 15 }).expect(403);
    await t.http().post(`/v1/ops/orders/${order.id}/accept-on-behalf`).set(auth(admin)).send({ prepTimeMin: 15 }).expect(200);
    const view = await t.http().get(`/v1/orders/${order.id}`).set(auth(customer)).expect(200);
    expect(view.body.timeline[1]).toMatchObject({ event: 'MERCHANT_ACCEPT', byRole: 'OPS', channel: 'OPS_CALL' });
  });

  it('quán từ chối: huỷ và hoàn toàn bộ', async () => {
    const order = await placeOrder();
    const res = await t.http().post(`/v1/merchant/orders/${order.id}/reject`).set(auth(merchant)).send({ reason: 'Hết nguyên liệu' }).expect(200);
    expect(res.body.state).toBe('DA_HUY');
  });
});

describe('Cổng B — điều phối', () => {
  it('lời mời hết hạn thì mời vòng sau, không mời lại người cũ', async () => {
    await goOnline(riderA, offset(300));
    await goOnline(riderB, offset(2000));
    const order = await placeOrder();
    await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    expect((await t.http().get('/v1/rider/offers').set(auth(riderA.token))).body.offers).toHaveLength(1);

    await t.jobs.runDue(new Date(Date.now() + 21_000));
    // A không còn lời mời nào hiệu lực, B (2 km, vòng 2) được mời.
    const { rows } = await t.pool.query('SELECT rider_id, wave, status FROM dispatch_offers WHERE order_id = $1 ORDER BY id', [order.id]);
    expect(rows.map((r) => [Number(r.rider_id), r.wave, r.status])).toEqual([
      [riderA.userId, 1, 'EXPIRED'],
      [riderB.userId, 2, 'SENT'],
    ]);
  });

  it('không có shipper nào: chuyển cần can thiệp và báo Ops', async () => {
    const order = await placeOrder();
    const res = await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    expect(res.body.state).toBe('CAN_CAN_THIEP');
  });

  it('shipper nhả chuyến: tìm người khác, không mời lại người vừa nhả', async () => {
    await goOnline(riderA, offset(300));
    await goOnline(riderB, offset(1000));
    const order = await placeOrder();
    await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    const offer = (await t.http().get('/v1/rider/offers').set(auth(riderA.token))).body.offers[0];
    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(riderA.token)).expect(200);

    const released = await t.http().post(`/v1/rider/orders/${order.id}/release`).set(auth(riderA.token)).send({ reason: 'Chờ món quá lâu' }).expect(200);
    expect(released.body.state).toBe('DANG_TIM_SHIPPER');
    expect((await t.http().get('/v1/rider/offers').set(auth(riderB.token))).body.offers).toHaveLength(1);
    expect((await t.http().get('/v1/rider/offers').set(auth(riderA.token))).body.offers).toHaveLength(0);
  });

  it('shipper chưa duyệt không bật online được', async () => {
    const newbie = await t.login('0955555555');
    await t.http().post('/v1/rider/register').set(auth(newbie.token)).send({ vehicleType: 'MOTORBIKE' }).expect(201);
    const res = await t.http().post('/v1/rider/status').set(auth(newbie.token)).send({ online: true, ...offset(100) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RIDER_NOT_APPROVED');
  });
});

describe('đặt đơn — kiểm tra đầu vào', () => {
  it('gửi lại cùng Idempotency-Key không tạo đơn thứ hai', async () => {
    const key = idemKey();
    const body = { storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff, items: [{ itemId: teaId, quantity: 1 }] };
    const first = await t.http().post('/v1/orders').set(auth(customer)).set('Idempotency-Key', key).send(body).expect(201);
    const second = await t.http().post('/v1/orders').set(auth(customer)).set('Idempotency-Key', key).send(body).expect(201);
    expect(second.body.id).toBe(first.body.id);
    const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM orders');
    expect(rows[0].n).toBe(1);
  });

  it('thiếu Idempotency-Key thì từ chối', async () => {
    await t.http().post('/v1/orders').set(auth(customer)).send({}).expect(400);
  });

  it('món tắt ghi chú mà khách vẫn ghi chú → 422', async () => {
    const res = await t
      .http()
      .post('/v1/orders')
      .set(auth(customer))
      .set('Idempotency-Key', idemKey())
      .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff, items: [{ itemId: packagedId, quantity: 1, note: 'ướp lạnh' }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOTES_DISABLED');
  });

  it('ngoài vùng giao của quán → 422', async () => {
    const res = await t
      .http()
      .post('/v1/orders')
      .set(auth(customer))
      .set('Idempotency-Key', idemKey())
      .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff: { ...dropoff, ...offset(9000) }, items: [{ itemId: teaId, quantity: 1 }] });
    expect(res.body.error.code).toBe('OUT_OF_DELIVERY_AREA');
  });

  it('dị ứng không có trong danh mục → 400', async () => {
    await t
      .http()
      .post('/v1/orders')
      .set(auth(customer))
      .set('Idempotency-Key', idemKey())
      .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff, items: [{ itemId: teaId, quantity: 1, allergens: ['TOMATO'] }] })
      .expect(400);
  });
});

describe('thanh toán online & huỷ đơn', () => {
  it('chờ thanh toán → cổng báo đã thu → mới gửi quán; quá 10 phút chưa trả thì huỷ', async () => {
    const paid = await placeOrder({ paymentMethod: 'VIETQR' });
    expect(paid.state).toBe('CHO_THANH_TOAN');
    const res = await t.http().post(`/v1/webhooks/payments/dev/${paid.id}/paid`).expect(200);
    expect(res.body.state).toBe('CHO_QUAN_XAC_NHAN');

    const unpaid = await placeOrder({ paymentMethod: 'MOMO' });
    await t.jobs.runDue(new Date(Date.now() + 601_000));
    const view = await t.http().get(`/v1/orders/${unpaid.id}`).set(auth(customer)).expect(200);
    expect(view.body.state).toBe('DA_HUY');
  });

  it('khách huỷ trước khi quán nhận: hoàn toàn bộ', async () => {
    const order = await placeOrder();
    const res = await t.http().post(`/v1/orders/${order.id}/cancel`).set(auth(customer)).expect(200);
    expect(res.body).toMatchObject({ state: 'DA_HUY', refund: 'FULL' });
  });

  it('khách tự đến lấy: quán bàn giao bằng mã đơn', async () => {
    const order = await placeOrder({ deliveryMode: 'SELF_PICKUP', dropoff: undefined });
    expect(order.deliveryFee).toBe(0);
    await t.http().post(`/v1/merchant/orders/${order.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    await t.http().post(`/v1/merchant/orders/${order.id}/handover`).set(auth(merchant)).send({ code: 'SQT-NOPE00' }).expect(422);
    const done = await t.http().post(`/v1/merchant/orders/${order.id}/handover`).set(auth(merchant)).send({ code: order.code.toLowerCase() }).expect(200);
    expect(done.body.state).toBe('HOAN_THANH');
  });

  it('người khác không xem được đơn', async () => {
    const order = await placeOrder();
    const stranger = await t.login('0966666666');
    await t.http().get(`/v1/orders/${order.id}`).set(auth(stranger.token)).expect(404);
  });
});
