import { Pool } from 'pg';
import { createActivationCode } from '../auth/activation';
import { loadConfig } from '../config';
import { migrate } from './migrate';

/**
 * Dữ liệu mẫu để test: 10 quán cho mỗi ngành (50 quán) đã duyệt & đang mở, rải trong bán kính ~2,5 km
 * quanh một toạ độ, và 5 shipper đã duyệt ở gần đó.
 * Chạy: DATABASE_URL=... SEED_LAT=17.5397 SEED_LNG=106.5744 node dist/src/database/seed.js
 * In ra mã kích hoạt cho quán, shipper và Admin mẫu; khách đăng nhập bằng số bất kỳ (không cần mã).
 * Chạy lại được: quán đã có (theo tên) thì bỏ qua, chỉ cấp mã mới.
 */
const LAT = Number(process.env.SEED_LAT ?? 17.539719890428422);
const LNG = Number(process.env.SEED_LNG ?? 106.57436128536212);

type Item = readonly [section: string, name: string, price: number, notes: readonly string[]];
interface Category {
  code: string;
  label: string;
  /** Đầu số SĐT chủ quán mẫu của ngành (thêm 6 số thứ tự). */
  phonePrefix: string;
  /** Món chung mọi quán trong ngành đều có. */
  common: readonly Item[];
  stores: ReadonlyArray<readonly [name: string, items: readonly Item[]]>;
}

