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

  @override
  Widget build(BuildContext context) {
    final cart = widget.cart;
    return Scaffold(
      appBar: AppBar(title: Text('Giỏ hàng · ${cart.storeName ?? ''}')),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) => ListView(key: const Key('cart-list'), padding: const EdgeInsets.all(16), children: [
          for (final l in cart.lines)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${l.name} · ${money(l.price * l.quantity)}'),
              subtitle: Text([
                ...l.noteTags,
                if (l.note != null) l.note!,
                if (l.allergens.isNotEmpty) '⚠ ${l.allergens.map((a) => kAllergenLabels[a]).join(', ')}',
              ].join(' · ')),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(onPressed: () => cart.changeQuantity(l, -1), icon: const Icon(Icons.remove), tooltip: 'Bớt'),
                Text('${l.quantity}'),
                IconButton(onPressed: () => cart.changeQuantity(l, 1), icon: const Icon(Icons.add), tooltip: 'Thêm'),
              ]),
            ),
          const Divider(),
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'PLATFORM', label: Text('🛵 Giao tận nơi')), ButtonSegment(value: 'SELF_PICKUP', label: Text('🏃 Tự đến lấy'))],
            selected: {_mode},
            onSelectionChanged: (v) => setState(() => _mode = v.first),
          ),
          if (_mode == 'PLATFORM') ...[
            ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.place), title: Text(widget.place.address)),
            TextField(controller: _dropNote, decoration: const InputDecoration(labelText: 'Ghi chú cho shipper', hintText: 'VD: hẻm 45, cổng xanh, gọi trước 5 phút')),
          ],
          const SizedBox(height: 8),
          TextField(controller: _orderNote, maxLength: 200, decoration: const InputDecoration(labelText: 'Ghi chú chung cho quán', hintText: 'VD: gói riêng từng phần')),
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
          const SizedBox(height: 8),
          Text('Thanh toán', style: Theme.of(context).textTheme.titleSmall),
          RadioGroup<String>(
            groupValue: _payment,
            onChanged: (v) => setState(() => _payment = v!),
            child: const Column(children: [
              RadioListTile(value: 'COD', title: Text('💵 Tiền mặt khi nhận')),
              RadioListTile(value: 'VIETQR', title: Text('🏦 Chuyển khoản VietQR')),
              RadioListTile(value: 'MOMO', title: Text('📱 Ví MoMo')),
            ]),
          ),
          const SizedBox(height: 8),
          Text('Tạm tính ${money(cart.subtotal)} · phí ship & phí dịch vụ hiện ở bước tiếp theo', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('place-order'),
            onPressed: _busy || cart.lines.isEmpty || (_scheduled && _slot == null) ? null : _place,
            child: Text(_scheduled ? 'Đặt hẹn giờ' : 'Đặt hàng'),
          ),
        ]),
      ),
    );
  }
}
