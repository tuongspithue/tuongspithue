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

/// Màn đăng nhập bằng số điện thoại + OTP, dùng chung cho ba app.
class OtpLoginScreen extends StatefulWidget {
  const OtpLoginScreen({super.key, required this.api, required this.title, required this.onSignedIn});
  final ApiClient api;
  final String title;
  final VoidCallback onSignedIn;

  @override
  State<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

class _OtpLoginScreenState extends State<OtpLoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _hint;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!_codeSent) {
        final dev = await widget.api.requestOtp(_phone.text.trim());
        setState(() {
          _codeSent = true;
          _hint = dev != null ? 'Mã thử nghiệm: $dev' : 'Đã gửi mã tới số của bạn';
        });
      } else {
        await widget.api.verifyOtp(_phone.text.trim(), _code.text.trim());
        widget.onSignedIn();
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.all(24),
              shrinkWrap: true,
              children: [
                Text(widget.title, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 24),
                TextField(
                  key: const Key('phone'),
                  controller: _phone,
                  enabled: !_codeSent,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: const InputDecoration(labelText: 'Số điện thoại', hintText: '0901234567'),
                ),
                if (_codeSent) ...[
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('otp'),
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 6,
                    decoration: const InputDecoration(labelText: 'Mã OTP'),
                  ),
                ],
                if (_hint != null) Text(_hint!),
                if (_error != null) Text(_error!, style: const TextStyle(color: SqtColors.danger)),
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _submit, child: Text(_codeSent ? 'Đăng nhập' : 'Gửi mã')),
              ],
            ),
          ),
        ),
      ),
    );
  }
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
