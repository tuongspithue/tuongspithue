import webpush from 'web-push';
import { ADMIN_PHONE, STORE_AT, TestContext, auth, idemKey, offset, setup } from './helpers';
import { PushService } from '../src/push/push';

let t: TestContext;
let push: PushService;
let admin: string;
let merchant: string;
let customer: string;
let storeId: number;
let itemId: number;

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

beforeAll(async () => {
  t = await setup();
  push = t.app.get(PushService);
  admin = (await t.login(ADMIN_PHONE)).token;
  merchant = (await t.login('0911111111')).token;
  customer = (await t.login('0922222222')).token;
  storeId = (
    await t.http().post('/v1/merchant/stores').set(auth(merchant))
      .send({ name: 'Bún Bò Huế O Hà', category: 'FOOD', ...STORE_AT, address: '7 Lý Tự Trọng, Quận 1', phone: '0911111111' }).expect(201)
  ).body.id;
  itemId = (await t.http().post(`/v1/merchant/stores/${storeId}/menu-items`).set(auth(merchant)).send({ name: 'Bún bò', price: 50_000 }).expect(201)).body.id;
  await t.http().post(`/v1/admin/stores/${storeId}/approve`).set(auth(admin)).expect(200);
  await t.http().patch(`/v1/merchant/stores/${storeId}`).set(auth(merchant)).send({ isOpen: true }).expect(200);
});

afterAll(() => t.close());

describe('thông báo đẩy qua trình duyệt (miễn phí)', () => {
  it('trả khoá công khai VAPID; quán đăng ký nhận; đơn mới được đẩy với nội dung tiếng Việt và ưu tiên cao', async () => {
    expect((await t.http().get('/v1/push/public-key').expect(200)).body.publicKey).toBe(keys.publicKey);
    await t.http().post('/v1/push/subscribe').set(auth(merchant))
      .send({ app: 'MERCHANT', endpoint: 'https://push.example/sub-1', keys: { p256dh: 'p', auth: 'a' } }).expect(200);

    const sent: Array<{ endpoint: string; payload: any; options: any }> = [];
    const spy = jest.spyOn(webpush, 'sendNotification').mockImplementation(async (sub: any, payload: any, options: any) => {
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
      return { statusCode: 201, body: '', headers: {} };
    });

    const order = await t.http().post('/v1/orders').set(auth(customer)).set('Idempotency-Key', idemKey())
      .send({ storeId, deliveryMode: 'PLATFORM', paymentMethod: 'COD', dropoff: { ...offset(800), address: '1 Lê Lợi' }, items: [{ itemId, quantity: 1 }] }).expect(201);
    await push.flush();
    // Thông báo "Quán đã được duyệt" trong hàng chờ cũng được gửi cùng lúc.
    expect(sent.map((x) => x.payload.title)).toEqual(['🎉 Quán đã được duyệt', '🔔 Đơn mới!']);
    expect(sent[1]).toMatchObject({
      endpoint: 'https://push.example/sub-1',
      payload: { title: '🔔 Đơn mới!', url: `/?order=${order.body.id}` },
      options: { urgency: 'high' },
    });
    const statuses = (await t.pool.query(`SELECT template, status FROM notifications ORDER BY id`)).rows;
    expect(statuses).toContainEqual({ template: 'NEW_ORDER', status: 'SENT' });

    // 90 giây chưa nhận: việc gọi quán vào hộp "Việc cần làm" của Ops kèm SĐT và lời đọc đơn.
    await t.jobs.runDue(new Date(Date.now() + 95_000));
    await push.flush();
    const inbox = await t.http().get('/v1/admin/ops-inbox').set(auth(admin)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ orderId: order.body.id, storePhone: '0911111111', reason: 'MERCHANT_SILENT' });
    expect(inbox.body.items[0].script).toContain('Bún bò');
    spy.mockRestore();
  });

  it('trình duyệt đã huỷ đăng ký (410) thì xoá đăng ký; người chưa đăng ký thì ghi NO_SUBSCRIPTION', async () => {
    const spy = jest.spyOn(webpush, 'sendNotification').mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await t.pool.query(`INSERT INTO notifications (user_id, channel, template, payload)
      SELECT user_id, 'PUSH', 'PREP_READY', '{}' FROM push_subscriptions LIMIT 1`);
    await t.pool.query(`INSERT INTO notifications (user_id, channel, template, payload)
      SELECT id, 'PUSH', 'ON_THE_WAY', '{}' FROM users WHERE phone = '0922222222'`);
    await push.flush();
    expect((await t.pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(0);
    const last = (await t.pool.query(`SELECT template, status FROM notifications ORDER BY id DESC LIMIT 2`)).rows;
    expect(last).toEqual([{ template: 'ON_THE_WAY', status: 'NO_SUBSCRIPTION' }, { template: 'PREP_READY', status: 'FAILED' }]);
    spy.mockRestore();
  });
});
