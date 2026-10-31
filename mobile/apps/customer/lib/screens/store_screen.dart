import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import '../cart.dart';
import '../main.dart';
import 'cart_screen.dart';

/// Trang quán + menu; chạm món để chọn số lượng và ghi chú (Phần 2.1.4, 2.1.4a).
class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key, required this.api, required this.cart, required this.storeId, required this.place});
  final ApiClient api;
  final Cart cart;
  final int storeId;
  final Place place;

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  Map<String, dynamic>? _store;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.api.get('/v1/stores/${widget.storeId}').then((s) => setState(() => _store = s as Map<String, dynamic>)).catchError((Object e) {
      setState(() => _error = e.toString());
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = _store;
    return Scaffold(
      appBar: AppBar(title: Text(s?['name'] as String? ?? '')),
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) => widget.cart.count == 0 || widget.cart.storeId != widget.storeId
            ? const SizedBox.shrink()
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton(
                    key: const Key('view-cart'),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(api: widget.api, cart: widget.cart, place: widget.place))),
                    child: Text('Xem giỏ · ${widget.cart.count} món · ${money(widget.cart.subtotal)}'),
                  ),
                ),
              ),
      ),
      body: _error != null
          ? Center(child: Text(_error!))
          : s == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Text(s['address'] as String),
                  if (!(s['isOpen'] as bool)) const Text('Quán đang đóng cửa — bạn vẫn có thể đặt hẹn giờ', style: TextStyle(color: SqtColors.waiting)),
                  const SizedBox(height: 8),
                  for (final item in (s['menu'] as List).cast<Map<String, dynamic>>())
                    ListTile(
                      key: Key('item-${item['id']}'),
                      enabled: item['isAvailable'] as bool,
                      title: Text(item['name'] as String),
                      subtitle: Text(item['isAvailable'] as bool ? money(item['price'] as num) : 'Hết hàng'),
                      trailing: const Icon(Icons.add_circle, color: SqtColors.primary),
                      onTap: () => _pick(item),
                    ),
                ]),
    );
  }

  Future<void> _pick(Map<String, dynamic> item) async {
    final line = await showModalBottomSheet<CartLine>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ItemSheet(item: item),
    );
    if (line != null) {
      widget.cart.add(widget.storeId, _store!['name'] as String, line);
      if (mounted) showDone(context, 'Đã thêm ${line.name}');
    }
  }
}

/// Chọn số lượng, chip ghi chú nhanh, ghi chú tự do và dị ứng cho một món (Phần 2.1.4a).
class ItemSheet extends StatefulWidget {
  const ItemSheet({super.key, required this.item});
  final Map<String, dynamic> item;

  @override
  State<ItemSheet> createState() => _ItemSheetState();
}

class _ItemSheetState extends State<ItemSheet> {
  int _qty = 1;
  final _tags = <String>{};
  final _allergens = <String>{};
  final _note = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final notesDisabled = item['notesDisabled'] as bool;
    final quick = (item['quickNotes'] as List).cast<String>();
    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(item['name'] as String, style: Theme.of(context).textTheme.titleLarge),
          Text(money(item['price'] as num)),
          const SizedBox(height: 12),
          Row(children: [
            IconButton(onPressed: _qty > 1 ? () => setState(() => _qty--) : null, icon: const Icon(Icons.remove_circle_outline), tooltip: 'Bớt'),
            Text('$_qty', style: Theme.of(context).textTheme.titleLarge),
            IconButton(onPressed: () => setState(() => _qty++), icon: const Icon(Icons.add_circle_outline), tooltip: 'Thêm'),
          ]),
          if (notesDisabled)
            const Text('Món này không nhận ghi chú (món đóng gói sẵn)')
          else ...[
            Text('Ghi chú cho món này', style: Theme.of(context).textTheme.titleSmall),
            Wrap(spacing: 8, children: [
              for (final q in quick)
                FilterChip(label: Text(q), selected: _tags.contains(q), onSelected: (v) => setState(() => v ? _tags.add(q) : _tags.remove(q))),
            ]),
            const SizedBox(height: 8),
            TextField(key: const Key('note'), controller: _note, maxLength: 150, decoration: const InputDecoration(hintText: 'VD: cho mình xin thêm ớt, để riêng')),
          ],
          Text('⚠ Dị ứng (quán phải xác nhận đã đọc)', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: SqtColors.danger)),
          Wrap(spacing: 8, children: [
            for (final a in kAllergenLabels.entries)
              FilterChip(
                label: Text(a.value),
                selected: _allergens.contains(a.key),
                selectedColor: SqtColors.danger.withValues(alpha: 0.2),
                onSelected: (v) => setState(() => v ? _allergens.add(a.key) : _allergens.remove(a.key)),
              ),
          ]),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('add-to-cart'),
              onPressed: () => Navigator.pop(
                context,
                CartLine(
                  itemId: item['id'] as int,
                  name: item['name'] as String,
                  price: item['price'] as int,
                  quantity: _qty,
                  noteTags: _tags.toList(),
                  note: _note.text.trim().isEmpty ? null : _note.text.trim(),
                  allergens: _allergens.toList(),
                ),
              ),
              child: Text('Thêm vào giỏ · ${money((item['price'] as int) * _qty)}'),
            ),
          ),
        ]),
      ),
    );
  }
}
