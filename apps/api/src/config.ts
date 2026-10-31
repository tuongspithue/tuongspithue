import { DEFAULT_DELIVERY_FEE_PARAMS, DEFAULT_GATE_A_STEPS, SlaStep } from '@sqt/domain';

/**
 * Cấu hình chạy. Tham số nghiệp vụ dưới đây là giá trị mặc định; về sau đọc từ
 * trung tâm cấu hình phân tầng do Admin chỉnh (Phần 14.6).
 */
export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  /** Trả mã OTP trong phản hồi — chỉ dùng khi phát triển, không bao giờ bật ở production. */
  otpDevEcho: boolean;
  /** Số điện thoại được cấp vai trò ADMIN khi đăng nhập (khởi tạo hệ thống). */
  adminPhones: string[];
  business: {
    serviceFee: number;
    gateASteps: readonly SlaStep[];
    deliveryFee: typeof DEFAULT_DELIVERY_FEE_PARAMS;
    /** Hệ số quy đổi đường chim bay → đường đi khi chưa có dịch vụ định tuyến (Phần 5.11). */
    routeFactor: number;
    dispatchWaves: ReadonlyArray<{ radiusM: number; maxRiders: number; offerSeconds: number; bonus: number }>;
    riderEarningShare: number;
    storeGeofenceM: number;
    dropoffGeofenceM: number;
    pinThreshold: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProd ? '' : 'dev-only-secret');
  if (!jwtSecret) throw new Error('Thiếu JWT_SECRET');
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://sqt:sqt@localhost:5432/sqt',
    jwtSecret,
    jwtTtlSeconds: Number(env.JWT_TTL_SECONDS ?? 900),
    otpDevEcho: !isProd && env.OTP_DEV_ECHO === 'true',
    adminPhones: (env.ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean),
    business: {
      serviceFee: 2_000,
      gateASteps: DEFAULT_GATE_A_STEPS,
      deliveryFee: DEFAULT_DELIVERY_FEE_PARAMS,
      routeFactor: 1.3,
      dispatchWaves: [
        { radiusM: 1500, maxRiders: 1, offerSeconds: 20, bonus: 0 },
        { radiusM: 2500, maxRiders: 1, offerSeconds: 20, bonus: 0 },
        { radiusM: 3500, maxRiders: 3, offerSeconds: 25, bonus: 0 },
        { radiusM: 5000, maxRiders: 5, offerSeconds: 30, bonus: 5_000 },
      ],
      riderEarningShare: 0.85,
      storeGeofenceM: 100,
      dropoffGeofenceM: 150,
      pinThreshold: 1_000_000,
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
