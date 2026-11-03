import 'dart:async';
import 'dart:ui';

import 'package:flutter/widgets.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqt_core/sqt_core.dart';

import 'alerts.dart';
import 'tracker.dart';

/// Chế độ theo dõi: quán theo dõi đơn mới; shipper theo dõi lời mời chuyến và gửi vị trí.
enum WatchMode { merchant, rider }

const _kMode = 'sqt-watch-mode';
const _kStore = 'sqt-watch-store';
const _kTokenKey = 'sqt-watch-token-key';
const _kApiUrl = 'sqt-watch-api-url';

/// Dịch vụ chạy nền (foreground service trên Android): vẫn chạy khi khoá máy hoặc mở app khác,
/// hỏi máy chủ mỗi 10 giây, kêu chuông khi có đơn mới/lời mời; shipper gửi vị trí mỗi 15 giây.
/// Không cần dịch vụ đẩy trả phí hay Firebase (Phần 2.2.3, 2.3.2, 5.4).
class Watcher {
  static final _service = FlutterBackgroundService();

  static Future<void> configure(WatchMode mode) async {
    await Alerts.instance.init();
    await _service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: watcherMain,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: Alerts.serviceChannel,
        initialNotificationTitle: mode == WatchMode.merchant ? 'Quán đang nhận đơn' : 'Đang trực tuyến',
        initialNotificationContent: 'Bạn sẽ nghe chuông khi có đơn mới',
        foregroundServiceNotificationId: 7000,
        // Quán dùng specialUse: dataSync bị Android 15 giới hạn 6 giờ/ngày, không đủ cho quán mở cả ngày.
        foregroundServiceTypes: mode == WatchMode.rider ? [AndroidForegroundType.location] : [AndroidForegroundType.specialUse],
      ),
      iosConfiguration: IosConfiguration(autoStart: false, onForeground: watcherMain, onBackground: _iosBackground),
    );
  }

  static Future<void> start({required WatchMode mode, required String tokenKey, int? storeId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kMode, mode.name);
    await prefs.setString(_kTokenKey, tokenKey);
    // Địa chỉ máy chủ người dùng nhập ở lần mở đầu (ServerSetupScreen), không có thì dùng bản build.
    await prefs.setString(_kApiUrl, prefs.getString('sqt-server-url') ?? kApiUrl);
    if (storeId != null) await prefs.setInt(_kStore, storeId);
    if (!await _service.isRunning()) await _service.startService();
  }

  static Future<void> stop() async {
    _service.invoke('stop');
  }

  static Future<bool> get running => _service.isRunning();
}

@pragma('vm:entry-point')
Future<bool> _iosBackground(ServiceInstance service) async => true;

/// Điểm vào của dịch vụ nền (chạy trong isolate riêng).
@pragma('vm:entry-point')
Future<void> watcherMain(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final mode = prefs.getString(_kMode) == 'rider' ? WatchMode.rider : WatchMode.merchant;
  final storeId = prefs.getInt(_kStore);
  final api = ApiClient(tokens: PrefsTokenStore(prefs.getString(_kTokenKey) ?? ''), baseUrl: prefs.getString(_kApiUrl));
  await api.restore();
  await Alerts.instance.init();
  final tracker = AlertTracker();
  final timers = <Timer>[];

  service.on('stop').listen((_) async {
    for (final t in timers) {
      t.cancel();
    }
    for (final id in tracker.update(const []).stop) {
      await Alerts.instance.cancel(id);
    }
    await service.stopSelf();
  });

  Future<void> poll() async {
    try {
      final List<int> pending;
      if (mode == WatchMode.merchant) {
        final res = await api.get('/v1/merchant/stores/$storeId/orders');
        pending = merchantPending(res['orders'] as List);
      } else {
        final res = await api.get('/v1/rider/offers');
        pending = riderPending(res['offers'] as List);
      }
      final diff = tracker.update(pending);
      for (final id in diff.ring) {
        await Alerts.instance.urgent(
          id,
          mode == WatchMode.merchant ? '🔔 ĐƠN MỚI!' : '🛵 CÓ CHUYẾN MỚI!',
          mode == WatchMode.merchant ? 'Mở app để nhận đơn ngay' : 'Mở app để nhận chuyến',
        );
      }
      for (final id in diff.stop) {
        await Alerts.instance.cancel(id);
      }
      if (service is AndroidServiceInstance) {
        await service.setForegroundNotificationInfo(
          title: mode == WatchMode.merchant ? 'Quán đang nhận đơn' : 'Đang trực tuyến',
          content: tracker.ringing > 0 ? '${tracker.ringing} ${mode == WatchMode.merchant ? 'đơn' : 'lời mời'} đang chờ bạn' : 'Đang chờ đơn mới…',
        );
      }
    } on ApiException catch (e) {
      if (e.status == 401) await service.stopSelf();
    } catch (_) {
      // Mất mạng tạm thời: thử lại ở lần sau.
    }
  }

  Future<void> sendLocation() async {
    try {
      final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      await api.post('/v1/rider/location', {'lat': p.latitude, 'lng': p.longitude});
    } catch (_) {}
  }

  await poll();
  timers.add(Timer.periodic(const Duration(seconds: 10), (_) => poll()));
  if (mode == WatchMode.rider) {
    await sendLocation();
    timers.add(Timer.periodic(const Duration(seconds: 15), (_) => sendLocation()));
  }
}
