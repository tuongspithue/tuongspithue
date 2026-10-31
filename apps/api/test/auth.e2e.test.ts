import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let merchant: string;
let storeId: number;
let itemId: number;

beforeAll(async () => {
  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  storeId = (
    await t.http().post('/v1/merchant/stores').set(auth(merchant))
      .send({ name: 'Cơm Nhà Lá', category: 'FOOD', ...STORE_AT, address: '9 Lê Lợi, Quận 1', phone: '0911111111' }).expect(201)
  ).body.id;
  itemId = (await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Cơm gà', price: 45_000 }).expect(201)).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);
});

afterAll(() => t.close());

const order = (token: string) =>
  t.http().post('/v1/orders').set(auth(token)).set('Idempotency-Key', idemKey())
    .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff: { ...offset(800), address: '12 Pasteur' }, items: [{ itemId, quantity: 1 }] });

describe('khách: không cần xác minh, người nhận đơn gọi xác minh', () => {
  it('nhập tên + số là đặt được; quán thấy tên và số đơn đã thành công để gọi xác minh', async () => {
    const c = await t.customerLogin('0922000001', 'Chị Hoa');
    const placed = (await order(c.token).expect(201)).body;
    const seen = (await t.http().get(`/v1/orders/${placed.id}`).set(auth(merchant)).expect(200)).body;
    expect(seen.customerName).toBe('Chị Hoa');
    expect(seen.customerCompletedOrders).toBe(0);
    expect(seen.contacts.customer).toBe('0922000001');
  });

  it('máy khác nhập trùng số không xem, không huỷ được đơn của người kia', async () => {
    const owner = await t.customerLogin('0922000002', 'Anh Nam');
    const placed = (await order(owner.token).expect(201)).body;
    const other = await t.customerLogin('0922000002', 'Kẻ lạ');
    expect(other.userId).toBe(owner.userId);
    await t.http().get(`/v1/orders/${placed.id}`).set(auth(other.token)).expect(404);
    await t.http().post(`/v1/orders/${placed.id}/cancel`).set(auth(other.token)).send({}).expect(404);
    await t.http().get(`/v1/orders/${placed.id}`).set(auth(owner.token)).expect(200);
    // Tên đã lưu không bị người sau ghi đè.
    const { rows } = await t.pool.query('SELECT full_name FROM users WHERE id = $1', [owner.userId]);
    expect(rows[0].full_name).toBe('Anh Nam');
  });

  it('đăng nhập kiểu khách bằng số của quán chỉ có quyền khách', async () => {
    const fake = await t.customerLogin('0911111111', 'Giả quán');
    expect((await t.http().get('/v1/merchant/stores').set(auth(fake.token)).expect(200)).body.stores).toEqual([]);
    await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(fake.token)).send({ isOpen: false }).expect(403);
    await t.http().post('/v1/merchant/stores').set(auth(fake.token))
      .send({ name: 'Quán giả', category: 'FOOD', ...STORE_AT, address: '1 Đường Giả', phone: '0911111111' }).expect(403);
    const fakeAdmin = await t.customerLogin(ADMIN_PHONE, 'Giả admin');
    await t.http().get('/v1/admin/dashboard').set(auth(fakeAdmin.token)).expect(403);
  });
});

