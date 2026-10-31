import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

/** Chỉ dùng kênh miễn phí: thông báo đẩy (web push) và trong app. Gọi/SMS/Zalo mở app ngoài trên máy người dùng. */
export type Channel = 'PUSH';

/**
 * Hàng chờ thông báo. MVP chỉ ghi vào bảng notifications; bộ gửi web push (PushService)
 * đọc bảng này và gửi đi (Phần 3.7). Ghi trong cùng transaction với thay đổi đơn.
 */
@Injectable()
export class NotificationsService {
  async enqueue(client: PoolClient, userId: number | string | null, channel: Channel, template: string, payload: object) {
    await client.query('INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1, $2, $3, $4)', [
      userId,
      channel,
      template,
      JSON.stringify(payload),
    ]);
  }

  /** Báo cho mọi người đang làm ở quán (chủ + nhân viên). */
  async toStore(client: PoolClient, storeId: number | string, channel: Channel, template: string, payload: object) {
    const { rows } = await client.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM user_roles WHERE role IN ('MERCHANT_OWNER', 'MERCHANT_STAFF') AND scope_id = $1`,
      [storeId],
    );
    for (const r of rows) await this.enqueue(client, r.user_id, channel, template, payload);
  }
}
