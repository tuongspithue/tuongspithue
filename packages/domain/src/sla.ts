/**
 * Các mốc SLA của Cổng A (Phần 3.3) và chính sách huỷ của khách (Phần 3.5).
 * Giá trị mặc định; Admin ghi đè qua trung tâm cấu hình (Phần 14.6).
 */

import { OrderState } from './order-state';

export type GateAAction = 'REMIND' | 'IVR_CALL' | 'SUGGEST_SCHEDULE' | 'OPS_QUEUE' | 'AUTO_CANCEL';

export interface SlaStep {
  afterSeconds: number;
  action: GateAAction;
}

export const DEFAULT_GATE_A_STEPS: readonly SlaStep[] = [
  { afterSeconds: 45, action: 'REMIND' },
  { afterSeconds: 90, action: 'IVR_CALL' },
  { afterSeconds: 120, action: 'SUGGEST_SCHEDULE' },
  { afterSeconds: 150, action: 'OPS_QUEUE' },
  { afterSeconds: 180, action: 'AUTO_CANCEL' },
];

/** FULL: hoàn toàn bộ · EXCEPT_ITEMS: giữ tiền món cho quán · EXCEPT_ITEMS_AND_DELIVERY: giữ thêm phí ship · NONE: không hoàn. */
export type RefundKind = 'FULL' | 'NONE' | 'EXCEPT_ITEMS' | 'EXCEPT_ITEMS_AND_DELIVERY';

export interface CancellationInput {
  state: OrderState;
  /** Quán đã bắt đầu làm món chưa. */
  prepStarted: boolean;
  /** Giây kể từ khi quán nhận đơn (null nếu chưa nhận). */
  secondsSinceAccepted: number | null;
  freeCancellationsUsedThisMonth: number;
  freeCancellationsPerMonth?: number;
  freeWindowSeconds?: number;
  /** Đơn hẹn: số giây còn lại tới giờ hẹn (Phần 10.2). */
  secondsUntilSlot?: number | null;
}

export interface CancellationDecision {
  allowed: boolean;
  refund: RefundKind;
  countsAsFreeCancellation: boolean;
  reason: string;
}

/** Chính sách huỷ của khách — Phần 3.5. */
export function decideCustomerCancellation(input: CancellationInput): CancellationDecision {
  const freePerMonth = input.freeCancellationsPerMonth ?? 3;
  const freeWindow = input.freeWindowSeconds ?? 120;
  const s = input.state;

  const beforeMerchant: OrderState[] = [
    OrderState.CHO_THANH_TOAN,
    OrderState.CHO_QUAN_XAC_NHAN,
    OrderState.CHO_KHACH_DUYET_THAY_DOI,
    OrderState.HEN_CHO_QUAN_NHAN,
    OrderState.HEN_CHO_KHACH_DUYET_GIO,
  ];
  if (beforeMerchant.includes(s)) {
    return { allowed: true, refund: 'FULL', countsAsFreeCancellation: false, reason: 'BEFORE_MERCHANT_ACCEPT' };
  }

  const afterPickup: OrderState[] = [OrderState.DA_LAY_HANG, OrderState.DANG_GIAO, OrderState.DA_DEN_NOI];
  if (afterPickup.includes(s)) {
    return { allowed: false, refund: 'NONE', countsAsFreeCancellation: false, reason: 'ALREADY_PICKED_UP' };
  }

  // Đơn hẹn: huỷ miễn phí đến khi quán bắt đầu làm, chậm nhất 30 phút trước giờ hẹn (Phần 10.2).
  if (s.startsWith('HEN_')) {
    const earlyEnough = (input.secondsUntilSlot ?? 0) >= 30 * 60;
    if (!input.prepStarted && earlyEnough) {
      return { allowed: true, refund: 'FULL', countsAsFreeCancellation: false, reason: 'SCHEDULED_EARLY' };
    }
    return { allowed: true, refund: 'EXCEPT_ITEMS', countsAsFreeCancellation: false, reason: 'SCHEDULED_LATE' };
  }

  if (!input.prepStarted) {
    const inWindow = input.secondsSinceAccepted !== null && input.secondsSinceAccepted <= freeWindow;
    if (inWindow && input.freeCancellationsUsedThisMonth < freePerMonth) {
      return { allowed: true, refund: 'FULL', countsAsFreeCancellation: true, reason: 'FREE_WINDOW' };
    }
  }
  // Quán đã làm món (hoặc hết lượt huỷ miễn phí): khách trả tiền món; shipper đã tới quán thì trả thêm phí ship.
  if (s === OrderState.SHIPPER_DEN_QUAN) {
    return { allowed: true, refund: 'EXCEPT_ITEMS_AND_DELIVERY', countsAsFreeCancellation: false, reason: 'RIDER_AT_STORE' };
  }
  return { allowed: true, refund: 'EXCEPT_ITEMS', countsAsFreeCancellation: false, reason: 'MERCHANT_PREPARING' };
}
