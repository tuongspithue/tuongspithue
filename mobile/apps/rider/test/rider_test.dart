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
  late FakePartnerDevice device;
  setUp(() => PartnerDevice.instance = device = FakePartnerDevice());

  testWidgets('nhận lời mời chuyến; tới quán khi GPS yếu thì xác nhận kèm ảnh', (tester) async {
    var accepted = false;
    final arrivedBodies = <Map<String, dynamic>>[];
    final trip = {
      'id': 7, 'code': 'SQT-RRR777', 'state': 'SHIPPER_DA_NHAN', 'paymentMethod': 'COD', 'total': 82000, 'customerCompletedOrders': 4,
      'schedule': null, 'orderNote': null, 'items': [{'name': 'Cơm sườn', 'quantity': 1, 'noteTags': [], 'note': null, 'allergens': []}],
    };
    final api = ApiClient(
      tokens: MemoryTokenStore('t'),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        switch (req.url.path) {
          case '/v1/rider/offers':
            return json({'offers': accepted ? [] : [{'id': 3, 'orderId': 7, 'storeName': 'Cơm Tấm Bà Sáu', 'distanceToStoreM': 300, 'tripDistanceM': 1300, 'earning': 12000, 'cashToCollect': 82000}]});
          case '/v1/rider/scheduled-board':
            return json({'tier': 'ROOKIE', 'trips': []});
          case '/v1/rider/trips':
            return json({'trips': accepted ? [trip] : []});
          case '/v1/me/trust':
            return json({'tier': 'ROOKIE', 'score': 70, 'completed': 0, 'stars': null, 'components': {}});
          case '/v1/rider/offers/3/accept':
            accepted = true;
            return json({'id': 7, 'state': 'SHIPPER_DA_NHAN'});
          case '/v1/rider/orders/7/arrived-store':
            final body = jsonDecode(req.body) as Map<String, dynamic>;
            arrivedBodies.add(body);
            if (body['photoUrl'] == null) {
              return json({'error': {'code': 'OUTSIDE_GEOFENCE', 'message': 'Bạn đang cách điểm đến 420 m.'}}, 422);
            }
            return json({'id': 7, 'state': 'SHIPPER_DEN_QUAN'});
        }
        return json({}, 404);
      }),
    );
    await api.restore();
    tester.view.physicalSize = const Size(1080, 2400);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: RiderHome(api: api)));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Thu nhập 12.000đ'), findsOneWidget);
    expect(find.text('💵 Thu tiền mặt 82.000đ'), findsOneWidget);
    await tester.tap(find.byKey(const Key('accept-offer-3')));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    expect(find.text('Chuyến của tôi (1)'), findsOneWidget);
    await tester.ensureVisible(find.byType(Tab).at(2));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Tab).at(2));
    await tester.pumpAndSettle();
    expect(find.text('SQT-RRR777'), findsOneWidget);
    await tester.tap(find.text('📍 ĐÃ TỚI QUÁN'));
    await tester.pumpAndSettle();
    expect(find.text('Bạn đang ở xa điểm đến'), findsOneWidget);
    await tester.tap(find.text('📷 Chụp ảnh xác nhận'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(arrivedBodies.length, 2);
    expect(arrivedBodies.last['photoUrl'], device.photoUrl);
    expect(arrivedBodies.last['lat'], 10.7769);
  });
}
