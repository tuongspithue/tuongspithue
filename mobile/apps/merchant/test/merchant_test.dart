import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_partner/sqt_partner.dart';
import 'package:sqt_merchant/screens/board.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status);

Map<String, dynamic> order(String state, {bool allergens = true}) => {
      'id': 5,
      'code': 'SQT-AAA111',
      'state': state,
      'prepState': state == 'CHO_QUAN_XAC_NHAN' ? 'NOT_STARTED' : 'PREPARING',
      'total': 127000,
      'paymentMethod': 'COD',
      'customerCompletedOrders': 12,
      'hasAllergens': allergens,
      'schedule': null,
      'orderNote': 'Gói riêng',
      'items': [
        {'name': 'Phở bò tái', 'quantity': 2, 'noteTags': ['Không hành'], 'note': null, 'allergens': allergens ? ['PEANUT'] : []},
      ],
    };

void main() {
  late FakePartnerDevice device;
  setUp(() => PartnerDevice.instance = device = FakePartnerDevice());

  testWidgets('đơn mới có dị ứng: hiện cảnh báo đỏ, phải tick đã đọc mới nhận được; gửi đúng thời gian chuẩn bị', (tester) async {
    var state = 'CHO_QUAN_XAC_NHAN';
    Map<String, dynamic>? accepted;
    final api = ApiClient(
      tokens: MemoryTokenStore('t'),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        if (req.url.path == '/v1/merchant/stores/1/orders') return json({'orders': [order(state)]});
        if (req.url.path == '/v1/merchant/orders/5/accept') {
          accepted = jsonDecode(req.body) as Map<String, dynamic>;
          state = 'DANG_TIM_SHIPPER';
          return json({'id': 5, 'state': state});
        }
        return json({}, 404);
      }),
    );
    await api.restore();
    tester.view.physicalSize = const Size(1080, 2700);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: BoardScreen(api: api, store: const {'id': 1, 'name': 'Phở Cô Lan', 'isOpen': true})));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('🔔 Mới (1)'), findsOneWidget);
    // Quán đang mở: dịch vụ nền kêu chuông đã được bật cho đúng quán.
    expect(device.watching, isTrue);
    expect(device.storeId, 1);
    expect(find.textContaining('Dị ứng: Đậu phộng'), findsOneWidget);
    expect(find.text('Không hành'), findsOneWidget);
    expect(find.textContaining('Khách ✔ 12 đơn'), findsOneWidget);

    await tester.tap(find.byKey(const Key('accept-5')));
    await tester.pumpAndSettle();
    final confirm = find.byKey(const Key('confirm-accept'));
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
    await tester.tap(find.text('10 phút'));
    await tester.tap(find.byKey(const Key('allergy-ack')));
    await tester.pump();
    expect(tester.widget<FilledButton>(confirm).onPressed, isNotNull);
    await tester.tap(confirm);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 200));

    expect(accepted, {'prepTimeMin': 10, 'allergyAck': true});
    expect(find.text('🔔 Mới (0)'), findsOneWidget);
    expect(find.text('Đang làm (1)'), findsOneWidget);
  });
}