const CATEGORIES: readonly Category[] = [
  {
    code: 'FOOD',
    label: 'Đồ ăn',
    phonePrefix: '0915',
    common: [
      ['Đồ uống', 'Trà đá', 3_000, ['Ít đá']],
      ['Đồ uống', 'Nước suối', 7_000, []],
    ],
    stores: [
      ['Bánh Canh Cô Hoa', [['Món chính', 'Bánh canh cá lóc', 30_000, ['Không hành', 'Thêm ớt', 'Ít nước']], ['Món chính', 'Bánh canh chả cua', 35_000, ['Không hành', 'Thêm chả']]]],
      ['Cháo Canh Mệ Tư', [['Món chính', 'Cháo canh cá tràu', 25_000, ['Không hành', 'Cay nhiều']], ['Món chính', 'Cháo canh giò heo', 30_000, ['Không hành']]]],
      ['Bún Bò O Lành', [['Món chính', 'Bún bò giò heo', 40_000, ['Không hành', 'Ít bún', 'Thêm sả ớt']], ['Món chính', 'Bún bò tái', 40_000, ['Tái riêng', 'Không hành']]]],
      ['Cơm Gà Út Hạnh', [['Món chính', 'Cơm gà xé', 35_000, ['Ít cơm', 'Thêm nước mắm gừng']], ['Món chính', 'Cơm gà đùi chiên', 45_000, ['Ít cơm', 'Không dưa leo']]]],
      ['Bánh Bèo Bánh Lọc Chị Thu', [['Món chính', 'Bánh lọc tôm thịt (10 cái)', 25_000, ['Nước mắm riêng', 'Cay nhiều']], ['Món chính', 'Bánh bèo chén (10 chén)', 25_000, ['Nước mắm riêng']]]],
      ['Phở Bò Anh Tuấn', [['Món chính', 'Phở bò tái', 45_000, ['Không hành', 'Ít bánh', 'Tái riêng']], ['Món chính', 'Phở bò viên', 40_000, ['Không hành']]]],
      ['Bánh Mì Chảo Bé Na', [['Món chính', 'Bánh mì chảo đầy đủ', 35_000, ['Không pate', 'Thêm trứng']], ['Món chính', 'Bánh mì thịt nướng', 20_000, ['Không rau', 'Thêm ớt']]]],
      ['Bún Chả Cá Cô Sáu', [['Món chính', 'Bún chả cá', 30_000, ['Không hành', 'Ít bún']], ['Món chính', 'Bánh canh chả cá', 30_000, ['Không hành']]]],
      ['Cơm Tấm Ba Khanh', [['Món chính', 'Cơm tấm sườn bì chả', 45_000, ['Ít cơm', 'Thêm mỡ hành']], ['Món chính', 'Cơm tấm sườn trứng', 40_000, ['Trứng lòng đào']]]],
      ['Gỏi Cuốn Nem Lụi Dì Ba', [['Món chính', 'Nem lụi (5 xiên)', 40_000, ['Nước chấm riêng', 'Không rau']], ['Món chính', 'Gỏi cuốn tôm thịt (4 cuốn)', 30_000, ['Không hẹ']]]],
    ],
  },
  {
    code: 'DRINK',
    label: 'Đồ uống',
    phonePrefix: '0916',
    common: [['Thêm', 'Thêm trân châu', 5_000, []]],
    stores: [
      ['Trà Sữa Mây', [['Trà sữa', 'Trà sữa trân châu đường đen', 30_000, ['Ít ngọt', 'Ít đá', 'Không trân châu']], ['Trà trái cây', 'Trà đào cam sả', 30_000, ['Ít ngọt', 'Đá riêng']]]],
      ['Cà Phê Muối Biển Xanh', [['Cà phê', 'Cà phê muối', 25_000, ['Ít ngọt', 'Đá riêng']], ['Cà phê', 'Bạc xỉu', 25_000, ['Ít sữa']]]],
      ['Nước Mía Sầu Riêng Cô Út', [['Nước ép', 'Nước mía sầu riêng', 25_000, ['Ít đá']], ['Nước ép', 'Nước mía tắc', 12_000, ['Không đá']]]],
      ['Sinh Tố Bốn Mùa', [['Sinh tố', 'Sinh tố bơ', 30_000, ['Ít ngọt', 'Ít sữa']], ['Sinh tố', 'Sinh tố xoài', 25_000, ['Ít ngọt']]]],
      ['Cà Phê Phố Cũ', [['Cà phê', 'Cà phê sữa đá', 20_000, ['Ít sữa', 'Đậm']], ['Cà phê', 'Cà phê đen', 15_000, ['Không đường']]]],
      ['Trà Chanh Giã Tay Hạ Vy', [['Trà', 'Trà chanh giã tay', 20_000, ['Ít ngọt', 'Nhiều đá']], ['Trà', 'Trà tắc xí muội', 20_000, ['Ít ngọt']]]],
      ['Nước Ép Tươi Mát', [['Nước ép', 'Nước ép cam', 30_000, ['Không đường', 'Không đá']], ['Nước ép', 'Nước ép dưa hấu', 25_000, ['Không đường']]]],
      ['Chè Dừa Non Bà Bảy', [['Chè', 'Chè dừa non', 20_000, ['Ít ngọt', 'Đá riêng']], ['Chè', 'Chè thập cẩm', 20_000, ['Ít ngọt']]]],
      ['Sữa Chua Trân Châu Mộc', [['Sữa chua', 'Sữa chua trân châu', 25_000, ['Ít ngọt']], ['Sữa chua', 'Sữa chua nếp cẩm', 25_000, ['Ít đá']]]],
      ['Trà Sữa Nhà Làm Bơ', [['Trà sữa', 'Trà sữa nướng', 28_000, ['Ít ngọt', 'Không thạch']], ['Trà sữa', 'Hồng trà kem cheese', 32_000, ['Ít ngọt', 'Ít đá']]]],
    ],
  },
  {
    code: 'GROCERY',
    label: 'Tạp hoá',
    phonePrefix: '0917',
    common: [
      ['Đồ uống', 'Nước suối 1,5L', 10_000, []],
      ['Gia dụng', 'Trứng gà (vỉ 10)', 35_000, []],
    ],
    stores: [
      ['Tạp Hoá Cô Ba', [['Đồ khô', 'Mì Hảo Hảo (thùng 30 gói)', 120_000, []], ['Gia vị', 'Nước mắm (chai 500ml)', 35_000, []]]],
      ['Tạp Hoá Minh Phát', [['Đồ khô', 'Gạo thơm (túi 5kg)', 120_000, []], ['Gia vị', 'Dầu ăn (chai 1L)', 50_000, []]]],
      ['Tạp Hoá Hai Thanh', [['Đồ khô', 'Mì ly (thùng 24 ly)', 160_000, []], ['Đồ uống', 'Sữa tươi (lốc 4 hộp)', 32_000, ['Loại ít đường']]]],
      ['Cửa Hàng Tiện Lợi Ngày Mới', [['Ăn vặt', 'Bánh snack (gói lớn)', 15_000, []], ['Đồ uống', 'Nước ngọt lon (lốc 6)', 60_000, ['Loại không đường']]]],
      ['Tạp Hoá Bà Năm', [['Gia vị', 'Bột ngọt (gói 400g)', 30_000, []], ['Gia vị', 'Đường cát (gói 1kg)', 25_000, []]]],
      ['Tạp Hoá Phúc Lộc', [['Gia dụng', 'Nước rửa chén (chai 750ml)', 30_000, []], ['Gia dụng', 'Bột giặt (túi 3kg)', 110_000, []]]],
      ['Tạp Hoá Chú Tám', [['Đồ khô', 'Bún khô (gói 500g)', 18_000, []], ['Đồ khô', 'Miến dong (gói 200g)', 20_000, []]]],
      ['Tạp Hoá Gia Hưng', [['Gia dụng', 'Giấy vệ sinh (lốc 10 cuộn)', 55_000, []], ['Gia dụng', 'Khăn giấy (hộp)', 20_000, []]]],
      ['Tạp Hoá An Khang', [['Đồ khô', 'Cá khô (gói 200g)', 60_000, []], ['Gia vị', 'Tương ớt (chai)', 15_000, []]]],
      ['Tạp Hoá Thịnh Vượng', [['Đồ hộp', 'Cá hộp sốt cà', 22_000, []], ['Đồ hộp', 'Sữa đặc (lon)', 25_000, []]]],
    ],
  },
  {
    code: 'WATER_ICE',
    label: 'Nước, đá',
    phonePrefix: '0918',
    common: [['Đá', 'Đá viên (bao 10kg)', 25_000, []]],
    stores: [
      ['Nước Tinh Khiết Biển Xanh', [['Nước bình', 'Nước bình 20L', 20_000, ['Đổi vỏ', 'Lấy vỏ mới']], ['Nước bình', 'Nước bình 20L (có vòi)', 25_000, ['Đổi vỏ']]]],
      ['Đá Sạch Hoàng Long', [['Đá', 'Đá cây (1 cây)', 30_000, ['Đập nhỏ']], ['Đá', 'Đá bi (bao 20kg)', 45_000, []]]],
      ['Nước Uống Sông Nhật Lệ', [['Nước bình', 'Nước bình 19L', 18_000, ['Đổi vỏ']], ['Nước chai', 'Nước chai 500ml (thùng 24)', 70_000, []]]],
      ['Nước Khoáng Suối Mát', [['Nước bình', 'Nước khoáng bình 20L', 30_000, ['Đổi vỏ']], ['Nước chai', 'Nước khoáng 1,5L (thùng 12)', 90_000, []]]],
      ['Đá Viên Tinh Khiết Ngọc Hà', [['Đá', 'Đá viên tinh khiết (bao 5kg)', 15_000, []], ['Đá', 'Đá viên (bao 20kg)', 45_000, []]]],
      ['Nước Bình Thuận Phát', [['Nước bình', 'Nước bình 20L', 20_000, ['Đổi vỏ', 'Giao lên lầu']], ['Phụ kiện', 'Vòi bơm nước bình', 40_000, []]]],
      ['Nước Sạch Gia Đình', [['Nước bình', 'Nước bình 20L', 19_000, ['Đổi vỏ']], ['Nước bình', 'Gói 5 bình 20L', 90_000, ['Đổi vỏ']]]],
      ['Đá Lạnh Minh Châu', [['Đá', 'Đá cây (1 cây)', 28_000, ['Đập nhỏ']], ['Đá', 'Đá bào (bao 10kg)', 30_000, []]]],
      ['Nước Tinh Khiết Phong Nha', [['Nước bình', 'Nước bình 20L', 22_000, ['Đổi vỏ']], ['Nước chai', 'Nước chai 350ml (thùng 24)', 60_000, []]]],
      ['Nước Đá Bảo Ngọc', [['Nước bình', 'Nước bình 20L', 20_000, ['Đổi vỏ']], ['Đá', 'Đá viên (bao 5kg)', 15_000, []]]],
    ],
  },
  {
    code: 'MOM_BABY',
    label: 'Mẹ & bé',
    phonePrefix: '0919',
    common: [['Vệ sinh', 'Khăn ướt em bé (gói 100 tờ)', 35_000, []]],
    stores: [
      ['Mẹ Và Bé Hạnh Phúc', [['Tã bỉm', 'Tã dán size M (gói 60)', 280_000, ['Size L']], ['Sữa', 'Sữa bột số 2 (lon 800g)', 450_000, []]]],
      ['Shop Bé Yêu', [['Tã bỉm', 'Bỉm quần size L (gói 50)', 300_000, ['Size XL']], ['Đồ dùng', 'Bình sữa 240ml', 150_000, []]]],
      ['Kho Sữa Mẹ Bống', [['Sữa', 'Sữa bột số 1 (lon 800g)', 420_000, []], ['Sữa', 'Sữa pha sẵn (lốc 4 hộp)', 40_000, []]]],
      ['Mẹ Bầu Và Em Bé An Nhiên', [['Mẹ bầu', 'Sữa bầu (lon 400g)', 250_000, []], ['Đồ dùng', 'Gối chống trào ngược', 200_000, []]]],
      ['Thế Giới Bé Con', [['Đồ chơi', 'Xúc xắc cho bé', 60_000, []], ['Quần áo', 'Bộ body sơ sinh', 90_000, ['Size 3-6 tháng']]]],
      ['Bé Khoẻ Bé Ngoan', [['Ăn dặm', 'Bột ăn dặm (hộp 200g)', 80_000, []], ['Ăn dặm', 'Cháo tươi cho bé', 30_000, ['Không hành']]]],
      ['Tã Bỉm Giá Kho Thiên Ân', [['Tã bỉm', 'Tã dán size S (gói 70)', 260_000, ['Size M']], ['Tã bỉm', 'Miếng lót sơ sinh (gói 100)', 120_000, []]]],
      ['Cửa Hàng Mẹ Kem', [['Vệ sinh', 'Sữa tắm gội em bé', 120_000, []], ['Vệ sinh', 'Nước giặt đồ em bé', 140_000, []]]],
      ['Sữa Và Bỉm Minh Anh', [['Sữa', 'Sữa bột số 3 (lon 800g)', 400_000, []], ['Tã bỉm', 'Bỉm quần size XL (gói 44)', 310_000, []]]],
      ['Góc Của Mẹ', [['Đồ dùng', 'Máy hâm sữa', 350_000, []], ['Đồ dùng', 'Túi trữ sữa (hộp 50)', 90_000, []]]],
    ],
  },
];

