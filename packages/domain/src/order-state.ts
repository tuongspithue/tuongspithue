/**
 * Máy trạng thái đơn hàng — Phần 3.2 (đơn ngay, tự đến lấy) và Phần 10.6 (đơn hẹn giờ).
 *
 * Nguyên tắc bất biến (Phần 1.4):
 *  - Cổng A (quán nhận đơn) chỉ do người thật thực hiện: MERCHANT hoặc OPS gọi xác nhận.
 *  - Cổng B (nhận chuyến / giữ chuyến) chỉ do RIDER thực hiện.
 *  SYSTEM không bao giờ được đi qua hai cổng này.
 */

export const OrderState = {
  CHO_THANH_TOAN: 'CHO_THANH_TOAN',
  CHO_QUAN_XAC_NHAN: 'CHO_QUAN_XAC_NHAN',
  CHO_KHACH_DUYET_THAY_DOI: 'CHO_KHACH_DUYET_THAY_DOI',
  QUAN_DA_NHAN: 'QUAN_DA_NHAN',
  DANG_TIM_SHIPPER: 'DANG_TIM_SHIPPER',
  CAN_CAN_THIEP: 'CAN_CAN_THIEP',
  SHIPPER_DA_NHAN: 'SHIPPER_DA_NHAN',
  SHIPPER_DEN_QUAN: 'SHIPPER_DEN_QUAN',
  DA_LAY_HANG: 'DA_LAY_HANG',
  DANG_GIAO: 'DANG_GIAO',
  DA_DEN_NOI: 'DA_DEN_NOI',
  HOAN_THANH: 'HOAN_THANH',
  GIAO_THAT_BAI: 'GIAO_THAT_BAI',
  HOAN_TRA_QUAN: 'HOAN_TRA_QUAN',
  DA_HUY: 'DA_HUY',
  CHO_KHACH_DEN_LAY: 'CHO_KHACH_DEN_LAY',
  // Đơn hẹn giờ (Phần 10.6)
  HEN_CHO_QUAN_NHAN: 'HEN_CHO_QUAN_NHAN',
  HEN_CHO_KHACH_DUYET_GIO: 'HEN_CHO_KHACH_DUYET_GIO',
  HEN_QUAN_DA_NHAN: 'HEN_QUAN_DA_NHAN',
  HEN_TREN_CHO_CHUYEN: 'HEN_TREN_CHO_CHUYEN',
  HEN_SHIPPER_DA_GIU: 'HEN_SHIPPER_DA_GIU',
  HEN_SAN_SANG: 'HEN_SAN_SANG',
} as const;
export type OrderState = (typeof OrderState)[keyof typeof OrderState];

export const TERMINAL_STATES: ReadonlySet<OrderState> = new Set([
  OrderState.HOAN_THANH,
  OrderState.DA_HUY,
  OrderState.HOAN_TRA_QUAN,
]);

export const ActorRole = {
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  RIDER: 'RIDER',
  OPS: 'OPS',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];

