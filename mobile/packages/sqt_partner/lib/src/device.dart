import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'alerts.dart';
import 'device_check.dart';
import 'photo.dart';
import 'watcher.dart';

/// Các tính năng của máy mà app quán/shipper dùng: chạy nền kêu chuông, giữ màn hình sáng, chụp ảnh.
/// Gom về một chỗ để test widget thay bằng [FakePartnerDevice] (test không có kênh nền tảng).
abstract class PartnerDevice {
  static PartnerDevice instance = NativePartnerDevice();

  /// Bật theo dõi nền: kêu chuông kể cả khi khoá máy hoặc đang mở app khác.
  Future<void> startWatching({required WatchMode mode, required String tokenKey, int? storeId});
  Future<void> stopWatching();
  Future<void> keepScreenOn(bool on);

  /// Chụp ảnh và tải lên; trả về đường dẫn ảnh hoặc null nếu huỷ.
  Future<String?> takePhoto(ApiClient api);

  Future<void> openDeviceCheck(BuildContext context, {required bool needsBackgroundLocation}) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => DeviceCheckScreen(needsBackgroundLocation: needsBackgroundLocation)));
}

class NativePartnerDevice extends PartnerDevice {
  WatchMode? _configured;

  @override
  Future<void> startWatching({required WatchMode mode, required String tokenKey, int? storeId}) async {
    if (_configured != mode) {
      await Watcher.configure(mode);
      _configured = mode;
    }
    await Alerts.instance.requestPermissions();
    await Watcher.start(mode: mode, tokenKey: tokenKey, storeId: storeId);
  }

  @override
  Future<void> stopWatching() => Watcher.stop();

  @override
  Future<void> keepScreenOn(bool on) => WakelockPlus.toggle(enable: on);

  @override
  Future<String?> takePhoto(ApiClient api) => takeAndUploadPhoto(api);
}

/// Dùng trong test: ghi lại lời gọi, không chạm vào nền tảng.
class FakePartnerDevice extends PartnerDevice {
  bool watching = false;
  WatchMode? mode;
  int? storeId;
  bool screenOn = false;
  String? photoUrl = 'https://api.test/uploads/photo.jpg';

  @override
  Future<void> startWatching({required WatchMode mode, required String tokenKey, int? storeId}) async {
    watching = true;
    this.mode = mode;
    this.storeId = storeId;
  }

  @override
  Future<void> stopWatching() async => watching = false;

  @override
  Future<void> keepScreenOn(bool on) async => screenOn = on;

  @override
  Future<String?> takePhoto(ApiClient api) async => photoUrl;
}
