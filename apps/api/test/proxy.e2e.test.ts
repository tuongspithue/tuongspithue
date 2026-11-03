import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let merchant: string;
let storeId: number;
let itemId: number;
let rider: { token: string; userId: number };
let poorRider: { token: string; userId: number };
let regular: { token: string; userId: number };

const dropoff = { ...offset(900), address: '9 Hùng Vương, Đồng Hới' };

async function makeRider(phone: string, at: { lat: number; lng: number }, advanceLimit: number) {
  const r = await t.login(phone);
  await t.http().post('/v1/rider/register').set(auth(r.token)).send({ vehicleType: 'MOTORBIKE' }).expect(201);
  await t.http().post(`/v1/admin/riders/${r.userId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/admin/riders/${r.userId}`).set(auth(admin)).send({ advanceLimit, reason: 'Thiết lập hạn mức ứng' }).expect(200);
  await t.http().post('/v1/rider/status').set(auth(r.token)).send({ online: true, ...at }).expect(200);
  return r;
}

const setMode = (orderMode: string) => t.http().patch(`/v1/admin/stores/${storeId}`).set(auth(admin)).send({ orderMode, reason: 'Đổi chế độ nhận đơn' }).expect(200);
const order = (token: string, body: Record<string, unknown> = {}) =>
  t.http().post('/v1/orders').set(auth(token)).set('Idempotency-Key', idemKey())
    .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff, items: [{ itemId, quantity: 2 }], ...body });

async function freeRiders() {
  // Kết thúc chuyến dở của shipper giữa các bài thử.
  await t.pool.query(`UPDATE orders SET state = 'DA_HUY' WHERE state NOT IN ('HOAN_THANH', 'DA_HUY')`);
  await t.pool.query(`UPDATE dispatch_offers SET status = 'EXPIRED' WHERE status = 'SENT'`);
}

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  storeId = (
    await t.http().post('/v1/merchant/stores').set(auth(merchant))
      .send({ name: 'Bún Bò Vỉa Hè Dì Năm', category: 'FOOD', ...STORE_AT, address: '3 Lê Lợi, Đồng Hới', phone: '0911111111' }).expect(201)
  ).body.id;
  itemId = (await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Bún bò', price: 40_000 }).expect(201)).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);
  rider = await makeRider('0933200001', offset(200), 500_000);
  poorRider = await makeRider('0933200002', offset(150), 50_000);
  // Khách đã có đơn thành công (không bị giới hạn khách mới).
  regular = await t.customerLogin('0922400001', 'Anh Quen');
  await t.pool.query(
    `INSERT INTO orders (code, customer_id, store_id, state, delivery_mode, subtotal, delivery_fee, service_fee, total, payment_method)
     VALUES ('SQT-OLD001', $1, $2, 'HOAN_THANH', 'PLATFORM', 1, 0, 0, 1, 'COD')`,
    [regular.userId, storeId],
  );
});

afterAll(() => t.close());

