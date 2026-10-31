import { Body, Controller, Get, HttpCode, Inject, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, Length, Matches } from 'class-validator';
import { AuthModule, AuthService } from '../auth/auth';
import { AdminManageController } from './manage';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { BusinessError } from '../common/errors';
import { audit } from '../config-center/config.service';
import { DATABASE, Database } from '../database/database';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';

class ActivationCodeDto {
  @IsOptional() @IsBoolean() revokeOthers?: boolean;
}

class ActivationByPhoneDto extends ActivationCodeDto {
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ' }) phone!: string;
}

class RejectDto {
  @Length(3, 300) reason!: string;
}

/** Các điều kiện "đơn có vấn đề" (Phần 2.4, 14.4). */
const PROBLEM_SQL = `(
  (o.state IN ('CHO_QUAN_XAC_NHAN') AND o.created_at < now() - interval '90 seconds') OR
  (o.state = 'DANG_TIM_SHIPPER' AND o.updated_at < now() - interval '5 minutes') OR
  (o.state = 'CAN_CAN_THIEP') OR
  (o.state IN ('DANG_GIAO', 'DA_LAY_HANG') AND EXISTS (
     SELECT 1 FROM riders r WHERE r.user_id = o.rider_id AND (r.location_at IS NULL OR r.location_at < now() - interval '10 minutes'))) OR
  (o.state = 'HEN_TREN_CHO_CHUYEN' AND o.scheduled_pickup_at < now() + interval '45 minutes')
)`;

const PROBLEM_REASON_SQL = `CASE
  WHEN o.state = 'CAN_CAN_THIEP' THEN 'NEEDS_INTERVENTION'
  WHEN o.state = 'CHO_QUAN_XAC_NHAN' THEN 'MERCHANT_SILENT'
  WHEN o.state = 'DANG_TIM_SHIPPER' THEN 'NO_RIDER'
  WHEN o.state = 'HEN_TREN_CHO_CHUYEN' THEN 'SCHEDULED_UNCLAIMED'
  ELSE 'RIDER_STATIONARY' END`;

const ACTIVE_STATES = `('CHO_THANH_TOAN','CHO_QUAN_XAC_NHAN','CHO_KHACH_DUYET_THAY_DOI','QUAN_DA_NHAN','DANG_TIM_SHIPPER','CAN_CAN_THIEP',
  'SHIPPER_DA_NHAN','SHIPPER_DEN_QUAN','DA_LAY_HANG','DANG_GIAO','DA_DEN_NOI','CHO_KHACH_DEN_LAY','GIAO_THAT_BAI')`;

