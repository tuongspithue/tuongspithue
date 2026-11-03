/// Khả năng của trình duyệt cho bản web (PWA). Trên Android/iOS bản cài đặt thì dùng bản stub.
library;

export 'bridge_stub.dart' if (dart.library.js_interop) 'bridge_web.dart';
