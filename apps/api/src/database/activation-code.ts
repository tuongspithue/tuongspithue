import { Pool } from 'pg';
import { createActivationCode } from '../auth/activation';
import { loadConfig } from '../config';
import { migrate } from './migrate';

/**
 * Cấp mã kích hoạt từ máy chủ — dùng để Admin đầu tiên đăng nhập Admin Console (chưa có ai cấp mã cho mình),
 * hoặc khi Admin mất máy. Chạy: node dist/src/database/activation-code.js 0900000001 [--revoke]
 */
async function main() {
  const phone = process.argv[2];
  if (!phone || !/^0\d{9}$/.test(phone)) throw new Error('Cách dùng: activation-code <số điện thoại 10 số> [--revoke]');
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  await migrate(pool);
  const { rows } = await pool.query(
    `INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
    [phone],
  );
  const userId = Number(rows[0].id);
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'CUSTOMER') ON CONFLICT DO NOTHING`, [userId]);
  const { code, expiresAt } = await createActivationCode(pool, config.jwtSecret, userId, null, process.argv.includes('--revoke'));
  await pool.end();
  const admin = config.adminPhones.includes(phone) ? ' (số này có trong ADMIN_PHONES → được quyền Admin khi kích hoạt)' : '';
  console.log(`Mã kích hoạt cho ${phone}${admin}: ${code}\nHết hạn: ${expiresAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — dùng 1 lần.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