describe('quán & shipper: Admin xác minh rồi gửi mã kích hoạt', () => {
  it('shipper đăng ký trong app → Admin duyệt nhận mã → đăng nhập bằng mã một lần', async () => {
    const applied = await t.http().post('/v1/auth/partner-apply')
      .send({ kind: 'RIDER', phone: '0933000009', fullName: 'Trần Văn Tài', vehicleType: 'MOTORBIKE', plateNumber: '59A1-12345' }).expect(201);
    expect(applied.body.status).toBe('PENDING');
    await t.http().post('/v1/auth/partner-apply').send({ kind: 'RIDER', phone: '0933000009', fullName: 'Lần hai', vehicleType: 'MOTORBIKE' }).expect(409);

    const pending = (await t.http().get('/v1/admin/partners/pending').set(auth(admin)).expect(200)).body;
    const rider = pending.riders.find((r: any) => r.phone === '0933000009');
    expect(rider.fullName).toBe('Trần Văn Tài');

    // Chưa duyệt thì chưa có mã.
    await t.http().post('/v1/auth/activate').send({ phone: '0933000009', code: '12345678' }).expect(401);
    const approved = (await t.http().post(`/v1/admin/riders/${rider.userId}/approve`).set(auth(admin)).expect(200)).body;
    const code = approved.activation.code as string;
    expect(code).toMatch(/^\d{8}$/);
    expect(approved.activation.message).toContain(code);

    const wrong = code === '00000000' ? '11111111' : '00000000';
    expect((await t.http().post('/v1/auth/activate').send({ phone: '0933000009', code: wrong }).expect(401)).body.error.code).toBe('CODE_WRONG');
    const token = (await t.http().post('/v1/auth/activate').send({ phone: '0933000009', code }).expect(200)).body.accessToken;
    await t.http().post('/v1/rider/status').set(auth(token)).send({ online: true, ...STORE_AT }).expect(200);
    // Mã chỉ dùng một lần.
    await t.http().post('/v1/auth/activate').send({ phone: '0933000009', code }).expect(401);
  });

  it('quán đăng ký kèm thông tin quán; hồ sơ chờ duyệt có tên chủ quán', async () => {
    await t.http().post('/v1/auth/partner-apply')
      .send({ kind: 'MERCHANT', phone: '0911000009', fullName: 'Cô Lan', store: { name: 'Bánh Mì Cô Lan', category: 'FOOD', ...STORE_AT, address: '3 Hàm Nghi, Quận 1', phone: '0911000009' } })
      .expect(201);
    await t.http().post('/v1/auth/partner-apply').send({ kind: 'MERCHANT', phone: '0911000010', fullName: 'Thiếu quán' }).expect(400);
    const pending = (await t.http().get('/v1/admin/partners/pending').set(auth(admin)).expect(200)).body;
    expect(pending.stores.find((s: any) => s.name === 'Bánh Mì Cô Lan').ownerName).toBe('Cô Lan');
  });

  it('nhập sai quá 5 lần thì mã bị khoá, phải xin mã mới', async () => {
    const code = await t.issueCode('0944000001');
    for (let i = 0; i < 5; i++) await t.http().post('/v1/auth/activate').send({ phone: '0944000001', code: code === '99999999' ? '88888888' : '99999999' });
    expect((await t.http().post('/v1/auth/activate').send({ phone: '0944000001', code }).expect(401)).body.error.code).toBe('CODE_INVALID');
  });

  it('mất điện thoại: Admin cấp mã mới kèm đăng xuất máy cũ', async () => {
    const old = await t.login('0955000001');
    await t.http().get('/v1/merchant/stores').set(auth(old.token)).expect(200);
    const issued = (await t.http().post(`/v1/admin/users/${old.userId}/activation-code`).set(auth(admin)).send({ revokeOthers: true }).expect(200)).body;
    await t.http().get('/v1/merchant/stores').set(auth(old.token)).expect(401);
    const fresh = (await t.http().post('/v1/auth/activate').send({ phone: '0955000001', code: issued.code }).expect(200)).body.accessToken;
    await t.http().get('/v1/merchant/stores').set(auth(fresh)).expect(200);
    // Cấp lại theo số điện thoại; số chưa đăng ký thì báo rõ.
    expect((await t.http().post('/v1/admin/activation-codes').set(auth(admin)).send({ phone: '0955000001' }).expect(200)).body.code).toMatch(/^\d{8}$/);
    await t.http().post('/v1/admin/activation-codes').set(auth(admin)).send({ phone: '0955999999' }).expect(404);
    // Chỉ Admin cấp được mã.
    await t.http().post(`/v1/admin/users/${old.userId}/activation-code`).set(auth(fresh)).send({}).expect(403);
  });
});
