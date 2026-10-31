import { Body, Controller, Delete, Get, Global, HttpCode, Inject, Module, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Allow, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { AiGateway } from '../ai/ai.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { DATABASE, Database } from '../database/database';
import { ConfigCenter } from './config.service';
import { EntitlementService, REASON_CODES } from './entitlements.service';
import { ConfigScope } from './registry';

class SetConfigDto {
  @IsIn(['GLOBAL', 'CATEGORY', 'STORE']) scope!: ConfigScope;
  @IsOptional() @IsString() @MaxLength(60) scopeId?: string;
  @Allow() value!: unknown;
  @Length(3, 300) reason!: string;
}

class RollbackDto {
  @IsIn(['GLOBAL', 'CATEGORY', 'STORE']) scope!: ConfigScope;
  @IsOptional() @IsString() scopeId?: string;
  @IsInt() @Min(1) version!: number;
  @Length(3, 300) reason!: string;
}

class ClearDto {
  @IsIn(['GLOBAL', 'CATEGORY', 'STORE']) scope!: ConfigScope;
  @IsOptional() @IsString() scopeId?: string;
  @Length(3, 300) reason!: string;
}

class EntitlementDto {
  @IsIn(['CUSTOMER', 'STORE', 'RIDER']) subject!: 'CUSTOMER' | 'STORE' | 'RIDER';
  @IsInt() subjectId!: number;
  @IsString() key!: string;
  @Allow() value!: unknown;
  @IsIn(REASON_CODES as unknown as string[]) reasonCode!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsInt() @Min(1) @Max(90) days!: number;
}

class TierOverrideDto {
  @IsIn(['STORE', 'RIDER']) subject!: 'STORE' | 'RIDER';
  @IsInt() subjectId!: number;
  @IsIn(['SET_TIER', 'LOCK']) action!: 'SET_TIER' | 'LOCK';
  @IsOptional() @IsIn(['DIAMOND', 'GOLD', 'SILVER', 'BRONZE', 'ROOKIE', 'IMPROVE']) tier?: string;
  @IsIn(REASON_CODES as unknown as string[]) reasonCode!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsInt() @Min(1) @Max(90) days!: number;
}

class RevokeDto {
  @Length(3, 300) reason!: string;
}

class AiProviderDto {
  @IsOptional() @IsString() @Length(2, 80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(300) baseUrl?: string;
  @IsOptional() @IsString() @Length(8, 400) apiKey?: string;
}

class AiTaskDto {
  @IsOptional() @IsString() providerCode?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() fallbackProviderCode?: string;
  @IsOptional() @IsString() @MaxLength(120) fallbackModel?: string;
}

/** Trung tâm cấu hình phân tầng (Phần 14.6) — chỉ ADMIN. */
@Controller('v1/admin/config')
@Roles('ADMIN')
export class AdminConfigController {
  constructor(private readonly config: ConfigCenter) {}

  @Get()
  list() {
    return { definitions: this.config.list() };
  }

  @Get(':key/resolve')
  resolve(@Param('key') key: string, @Query('storeId') storeId?: string, @Query('category') category?: string) {
    return this.config.resolve(key, { storeId, category });
  }

  @Get(':key/history')
  history(@Param('key') key: string) {
    return this.config.history(key);
  }

  @Put(':key')
  set(@CurrentUser() admin: AuthUser, @Param('key') key: string, @Body() dto: SetConfigDto) {
    return this.config.set(admin.id, key, dto.scope, dto.scopeId ?? '', dto.value, dto.reason);
  }

  @Post(':key/rollback')
  @HttpCode(200)
  rollback(@CurrentUser() admin: AuthUser, @Param('key') key: string, @Body() dto: RollbackDto) {
    return this.config.rollback(admin.id, key, dto.scope, dto.scopeId ?? '', dto.version, dto.reason);
  }

  @Delete(':key')
  clear(@CurrentUser() admin: AuthUser, @Param('key') key: string, @Body() dto: ClearDto) {
    return this.config.clear(admin.id, key, dto.scope, dto.scopeId ?? '', dto.reason);
  }
}

/** Phân quyền chức năng & điều chỉnh cấp của người dùng (Phần 15) — ADMIN và Ops. */
@Controller('v1/admin/users')
@Roles('ADMIN', 'OPS')
export class AdminEntitlementController {
  constructor(
    private readonly entitlements: EntitlementService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get('entitlements/definitions')
  definitions() {
    return { definitions: this.entitlements.definitions(), reasonCodes: REASON_CODES };
  }

  @Get(':subject/:id/entitlements')
  async effective(@Param('subject') subject: 'CUSTOMER' | 'STORE' | 'RIDER', @Param('id', ParseIntPipe) id: number) {
    const overrides = await this.db.query(
      `SELECT id, key, value, reason_code, note, effective_to, created_at FROM user_entitlements
       WHERE subject_type = $1 AND subject_id = $2 AND status = 'ACTIVE' AND effective_to > now() ORDER BY created_at DESC`,
      [subject, id],
    );
    return { effective: await this.entitlements.effective(this.db, subject, id), overrides: overrides.rows };
  }

  @Post('entitlements')
  set(@CurrentUser() admin: AuthUser, @Body() dto: EntitlementDto) {
    return this.entitlements.set(admin.id, dto);
  }

  @Post('entitlements/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RevokeDto) {
    return this.entitlements.revoke(admin.id, id, dto.reason);
  }

  @Post('tier-overrides')
  @Roles('ADMIN')
  overrideTier(@CurrentUser() admin: AuthUser, @Body() dto: TierOverrideDto) {
    return this.entitlements.overrideTier(admin.id, dto);
  }

  @Get('audit-logs')
  @Roles('ADMIN')
  async auditLogs(@Query('targetType') targetType?: string, @Query('targetId') targetId?: string) {
    const { rows } = await this.db.query(
      `SELECT a.action, a.target_type, a.target_id, a.before, a.after, a.reason, a.created_at, u.phone AS actor_phone
       FROM admin_audit_logs a JOIN users u ON u.id = a.actor_id
       WHERE ($1::text IS NULL OR a.target_type = $1) AND ($2::text IS NULL OR a.target_id = $2)
       ORDER BY a.id DESC LIMIT 200`,
      [targetType ?? null, targetId ?? null],
    );
    return { logs: rows };
  }
}

/** Kết nối AI do Admin nhập — mặc định Groq (Phần 12.8). */
@Controller('v1/admin/ai')
@Roles('ADMIN')
export class AdminAiController {
  constructor(private readonly ai: AiGateway) {}

  @Get()
  overview() {
    return this.ai.overview();
  }

  @Put('providers/:code')
  upsert(@CurrentUser() admin: AuthUser, @Param('code') code: string, @Body() dto: AiProviderDto) {
    return this.ai.upsertProvider(admin.id, { code, ...dto });
  }

  @Post('providers/:code/test')
  @HttpCode(200)
  test(@Param('code') code: string) {
    return this.ai.testConnection(code);
  }

  @Put('tasks/:task')
  setTask(@CurrentUser() admin: AuthUser, @Param('task') task: string, @Body() dto: AiTaskDto) {
    return this.ai.setTask(admin.id, task, dto);
  }
}

/** Quyền chức năng hiệu lực của chính người dùng, để app ẩn/hiện đúng (Phần 6.4). */
@Controller('v1/me')
export class MyCapabilitiesController {
  constructor(
    private readonly entitlements: EntitlementService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get('capabilities')
  async mine(@CurrentUser() user: AuthUser) {
    return { customer: await this.entitlements.effective(this.db, 'CUSTOMER', user.id) };
  }
}

@Global()
@Module({
  controllers: [AdminConfigController, AdminEntitlementController, AdminAiController, MyCapabilitiesController],
  providers: [ConfigCenter, EntitlementService, AiGateway],
  exports: [ConfigCenter, EntitlementService, AiGateway],
})
export class ConfigCenterModule {}
