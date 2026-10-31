import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Chuông báo cho quán/shipper (Phần 2.2.3, 2.3.3): kêu lặp lại tới khi được xử lý,
/// hiện toàn màn hình kể cả khi khoá máy (Android). Âm thanh `res/raw/ring.wav`.
class Alerts {
  Alerts._();
  static final instance = Alerts._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  static const urgentChannel = 'sqt_urgent_v1';
  static const serviceChannel = 'sqt_service_v1';

  /// FLAG_INSISTENT của Android: âm thanh lặp lại tới khi người dùng mở hoặc huỷ thông báo.
  static final _insistent = Int32List.fromList(<int>[4]);

  Future<void> init() async {
    if (_ready) return;
    await _plugin.initialize(const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(requestAlertPermission: false, requestSoundPermission: false, requestBadgePermission: false),
    ));
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(const AndroidNotificationChannel(
      urgentChannel,
      'Đơn mới & lời mời chuyến',
      description: 'Chuông lớn, lặp lại tới khi bạn xử lý',
      importance: Importance.max,
      sound: RawResourceAndroidNotificationSound('ring'),
      enableVibration: true,
    ));
    await android?.createNotificationChannel(const AndroidNotificationChannel(
      serviceChannel,
      'Đang nhận đơn',
      description: 'Thông báo thường trực khi app đang theo dõi đơn',
      importance: Importance.low,
      playSound: false,
    ));
    _ready = true;
  }

  Future<void> requestPermissions() async {
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.requestNotificationsPermission();
    await android?.requestFullScreenIntentPermission();
    await _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(alert: true, sound: true, badge: true);
  }

  Future<void> urgent(int id, String title, String body) async {
    await init();
    await _plugin.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          urgentChannel,
          'Đơn mới & lời mời chuyến',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.call,
          fullScreenIntent: true,
          visibility: NotificationVisibility.public,
          sound: const RawResourceAndroidNotificationSound('ring'),
          additionalFlags: _insistent,
          ticker: title,
        ),
        iOS: const DarwinNotificationDetails(presentSound: true, sound: 'ring.wav', interruptionLevel: InterruptionLevel.timeSensitive),
      ),
    );
  }

  Future<void> cancel(int id) => _plugin.cancel(id);
}
