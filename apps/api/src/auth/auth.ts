import { Body, Controller, HttpCode, Inject, Injectable, Module, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, IsString, Length, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PoolClient } from 'pg';
import { Queryable } from '../database/database';
import { APP_CONFIG, AppConfig } from '../config';
import { BusinessError } from '../common/errors';
import { Public } from '../common/auth';
import { DATABASE, Database } from '../database/database';
import { CreateStoreDto, StoresModule, StoresService } from '../stores/stores';
import { activationHash, createActivationCode } from './activation';

const PHONE = /^0\d{9}$/;
const PHONE_MESSAGE = 'Số điện thoại không hợp lệ (VD 0901234567)';
const DAY = 86_400;
const CUSTOMER_TOKEN_SECONDS = 180 * DAY;
const PARTNER_TOKEN_SECONDS = 180 * DAY;
const CODE_MAX_ATTEMPTS = 5;
const PARTNER_ROLES = ['MERCHANT_OWNER', 'MERCHANT_STAFF', 'RIDER', 'OPS', 'ADMIN'];

/** Nội dung token: `k` = C (khách, kèm mã máy `d`) hoặc P (đối tác, kèm phiên bản phiên `v`). */
export type TokenPayload = { sub: string; k: 'C'; d: string } | { sub: string; k: 'P'; v: number };

class CustomerSignInDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @IsString() @Length(1, 120, { message: 'Vui lòng nhập tên để quán/shipper xưng hô' }) name!: string;
}

class ActivateDto {
  @Matches(PHONE, { message: PHONE_MESSAGE }) phone!: string;
  @Matches(/^\d{8}$/, { message: 'Mã kích hoạt gồm 8 chữ số' }) code!: string;
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
      const payload: TokenPayload = { sub: String(userId), k: 'P', v: row.session_version };
      const accessToken = await this.jwt.signAsync(payload, { expiresIn: PARTNER_TOKEN_SECONDS });
      return { accessToken, userId };
    });
    if (!result) throw new BusinessError('CODE_WRONG', 'Mã kích hoạt không đúng', 401);
    return result;
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
  @Post('partner-apply')
  @HttpCode(201)
  apply(@Body() dto: ApplyDto) {
    return this.auth.apply(dto);
  }
}

@Module({ imports: [StoresModule], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
