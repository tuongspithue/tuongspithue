import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status);

void main() {
  testWidgets('khách nhập tên + số là xong, không cần mã xác minh', (tester) async {
    Map<String, dynamic>? sent;
    var signedIn = false;
    final api = ApiClient(
      tokens: MemoryTokenStore(),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'accessToken': 'tok', 'userId': 3});
      }),
    );
    await tester.pumpWidget(MaterialApp(home: CustomerSignInScreen(api: api, onSignedIn: () => signedIn = true)));

    await tester.enterText(find.byKey(const Key('phone')), '0901234567');
    await tester.tap(find.byKey(const Key('sign-in')));
    await tester.pump();
    expect(find.textContaining('Vui lòng nhập tên'), findsOneWidget);
    expect(sent, isNull);

    await tester.enterText(find.byKey(const Key('name')), 'Chị Hoa');
    await tester.tap(find.byKey(const Key('sign-in')));
    await tester.pump();
    expect(sent, {'phone': '0901234567', 'name': 'Chị Hoa'});
    expect(signedIn, isTrue);
    expect(api.signedIn, isTrue);
  });

  testWidgets('đối tác đăng nhập bằng số + mã kích hoạt 8 số; sai mã thì báo lỗi', (tester) async {
    var signedIn = false;
    var applied = false;
    final api = ApiClient(
      tokens: MemoryTokenStore(),
      baseUrl: 'http://api',
      client: MockClient((req) async {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        if (body['code'] != '12345678') return json({'error': {'code': 'CODE_WRONG', 'message': 'Mã kích hoạt không đúng'}}, 401);
        return json({'accessToken': 'tok', 'userId': 9});
      }),
    );
    await tester.pumpWidget(MaterialApp(
      home: PartnerSignInScreen(api: api, title: 'Đăng nhập quán', onSignedIn: () => signedIn = true, onApply: () => applied = true),
    ));
    await tester.enterText(find.byKey(const Key('phone')), '0911000001');
    await tester.enterText(find.byKey(const Key('code')), '1234');
    await tester.tap(find.byKey(const Key('sign-in')));
    await tester.pump();
    expect(find.text('Mã kích hoạt gồm 8 chữ số'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('code')), '00000000');
    await tester.tap(find.byKey(const Key('sign-in')));
    await tester.pump();
    expect(find.text('Mã kích hoạt không đúng'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('code')), '12345678');
    await tester.tap(find.byKey(const Key('sign-in')));
    await tester.pump();
    expect(signedIn, isTrue);

    await tester.tap(find.byKey(const Key('apply')));
    expect(applied, isTrue);
  });
}
