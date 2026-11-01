import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_customer/screens/order_screen.dart';

void main() {
  testWidgets('đơn gửi hàng: hiện mã đơn để đọc cho shipper, mã nhận hàng gửi người nhận, lộ trình A → B', (tester) async {
    final api = ApiClient(
      tokens: MemoryTokenStore('t'),
      baseUrl: 'http://api',
      client: MockClient((req) async => http.Response.bytes(
            utf8.encode(jsonEncode({
              'id': 5, 'code': 'SQT-PKG123', 'kind': 'PARCEL', 'state': 'SHIPPER_DEN_QUAN', 'storeId': null, 'storeName': 'Gửi hàng', 'riderId': 9, 'riderTier': 'ROOKIE',
              'deliveryMode': 'PLATFORM', 'pickupAddress': '12 Lê Lợi', 'dropoffAddress': '45 Quang Trung', 'recipientName': 'Anh Tuấn', 'recipientPhone': '0922300002',
              'parcel': {'type': 'DOCUMENT', 'size': 'MEDIUM', 'feePayer': 'RECEIVER', 'senderName': 'Chị Lan'},
              'deliveryPin': '4821', 'subtotal': 0, 'deliveryFee': 25000, 'serviceFee': 2000, 'total': 27000, 'schedule': null, 'orderNote': null,
              'contacts': {'rider': '0933100001'}, 'items': [], 'timeline': [],
            })),
            200,
          )),
    );
    await api.restore();
    tester.view.physicalSize = const Size(1080, 3000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: OrderScreen(api: api, orderId: 5)));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Shipper đã tới điểm lấy'), findsOneWidget);
    expect(find.text('SQT-PKG123'), findsOneWidget);
    expect(find.text('4821'), findsOneWidget);
    expect(find.text('Gửi mã qua SMS'), findsOneWidget);
    expect(find.text('12 Lê Lợi'), findsOneWidget);
    expect(find.text('45 Quang Trung'), findsOneWidget);
    expect(find.text('💵 Người nhận trả phí'), findsOneWidget);
    expect(find.text('Tiền món'), findsNothing);
    expect(find.text('Lấy hàng'), findsWidgets);
  });
}
