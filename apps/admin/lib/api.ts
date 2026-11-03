'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
/** Địa chỉ máy chủ API — Admin gửi cho quán/shipper để nhập vào app ở lần mở đầu. */
export const API_BASE = BASE;
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
  SWITCH_TO_PROXY: 'Quán im lặng → nhờ shipper mua hộ',
  NO_RIDER_CANCEL: 'Không shipper nhận sau 2 lượt → huỷ, hoàn tiền',
  PROXY_ORDERED: 'Shipper đặt món tại quán (xác nhận thay quán)',
  PROXY_STORE_UNAVAILABLE: 'Shipper báo quán không bán được',
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

export const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  FOOD: { label: 'Đồ ăn', icon: '🍜', color: '#ff6b2c' },
  DRINK: { label: 'Đồ uống', icon: '🧋', color: '#8b5cf6' },
  GROCERY: { label: 'Tạp hoá', icon: '🛒', color: '#0ea5e9' },
  WATER_ICE: { label: 'Nước, đá', icon: '💧', color: '#14b8a6' },
  MOM_BABY: { label: 'Mẹ & bé', icon: '🍼', color: '#ec4899' },
};

export const TIER_LABELS: Record<string, { label: string; tone: string }> = {
  DIAMOND: { label: '💎 Kim cương', tone: 'info' },
  GOLD: { label: '🥇 Vàng', tone: 'wait' },
  SILVER: { label: '🥈 Bạc', tone: 'muted' },
  BRONZE: { label: '🥉 Đồng', tone: 'muted' },
  ROOKIE: { label: '🌱 Tân binh', tone: 'ok' },
  IMPROVE: { label: '⚠️ Cần cải thiện', tone: 'bad' },
};

export const PARTNER_STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: 'Đang hoạt động', tone: 'ok' },
  PENDING: { label: 'Chờ duyệt', tone: 'wait' },
  SUSPENDED: { label: 'Tạm khoá', tone: 'bad' },
  REJECTED: { label: 'Đã từ chối', tone: 'muted' },
  ACTIVE: { label: 'Hoạt động', tone: 'ok' },
  LOCKED: { label: 'Đã khoá', tone: 'bad' },
};

/** Ba chế độ nhận đơn của quán (Phần 3.8). */
export const ORDER_MODES: Record<string, { label: string; hint: string }> = {
  APP: { label: '📱 Quán tự nhận', hint: 'Quán nhận đơn trên app, rồi mới mời shipper' },
  HYBRID: { label: '🔀 Song song', hint: 'Quán có ít giây để nhận (Cấu hình → proxy); im lặng thì mời shipper tới mua hộ, quán vẫn nhận muộn được' },
  PROXY: { label: '🛒 Shipper mua hộ', hint: 'Quán không dùng app: mời shipper ngay, shipper tới quán đặt & trả tiền hộ' },
};

export const VEHICLE_LABELS: Record<string, string> = { MOTORBIKE: '🏍️ Xe máy', EMOTORBIKE: '🛵 Xe điện', CARGO: '🛺 Ba gác' };

/** "5 phút trước" — cho vị trí shipper, lần đặt đơn gần nhất. */
export function ago(s: string | null | undefined): string {
  if (!s) return '—';
  const sec = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 1000));
  if (sec < 60) return `${sec} giây trước`;
  if (sec < 3600) return `${Math.round(sec / 60)} phút trước`;
  if (sec < 86_400) return `${Math.round(sec / 3600)} giờ trước`;
  return `${Math.round(sec / 86_400)} ngày trước`;
}

export const maskPhone = (p: string | null | undefined) => (p ? p.replace(/^(\d{3})\d{4}(\d{3})$/, '$1****$2') : '—');
