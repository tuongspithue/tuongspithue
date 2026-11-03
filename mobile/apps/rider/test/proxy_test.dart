import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_partner/sqt_partner.dart';
import 'package:sqt_rider/screens/home.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status);

void main() {
  setUp(() => PartnerDevice.instance = FakePartnerDevice());

  testWidgets('mua hộ: đặt món tại quán (đọc dị ứng) → trả tiền; giá lệch thì hỏi khách rồi gửi lại', (tester) async {
    var ordered = false;
    final purchases = <Map<String, dynamic>>[];
    Map<String, dynamic> trip() => {
          'id': 8, 'code': 'SQT-PRX888', 'state': 'SHIPPER_DEN_QUAN', 'fulfillment': 'PROXY', 'acceptedChannel': ordered ? 'RIDER_PROXY' : null,
          'hasAllergens': true, 'subtotal': 80000, 'total': 97000, 'paymentMethod': 'COD', 'customerCompletedOrders': 3, 'schedule': null, 'orderNote': null,
          'contacts': {'customer': '0922400001'}, 'buyer': {'name': 'Anh Quen', 'phone': '0922400001'},
          'items': [{'name': 'Bún bò', 'quantity': 2, 'noteTags': ['Không hành'], 'note': null, 'allergens': ['PEANUT']}],
        };
    final api = ApiClient(
      tokens: MemoryTokenStore('t'),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        switch (req.url.path) {
          case '/v1/rider/offers':
            return json({'offers': []});
          case '/v1/rider/scheduled-board':
            return json({'trips': []});
          case '/v1/rider/trips':
            return json({'trips': [trip()]});
          case '/v1/me/trust':
            return json({'tier': 'ROOKIE', 'score': 70, 'completed': 0, 'stars': null, 'components': {}});
          case '/v1/rider/orders/8/proxy-ordered':
            expect(jsonDecode(req.body)['allergyAck'], isTrue);
            ordered = true;
            return json({'id': 8, 'state': 'SHIPPER_DEN_QUAN'});
          case '/v1/rider/orders/8/proxy-purchased':
            final body = jsonDecode(req.body) as Map<String, dynamic>;
            purchases.add(body);
            if (body['customerAgreed'] != true) {
              return json({'error': {'code': 'PRICE_CHANGED', 'message': 'Tiền món thật 100.000đ lệch 25% so với app.'}}, 422);
            }
            return json({'id': 8, 'state': 'DANG_GIAO'});
        }
        return json({}, 404);
      }),
    );
    await api.restore();
    tester.view.physicalSize = const Size(1080, 2600);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: RiderHome(api: api)));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.ensureVisible(find.byType(Tab).at(2));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Tab).at(2));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('proxy-ordered')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('proxy-ordered')));
    await tester.pumpAndSettle();
    // Có dị ứng: phải tick đã đọc cho quán mới xác nhận được.
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Quán đã nhận món')).onPressed, isNull);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.tap(find.text('Quán đã nhận món'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(ordered, isTrue);

    await tester.ensureVisible(find.byKey(const Key('proxy-purchased')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('proxy-purchased')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('proxy-amount')), '100000');
    await tester.tap(find.text('Xác nhận'));
    await tester.pumpAndSettle();
    expect(find.text('Giá thay đổi'), findsOneWidget);
    await tester.tap(find.text('Khách đã đồng ý'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xác nhận'));
    await tester.pumpAndSettle();
    expect(purchases.map((p) => p['customerAgreed']), [null, true]);
    expect(purchases.last['amount'], 80000); // ô tiền điền lại theo app ở lần 2; shipper sửa nếu cần
  });
}
