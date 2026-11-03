import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, IsString, Length, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PoolClient } from 'pg';
import { Queryable } from '../database/database';
import { APP_CONFIG, AppConfig } from '../config';
import { BusinessError } from '../common/errors';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { DATABASE, Database } from '../database/database';
import { CreateStoreDto, StoresModule, StoresService } from '../stores/stores';
import { activationHash, createActivationCode } from './activation';
import { hashPassword, verifyPassword } from './password';

const PHONE = /^0\d{9}$/;
const PHONE_MESSAGE = 'Số điện thoại không hợp lệ (VD 0901234567)';
const DAY = 86_400;
const CUSTOMER_TOKEN_SECONDS = 180 * DAY;
const PARTNER_TOKEN_SECONDS = 180 * DAY;
const CODE_MAX_ATTEMPTS = 5;
const PARTNER_ROLES = ['MERCHANT_OWNER', 'MERCHANT_STAFF', 'RIDER', 'OPS', 'ADMIN'];
const STAFF_ROLES = ['ADMIN', 'OPS'];
// Phiên đăng nhập bằng mật khẩu ngắn hơn phiên mã kích hoạt: máy tính văn phòng hay dùng chung.
const PASSWORD_TOKEN_SECONDS = 30 * DAY;
const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MINUTES = 15;

/** Nội dung token: `k` = C (khách, kèm mã máy `d`) hoặc P (đối tác, kèm phiên bản phiên `v`). */
export type TokenPayload = { sub: string; k: 'C'; d: string } | { sub: string; k: 'P'; v: number; m?: 'code' | 'password' };

class CustomerSignInDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @IsString() @Length(1, 120, { message: 'Vui lòng nhập tên để quán/shipper xưng hô' }) name!: string;
}

class ActivateDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @Matches(/^\d{8}$/, { message: 'Mã kích hoạt gồm 8 chữ số' }) code!: string;
}

class PasswordLoginDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @IsString() @Length(1, 200) password!: string;
}

class SetPasswordDto {
  @IsOptional() @IsString() @Length(1, 200) currentPassword?: string;
  @IsString()
  @Length(8, 200, { message: 'Mật khẩu cần ít nhất 8 ký tự' })
  @Matches(/^(?!\d+$)/, { message: 'Mật khẩu không được chỉ toàn chữ số' })
  newPassword!: string;
}

class ApplyDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsIn(['RIDER', 'MERCHANT']) kind!: 'RIDER' | 'MERCHANT';
  @ValidateIf((o) => o.kind === 'RIDER') @IsIn(['MOTORBIKE', 'EMOTORBIKE', 'CARGO']) vehicleType?: string;
  @IsOptional() @Length(4, 20) plateNumber?: string;
  @ValidateIf((o) => o.kind === 'MERCHANT') @IsDefined({ message: 'Cần thông tin quán' }) @ValidateNested() @Type(() => CreateStoreDto) store?: CreateStoreDto;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly stores: StoresService,
  ) {}

  private async upsertUser(client: Queryable, phone: string, name?: string): Promise<number> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (phone, full_name) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET full_name = COALESCE(users.full_name, EXCLUDED.full_name) RETURNING id`,
      [phone, name ?? null],
    );
    const id = Number(rows[0].id);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'CUSTOMER') ON CONFLICT DO NOTHING`, [id]);
    return id;
  }

  /**
   * Khách: không cần mã xác minh — quán/shipper nhận đơn sẽ gọi lại xác minh (Phần 13.9).
   * Token chỉ mang quyền khách và gắn với máy này, nên người nhập trùng số của người khác
   * cũng không xem/huỷ được đơn của họ và không dùng được quyền đối tác.
   */
  async customerSignIn(phone: string, name: string) {
    const userId = await this.upsertUser(this.db, phone, name.trim());
    const device = randomBytes(12).toString('hex');
    const payload: TokenPayload = { sub: String(userId), k: 'C', d: device };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: CUSTOMER_TOKEN_SECONDS });
    return { accessToken, userId };
  }

  /**
   * Admin cấp mã kích hoạt 8 số (hết hạn sau 3 ngày, dùng 1 lần) để gửi cho đối tác qua Zalo/SMS từ máy Admin.
   * `revokeOthers`: đăng xuất mọi máy đang đăng nhập của người này (VD: mất điện thoại).
   */
  async issueActivationCode(userId: number, issuedBy: number | null, revokeOthers = false, client?: PoolClient) {
    const run = async (c: PoolClient) => {
      const u = await c.query<{ phone: string; full_name: string | null }>('SELECT phone, full_name FROM users WHERE id = $1', [userId]);
      if (!u.rows[0]) throw new BusinessError('USER_NOT_FOUND', 'Không tìm thấy người dùng', 404);
      const { code, expiresAt } = await createActivationCode(c, this.config.jwtSecret, userId, issuedBy, revokeOthers);
      return {
        userId,
        phone: u.rows[0].phone,
        code,
        expiresAt,
        // Tin soạn sẵn để Admin bấm gửi qua Zalo/SMS.
        message: `Ship Quanh Tôi: mã kích hoạt app của bạn là ${code} (hết hạn ${expiresAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}). Không chia sẻ mã này cho ai.`,
      };
    };
    return client ? run(client) : this.db.tx(run);
  }

  /** Đối tác nhập số + mã kích hoạt Admin gửi để đăng nhập app. */
  async activate(phone: string, code: string) {
    const result = await this.db.tx(async (client) => {
      const { rows } = await client.query<{ user_id: string; code_hash: string; attempts: number; expires_at: Date; session_version: number }>(
        `SELECT a.user_id, a.code_hash, a.attempts, a.expires_at, u.session_version
         FROM activation_codes a JOIN users u ON u.id = a.user_id WHERE u.phone = $1 FOR UPDATE OF a`,
        [phone],
      );
      const row = rows[0];
      if (!row || row.expires_at.getTime() < Date.now() || row.attempts >= CODE_MAX_ATTEMPTS) {
        throw new BusinessError('CODE_INVALID', 'Mã kích hoạt đã hết hạn hoặc chưa được cấp. Vui lòng liên hệ Admin để nhận mã mới', 401);
      }
      const userId = Number(row.user_id);
      const expected = Buffer.from(row.code_hash, 'hex');
      const actual = Buffer.from(activationHash(this.config.jwtSecret, userId, code), 'hex');
      if (!timingSafeEqual(expected, actual)) {
        // Không ném lỗi trong giao dịch, nếu không lần đếm sai sẽ bị huỷ theo và mã dò được vô hạn.
        await client.query('UPDATE activation_codes SET attempts = attempts + 1 WHERE user_id = $1', [userId]);
        return null;
      }
      await client.query('DELETE FROM activation_codes WHERE user_id = $1', [userId]);
      if (this.config.adminPhones.includes(phone)) {
        await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN'), ($1, 'OPS') ON CONFLICT DO NOTHING`, [userId]);
      }
      const payload: TokenPayload = { sub: String(userId), k: 'P', v: row.session_version, m: 'code' };
      const accessToken = await this.jwt.signAsync(payload, { expiresIn: PARTNER_TOKEN_SECONDS });
      return { accessToken, userId };
    });
    if (!result) throw new BusinessError('CODE_WRONG', 'Mã kích hoạt không đúng', 401);
    return result;
  }

  /**
   * Admin/Ops đăng nhập Admin Console bằng SĐT + mật khẩu tự đặt (Phần 13.9).
   * Sai 5 lần thì khoá 15 phút; lần đếm sai được lưu ngoài giao dịch để không bị huỷ theo lỗi.
   */
  async passwordLogin(phone: string, password: string) {
    const u = await this.db.one<{ id: string; password_hash: string | null; password_failed: number; password_locked_until: Date | null; session_version: number; status: string; staff: boolean }>(
      `SELECT u.id, u.password_hash, u.password_failed, u.password_locked_until, u.session_version, u.status,
              EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = ANY($2)) AS staff
       FROM users u WHERE u.phone = $1`,
      [phone, STAFF_ROLES],
    );
    const wrong = new BusinessError('PASSWORD_WRONG', 'Số điện thoại hoặc mật khẩu không đúng', 401);
    if (!u || !u.staff || !u.password_hash) {
      // Không tiết lộ số này có tài khoản hay chưa đặt mật khẩu.
      throw u?.staff && !u.password_hash
        ? new BusinessError('PASSWORD_NOT_SET', 'Tài khoản chưa đặt mật khẩu. Đăng nhập bằng mã kích hoạt rồi đặt mật khẩu trong mục "Tài khoản"', 401)
        : wrong;
    }
    if (u.status !== 'ACTIVE') throw new BusinessError('ACCOUNT_LOCKED', 'Tài khoản đã bị khoá', 403);
    if (u.password_locked_until && u.password_locked_until.getTime() > Date.now()) {
      const min = Math.ceil((u.password_locked_until.getTime() - Date.now()) / 60_000);
      throw new BusinessError('PASSWORD_LOCKED', `Nhập sai quá nhiều lần. Thử lại sau ${min} phút hoặc đăng nhập bằng mã kích hoạt`, 429);
    }
    if (!(await verifyPassword(password, u.password_hash))) {
      await this.db.query(
        `UPDATE users SET password_failed = password_failed + 1,
           password_locked_until = CASE WHEN password_failed + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE password_locked_until END
         WHERE id = $1`,
        [u.id, PASSWORD_MAX_FAILS, PASSWORD_LOCK_MINUTES],
      );
      throw wrong;
    }
    await this.db.query('UPDATE users SET password_failed = 0, password_locked_until = NULL WHERE id = $1', [u.id]);
    const payload: TokenPayload = { sub: String(u.id), k: 'P', v: u.session_version, m: 'password' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: PASSWORD_TOKEN_SECONDS });
    return { accessToken, userId: Number(u.id) };
  }

  /**
   * Đặt/đổi mật khẩu. Đang đăng nhập bằng mật khẩu thì phải nhập mật khẩu cũ; đăng nhập bằng mã kích hoạt
   * (VD quên mật khẩu) thì không cần. Đổi xong đăng xuất mọi máy khác, trả phiên mới cho máy này.
   */
  async setPassword(user: AuthUser, dto: SetPasswordDto) {
    if (user.device || !user.roles.some((r) => STAFF_ROLES.includes(r.role))) {
      throw new BusinessError('NOT_STAFF', 'Chỉ tài khoản Admin/Ops mới đặt mật khẩu', 403);
    }
    const u = await this.db.one<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (u?.password_hash && user.via === 'password') {
      if (!dto.currentPassword || !(await verifyPassword(dto.currentPassword, u.password_hash))) {
        throw new BusinessError('PASSWORD_WRONG', 'Mật khẩu hiện tại không đúng', 401);
      }
    }
    const hash = await hashPassword(dto.newPassword);
    const { rows } = await this.db.query<{ session_version: number }>(
      `UPDATE users SET password_hash = $2, password_failed = 0, password_locked_until = NULL, session_version = session_version + 1
       WHERE id = $1 RETURNING session_version`,
      [user.id, hash],
    );
    const payload: TokenPayload = { sub: String(user.id), k: 'P', v: rows[0].session_version, m: 'password' };
    return { accessToken: await this.jwt.signAsync(payload, { expiresIn: PASSWORD_TOKEN_SECONDS }), message: 'Đã lưu mật khẩu. Các máy khác đã bị đăng xuất.' };
  }

  async me(user: AuthUser) {
    const u = await this.db.one<{ phone: string; full_name: string | null; password_hash: string | null }>('SELECT phone, full_name, password_hash FROM users WHERE id = $1', [user.id]);
    return { id: user.id, phone: u?.phone, name: u?.full_name ?? null, roles: user.roles.map((r) => r.role), hasPassword: !!u?.password_hash, via: user.via ?? null };
  }

  /**
   * Đăng ký làm đối tác ngay trong app, chưa cần đăng nhập. Hồ sơ chờ Admin gọi xác minh và duyệt;
   * duyệt xong Admin gửi mã kích hoạt (Phần 15).
   */
  async apply(dto: ApplyDto) {
    const userId = await this.db.tx(async (client) => {
      const id = await this.upsertUser(client, dto.phone, dto.fullName.trim());
      const roles = await client.query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role = ANY($2)`, [id, PARTNER_ROLES]);
      const rider = await client.query('SELECT 1 FROM riders WHERE user_id = $1', [id]);
      if (roles.rowCount || rider.rowCount) {
        throw new BusinessError('ALREADY_PARTNER', 'Số này đã đăng ký đối tác. Hãy đăng nhập bằng mã kích hoạt, hoặc liên hệ Admin', 409);
      }
      if (dto.kind === 'RIDER') {
        await client.query(`INSERT INTO riders (user_id, vehicle_type, plate_number) VALUES ($1, $2, $3)`, [id, dto.vehicleType, dto.plateNumber ?? null]);
        await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'RIDER') ON CONFLICT DO NOTHING`, [id]);
      }
      return id;
    });
    if (dto.kind === 'MERCHANT') await this.stores.create({ id: userId, roles: [] }, dto.store!);
    return { status: 'PENDING', message: 'Đã gửi hồ sơ. Admin sẽ gọi cho bạn để xác minh rồi gửi mã kích hoạt qua Zalo/SMS.' };
  }
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('customer')
  @HttpCode(200)
  customer(@Body() dto: CustomerSignInDto) {
    return this.auth.customerSignIn(dto.phone, dto.name);
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  activate(@Body() dto: ActivateDto) {
    return this.auth.activate(dto.phone, dto.code);
  }

  @Public()
  @Post('password-login')
  @HttpCode(200)
  passwordLogin(@Body() dto: PasswordLoginDto) {
    return this.auth.passwordLogin(dto.phone, dto.password);
  }

  @Post('password')
  @Roles('ADMIN', 'OPS')
  @HttpCode(200)
  setPassword(@CurrentUser() user: AuthUser, @Body() dto: SetPasswordDto) {
    return this.auth.setPassword(user, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Public()
  @Post('partner-apply')
  @HttpCode(201)
  apply(@Body() dto: ApplyDto) {
    return this.auth.apply(dto);
  }
}

@Module({ imports: [StoresModule], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
