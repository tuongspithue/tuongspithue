import 'dart:async';

import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import '../cart.dart';
import '../main.dart';
import 'order_screen.dart';

/// Giỏ hàng & đặt hàng: giao ngay hoặc hẹn giờ, giao tận nơi hoặc tự đến lấy (Phần 2.1.5, 10.2).
class CartScreen extends StatefulWidget {
  const CartScreen({super.key, required this.api, required this.cart, required this.place});
  final ApiClient api;
  final Cart cart;
  final Place place;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  String _mode = 'PLATFORM';
  String _payment = 'COD';
  bool _scheduled = false;
  List<dynamic>? _slots;
  String? _slot;
  final _orderNote = TextEditingController();
  final _dropNote = TextEditingController();
  bool _busy = false;
  // Một khoá cho mỗi lần mở giỏ: bấm "Đặt hàng" hai lần không tạo hai đơn.
  final String _idemKey = newIdempotencyKey();
  Map<String, dynamic>? _quote;
  Timer? _quoteTimer;

  @override
  void initState() {
    super.initState();
    widget.cart.addListener(_requote);
    _requote();
  }

  @override
  void dispose() {
    widget.cart.removeListener(_requote);
    _quoteTimer?.cancel();
    super.dispose();
  }

  /// Báo giá đủ tiền món + phí ship + phí dịch vụ mỗi khi giỏ hoặc cách nhận hàng thay đổi (chờ 300 ms cho đỡ gọi dồn).
  void _requote() {
    _quoteTimer?.cancel();
    _quoteTimer = Timer(const Duration(milliseconds: 300), () async {
      final cart = widget.cart;
      if (cart.lines.isEmpty || cart.storeId == null) return;
      try {
        final q = await widget.api.post('/v1/orders/quote', {
          'storeId': cart.storeId,
          'deliveryMode': _mode,
          'items': cart.lines.map((l) => {'itemId': l.itemId, 'quantity': l.quantity}).toList(),
          if (_mode == 'PLATFORM') 'dropoff': {'lat': widget.place.lat, 'lng': widget.place.lng, 'address': widget.place.address.length >= 5 ? widget.place.address : 'Vị trí đã chọn'},
        });
        if (mounted) setState(() => _quote = q as Map<String, dynamic>);
      } on ApiException {
        if (mounted) setState(() => _quote = null);
      }
    });
  }

