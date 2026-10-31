import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Địa chỉ API, đặt khi build: `--dart-define=API_URL=https://api.example.vn`.
const String kApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000');

/// Lỗi nghiệp vụ trả về từ API theo dạng `{ error: { code, message } }` (Phần 6.4).
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);
  final int status;
  final String code;
  final String message;

  @override
  String toString() => message;
}

/// Lưu token đăng nhập. Mặc định dùng SharedPreferences; test dùng [MemoryTokenStore].
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String? token);
}

class PrefsTokenStore implements TokenStore {
  PrefsTokenStore(this.key);
  final String key;

  @override
  Future<String?> read() async => (await SharedPreferences.getInstance()).getString(key);

  @override
  Future<void> write(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null) {
      await prefs.remove(key);
    } else {
      await prefs.setString(key, token);
    }
  }
}

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._token]);
  String? _token;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String? token) async => _token = token;
}

/// Gọi API backend. Mọi màn hình đi qua đây để xử lý lỗi và phiên đăng nhập thống nhất.
class ApiClient {
  ApiClient({required this.tokens, http.Client? client, String? baseUrl})
      : _http = client ?? http.Client(),
        baseUrl = baseUrl ?? kApiUrl;

  final TokenStore tokens;
  final http.Client _http;
  final String baseUrl;
  String? _token;

  Future<bool> restore() async {
    _token = await tokens.read();
    return _token != null;
  }

  bool get signedIn => _token != null;

  Future<void> signOut() async {
    _token = null;
    await tokens.write(null);
  }

  /// Khách: nhập tên + số là dùng được, không cần mã xác minh — người nhận đơn sẽ gọi xác minh.
  Future<int> signInCustomer(String phone, String name) =>
      _saveSession(post('/v1/auth/customer', {'phone': phone, 'name': name}));

  /// Quán/shipper/Admin: đăng nhập bằng mã kích hoạt 8 số Admin gửi qua Zalo/SMS.
  Future<int> activate(String phone, String code) => _saveSession(post('/v1/auth/activate', {'phone': phone, 'code': code}));

  Future<int> _saveSession(Future<dynamic> request) async {
    final res = await request;
    _token = res['accessToken'] as String;
    await tokens.write(_token);
    return res['userId'] as int;
  }

  Future<dynamic> get(String path, [Map<String, String>? query]) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body, Map<String, String>? headers]) => _send('POST', path, body: body, headers: headers);
  Future<dynamic> patch(String path, Object body) => _send('PATCH', path, body: body);

  /// Tải tệp (multipart) — dùng cho ảnh bằng chứng giao hàng.
  Future<dynamic> upload(String path, List<int> bytes, {required String filename, required String contentType}) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    if (_token != null) req.headers['Authorization'] = 'Bearer $_token';
    final parts = contentType.split('/');
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename, contentType: MediaType(parts[0], parts[1])));
    late http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 60)));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Không tải được ảnh, vui lòng kiểm tra mạng');
    }
    final data = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      final err = data is Map ? data['error'] as Map? : null;
      throw ApiException(res.statusCode, err?['code'] as String? ?? 'ERROR', err?['message'] as String? ?? 'Có lỗi xảy ra');
    }
    return data;
  }

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query, Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final req = http.Request(method, uri)
      ..headers.addAll({
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
        ...?headers,
      });
    if (body != null) req.body = jsonEncode(body);
    late http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Không kết nối được máy chủ, vui lòng kiểm tra mạng');
    }
    final data = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      if (res.statusCode == 401) await signOut();
      final err = data is Map ? data['error'] as Map? : null;
      throw ApiException(res.statusCode, err?['code'] as String? ?? 'ERROR', err?['message'] as String? ?? 'Có lỗi xảy ra');
    }
    return data;
  }
}

/// Khoá chống gửi trùng cho thao tác đặt đơn (Phần 3.2, quy tắc 4).
String newIdempotencyKey() {
  final r = Random.secure();
  return List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
}
