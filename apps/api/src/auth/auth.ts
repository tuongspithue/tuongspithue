import { Body, Controller, HttpCode, Inject, Injectable, Module, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsString, Matches } from 'class-validator';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { BusinessError } from '../common/errors';
import { Public } from '../common/auth';
import { DATABASE, Database } from '../database/database';

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const PHONE = /^0\d{9}$/;

class OtpRequestDto {
  @Matches(PHONE, { message: 'Số điện thoại không hợp lệ (VD 0901234567)' })
  phone!: string;
}

class OtpVerifyDto extends OtpRequestDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã OTP gồm 6 chữ số' })
  code!: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  private hash(phone: string, code: string) {
    return createHmac('sha256', this.config.jwtSecret).update(`${phone}:${code}`).digest('hex');
  }

  async requestOtp(phone: string): Promise<{ sent: true; devCode?: string }> {
    const existing = await this.db.one<{ expires_at: Date }>('SELECT expires_at FROM otp_codes WHERE phone = $1', [phone]);
    if (existing) {
      const createdAt = existing.expires_at.getTime() - OTP_TTL_SECONDS * 1000;
      if (Date.now() - createdAt < OTP_RESEND_SECONDS * 1000) {
        throw new BusinessError('OTP_TOO_SOON', 'Vui lòng đợi 60 giây trước khi gửi lại mã', 429);
      }
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO otp_codes (phone, code_hash, attempts, expires_at)
       VALUES ($1, $2, 0, now() + make_interval(secs => $3))
       ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at`,
      [phone, this.hash(phone, code), OTP_TTL_SECONDS],
    );
    // TODO(SMS/ZNS): gửi mã qua nhà cung cấp SMS brandname / Zalo ZNS (Phần 5.1).
    return this.config.otpDevEcho ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(phone: string, code: string): Promise<{ accessToken: string; userId: number }> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<{ code_hash: string; attempts: number; expires_at: Date }>(
        'SELECT code_hash, attempts, expires_at FROM otp_codes WHERE phone = $1 FOR UPDATE',
        [phone],
      );
      const otp = rows[0];
      if (!otp || otp.expires_at.getTime() < Date.now() || otp.attempts >= OTP_MAX_ATTEMPTS) {
        throw new BusinessError('OTP_INVALID', 'Mã OTP đã hết hạn, vui lòng yêu cầu mã mới', 401);
      }
      const expected = Buffer.from(otp.code_hash, 'hex');
      const actual = Buffer.from(this.hash(phone, code), 'hex');
      if (!timingSafeEqual(expected, actual)) {
        await client.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1', [phone]);
        throw new BusinessError('OTP_WRONG', 'Mã OTP không đúng', 401);
      }
      await client.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);

      const user = await client.query<{ id: string }>(
        `INSERT INTO users (phone) VALUES ($1)
         ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
        [phone],
      );
      const userId = Number(user.rows[0].id);
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'CUSTOMER') ON CONFLICT DO NOTHING`,
        [userId],
      );
      if (this.config.adminPhones.includes(phone)) {
        await client.query(
          `INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN'), ($1, 'OPS') ON CONFLICT DO NOTHING`,
          [userId],
        );
      }
      const accessToken = await this.jwt.signAsync({ sub: String(userId) });
      return { accessToken, userId };
    });
  }
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  request(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verify(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
