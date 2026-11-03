import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqt_core/sqt_core.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status);

void main() {
  test('chuẩn hoá địa chỉ dán vào: thêm https, bỏ / cuối, /health, /v1', () {
    expect(normalizeServerUrl(' abc-3000.app.github.dev/ '), 'https://abc-3000.app.github.dev');
    expect(normalizeServerUrl('https://api.vidu.vn/health'), 'https://api.vidu.vn');
    expect(normalizeServerUrl('http://192.168.1.5:3000/v1/'), 'http://192.168.1.5:3000');
  });

  testWidgets('lần đầu mở app: nhập địa chỉ, kiểm tra /health rồi lưu; địa chỉ sai thì báo rõ', (tester) async {
    SharedPreferences.setMockInitialValues({});
    // Màn hình điện thoại cao để thấy cả ô nhập và nút.
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.6;
    addTearDown(tester.view.reset);
    final api = ApiClient(
      tokens: MemoryTokenStore(),
      client: MockClient((req) async {
        if (req.url.host == 'dung.vn' && req.url.path == '/health') return json({'status': 'ok'});
        return http.Response('<html>Not found</html>', 404);
      }),
    );
    expect(await api.loadServer(), isFalse);
    var done = false;
    await tester.pumpWidget(MaterialApp(home: ServerSetupScreen(api: api, onDone: () => done = true)));
    expect(find.textContaining('Admin Console'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('server-url')), 'sai.vn');
    await tester.tap(find.byKey(const Key('server-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('không phải máy chủ Ship Quanh Tôi'), findsOneWidget);
    expect(done, isFalse);

    await tester.enterText(find.byKey(const Key('server-url')), 'dung.vn/');
    await tester.tap(find.byKey(const Key('server-save')));
    await tester.pumpAndSettle();
    expect(done, isTrue);
    expect(api.baseUrl, 'https://dung.vn');

    // Mở lại app: dùng luôn địa chỉ đã lưu.
    final again = ApiClient(tokens: MemoryTokenStore());
    expect(await again.loadServer(), isTrue);
    expect(again.baseUrl, 'https://dung.vn');
  });
}
