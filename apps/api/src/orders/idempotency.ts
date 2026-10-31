import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, Database } from '../database/database';

/**
 * Lưu kết quả theo (người dùng, route, Idempotency-Key). Gửi lại cùng key trả về đúng kết quả cũ thay vì
 * tạo bản ghi mới. Lỗi không được lưu nên người dùng có thể thử lại.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(userId: number, route: string, key: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `${userId}:${route}:${key}`;
    const client = await this.db.pool.connect();
    try {
      // Khoá theo key để hai yêu cầu trùng gửi đồng thời không cùng chạy fn.
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
      const saved = await client.query('SELECT response FROM idempotency_keys WHERE user_id = $1 AND route = $2 AND key = $3', [
        userId,
        route,
        key,
      ]);
      if (saved.rows[0]) return saved.rows[0].response as T;
      const result = await fn();
      await client.query(
        'INSERT INTO idempotency_keys (key, user_id, route, status_code, response) VALUES ($1, $2, $3, 201, $4)',
        [key, userId, route, JSON.stringify(result)],
      );
      return result;
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => undefined);
      client.release();
    }
  }
}
