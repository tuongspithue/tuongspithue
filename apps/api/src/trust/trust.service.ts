import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ROOKIE_DEFAULT_SCORE,
  TrustTier,
  bayesianStars,
  confirmSpeedScore,
  decayedRate,
  starsToScore,
  tierFor,
  weightedScore,
} from '@sqt/domain';
import { PoolClient } from 'pg';
import { BusinessError } from '../common/errors';
import { DATABASE, Database, Queryable } from '../database/database';
import { JobsService } from '../orders/jobs';

export type TrustSubject = 'STORE' | 'RIDER';

export interface TrustView {
  score: number;
  tier: TrustTier;
  completed: number;
  stars: number | null;
  reviewCount: number;
  components: Record<string, number | null>;
}

const DEFAULT_PRIOR_STARS = 4.5;
const LOOKBACK = "interval '90 days'";

/** Điểm uy tín v1 (Phần 11): tính lại sau mỗi đơn kết thúc / đánh giá / sự cố của đối tác. */
@Injectable()
export class TrustService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('TRUST_RECOMPUTE', async (job, client) => {
      await this.recompute(client, job.payload.subjectType, Number(job.payload.subjectId));
    });
  }

  /** Xếp việc tính lại (gộp nếu đã có việc đang chờ cho cùng đối tác). */
  async enqueue(client: PoolClient, subjectType: TrustSubject, subjectId: number | string) {
    await client.query(
      `INSERT INTO scheduled_jobs (kind, payload, run_at)
       SELECT 'TRUST_RECOMPUTE', $1::jsonb, now()
       WHERE NOT EXISTS (SELECT 1 FROM scheduled_jobs WHERE kind = 'TRUST_RECOMPUTE' AND status = 'PENDING' AND payload = $1::jsonb)`,
      [JSON.stringify({ subjectType, subjectId: String(subjectId) })],
    );
  }

  /** Mức sao chung của nền tảng — bản thân cũng được làm mượt về 4,5★ khi còn ít đánh giá. */
  private async priorStars(q: Queryable, type: TrustSubject): Promise<number> {
    const { rows } = await q.query<{ sum: string | null; n: number }>(
      'SELECT sum(stars) AS sum, count(*)::int AS n FROM reviews WHERE target_type = $1',
      [type],
    );
    return bayesianStars(Number(rows[0].sum ?? 0), rows[0].n, DEFAULT_PRIOR_STARS);
  }

  private async rating(q: Queryable, type: TrustSubject, id: number) {
    const { rows } = await q.query<{ sum: string | null; n: number }>(
      'SELECT sum(stars) AS sum, count(*)::int AS n FROM reviews WHERE target_type = $1 AND target_id = $2',
      [type, id],
    );
    const n = rows[0].n;
    if (n === 0) return { stars: null, n, score: null };
    const stars = bayesianStars(Number(rows[0].sum), n, await this.priorStars(q, type));
    return { stars, n, score: starsToScore(stars) };
  }

  async recompute(client: PoolClient, type: TrustSubject, id: number): Promise<TrustView> {
    const view = type === 'STORE' ? await this.computeStore(client, id) : await this.computeRider(client, id);
    await client.query(
      `INSERT INTO trust_scores (subject_type, subject_id, score, tier, components, completed, stars, review_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (subject_type, subject_id) DO UPDATE SET score = EXCLUDED.score, tier = EXCLUDED.tier,
         components = EXCLUDED.components, completed = EXCLUDED.completed, stars = EXCLUDED.stars,
         review_count = EXCLUDED.review_count, updated_at = now()`,
      [type, id, view.score, view.tier, JSON.stringify(view.components), view.completed, view.stars, view.reviewCount],
    );
    return view;
  }

  /** Quán: tỷ lệ nhận đơn 40%, tốc độ xác nhận 20%, đánh giá món 40% (rút gọn từ 11.2). */
  private async computeStore(q: Queryable, id: number): Promise<TrustView> {
    const { rows: decisions } = await q.query<{ ok: number; age: number }>(
      `SELECT CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END AS ok, extract(epoch FROM now() - created_at) / 86400 AS age
       FROM orders WHERE store_id = $1 AND created_at > now() - ${LOOKBACK}
         AND (accepted_at IS NOT NULL OR cancelled_by_role = 'MERCHANT' OR cancel_reason = 'MERCHANT_TIMEOUT')`,
      [id],
    );
    const acceptance = decayedRate(decisions.map((d) => ({ value: d.ok ? 1 : 0, ageDays: Number(d.age) })));
    const { rows: speed } = await q.query<{ median: string | null }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM accepted_at - created_at)) AS median
       FROM (SELECT accepted_at, created_at FROM orders WHERE store_id = $1 AND accepted_at IS NOT NULL AND NOT is_scheduled
             ORDER BY accepted_at DESC LIMIT 50) recent`,
      [id],
    );
    const { rows: done } = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE store_id = $1 AND state = 'HOAN_THANH'`, [id]);
    const rating = await this.rating(q, 'STORE', id);
    const components = {
      acceptance: acceptance === null ? null : acceptance * 100,
      confirmSpeed: confirmSpeedScore(speed[0].median === null ? null : Number(speed[0].median)),
      rating: rating.score,
    };
    const score = weightedScore([
      { key: 'acceptance', weight: 40, score: components.acceptance },
      { key: 'confirmSpeed', weight: 20, score: components.confirmSpeed },
      { key: 'rating', weight: 40, score: components.rating },
    ]);
    return this.view(score, done[0].n, rating, components);
  }

  /** Shipper: hoàn thành chuyến đã nhận 40%, đánh giá của khách 40%, giữ cam kết chuyến hẹn 20%. */
  private async computeRider(q: Queryable, id: number): Promise<TrustView> {
    const { rows: trips } = await q.query<{ event: string; late: boolean | null; excused: boolean | null; age: number }>(
      `SELECT event, (payload->>'late')::boolean AS late, (payload->>'excused')::boolean AS excused, extract(epoch FROM now() - created_at) / 86400 AS age
       FROM order_events
       WHERE created_at > now() - ${LOOKBACK}
         AND ((actor_id = $1 AND event IN ('RIDER_ACCEPT', 'RIDER_CLAIM', 'RIDER_RELEASE'))
           OR (event = 'RIDER_RECONFIRM_MISSED' AND payload->>'riderId' = $1::text))`,
      [id],
    );
    // Mỗi lần nhận/giữ là một cam kết; nhả chuyến hoặc lỡ xác nhận là một lần không giữ được.
    const commitments = trips.filter((t) => t.event === 'RIDER_ACCEPT' || t.event === 'RIDER_CLAIM');
    // Nhả chuyến vì chờ món quá lâu (excused) không bị tính (Phần 2.3.4).
    const failures = trips.filter(
      (t) => t.event === 'RIDER_RECONFIRM_MISSED' || (t.event === 'RIDER_RELEASE' && t.late !== false && !t.excused),
    );
    const completion = decayedRate([
      ...commitments.map((t) => ({ value: 1 as const, ageDays: Number(t.age) })),
      ...failures.map((t) => ({ value: 0 as const, ageDays: Number(t.age) })),
    ]);
    const claims = trips.filter((t) => t.event === 'RIDER_CLAIM');
    const scheduledMisses = trips.filter((t) => t.event === 'RIDER_RECONFIRM_MISSED' || (t.event === 'RIDER_RELEASE' && t.late === true));
    const scheduledKept = claims.length === 0 ? null : Math.max(0, 1 - scheduledMisses.length / claims.length) * 100;
    const { rows: done } = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE rider_id = $1 AND state = 'HOAN_THANH'`, [id]);
    const rating = await this.rating(q, 'RIDER', id);
    const components = { completion: completion === null ? null : completion * 100, rating: rating.score, scheduledKept };
    const score = weightedScore([
      { key: 'completion', weight: 40, score: components.completion },
      { key: 'rating', weight: 40, score: components.rating },
      { key: 'scheduledKept', weight: 20, score: components.scheduledKept },
    ]);
    return this.view(score, done[0].n, rating, components);
  }

  private view(score: number, completed: number, rating: { stars: number | null; n: number }, components: Record<string, number | null>): TrustView {
    const rounded = Math.round(score * 100) / 100;
    return {
      score: rounded,
      tier: tierFor(rounded, completed),
      completed,
      stars: rating.stars === null ? null : Math.round(rating.stars * 100) / 100,
      reviewCount: rating.n,
      components,
    };
  }

  async get(q: Queryable, type: TrustSubject, id: number): Promise<TrustView> {
    const { rows } = await q.query('SELECT * FROM trust_scores WHERE subject_type = $1 AND subject_id = $2', [type, id]);
    const r = rows[0];
    if (!r) return { score: ROOKIE_DEFAULT_SCORE, tier: TrustTier.ROOKIE, completed: 0, stars: null, reviewCount: 0, components: {} };
    return {
      score: Number(r.score),
      tier: r.tier,
      completed: r.completed,
      stars: r.stars === null ? null : Number(r.stars),
      reviewCount: r.review_count,
      components: r.components,
    };
  }

  /** Đánh giá tách riêng quán và shipper sau khi giao xong (Phần 2.1.7). */
  async review(
    customerId: number,
    orderId: number,
    input: { store?: { stars: number; tags?: string[]; comment?: string }; rider?: { stars: number; tags?: string[]; comment?: string } },
  ) {
    return this.db.tx(async (client) => {
      const order = (await client.query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0];
      if (!order || Number(order.customer_id) !== customerId) throw new BusinessError('ORDER_NOT_FOUND', 'Không tìm thấy đơn', 404);
      if (order.state !== 'HOAN_THANH') throw new BusinessError('ORDER_NOT_COMPLETED', 'Chỉ đánh giá được đơn đã giao xong', 409);
      if (input.rider && !order.rider_id) throw new BusinessError('NO_RIDER', 'Đơn này không có shipper để đánh giá');
      const targets: Array<[TrustSubject, number, NonNullable<typeof input.store>]> = [];
      if (input.store) targets.push(['STORE', Number(order.store_id), input.store]);
      if (input.rider) targets.push(['RIDER', Number(order.rider_id), input.rider]);
      if (targets.length === 0) throw new BusinessError('EMPTY_REVIEW', 'Hãy chấm ít nhất quán hoặc shipper', 400);
      for (const [type, id, r] of targets) {
        const { rowCount } = await client.query(
          `INSERT INTO reviews (order_id, author_id, target_type, target_id, stars, tags, comment)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (order_id, target_type) DO NOTHING`,
          [orderId, customerId, type, id, r.stars, r.tags ?? [], r.comment ?? null],
        );
        if (!rowCount) throw new BusinessError('ALREADY_REVIEWED', 'Bạn đã đánh giá đơn này', 409);
        await this.enqueue(client, type, id);
      }
      return { reviewed: targets.map(([type]) => type) };
    });
  }
}
