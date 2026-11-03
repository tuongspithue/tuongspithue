import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:sqt_core/sqt_core.dart';

import 'alerts.dart';

/// "Kiểm tra máy của bạn" (Phần 5.10): đủ quyền thông báo, vị trí, không bị tối ưu pin, thử chuông.
/// Lỗi phổ biến nhất khiến quán/shipper lỡ đơn là Android tự tắt app chạy nền.
class DeviceCheckScreen extends StatefulWidget {
  const DeviceCheckScreen({super.key, required this.needsBackgroundLocation});
  final bool needsBackgroundLocation;

  @override
  State<DeviceCheckScreen> createState() => _DeviceCheckScreenState();
}

class _DeviceCheckScreenState extends State<DeviceCheckScreen> with WidgetsBindingObserver {
  final _status = <String, bool>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Quay lại từ màn hình cài đặt thì kiểm tra lại.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final s = <String, bool>{
      'notification': await Permission.notification.isGranted,
      'location': await Permission.locationWhenInUse.isGranted,
    };
    if (widget.needsBackgroundLocation) s['locationAlways'] = await Permission.locationAlways.isGranted;
    if (Platform.isAndroid) s['battery'] = await Permission.ignoreBatteryOptimizations.isGranted;
    if (mounted) setState(() => _status..clear()..addAll(s));
  }

  Widget _item(String key, String title, String hint, Future<void> Function() fix) {
    final ok = _status[key];
    return Card(
      child: ListTile(
        leading: Icon(ok == true ? Icons.check_circle : Icons.error, color: ok == true ? SqtColors.confirmed : SqtColors.danger),
        title: Text(title),
        subtitle: Text(ok == true ? 'Đã sẵn sàng' : hint),
        trailing: ok == true ? null : FilledButton(onPressed: () async => {await fix(), await _refresh()}, child: const Text('Sửa')),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allOk = _status.isNotEmpty && _status.values.every((v) => v);
    return Scaffold(
      appBar: AppBar(title: const Text('Kiểm tra máy của bạn')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(allOk ? '✅ Máy đã sẵn sàng nhận đơn' : 'Hoàn thành các mục dưới để không lỡ đơn', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        _item('notification', 'Cho phép thông báo', 'Cần để kêu chuông khi có đơn', () async {
          await Alerts.instance.requestPermissions();
        }),
        _item('location', 'Cho phép vị trí', 'Cần để kiểm tra bạn đã tới quán/điểm giao', () async {
          await Geolocator.requestPermission();
        }),
        if (widget.needsBackgroundLocation)
          _item('locationAlways', 'Vị trí "Luôn cho phép"', 'Để khách thấy bạn trên bản đồ khi bạn mở Google Maps', () async {
            await Permission.locationAlways.request();
          }),
        if (Platform.isAndroid)
          _item('battery', 'Không tối ưu pin cho app', 'Nếu không, Android có thể tắt app khi khoá máy và bạn lỡ đơn', () async {
            await Permission.ignoreBatteryOptimizations.request();
          }),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.volume_up),
          label: const Text('Thử chuông (khoá máy ngay sau khi bấm để thử)'),
          onPressed: () async {
            await Alerts.instance.urgent(9999, '🔔 Thử chuông', 'Bấm vào đây để tắt');
          },
        ),
        TextButton(onPressed: () => Alerts.instance.cancel(9999), child: const Text('Tắt chuông thử')),
        const SizedBox(height: 8),
        const Text('Một số máy (Xiaomi, Oppo, Vivo…) còn có mục "Tự khởi chạy" trong Cài đặt — hãy bật cho app này.'),
      ]),
    );
  }
}
