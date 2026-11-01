import 'package:flutter_test/flutter_test.dart';
import 'package:sqt_customer/order_text.dart';

void main() {
  test('đơn sao chép gửi quán có SĐT người đặt, địa chỉ, món kèm ghi chú & dị ứng, tổng tiền', () {
    final text = orderText({
      'code': 'SQT-ABC123', 'storeName': 'Bánh Canh Cô Hoa', 'deliveryMode': 'PLATFORM',
      'buyer': {'name': 'Chị Hoa', 'phone': '0901234567'}, 'recipientName': null,
      'dropoffAddress': '12 Lê Lợi', 'dropoffNote': 'cổng xanh', 'schedule': null, 'orderNote': 'Gói riêng',
      'items': [
        {'name': 'Bánh canh cá lóc', 'quantity': 2, 'noteTags': ['Không hành'], 'note': 'thêm ớt', 'allergens': ['PEANUT']},
      ],
      'subtotal': 60000, 'deliveryFee': 15000, 'serviceFee': 2000, 'total': 77000, 'paymentMethod': 'COD',
    });
    expect(text, contains('SQT-ABC123'));
    expect(text, contains('Người đặt: Chị Hoa — 0901234567'));
    expect(text, contains('Giao tới: 12 Lê Lợi (cổng xanh)'));
    expect(text, contains('- 2 × Bánh canh cá lóc (Không hành; "thêm ớt"; ⚠ DỊ ỨNG: Đậu phộng)'));
    expect(text, contains('TỔNG: 77.000đ (tiền mặt khi nhận)'));
  });
}
