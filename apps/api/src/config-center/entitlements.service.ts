import { Inject, Injectable } from '@nestjs/common';
import { TrustTier } from '@sqt/domain';
import { BusinessError } from '../common/errors';
import { DATABASE, Database, Queryable } from '../database/database';
import { audit } from './config.service';

export type EntitlementSubject = 'CUSTOMER' | 'STORE' | 'RIDER';

export interface EntitlementDefinition {
  key: string;
  subject: EntitlementSubject;
  type: 'BOOL' | 'INT' | 'MONEY';
  description: string;
  default: boolean | number | null;
  min?: number;
  max?: number;
}

/** Chức năng Admin bật/tắt/giới hạn cho từng người dùng — Phần 15.2 (mức MVP). */
export const ENTITLEMENTS: EntitlementDefinition[] = [
  { key: 'customer.cod.enabled', subject: 'CUSTOMER', type: 'BOOL', default: true, description: 'Được thanh toán tiền mặt' },
  { key: 'customer.cod.max_value', subject: 'CUSTOMER', type: 'MONEY', default: 2_000_000, min: 0, max: 10_000_000, description: 'Giá trị đơn COD tối đa' },
  { key: 'customer.scheduled.enabled', subject: 'CUSTOMER', type: 'BOOL', default: true, description: 'Được đặt đơn hẹn giờ' },
  { key: 'store.scheduled.enabled', subject: 'STORE', type: 'BOOL', default: true, description: 'Nhận đơn hẹn giờ' },
  { key: 'rider.cod.enabled', subject: 'RIDER', type: 'BOOL', default: true, description: 'Nhận đơn COD' },
  {
    key: 'rider.scheduled_claims.max',
    subject: 'RIDER',
    type: 'INT',
    default: null, // theo cấp uy tín (Phần 10.5)
    min: 0,
    max: 8,
    description: 'Số chuyến hẹn được giữ cùng lúc (mặc định theo cấp)',
  },
];
const BY_KEY = new Map(ENTITLEMENTS.map((e) => [e.key, e]));

export const REASON_CODES = [
  'QUALITY_ISSUE',
  'FRAUD_SUSPECTED',
  'COD_REFUSED',
  'STRATEGIC_PARTNER',
  'CAMPAIGN',
  'FIELD_INSPECTION',
  'APPEAL_ACCEPTED',
  'OTHER',
] as const;

const MAX_DAYS = 90;
const TIERS = Object.values(TrustTier) as string[];

/**
 * Quyền chức năng hiệu lực = mặc định ← điều chỉnh riêng còn hạn (Phần 15.1). Mọi điều chỉnh có lý do,
 * thời hạn tối đa 90 ngày và ghi nhật ký; người bị ảnh hưởng được thông báo.
 */