/** Admin Console mức MVP (Phần 14.2, 14.4, 14.5, 14.7). */
@Controller('v1/admin')
@Roles('ADMIN', 'OPS')
export class AdminController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly orders: OrdersService,
    private readonly auth: AuthService,
  ) {}

  /** Tổng quan "nhìn trong 5 giây" (Phần 14.2). */
  @Get('dashboard')
  async dashboard() {
    const [byState, gateA, riders, problems, scheduled, today, outbox, hourly, pending, topStores] = await Promise.all([
      this.db.query(`SELECT state, count(*)::int AS n FROM orders o WHERE o.state IN ${ACTIVE_STATES} GROUP BY state`),
      this.db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE accepted_at - created_at <= interval '60 seconds')::int AS within_60s,
                count(*) FILTER (WHERE accepted_at - created_at <= interval '180 seconds')::int AS within_180s
         FROM orders WHERE NOT is_scheduled AND created_at >= date_trunc('day', now())
           AND (accepted_at IS NOT NULL OR cancel_reason IN ('MERCHANT_TIMEOUT') OR cancelled_by_role = 'MERCHANT')`,
      ),
      this.db.query(
        `SELECT count(*) FILTER (WHERE is_online)::int AS online,
                count(*) FILTER (WHERE is_online AND NOT EXISTS (
                  SELECT 1 FROM orders o WHERE o.rider_id = r.user_id AND o.state IN ('SHIPPER_DA_NHAN','SHIPPER_DEN_QUAN','DA_LAY_HANG','DANG_GIAO','DA_DEN_NOI')))::int AS free
         FROM riders r WHERE status = 'APPROVED'`,
      ),
      this.db.query(`SELECT count(*)::int AS n FROM orders o WHERE ${PROBLEM_SQL}`),
      this.db.query(
        `SELECT count(*)::int AS upcoming, count(*) FILTER (WHERE state = 'HEN_TREN_CHO_CHUYEN')::int AS unclaimed
         FROM orders WHERE is_scheduled AND state LIKE 'HEN_%' AND scheduled_pickup_at < now() + interval '2 hours'`,
      ),
      this.db.query(
        `SELECT count(*)::int AS orders,
                count(*) FILTER (WHERE state = 'HOAN_THANH')::int AS completed,
                COALESCE(sum(subtotal) FILTER (WHERE state = 'HOAN_THANH'), 0)::bigint AS gmv,
                count(*) FILTER (WHERE state = 'DA_HUY' AND cancelled_by_role = 'CUSTOMER')::int AS cancelled_customer,
                count(*) FILTER (WHERE state = 'DA_HUY' AND (cancelled_by_role = 'MERCHANT' OR cancel_reason = 'MERCHANT_TIMEOUT'))::int AS cancelled_merchant,
                count(*) FILTER (WHERE state = 'DA_HUY' AND cancelled_by_role = 'SYSTEM' AND cancel_reason <> 'MERCHANT_TIMEOUT')::int AS cancelled_system
         FROM orders WHERE created_at >= date_trunc('day', now())`,
      ),
      this.db.query(`SELECT count(*) FILTER (WHERE status = 'FAILED')::int AS failed_jobs FROM scheduled_jobs`),
      // Biểu đồ đơn theo giờ trong 24 giờ qua (giờ Việt Nam).
      this.db.query(
        `SELECT extract(hour FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour, count(*)::int AS orders,
                count(*) FILTER (WHERE state = 'HOAN_THANH')::int AS completed
         FROM orders WHERE created_at > now() - interval '24 hours' GROUP BY 1`,
      ),
      this.db.query(
        `SELECT (SELECT count(*)::int FROM stores WHERE status = 'PENDING') AS stores, (SELECT count(*)::int FROM riders WHERE status = 'PENDING') AS riders`,
      ),
      this.db.query(
        `SELECT s.id, s.name, s.category, count(o.id)::int AS orders, COALESCE(sum(o.subtotal) FILTER (WHERE o.state = 'HOAN_THANH'), 0)::bigint AS gmv
         FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.created_at >= date_trunc('day', now())
         GROUP BY s.id ORDER BY count(o.id) DESC LIMIT 5`,
      ),
    ]);
    const byHour = new Map(hourly.rows.map((h) => [h.hour, h]));
    const nowHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
    const g = gateA.rows[0];
    const pct = (n: number) => (g.total ? Math.round((n / g.total) * 1000) / 10 : null);
    return {
      activeOrders: Object.fromEntries(byState.rows.map((r) => [r.state, r.n])),
      gateA: { decided: g.total, within60sPct: pct(g.within_60s), within180sPct: pct(g.within_180s) },
      riders: riders.rows[0],
      problemOrders: problems.rows[0].n,
      scheduledNext2h: scheduled.rows[0],
      today: { ...today.rows[0], gmv: Number(today.rows[0].gmv) },
      system: { failedJobs: outbox.rows[0].failed_jobs },
      hourly: Array.from({ length: 24 }, (_, i) => {
        const hour = (nowHour + 1 + i) % 24;
        const h = byHour.get(hour);
        return { hour, orders: h?.orders ?? 0, completed: h?.completed ?? 0 };
      }),
      pendingPartners: pending.rows[0],
      topStores: topStores.rows.map((t) => ({ id: Number(t.id), name: t.name, category: t.category, orders: t.orders, gmv: Number(t.gmv) })),
      at: new Date(),
    };
  }

  /** Danh sách đơn có bộ lọc; `problem=true` là hàng đợi "đơn có vấn đề" (Phần 14.4). */
  @Get('orders')
  async listOrders(@Query('state') state?: string, @Query('problem') problem?: string, @Query('q') q?: string) {
    const { rows } = await this.db.query(
      `SELECT o.id, o.code, o.state, o.total, o.payment_method, o.is_scheduled, o.scheduled_pickup_at, o.created_at, o.updated_at,
              s.name AS store_name, s.phone AS store_phone, u.phone AS customer_phone, ${PROBLEM_REASON_SQL} AS problem
       FROM orders o JOIN stores s ON s.id = o.store_id JOIN users u ON u.id = o.customer_id
       WHERE ($1::text IS NULL OR o.state = $1)
         AND ($2::boolean IS NOT TRUE OR ${PROBLEM_SQL})
         AND ($3::text IS NULL OR o.code ILIKE '%' || $3 || '%' OR u.phone LIKE '%' || $3 || '%' OR s.name ILIKE '%' || $3 || '%')
       ORDER BY o.created_at DESC LIMIT 200`,
      [state ?? null, problem === 'true', q?.trim() || null],
    );
    return {
      orders: rows.map((r) => ({
        id: Number(r.id),
        code: r.code,
        state: r.state,
        total: Number(r.total),
        paymentMethod: r.payment_method,
        isScheduled: r.is_scheduled,
        pickupAt: r.scheduled_pickup_at,
        storeName: r.store_name,
        storePhone: r.store_phone,
        // SĐT khách che bớt mặc định (Phần 14.9).
        customerPhone: r.customer_phone.replace(/^(\d{3})\d{4}(\d{3})$/, '$1****$2'),
        problem: problem === 'true' ? r.problem : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  }

  @Get('orders/:id')
  order(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.view(this.db, id, user);
  }

  /** "Việc cần làm" của Ops: các đơn cần gọi quán, kèm SĐT và lời đọc đơn (thay cuộc gọi tự động). */
  @Get('ops-inbox')
  async opsInbox() {
    const { rows } = await this.db.query(
      `SELECT DISTINCT ON (n.payload->>'orderId') n.id, n.template, n.payload, n.created_at, o.state
       FROM notifications n JOIN orders o ON o.id = (n.payload->>'orderId')::bigint
       WHERE n.user_id IS NULL AND n.template = 'OPS_CALL_STORE' AND n.created_at > now() - interval '1 day'
         AND o.state IN ('CHO_QUAN_XAC_NHAN', 'HEN_CHO_QUAN_NHAN', 'CAN_CAN_THIEP', 'HEN_SHIPPER_DA_GIU', 'HEN_TREN_CHO_CHUYEN')
       ORDER BY n.payload->>'orderId', n.id DESC`,
    );
    return {
      items: rows
        .map((r) => ({ id: Number(r.id), orderId: Number(r.payload.orderId), code: r.payload.code, reason: r.payload.reason, storeName: r.payload.storeName, storePhone: r.payload.storePhone, script: r.payload.script ?? null, state: r.state, at: r.created_at }))
        .sort((a, b) => +new Date(a.at) - +new Date(b.at)),
    };
  }

  @Get('partners/pending')
  async pending() {
    const stores = await this.db.query(
      `SELECT s.id, s.name, s.category, s.address_text, s.phone, s.created_at, u.phone AS owner_phone, u.full_name AS owner_name
       FROM stores s JOIN users u ON u.id = s.owner_user_id WHERE s.status = 'PENDING' ORDER BY s.created_at`,
    );
    const riders = await this.db.query(
      `SELECT r.user_id, r.vehicle_type, r.plate_number, u.phone, u.full_name, u.created_at
       FROM riders r JOIN users u ON u.id = r.user_id WHERE r.status = 'PENDING' ORDER BY u.created_at`,
    );
    return {
      stores: stores.rows.map((s) => ({ id: Number(s.id), name: s.name, category: s.category, address: s.address_text, phone: s.phone, ownerPhone: s.owner_phone, ownerName: s.owner_name, createdAt: s.created_at })),
      riders: riders.rows.map((r) => ({ userId: Number(r.user_id), vehicleType: r.vehicle_type, plateNumber: r.plate_number, phone: r.phone, fullName: r.full_name, createdAt: r.created_at })),
    };
  }

  @Post('stores/:id/approve')
  @Roles('ADMIN')
  @HttpCode(200)
  async approveStore(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.decide(admin, 'store', id, 'APPROVED', null);
  }

  @Post('stores/:id/reject')
  @Roles('ADMIN')
  @HttpCode(200)
  async rejectStore(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectDto) {
    return this.decide(admin, 'store', id, 'REJECTED', dto.reason);
  }

  @Post('riders/:userId/approve')
  @Roles('ADMIN')
  @HttpCode(200)
  async approveRider(@CurrentUser() admin: AuthUser, @Param('userId', ParseIntPipe) userId: number) {
    return this.decide(admin, 'rider', userId, 'APPROVED', null);
  }

  @Post('riders/:userId/reject')
  @Roles('ADMIN')
  @HttpCode(200)
  async rejectRider(@CurrentUser() admin: AuthUser, @Param('userId', ParseIntPipe) userId: number, @Body() dto: RejectDto) {
    return this.decide(admin, 'rider', userId, 'REJECTED', dto.reason);
  }

  /**
   * Cấp mã kích hoạt cho đối tác/nhân viên (Phần 13.9). Admin gửi mã bằng Zalo/SMS từ máy mình;
   * dùng cả khi đối tác đổi/mất điện thoại (kèm đăng xuất các máy cũ).
   */
  @Post('users/:id/activation-code')
  @Roles('ADMIN')
  @HttpCode(200)
  async activationCode(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ActivationCodeDto) {
    return this.db.tx(async (client) => {
      const issued = await this.auth.issueActivationCode(id, admin.id, dto.revokeOthers ?? false, client);
      await audit(client, admin.id, 'ACTIVATION_CODE_ISSUED', 'user', String(id), null, { revokeOthers: dto.revokeOthers ?? false }, null);
      return issued;
    });
  }

  /** Cấp lại mã theo số điện thoại (đối tác đổi máy, cài lại app, hết hạn mã). */
  @Post('activation-codes')
  @Roles('ADMIN')
  @HttpCode(200)
  async activationByPhone(@CurrentUser() admin: AuthUser, @Body() dto: ActivationByPhoneDto) {
    const u = await this.db.one<{ id: string }>('SELECT id FROM users WHERE phone = $1', [dto.phone]);
    if (!u) throw new BusinessError('USER_NOT_FOUND', 'Chưa có tài khoản nào với số này. Đối tác cần đăng ký trong app trước', 404);
    return this.activationCode(admin, Number(u.id), dto);
  }

  /** Duyệt/từ chối hồ sơ đối tác, có nhật ký và thông báo (Phần 14.7). */
  private async decide(admin: AuthUser, kind: 'store' | 'rider', id: number, status: 'APPROVED' | 'REJECTED', reason: string | null) {
    return this.db.tx(async (client) => {
      const sql =
        kind === 'store'
          ? `UPDATE stores SET status = $2 WHERE id = $1 RETURNING owner_user_id AS user_id`
          : `UPDATE riders SET status = $2 WHERE user_id = $1 RETURNING user_id`;
      const { rows } = await client.query(sql, [id, status]);
      if (!rows[0]) throw new BusinessError(kind === 'store' ? 'STORE_NOT_FOUND' : 'RIDER_NOT_FOUND', 'Không tìm thấy hồ sơ', 404);
      await audit(client, admin.id, `${kind.toUpperCase()}_${status}`, kind, String(id), null, { status }, reason);
      await client.query(`INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1, 'PUSH', $2, $3)`, [
        rows[0].user_id,
        `${kind.toUpperCase()}_${status}`,
        JSON.stringify({ id, reason }),
      ]);
      // Duyệt xong cấp luôn mã kích hoạt để Admin gửi cho đối tác.
      const activation = status === 'APPROVED' ? await this.auth.issueActivationCode(Number(rows[0].user_id), admin.id, false, client) : null;
      return { id, status, decidedBy: admin.id, activation };
    });
  }
}

@Module({ imports: [OrdersModule, AuthModule], controllers: [AdminController, AdminManageController] })
export class AdminModule {}
