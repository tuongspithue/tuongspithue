import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, Length, Matches, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { BusinessError } from '../common/errors';
import { audit } from '../config-center/config.service';
import { DATABASE, Database } from '../database/database';

/** Trạng thái đơn còn đang chạy (dùng để biết shipper đang bận chuyến nào). */
const RIDER_BUSY = `('SHIPPER_DA_NHAN','SHIPPER_DEN_QUAN','DA_LAY_HANG','DANG_GIAO','DA_DEN_NOI')`;
const ACTIVE = `('CHO_THANH_TOAN','CHO_QUAN_XAC_NHAN','QUAN_DA_NHAN','DANG_TIM_SHIPPER','CAN_CAN_THIEP','SHIPPER_DA_NHAN','SHIPPER_DEN_QUAN','DA_LAY_HANG','DANG_GIAO','DA_DEN_NOI','CHO_KHACH_DEN_LAY')`;

const mask = (phone: string) => phone.replace(/^(\d{3})\d{4}(\d{3})$/, '$1****$2');
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const like = (q?: string) => (q?.trim() ? `%${q.trim()}%` : null);

class StoreUpdateDto {
  @IsOptional() @IsIn(['APPROVED', 'SUSPENDED']) status?: 'APPROVED' | 'SUSPENDED';
  @IsOptional() @IsBoolean() isOpen?: boolean;
  @IsOptional() @Length(2, 160) name?: string;
  @IsOptional() @Matches(/^0\d{9}$/) phone?: string;
  @IsOptional() @Length(5, 300) address?: string;
  @IsOptional() @IsInt() @Min(500) @Max(7000) deliveryRadiusM?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) prepTimeDefaultMin?: number;
  /** APP: quán tự nhận · PROXY: shipper mua hộ · HYBRID: song song (Phần 3.8). */
  @IsOptional() @IsIn(['APP', 'PROXY', 'HYBRID']) orderMode?: 'APP' | 'PROXY' | 'HYBRID';
  @Length(3, 300, { message: 'Cần ghi lý do (ít nhất 3 ký tự)' }) reason!: string;
}

class RiderUpdateDto {
  @IsOptional() @IsIn(['APPROVED', 'SUSPENDED']) status?: 'APPROVED' | 'SUSPENDED';
  @IsOptional() @IsInt() @Min(0) @Max(20_000_000) codLimit?: number;
  /** Hạn mức ứng trước tiền món khi mua hộ. */
  @IsOptional() @IsInt() @Min(0) @Max(20_000_000) advanceLimit?: number;
  @Length(3, 300, { message: 'Cần ghi lý do (ít nhất 3 ký tự)' }) reason!: string;
}

class UserStatusDto {
  @IsIn(['ACTIVE', 'LOCKED']) status!: 'ACTIVE' | 'LOCKED';
  @Length(3, 300, { message: 'Cần ghi lý do (ít nhất 3 ký tự)' }) reason!: string;
}

class MenuItemDto {
  @IsBoolean() isAvailable!: boolean;
}

/**
 * Quản lý quán, shipper, khách hàng và bản đồ trực tiếp (Phần 14.3, 14.5, 15).
 * Mọi thay đổi bắt buộc ghi lý do và vào nhật ký quản trị.
 */