  Future<void> _loadSlots() async {
    final now = DateTime.now();
    final date = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    try {
      final res = await widget.api.get('/v1/stores/${widget.cart.storeId}/slots', {'date': date});
      setState(() => _slots = (res['slots'] as List).where((s) => s['status'] != 'FULL').toList());
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _place() async {
    if (!await ensureSignedIn(context, widget.api)) return;
    setState(() => _busy = true);
    try {
      final order = await widget.api.post(
        '/v1/orders',
        {
          'storeId': widget.cart.storeId,
          'deliveryMode': _mode,
          'paymentMethod': _payment,
          'items': widget.cart.lines.map((l) => l.toJson()).toList(),
          if (_mode == 'PLATFORM')
            'dropoff': {
              'lat': widget.place.lat,
              'lng': widget.place.lng,
              'address': widget.place.address,
              if (_dropNote.text.trim().isNotEmpty) 'note': _dropNote.text.trim(),
            },
          if (_orderNote.text.trim().isNotEmpty) 'orderNote': _orderNote.text.trim(),
          if (_scheduled && _slot != null) 'schedule': {'type': 'PICKUP', 'at': _slot},
        },
        {'Idempotency-Key': _idemKey},
      );
      widget.cart.clear();
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderScreen(api: widget.api, orderId: order['id'] as int)));
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _block(String title, List<Widget> children, {IconData? icon}) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              if (icon != null) ...[Icon(icon, size: 20, color: SqtColors.primary), const SizedBox(width: 8)],
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
            ]),
            const SizedBox(height: 8),
            ...children,
          ]),
        ),
      );

  /// Bảng tiền: tiền món, phí ship (theo quãng đường), phí dịch vụ, tổng cộng — khách thấy đủ trước khi đặt.
  List<Widget> _summary(int subtotal) {
    final q = _quote;
    Widget line(String a, String b, {bool bold = false, Key? key}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 1),
          child: Row(children: [
            Expanded(child: Text(a, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null, fontSize: bold ? 16 : 13.5))),
            Text(b, key: key, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 18 : 13.5, color: bold ? SqtColors.primary : null)),
          ]),
        );
    final km = q == null ? '' : ' (${((q['distanceM'] as num) / 1000).toStringAsFixed(1).replaceAll('.', ',')} km)';
    return [
      line('Tiền món', money(q?['subtotal'] as num? ?? subtotal)),
      if (_mode == 'PLATFORM') line('Phí ship$km', q == null ? '…' : money(q['deliveryFee'] as num)),
      line('Phí dịch vụ', q == null ? '…' : money(q['serviceFee'] as num)),
      line('Tổng cộng', q == null ? '…' : money(q['total'] as num), bold: true, key: const Key('cart-total')),
      if (q?['outOfArea'] == true)
        const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text('⚠ Địa chỉ nằm ngoài vùng giao của quán — hãy đổi địa chỉ hoặc chọn "Tự đến lấy"', style: TextStyle(color: SqtColors.danger, fontSize: 12.5)),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final cart = widget.cart;
    final canPlace = !_busy && cart.lines.isNotEmpty && !(_scheduled && _slot == null) && _quote?['outOfArea'] != true;
    return Scaffold(
      appBar: AppBar(title: Text('Giỏ hàng · ${cart.storeName ?? ''}')),
      bottomNavigationBar: ListenableBuilder(
        listenable: cart,
        builder: (context, _) => SafeArea(
          minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ..._summary(cart.subtotal),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('place-order'),
                onPressed: canPlace ? _place : null,
                child: _busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Text(_scheduled ? '🟣 Đặt hẹn giờ' : 'Đặt hàng', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              ),
            ),
          ]),
        ),
      ),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) => ListView(key: const Key('cart-list'), padding: const EdgeInsets.all(16), children: [
          _block('Món đã chọn', icon: Icons.restaurant_menu, [
            if (cart.lines.isEmpty) const Text('Giỏ hàng trống'),
            for (final l in cart.lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      if (l.noteTags.isNotEmpty || l.note != null || l.allergens.isNotEmpty)
                        Text(
                          [
                            ...l.noteTags,
                            if (l.note != null) l.note!,
                            if (l.allergens.isNotEmpty) '⚠ ${l.allergens.map((a) => kAllergenLabels[a]).join(', ')}',
                          ].join(' · '),
                          style: TextStyle(fontSize: 12.5, color: l.allergens.isNotEmpty ? SqtColors.danger : null),
                        ),
                      Text(money(l.price * l.quantity), style: const TextStyle(color: SqtColors.primary, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  Container(
                    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(visualDensity: VisualDensity.compact, onPressed: () => cart.changeQuantity(l, -1), icon: Icon(l.quantity == 1 ? Icons.delete_outline : Icons.remove), tooltip: 'Bớt'),
                      Text('${l.quantity}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      IconButton(visualDensity: VisualDensity.compact, onPressed: () => cart.changeQuantity(l, 1), icon: const Icon(Icons.add), tooltip: 'Thêm'),
                    ]),
                  ),
                ]),
              ),
          ]),
          _block('Nhận hàng', icon: Icons.delivery_dining, [
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'PLATFORM', label: Text('🛵 Giao tận nơi')), ButtonSegment(value: 'SELF_PICKUP', label: Text('🏃 Tự đến lấy'))],
                selected: {_mode},
                onSelectionChanged: (v) {
                  setState(() => _mode = v.first);
                  _requote();
                },
              ),
            ),
            if (_mode == 'PLATFORM') ...[
              ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.place, color: SqtColors.primary), title: Text(widget.place.address)),
              TextField(controller: _dropNote, decoration: const InputDecoration(labelText: 'Ghi chú cho shipper', hintText: 'VD: hẻm 45, cổng xanh, gọi trước 5 phút')),
            ],
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('🟣 Hẹn giờ lấy hàng'),
              subtitle: const Text('Sớm nhất sau 45 phút'),
              value: _scheduled,
              onChanged: (v) {
                setState(() => _scheduled = v);
                if (v && _slots == null) _loadSlots();
              },
            ),
            if (_scheduled)
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final s in _slots ?? [])
                  ChoiceChip(
                    label: Text('${hhmm(s['start'] as String).split(' ').first}${s['status'] == 'BUSY' ? ' 🔥' : ''}'),
                    selected: _slot == s['start'],
                    selectedColor: SqtColors.scheduled.withValues(alpha: 0.25),
                    onSelected: (_) => setState(() => _slot = s['start'] as String),
                  ),
                if (_slots != null && _slots!.isEmpty) const Text('Hôm nay quán đã kín lịch hẹn'),
              ]),
          ]),
          _block('Ghi chú cho quán', icon: Icons.sticky_note_2_outlined, [
            TextField(controller: _orderNote, maxLength: 200, decoration: const InputDecoration(hintText: 'VD: gói riêng từng phần')),
          ]),
          _block('Thanh toán', icon: Icons.payments_outlined, [
            RadioGroup<String>(
              groupValue: _payment,
              onChanged: (v) => setState(() => _payment = v!),
              child: const Column(children: [
                RadioListTile(contentPadding: EdgeInsets.zero, value: 'COD', title: Text('💵 Tiền mặt khi nhận')),
                RadioListTile(contentPadding: EdgeInsets.zero, value: 'VIETQR', title: Text('🏦 Chuyển khoản VietQR')),
                RadioListTile(contentPadding: EdgeInsets.zero, value: 'MOMO', title: Text('📱 Ví MoMo')),
              ]),
            ),
          ]),
        ]),
      ),
    );
  }
}
