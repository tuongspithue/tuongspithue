import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:sqt_core/sqt_core.dart';

import '../main.dart';
import '../ui.dart';
import 'map_picker.dart';
import 'order_screen.dart';

const kParcelTypes = {'DOCUMENT': '📄 Giấy tờ', 'FOOD': '🍱 Đồ ăn', 'CLOTHES': '👕 Quần áo', 'ELECTRONICS': '📱 Điện tử', 'OTHER': '📦 Khác'};
const kParcelSizes = {'SMALL': ('Nhỏ', 'dưới 5 kg'), 'MEDIUM': ('Vừa', 'dưới 15 kg · +5.000đ'), 'LARGE': ('Lớn', 'dưới 30 kg · +15.000đ')};

/// Gửi hàng (Phần 2.1.9): đặt shipper lấy hàng ở A giao tới B. Shipper bấm nhận chuyến là người thật xác nhận đơn.
class ParcelScreen extends StatefulWidget {
  const ParcelScreen({super.key, required this.api, required this.place});
  final ApiClient api;
  final Place place;

  @override
  State<ParcelScreen> createState() => _ParcelScreenState();
}

class _ParcelScreenState extends State<ParcelScreen> {
  late LatLng? _pickupAt = LatLng(widget.place.lat, widget.place.lng);
  LatLng? _dropoffAt;
  late final _pickupAddress = TextEditingController(text: widget.place.address == 'Vị trí hiện tại của bạn' ? '' : widget.place.address);
  final _pickupNote = TextEditingController();
  final _dropoffAddress = TextEditingController();
  final _dropoffNote = TextEditingController();
  final _senderName = TextEditingController();
  final _senderPhone = TextEditingController();
  final _receiverName = TextEditingController();
  final _receiverPhone = TextEditingController();
  final _note = TextEditingController();
  String _type = 'DOCUMENT';
  String _size = 'SMALL';
  String _payer = 'SENDER';
  Map<String, dynamic>? _quote;
  String? _quoteError;
  bool _busy = false;
  // Một khoá cho mỗi lần mở màn: bấm "Đặt shipper" hai lần không tạo hai đơn.
  final String _idemKey = newIdempotencyKey();

  Future<void> _pick(bool pickup) async {
    final start = (pickup ? _pickupAt : _dropoffAt) ?? _pickupAt ?? LatLng(widget.place.lat, widget.place.lng);
    final p = await Navigator.push<LatLng>(context, MaterialPageRoute(builder: (_) => MapPickerScreen(initial: start, title: pickup ? 'Điểm lấy hàng' : 'Điểm giao hàng')));
    if (p == null) return;
    setState(() => pickup ? _pickupAt = p : _dropoffAt = p);
    _requote();
  }

  Map<String, dynamic> _point(LatLng at, TextEditingController address, TextEditingController note) => {
        'lat': at.latitude,
        'lng': at.longitude,
        'address': address.text.trim().isEmpty ? 'Điểm đã ghim trên bản đồ' : address.text.trim(),
        if (note.text.trim().isNotEmpty) 'note': note.text.trim(),
      };

  Future<void> _requote() async {
    final a = _pickupAt, b = _dropoffAt;
    if (a == null || b == null) return;
    try {
      final q = await widget.api.post('/v1/parcels/quote', {'pickup': _point(a, _pickupAddress, _pickupNote), 'dropoff': _point(b, _dropoffAddress, _dropoffNote), 'size': _size});
      if (mounted) {
        setState(() {
          _quote = q as Map<String, dynamic>;
          _quoteError = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _quote = null;
          _quoteError = e.message;
        });
      }
    }
  }

  String? _invalid() {
    final phone = RegExp(r'^0\d{9}$');
    if (_pickupAt == null) return 'Chọn điểm lấy hàng trên bản đồ';
    if (_dropoffAt == null) return 'Chọn điểm giao hàng trên bản đồ';
    if (_pickupAddress.text.trim().length < 3) return 'Nhập địa chỉ lấy hàng';
    if (_dropoffAddress.text.trim().length < 3) return 'Nhập địa chỉ giao hàng';
    if (_senderName.text.trim().isEmpty || !phone.hasMatch(_senderPhone.text.trim())) return 'Nhập tên và số điện thoại người gửi';
    if (_receiverName.text.trim().isEmpty || !phone.hasMatch(_receiverPhone.text.trim())) return 'Nhập tên và số điện thoại người nhận';
    if (_quote == null) return _quoteError ?? 'Đang tính phí, đợi chút nhé';
    return null;
  }