@Controller('v1/admin')
@Roles('ADMIN', 'OPS')
export class AdminManageController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ---------------- Quán ----------------

  @Get('stores')
  async stores(@Query('q') q?: string, @Query('category') category?: string, @Query('status') status?: string, @Query('open') open?: string) {
    const { rows } = await this.db.query(
      `SELECT s.id, s.name, s.category, s.status, s.is_open, s.address_text, s.phone, s.created_at, s.order_mode,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
              u.phone AS owner_phone, u.full_name AS owner_name,
              t.tier, t.score, t.stars, t.review_count,
              (SELECT count(*)::int FROM menu_items m WHERE m.store_id = s.id) AS menu_count,
              (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id AND o.created_at >= date_trunc('day', now())) AS orders_today,
              (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id AND o.state IN ${ACTIVE}) AS active_orders,
              (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id AND o.created_at > now() - interval '30 days') AS orders_30d,
              (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id AND o.state = 'HOAN_THANH' AND o.created_at > now() - interval '30 days') AS completed_30d,
              (SELECT COALESCE(sum(o.subtotal), 0)::bigint FROM orders o WHERE o.store_id = s.id AND o.state = 'HOAN_THANH' AND o.created_at > now() - interval '30 days') AS gmv_30d
       FROM stores s JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN trust_scores t ON t.subject_type = 'STORE' AND t.subject_id = s.id
       WHERE ($1::text IS NULL OR s.name ILIKE $1 OR s.phone LIKE $1 OR u.phone LIKE $1 OR s.address_text ILIKE $1)
         AND ($2::text IS NULL OR s.category = $2)
         AND ($3::text IS NULL OR s.status = $3)
         AND ($4::boolean IS NULL OR s.is_open = $4)
       ORDER BY s.status = 'PENDING' DESC, s.is_open DESC, s.name
       LIMIT 500`,
      [like(q), category || null, status || null, open === undefined || open === '' ? null : open === 'true'],
    );
    const summary = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
              count(*) FILTER (WHERE status = 'PENDING')::int AS pending, count(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended,
              count(*) FILTER (WHERE status = 'APPROVED' AND is_open)::int AS open_now
       FROM stores`,
    );
    return {
      summary: summary.rows[0],
      stores: rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        category: r.category,
        status: r.status,
        isOpen: r.is_open,
        orderMode: r.order_mode,
        address: r.address_text,
        phone: r.phone,
        lat: Number(r.lat),
        lng: Number(r.lng),
        ownerName: r.owner_name,
        ownerPhone: r.owner_phone,
        tier: r.tier ?? 'ROOKIE',
        score: num(r.score),
        stars: num(r.stars),
        reviewCount: r.review_count ?? 0,
        menuCount: r.menu_count,
        ordersToday: r.orders_today,
        activeOrders: r.active_orders,
        orders30d: r.orders_30d,
        completed30d: r.completed_30d,
        completionRate30d: r.orders_30d ? Math.round((r.completed_30d / r.orders_30d) * 100) : null,
        gmv30d: Number(r.gmv_30d),
        createdAt: r.created_at,
      })),
    };
  }

  @Get('stores/:id')
  async store(@Param('id', ParseIntPipe) id: number) {
    const s = await this.db.one(
      `SELECT s.*, ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
              u.id AS owner_id, u.phone AS owner_phone, u.full_name AS owner_name, u.status AS owner_status,
              t.tier, t.score, t.stars, t.review_count, t.components
       FROM stores s JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN trust_scores t ON t.subject_type = 'STORE' AND t.subject_id = s.id
       WHERE s.id = $1`,
      [id],
    );
    if (!s) throw new BusinessError('STORE_NOT_FOUND', 'Không tìm thấy quán', 404);
    const [menu, orders, staff, stats, history] = await Promise.all([
      this.db.query('SELECT id, section, name, price, is_available, quick_notes FROM menu_items WHERE store_id = $1 ORDER BY section NULLS LAST, sort_order, id', [id]),
      this.db.query(
        `SELECT o.id, o.code, o.state, o.total, o.payment_method, o.created_at, o.accepted_at, u.full_name AS customer_name
         FROM orders o JOIN users u ON u.id = o.customer_id WHERE o.store_id = $1 ORDER BY o.created_at DESC LIMIT 30`,
        [id],
      ),
      this.db.query(
        `SELECT u.id, u.phone, u.full_name, r.role FROM user_roles r JOIN users u ON u.id = r.user_id
         WHERE r.scope_id = $1 AND r.role IN ('MERCHANT_OWNER', 'MERCHANT_STAFF') ORDER BY r.role, u.id`,
        [id],
      ),
      this.db.query(
        `SELECT count(*)::int AS orders, count(*) FILTER (WHERE state = 'HOAN_THANH')::int AS completed,
                count(*) FILTER (WHERE state = 'DA_HUY' AND (cancelled_by_role = 'MERCHANT' OR cancel_reason = 'MERCHANT_TIMEOUT'))::int AS merchant_cancelled,
                COALESCE(sum(subtotal) FILTER (WHERE state = 'HOAN_THANH'), 0)::bigint AS gmv,
                round(avg(extract(epoch FROM accepted_at - created_at)) FILTER (WHERE accepted_at IS NOT NULL AND NOT is_scheduled))::int AS avg_accept_s
         FROM orders WHERE store_id = $1 AND created_at > now() - interval '30 days'`,
        [id],
      ),
      this.db.query(
        `SELECT a.action, a.reason, a.after, a.created_at, u.full_name AS actor_name, u.phone AS actor_phone
         FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.target_type = 'store' AND a.target_id = $1 ORDER BY a.id DESC LIMIT 20`,
        [String(id)],
      ),
    ]);
    const st = stats.rows[0];
    return {
      id: Number(s.id),
      name: s.name,
      category: s.category,
      status: s.status,
      isOpen: s.is_open,
      address: s.address_text,
      phone: s.phone,
      lat: Number(s.lat),
      lng: Number(s.lng),
      deliveryMode: s.delivery_mode,
      orderMode: s.order_mode,
      deliveryRadiusM: s.delivery_radius_m,
      prepTimeDefaultMin: s.prep_time_default_min,
      createdAt: s.created_at,
      owner: { id: Number(s.owner_id), phone: s.owner_phone, name: s.owner_name, status: s.owner_status },
      trust: { tier: s.tier ?? 'ROOKIE', score: num(s.score), stars: num(s.stars), reviewCount: s.review_count ?? 0, components: s.components ?? null },
      stats30d: {
        orders: st.orders,
        completed: st.completed,
        merchantCancelled: st.merchant_cancelled,
        gmv: Number(st.gmv),
        avgAcceptSeconds: st.avg_accept_s,
      },
      staff: staff.rows.map((r) => ({ userId: Number(r.id), phone: r.phone, name: r.full_name, role: r.role })),
      menu: menu.rows.map((m) => ({ id: Number(m.id), section: m.section, name: m.name, price: Number(m.price), isAvailable: m.is_available, quickNotes: m.quick_notes })),
      recentOrders: orders.rows.map((o) => ({ id: Number(o.id), code: o.code, state: o.state, total: Number(o.total), paymentMethod: o.payment_method, customerName: o.customer_name, createdAt: o.created_at, acceptedAt: o.accepted_at })),
      history: history.rows.map(historyJson),
    };
  }

  @Patch('stores/:id')
  @Roles('ADMIN')
  @HttpCode(200)
  async updateStore(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StoreUpdateDto) {
    return this.db.tx(async (client) => {
      const before = (await client.query('SELECT name, phone, address_text, status, is_open, delivery_radius_m, prep_time_default_min, order_mode FROM stores WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw new BusinessError('STORE_NOT_FOUND', 'Không tìm thấy quán', 404);
      const status = dto.status ?? before.status;
      // Quán bị tạm khoá thì đóng cửa luôn và không mở lại được cho tới khi Admin mở khoá.
      const isOpen = status === 'APPROVED' ? (dto.isOpen ?? before.is_open) : false;
      const { rows } = await client.query(
        `UPDATE stores SET name = $2, phone = $3, address_text = $4, status = $5, is_open = $6, delivery_radius_m = $7, prep_time_default_min = $8, order_mode = $9
         WHERE id = $1 RETURNING name, phone, address_text, status, is_open, delivery_radius_m, prep_time_default_min, order_mode`,
        [id, dto.name ?? before.name, dto.phone ?? before.phone, dto.address ?? before.address_text, status, isOpen,
          dto.deliveryRadiusM ?? before.delivery_radius_m, dto.prepTimeDefaultMin ?? before.prep_time_default_min, dto.orderMode ?? before.order_mode],
      );
      await audit(client, admin.id, status !== before.status ? `STORE_${status}` : 'STORE_UPDATED', 'store', String(id), before, rows[0], dto.reason);
      return { id, ...rows[0] };
    });
  }

  /** Tắt/bật món (VD quán báo hết hàng qua điện thoại). */
  @Patch('menu-items/:id')
  @HttpCode(200)
  async updateMenuItem(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MenuItemDto) {
    return this.db.tx(async (client) => {
      const { rows } = await client.query('UPDATE menu_items SET is_available = $2 WHERE id = $1 RETURNING store_id, name, is_available', [id, dto.isAvailable]);
      if (!rows[0]) throw new BusinessError('MENU_ITEM_NOT_FOUND', 'Không tìm thấy món', 404);
      await audit(client, admin.id, dto.isAvailable ? 'MENU_ITEM_ON' : 'MENU_ITEM_OFF', 'store', String(rows[0].store_id), null, { item: rows[0].name, isAvailable: dto.isAvailable }, null);
      return { id, isAvailable: rows[0].is_available };
    });
  }

  // ---------------- Shipper ----------------

  @Get('riders')
  async riders(@Query('q') q?: string, @Query('status') status?: string, @Query('online') online?: string) {
    const { rows } = await this.db.query(
      `SELECT r.user_id, r.vehicle_type, r.plate_number, r.status, r.is_online, r.location_at, r.cod_balance, r.cod_limit, r.rider_type, r.advance_limit,
              ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
              u.phone, u.full_name, u.status AS user_status, u.created_at,
              t.tier, t.score, t.stars, t.review_count,
              (SELECT o.code FROM orders o WHERE o.rider_id = r.user_id AND o.state IN ${RIDER_BUSY} ORDER BY o.id DESC LIMIT 1) AS active_trip,
              (SELECT count(*)::int FROM orders o WHERE o.rider_id = r.user_id AND o.state = 'HOAN_THANH' AND o.created_at >= date_trunc('day', now())) AS trips_today,
              (SELECT count(*)::int FROM orders o WHERE o.rider_id = r.user_id AND o.state = 'HOAN_THANH' AND o.created_at > now() - interval '30 days') AS trips_30d
       FROM riders r JOIN users u ON u.id = r.user_id
       LEFT JOIN trust_scores t ON t.subject_type = 'RIDER' AND t.subject_id = r.user_id
       WHERE ($1::text IS NULL OR u.phone LIKE $1 OR u.full_name ILIKE $1 OR r.plate_number ILIKE $1)
         AND ($2::text IS NULL OR r.status = $2)
         AND ($3::boolean IS NULL OR r.is_online = $3)
       ORDER BY r.status = 'PENDING' DESC, r.is_online DESC, u.full_name NULLS LAST, r.user_id
       LIMIT 500`,
      [like(q), status || null, online === undefined || online === '' ? null : online === 'true'],
    );
    const summary = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
              count(*) FILTER (WHERE status = 'PENDING')::int AS pending, count(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended,
              count(*) FILTER (WHERE status = 'APPROVED' AND is_online)::int AS online,
              count(*) FILTER (WHERE status = 'APPROVED' AND is_online AND EXISTS (SELECT 1 FROM orders o WHERE o.rider_id = r.user_id AND o.state IN ${RIDER_BUSY}))::int AS busy
       FROM riders r`,
    );
    return {
      summary: summary.rows[0],
      riders: rows.map((r) => ({
        userId: Number(r.user_id),
        name: r.full_name,
        phone: r.phone,
        vehicleType: r.vehicle_type,
        plateNumber: r.plate_number,
        riderType: r.rider_type,
        status: r.status,
        userStatus: r.user_status,
        isOnline: r.is_online,
        locationAt: r.location_at,
        lat: num(r.lat),
        lng: num(r.lng),
        codBalance: Number(r.cod_balance),
        codLimit: Number(r.cod_limit),
        advanceLimit: Number(r.advance_limit),
        tier: r.tier ?? 'ROOKIE',
        score: num(r.score),
        stars: num(r.stars),
        reviewCount: r.review_count ?? 0,
        activeTrip: r.active_trip,
        tripsToday: r.trips_today,
        trips30d: r.trips_30d,
        createdAt: r.created_at,
      })),
    };
  }

  @Get('riders/:id')
  async rider(@Param('id', ParseIntPipe) id: number) {
    const list = await this.riders();
    const r = list.riders.find((x) => x.userId === id);
    if (!r) throw new BusinessError('RIDER_NOT_FOUND', 'Không tìm thấy shipper', 404);
    const [trips, stats, history] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.code, o.state, o.total, o.payment_method, o.created_at, COALESCE(s.name, '📦 Gửi hàng') AS store_name
         FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.rider_id = $1 ORDER BY o.created_at DESC LIMIT 30`,
        [id],
      ),
      this.db.query(
        `SELECT count(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted, count(*) FILTER (WHERE status = 'DECLINED')::int AS declined,
                count(*) FILTER (WHERE status = 'EXPIRED')::int AS expired, count(*)::int AS offers
         FROM dispatch_offers WHERE rider_id = $1 AND sent_at > now() - interval '30 days'`,
        [id],
      ),
      this.db.query(
        `SELECT a.action, a.reason, a.after, a.created_at, u.full_name AS actor_name, u.phone AS actor_phone
         FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.target_type IN ('rider', 'user') AND a.target_id = $1 ORDER BY a.id DESC LIMIT 20`,
        [String(id)],
      ),
    ]);
    const o = stats.rows[0];
    return {
      ...r,
      offers30d: { ...o, acceptRate: o.offers ? Math.round((o.accepted / o.offers) * 100) : null },
      recentTrips: trips.rows.map((t) => ({ id: Number(t.id), code: t.code, state: t.state, total: Number(t.total), paymentMethod: t.payment_method, storeName: t.store_name, createdAt: t.created_at })),
      history: history.rows.map(historyJson),
    };
  }

  @Patch('riders/:id')
  @Roles('ADMIN')
  @HttpCode(200)
  async updateRider(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RiderUpdateDto) {
    return this.db.tx(async (client) => {
      const before = (await client.query('SELECT status, cod_limit, is_online, advance_limit FROM riders WHERE user_id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw new BusinessError('RIDER_NOT_FOUND', 'Không tìm thấy shipper', 404);
      const status = dto.status ?? before.status;
      const { rows } = await client.query(
        `UPDATE riders SET status = $2::varchar, cod_limit = $3, advance_limit = $4, is_online = CASE WHEN $2::varchar = 'APPROVED' THEN is_online ELSE false END
         WHERE user_id = $1 RETURNING status, cod_limit, is_online, advance_limit`,
        [id, status, dto.codLimit ?? before.cod_limit, dto.advanceLimit ?? before.advance_limit],
      );
      await audit(client, admin.id, status !== before.status ? `RIDER_${status}` : 'RIDER_UPDATED', 'rider', String(id), before, rows[0], dto.reason);
      return { userId: id, status: rows[0].status, codLimit: Number(rows[0].cod_limit), advanceLimit: Number(rows[0].advance_limit), isOnline: rows[0].is_online };
    });
  }

  // ---------------- Khách hàng ----------------

  @Get('customers')
  async customers(@Query('q') q?: string, @Query('status') status?: string) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.phone, u.full_name, u.status, u.created_at,
              count(o.id)::int AS orders,
              count(o.id) FILTER (WHERE o.state = 'HOAN_THANH')::int AS completed,
              count(o.id) FILTER (WHERE o.state = 'DA_HUY' AND o.cancelled_by_role = 'CUSTOMER')::int AS cancelled,
              count(o.id) FILTER (WHERE o.state = 'GIAO_THAT_BAI')::int AS failed,
              COALESCE(sum(o.total) FILTER (WHERE o.state = 'HOAN_THANH'), 0)::bigint AS spent,
              max(o.created_at) AS last_order_at
       FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'CUSTOMER'
       LEFT JOIN orders o ON o.customer_id = u.id
       WHERE ($1::text IS NULL OR u.phone LIKE $1 OR u.full_name ILIKE $1)
         AND ($2::text IS NULL OR u.status = $2)
         AND NOT EXISTS (SELECT 1 FROM user_roles p WHERE p.user_id = u.id AND p.role <> 'CUSTOMER')
       GROUP BY u.id
       ORDER BY max(o.created_at) DESC NULLS LAST, u.id DESC
       LIMIT 500`,
      [like(q), status || null],
    );
    return {
      customers: rows.map((r) => ({
        id: Number(r.id),
        name: r.full_name,
        // SĐT che bớt trong danh sách (Phần 14.9); xem đủ trong hồ sơ.
        phone: mask(r.phone),
        status: r.status,
        orders: r.orders,
        completed: r.completed,
        cancelled: r.cancelled,
        failed: r.failed,
        spent: Number(r.spent),
        lastOrderAt: r.last_order_at,
        createdAt: r.created_at,
      })),
    };
  }

  @Get('customers/:id')
  async customer(@Param('id', ParseIntPipe) id: number) {
    const u = await this.db.one('SELECT id, phone, full_name, status, created_at FROM users WHERE id = $1', [id]);
    if (!u) throw new BusinessError('USER_NOT_FOUND', 'Không tìm thấy khách', 404);
    const [orders, stats, history] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.code, o.state, o.total, o.payment_method, o.created_at, o.dropoff_address, COALESCE(s.name, '📦 Gửi hàng') AS store_name
         FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 50`,
        [id],
      ),
      this.db.query(
        `SELECT count(*)::int AS orders, count(*) FILTER (WHERE state = 'HOAN_THANH')::int AS completed,
                count(*) FILTER (WHERE state = 'DA_HUY' AND cancelled_by_role = 'CUSTOMER')::int AS cancelled,
                count(*) FILTER (WHERE state = 'GIAO_THAT_BAI')::int AS failed,
                COALESCE(sum(total) FILTER (WHERE state = 'HOAN_THANH'), 0)::bigint AS spent
         FROM orders WHERE customer_id = $1`,
        [id],
      ),
      this.db.query(
        `SELECT a.action, a.reason, a.after, a.created_at, x.full_name AS actor_name, x.phone AS actor_phone
         FROM admin_audit_logs a LEFT JOIN users x ON x.id = a.actor_id
         WHERE a.target_type = 'user' AND a.target_id = $1 ORDER BY a.id DESC LIMIT 20`,
        [String(id)],
      ),
    ]);
    const s = stats.rows[0];
    return {
      id: Number(u.id),
      phone: u.phone,
      name: u.full_name,
      status: u.status,
      createdAt: u.created_at,
      stats: { ...s, spent: Number(s.spent) },
      recentOrders: orders.rows.map((o) => ({ id: Number(o.id), code: o.code, state: o.state, total: Number(o.total), paymentMethod: o.payment_method, storeName: o.store_name, address: o.dropoff_address, createdAt: o.created_at })),
      history: history.rows.map(historyJson),
    };
  }

  /** Khoá/mở khoá tài khoản (bùng đơn, gian lận…). Khoá thì đăng xuất mọi máy ngay. */
  @Patch('users/:id/status')
  @Roles('ADMIN')
  @HttpCode(200)
  async userStatus(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UserStatusDto) {
    if (id === admin.id) throw new BusinessError('CANNOT_LOCK_SELF', 'Không thể tự khoá tài khoản của mình', 422);
    return this.db.tx(async (client) => {
      const before = (await client.query('SELECT status FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw new BusinessError('USER_NOT_FOUND', 'Không tìm thấy người dùng', 404);
      await client.query(`UPDATE users SET status = $2::varchar, session_version = session_version + CASE WHEN $2::varchar = 'LOCKED' THEN 1 ELSE 0 END WHERE id = $1`, [id, dto.status]);
      if (dto.status === 'LOCKED') await client.query('UPDATE riders SET is_online = false WHERE user_id = $1', [id]);
      await audit(client, admin.id, `USER_${dto.status}`, 'user', String(id), before, { status: dto.status }, dto.reason);
      return { id, status: dto.status };
    });
  }

  // ---------------- Bản đồ trực tiếp ----------------

  /** Quán, shipper đang trực tuyến và đơn đang chạy trên bản đồ (Phần 14.3). */
  @Get('map')
  async map() {
    const [stores, riders, orders] = await Promise.all([
      this.db.query(
        `SELECT id, name, category, is_open, status, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM stores WHERE status <> 'REJECTED'`,
      ),
      this.db.query(
        `SELECT r.user_id, u.full_name, u.phone, r.location_at, ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
                (SELECT o.code FROM orders o WHERE o.rider_id = r.user_id AND o.state IN ${RIDER_BUSY} ORDER BY o.id DESC LIMIT 1) AS active_trip
         FROM riders r JOIN users u ON u.id = r.user_id
         WHERE r.status = 'APPROVED' AND r.is_online AND r.location IS NOT NULL`,
      ),
      this.db.query(
        `SELECT o.id, o.code, o.state, o.store_id, ST_Y(o.dropoff_location::geometry) AS lat, ST_X(o.dropoff_location::geometry) AS lng
         FROM orders o WHERE o.state IN ${ACTIVE} AND o.dropoff_location IS NOT NULL`,
      ),
    ]);
    return {
      stores: stores.rows.map((s) => ({ id: Number(s.id), name: s.name, category: s.category, isOpen: s.is_open, status: s.status, lat: Number(s.lat), lng: Number(s.lng) })),
      riders: riders.rows.map((r) => ({ userId: Number(r.user_id), name: r.full_name, phone: r.phone, locationAt: r.location_at, activeTrip: r.active_trip, lat: Number(r.lat), lng: Number(r.lng) })),
      orders: orders.rows.map((o) => ({ id: Number(o.id), code: o.code, state: o.state, storeId: Number(o.store_id), lat: Number(o.lat), lng: Number(o.lng) })),
      at: new Date(),
    };
  }
}

function historyJson(h: any) {
  return { action: h.action, reason: h.reason, after: h.after, at: h.created_at, actor: h.actor_name ?? h.actor_phone ?? 'Hệ thống' };
}