const RIDERS = ['0933000001', '0933000002', '0933000003', '0933000004', '0933000005'];
const RIDER_NAMES = ['Trần Văn Hùng', 'Lê Minh Tâm', 'Nguyễn Đức Phong', 'Phạm Quốc Bảo', 'Hoàng Thị Lan'];
const OWNER_FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Phan', 'Đặng', 'Bùi', 'Đỗ'];
const OWNER_GIVEN = ['Thị Hoa', 'Văn Tư', 'Thị Lành', 'Thị Hạnh', 'Thị Thu', 'Anh Tuấn', 'Thị Na', 'Thị Sáu', 'Văn Khanh', 'Thị Ba'];
/** Tên chủ quán mẫu, cố định theo thứ tự để chạy lại seed vẫn ra cùng tên. */
const ownerName = (ci: number, i: number) => `${OWNER_FAMILY[(ci * 3 + i) % OWNER_FAMILY.length]} ${OWNER_GIVEN[i % OWNER_GIVEN.length]}`;

/** Rải quán đều quanh tâm theo hình xoắn ốc (150 m – 2,5 km), không quán nào trùng chỗ. */
function spread(k: number, total: number): { lat: number; lng: number } {
  const r = 150 + 2_350 * Math.sqrt((k + 0.5) / total);
  const angle = (k * 137.508 * Math.PI) / 180;
  return {
    lat: LAT + (r * Math.cos(angle)) / 111_320,
    lng: LNG + (r * Math.sin(angle)) / (111_320 * Math.cos((LAT * Math.PI) / 180)),
  };
}