export const OrderEvent = {
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  MERCHANT_ACCEPT: 'MERCHANT_ACCEPT',
  MERCHANT_PROPOSE_CHANGES: 'MERCHANT_PROPOSE_CHANGES',
  MERCHANT_PROPOSE_TIME: 'MERCHANT_PROPOSE_TIME',
  CUSTOMER_ACCEPT_CHANGES: 'CUSTOMER_ACCEPT_CHANGES',
  CUSTOMER_REJECT_CHANGES: 'CUSTOMER_REJECT_CHANGES',
  CHANGES_TIMEOUT: 'CHANGES_TIMEOUT',
  MERCHANT_REJECT: 'MERCHANT_REJECT',
  MERCHANT_TIMEOUT: 'MERCHANT_TIMEOUT',
  CUSTOMER_CANCEL: 'CUSTOMER_CANCEL',
  OPS_CANCEL: 'OPS_CANCEL',
  START_DISPATCH: 'START_DISPATCH',
  START_PICKUP_WAIT: 'START_PICKUP_WAIT',
  PICKUP_HANDOVER: 'PICKUP_HANDOVER',
  PICKUP_NO_SHOW: 'PICKUP_NO_SHOW',
  RIDER_ACCEPT: 'RIDER_ACCEPT',
  DISPATCH_EXHAUSTED: 'DISPATCH_EXHAUSTED',
  OPS_RETRY_DISPATCH: 'OPS_RETRY_DISPATCH',
  RIDER_RELEASE: 'RIDER_RELEASE',
  RIDER_ARRIVED_STORE: 'RIDER_ARRIVED_STORE',
  RIDER_PICKED_UP: 'RIDER_PICKED_UP',
  START_DELIVERY: 'START_DELIVERY',
  INCIDENT: 'INCIDENT',
  RIDER_ARRIVED_DROPOFF: 'RIDER_ARRIVED_DROPOFF',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURNED_TO_STORE: 'RETURNED_TO_STORE',
  // Đơn hẹn giờ
  POST_TO_BOARD: 'POST_TO_BOARD',
  RIDER_CLAIM: 'RIDER_CLAIM',
  BOARD_UNCLAIMED: 'BOARD_UNCLAIMED',
  RECONFIRMED: 'RECONFIRMED',
  MERCHANT_RECONFIRM_MISSED: 'MERCHANT_RECONFIRM_MISSED',
  RIDER_RECONFIRM_MISSED: 'RIDER_RECONFIRM_MISSED',
  SLOT_START: 'SLOT_START',
  // Shipper mua hộ (Phần 3.8)
  SWITCH_TO_PROXY: 'SWITCH_TO_PROXY',
  PROXY_STORE_UNAVAILABLE: 'PROXY_STORE_UNAVAILABLE',
} as const;
export type OrderEvent = (typeof OrderEvent)[keyof typeof OrderEvent];

export interface TransitionContext {
  isScheduled?: boolean;
  isSelfPickup?: boolean;
  /** Món đã ở trạng thái SAN_SANG (Phần 3.2). */
  prepReady?: boolean;
  /** Đơn có ghi chú dị ứng và quán đã bấm "Đã đọc" (Phần 2.1.4a). */
  hasAllergens?: boolean;
  allergyAcknowledged?: boolean;
}

interface TransitionRule {
  from: readonly OrderState[];
  event: OrderEvent;
  actors: readonly ActorRole[];
  to: OrderState | ((ctx: TransitionContext) => OrderState);
  guard?: (ctx: TransitionContext) => string | null;
}

const S = OrderState;
const E = OrderEvent;
const A = ActorRole;

const CUSTOMER_CANCELLABLE: OrderState[] = [
  S.CHO_THANH_TOAN,
  S.CHO_QUAN_XAC_NHAN,
  S.CHO_KHACH_DUYET_THAY_DOI,
  S.QUAN_DA_NHAN,
  S.DANG_TIM_SHIPPER,
  S.SHIPPER_DA_NHAN,
  S.SHIPPER_DEN_QUAN,
  S.CHO_KHACH_DEN_LAY,
  S.HEN_CHO_QUAN_NHAN,
  S.HEN_CHO_KHACH_DUYET_GIO,
  S.HEN_QUAN_DA_NHAN,
  S.HEN_TREN_CHO_CHUYEN,
  S.HEN_SHIPPER_DA_GIU,
];

const allergyGuard = (ctx: TransitionContext): string | null =>
  ctx.hasAllergens && !ctx.allergyAcknowledged ? 'ALLERGY_ACK_REQUIRED' : null;

