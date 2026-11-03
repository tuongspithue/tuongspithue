import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown, Post } from '@nestjs/common';
import { IsIn, IsObject, IsString, MaxLength } from 'class-validator';
import webpush from 'web-push';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { BusinessError } from '../common/errors';
import { DATABASE, Database } from '../database/database';

class SubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
  @IsObject() keys!: { p256dh: string; auth: string };
  @IsIn(['CUSTOMER', 'MERCHANT', 'RIDER', 'ADMIN']) app!: string;
}

class UnsubscribeDto {
  @IsString() endpoint!: string;
}

/** Nội dung thông báo theo mẫu — tiếng Việt, ngắn gọn (Phần 3.7). */
const TEMPLATES: Record<string, (p: any) => { title: string; body: string }> = {
  NEW_ORDER: () => ({ title: '🔔 Đơn mới!', body: 'Mở app để nhận đơn ngay' }),
  NEW_ORDER_REMINDER: (p) => ({ title: '🔔 Đơn đang chờ bạn nhận', body: `Đơn ${p.code} đang chờ — bấm nhận để khách khỏi đợi` }),
  NO_RIDER_YET: (p) => ({ title: 'Chưa có shipper nhận đơn', body: `Đơn ${p.code}: đang mời shipper thêm một lượt` }),
  PROXY_STARTED: () => ({ title: '🛒 Quán chưa phản hồi', body: 'Đang tìm shipper tới quán mua giúp bạn' }),
  NO_RIDER_RETRYING: () => ({ title: 'Chưa có shipper nhận', body: 'Đang gọi lại quán và mời shipper thêm một lượt' }),
  ORDER_CANCELLED_NO_RIDER: () => ({ title: 'Rất tiếc, chưa giao được đơn', body: 'Không có shipper nhận đơn lúc này. Đơn đã huỷ và hoàn tiền' }),
  NEW_SCHEDULED_ORDER: () => ({ title: '🟣 Đơn hẹn mới', body: 'Có khách đặt hẹn giờ, mở app để nhận' }),
  START_PREP_NOW: () => ({ title: '🍳 Tới giờ làm đơn hẹn', body: 'Bắt đầu chuẩn bị để kịp giờ lấy hàng' }),
  RECONFIRM_SCHEDULED: () => ({ title: '🟣 Xác nhận lại đơn hẹn', body: 'Bấm "Vẫn làm" để khách yên tâm' }),
  ORDER_CANCELLED: () => ({ title: 'Đơn đã huỷ', body: 'Khách đã huỷ một đơn' }),
  PREP_READY: () => ({ title: '🍜 Món đã xong', body: 'Tới lấy hàng nhé' }),
  RIDER_OFFER: () => ({ title: '🛵 Có chuyến mới', body: 'Mở app để nhận chuyến' }),
  SCHEDULED_TRIP_START: () => ({ title: '🟣 Tới giờ chuyến hẹn', body: 'Di chuyển tới quán lấy hàng' }),
  MERCHANT_ACCEPTED: () => ({ title: '✅ Quán đã nhận đơn', body: 'Đang chuẩn bị món cho bạn' }),
  MERCHANT_REJECTED: (p) => ({ title: 'Quán không nhận được đơn', body: p.reason ?? 'Bạn được hoàn tiền toàn bộ' }),
  MERCHANT_PROPOSED_TIME: () => ({ title: '🟣 Quán đề xuất giờ khác', body: 'Mở app để đồng ý hoặc huỷ' }),
  SUGGEST_SCHEDULE: () => ({ title: 'Quán đang đông', body: 'Bạn có muốn chuyển sang hẹn giờ không?' }),
  ORDER_CANCELLED_MERCHANT_SILENT: () => ({ title: 'Quán chưa phản hồi', body: 'Đơn đã huỷ và hoàn tiền. Thử quán khác nhé' }),
  RIDER_ASSIGNED: () => ({ title: '🛵 Đã có shipper', body: 'Shipper đang tới quán lấy hàng' }),
  SCHEDULED_RIDER_CLAIMED: () => ({ title: '🟣 Đã có shipper giữ chuyến', body: 'Đơn hẹn của bạn đã có người giao' }),
  ON_THE_WAY: () => ({ title: '🛵 Đang giao', body: 'Shipper đã lấy hàng' }),
  RIDER_ARRIVED: () => ({ title: '📍 Shipper đã tới', body: 'Bạn ra nhận hàng nhé' }),
  RIDER_CHANGED: () => ({ title: 'Đang đổi shipper', body: 'Đơn của bạn vẫn được ưu tiên' }),
  DELIVERED_RATE_US: () => ({ title: '✅ Đã giao', body: 'Chúc ngon miệng! Đánh giá giúp quán nhé' }),
  ENTITLEMENT_CHANGED: () => ({ title: 'Quyền sử dụng thay đổi', body: 'Mở app để xem chi tiết' }),
  TIER_ADJUSTED: (p) => ({ title: 'Cấp uy tín được điều chỉnh', body: `Cấp ${p.tier} có thời hạn` }),
  STORE_APPROVED: () => ({ title: '🎉 Quán đã được duyệt', body: 'Bạn có thể mở cửa nhận đơn' }),
  STORE_REJECTED: (p) => ({ title: 'Hồ sơ quán cần bổ sung', body: p.reason ?? '' }),
  RIDER_APPROVED: () => ({ title: '🎉 Hồ sơ shipper đã duyệt', body: 'Bật trực tuyến để nhận chuyến' }),
  RIDER_REJECTED: (p) => ({ title: 'Hồ sơ shipper cần bổ sung', body: p.reason ?? '' }),
};