async function user(pool: Pool, phone: string, role: string, scope = 0, name: string | null = null): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO users (phone, full_name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET full_name = COALESCE(users.full_name, EXCLUDED.full_name) RETURNING id`,
    [phone, name],
  );
  const id = Number(rows[0].id);
  await pool.query(`INSERT INTO user_roles (user_id, role, scope_id) VALUES ($1, 'CUSTOMER', 0), ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, role, scope]);
  return id;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool, console.log);
  const owners: Array<[string, string]> = [];
  const total = CATEGORIES.reduce((n, c) => n + c.stores.length, 0);
  for (const [ci, c] of CATEGORIES.entries()) {
    for (const [i, [name, items]] of c.stores.entries()) {
      const owner = `${c.phonePrefix}${String(i + 1).padStart(6, '0')}`;
      // Xen kẽ các ngành để khu nào cũng có đủ quán ăn, đồ uống, tạp hoá, nước đá, mẹ & bé.
      const at = spread(i * CATEGORIES.length + ci, total);
      // Quán đã có (chạy lại seed): chuyển tới vị trí mới, mở cửa, cấp mã cho đúng chủ quán.
      const exists = await pool.query(
        `UPDATE stores s SET location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, is_open = true, status = 'APPROVED'
         FROM users u WHERE s.name = $1 AND u.id = s.owner_user_id RETURNING u.phone`,
        [name, at.lng, at.lat],
      );
      if (exists.rows[0]) {
        owners.push([exists.rows[0].phone, `${c.label}: ${name}`]);
        continue;
      }
      owners.push([owner, `${c.label}: ${name}`]);
      const ownerId = await user(pool, owner, 'CUSTOMER', 0, ownerName(ci, i));
      const { rows } = await pool.query(
        `INSERT INTO stores (owner_user_id, name, category, location, address_text, phone, status, is_open)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, 'APPROVED', true) RETURNING id`,
        [ownerId, name, c.code, at.lng, at.lat, `Quán mẫu gần điểm thử nghiệm (${at.lat.toFixed(5)}, ${at.lng.toFixed(5)})`, owner],
      );
      const storeId = Number(rows[0].id);
      await pool.query(`INSERT INTO user_roles (user_id, role, scope_id) VALUES ($1, 'MERCHANT_OWNER', $2) ON CONFLICT DO NOTHING`, [ownerId, storeId]);
      for (const [order, [section, item, price, notes]] of [...items, ...c.common].entries()) {
        await pool.query('INSERT INTO menu_items (store_id, section, name, price, quick_notes, sort_order) VALUES ($1, $2, $3, $4, $5, $6)', [
          storeId,
          section,
          item,
          price,
          notes,
          order,
        ]);
      }
    }
  }
  for (const phone of RIDERS) {
    const id = await user(pool, phone, 'RIDER', 0, RIDER_NAMES[RIDERS.indexOf(phone)]);
    const at = spread(RIDERS.indexOf(phone) * 9, total); // shipper đứng rải rác giữa các quán
    await pool.query(
      `INSERT INTO riders (user_id, vehicle_type, status, location, location_at)
       VALUES ($1, 'MOTORBIKE', 'APPROVED', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, now())
       ON CONFLICT (user_id) DO UPDATE SET status = 'APPROVED', location = EXCLUDED.location, location_at = now()`,
      [id, at.lng, at.lat],
    );
  }
  // Mã kích hoạt cho tài khoản mẫu (chạy lại seed là cấp mã mới).
  const config = loadConfig();
  const codes: string[] = [];
  const phones: Array<[string, string]> = [
    ...config.adminPhones.map((p) => [p, 'Admin'] as [string, string]),
    ...owners,
    ...RIDERS.map((p) => [p, 'Shipper'] as [string, string]),
  ];
  for (const [phone, label] of phones) {
    const id = await user(pool, phone, 'CUSTOMER');
    const { code } = await createActivationCode(pool, config.jwtSecret, id, null);
    codes.push(`  ${label.padEnd(44)} ${phone}  mã ${code}`);
  }
  await pool.end();
  console.log(`
Dữ liệu mẫu quanh (${LAT}, ${LNG}). Mã kích hoạt (hết hạn sau 3 ngày, dùng 1 lần):
${codes.join('\n')}
  Khách: số điện thoại bất kỳ, không cần mã`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
