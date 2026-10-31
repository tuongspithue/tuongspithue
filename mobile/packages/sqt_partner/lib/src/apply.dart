import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

enum PartnerKind { merchant, rider }

const _vehicles = {'MOTORBIKE': 'Xe máy', 'EMOTORBIKE': 'Xe điện', 'CARGO': 'Ba gác'};
const _categories = {'FOOD': 'Đồ ăn', 'DRINK': 'Đồ uống', 'GROCERY': 'Tạp hoá', 'WATER_ICE': 'Nước, đá', 'MOM_BABY': 'Mẹ & bé'};

/// Đăng ký làm đối tác ngay trong app, chưa cần đăng nhập. Admin sẽ gọi xác minh, duyệt,
/// rồi gửi mã kích hoạt qua Zalo/SMS (Phần 13.9) — không cần dịch vụ gửi tin.
class PartnerApplyScreen extends StatefulWidget {
  const PartnerApplyScreen({super.key, required this.api, required this.kind});
  final ApiClient api;
  final PartnerKind kind;

  @override
  State<PartnerApplyScreen> createState() => _PartnerApplyScreenState();
}

class _PartnerApplyScreenState extends State<PartnerApplyScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _plate = TextEditingController();
  final _storeName = TextEditingController();
  final _address = TextEditingController();
  final _storePhone = TextEditingController();
  String _vehicle = 'MOTORBIKE';
  String _category = 'FOOD';
  ({double lat, double lng})? _at;
  bool _busy = false;
  String? _sent;

  bool get _merchant => widget.kind == PartnerKind.merchant;

  Future<void> _locate() async {
    final p = await currentPosition(onError: (r) => showDone(context, r));
    if (p != null) setState(() => _at = p);
  }

  String? _invalid() {
    final phone = RegExp(r'^0\d{9}$');
    if (_name.text.trim().length < 2) return 'Vui lòng nhập họ tên';
    if (!phone.hasMatch(_phone.text.trim())) return 'Số điện thoại gồm 10 số, bắt đầu bằng 0';
    if (_merchant) {
      if (_storeName.text.trim().length < 2) return 'Vui lòng nhập tên quán';
      if (_address.text.trim().length < 5) return 'Vui lòng nhập địa chỉ quán';
      if (_storePhone.text.trim().isNotEmpty && !phone.hasMatch(_storePhone.text.trim())) return 'Số điện thoại quán không hợp lệ';
      if (_at == null) return 'Hãy đứng tại quán và bấm "Lấy vị trí quán"';
    }
    return null;
  }

  Future<void> _submit() async {
    final invalid = _invalid();
    if (invalid != null) return showDone(context, invalid);
    setState(() => _busy = true);
    final phone = _phone.text.trim();
    try {
      final res = await widget.api.post('/v1/auth/partner-apply', {
        'phone': phone,
        'fullName': _name.text.trim(),
        if (_merchant) ...{
          'kind': 'MERCHANT',
          'store': {
            'name': _storeName.text.trim(),
            'category': _category,
            'address': _address.text.trim(),
            'phone': _storePhone.text.trim().isEmpty ? phone : _storePhone.text.trim(),
            'lat': _at!.lat,
            'lng': _at!.lng,
          },
        } else ...{
          'kind': 'RIDER',
          'vehicleType': _vehicle,
          if (_plate.text.trim().isNotEmpty) 'plateNumber': _plate.text.trim(),
        },
      });
      setState(() => _sent = res['message'] as String);
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sent = _sent;
    return Scaffold(
      appBar: AppBar(title: Text(_merchant ? 'Đăng ký mở quán' : 'Đăng ký làm shipper')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (sent != null) ...[
          const Icon(Icons.check_circle, color: SqtColors.confirmed, size: 64),
          const SizedBox(height: 12),
          Text(sent, key: const Key('apply-sent'), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Về màn đăng nhập')),
        ] else ...[
          TextField(key: const Key('apply-name'), controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Họ tên')),
          TextField(key: const Key('apply-phone'), controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Số điện thoại (Admin sẽ gọi số này)')),
          const SizedBox(height: 16),
          if (_merchant) ...[
            TextField(key: const Key('apply-store'), controller: _storeName, decoration: const InputDecoration(labelText: 'Tên quán')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(labelText: 'Ngành hàng'),
              items: [for (final e in _categories.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
              onChanged: (v) => setState(() => _category = v ?? 'FOOD'),
            ),
            TextField(key: const Key('apply-address'), controller: _address, decoration: const InputDecoration(labelText: 'Địa chỉ quán')),
            TextField(controller: _storePhone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'SĐT của quán (bỏ trống nếu trùng số trên)')),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const Key('apply-locate'),
              icon: Icon(_at == null ? Icons.my_location : Icons.check_circle),
              label: Text(_at == null ? 'Lấy vị trí quán (đứng tại quán)' : 'Đã lấy vị trí quán'),
              onPressed: _locate,
            ),
          ] else ...[
            SegmentedButton<String>(
              segments: [for (final e in _vehicles.entries) ButtonSegment(value: e.key, label: Text(e.value))],
              selected: {_vehicle},
              onSelectionChanged: (v) => setState(() => _vehicle = v.first),
            ),
            TextField(controller: _plate, decoration: const InputDecoration(labelText: 'Biển số xe')),
          ],
          const SizedBox(height: 16),
          const Text('Sau khi gửi, Admin sẽ gọi cho bạn để xác minh rồi gửi mã kích hoạt qua Zalo/SMS. Dùng mã đó để đăng nhập.'),
          const SizedBox(height: 12),
          FilledButton(key: const Key('apply-submit'), onPressed: _busy ? null : _submit, child: const Text('Gửi hồ sơ')),
        ],
      ]),
    );
  }
}
