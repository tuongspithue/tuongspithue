import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DATABASE, Database } from '../database/database';

export type Role = 'CUSTOMER' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF' | 'RIDER' | 'OPS' | 'ADMIN';

export interface AuthUser {
  id: number;
  roles: Array<{ role: Role; scopeId: number }>;
  /** Mã máy của phiên khách (đăng nhập không xác minh). Không có = phiên đối tác do Admin kích hoạt. */
  device?: string;
  /** Phiên đối tác được mở bằng gì: mã kích hoạt hay mật khẩu (đổi mật khẩu khi đăng nhập bằng mật khẩu phải nhập mật khẩu cũ). */
  via?: 'code' | 'password';
}

/** Thao tác đối tác (mở quán, đăng ký shipper) cần phiên do Admin kích hoạt, không dùng phiên khách. */
export function assertPartnerSession(user: AuthUser): void {
  if (user.device) throw new ForbiddenException('Hãy đăng ký trong app đối tác; Admin sẽ xác minh và gửi mã kích hoạt');
}

/**
 * Khách có phải chủ đơn này không. Phiên khách chỉ thấy đơn đặt từ chính máy đó,
 * vì ai cũng có thể nhập một số điện thoại bất kỳ để đặt hàng.
 */
export function ownsOrder(user: AuthUser, order: Record<string, any>): boolean {
  if (Number(order.customer_id) !== user.id) return false;
  return !user.device || order.customer_device === user.device;
}

export function hasRole(user: AuthUser, ...roles: Role[]): boolean {
  return user.roles.some((r) => roles.includes(r.role));
}

/** Người dùng có làm việc cho quán này không (chủ hoặc nhân viên). */
export function worksAtStore(user: AuthUser, storeId: number): boolean {
  return user.roles.some(
    (r) => (r.role === 'MERCHANT_OWNER' || r.role === 'MERCHANT_STAFF') && r.scopeId === storeId,
  );
}

const IS_PUBLIC = 'isPublic';
const ROLES = 'roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/**
 * Xác thực JWT, rồi nạp vai trò mới nhất từ CSDL ở mỗi yêu cầu để thay đổi quyền
 * (duyệt quán, khoá tài khoản) có hiệu lực ngay, không chờ token hết hạn.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Cần đăng nhập');
    let payload: { sub: string; k?: 'C' | 'P'; d?: string; v?: number; m?: 'code' | 'password' };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }
    const userId = Number(payload.sub);
    const user = await this.db.one<{ status: string; session_version: number }>('SELECT status, session_version FROM users WHERE id = $1', [userId]);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không hoạt động');
    let authUser: AuthUser;
    if (payload.k === 'C' && payload.d) {
      // Phiên khách chỉ có quyền khách, kể cả khi số này cũng là của một đối tác.
      authUser = { id: userId, roles: [{ role: 'CUSTOMER', scopeId: 0 }], device: payload.d };
    } else if (payload.k === 'P' && payload.v === user.session_version) {
      const { rows } = await this.db.query<{ role: Role; scope_id: string }>(
        'SELECT role, scope_id FROM user_roles WHERE user_id = $1',
        [userId],
      );
      authUser = { id: userId, roles: rows.map((r) => ({ role: r.role, scopeId: Number(r.scope_id) })), via: payload.m ?? 'code' };
    } else {
      throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại');
    }
    req.user = authUser;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (required?.length && !hasRole(authUser, ...required)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