@Injectable()
export class EntitlementService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  definitions() {
    return ENTITLEMENTS;
  }

  async effective(q: Queryable, subject: EntitlementSubject, id: number | string): Promise<Record<string, boolean | number | null>> {
    const result: Record<string, boolean | number | null> = {};
    for (const e of ENTITLEMENTS) if (e.subject === subject) result[e.key] = e.default;
    const { rows } = await q.query(
      `SELECT DISTINCT ON (key) key, value FROM user_entitlements
       WHERE subject_type = $1 AND subject_id = $2 AND status = 'ACTIVE' AND effective_to > now()
       ORDER BY key, created_at DESC`,
      [subject, id],
    );
    for (const r of rows) result[r.key] = r.value;
    return result;
  }

  async get<T extends boolean | number | null>(q: Queryable, subject: EntitlementSubject, id: number | string, key: string): Promise<T> {
    return (await this.effective(q, subject, id))[key] as T;
  }

  private validate(subject: EntitlementSubject, reasonCode: string, days: number) {
    if (!(REASON_CODES as readonly string[]).includes(reasonCode)) throw new BusinessError('REASON_REQUIRED', 'Cần chọn lý do hợp lệ', 400);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new BusinessError('DURATION_INVALID', `Thời hạn 1–${MAX_DAYS} ngày`, 400);
    if (!['CUSTOMER', 'STORE', 'RIDER'].includes(subject)) throw new BusinessError('SUBJECT_INVALID', 'Đối tượng không hợp lệ', 400);
  }

  private async notify(client: Queryable, subject: EntitlementSubject, id: number, template: string, payload: object) {
    const userIds =
      subject === 'STORE'
        ? (await client.query(`SELECT user_id FROM user_roles WHERE role = 'MERCHANT_OWNER' AND scope_id = $1`, [id])).rows.map((r) => r.user_id)
        : [id];
    for (const u of userIds) {
      await client.query(`INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1, 'PUSH', $2, $3)`, [u, template, JSON.stringify(payload)]);
    }
  }

  async set(adminId: number, input: { subject: EntitlementSubject; subjectId: number; key: string; value: unknown; reasonCode: string; note?: string; days: number }) {
    const def = BY_KEY.get(input.key);
    if (!def || def.subject !== input.subject) throw new BusinessError('ENTITLEMENT_UNKNOWN', 'Quyền chức năng không tồn tại cho đối tượng này', 404);
    this.validate(input.subject, input.reasonCode, input.days);
    const v = input.value;
    if (def.type === 'BOOL' && typeof v !== 'boolean') throw new BusinessError('ENTITLEMENT_INVALID', 'Giá trị phải là true/false');
    if (def.type !== 'BOOL') {
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new BusinessError('ENTITLEMENT_INVALID', 'Giá trị phải là số nguyên');
      if ((def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max)) {
        throw new BusinessError('ENTITLEMENT_OUT_OF_RANGE', `Giá trị trong khoảng ${def.min}–${def.max}`);
      }
    }
    return this.db.tx(async (client) => {
      const before = await this.effective(client, input.subject, input.subjectId);
      const { rows } = await client.query(
        `INSERT INTO user_entitlements (subject_type, subject_id, key, value, reason_code, note, effective_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7), $8) RETURNING id, effective_to`,
        [input.subject, input.subjectId, input.key, JSON.stringify(v), input.reasonCode, input.note ?? null, input.days, adminId],
      );
      await audit(client, adminId, 'ENTITLEMENT_SET', input.subject, String(input.subjectId), { [input.key]: before[input.key] }, { [input.key]: v }, input.reasonCode);
      await this.notify(client, input.subject, input.subjectId, 'ENTITLEMENT_CHANGED', { key: input.key, value: v, reasonCode: input.reasonCode, until: rows[0].effective_to });
      return { id: Number(rows[0].id), key: input.key, value: v, effectiveTo: rows[0].effective_to };
    });
  }

  async revoke(adminId: number, entitlementId: number, reason: string) {
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `UPDATE user_entitlements SET status = 'REVOKED' WHERE id = $1 AND status = 'ACTIVE' RETURNING subject_type, subject_id, key, value`,
        [entitlementId],
      );
      if (!rows[0]) throw new BusinessError('ENTITLEMENT_NOT_FOUND', 'Không tìm thấy điều chỉnh đang hiệu lực', 404);
      await audit(client, adminId, 'ENTITLEMENT_REVOKE', rows[0].subject_type, String(rows[0].subject_id), rows[0], null, reason);
      return { id: entitlementId, revoked: true };
    });
  }

  /** Nâng/hạ hoặc khoá cấp uy tín có thời hạn (Phần 15.4). */
  async overrideTier(adminId: number, input: { subject: 'STORE' | 'RIDER'; subjectId: number; action: 'SET_TIER' | 'LOCK'; tier?: string; reasonCode: string; note?: string; days: number }) {
    this.validate(input.subject, input.reasonCode, input.days);
    if (input.action === 'SET_TIER' && (!input.tier || !TIERS.includes(input.tier))) throw new BusinessError('TIER_INVALID', 'Cấp không hợp lệ', 400);
    return this.db.tx(async (client) => {
      const current = (await client.query('SELECT tier FROM trust_scores WHERE subject_type = $1 AND subject_id = $2', [input.subject, input.subjectId])).rows[0];
      await client.query(
        `UPDATE tier_overrides SET status = 'REVOKED' WHERE subject_type = $1 AND subject_id = $2 AND status = 'ACTIVE'`,
        [input.subject, input.subjectId],
      );
      const tier = input.action === 'LOCK' ? (current?.tier ?? TrustTier.ROOKIE) : input.tier;
      const { rows } = await client.query(
        `INSERT INTO tier_overrides (subject_type, subject_id, action, tier, reason_code, note, effective_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7), $8) RETURNING id, effective_to`,
        [input.subject, input.subjectId, input.action, tier, input.reasonCode, input.note ?? null, input.days, adminId],
      );
      await audit(client, adminId, `TIER_${input.action}`, input.subject, String(input.subjectId), current ?? null, { tier }, input.reasonCode);
      await this.notify(client, input.subject, input.subjectId, 'TIER_ADJUSTED', { tier, action: input.action, reasonCode: input.reasonCode, until: rows[0].effective_to });
      return { id: Number(rows[0].id), tier, action: input.action, effectiveTo: rows[0].effective_to };
    });
  }
}
