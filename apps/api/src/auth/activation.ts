import { createHmac, randomInt } from 'crypto';
import { Queryable } from '../database/database';

export const CODE_TTL_SECONDS = 3 * 86_400; // đủ thời gian để đối tác cài app sau khi nhận mã

export function activationHash(secret: string, userId: number, code: string): string {
  return createHmac('sha256', secret).update(`activation:${userId}:${code}`).digest('hex');
}

/**
 * Tạo mã kích hoạt 8 số dùng 1 lần cho một người dùng (Phần 13.9). Dùng chung cho Admin Console,
 * lệnh cấp mã trên máy chủ và dữ liệu mẫu.
 */
export async function createActivationCode(q: Queryable, secret: string, userId: number, issuedBy: number | null, revokeOthers = false) {
  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  await q.query(
    `INSERT INTO activation_codes (user_id, code_hash, attempts, expires_at, issued_by)
     VALUES ($1, $2, 0, now() + make_interval(secs => $3), $4)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0,
       expires_at = EXCLUDED.expires_at, issued_by = EXCLUDED.issued_by, created_at = now()`,
    [userId, activationHash(secret, userId, code), CODE_TTL_SECONDS, issuedBy],
  );
  if (revokeOthers) await q.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [userId]);
  return { code, expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000) };
}
