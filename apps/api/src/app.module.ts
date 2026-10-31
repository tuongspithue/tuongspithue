import { Controller, Get, Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Pool } from 'pg';
import { AdminModule } from './admin/admin';
import { AuthModule } from './auth/auth';
import { AuthGuard, Public } from './common/auth';
import { ErrorFilter } from './common/errors';
import { APP_CONFIG, AppConfig, loadConfig } from './config';
import { DATABASE, Database } from './database/database';
import { OrdersModule } from './orders/orders.module';
import { StoresModule } from './stores/stores';
import { ConfigCenterModule } from './config-center/config-center.module';

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new Database(new Pool({ connectionString: config.databaseUrl, max: 20 })),
    },
  ],
  exports: [APP_CONFIG, DATABASE],
})
class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  onApplicationShutdown() {
    return this.db.close();
  }
}

@Controller()
class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    CoreModule,
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtTtlSeconds } }),
    }),
    ConfigCenterModule,
    AuthModule,
    StoresModule,
    OrdersModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
