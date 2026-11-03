import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth';
import { migrate } from '../src/database/migrate';
import { configureApp } from '../src/main';
import { JobsService } from '../src/orders/jobs';

export const ADMIN_PHONE = '0900000001';
const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://sqt:sqt@localhost:5432/sqt_test';

/** Toạ độ mẫu quanh một quán ở Quận 1, TP.HCM. */
export const STORE_AT = { lat: 10.7769, lng: 106.7009 };
export const offset = (meters: number) => ({ lat: STORE_AT.lat + meters / 111_320, lng: STORE_AT.lng });

export interface TestContext {
  app: INestApplication;
  pool: Pool;
  jobs: JobsService;
  http: () => ReturnType<typeof request>;
  /** Đăng nhập như đối tác: cấp mã kích hoạt trực tiếp rồi kích hoạt qua API. */
  login: (phone: string) => Promise<{ token: string; userId: number }>;
  /** Đăng nhập như khách trên web app (không xác minh). */
  customerLogin: (phone: string, name?: string) => Promise<{ token: string; userId: number }>;
  issueCode: (phone: string, revokeOthers?: boolean) => Promise<string>;
  close: () => Promise<void>;
}

export async function setup(): Promise<TestContext> {
  process.env.DATABASE_URL = DB_URL;
  process.env.JOBS_WORKER = 'off';
  process.env.ADMIN_PHONES = ADMIN_PHONE;

  const pool = new Pool({ connectionString: DB_URL });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const http = () => request(app.getHttpServer());

  const issueCode = async (phone: string, revokeOthers = false) => {
    const { rows } = await pool.query(
      `INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
      [phone],
    );
    return (await app.get(AuthService).issueActivationCode(Number(rows[0].id), null, revokeOthers)).code;
  };
  const login = async (phone: string) => {
    const code = await issueCode(phone);
    const res = await http().post('/v1/auth/activate').send({ phone, code }).expect(200);
    return { token: res.body.accessToken as string, userId: res.body.userId as number };
  };
  const customerLogin = async (phone: string, name = 'Khách thử') => {
    const res = await http().post('/v1/auth/customer').send({ phone, name }).expect(200);
    return { token: res.body.accessToken as string, userId: res.body.userId as number };
  };

  return {
    app,
    pool,
    jobs: app.get(JobsService),
    http,
    login,
    customerLogin,
    issueCode,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let keySeq = 0;
export const idemKey = () => `test-key-${Date.now()}-${++keySeq}`;
