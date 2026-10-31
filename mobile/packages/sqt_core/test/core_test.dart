import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqt_core/sqt_core.dart';

void main() {
  test('định dạng tiền và nhãn trạng thái', () {
    expect(money(85000), '85.000đ');
    expect(money(1250000), '1.250.000đ');
    expect(stateLabel('CHO_QUAN_XAC_NHAN'), 'Chờ quán xác nhận');
  });

  test('ApiClient lưu token sau khi đăng nhập bằng mã kích hoạt và gắn vào các yêu cầu sau', () async {
    final seen = <String?>[];
    final client = MockClient((req) async {
      seen.add(req.headers['Authorization']);
      if (req.url.path == '/v1/auth/activate') return http.Response(jsonEncode({'accessToken': 'tok', 'userId': 7}), 200);
      return http.Response('{"ok":true}', 200);
    });
    final store = MemoryTokenStore();
    final api = ApiClient(tokens: store, client: client, baseUrl: 'http://x');
    expect(await api.activate('0901234567', '12345678'), 7);
    expect(await store.read(), 'tok');
    await api.get('/v1/me/trust');
    expect(seen.last, 'Bearer tok');
  });

  test('lỗi nghiệp vụ được chuyển thành ApiException có mã; 401 thì đăng xuất', () async {
    final api = ApiClient(
      tokens: MemoryTokenStore('old'),
      baseUrl: 'http://x',
      client: MockClient((_) async => http.Response.bytes(utf8.encode(jsonEncode({'error': {'code': 'STORE_CLOSED', 'message': 'Quán đang đóng cửa'}})), 422)),
    );
    await api.restore();
    await expectLater(api.get('/x'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'STORE_CLOSED')));

    final expired = ApiClient(tokens: MemoryTokenStore('old'), baseUrl: 'http://x', client: MockClient((_) async => http.Response('{}', 401)));
    await expired.restore();
    await expectLater(expired.get('/x'), throwsA(isA<ApiException>()));
    expect(expired.signedIn, isFalse);
  });
}
