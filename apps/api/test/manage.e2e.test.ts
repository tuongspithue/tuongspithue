import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let ops: string;
let merchant: string;
let storeId: number;
let itemId: number;
let rider: { token: string; userId: number };

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  storeId = (
    await t.http().post('/v1/merchant/stores').set(auth(merchant))
      .send({ name: 'Bún Cá Cô Mai', category: 'FOOD', ...STORE_AT, address: '5 Trần Hưng Đạo', phone: '0911111111' }).expect(201)
  ).body.id;
  itemId = (await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Bún cá', price: 30_000 }).expect(201)).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);

  rider = await t.login('0933333333');
  await t.http().post('/v1/rider/register').set(auth(rider.token)).send({ vehicleType: 'MOTORBIKE', plateNumber: '73A1-11111' }).expect(201);
  await t.http().post(`/v1/admin/riders/${rider.userId}/approve`).set(auth(admin)).expect(200);
  await t.http().post('/v1/rider/status').set(auth(rider.token)).send({ online: true, ...STORE_AT }).expect(200);

  const opsUser = await t.login('0977000001');
  await t.pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'OPS')`, [opsUser.userId]);
  ops = opsUser.token;
});

afterAll(() => t.close());

describe('quản lý quán', () => {
  it('danh sách có tìm kiếm, lọc, thống kê; hồ sơ quán có menu, nhân sự, uy tín', async () => {
    const list = (await t.http().get('/v1/admin/stores?q=bún cá').set(auth(admin)).expect(200)).body;
    expect(list.stores).toHaveLength(1);
    expect(list.stores[0]).toMatchObject({ name: 'Bún Cá Cô Mai', status: 'APPROVED', isOpen: true, menuCount: 1, ownerPhone: '0911111111' });
    expect(list.summary).toMatchObject({ total: 1, approved: 1, open_now: 1 });
    expect((await t.http().get('/v1/admin/stores?category=DRINK').set(auth(admin)).expect(200)).body.stores).toHaveLength(0);

    const detail = (await t.http().get(`/v1/admin/stores/${storeId}`).set(auth(ops)).expect(200)).body;
    expect(detail.menu[0]).toMatchObject({ name: 'Bún cá', isAvailable: true });
    expect(detail.staff[0]).toMatchObject({ phone: '0911111111', role: 'MERCHANT_OWNER' });
    expect(detail.trust.tier).toBe('ROOKIE');
  });

  it('tạm khoá quán: đóng cửa, biến khỏi "Quanh tôi", quán không tự mở lại được; có nhật ký và lý do', async () => {
    await t.http().patch(`/v1/admin/stores/${storeId}`).set(auth(admin)).send({ status: 'SUSPENDED' }).expect(400);
    await t.http().patch(`/v1/admin/stores/${storeId}`).set(auth(ops)).send({ status: 'SUSPENDED', reason: 'Khách phản ánh' }).expect(403);
    const res = (await t.http().patch(`/v1/admin/stores/${storeId}`).set(auth(admin)).send({ status: 'SUSPENDED', reason: 'Nhiều khiếu nại vệ sinh' }).expect(200)).body;
    expect(res).toMatchObject({ status: 'SUSPENDED', is_open: false });
    const nearby = (await t.http().get('/v1/discovery/nearby').query(offset(300)).expect(200)).body;
    expect(nearby.stores.find((s: any) => s.id === storeId)).toBeUndefined();
    await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(422);

    const detail = (await t.http().get(`/v1/admin/stores/${storeId}`).set(auth(admin)).expect(200)).body;
    expect(detail.history[0]).toMatchObject({ action: 'STORE_SUSPENDED', reason: 'Nhiều khiếu nại vệ sinh' });

    await t.http().patch(`/v1/admin/stores/${storeId}`).set(auth(admin)).send({ status: 'APPROVED', isOpen: true, deliveryRadiusM: 3000, reason: 'Đã kiểm tra lại' }).expect(200);
    expect((await t.http().get(`/v1/admin/stores/${storeId}`).set(auth(admin)).expect(200)).body).toMatchObject({ status: 'APPROVED', isOpen: true, deliveryRadiusM: 3000 });
  });

  it('Ops tắt món hết hàng thay quán', async () => {
    await t.http().patch(`/v1/admin/menu-items/${itemId}`).set(auth(ops)).send({ isAvailable: false }).expect(200);
    const detail = (await t.http().get(`/v1/admin/stores/${storeId}`).set(auth(admin)).expect(200)).body;
    expect(detail.menu[0].isAvailable).toBe(false);
    await t.http().patch(`/v1/admin/menu-items/${itemId}`).set(auth(ops)).send({ isAvailable: true }).expect(200);
  });
});

describe('quản lý shipper', () => {
  it('danh sách có trạng thái trực tuyến, vị trí, tiền mặt đang giữ; tạm khoá thì ngắt trực tuyến', async () => {
    const list = (await t.http().get('/v1/admin/riders?online=true').set(auth(admin)).expect(200)).body;
    expect(list.riders[0]).toMatchObject({ userId: rider.userId, isOnline: true, plateNumber: '73A1-11111', codLimit: 2_000_000 });
    expect(list.summary).toMatchObject({ approved: 1, online: 1, busy: 0 });

    await t.http().patch(`/v1/admin/riders/${rider.userId}`).set(auth(admin)).send({ status: 'SUSPENDED', codLimit: 500_000, reason: 'Giữ tiền thu hộ quá hạn' }).expect(200);
    const detail = (await t.http().get(`/v1/admin/riders/${rider.userId}`).set(auth(admin)).expect(200)).body;
    expect(detail).toMatchObject({ status: 'SUSPENDED', isOnline: false, codLimit: 500_000 });
    expect(detail.history[0].action).toBe('RIDER_SUSPENDED');
    await t.http().post('/v1/rider/status').set(auth(rider.token)).send({ online: true, ...STORE_AT }).expect(422);
  });
});

describe('quản lý khách hàng', () => {
  it('danh sách che SĐT, hồ sơ có lịch sử đơn; khoá tài khoản thì đăng xuất ngay', async () => {
    const c = await t.customerLogin('0922555666', 'Anh Bình');
    await t.http().post('/v1/orders').set(auth(c.token)).set('Idempotency-Key', idemKey())
      .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff: { ...offset(500), address: '1 Lý Thường Kiệt' }, items: [{ itemId, quantity: 2 }] })
      .expect(201);

    const list = (await t.http().get('/v1/admin/customers?q=Bình').set(auth(admin)).expect(200)).body;
    expect(list.customers[0]).toMatchObject({ name: 'Anh Bình', phone: '092****666', orders: 1 });
    const detail = (await t.http().get(`/v1/admin/customers/${c.userId}`).set(auth(admin)).expect(200)).body;
    expect(detail.phone).toBe('0922555666');
    expect(detail.recentOrders[0].storeName).toBe('Bún Cá Cô Mai');

    const map = (await t.http().get('/v1/admin/map').set(auth(ops)).expect(200)).body;
    expect(map.stores.find((s: any) => s.id === storeId)).toBeDefined();
    expect(map.orders).toHaveLength(1);

    await t.http().patch(`/v1/admin/users/${c.userId}/status`).set(auth(admin)).send({ status: 'LOCKED', reason: 'Bùng 3 đơn tiền mặt' }).expect(200);
    await t.http().get(`/v1/orders/${detail.recentOrders[0].id}`).set(auth(c.token)).expect(401);
    const me = (await t.http().get('/v1/admin/dashboard').set(auth(admin)).expect(200)).body;
    expect(me.hourly).toHaveLength(24);
    expect(me.pendingPartners).toEqual({ stores: 0, riders: 0 });
  });
});
