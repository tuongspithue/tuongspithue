import 'package:sqt_core/sqt_core.dart';

/// Nội dung đơn dạng chữ để khách sao chép gửi thẳng cho quán qua Zalo/SMS (VD quán chưa thấy đơn trên app).
/// Có đủ người đặt + SĐT, địa chỉ, từng món kèm ghi chú/dị ứng và tổng tiền để quán làm và liên lạc được ngay.
String orderText(Map<String, dynamic> o) {
  final b = StringBuffer();
  final buyer = (o['buyer'] as Map?) ?? const {};
  b.writeln('🛵 ĐƠN SHIP QUANH TÔI — ${o['code']}');
  if (o['storeName'] != null) b.writeln('Quán: ${o['storeName']}');
  final name = (o['recipientName'] ?? buyer['name']) as String?;
  final phone = (o['recipientPhone'] ?? buyer['phone']) as String?;
  b.writeln('Người đặt: ${name ?? 'Khách'}${phone != null ? ' — $phone' : ''}');
  if (o['deliveryMode'] == 'SELF_PICKUP') {
    b.writeln('Nhận hàng: khách tự đến lấy');
  } else if (o['dropoffAddress'] != null) {
    b.writeln('Giao tới: ${o['dropoffAddress']}${o['dropoffNote'] != null ? ' (${o['dropoffNote']})' : ''}');
  }
  final schedule = o['schedule'] as Map?;
  if (schedule != null) b.writeln('Hẹn lấy hàng lúc: ${hhmm(schedule['pickupAt'] as String?)}');
  b.writeln('Món:');
  for (final i in (o['items'] as List? ?? const []).cast<Map>()) {
    final extra = [
      ...((i['noteTags'] as List?) ?? const []).cast<String>(),
      if (i['note'] != null) '"${i['note']}"',
      if ((i['allergens'] as List?)?.isNotEmpty ?? false) '⚠ DỊ ỨNG: ${(i['allergens'] as List).map((a) => kAllergenLabels[a] ?? a).join(', ')}',
    ];
    b.writeln('- ${i['quantity']} × ${i['name']}${extra.isEmpty ? '' : ' (${extra.join('; ')})'}');
  }
  if (o['orderNote'] != null) b.writeln('Ghi chú đơn: ${o['orderNote']}');
  b.writeln('Tiền món ${money(o['subtotal'] as num)} · Ship ${money(o['deliveryFee'] as num)} · Dịch vụ ${money(o['serviceFee'] as num)}');
  b.write('TỔNG: ${money(o['total'] as num)}${o['paymentMethod'] == 'COD' ? ' (tiền mặt khi nhận)' : ' (đã thanh toán online)'}');
  return b.toString();
}