describe('chế độ "Shipper mua hộ" (quán không dùng app)', () => {
  it('đặt xong mời ngay shipper đủ hạn mức ứng; shipper đặt món tại quán, trả tiền, giao — tính lại tổng theo giá thật', async () => {
    await setMode('PROXY');
    const placed = (await order(regular.token).expect(201)).body;
    expect(placed).toMatchObject({ state: 'DANG_TIM_SHIPPER', fulfillment: 'PROXY', proxyAllowed: true });

    // Shipper không đủ hạn mức ứng 80.000đ thì không được mời, dù ở gần hơn.
    expect((await t.http().get('/v1/rider/offers').set(auth(poorRider.token)).expect(200)).body.offers).toHaveLength(0);
    const offer = (await t.http().get('/v1/rider/offers').set(auth(rider.token)).expect(200)).body.offers[0];
    expect(offer).toMatchObject({ fulfillment: 'PROXY', advanceAmount: 80_000 });

    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(rider.token)).expect(200);
    const id = placed.id;
    await t.http().post(`/v1/rider/orders/${id}/proxy-ordered`).set(auth(rider.token)).send({}).expect(409);
    await t.http().post(`/v1/rider/orders/${id}/arrived-store`).set(auth(rider.token)).send(STORE_AT).expect(200);
    expect((await t.http().post(`/v1/rider/orders/${id}/picked-up`).set(auth(rider.token)).send({ ...STORE_AT, code: placed.code }).expect(409)).body.error.code).toBe('USE_PROXY_PURCHASED');
    expect((await t.http().post(`/v1/rider/orders/${id}/proxy-purchased`).set(auth(rider.token)).send({ ...STORE_AT, amount: 80_000 }).expect(409)).body.error.code).toBe('NOT_ORDERED');

    // Shipper đặt món trực tiếp — người thật xác nhận thay Cổng A.
    await t.http().post(`/v1/rider/orders/${id}/proxy-ordered`).set(auth(rider.token)).send({}).expect(200);
    const mid = (await t.http().get(`/v1/orders/${id}`).set(auth(admin)).expect(200)).body;
    expect(mid.acceptedChannel).toBe('RIDER_PROXY');
    expect(mid.timeline.map((e: any) => e.event)).toContain('PROXY_ORDERED');

    // Giá thật cao hơn 25%: phải gọi khách đồng ý.
    expect((await t.http().post(`/v1/rider/orders/${id}/proxy-purchased`).set(auth(rider.token)).send({ ...STORE_AT, amount: 100_000 }).expect(422)).body.error.code).toBe('PRICE_CHANGED');
    const bought = (await t.http().post(`/v1/rider/orders/${id}/proxy-purchased`).set(auth(rider.token)).send({ ...STORE_AT, amount: 100_000, customerAgreed: true, receiptUrl: 'https://api.test/uploads/hoadon.jpg' }).expect(200)).body;
    expect(bought).toMatchObject({ state: 'DANG_GIAO', subtotal: 100_000, total: 100_000 + placed.deliveryFee + placed.serviceFee });

    await t.http().post(`/v1/rider/orders/${id}/arrived-dropoff`).set(auth(rider.token)).send(offset(900)).expect(200);
    await t.http().post(`/v1/rider/orders/${id}/delivered`).set(auth(rider.token)).send({}).expect(200);
    const done = (await t.http().get(`/v1/orders/${id}`).set(auth(regular.token)).expect(200)).body;
    expect(done).toMatchObject({ state: 'HOAN_THANH', total: bought.total, proxyPaidAmount: 100_000 });
  });

  it('chặn tự đến lấy; khách mới chỉ mua hộ đơn dưới mức Admin cài (mặc định 200.000đ)', async () => {
    await freeRiders();
    expect((await order(regular.token, { deliveryMode: 'SELF_PICKUP', dropoff: undefined }).expect(422)).body.error.code).toBe('PROXY_DELIVERY_ONLY');
    const newbie = await t.customerLogin('0922400002', 'Khách Mới');
    expect((await order(newbie.token, { items: [{ itemId, quantity: 5 }] }).expect(422)).body.error.code).toBe('PROXY_NEW_CUSTOMER_LIMIT');
    expect((await order(newbie.token, { items: [{ itemId, quantity: 2 }] }).expect(201)).body.fulfillment).toBe('PROXY');
  });

  it('tới nơi quán đóng cửa: shipper báo, đơn huỷ hoàn tiền, ghi tiền bù chuyến đi', async () => {
    await freeRiders();
    const placed = (await order(regular.token).expect(201)).body;
    const offer = (await t.http().get('/v1/rider/offers').set(auth(rider.token)).expect(200)).body.offers[0];
    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(rider.token)).expect(200);
    await t.http().post(`/v1/rider/orders/${placed.id}/arrived-store`).set(auth(rider.token)).send(STORE_AT).expect(200);
    const res = (await t.http().post(`/v1/rider/orders/${placed.id}/store-unavailable`).set(auth(rider.token)).send({ reason: 'Quán đóng cửa' }).expect(200)).body;
    expect(res).toMatchObject({ state: 'DA_HUY', failedTripFee: 10_000 });
    expect((await t.http().get(`/v1/orders/${placed.id}`).set(auth(regular.token)).expect(200)).body.refund).toBe('FULL');
  });
});