/** Mở đúng màn hình khi bấm thông báo. */
const urlFor = (p: any) => (p?.orderId ? `/?order=${p.orderId}` : '/');

/**
 * Gửi thông báo đẩy qua trình duyệt (Web Push/VAPID) — không mất phí theo tin.
 * Worker đọc hàng chờ `notifications`; thông báo cho Ops (user_id rỗng) hiện trên Admin Console.
 */
@Injectable()
export class PushService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Push');
  private timer?: NodeJS.Timeout;
  private running = false;
  readonly publicKey: string | null;

  constructor(@Inject(DATABASE) private readonly db: Database) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv);
      this.publicKey = pub;
    } else {
      this.publicKey = null;
      this.logger.warn('Chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — thông báo đẩy tắt (pnpm --filter @sqt/api vapid để tạo khoá)');
    }
  }

  async subscribe(userId: number, dto: SubscribeDto, userAgent?: string) {
    if (!dto.keys?.p256dh || !dto.keys?.auth) throw new BusinessError('PUSH_KEYS_MISSING', 'Thiếu khoá đăng ký thông báo', 400);
    await this.db.query(
      `INSERT INTO push_subscriptions (user_id, app, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, app = EXCLUDED.app, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [userId, dto.app, dto.endpoint, dto.keys.p256dh, dto.keys.auth, userAgent?.slice(0, 300) ?? null],
    );
    return { subscribed: true };
  }

  async unsubscribe(userId: number, endpoint: string) {
    await this.db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
    return { unsubscribed: true };
  }

  /** Gửi các thông báo đang chờ. Trả về số thông báo đã xử lý. */
  async flush(limit = 100): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE notifications SET status = 'SENDING' WHERE id IN (
         SELECT id FROM notifications WHERE status = 'QUEUED' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING id, user_id, template, payload`,
      [limit],
    );
    for (const n of rows) {
      let status = 'SENT';
      let result = '';
      if (!n.user_id) {
        status = 'OPS_INBOX'; // hiện trong mục "Việc cần làm" của Admin Console
      } else if (!this.publicKey) {
        status = 'PUSH_DISABLED';
      } else {
        const subs = (await this.db.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [n.user_id])).rows;
        if (subs.length === 0) status = 'NO_SUBSCRIPTION';
        const content = (TEMPLATES[n.template] ?? (() => ({ title: 'Ship Quanh Tôi', body: 'Bạn có cập nhật mới' })))(n.payload);
        const payload = JSON.stringify({ ...content, url: urlFor(n.payload), tag: n.payload?.orderId ? `order-${n.payload.orderId}` : n.template });
        let ok = 0;
        for (const s of subs) {
          try {
            // Đơn mới/lời mời chuyến: ưu tiên cao, hết hạn nhanh vì để lâu không còn ý nghĩa.
            const urgent = ['NEW_ORDER', 'NEW_ORDER_REMINDER', 'RIDER_OFFER'].includes(n.template);
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: urgent ? 180 : 3600,
              urgency: urgent ? 'high' : 'normal',
            });
            ok++;
            await this.db.query('UPDATE push_subscriptions SET last_ok_at = now() WHERE id = $1', [s.id]);
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await this.db.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
            }
            result += `${err?.statusCode ?? 'ERR'};`;
          }
        }
        if (subs.length > 0 && ok === 0) status = 'FAILED';
      }
      await this.db.query('UPDATE notifications SET status = $2, sent_at = now(), result = $3 WHERE id = $1', [n.id, status, result || null]);
    }
    return rows.length;
  }

  onApplicationBootstrap() {
    if (process.env.JOBS_WORKER === 'off') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.flush()
        .catch((err) => this.logger.error(err))
        .finally(() => (this.running = false));
    }, 2000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}

@Controller('v1/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Khoá công khai VAPID để trình duyệt đăng ký nhận thông báo. */
  @Public()
  @Get('public-key')
  key() {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.push.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }
}

@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
