import { AddressInfo } from 'net';
import { createServer, Server } from 'http';
import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';

let t: TestContext;
let admin: string;
let merchant: string;
let customer: { token: string; userId: number };
let rider: { token: string; userId: number };
let storeId: number;
let itemId: number;

/** Máy chủ giả lập API tương thích OpenAI (Groq) để kiểm tra kết nối AI mà không gọi ra ngoài. */
let fakeAi: Server;
let fakeAiUrl: string;
const fakeAiCalls: Array<{ path: string; auth?: string; body?: any }> = [];

const dropoff = { ...offset(1000), address: '12 Lê Lợi, Quận 1' };
const order = (body: object = {}) =>
  t
    .http()
    .post('/v1/orders')
    .set(auth(customer.token))
    .set('Idempotency-Key', idemKey())
    .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff, items: [{ itemId, quantity: 1 }], ...body });

beforeAll(async () => {
  fakeAi = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      fakeAiCalls.push({ path: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer gsk_test_key_1234') {
        res.statusCode = 401;
        return res.end('{}');
      }
      if (req.url === '/openai/v1/models') return res.end(JSON.stringify({ data: [{ id: 'model-nhanh' }, { id: 'model-lon' }] }));
      const content = JSON.stringify({ items: [{ section: 'Món chính', name: 'Cơm tấm sườn', price: 35000 }, { name: 'X', price: -1 }] });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  }).listen(0);
  fakeAiUrl = `http://127.0.0.1:${(fakeAi.address() as AddressInfo).port}/openai/v1`;

  t = await setup();
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  customer = await t.login('0922222222');
  rider = await t.login('0933333333');
  storeId = (
    await t
      .http()
      .post('/v1/merchant/stores')
      .set(auth(merchant))
      .send({ name: 'Cơm Tấm Bà Sáu', category: 'FOOD', ...STORE_AT, address: '3 Lê Lai, Quận 1', phone: '0911111111' })
      .expect(201)
  ).body.id;
  itemId = (await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Cơm sườn', price: 35_000 }).expect(201)).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);
  await t.http().post('/v1/rider/register').set(auth(rider.token)).send({ vehicleType: 'MOTORBIKE' }).expect(201);
  await t.http().post(`/v1/admin/riders/${rider.userId}/approve`).set(auth(admin)).expect(200);
});

afterAll(async () => {
  await t.close();
  fakeAi.close();
});

