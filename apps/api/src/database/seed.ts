import { Pool } from 'pg';
import { migrate } from './migrate';

/**
 * Dữ liệu mẫu để test: 3 quán đã duyệt & đang mở quanh một toạ độ, 2 shipper đã duyệt.
 * Chạy: DATABASE_URL=... SEED_LAT=10.7769 SEED_LNG=106.7009 node dist/src/database/seed.js
 * Đăng nhập bằng các số điện thoại in ra ở cuối (mã OTP hiện trên màn hình khi bật OTP_DEV_ECHO).
 */
const LAT = Number(process.env.SEED_LAT ?? 10.7769);
const LNG = Number(process.env.SEED_LNG ?? 106.7009);
const m = (meters: number) => meters / 111_320;

const STORES = [
  {
    owner: '0911000001',
    name: 'Phở Cô Lan',
    category: 'FOOD',
    dLat: m(300),
    dLng: 0,
    menu: [
      ['Món chính', 'Phở bò tái', 55_000, ['Không hành', 'Ít bánh', 'Tái riêng']],
      ['Món chính', 'Phở gà', 50_000, ['Không hành', 'Thêm chanh']],
      ['Đồ uống', 'Trà đá', 5_000, ['Ít đá']],
    ],
  },
  {
    owner: '0911000002',
    name: 'Trà Sữa Mây',
    category: 'DRINK',
    dLat: 0,
    dLng: m(600),
    menu: [
      ['Trà sữa', 'Trà sữa trân châu', 35_000, ['Ít ngọt', 'Ít đá', 'Không trân châu']],
      ['Trà sữa', 'Trà đào cam sả', 40_000, ['Ít ngọt', 'Đá riêng']],
    ],
  },
  {
    owner: '0911000003',
    name: 'Tạp Hoá Cô Ba',
    category: 'GROCERY',
    dLat: -m(500),
    dLng: -m(200),
    menu: [
      ['Đồ khô', 'Mì Hảo Hảo (thùng 30 gói)', 120_000, []],
      ['Đồ uống', 'Nước suối 1,5L', 10_000, []],
      ['Gia dụng', 'Trứng gà (vỉ 10)', 35_000, []],
    ],
  },
] as const;

const RIDERS = ['0933000001', '0933000002'];

async function user(pool: Pool, phone: string, role: string, scope = 0): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
    [phone],
  );
  const id = Number(rows[0].id);
  await pool.query(`INSERT INTO user_roles (user_id, role, scope_id) VALUES ($1, 'CUSTOMER', 0), ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, role, scope]);
  return id;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool, console.log);
  for (const s of STORES) {
    const exists = await pool.query('SELECT id FROM stores WHERE name = $1', [s.name]);
    if (exists.rows[0]) continue;
    const ownerId = await user(pool, s.owner, 'CUSTOMER');
    const { rows } = await pool.query(
      `INSERT INTO stores (owner_user_id, name, category, location, address_text, phone, status, is_open)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, 'APPROVED', true) RETURNING id`,
      [ownerId, s.name, s.category, LNG + s.dLng, LAT + s.dLat, `Gần điểm thử nghiệm (${s.name})`, s.owner],
    );
    const storeId = Number(rows[0].id);
    await pool.query(`INSERT INTO user_roles (user_id, role, scope_id) VALUES ($1, 'MERCHANT_OWNER', $2) ON CONFLICT DO NOTHING`, [ownerId, storeId]);
    for (const [section, name, price, notes] of s.menu) {
      await pool.query('INSERT INTO menu_items (store_id, section, name, price, quick_notes) VALUES ($1, $2, $3, $4, $5)', [
        storeId,
        section,
        name,
        price,
        notes,
      ]);
    }
  }
  for (const phone of RIDERS) {
    const id = await user(pool, phone, 'RIDER');
    await pool.query(
      `INSERT INTO riders (user_id, vehicle_type, status, location, location_at)
       VALUES ($1, 'MOTORBIKE', 'APPROVED', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, now())
       ON CONFLICT (user_id) DO NOTHING`,
      [id, LNG, LAT],
    );
  }
  await pool.end();
  console.log(`
Dữ liệu mẫu quanh (${LAT}, ${LNG}):
  Quán:    ${STORES.map((s) => `${s.owner} (${s.name})`).join(', ')}
  Shipper: ${RIDERS.join(', ')}
  Khách:   số điện thoại bất kỳ
  Admin:   các số trong ADMIN_PHONES`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
