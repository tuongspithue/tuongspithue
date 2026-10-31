import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';
import 'labels.dart';
import 'theme.dart';

/// Nhãn trạng thái: biểu tượng + chữ + màu (không chỉ dựa vào màu — Phần 9.9).
class StateChip extends StatelessWidget {
  const StateChip(this.state, {super.key});
  final String state;

  @override
  Widget build(BuildContext context) {
    final c = stateColor(state);
    return Chip(
      avatar: Icon(stateIcon(state), color: c, size: 18),
      label: Text(stateLabel(state), style: TextStyle(color: c, fontWeight: FontWeight.w600)),
      side: BorderSide(color: c),
      backgroundColor: Colors.transparent,
    );
  }
}

/// Dòng thời gian "ai xác nhận, lúc nào, qua kênh nào" (Phần 2.1.6, 9.4).
class OrderTimeline extends StatelessWidget {
  const OrderTimeline(this.events, {super.key});
  final List<dynamic> events;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final e in events)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.check_circle, color: e['byRole'] == 'SYSTEM' ? Colors.grey : SqtColors.confirmed),
            title: Text(kEventLabels[e['event']] ?? e['event'] as String),
            subtitle: Text('${hhmm(e['at'] as String?)} · ${kRoleLabels[e['byRole']] ?? e['byRole']}${e['byName'] != null ? ' ${e['byName']}' : ''}'),
          ),
      ],
    );
  }
}

/// Món + ghi chú + dị ứng của một đơn. Dị ứng hiện đỏ ở đầu (Phần 2.1.4a).
class OrderItemsView extends StatelessWidget {
  const OrderItemsView(this.order, {super.key});
  final Map<String, dynamic> order;

  @override
  Widget build(BuildContext context) {
    final items = (order['items'] as List).cast<Map<String, dynamic>>();
    final allergens = {for (final i in items) ...(i['allergens'] as List).cast<String>()};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (allergens.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(color: SqtColors.danger.withValues(alpha: 0.12), border: Border.all(color: SqtColors.danger), borderRadius: BorderRadius.circular(12)),
            child: Text('⚠ Dị ứng: ${allergens.map((a) => kAllergenLabels[a] ?? a).join(', ')}',
                style: const TextStyle(color: SqtColors.danger, fontWeight: FontWeight.bold)),
          ),
        for (final i in items)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${i['quantity']} × ${i['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                if ((i['noteTags'] as List).isNotEmpty || i['note'] != null)
                  Text([...(i['noteTags'] as List), if (i['note'] != null) i['note']].join(' · '), style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        if (order['orderNote'] != null) Text('Ghi chú chung: ${order['orderNote']}'),
      ],
    );
  }
}

/// Khung chung cho các màn đăng nhập: tiêu đề, các ô nhập, lỗi, nút chính.
class _SignInFrame extends StatelessWidget {
  const _SignInFrame({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: ListView(
                padding: const EdgeInsets.all(24),
                shrinkWrap: true,
                children: [Text(title, style: Theme.of(context).textTheme.headlineSmall), const SizedBox(height: 24), ...children],
              ),
            ),
          ),
        ),
      );
}

String? _checkPhone(String phone) => RegExp(r'^0\d{9}$').hasMatch(phone) ? null : 'Số điện thoại gồm 10 số, bắt đầu bằng 0';

/// Khách: tên + số điện thoại, không cần mã xác minh (Phần 13.9).
class CustomerSignInScreen extends StatefulWidget {
  const CustomerSignInScreen({super.key, required this.api, required this.onSignedIn});
  final ApiClient api;
  final VoidCallback onSignedIn;

  @override
  State<CustomerSignInScreen> createState() => _CustomerSignInScreenState();
}

class _CustomerSignInScreenState extends State<CustomerSignInScreen> {
  final _phone = TextEditingController();
  final _name = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final phone = _phone.text.trim();
    final name = _name.text.trim();
    final invalid = name.isEmpty ? 'Vui lòng nhập tên để quán và shipper xưng hô' : _checkPhone(phone);
    if (invalid != null) return setState(() => _error = invalid);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.signInCustomer(phone, name);
      widget.onSignedIn();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _SignInFrame(title: 'Thông tin người đặt', children: [
        TextField(
          key: const Key('name'),
          controller: _name,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          decoration: const InputDecoration(labelText: 'Tên của bạn', hintText: 'Chị Hoa'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('phone'),
          controller: _phone,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: const InputDecoration(labelText: 'Số điện thoại', hintText: '0901234567'),
        ),
        const SizedBox(height: 8),
        const Text('📞 Quán hoặc shipper sẽ gọi số này để xác nhận đơn — hãy nhập đúng số bạn đang dùng.'),
        if (_error != null) Text(_error!, style: const TextStyle(color: SqtColors.danger)),
        const SizedBox(height: 16),
        FilledButton(key: const Key('sign-in'), onPressed: _busy ? null : _submit, child: const Text('Tiếp tục')),
      ]);
}

/// Quán/shipper: số điện thoại + mã kích hoạt Admin gửi qua Zalo/SMS sau khi xác minh (Phần 13.9).
class PartnerSignInScreen extends StatefulWidget {
  const PartnerSignInScreen({super.key, required this.api, required this.title, required this.onSignedIn, required this.onApply});
  final ApiClient api;
  final String title;
  final VoidCallback onSignedIn;

  /// Mở màn đăng ký đối tác (chưa có tài khoản).
  final VoidCallback onApply;

  @override
  State<PartnerSignInScreen> createState() => _PartnerSignInScreenState();
}

class _PartnerSignInScreenState extends State<PartnerSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final phone = _phone.text.trim();
    final code = _code.text.trim();
    final invalid = _checkPhone(phone) ?? (RegExp(r'^\d{8}$').hasMatch(code) ? null : 'Mã kích hoạt gồm 8 chữ số');
    if (invalid != null) return setState(() => _error = invalid);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.activate(phone, code);
      widget.onSignedIn();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _SignInFrame(title: widget.title, children: [
        TextField(
          key: const Key('phone'),
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Số điện thoại', hintText: '0901234567'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('code'),
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 8,
          decoration: const InputDecoration(labelText: 'Mã kích hoạt (8 số)', helperText: 'Admin gửi qua Zalo/SMS sau khi gọi xác minh'),
        ),
        if (_error != null) Text(_error!, style: const TextStyle(color: SqtColors.danger)),
        const SizedBox(height: 16),
        FilledButton(key: const Key('sign-in'), onPressed: _busy ? null : _submit, child: const Text('Đăng nhập')),
        const SizedBox(height: 24),
        OutlinedButton(key: const Key('apply'), onPressed: widget.onApply, child: const Text('Chưa có tài khoản? Đăng ký đối tác')),
        const SizedBox(height: 8),
        const Text('Đổi hoặc mất điện thoại: liên hệ Admin để nhận mã mới.', textAlign: TextAlign.center),
      ]);
}

/// Tải lại dữ liệu định kỳ (MVP chưa dùng WebSocket ở app — Phần 5.11: realtime lỗi thì hỏi định kỳ).
mixin Polling<T extends StatefulWidget> on State<T> {
  Timer? _timer;

  void startPolling(Future<void> Function() load, {Duration every = const Duration(seconds: 5)}) {
    load();
    _timer?.cancel();
    _timer = Timer.periodic(every, (_) => load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

void showError(BuildContext context, Object e) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Có lỗi xảy ra'), backgroundColor: SqtColors.danger));
}

void showDone(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}