  Future<void> _submit() async {
    final invalid = _invalid();
    if (invalid != null) return showDone(context, invalid);
    if (!await ensureSignedIn(context, widget.api)) return;
    setState(() => _busy = true);
    try {
      final order = await widget.api.post(
        '/v1/parcels',
        {
          'pickup': _point(_pickupAt!, _pickupAddress, _pickupNote),
          'dropoff': _point(_dropoffAt!, _dropoffAddress, _dropoffNote),
          'size': _size,
          'parcelType': _type,
          'feePayer': _payer,
          'sender': {'name': _senderName.text.trim(), 'phone': _senderPhone.text.trim()},
          'receiver': {'name': _receiverName.text.trim(), 'phone': _receiverPhone.text.trim()},
          if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        },
        {'Idempotency-Key': _idemKey},
      );
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderScreen(api: widget.api, orderId: order['id'] as int)));
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _block(String title, IconData icon, Color color, List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
            ]),
            const SizedBox(height: 10),
            ...children,
          ]),
        ),
      );

  Widget _pointPicker(bool pickup) {
    final at = pickup ? _pickupAt : _dropoffAt;
    return OutlinedButton.icon(
      key: Key(pickup ? 'pick-pickup' : 'pick-dropoff'),
      onPressed: () => _pick(pickup),
      icon: Icon(at == null ? Icons.add_location_alt_outlined : Icons.check_circle, color: at == null ? null : SqtColors.confirmed),
      label: Text(at == null ? 'Chọn trên bản đồ' : 'Đã ghim vị trí · đổi'),
    );
  }

  Widget _field(TextEditingController c, String label, {String? hint, IconData? icon, TextInputType? type, Key? key, bool requote = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          key: key,
          controller: c,
          keyboardType: type,
          onChanged: requote ? (_) => setState(() {}) : null,
          decoration: InputDecoration(labelText: label, hintText: hint, prefixIcon: icon == null ? null : Icon(icon), isDense: true),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final q = _quote;
    return Scaffold(
      appBar: AppBar(title: const Text('📦 Gửi hàng')),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (q != null)
            Row(children: [
              Expanded(child: Text('${distanceText(q['distanceM'] as int)} · ~${q['etaMinutes']} phút', style: Theme.of(context).textTheme.bodySmall)),
              Text(money(q['total'] as num), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            ])
          else
            Align(alignment: Alignment.centerLeft, child: Text(_quoteError ?? 'Chọn điểm lấy và điểm giao để xem phí', style: TextStyle(color: _quoteError == null ? null : SqtColors.danger))),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('book-parcel'),
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                  : const Text('🛵 Đặt shipper', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: SqtColors.scheduled.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(18)),
          child: const Text('Shipper gần điểm lấy hàng sẽ nhận chuyến, tới lấy và giao tận tay người nhận. Người nhận đọc mã 4 số cho shipper khi nhận hàng.'),
        ),
        _block('Lấy hàng ở đâu', Icons.trip_origin, SqtColors.confirmed, [
          _field(_pickupAddress, 'Địa chỉ lấy hàng', hint: 'VD: 12 Lê Lợi, phường…', icon: Icons.home_outlined, key: const Key('pickup-address')),
          _pointPicker(true),
          const SizedBox(height: 10),
          _field(_pickupNote, 'Ghi chú cho shipper', hint: 'VD: gọi khi tới cổng'),
          Row(children: [
            Expanded(child: _field(_senderName, 'Người gửi', icon: Icons.person_outline, key: const Key('sender-name'))),
            const SizedBox(width: 8),
            Expanded(child: _field(_senderPhone, 'SĐT người gửi', type: TextInputType.phone, key: const Key('sender-phone'))),
          ]),
        ]),
        _block('Giao tới đâu', Icons.place, SqtColors.danger, [
          _field(_dropoffAddress, 'Địa chỉ giao hàng', hint: 'VD: 45 Quang Trung, phường…', icon: Icons.home_outlined, key: const Key('dropoff-address')),
          _pointPicker(false),
          const SizedBox(height: 10),
          _field(_dropoffNote, 'Ghi chú khi giao', hint: 'VD: để ở bảo vệ'),
          Row(children: [
            Expanded(child: _field(_receiverName, 'Người nhận', icon: Icons.person_outline, key: const Key('receiver-name'))),
            const SizedBox(width: 8),
            Expanded(child: _field(_receiverPhone, 'SĐT người nhận', type: TextInputType.phone, key: const Key('receiver-phone'))),
          ]),
        ]),
        _block('Món hàng', Icons.inventory_2_outlined, SqtColors.primary, [
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in kParcelTypes.entries) ChoiceChip(label: Text(e.value), selected: _type == e.key, onSelected: (_) => setState(() => _type = e.key)),
          ]),
          const SizedBox(height: 12),
          RadioGroup<String>(
            groupValue: _size,
            onChanged: (v) {
              setState(() => _size = v!);
              _requote();
            },
            child: Column(children: [
              for (final e in kParcelSizes.entries)
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  value: e.key,
                  title: Text(e.value.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(e.value.$2),
                ),
            ]),
          ),
          _field(_note, 'Mô tả thêm (không bắt buộc)', hint: 'VD: hồ sơ giấy, tránh ướt'),
        ]),
        _block('Ai trả phí ship (tiền mặt)', Icons.payments_outlined, SqtColors.waiting, [
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'SENDER', label: Text('Người gửi')), ButtonSegment(value: 'RECEIVER', label: Text('Người nhận'))],
              selected: {_payer},
              onSelectionChanged: (v) => setState(() => _payer = v.first),
            ),
          ),
          const SizedBox(height: 6),
          Text(_payer == 'SENDER' ? 'Trả cho shipper khi shipper tới lấy hàng.' : 'Người nhận trả cho shipper khi nhận hàng.', style: Theme.of(context).textTheme.bodySmall),
          if (q != null) ...[
            const Divider(height: 20),
            _row('Phí ship (${distanceText(q['distanceM'] as int)})', money(q['deliveryFee'] as num)),
            _row('Phí dịch vụ', money(q['serviceFee'] as num)),
            _row('Tổng', money(q['total'] as num), bold: true),
          ],
        ]),
      ]),
    );
  }

  Widget _row(String a, String b, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Text(a, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null)),
          const Spacer(),
          Text(b, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null, color: bold ? SqtColors.primary : null)),
        ]),
      );
}
