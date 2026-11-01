/// Nhãn tiếng Việt dễ hiểu cho mã trạng thái/sự kiện từ API.
library;

const Map<String, String> kStateLabels = {
  'CHO_THANH_TOAN': 'Chờ thanh toán',
  'CHO_QUAN_XAC_NHAN': 'Chờ quán xác nhận',
  'CHO_KHACH_DUYET_THAY_DOI': 'Chờ bạn duyệt thay đổi',
  'QUAN_DA_NHAN': 'Quán đã nhận',
  'DANG_TIM_SHIPPER': 'Đang tìm shipper',
  'CAN_CAN_THIEP': 'Đang được hỗ trợ',
  'SHIPPER_DA_NHAN': 'Shipper đã nhận',
  'SHIPPER_DEN_QUAN': 'Shipper tới quán',
  'DA_LAY_HANG': 'Đã lấy hàng',
  'DANG_GIAO': 'Đang giao',
  'DA_DEN_NOI': 'Shipper đã tới',
  'HOAN_THANH': 'Đã giao',
  'GIAO_THAT_BAI': 'Giao không thành',
  'HOAN_TRA_QUAN': 'Đã hoàn trả quán',
  'DA_HUY': 'Đã huỷ',
  'CHO_KHACH_DEN_LAY': 'Chờ bạn đến lấy',
  'HEN_CHO_QUAN_NHAN': 'Hẹn · chờ quán nhận',
  'HEN_CHO_KHACH_DUYET_GIO': 'Hẹn · quán đề xuất giờ khác',
  'HEN_QUAN_DA_NHAN': 'Hẹn · quán đã nhận',
  'HEN_TREN_CHO_CHUYEN': 'Hẹn · chờ shipper giữ chuyến',
  'HEN_SHIPPER_DA_GIU': 'Hẹn · shipper đã giữ chuyến',
  'HEN_SAN_SANG': 'Hẹn · sẵn sàng',
};

const Map<String, String> kEventLabels = {
  'ORDER_PLACED': 'Đã gửi đơn',
  'PAYMENT_SUCCEEDED': 'Đã thanh toán',
  'MERCHANT_ACCEPT': 'Quán đã nhận đơn',
  'MERCHANT_REJECT': 'Quán từ chối',
  'MERCHANT_TIMEOUT': 'Quán không phản hồi',
  'MERCHANT_PROPOSE_TIME': 'Quán đề xuất giờ khác',
  'MERCHANT_RECONFIRMED': 'Quán xác nhận lại',
  'START_DISPATCH': 'Đang tìm shipper',
  'RIDER_ACCEPT': 'Shipper đã nhận chuyến',
  'RIDER_CLAIM': 'Shipper đã giữ chuyến',
  'RIDER_RECONFIRMED': 'Shipper sẵn sàng',
  'RIDER_RELEASE': 'Đổi shipper',
  'RIDER_ARRIVED_STORE': 'Shipper tới quán',
  'PREP_READY': 'Món đã xong',
  'RIDER_PICKED_UP': 'Đã lấy hàng',
  'START_DELIVERY': 'Đang giao',
  'RIDER_ARRIVED_DROPOFF': 'Shipper đã tới',
  'DELIVERED': 'Đã giao',
  'CUSTOMER_CANCEL': 'Bạn đã huỷ',
  'POST_TO_BOARD': 'Đăng cho shipper giữ chuyến',
  'SLOT_START': 'Bắt đầu chuyến hẹn',
  // Shipper mua hộ (Phần 3.8)
  'SWITCH_TO_PROXY': 'Nhờ shipper tới quán mua giúp',
  'PROXY_ORDERED': 'Shipper đã đặt món tại quán',
  'PROXY_STORE_UNAVAILABLE': 'Quán không bán được — đã huỷ',
};

const Map<String, String> kAllergenLabels = {
  'PEANUT': 'Đậu phộng',
  'SEAFOOD': 'Hải sản',
  'MILK': 'Sữa',
  'EGG': 'Trứng',
  'GLUTEN': 'Gluten',
  'SOY': 'Đậu nành',
  'TREE_NUT': 'Các loại hạt',
  'OTHER': 'Khác',
};

const Map<String, String> kTierLabels = {
  'DIAMOND': '💎 Kim cương',
  'GOLD': '🏅 Vàng',
  'SILVER': '🥈 Bạc',
  'BRONZE': '🥉 Đồng',
  'ROOKIE': '🌱 Mới',
  'IMPROVE': 'Cần cải thiện',
};

const Map<String, String> kRoleLabels = {
  'CUSTOMER': 'Bạn',
  'MERCHANT': 'Quán',
  'RIDER': 'Shipper',
  'OPS': 'Điều phối viên',
  'SYSTEM': 'Hệ thống',
};

String stateLabel(String s) => kStateLabels[s] ?? s;

/// 85000 → "85.000đ".
String money(num? v) {
  if (v == null) return '—';
  final s = v.round().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return '$bufđ';
}

/// "2026-10-31T05:30:00Z" → "12:30 31/10".
String hhmm(String? iso) {
  if (iso == null) return '—';
  final t = DateTime.parse(iso).toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(t.hour)}:${two(t.minute)} ${two(t.day)}/${two(t.month)}';
}
