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
    expect(seen.buyer).toEqual({ name: 'Chị Hoa', phone: '0922000001' });
    expect((await t.http().get(`/v1/orders/${placed.id}`).set(auth(c.token)).expect(200)).body.buyer).toEqual({ name: 'Chị Hoa', phone: '0922000001' });
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

describe('báo giá giỏ hàng', () => {
  it('khách thấy đủ tiền món, phí ship, phí dịch vụ, tổng cộng trước khi đặt — khớp đúng với đơn đặt ra', async () => {
    const body = { storeId, deliveryMode: 'PLATFORM', dropoff: { ...offset(800), address: '12 Pasteur' }, items: [{ itemId, quantity: 2 }] };
    const q = (await t.http().post('/v1/orders/quote').send(body).expect(200)).body;
    expect(q.subtotal).toBe(90_000);
    expect(q.deliveryFee).toBeGreaterThan(0);
    expect(q.total).toBe(q.subtotal + q.deliveryFee + q.serviceFee);
    expect(q.outOfArea).toBe(false);

    const c = await t.customerLogin('0922000077', 'Chị Mơ');
    const placed = (await t.http().post('/v1/orders').set(auth(c.token)).set('Idempotency-Key', idemKey()).send({ ...body, paymentMethod: 'COD' }).expect(201)).body;
    expect({ subtotal: placed.subtotal, deliveryFee: placed.deliveryFee, serviceFee: placed.serviceFee, total: placed.total }).toEqual({
      subtotal: q.subtotal, deliveryFee: q.deliveryFee, serviceFee: q.serviceFee, total: q.total,
    });

    // Tự đến lấy: không có phí ship. Ngoài vùng giao: báo trước.
    expect((await t.http().post('/v1/orders/quote').send({ ...body, deliveryMode: 'SELF_PICKUP', dropoff: undefined }).expect(200)).body.deliveryFee).toBe(0);
    expect((await t.http().post('/v1/orders/quote').send({ ...body, dropoff: { ...offset(20_000), address: 'Xã bên cạnh' } }).expect(200)).body.outOfArea).toBe(true);
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

describe('mật khẩu Admin/Ops', () => {
  it('lần đầu dùng mã kích hoạt, đặt mật khẩu, từ đó đăng nhập bằng mật khẩu; đổi mật khẩu thì đăng xuất máy khác', async () => {
    const first = await t.login('0900000099');
    const opsId = first.userId;
    await t.pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'OPS')`, [opsId]);

    expect((await t.http().get('/v1/auth/me').set(auth(first.token)).expect(200)).body).toMatchObject({ phone: '0900000099', hasPassword: false, via: 'code' });
    expect((await t.http().post('/v1/auth/password-login').send({ phone: '0900000099', password: 'matkhau123' }).expect(401)).body.error.code).toBe('PASSWORD_NOT_SET');

    await t.http().post('/v1/auth/password').set(auth(first.token)).send({ newPassword: '12345678' }).expect(400);
    await t.http().post('/v1/auth/password').set(auth(first.token)).send({ newPassword: 'ngan' }).expect(400);
    const set = (await t.http().post('/v1/auth/password').set(auth(first.token)).send({ newPassword: 'ShipQuanhToi2026' }).expect(200)).body;
    // Máy cũ bị đăng xuất, máy vừa đặt mật khẩu nhận phiên mới.
    await t.http().get('/v1/admin/dashboard').set(auth(first.token)).expect(401);
    await t.http().get('/v1/admin/dashboard').set(auth(set.accessToken)).expect(200);

    const login = (await t.http().post('/v1/auth/password-login').send({ phone: '0900000099', password: 'ShipQuanhToi2026' }).expect(200)).body;
    expect((await t.http().get('/v1/auth/me').set(auth(login.accessToken)).expect(200)).body).toMatchObject({ hasPassword: true, via: 'password', roles: expect.arrayContaining(['OPS']) });
    const { rows } = await t.pool.query('SELECT password_hash FROM users WHERE id = $1', [opsId]);
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain('ShipQuanhToi2026');

    // Đang đăng nhập bằng mật khẩu thì đổi phải đúng mật khẩu cũ.
    await t.http().post('/v1/auth/password').set(auth(login.accessToken)).send({ newPassword: 'MatKhauMoi2026' }).expect(401);
    const changed = (await t.http().post('/v1/auth/password').set(auth(login.accessToken)).send({ currentPassword: 'ShipQuanhToi2026', newPassword: 'MatKhauMoi2026' }).expect(200)).body;
    await t.http().get('/v1/auth/me').set(auth(login.accessToken)).expect(401);
    await t.http().get('/v1/auth/me').set(auth(changed.accessToken)).expect(200);

    // Quên mật khẩu: đăng nhập bằng mã kích hoạt rồi đặt lại, không cần mật khẩu cũ.
    const viaCode = await t.login('0900000099');
    await t.http().post('/v1/auth/password').set(auth(viaCode.token)).send({ newPassword: 'DatLai2026xx' }).expect(200);
    await t.http().post('/v1/auth/password-login').send({ phone: '0900000099', password: 'DatLai2026xx' }).expect(200);
  });

  it('sai 5 lần thì khoá 15 phút; số không phải Admin/Ops không đăng nhập bằng mật khẩu được', async () => {
    const admin2 = await t.login('0900000098');
    await t.pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [admin2.userId]);
    const set = (await t.http().post('/v1/auth/password').set(auth(admin2.token)).send({ newPassword: 'DungMatKhau1' }).expect(200)).body;
    void set;
    for (let i = 0; i < 5; i++) {
      expect((await t.http().post('/v1/auth/password-login').send({ phone: '0900000098', password: 'sai-mat-khau' }).expect(401)).body.error.code).toBe('PASSWORD_WRONG');
    }
    expect((await t.http().post('/v1/auth/password-login').send({ phone: '0900000098', password: 'DungMatKhau1' }).expect(429)).body.error.code).toBe('PASSWORD_LOCKED');
    await t.pool.query('UPDATE users SET password_locked_until = now() - interval \'1 second\' WHERE id = $1', [admin2.userId]);
    await t.http().post('/v1/auth/password-login').send({ phone: '0900000098', password: 'DungMatKhau1' }).expect(200);

    // Quán (không phải Admin/Ops) và số chưa có: cùng một thông báo, không lộ thông tin.
    expect((await t.http().post('/v1/auth/password-login').send({ phone: '0911111111', password: 'bat-ky-123' }).expect(401)).body.error.code).toBe('PASSWORD_WRONG');
    expect((await t.http().post('/v1/auth/password-login').send({ phone: '0999999999', password: 'bat-ky-123' }).expect(401)).body.error.code).toBe('PASSWORD_WRONG');
    await t.http().post('/v1/auth/password').set(auth(merchant)).send({ newPassword: 'QuanDatMatKhau1' }).expect(403);
  });
});