const RULES: TransitionRule[] = [
  {
    from: [S.CHO_THANH_TOAN],
    event: E.PAYMENT_SUCCEEDED,
    actors: [A.SYSTEM],
    to: (ctx) => (ctx.isScheduled ? S.HEN_CHO_QUAN_NHAN : S.CHO_QUAN_XAC_NHAN),
  },
  { from: [S.CHO_THANH_TOAN], event: E.PAYMENT_EXPIRED, actors: [A.SYSTEM], to: S.DA_HUY },

  // ---- Cổng A: chỉ người thật (quán, hoặc Ops gọi điện xác nhận thay quán) ----
  {
    from: [S.CHO_QUAN_XAC_NHAN],
    event: E.MERCHANT_ACCEPT,
    actors: [A.MERCHANT, A.OPS],
    to: S.QUAN_DA_NHAN,
    guard: allergyGuard,
  },
  {
    from: [S.HEN_CHO_QUAN_NHAN],
    event: E.MERCHANT_ACCEPT,
    actors: [A.MERCHANT, A.OPS],
    to: S.HEN_QUAN_DA_NHAN,
    guard: allergyGuard,
  },
  {
    from: [S.CHO_QUAN_XAC_NHAN, S.HEN_CHO_QUAN_NHAN],
    event: E.MERCHANT_PROPOSE_CHANGES,
    actors: [A.MERCHANT],
    to: S.CHO_KHACH_DUYET_THAY_DOI,
    guard: allergyGuard,
  },
  {
    from: [S.HEN_CHO_QUAN_NHAN],
    event: E.MERCHANT_PROPOSE_TIME,
    actors: [A.MERCHANT],
    to: S.HEN_CHO_KHACH_DUYET_GIO,
    guard: allergyGuard,
  },
  {
    // Quán đã xác nhận có điều kiện; khách đồng ý (hoặc hết 2 phút áp dụng lựa chọn "khi hết hàng").
    from: [S.CHO_KHACH_DUYET_THAY_DOI],
    event: E.CUSTOMER_ACCEPT_CHANGES,
    actors: [A.CUSTOMER],
    to: (ctx) => (ctx.isScheduled ? S.HEN_QUAN_DA_NHAN : S.QUAN_DA_NHAN),
  },
  {
    from: [S.CHO_KHACH_DUYET_THAY_DOI],
    event: E.CHANGES_TIMEOUT,
    actors: [A.SYSTEM],
    to: (ctx) => (ctx.isScheduled ? S.HEN_QUAN_DA_NHAN : S.QUAN_DA_NHAN),
  },
  { from: [S.HEN_CHO_KHACH_DUYET_GIO], event: E.CUSTOMER_ACCEPT_CHANGES, actors: [A.CUSTOMER], to: S.HEN_QUAN_DA_NHAN },
  { from: [S.HEN_CHO_KHACH_DUYET_GIO], event: E.CHANGES_TIMEOUT, actors: [A.SYSTEM], to: S.DA_HUY },
  {
    from: [S.CHO_KHACH_DUYET_THAY_DOI, S.HEN_CHO_KHACH_DUYET_GIO],
    event: E.CUSTOMER_REJECT_CHANGES,
    actors: [A.CUSTOMER],
    to: S.DA_HUY,
  },
  {
    from: [S.CHO_QUAN_XAC_NHAN, S.HEN_CHO_QUAN_NHAN],
    event: E.MERCHANT_REJECT,
    actors: [A.MERCHANT, A.OPS],
    to: S.DA_HUY,
  },
  { from: [S.CHO_QUAN_XAC_NHAN, S.HEN_CHO_QUAN_NHAN], event: E.MERCHANT_TIMEOUT, actors: [A.SYSTEM], to: S.DA_HUY },

  { from: CUSTOMER_CANCELLABLE, event: E.CUSTOMER_CANCEL, actors: [A.CUSTOMER], to: S.DA_HUY },
  {
    from: CUSTOMER_CANCELLABLE.concat([S.CAN_CAN_THIEP, S.DA_LAY_HANG, S.DANG_GIAO]),
    event: E.OPS_CANCEL,
    actors: [A.OPS],
    to: S.DA_HUY,
  },

  // ---- Shipper mua hộ (Phần 3.8) ----
  // Quán không dùng app / im lặng quá hạn ở chế độ song song: chuyển sang mời shipper tới quán mua hộ.
  // Bước này KHÔNG xác nhận đơn — đơn chỉ thành có người lo khi shipper bấm nhận chuyến (Cổng B) và
  // tự đặt món trực tiếp tại quán (thay Cổng A). SYSTEM vẫn không đi qua cổng nào.
  { from: [S.CHO_QUAN_XAC_NHAN], event: E.SWITCH_TO_PROXY, actors: [A.SYSTEM], to: S.DANG_TIM_SHIPPER },
  // Tới nơi quán đóng cửa / hết món: shipper báo, đơn huỷ và hoàn tiền.
  { from: [S.SHIPPER_DEN_QUAN], event: E.PROXY_STORE_UNAVAILABLE, actors: [A.RIDER, A.OPS], to: S.DA_HUY },

  // ---- Sau Cổng A ----
  { from: [S.QUAN_DA_NHAN], event: E.START_DISPATCH, actors: [A.SYSTEM], to: S.DANG_TIM_SHIPPER },
  { from: [S.QUAN_DA_NHAN, S.HEN_QUAN_DA_NHAN], event: E.START_PICKUP_WAIT, actors: [A.SYSTEM], to: S.CHO_KHACH_DEN_LAY },
  { from: [S.CHO_KHACH_DEN_LAY], event: E.PICKUP_HANDOVER, actors: [A.MERCHANT], to: S.HOAN_THANH },
  { from: [S.CHO_KHACH_DEN_LAY], event: E.PICKUP_NO_SHOW, actors: [A.SYSTEM], to: S.DA_HUY },

  // ---- Cổng B: chỉ shipper (kể cả chủ quán tự giao — cũng là một tài khoản shipper đã đăng ký) ----
  { from: [S.DANG_TIM_SHIPPER], event: E.RIDER_ACCEPT, actors: [A.RIDER], to: S.SHIPPER_DA_NHAN },
  { from: [S.DANG_TIM_SHIPPER], event: E.DISPATCH_EXHAUSTED, actors: [A.SYSTEM], to: S.CAN_CAN_THIEP },
  { from: [S.CAN_CAN_THIEP], event: E.OPS_RETRY_DISPATCH, actors: [A.OPS], to: S.DANG_TIM_SHIPPER },
  {
    from: [S.SHIPPER_DA_NHAN, S.SHIPPER_DEN_QUAN],
    event: E.RIDER_RELEASE,
    actors: [A.RIDER, A.OPS],
    to: S.DANG_TIM_SHIPPER,
  },
  { from: [S.SHIPPER_DA_NHAN], event: E.RIDER_ARRIVED_STORE, actors: [A.RIDER], to: S.SHIPPER_DEN_QUAN },
  {
    from: [S.SHIPPER_DEN_QUAN],
    event: E.RIDER_PICKED_UP,
    actors: [A.RIDER],
    to: S.DA_LAY_HANG,
    guard: (ctx) => (ctx.prepReady ? null : 'PREP_NOT_READY'),
  },
  { from: [S.DA_LAY_HANG], event: E.START_DELIVERY, actors: [A.RIDER, A.SYSTEM], to: S.DANG_GIAO },
  { from: [S.DA_LAY_HANG, S.DANG_GIAO], event: E.INCIDENT, actors: [A.RIDER, A.OPS], to: S.CAN_CAN_THIEP },
  { from: [S.DANG_GIAO], event: E.RIDER_ARRIVED_DROPOFF, actors: [A.RIDER], to: S.DA_DEN_NOI },
  { from: [S.DA_DEN_NOI], event: E.DELIVERED, actors: [A.RIDER], to: S.HOAN_THANH },
  { from: [S.DA_DEN_NOI], event: E.DELIVERY_FAILED, actors: [A.RIDER, A.OPS], to: S.GIAO_THAT_BAI },
  { from: [S.GIAO_THAT_BAI], event: E.RETURNED_TO_STORE, actors: [A.RIDER, A.OPS], to: S.HOAN_TRA_QUAN },

  // ---- Đơn hẹn giờ ----
  { from: [S.HEN_QUAN_DA_NHAN], event: E.POST_TO_BOARD, actors: [A.SYSTEM], to: S.HEN_TREN_CHO_CHUYEN },
  { from: [S.HEN_TREN_CHO_CHUYEN], event: E.RIDER_CLAIM, actors: [A.RIDER], to: S.HEN_SHIPPER_DA_GIU },
  { from: [S.HEN_SHIPPER_DA_GIU], event: E.RIDER_RELEASE, actors: [A.RIDER, A.OPS], to: S.HEN_TREN_CHO_CHUYEN },
  { from: [S.HEN_TREN_CHO_CHUYEN], event: E.BOARD_UNCLAIMED, actors: [A.SYSTEM], to: S.DANG_TIM_SHIPPER },
  { from: [S.HEN_SHIPPER_DA_GIU], event: E.RECONFIRMED, actors: [A.SYSTEM], to: S.HEN_SAN_SANG },
  { from: [S.HEN_SHIPPER_DA_GIU], event: E.MERCHANT_RECONFIRM_MISSED, actors: [A.SYSTEM], to: S.CAN_CAN_THIEP },
  { from: [S.HEN_SHIPPER_DA_GIU], event: E.RIDER_RECONFIRM_MISSED, actors: [A.SYSTEM], to: S.DANG_TIM_SHIPPER },
  // Shipper đã cam kết khi giữ chuyến (Cổng B) và xác nhận lại T−20 → đến giờ thì chạy như đơn thường.
  { from: [S.HEN_SAN_SANG], event: E.SLOT_START, actors: [A.SYSTEM], to: S.SHIPPER_DA_NHAN },
];

