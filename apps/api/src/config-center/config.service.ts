import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BusinessError } from '../common/errors';
import { DATABASE, Database, Queryable } from '../database/database';
import { ConfigScope, DEFINITIONS_BY_KEY, CONFIG_DEFINITIONS, validateConfigValue } from './registry';

export interface ConfigContext {
  storeId?: number | string | null;
  category?: string | null;
}

interface ActiveValue {
  key: string;
  scope_type: ConfigScope;
  scope_id: string;
  value: unknown;
  version: number;
}

const REFRESH_MS = 30_000;

/**
 * Cấu hình phân tầng (Phần 14.6.1): giá trị ở tầng cụ thể nhất thắng — quán → ngành → toàn hệ thống → mặc định.
 * Đọc từ bộ nhớ đệm làm mới mỗi 30 giây và ngay sau khi Admin lưu; CSDL lỗi thì dùng bản đệm cuối cùng.
 */
@Injectable()
export class ConfigCenter implements OnModuleInit {
  private readonly logger = new Logger('ConfigCenter');
  private active = new Map<string, ActiveValue>();
  private loadedAt = 0;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onModuleInit() {
    await this.reload();
  }

  private cacheKey(key: string, scope: ConfigScope, scopeId: string) {
    return `${key}|${scope}|${scopeId}`;
  }

  async reload(q: Queryable = this.db) {
    try {
      const { rows } = await q.query<ActiveValue>(`SELECT key, scope_type, scope_id, value, version FROM config_values WHERE status = 'ACTIVE'`);
      this.active = new Map(rows.map((r) => [this.cacheKey(r.key, r.scope_type, r.scope_id), r]));
      this.loadedAt = Date.now();
    } catch (err) {
      this.logger.warn(`Không tải được cấu hình, dùng bản đệm cũ: ${(err as Error).message}`);
    }
  }

  private maybeRefresh() {
    if (Date.now() - this.loadedAt > REFRESH_MS) void this.reload();
  }

  /** Giá trị hiệu lực kèm tầng đang quyết định (để hiển thị "Giá trị đang áp dụng cho…"). */
  resolve<T = unknown>(key: string, ctx: ConfigContext = {}): { value: T; source: ConfigScope | 'DEFAULT'; version: number | null } {
    const def = DEFINITIONS_BY_KEY.get(key);
    if (!def) throw new Error(`Tham số cấu hình chưa khai báo: ${key}`);
    this.maybeRefresh();
    const candidates: Array<[ConfigScope, string]> = [];
    if (ctx.storeId != null) candidates.push(['STORE', String(ctx.storeId)]);
    if (ctx.category) candidates.push(['CATEGORY', ctx.category]);
    candidates.push(['GLOBAL', '']);
    for (const [scope, id] of candidates) {
      if (!def.scopes.includes(scope)) continue;
      const hit = this.active.get(this.cacheKey(key, scope, id));
      if (hit) return { value: hit.value as T, source: scope, version: hit.version };
    }
    return { value: def.default as T, source: 'DEFAULT', version: null };
  }

  get<T = unknown>(key: string, ctx: ConfigContext = {}): T {
    return this.resolve<T>(key, ctx).value;
  }

  // ---------------- Admin ----------------

  list() {
    return CONFIG_DEFINITIONS.map((d) => ({
      key: d.key,
      module: d.module,
      description: d.description,
      type: d.type,
      default: d.default,
      min: d.min,
      max: d.max,
      scopes: d.scopes,
      invariant: Boolean(d.invariant),
      effective: this.resolve(d.key),
      overrides: [...this.active.values()].filter((v) => v.key === d.key).map((v) => ({ scope: v.scope_type, scopeId: v.scope_id, value: v.value, version: v.version })),
    }));
  }

