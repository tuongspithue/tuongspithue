/**
 * Phí ship khi shipper hệ thống giao — Phần 4.1. Mọi số tiền là số nguyên (đồng).
 */

export interface DeliveryFeeParams {
  /** Phí tối thiểu, áp dụng cho quãng đường ≤ includedKm. */
  minimumFee: number;
  includedKm: number;
  perKmFee: number;
  /** Hệ số cao điểm, giới hạn trong [1, surgeCap]. */
  surgeMultiplier: number;
  surgeCap: number;
  surcharges: number[];
  promoSubsidy: number;
  /** Làm tròn lên bội số này (VD 1.000đ). */
  roundTo: number;
}

export const DEFAULT_DELIVERY_FEE_PARAMS: DeliveryFeeParams = {
  minimumFee: 15_000,
  includedKm: 2,
  perKmFee: 4_000,
  surgeMultiplier: 1,
  surgeCap: 1.5,
  surcharges: [],
  promoSubsidy: 0,
  roundTo: 1_000,
};

export function computeDeliveryFee(distanceKm: number, overrides: Partial<DeliveryFeeParams> = {}): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('distanceKm phải là số không âm');
  }
  const p = { ...DEFAULT_DELIVERY_FEE_PARAMS, ...overrides };
  const extraKm = Math.max(0, distanceKm - p.includedKm);
  const base = p.minimumFee + Math.ceil(extraKm) * p.perKmFee;
  const surge = Math.min(Math.max(p.surgeMultiplier, 1), p.surgeCap);
  const surcharge = p.surcharges.reduce((sum, s) => sum + s, 0);
  const raw = Math.max(0, base * surge + surcharge - p.promoSubsidy);
  return Math.ceil(raw / p.roundTo) * p.roundTo;
}

export interface PricedLine {
  unitPrice: number;
  quantity: number;
}

export function computeSubtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, l) => {
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new RangeError('unitPrice không hợp lệ');
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new RangeError('quantity không hợp lệ');
    return sum + l.unitPrice * l.quantity;
  }, 0);
}
