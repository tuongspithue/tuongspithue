import 'dart:js_interop';

import 'package:web/web.dart' as web;

@JS('sqt.isStandalone')
external bool _isStandalone();
@JS('sqt.isIos')
external bool _isIos();
@JS('sqt.isMobile')
external bool _isMobile();
@JS('sqt.canPromptInstall')
external bool _canPromptInstall();
@JS('sqt.promptInstall')
external JSPromise<JSBoolean> _promptInstall();
@JS('sqt.keepScreenOn')
external JSPromise<JSBoolean> _keepScreenOn(bool on);
@JS('sqt.unlockAudio')
external bool _unlockAudio();
@JS('sqt.alarm')
external void _alarm(bool on);
@JS('sqt.pushSupported')
external bool _pushSupported();
@JS('sqt.pushPermission')
external String _pushPermission();
@JS('sqt.subscribePush')
external JSPromise<JSString?> _subscribePush(String vapidKey);

/// Cầu nối tới `web/sqt.js`: cài lên màn hình chính, giữ màn hình sáng, chuông, thông báo đẩy.
class Browser {
  static bool get isWeb => true;
  static bool get isStandalone => _isStandalone();
  static bool get isIos => _isIos();
  static bool get isMobile => _isMobile();
  static bool get canPromptInstall => _canPromptInstall();
  static Future<bool> promptInstall() async => (await _promptInstall().toDart).toDart;
  static Future<bool> keepScreenOn(bool on) async => (await _keepScreenOn(on).toDart).toDart;
  static void unlockAudio() => _unlockAudio();
  static void alarm(bool on) => _alarm(on);
  static bool get pushSupported => _pushSupported();
  static String get pushPermission => _pushPermission();
  static Future<String?> subscribePush(String vapidKey) async => (await _subscribePush(vapidKey).toDart)?.toDart;

  /// Mở từ thông báo đẩy: `/?order=123`.
  static String? get startOrderId => Uri.parse(web.window.location.href).queryParameters['order'];
}
