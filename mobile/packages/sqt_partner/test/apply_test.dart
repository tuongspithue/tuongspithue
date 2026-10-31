import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_partner/sqt_partner.dart';

void main() {
  testWidgets('shipper gửi hồ sơ không cần đăng nhập; được báo Admin sẽ gọi xác minh rồi gửi mã', (tester) async {
    Map<String, dynamic>? sent;
    final api = ApiClient(
      tokens: MemoryTokenStore(),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        expect(req.url.path, '/v1/auth/partner-apply');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response.bytes(utf8.encode(jsonEncode({'status': 'PENDING', 'message': 'Đã gửi hồ sơ. Admin sẽ gọi cho bạn.'})), 201);
      }),
    );
    await tester.pumpWidget(MaterialApp(home: PartnerApplyScreen(api: api, kind: PartnerKind.rider)));
    await tester.enterText(find.byKey(const Key('apply-name')), 'Trần Văn Tài');
    await tester.enterText(find.byKey(const Key('apply-phone')), '0933000009');
    await tester.tap(find.text('Xe điện'));
    await tester.tap(find.byKey(const Key('apply-submit')));
    await tester.pump();

    expect(sent, {'phone': '0933000009', 'fullName': 'Trần Văn Tài', 'kind': 'RIDER', 'vehicleType': 'EMOTORBIKE'});
    expect(find.text('Đã gửi hồ sơ. Admin sẽ gọi cho bạn.'), findsOneWidget);
  });

  testWidgets('quán phải lấy vị trí tại quán trước khi gửi', (tester) async {
    var calls = 0;
    final api = ApiClient(tokens: MemoryTokenStore(), baseUrl: 'http://api', client: MockClient((_) async {
      calls++;
      return http.Response('{}', 201);
    }));
    await tester.pumpWidget(MaterialApp(home: PartnerApplyScreen(api: api, kind: PartnerKind.merchant)));
    await tester.enterText(find.byKey(const Key('apply-name')), 'Cô Lan');
    await tester.enterText(find.byKey(const Key('apply-phone')), '0911000009');
    await tester.enterText(find.byKey(const Key('apply-store')), 'Bánh Mì Cô Lan');
    await tester.enterText(find.byKey(const Key('apply-address')), '3 Hàm Nghi, Quận 1');
    await tester.ensureVisible(find.byKey(const Key('apply-submit')));
    await tester.tap(find.byKey(const Key('apply-submit')));
    await tester.pump();
    expect(find.textContaining('Lấy vị trí quán'), findsWidgets);
    expect(calls, 0);
  });
}
