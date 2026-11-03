/// Bản không phải web: các tính năng PWA không áp dụng.
class Browser {
  static bool get isWeb => false;
  static bool get isStandalone => true;
  static bool get isIos => false;
  static bool get isMobile => true;
  static bool get canPromptInstall => false;
  static Future<bool> promptInstall() async => false;
  static Future<bool> keepScreenOn(bool on) async => false;
  static void unlockAudio() {}
  static void alarm(bool on) {}
  static bool get pushSupported => false;
  static String get pushPermission => 'unsupported';
  static Future<String?> subscribePush(String vapidKey) async => null;
  static String? get startOrderId => null;
}
