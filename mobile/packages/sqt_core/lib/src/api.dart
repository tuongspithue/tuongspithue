import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Địa chỉ API, đặt khi build: `--dart-define=API_URL=https://api.example.vn`.
/// App quán/shipper còn cho người dùng nhập địa chỉ ở lần mở đầu tiên (xem [ApiClient.loadServer]).
const String kApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000');

/// Bản build có gắn sẵn địa chỉ máy chủ thật hay chỉ là mặc định để chạy thử trên máy.
bool get kHasBuiltInServer => !kApiUrl.contains('localhost') && !kApiUrl.contains('vidu.vn');

/// Chuẩn hoá địa chỉ người dùng gõ/dán: thêm https://, bỏ "/" cuối, bỏ "/health" hoặc "/v1" dán thừa.
String normalizeServerUrl(String input) {
  var s = input.trim().replaceAll(RegExp(r'\s'), '');
  if (s.isEmpty) return s;
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(s)) s = 'https://$s';
  s = s.replaceFirst(RegExp(r'/+$'), '');
  s = s.replaceFirst(RegExp(r'/(health|v1)$'), '');
  return s.replaceFirst(RegExp(r'/+$'), '');
}

const _kServerKey = 'sqt-server-url';

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
  String baseUrl;
  String? _token;

  /// Đọc địa chỉ máy chủ người dùng đã lưu. Trả về false nếu chưa có và bản build cũng không gắn sẵn
  /// → app hiện màn "Kết nối máy chủ" để người dùng nhập.
  Future<bool> loadServer() async {
    final saved = (await SharedPreferences.getInstance()).getString(_kServerKey);
    if (saved != null && saved.isNotEmpty) {
      baseUrl = saved;
      return true;
    }
    return kHasBuiltInServer;
  }

  /// Thử kết nối tới địa chỉ (gọi /health), được thì lưu lại và dùng luôn.
  Future<void> setServer(String input) async {
    final url = normalizeServerUrl(input);
    if (url.isEmpty) throw ApiException(0, 'SERVER_EMPTY', 'Hãy nhập địa chỉ máy chủ');
    final Uri uri;
    try {
      uri = Uri.parse('$url/health');
      if (uri.host.isEmpty) throw const FormatException();
    } catch (_) {
      throw ApiException(0, 'SERVER_INVALID', 'Địa chỉ không hợp lệ');
    }
    late http.Response res;
    try {
      res = await _http.get(uri).timeout(const Duration(seconds: 10));
    } catch (_) {
      throw ApiException(0, 'SERVER_UNREACHABLE', 'Không kết nối được tới $url. Kiểm tra lại địa chỉ, mạng, và máy chủ đã bật chưa');
    }
    Object? data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {}
    if (res.statusCode != 200 || data is! Map || data['status'] != 'ok') {
      throw ApiException(res.statusCode, 'SERVER_NOT_SQT',
          'Địa chỉ này không phải máy chủ Ship Quanh Tôi (mã ${res.statusCode}). Codespace: dùng địa chỉ cổng 3000 và để chế độ Public');
    }
    if (url != baseUrl) await signOut();
    baseUrl = url;
    await (await SharedPreferences.getInstance()).setString(_kServerKey, url);
  }

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
