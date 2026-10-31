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
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }
    const userId = Number(payload.sub);
    const user = await this.db.one<{ status: string }>('SELECT status FROM users WHERE id = $1', [userId]);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không hoạt động');
    const { rows } = await this.db.query<{ role: Role; scope_id: string }>(
      'SELECT role, scope_id FROM user_roles WHERE user_id = $1',
      [userId],
    );
    const authUser: AuthUser = { id: userId, roles: rows.map((r) => ({ role: r.role, scopeId: Number(r.scope_id) })) };
    req.user = authUser;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (required?.length && !hasRole(authUser, ...required)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
