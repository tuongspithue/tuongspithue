import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let rider: { token: string; userId: number };
let farRider: { token: string; userId: number };

const pickup = { ...STORE_AT, address: '12 Lê Lợi, Đồng Hới', note: 'Gọi khi tới cổng' };
const dropoff = { ...offset(2500), address: '45 Quang Trung, Đồng Hới' };

async function makeRider(phone: string, at: { lat: number; lng: number }) {
  const r = await t.login(phone);
  await t.http().post('/v1/rider/register').set(auth(r.token)).send({ vehicleType: 'MOTORBIKE' }).expect(201);
  await t.http().post(`/v1/admin/riders/${r.userId}/approve`).set(auth(admin)).expect(200);
  await t.http().post('/v1/rider/status').set(auth(r.token)).send({ online: true, ...at }).expect(200);
  return r;
}

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  rider = await makeRider('0933100001', offset(300));
  farRider = await makeRider('0933100002', offset(9000));
});

afterAll(() => t.close());

describe('gửi hàng: khách đặt shipper giao hàng từ A tới B', () => {
  it('báo giá theo quãng đường và kích cỡ; từ chối quá gần hoặc quá xa', async () => {
    const small = (await t.http().post('/v1/parcels/quote').send({ pickup, dropoff, size: 'SMALL' }).expect(200)).body;
    const large = (await t.http().post('/v1/parcels/quote').send({ pickup, dropoff, size: 'LARGE' }).expect(200)).body;
    expect(small.distanceM).toBeGreaterThan(2500);
    expect(large.deliveryFee - small.deliveryFee).toBe(15_000);
    expect(small.total).toBe(small.deliveryFee + small.serviceFee);
    expect((await t.http().post('/v1/parcels/quote').send({ pickup, dropoff: { ...pickup }, size: 'SMALL' }).expect(422)).body.error.code).toBe('SAME_PLACE');
    expect((await t.http().post('/v1/parcels/quote').send({ pickup, dropoff: { ...offset(30_000), address: 'Xa lắm' }, size: 'SMALL' }).expect(422)).body.error.code).toBe('TOO_FAR');
  });

  it('đặt → mời shipper gần điểm lấy → shipper nhận (người thật xác nhận) → lấy hàng bằng mã đơn → giao bằng mã người nhận', async () => {
    const c = await t.customerLogin('0922300001', 'Chị Lan');
    await t.http().post('/v1/parcels').set(auth(c.token)).send({}).expect(400);
    const placed = (
      await t.http().post('/v1/parcels').set(auth(c.token)).set('Idempotency-Key', idemKey())
        .send({ pickup, dropoff, size: 'MEDIUM', parcelType: 'DOCUMENT', feePayer: 'RECEIVER', sender: { name: 'Chị Lan', phone: '0922300001' }, receiver: { name: 'Anh Tuấn', phone: '0922300002' }, note: 'Hồ sơ giấy, tránh ướt' })
        .expect(201)
    ).body;
    expect(placed).toMatchObject({ kind: 'PARCEL', state: 'DANG_TIM_SHIPPER', storeId: null, pickupAddress: pickup.address, recipientName: 'Anh Tuấn' });
    expect(placed.parcel).toMatchObject({ type: 'DOCUMENT', size: 'MEDIUM', feePayer: 'RECEIVER' });
    expect(placed.deliveryPin).toMatch(/^\d{4}$/);

    // Chỉ shipper gần điểm lấy hàng được mời.
    expect((await t.http().get('/v1/rider/offers').set(auth(farRider.token)).expect(200)).body.offers).toHaveLength(0);
    const offers = (await t.http().get('/v1/rider/offers').set(auth(rider.token)).expect(200)).body.offers;
    expect(offers[0]).toMatchObject({ kind: 'PARCEL', feePayer: 'RECEIVER', storeAddress: pickup.address, dropoffAddress: dropoff.address, cashToCollect: placed.total });

    await t.http().post(`/v1/rider/offers/${offers[0].id}/accept`).set(auth(rider.token)).expect(200);
    const trip = (await t.http().get('/v1/rider/trips').set(auth(rider.token)).expect(200)).body.trips[0];
    expect(trip.contacts.sender).toBe('0922300001');
    expect(trip.contacts.customer).toBe('0922300002');

    const id = placed.id;
    await t.http().post(`/v1/rider/orders/${id}/arrived-store`).set(auth(rider.token)).send(offset(1200)).expect(422);
    await t.http().post(`/v1/rider/orders/${id}/arrived-store`).set(auth(rider.token)).send(STORE_AT).expect(200);
    await t.http().post(`/v1/rider/orders/${id}/picked-up`).set(auth(rider.token)).send({ ...STORE_AT, code: 'SQT-SAI000' }).expect(422);
    await t.http().post(`/v1/rider/orders/${id}/picked-up`).set(auth(rider.token)).send({ ...STORE_AT, code: placed.code }).expect(200);
    await t.http().post(`/v1/rider/orders/${id}/arrived-dropoff`).set(auth(rider.token)).send(offset(2500)).expect(200);
    await t.http().post(`/v1/rider/orders/${id}/delivered`).set(auth(rider.token)).send({ pin: '0000' === placed.deliveryPin ? '1111' : '0000' }).expect(422);
    await t.http().post(`/v1/rider/orders/${id}/delivered`).set(auth(rider.token)).send({ pin: placed.deliveryPin }).expect(200);

    const done = (await t.http().get(`/v1/orders/${id}`).set(auth(c.token)).expect(200)).body;
    expect(done.state).toBe('HOAN_THANH');
    expect(done.timeline.map((e: any) => e.byRole)).toContain('RIDER');
    const list = (await t.http().get('/v1/admin/orders?q=' + placed.code).set(auth(admin)).expect(200)).body.orders;
    expect(list[0]).toMatchObject({ code: placed.code, storeName: '📦 Gửi hàng' });
    // Không có quán nên chỉ đánh giá được shipper.
    await t.http().post(`/v1/orders/${id}/review`).set(auth(c.token)).send({ rider: { stars: 5 } }).expect(201);
  });

  it('khách huỷ khi đang tìm shipper thì lời mời bị thu hồi', async () => {
    const c = await t.customerLogin('0922300003', 'Bác Năm');
    const placed = (
      await t.http().post('/v1/parcels').set(auth(c.token)).set('Idempotency-Key', idemKey())
        .send({ pickup, dropoff, size: 'SMALL', parcelType: 'FOOD', feePayer: 'SENDER', sender: { name: 'Bác Năm', phone: '0922300003' }, receiver: { name: 'Cháu Hà', phone: '0922300004' } })
        .expect(201)
    ).body;
    await t.http().post(`/v1/orders/${placed.id}/cancel`).set(auth(c.token)).send({}).expect(200);
    const offers = (await t.http().get('/v1/rider/offers').set(auth(rider.token)).expect(200)).body.offers;
    expect(offers.find((o: any) => o.orderId === placed.id)).toBeUndefined();
  });
});
