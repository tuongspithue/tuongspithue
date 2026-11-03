import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DATABASE, Database } from '../database/database';

export interface Job {
  id: string;
  kind: string;
  order_id: string | null;
  payload: Record<string, any>;
  run_at: Date;
  attempts: number;
}

export type JobHandler = (job: Job, client: PoolClient, now: Date) => Promise<void>;

const MAX_ATTEMPTS = 5;

/**
 * Hàng đợi việc hẹn giờ bền vững trên PostgreSQL (SLA Cổng A/B, hết hạn lời mời chuyến…).
 * Việc nằm trong CSDL nên không mất khi khởi động lại máy chủ; nhiều worker chạy song song an toàn nhờ
 * FOR UPDATE SKIP LOCKED. Không dùng setTimeout trong RAM (Phần 5.6).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  async schedule(client: PoolClient, kind: string, orderId: string | number | null, runAt: Date, payload = {}) {
    await client.query('INSERT INTO scheduled_jobs (kind, order_id, payload, run_at) VALUES ($1, $2, $3, $4)', [
      kind,
      orderId,
      JSON.stringify(payload),
      runAt,
    ]);
  }

  /** Chạy mọi việc đã đến hạn tính tới `now`. Trả về số việc đã xử lý. */
  async runDue(now: Date = new Date()): Promise<number> {
    let processed = 0;
    for (;;) {
      const done = await this.runOne(now);
      if (!done) return processed;
      processed++;
    }
  }

  private async runOne(now: Date): Promise<boolean> {
    let picked: Job | undefined;
    try {
      return await this.db.tx(async (client) => {
        const { rows } = await client.query<Job>(
          `SELECT * FROM scheduled_jobs WHERE status = 'PENDING' AND run_at <= $1
           ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [now],
        );
        picked = rows[0];
        if (!picked) return false;
        const handler = this.handlers.get(picked.kind);
        if (!handler) throw new Error(`Chưa đăng ký xử lý cho việc ${picked.kind}`);
        await handler(picked, client, now);
        await client.query(`UPDATE scheduled_jobs SET status = 'DONE', attempts = attempts + 1 WHERE id = $1`, [picked.id]);
        return true;
      });
    } catch (err) {
      if (!picked) throw err;
      const job = picked;
      this.logger.warn(`Việc ${job.kind}#${job.id} lỗi: ${(err as Error).message}`);
      await this.db.query(
        `UPDATE scheduled_jobs SET attempts = attempts + 1, last_error = $2,
           status = CASE WHEN attempts + 1 >= $3 THEN 'FAILED' ELSE 'PENDING' END,
           run_at = $4::timestamptz + make_interval(secs => power(2, attempts + 1))
         WHERE id = $1`,
        [job.id, (err as Error).message, MAX_ATTEMPTS, now],
      );
      return true;
    }
  }

  onApplicationBootstrap() {
    if (process.env.JOBS_WORKER === 'off') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.runDue()
        .catch((err) => this.logger.error(err))
        .finally(() => (this.running = false));
    }, 1000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