  async set(adminId: number, key: string, scope: ConfigScope, scopeId: string, value: unknown, reason: string) {
    const def = DEFINITIONS_BY_KEY.get(key);
    if (!def) throw new BusinessError('CONFIG_UNKNOWN', 'Tham số không tồn tại', 404);
    if (!def.scopes.includes(scope)) throw new BusinessError('CONFIG_SCOPE_NOT_ALLOWED', `Tham số này không ghi đè được ở tầng ${scope}`);
    const error = validateConfigValue(def, value);
    if (error) throw new BusinessError(def.invariant ? 'CONFIG_INVARIANT' : 'CONFIG_INVALID', error, def.invariant ? 403 : 422);
    const id = scope === 'GLOBAL' ? '' : scopeId;
    if (scope !== 'GLOBAL' && !id) throw new BusinessError('CONFIG_SCOPE_ID_REQUIRED', 'Cần chọn ngành hoặc quán áp dụng', 400);

    const result = await this.db.tx(async (client) => {
      const prev = await client.query(
        `UPDATE config_values SET status = 'SUPERSEDED' WHERE key = $1 AND scope_type = $2 AND scope_id = $3 AND status = 'ACTIVE' RETURNING value`,
        [key, scope, id],
      );
      const { rows } = await client.query<{ next: number }>(
        'SELECT COALESCE(max(version), 0) + 1 AS next FROM config_values WHERE key = $1 AND scope_type = $2 AND scope_id = $3',
        [key, scope, id],
      );
      const version = rows[0].next;
      await client.query(
        `INSERT INTO config_values (key, scope_type, scope_id, value, version, status, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)`,
        [key, scope, id, JSON.stringify(value), version, reason, adminId],
      );
      await audit(client, adminId, 'CONFIG_SET', 'config', `${key}@${scope}:${id}`, prev.rows[0]?.value ?? null, value, reason);
      return { key, scope, scopeId: id, value, version };
    });
    await this.reload();
    return result;
  }

  /** Hoàn tác về một phiên bản cũ (tạo phiên bản mới mang giá trị cũ, giữ nguyên lịch sử). */
  async rollback(adminId: number, key: string, scope: ConfigScope, scopeId: string, version: number, reason: string) {
    const { rows } = await this.db.query(
      'SELECT value FROM config_values WHERE key = $1 AND scope_type = $2 AND scope_id = $3 AND version = $4',
      [key, scope, scope === 'GLOBAL' ? '' : scopeId, version],
    );
    if (!rows[0]) throw new BusinessError('CONFIG_VERSION_NOT_FOUND', 'Không tìm thấy phiên bản', 404);
    return this.set(adminId, key, scope, scopeId, rows[0].value, `Hoàn tác về v${version}: ${reason}`);
  }

  /** Xoá ghi đè ở một tầng → quay về tầng trên. */
  async clear(adminId: number, key: string, scope: ConfigScope, scopeId: string, reason: string) {
    const id = scope === 'GLOBAL' ? '' : scopeId;
    await this.db.tx(async (client) => {
      const prev = await client.query(
        `UPDATE config_values SET status = 'ROLLED_BACK' WHERE key = $1 AND scope_type = $2 AND scope_id = $3 AND status = 'ACTIVE' RETURNING value`,
        [key, scope, id],
      );
      if (!prev.rowCount) throw new BusinessError('CONFIG_NO_OVERRIDE', 'Tầng này chưa có ghi đè', 404);
      await audit(client, adminId, 'CONFIG_CLEAR', 'config', `${key}@${scope}:${id}`, prev.rows[0].value, null, reason);
    });
    await this.reload();
    return { key, scope, scopeId: id, cleared: true };
  }

  async history(key: string) {
    const { rows } = await this.db.query(
      `SELECT c.scope_type, c.scope_id, c.value, c.version, c.status, c.reason, c.created_at, u.phone AS by_phone
       FROM config_values c JOIN users u ON u.id = c.created_by WHERE c.key = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT 100`,
      [key],
    );
    return { key, history: rows };
  }
}

/** Nhật ký thao tác nội bộ bất biến (Phần 14.9). */
export async function audit(
  q: Queryable,
  actorId: number,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  reason: string | null,
) {
  await q.query(
    `INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId, action, targetType, targetId, JSON.stringify(before), JSON.stringify(after), reason],
  );
}
