import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_customer/cart.dart';
import 'package:sqt_customer/main.dart';
import 'package:sqt_customer/screens/home.dart';

http.Response json(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json'});

const store = {
  'id': 1,
  'name': 'Phở Cô Lan',
  'address': '1 Nguyễn Huệ',
  'isOpen': true,
  'distanceM': 450,
  'prepTimeDefaultMin': 15,
  'trust': {'tier': 'GOLD', 'stars': 4.8, 'reviewCount': 120},
  'menu': [
    {'id': 10, 'name': 'Phở bò tái', 'price': 55000, 'isAvailable': true, 'quickNotes': ['Không hành', 'Ít bánh'], 'notesDisabled': false},
  ],
};

void main() {
  testWidgets('trang chủ hiện quán quanh tôi với cấp uy tín; chọn món kèm ghi chú & dị ứng rồi đặt đơn', (tester) async {
    Map<String, dynamic>? placed;
    String? idemKey;
    final client = MockClient((req) async {
      switch (req.url.path) {
        case '/v1/discovery/nearby':
          return json({'stores': [store]});
        case '/v1/stores/1':
          return json(store);
        case '/v1/orders':
          placed = jsonDecode(req.body) as Map<String, dynamic>;
          idemKey = req.headers['Idempotency-Key'];
          return json({'id': 99}, 201);
        case '/v1/orders/99':
          return json({
            'id': 99, 'code': 'SQT-ABC123', 'state': 'CHO_QUAN_XAC_NHAN', 'subtotal': 110000, 'deliveryFee': 15000, 'serviceFee': 2000, 'total': 127000,
            'riderId': null, 'schedule': null, 'orderNote': null,
            'items': [{'name': 'Phở bò tái', 'quantity': 2, 'noteTags': ['Không hành'], 'note': null, 'allergens': ['PEANUT']}],
            'timeline': [{'event': 'ORDER_PLACED', 'byRole': 'CUSTOMER', 'at': '2026-10-31T05:00:00Z'}],
          });
      }
      return json({'error': {'code': 'NOT_FOUND', 'message': 'không có'}}, 404);
    });
    final api = ApiClient(tokens: MemoryTokenStore('token'), client: client, baseUrl: 'http://api');
    await api.restore();
    tester.view.physicalSize = const Size(1080, 2400);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(home: HomeScreen(api: api, cart: Cart())));
    await tester.pumpAndSettle();
    expect(find.text('Phở Cô Lan'), findsOneWidget);
    expect(find.text('🏅 Vàng'), findsOneWidget);

    await tester.ensureVisible(find.text('Phở Cô Lan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Phở Cô Lan'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-10')));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add_circle_outline));
    await tester.tap(find.text('Không hành'));
    await tester.tap(find.text('Đậu phộng'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('add-to-cart')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('view-cart')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Không hành · ⚠ Đậu phộng'), findsOneWidget);
    // Đợi thông báo "Đã thêm…" biến mất để không che nút.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.drag(find.byKey(const Key('cart-list')), const Offset(0, -2000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('place-order')));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(placed!['items'], [
      {'itemId': 10, 'quantity': 2, 'noteTags': ['Không hành'], 'allergens': ['PEANUT']},
    ]);
    expect(placed!['paymentMethod'], 'COD');
    expect(placed!['dropoff']['address'], kDefaultPlace.address);
    expect(idemKey, isNotNull);
    expect(find.text('Chờ quán xác nhận'), findsOneWidget);
    expect(find.textContaining('Dị ứng: Đậu phộng'), findsOneWidget);
  });

  test('giỏ hàng gộp dòng cùng lựa chọn, tách dòng khi ghi chú khác nhau', () {
    final cart = Cart();
    cart.add(1, 'Quán', CartLine(itemId: 5, name: 'Bánh mì', price: 20000, noteTags: const ['Không cay']));
    cart.add(1, 'Quán', CartLine(itemId: 5, name: 'Bánh mì', price: 20000, noteTags: const ['Không cay']));
    cart.add(1, 'Quán', CartLine(itemId: 5, name: 'Bánh mì', price: 20000, noteTags: const ['Nhiều cay']));
    expect(cart.lines.length, 2);
    expect(cart.count, 3);
    expect(cart.subtotal, 60000);
    cart.add(2, 'Quán khác', CartLine(itemId: 9, name: 'Trà', price: 5000));
    expect(cart.lines.length, 1);
  });
}