describe('chế độ "Song song"', () => {
  it('quán im lặng quá 60 giây thì mời shipper mua hộ; quán vẫn nhận muộn được trước khi shipper đặt món', async () => {
    await freeRiders();
    await setMode('HYBRID');
    const placed = (await order(regular.token).expect(201)).body;
    expect(placed).toMatchObject({ state: 'CHO_QUAN_XAC_NHAN', fulfillment: 'STORE', proxyAllowed: true });

    await t.jobs.runDue(new Date(Date.now() + 30_000));
    expect((await t.http().get(`/v1/orders/${placed.id}`).set(auth(regular.token)).expect(200)).body.state).toBe('CHO_QUAN_XAC_NHAN');
    await t.jobs.runDue(new Date(Date.now() + 61_000));
    const switched = (await t.http().get(`/v1/orders/${placed.id}`).set(auth(regular.token)).expect(200)).body;
    expect(switched).toMatchObject({ state: 'DANG_TIM_SHIPPER', fulfillment: 'PROXY' });

    const offer = (await t.http().get('/v1/rider/offers').set(auth(rider.token)).expect(200)).body.offers[0];
    await t.http().post(`/v1/rider/offers/${offer.id}/accept`).set(auth(rider.token)).expect(200);
    // Quán thấy đơn và bấm nhận muộn: chuyển về quán làm món, shipper chỉ việc lấy.
    await t.http().post(`/v1/merchant/orders/${placed.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    const late = (await t.http().get(`/v1/orders/${placed.id}`).set(auth(merchant)).expect(200)).body;
    expect(late).toMatchObject({ state: 'SHIPPER_DA_NHAN', fulfillment: 'STORE', acceptedChannel: 'APP' });
    await t.http().post(`/v1/rider/orders/${placed.id}/arrived-store`).set(auth(rider.token)).send(STORE_AT).expect(200);
    expect((await t.http().post(`/v1/rider/orders/${placed.id}/proxy-ordered`).set(auth(rider.token)).send({}).expect(409)).body.error.code).toBe('NOT_PROXY');
  });

  it('quán nhận trong 60 giây thì không mời shipper mua hộ; chế độ "Quán tự nhận" chỉ chuyển khi hết hạn Cổng A (Admin tắt được)', async () => {
    await freeRiders();
    const quick = (await order(regular.token).expect(201)).body;
    await t.http().post(`/v1/merchant/orders/${quick.id}/accept`).set(auth(merchant)).send({ prepTimeMin: 10 }).expect(200);
    await t.jobs.runDue(new Date(Date.now() + 61_000));
    expect((await t.http().get(`/v1/orders/${quick.id}`).set(auth(regular.token)).expect(200)).body.fulfillment).toBe('STORE');

    await freeRiders();
    await setMode('APP');
    const app = (await order(regular.token).expect(201)).body;
    expect(app.proxyAllowed).toBe(true);
    await t.jobs.runDue(new Date(Date.now() + 61_000));
    expect((await t.http().get(`/v1/orders/${app.id}`).set(auth(regular.token)).expect(200)).body.state).toBe('CHO_QUAN_XAC_NHAN');
    // Hết hạn Cổng A (180 giây) mà quán vẫn im lặng: mời shipper tới quán mua hộ thay vì huỷ.
    // (Giả lập shipper vẫn gửi vị trí tới thời điểm đó — điều phối chỉ mời shipper có vị trí trong 2 phút.)
    await t.pool.query(`UPDATE riders SET location_at = now() + interval '3 minutes'`);
    await t.jobs.runDue(new Date(Date.now() + 181_000));
    expect((await t.http().get(`/v1/orders/${app.id}`).set(auth(regular.token)).expect(200)).body).toMatchObject({ state: 'DANG_TIM_SHIPPER', fulfillment: 'PROXY' });

    // Admin tắt "chuyển shipper khi quán im lặng" cho quán này: hết hạn thì huỷ như cũ.
    await freeRiders();
    await t.http().put('/v1/admin/config/proxy.fallback_on_store_silent').set(auth(admin))
      .send({ scope: 'STORE', scopeId: String(storeId), value: false, reason: 'Quán chỉ bán tại chỗ' }).expect(200);
    const off = (await order(regular.token).expect(201)).body;
    expect(off.proxyAllowed).toBe(false);
    await t.jobs.runDue(new Date(Date.now() + 181_000));
    expect((await t.http().get(`/v1/orders/${off.id}`).set(auth(regular.token)).expect(200)).body.state).toBe('DA_HUY');
    await t.http().delete('/v1/admin/config/proxy.fallback_on_store_silent').set(auth(admin))
      .send({ scope: 'STORE', scopeId: String(storeId), reason: 'Bật lại' }).expect(200);
  });
});