/** Sự kiện chỉ người thật được thực hiện — kiểm tra bất biến trong test. */
export const GATE_A_EVENTS: readonly OrderEvent[] = [E.MERCHANT_ACCEPT, E.MERCHANT_PROPOSE_CHANGES, E.MERCHANT_PROPOSE_TIME];
export const GATE_B_EVENTS: readonly OrderEvent[] = [E.RIDER_ACCEPT, E.RIDER_CLAIM];

export class TransitionError extends Error {
  constructor(
    public readonly code: 'INVALID_TRANSITION' | 'ACTOR_NOT_ALLOWED' | 'GUARD_FAILED',
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
  }
}

export interface TransitionResult {
  from: OrderState;
  to: OrderState;
  event: OrderEvent;
  actor: ActorRole;
}

export function transition(
  from: OrderState,
  event: OrderEvent,
  actor: ActorRole,
  ctx: TransitionContext = {},
): TransitionResult {
  const rule = RULES.find((r) => r.event === event && r.from.includes(from));
  if (!rule) {
    throw new TransitionError('INVALID_TRANSITION', `Không thể ${event} khi đơn ở trạng thái ${from}`);
  }
  if (!rule.actors.includes(actor)) {
    throw new TransitionError('ACTOR_NOT_ALLOWED', `${actor} không được phép ${event}`);
  }
  const guardFailure = rule.guard?.(ctx) ?? null;
  if (guardFailure) {
    throw new TransitionError('GUARD_FAILED', `Chưa đủ điều kiện để ${event}`, guardFailure);
  }
  const to = typeof rule.to === 'function' ? rule.to(ctx) : rule.to;
  return { from, to, event, actor };
}

export function canTransition(from: OrderState, event: OrderEvent, actor: ActorRole, ctx: TransitionContext = {}): boolean {
  try {
    transition(from, event, actor, ctx);
    return true;
  } catch {
    return false;
  }
}

/** Danh sách luật — dùng cho test bất biến và tài liệu tự sinh. */
export function listRules(): ReadonlyArray<Readonly<TransitionRule>> {
  return RULES;
}
