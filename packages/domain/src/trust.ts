/**
 * Điểm uy tín phiên bản 1 — Phần 11 (lộ trình MVP, Phần 8.1): hoàn thành, xác nhận, sao Bayes,
 * giữ cam kết chuyến hẹn. Điểm 0–100, phai dần theo thời gian (hằng số 30 ngày).
 * Bản này dùng thang tuyệt đối; chuẩn hoá theo phân vị khu vực (11.2) bật khi khu đủ dữ liệu.
 */

export const TrustTier = {
  DIAMOND: 'DIAMOND',
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  BRONZE: 'BRONZE',
  ROOKIE: 'ROOKIE',
  IMPROVE: 'IMPROVE',
} as const;
export type TrustTier = (typeof TrustTier)[keyof typeof TrustTier];

export const ROOKIE_MAX_ORDERS = 30;
export const ROOKIE_DEFAULT_SCORE = 70;
export const BAYES_C = 20;
const DECAY_DAYS = 30;

export interface WeightedOutcome {
  /** 1 = tốt (hoàn thành, nhận đơn), 0 = xấu (huỷ, lỡ đơn). */
  value: 0 | 1;
  ageDays: number;
}

/** Tỷ lệ có trọng số phai dần: sự kiện gần đây quan trọng hơn (11.2). null nếu chưa có dữ liệu. */
export function decayedRate(outcomes: WeightedOutcome[]): number | null {
  let num = 0;
  let den = 0;
  for (const o of outcomes) {
    const w = Math.exp(-Math.max(0, o.ageDays) / DECAY_DAYS);
    num += o.value * w;
    den += w;
  }
  return den === 0 ? null : num / den;
}

/** Sao Bayes: quán mới vài đánh giá 5★ không vượt quán nhiều đánh giá (11.3). */
export function bayesianStars(sum: number, count: number, prior: number, c: number = BAYES_C): number {
  return (c * prior + sum) / (c + count);
}

export const starsToScore = (stars: number) => Math.min(100, Math.max(0, ((stars - 1) / 4) * 100));

/** Thời gian xác nhận trung vị → điểm: ≤ 30 giây là 100, ≥ 180 giây là 0. */
export function confirmSpeedScore(medianSeconds: number | null): number | null {
  if (medianSeconds === null) return null;
  return Math.min(100, Math.max(0, ((180 - medianSeconds) / 150) * 100));
}

export interface Component {
  key: string;
  weight: number;
  /** 0–100, null nếu chưa có dữ liệu (trọng số được chia lại cho thành phần còn lại). */
  score: number | null;
}

export function weightedScore(components: Component[], fallback = ROOKIE_DEFAULT_SCORE): number {
  const present = components.filter((c) => c.score !== null);
  const total = present.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return fallback;
  return present.reduce((s, c) => s + (c.score as number) * c.weight, 0) / total;
}

export function tierFor(score: number, completedOrders: number): TrustTier {
  if (completedOrders < ROOKIE_MAX_ORDERS) return TrustTier.ROOKIE;
  if (score >= 90 && completedOrders >= 500) return TrustTier.DIAMOND;
  if (score >= 80) return TrustTier.GOLD;
  if (score >= 65) return TrustTier.SILVER;
  if (score >= 50) return TrustTier.BRONZE;
  return TrustTier.IMPROVE;
}

/** Quyền lợi theo cấp ở chợ chuyến hẹn (10.5, 11.4). */
export const BOARD_DELAY_MINUTES: Record<TrustTier, number | null> = {
  DIAMOND: 0,
  GOLD: 0,
  SILVER: 5,
  BRONZE: 10,
  ROOKIE: 10,
  IMPROVE: null, // không thấy chợ chuyến hẹn
};

export const MAX_SCHEDULED_CLAIMS: Record<TrustTier, number> = {
  DIAMOND: 6,
  GOLD: 6,
  SILVER: 4,
  BRONZE: 2,
  ROOKIE: 2,
  IMPROVE: 0,
};

/** Hệ số khoảng cách khi xếp hạng lời mời: điểm 100 → ×0,8; điểm 0 → ×1,2 (thành phần w3, Phần 3.4.1). */
export const dispatchDistanceFactor = (score: number) => 1 - (Math.min(100, Math.max(0, score)) - 50) / 250;
