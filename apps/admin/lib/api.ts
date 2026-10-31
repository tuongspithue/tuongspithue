'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'sqt-admin-token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* trình duyệt chặn lưu trữ: phiên chỉ còn trong bộ nhớ */
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Lỗi ${res.status}`);
  }
  return data as T;
}

export const money = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('vi-VN')}đ`);
export const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '—');

/** Tên trạng thái đơn dễ hiểu (Phần 3.2, 10.6). */
export const STATE_LABELS: Record<string, string> = {
  CHO_THANH_TOAN: 'Chờ thanh toán',
  CHO_QUAN_XAC_NHAN: 'Chờ quán xác nhận',
  CHO_KHACH_DUYET_THAY_DOI: 'Chờ khách duyệt thay đổi',
  QUAN_DA_NHAN: 'Quán đã nhận',
  DANG_TIM_SHIPPER: 'Đang tìm shipper',
  CAN_CAN_THIEP: 'Cần can thiệp',
  SHIPPER_DA_NHAN: 'Shipper đã nhận',
  SHIPPER_DEN_QUAN: 'Shipper tới quán',
  DA_LAY_HANG: 'Đã lấy hàng',
  DANG_GIAO: 'Đang giao',
  DA_DEN_NOI: 'Đã đến nơi',
  HOAN_THANH: 'Hoàn thành',
  GIAO_THAT_BAI: 'Giao thất bại',
  HOAN_TRA_QUAN: 'Hoàn trả quán',
  DA_HUY: 'Đã huỷ',
  CHO_KHACH_DEN_LAY: 'Chờ khách đến lấy',
  HEN_CHO_QUAN_NHAN: 'Hẹn · chờ quán nhận',
  HEN_CHO_KHACH_DUYET_GIO: 'Hẹn · chờ khách duyệt giờ',
  HEN_QUAN_DA_NHAN: 'Hẹn · quán đã nhận',
  HEN_TREN_CHO_CHUYEN: 'Hẹn · trên chợ chuyến',
  HEN_SHIPPER_DA_GIU: 'Hẹn · shipper đã giữ',
  HEN_SAN_SANG: 'Hẹn · sẵn sàng',
};

/** Liên hệ bằng app trên máy (không dùng dịch vụ trả phí): gọi, SMS, Zalo. */
export const contactLinks = (phone: string) => ({
  call: `tel:${phone}`,
  sms: `sms:${phone}`,
  zalo: `https://zalo.me/${phone}`,
});

export const ALLERGEN_LABELS: Record<string, string> = {
  PEANUT: 'Đậu phộng',
  SEAFOOD: 'Hải sản',
  MILK: 'Sữa',
  EGG: 'Trứng',
  GLUTEN: 'Gluten',
  SOY: 'Đậu nành',
  TREE_NUT: 'Các loại hạt',
  OTHER: 'Khác',
};

/** Tên sự kiện trên dòng thời gian đơn. */
export const EVENT_LABELS: Record<string, string> = {
  ORDER_PLACED: 'Khách đặt đơn',
  PAYMENT_SUCCEEDED: 'Đã thanh toán',
  MERCHANT_ACCEPT: 'Quán nhận đơn',
  MERCHANT_REJECT: 'Quán từ chối',
  MERCHANT_TIMEOUT: 'Quán không phản hồi',
  MERCHANT_PROPOSE_TIME: 'Quán đề xuất giờ khác',
  MERCHANT_RECONFIRMED: 'Quán xác nhận lại',
  START_DISPATCH: 'Bắt đầu tìm shipper',
  DISPATCH_EXHAUSTED: 'Hết vòng tìm shipper',
  RIDER_ACCEPT: 'Shipper nhận chuyến',
  RIDER_CLAIM: 'Shipper giữ chuyến hẹn',
  RIDER_RECONFIRMED: 'Shipper xác nhận sẵn sàng',
  RIDER_RELEASE: 'Shipper nhả chuyến',
  RIDER_ARRIVED_STORE: 'Shipper tới quán',
  PREP_READY: 'Món đã xong',
  RIDER_PICKED_UP: 'Đã lấy hàng',
  START_DELIVERY: 'Bắt đầu giao',
  RIDER_ARRIVED_DROPOFF: 'Tới điểm giao',
  DELIVERED: 'Đã giao',
  CUSTOMER_CANCEL: 'Khách huỷ',
  OPS_CANCEL: 'Ops huỷ',
  POST_TO_BOARD: 'Đăng lên chợ chuyến hẹn',
  SLOT_START: 'Đến giờ chạy chuyến hẹn',
};

export const PROBLEM_LABELS: Record<string, string> = {
  NEEDS_INTERVENTION: 'Cần can thiệp',
  MERCHANT_SILENT: 'Quán chưa xác nhận',
  NO_RIDER: 'Chưa có shipper',
  SCHEDULED_UNCLAIMED: 'Đơn hẹn chưa ai giữ',
  RIDER_STATIONARY: 'Shipper đứng yên',
};
