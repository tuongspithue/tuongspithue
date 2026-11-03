import { Inject, Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { BusinessError } from '../common/errors';
import { audit } from '../config-center/config.service';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE, Database } from '../database/database';

export type AiTask = 'assistant_chat' | 'extract_json' | 'moderation' | 'summarize_review' | 'speech_to_text';

interface Provider {
  id: string;
  code: string;
  display_name: string;
  base_url: string;
  api_key_enc: string | null;
  key_last4: string | null;
  is_default: boolean;
  status: string;
  last_check: unknown;
}

const PHONE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/g;

/**
 * AI Gateway (Phần 12.4, 12.8): nơi duy nhất gọi nhà cung cấp AI. Key, base URL, model do Admin nhập
 * (mặc định Groq, API tương thích OpenAI). Key mã hoá AES-256-GCM, chỉ lộ 4 ký tự cuối.
 * Mọi lỗi/timeout trả null để tính năng gọi tự chuyển sang chế độ không-AI (12.5).
 */
@Injectable()
export class AiGateway {
  private readonly logger = new Logger('AiGateway');
  private readonly key: Buffer;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    const raw = process.env.AI_KEY_ENCRYPTION_KEY;
    if (!raw && process.env.NODE_ENV === 'production') throw new Error('Thiếu AI_KEY_ENCRYPTION_KEY');
    this.key = createHash('sha256').update(raw ?? `dev-ai-key:${config.jwtSecret}`).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  }

  private decrypt(enc: string): string {
    const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  // ---------------- Admin: kết nối AI ----------------

  private publicProvider(p: Provider) {
    return {
      id: Number(p.id),
      code: p.code,
      displayName: p.display_name,
      baseUrl: p.base_url,
      hasKey: Boolean(p.api_key_enc),
      keyLast4: p.key_last4,
      isDefault: p.is_default,
      status: p.status,
      lastCheck: p.last_check,
    };
  }

  async overview() {
    const providers = (await this.db.query<Provider>('SELECT * FROM ai_providers ORDER BY is_default DESC, id')).rows;
    const tasks = (await this.db.query('SELECT * FROM ai_task_configs ORDER BY task')).rows;
    return {
      providers: providers.map((p) => this.publicProvider(p)),
      tasks: tasks.map((t) => ({
        task: t.task,
        providerId: t.provider_id ? Number(t.provider_id) : null,
        model: t.model,
        params: t.params,
        fallbackProviderId: t.fallback_provider_id ? Number(t.fallback_provider_id) : null,
        fallbackModel: t.fallback_model,
        enabled: t.enabled,
      })),
    };
  }

  async upsertProvider(adminId: number, input: { code: string; displayName?: string; baseUrl?: string; apiKey?: string }) {
    if (input.baseUrl && !/^https:\/\//.test(input.baseUrl) && process.env.NODE_ENV === 'production') {
      throw new BusinessError('AI_URL_INSECURE', 'Đường dẫn kết nối phải dùng https');
    }
    return this.db.tx(async (client) => {
      const existing = (await client.query<Provider>('SELECT * FROM ai_providers WHERE code = $1 FOR UPDATE', [input.code])).rows[0];
      const enc = input.apiKey ? this.encrypt(input.apiKey) : undefined;
      const last4 = input.apiKey ? input.apiKey.slice(-4) : undefined;
      let row: Provider;
      if (existing) {
        row = (
          await client.query<Provider>(
            `UPDATE ai_providers SET display_name = COALESCE($2, display_name), base_url = COALESCE($3, base_url),
               api_key_enc = COALESCE($4, api_key_enc), key_last4 = COALESCE($5, key_last4),
               key_rotated_at = CASE WHEN $4::text IS NULL THEN key_rotated_at ELSE now() END,
               version = version + 1, updated_by = $6
             WHERE id = $1 RETURNING *`,
            [existing.id, input.displayName ?? null, input.baseUrl ?? null, enc ?? null, last4 ?? null, adminId],
          )
        ).rows[0];
      } else {
        if (!input.baseUrl || !input.displayName) throw new BusinessError('AI_PROVIDER_INCOMPLETE', 'Nhà cung cấp mới cần tên và đường dẫn kết nối', 400);
        row = (
          await client.query<Provider>(
            `INSERT INTO ai_providers (code, display_name, base_url, api_key_enc, key_last4, key_rotated_at, updated_by)
             VALUES ($1, $2, $3, $4, $5, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END, $6) RETURNING *`,
            [input.code, input.displayName, input.baseUrl, enc ?? null, last4 ?? null, adminId],
          )
        ).rows[0];
      }
      // Không bao giờ ghi nội dung key vào nhật ký.
      await audit(client, adminId, 'AI_PROVIDER_SET', 'ai_provider', input.code, null, { baseUrl: row.base_url, keyChanged: Boolean(input.apiKey) }, null);
      return this.publicProvider(row);
    });
  }

  async setTask(adminId: number, task: string, input: { providerCode?: string; model?: string; enabled?: boolean; fallbackProviderCode?: string; fallbackModel?: string }) {
    return this.db.tx(async (client) => {
      const providerId = async (code?: string) => {
        if (!code) return null;
        const p = (await client.query('SELECT id FROM ai_providers WHERE code = $1', [code])).rows[0];
        if (!p) throw new BusinessError('AI_PROVIDER_NOT_FOUND', `Không có nhà cung cấp ${code}`, 404);
        return p.id;
      };
      const { rows } = await client.query(
        `UPDATE ai_task_configs SET provider_id = COALESCE($2, provider_id), model = COALESCE($3, model), enabled = COALESCE($4, enabled),
           fallback_provider_id = COALESCE($5, fallback_provider_id), fallback_model = COALESCE($6, fallback_model),
           version = version + 1, updated_by = $7
         WHERE task = $1 RETURNING *`,
        [task, await providerId(input.providerCode), input.model ?? null, input.enabled ?? null, await providerId(input.fallbackProviderCode), input.fallbackModel ?? null, adminId],
      );
      if (!rows[0]) throw new BusinessError('AI_TASK_NOT_FOUND', 'Tác vụ AI không tồn tại', 404);
      if (rows[0].enabled && !rows[0].model) throw new BusinessError('AI_MODEL_REQUIRED', 'Cần chọn model trước khi bật tác vụ');
      await audit(client, adminId, 'AI_TASK_SET', 'ai_task', task, null, input, null);
      return { task, model: rows[0].model, enabled: rows[0].enabled };
    });
  }

  /** Kiểm tra kết nối: gọi API liệt kê model của nhà cung cấp, lưu kết quả để Admin Console hiển thị. */
  async testConnection(code: string) {
    const p = (await this.db.query<Provider>('SELECT * FROM ai_providers WHERE code = $1', [code])).rows[0];
    if (!p) throw new BusinessError('AI_PROVIDER_NOT_FOUND', 'Không có nhà cung cấp này', 404);
    if (!p.api_key_enc) throw new BusinessError('AI_KEY_MISSING', 'Chưa nhập khoá API');
    const started = Date.now();
    let check: { ok: boolean; latencyMs: number; models?: string[]; error?: string; at: string };
    try {
      const res = await fetch(`${p.base_url.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${this.decrypt(p.api_key_enc)}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      check = { ok: true, latencyMs: Date.now() - started, models: (body.data ?? []).map((m) => m.id), at: new Date().toISOString() };
    } catch (err) {
      check = { ok: false, latencyMs: Date.now() - started, error: (err as Error).message, at: new Date().toISOString() };
    }
    await this.db.query(`UPDATE ai_providers SET last_check = $2, status = $3 WHERE id = $1`, [p.id, JSON.stringify(check), check.ok ? 'ACTIVE' : 'ERROR']);
    return check;
  }

  // ---------------- Gọi AI cho tính năng ----------------

  /**
   * Gọi chat completions (chuẩn OpenAI) cho một tác vụ. Trả null nếu tác vụ tắt, thiếu key/model, lỗi hoặc quá hạn —
   * nơi gọi phải có phương án không-AI. Số điện thoại bị che trước khi gửi ra ngoài (12.6).
   */
  async chat(task: AiTask, messages: Array<{ role: 'system' | 'user'; content: string }>, opts: { json?: boolean } = {}): Promise<string | null> {
    const cfg = (await this.db.query('SELECT * FROM ai_task_configs WHERE task = $1', [task])).rows[0];
    if (!cfg?.enabled) return null;
    const attempts: Array<[string | null, string | null]> = [
      [cfg.provider_id, cfg.model],
      [cfg.fallback_provider_id, cfg.fallback_model],
    ];
    for (const [providerId, model] of attempts) {
      if (!providerId || !model) continue;
      const p = (await this.db.query<Provider>('SELECT * FROM ai_providers WHERE id = $1', [providerId])).rows[0];
      if (!p?.api_key_enc) continue;
      try {
        const res = await fetch(`${p.base_url.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.decrypt(p.api_key_enc)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ ...m, content: m.content.replace(PHONE, '[SĐT]') })),
            temperature: 0,
            max_tokens: cfg.params?.max_tokens ?? 800,
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: AbortSignal.timeout(cfg.params?.timeout_ms ?? 3000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = body.choices?.[0]?.message?.content;
        if (content) return content;
      } catch (err) {
        this.logger.warn(`AI ${task} qua ${p.code} lỗi: ${(err as Error).message}`);
      }
    }
    return null;
  }
}
