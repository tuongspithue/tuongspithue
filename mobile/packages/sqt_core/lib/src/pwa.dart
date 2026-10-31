import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'bridge.dart';
import 'theme.dart';
import 'widgets.dart';

/// Lần đầu mở trên điện thoại bằng trình duyệt: yêu cầu thêm vào màn hình chính.
/// Trên iPhone, thông báo đẩy chỉ hoạt động khi app đã được thêm vào màn hình chính.
/// Trên máy tính (để thử) cho phép tiếp tục trên trình duyệt.
class InstallGate extends StatefulWidget {
  const InstallGate({super.key, required this.appName, required this.child});
  final String appName;
  final Widget child;

  @override
  State<InstallGate> createState() => _InstallGateState();
}

class _InstallGateState extends State<InstallGate> {
  bool _skipped = false;

  @override
  Widget build(BuildContext context) {
    if (!Browser.isWeb || Browser.isStandalone || _skipped) return widget.child;
    final ios = Browser.isIos;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ListView(padding: const EdgeInsets.all(24), shrinkWrap: true, children: [
              const Icon(Icons.add_to_home_screen, size: 72, color: SqtColors.primary),
              const SizedBox(height: 12),
              Text('Thêm ${widget.appName} vào màn hình chính', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 12),
              const Text('Để nhận thông báo đơn hàng và mở nhanh như một ứng dụng.', textAlign: TextAlign.center),
              const SizedBox(height: 20),
              if (ios) ...[
                const _Step(n: 1, text: 'Bấm nút Chia sẻ (ô vuông có mũi tên lên) ở thanh dưới của Safari'),
                const _Step(n: 2, text: 'Chọn "Thêm vào MH chính"'),
                const _Step(n: 3, text: 'Mở app từ biểu tượng mới trên màn hình chính'),
                const SizedBox(height: 8),
                const Text('Lưu ý: phải mở bằng Safari.', textAlign: TextAlign.center, style: TextStyle(fontStyle: FontStyle.italic)),
              ] else if (Browser.canPromptInstall)
                FilledButton.icon(
                  icon: const Icon(Icons.install_mobile),
                  label: const Text('Cài vào màn hình chính'),
                  onPressed: () async {
                    if (await Browser.promptInstall()) setState(() => _skipped = true);
                  },
                )
              else ...[
                const _Step(n: 1, text: 'Mở menu ⋮ của Chrome'),
                const _Step(n: 2, text: 'Chọn "Thêm vào màn hình chính" hoặc "Cài đặt ứng dụng"'),
                const _Step(n: 3, text: 'Mở app từ biểu tượng mới trên màn hình chính'),
              ],
              if (!Browser.isMobile) ...[
                const SizedBox(height: 16),
                TextButton(onPressed: () => setState(() => _skipped = true), child: const Text('Đang dùng máy tính — tiếp tục trên trình duyệt')),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.n, required this.text});
  final int n;
  final String text;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(backgroundColor: SqtColors.primary, foregroundColor: Colors.white, child: Text('$n')),
        title: Text(text),
      );
}

/// Bật thông báo đẩy (phải do người dùng bấm — yêu cầu của iPhone). Ẩn khi đã bật hoặc không hỗ trợ.
class PushBanner extends StatefulWidget {
  const PushBanner({super.key, required this.api, required this.app});
  final ApiClient api;

  /// CUSTOMER, MERCHANT hoặc RIDER.
  final String app;

  @override
  State<PushBanner> createState() => _PushBannerState();
}

class _PushBannerState extends State<PushBanner> {
  late bool _hidden = !Browser.isWeb || !Browser.pushSupported || Browser.pushPermission == 'granted';
  bool _busy = false;

  Future<void> _enable() async {
    setState(() => _busy = true);
    try {
      final key = (await widget.api.get('/v1/push/public-key'))['publicKey'] as String?;
      if (key == null) throw ApiException(0, 'PUSH_OFF', 'Máy chủ chưa bật thông báo đẩy');
      final raw = await Browser.subscribePush(key);
      if (raw == null) {
        if (mounted) showDone(context, 'Bạn chưa cho phép thông báo. Có thể bật lại trong cài đặt trình duyệt.');
        return;
      }
      final sub = jsonDecode(raw) as Map<String, dynamic>;
      await widget.api.post('/v1/push/subscribe', {'app': widget.app, 'endpoint': sub['endpoint'], 'keys': sub['keys']});
      setState(() => _hidden = true);
      if (mounted) showDone(context, 'Đã bật thông báo');
    } on ApiException catch (e) {
      if (mounted) showDone(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    return MaterialBanner(
      leading: const Icon(Icons.notifications_active, color: SqtColors.primary),
      content: const Text('Bật thông báo để không lỡ đơn hàng'),
      actions: [TextButton(onPressed: _busy ? null : _enable, child: const Text('BẬT'))],
    );
  }
}

/// Nút Gọi / SMS / Zalo mở app trên máy (không dùng dịch vụ trả phí).
class ContactButtons extends StatelessWidget {
  const ContactButtons({super.key, required this.label, required this.phone});
  final String label;
  final String? phone;

  @override
  Widget build(BuildContext context) {
    final p = phone;
    if (p == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:$p')), icon: const Icon(Icons.call), label: const Text('Gọi')),
        OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('sms:$p')), icon: const Icon(Icons.sms), label: const Text('SMS')),
        OutlinedButton.icon(
          onPressed: () => launchUrl(Uri.parse('https://zalo.me/$p'), mode: LaunchMode.externalApplication),
          icon: const Icon(Icons.chat),
          label: const Text('Zalo'),
        ),
      ]),
    );
  }
}

/// Vị trí hiện tại từ GPS của máy/trình duyệt (cần người dùng cho phép). Lỗi thì trả null kèm lý do.
Future<({double lat, double lng})?> currentPosition({void Function(String reason)? onError}) async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      onError?.call('Hãy bật định vị (GPS) trên máy');
      return null;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      onError?.call('Bạn chưa cho phép dùng vị trí. Có thể bật lại trong cài đặt trình duyệt.');
      return null;
    }
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    return (lat: p.latitude, lng: p.longitude);
  } catch (_) {
    onError?.call('Không lấy được vị trí, vui lòng thử lại');
    return null;
  }
}
