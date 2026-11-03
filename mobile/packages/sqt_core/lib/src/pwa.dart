import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'bridge.dart';
import 'theme.dart';
import 'widgets.dart';

/// Gợi ý (không bắt buộc) thêm web app vào màn hình chính. Khách không phải cài gì để đặt hàng;
/// riêng iPhone cần thêm vào màn hình chính thì mới nhận được thông báo đẩy.
class InstallTip extends StatefulWidget {
  const InstallTip({super.key});

  @override
  State<InstallTip> createState() => _InstallTipState();
}

class _InstallTipState extends State<InstallTip> {
  late bool _hidden = !Browser.isWeb || Browser.isStandalone || !Browser.isMobile || (!Browser.isIos && !Browser.canPromptInstall);

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    final ios = Browser.isIos;
    return Card(
      child: ListTile(
        leading: const Icon(Icons.add_to_home_screen, color: SqtColors.primary),
        title: const Text('Nhận thông báo khi đơn có cập nhật?'),
        subtitle: Text(ios ? 'Bấm Chia sẻ (ô vuông có mũi tên lên) → "Thêm vào MH chính", rồi mở lại từ biểu tượng.' : 'Thêm vào màn hình chính để mở nhanh lần sau.'),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          if (!ios)
            TextButton(
              onPressed: () async {
                await Browser.promptInstall();
                setState(() => _hidden = true);
              },
              child: const Text('THÊM'),
            ),
          IconButton(tooltip: 'Để sau', icon: const Icon(Icons.close), onPressed: () => setState(() => _hidden = true)),
        ]),
      ),
    );
  }
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
        // Hiện cả số để đọc/ghi lại được (VD quán ghi lên túi hàng), không chỉ có nút bấm.
        Text.rich(TextSpan(children: [
          TextSpan(text: label, style: const TextStyle(fontWeight: FontWeight.w600)),
          TextSpan(text: '  $p', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
        ])),
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

/// Mở app Tin nhắn với nội dung soạn sẵn (VD gửi mã nhận hàng cho người nhận) — không dùng dịch vụ SMS trả phí.
Future<void> openSms(String phone, String body) => launchUrl(Uri.parse('sms:$phone?body=${Uri.encodeComponent(body)}'));

/// Mở Zalo tới số điện thoại (Zalo không cho điền sẵn nội dung qua đường link).
Future<void> openZalo(String phone) => launchUrl(Uri.parse('https://zalo.me/$phone'), mode: LaunchMode.externalApplication);