describe('trung tâm cấu hình phân tầng (Phần 14.6)', () => {
  it('chỉ ADMIN xem và sửa được', async () => {
    await t.http().get('/v1/admin/config').set(auth(customer.token)).expect(403);
    const res = await t.http().get('/v1/admin/config').set(auth(admin)).expect(200);
    const fee = res.body.definitions.find((d: any) => d.key === 'fees.service_fee');
    expect(fee.effective).toMatchObject({ value: 2_000, source: 'DEFAULT' });
  });

  it('tầng cụ thể nhất thắng: quán → ngành → toàn hệ thống; áp dụng ngay vào đơn mới', async () => {
    await t.http().put('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'GLOBAL', value: 3_000, reason: 'Điều chỉnh phí dịch vụ' }).expect(200);
    await t.http().put('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'CATEGORY', scopeId: 'FOOD', value: 1_000, reason: 'Ưu đãi ngành đồ ăn' }).expect(200);
    const atStore = await t.http().get('/v1/admin/config/fees.service_fee/resolve').query({ storeId, category: 'FOOD' }).set(auth(admin)).expect(200);
    expect(atStore.body).toMatchObject({ value: 1_000, source: 'CATEGORY' });

    await t.http().put('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'STORE', scopeId: String(storeId), value: 0, reason: 'Quán thí điểm miễn phí dịch vụ' }).expect(200);
    const res = await order().expect(201);
    expect(res.body.serviceFee).toBe(0);

    // Xoá ghi đè của quán → quay về tầng ngành.
    await t.http().delete('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'STORE', scopeId: String(storeId), reason: 'Hết thí điểm' }).expect(200);
    expect((await order().expect(201)).body.serviceFee).toBe(1_000);
  });

  it('kiểm tra khoảng giá trị và không cho sửa nguyên tắc bất biến', async () => {
    const tooHigh = await t.http().put('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'GLOBAL', value: 999_999, reason: 'thử' });
    expect(tooHigh.body.error.code).toBe('CONFIG_INVALID');
    const invariant = await t.http().put('/v1/admin/config/invariant.human_confirmation').set(auth(admin)).send({ scope: 'GLOBAL', value: false, reason: 'thử tắt' });
    expect(invariant.status).toBe(403);
    expect(invariant.body.error.code).toBe('CONFIG_INVARIANT');
    const badSteps = await t
      .http()
      .put('/v1/admin/config/sla.gate_a.steps')
      .set(auth(admin))
      .send({ scope: 'GLOBAL', value: [{ afterSeconds: 60, action: 'REMIND' }], reason: 'thiếu mốc tự huỷ' });
    expect(badSteps.body.error.message).toMatch(/AUTO_CANCEL/);
  });

  it('mốc Cổng A chỉnh được: quán im lặng 120 giây thì hết hạn (đơn giao tận nơi chuyển shipper mua hộ)', async () => {
    await t
      .http()
      .put('/v1/admin/config/sla.gate_a.steps')
      .set(auth(admin))
      .send({ scope: 'GLOBAL', value: [{ afterSeconds: 60, action: 'OPS_CALL' }, { afterSeconds: 120, action: 'AUTO_CANCEL' }], reason: 'Rút ngắn chờ ở khu thí điểm' })
      .expect(200);
    const o = (await order().expect(201)).body;
    await t.jobs.runDue(new Date(Date.now() + 100_000));
    expect((await t.http().get(`/v1/orders/${o.id}`).set(auth(customer.token)).expect(200)).body.state).toBe('CHO_QUAN_XAC_NHAN');
    await t.jobs.runDue(new Date(Date.now() + 125_000));
    const v = await t.http().get(`/v1/orders/${o.id}`).set(auth(customer.token)).expect(200);
    expect(v.body.fulfillment).toBe('PROXY');
    expect(v.body.state).not.toBe('DA_HUY');
  });

  it('có phiên bản, hoàn tác về bản cũ và nhật ký thao tác', async () => {
    const hist = await t.http().get('/v1/admin/config/fees.service_fee/history').set(auth(admin)).expect(200);
    const firstGlobal = hist.body.history.find((h: any) => h.scope_type === 'GLOBAL' && h.version === 1);
    expect(firstGlobal.value).toBe(3_000);
    await t.http().put('/v1/admin/config/fees.service_fee').set(auth(admin)).send({ scope: 'GLOBAL', value: 5_000, reason: 'Tăng phí' }).expect(200);
    const rb = await t.http().post('/v1/admin/config/fees.service_fee/rollback').set(auth(admin)).send({ scope: 'GLOBAL', version: 1, reason: 'Tăng nhầm' }).expect(200);
    expect(rb.body).toMatchObject({ value: 3_000, version: 3 });
    const logs = await t.http().get('/v1/admin/users/audit-logs').query({ targetType: 'config' }).set(auth(admin)).expect(200);
    expect(logs.body.logs[0]).toMatchObject({ action: 'CONFIG_SET', reason: 'Hoàn tác về v1: Tăng nhầm' });
    await expect(t.pool.query('DELETE FROM admin_audit_logs')).rejects.toThrow(/bất biến/);
  });

  it('tắt tính năng tiền mặt cho ngành → đơn COD bị từ chối', async () => {
    await t.http().put('/v1/admin/config/feature.cod').set(auth(admin)).send({ scope: 'CATEGORY', scopeId: 'FOOD', value: false, reason: 'Tạm dừng COD' }).expect(200);
    expect((await order()).body.error.code).toBe('COD_NOT_AVAILABLE');
    await t.http().delete('/v1/admin/config/feature.cod').set(auth(admin)).send({ scope: 'CATEGORY', scopeId: 'FOOD', reason: 'Mở lại' }).expect(200);
    await order().expect(201);
  });
});

describe('phân quyền chức năng & điều chỉnh cấp (Phần 15)', () => {
  it('tắt COD cho một khách có lý do & thời hạn; khách xem được quyền của mình; thu hồi được', async () => {
    const set = await t
      .http()
      .post('/v1/admin/users/entitlements')
      .set(auth(admin))
      .send({ subject: 'CUSTOMER', subjectId: customer.userId, key: 'customer.cod.enabled', value: false, reasonCode: 'COD_REFUSED', days: 30 })
      .expect(201);
    const caps = await t.http().get('/v1/me/capabilities').set(auth(customer.token)).expect(200);
    expect(caps.body.customer['customer.cod.enabled']).toBe(false);
    expect((await order()).body.error.code).toBe('COD_NOT_AVAILABLE');
    const notif = await t.pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND template = 'ENTITLEMENT_CHANGED'`, [customer.userId]);
    expect(notif.rowCount).toBe(1);

    await t.http().post(`/v1/admin/users/entitlements/${set.body.id}/revoke`).set(auth(admin)).send({ reason: 'Khách đã giải trình' }).expect(200);
    await order().expect(201);
  });

  it('bắt buộc lý do hợp lệ, thời hạn ≤ 90 ngày, giá trị trong khoảng', async () => {
    const base = { subject: 'CUSTOMER', subjectId: customer.userId, key: 'customer.cod.max_value', reasonCode: 'OTHER', days: 10 };
    await t.http().post('/v1/admin/users/entitlements').set(auth(admin)).send({ ...base, value: 5_000, reasonCode: 'KHONG_THICH' }).expect(400);
    await t.http().post('/v1/admin/users/entitlements').set(auth(admin)).send({ ...base, value: 5_000, days: 365 }).expect(400);
    expect((await t.http().post('/v1/admin/users/entitlements').set(auth(admin)).send({ ...base, value: 99_000_000 })).body.error.code).toBe(
      'ENTITLEMENT_OUT_OF_RANGE',
    );
    await t.http().post('/v1/admin/users/entitlements').set(auth(admin)).send({ ...base, value: 30_000 }).expect(201);
    expect((await order()).body.error.code).toBe('COD_LIMIT_EXCEEDED');
  });

  it('nâng cấp shipper có thời hạn: cấp hiệu lực đổi, cấp tự động giữ nguyên, shipper được báo', async () => {
    const res = await t
      .http()
      .post('/v1/admin/users/tier-overrides')
      .set(auth(admin))
      .send({ subject: 'RIDER', subjectId: rider.userId, action: 'SET_TIER', tier: 'GOLD', reasonCode: 'CAMPAIGN', note: 'Đội mưa bão tháng 11', days: 30 })
      .expect(201);
    expect(res.body.tier).toBe('GOLD');
    const mine = await t.http().get('/v1/me/trust').set(auth(rider.token)).expect(200);
    expect(mine.body).toMatchObject({ tier: 'GOLD', autoTier: 'ROOKIE', adjusted: true });
    const notif = await t.pool.query(`SELECT payload FROM notifications WHERE user_id = $1 AND template = 'TIER_ADJUSTED'`, [rider.userId]);
    expect(notif.rows[0].payload).toMatchObject({ tier: 'GOLD', reasonCode: 'CAMPAIGN' });
    // Ops không được nâng/hạ cấp.
    const ops = await t.login('0977777777');
    await t.pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'OPS')`, [ops.userId]);
    await t.http().post('/v1/admin/users/tier-overrides').set(auth(ops.token)).send({ subject: 'RIDER', subjectId: rider.userId, action: 'LOCK', reasonCode: 'OTHER', days: 5 }).expect(403);
  });
});

describe('kết nối AI do Admin nhập — mặc định Groq (Phần 12.8)', () => {
  it('mặc định có Groq nhưng chưa có key; nhập key thì chỉ thấy 4 ký tự cuối', async () => {
    const before = await t.http().get('/v1/admin/ai').set(auth(admin)).expect(200);
    expect(before.body.providers[0]).toMatchObject({ code: 'groq', baseUrl: 'https://api.groq.com/openai/v1', hasKey: false, isDefault: true });

    const saved = await t.http().put('/v1/admin/ai/providers/groq').set(auth(admin)).send({ baseUrl: fakeAiUrl, apiKey: 'gsk_test_key_1234' }).expect(200);
    expect(saved.body).toMatchObject({ hasKey: true, keyLast4: '1234' });
    expect(JSON.stringify(saved.body)).not.toContain('gsk_test');
    const { rows } = await t.pool.query(`SELECT api_key_enc FROM ai_providers WHERE code = 'groq'`);
    expect(rows[0].api_key_enc).not.toContain('gsk_test');
    const logs = await t.pool.query(`SELECT after FROM admin_audit_logs WHERE action = 'AI_PROVIDER_SET'`);
    expect(JSON.stringify(logs.rows)).not.toContain('gsk_test');
  });

  it('kiểm tra kết nối lấy danh sách model', async () => {
    const check = await t.http().post('/v1/admin/ai/providers/groq/test').set(auth(admin)).expect(200);
    expect(check.body).toMatchObject({ ok: true, models: ['model-nhanh', 'model-lon'] });
  });

  it('chưa bật tác vụ: nhập menu dùng bộ đọc theo quy tắc; bật tác vụ: dùng AI, lọc kết quả sai lược đồ', async () => {
    const text = 'Cơm sườn 35k, Cơm gà 40k. Gọi 0901234567';
    const rules = await t.http().post(`/v1/merchant/stores/${storeId}/menu/import-text`).set(auth(merchant)).send({ text }).expect(201);
    expect(rules.body.source).toBe('RULES');
    expect(rules.body.items[0]).toMatchObject({ name: 'Cơm sườn', price: 35_000 });

    await t.http().put('/v1/admin/ai/tasks/extract_json').set(auth(admin)).send({ enabled: true }).expect(422);
    await t.http().put('/v1/admin/ai/tasks/extract_json').set(auth(admin)).send({ model: 'model-nhanh', enabled: true }).expect(200);
    const ai = await t.http().post(`/v1/merchant/stores/${storeId}/menu/import-text`).set(auth(merchant)).send({ text }).expect(201);
    expect(ai.body).toEqual({ source: 'AI', items: [{ section: 'Món chính', name: 'Cơm tấm sườn', price: 35_000 }] });
    const call = fakeAiCalls.find((c) => c.path === '/openai/v1/chat/completions');
    expect(call?.body.model).toBe('model-nhanh');
    // Số điện thoại bị che trước khi gửi ra ngoài.
    expect(JSON.stringify(call?.body.messages)).not.toContain('0901234567');
  });

  it('key sai: AI lỗi thì tự quay về bộ đọc theo quy tắc, app vẫn chạy', async () => {
    await t.http().put('/v1/admin/ai/providers/groq').set(auth(admin)).send({ apiKey: 'gsk_wrong_key_0000' }).expect(200);
    const res = await t.http().post(`/v1/merchant/stores/${storeId}/menu/import-text`).set(auth(merchant)).send({ text: 'Bánh mì 20k' }).expect(201);
    expect(res.body).toEqual({ source: 'RULES', items: [{ section: null, name: 'Bánh mì', price: 20_000 }] });
    const check = await t.http().post('/v1/admin/ai/providers/groq/test').set(auth(admin)).expect(200);
    expect(check.body.ok).toBe(false);
  });
});

describe('Admin Console: tổng quan, đơn có vấn đề, duyệt hồ sơ (Phần 14)', () => {
  it('tổng quan đếm đơn đang chạy và đơn có vấn đề; hàng đợi chỉ ra lý do', async () => {
    const o = (await order({ paymentMethod: 'VIETQR' }).expect(201)).body;
    await t.http().post(`/v1/webhooks/payments/dev/${o.id}/paid`).expect(200);
    await t.pool.query(`UPDATE orders SET created_at = now() - interval '3 minutes' WHERE id = $1`, [o.id]);
    const dash = await t.http().get('/v1/admin/dashboard').set(auth(admin)).expect(200);
    expect(dash.body.activeOrders.CHO_QUAN_XAC_NHAN).toBeGreaterThanOrEqual(1);
    expect(dash.body.problemOrders).toBeGreaterThanOrEqual(1);
    const queue = await t.http().get('/v1/admin/orders').query({ problem: 'true' }).set(auth(admin)).expect(200);
    const row = queue.body.orders.find((r: any) => r.id === o.id);
    expect(row).toMatchObject({ problem: 'MERCHANT_SILENT', customerPhone: '092****222' });
    const detail = await t.http().get(`/v1/admin/orders/${o.id}`).set(auth(admin)).expect(200);
    expect(detail.body.timeline[0].event).toBe('ORDER_PLACED');
    await t.http().get('/v1/admin/dashboard').set(auth(customer.token)).expect(403);
  });

  it('hồ sơ chờ duyệt; từ chối có lý do, ghi nhật ký và báo đối tác', async () => {
    const owner = await t.login('0988888888');
    const s = await t
      .http()
      .post('/v1/merchant/stores')
      .set(auth(owner.token))
      .send({ name: 'Quán Mới', category: 'DRINK', ...STORE_AT, address: '9 Hàm Nghi, Quận 1', phone: '0988888888' })
      .expect(201);
    const pending = await t.http().get('/v1/admin/partners/pending').set(auth(admin)).expect(200);
    expect(pending.body.stores.map((x: any) => x.id)).toContain(s.body.id);
    await t.http().post(`/v1/admin/stores/${s.body.id}/reject`).set(auth(admin)).send({ reason: 'Ảnh mặt tiền chưa rõ' }).expect(200);
    const n = await t.pool.query(`SELECT payload FROM notifications WHERE user_id = $1 AND template = 'STORE_REJECTED'`, [owner.userId]);
    expect(n.rows[0].payload.reason).toBe('Ảnh mặt tiền chưa rõ');
    const logs = await t.http().get('/v1/admin/users/audit-logs').query({ targetType: 'store' }).set(auth(admin)).expect(200);
    expect(logs.body.logs[0]).toMatchObject({ action: 'STORE_REJECTED', reason: 'Ảnh mặt tiền chưa rõ' });
  });
});
