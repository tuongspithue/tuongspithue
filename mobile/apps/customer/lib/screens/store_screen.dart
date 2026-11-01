import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import '../cart.dart';
import '../main.dart';
import '../ui.dart';
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

  /// Số lượng món đang có trong giỏ (của quán này) để hiện cạnh món.
  int _inCart(int itemId) => widget.cart.storeId != widget.storeId ? 0 : widget.cart.lines.where((l) => l.itemId == itemId).fold(0, (n, l) => n + l.quantity);

  @override
  Widget build(BuildContext context) {
    final s = _store;
    final c = categoryOf(s?['category'] as String?);
    return Scaffold(
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) => widget.cart.count == 0 || widget.cart.storeId != widget.storeId
            ? const SizedBox.shrink()
            : CartBar(
                buttonKey: const Key('view-cart'),
                count: widget.cart.count,
                total: widget.cart.subtotal,
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(api: widget.api, cart: widget.cart, place: widget.place))),
              ),
      ),
      body: _error != null
          ? Center(child: Text(_error!))
          : s == null
              ? const Center(child: CircularProgressIndicator())
              : ListenableBuilder(
                  listenable: widget.cart,
                  builder: (context, _) => CustomScrollView(slivers: [
                    SliverAppBar(
                      pinned: true,
                      expandedHeight: 170,
                      foregroundColor: Colors.white,
                      backgroundColor: c.color,
                      title: Text(s['name'] as String, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      flexibleSpace: FlexibleSpaceBar(
                        collapseMode: CollapseMode.parallax,
                        background: Container(
                          decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c.color, Color.lerp(c.color, Colors.black, 0.25)!])),
                          alignment: const Alignment(0.75, 0.2),
                          child: Text(c.emoji, style: const TextStyle(fontSize: 92)),
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(child: _StoreInfo(store: s, place: widget.place)),
                    for (final section in _sections(s))
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        sliver: SliverList.list(children: [
                          SectionTitle(section.key),
                          for (final item in section.value) _ItemCard(item: item, inCart: _inCart(item['id'] as int), onTap: () => _pick(item)),
                        ]),
                      ),
                    const SliverToBoxAdapter(child: SizedBox(height: 24)),
                  ]),
                ),
    );
  }

  /// Gom món theo nhóm của quán (Món chính, Đồ uống…), giữ thứ tự quán sắp.
  List<MapEntry<String, List<Map<String, dynamic>>>> _sections(Map<String, dynamic> s) {
    final out = <String, List<Map<String, dynamic>>>{};
    for (final item in (s['menu'] as List).cast<Map<String, dynamic>>()) {
      out.putIfAbsent(item['section'] as String? ?? 'Thực đơn', () => []).add(item);
    }
    return out.entries.toList();
  }

  Future<void> _pick(Map<String, dynamic> item) async {
    final line = await showModalBottomSheet<CartLine>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
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
      padding: EdgeInsets.only(left: 20, right: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['name'] as String, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                Text(money(item['price'] as num), style: const TextStyle(color: SqtColors.primary, fontWeight: FontWeight.w800, fontSize: 16)),
              ]),
            ),
            // Bộ chọn số lượng
            Container(
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(999)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(onPressed: _qty > 1 ? () => setState(() => _qty--) : null, icon: const Icon(Icons.remove_circle_outline), tooltip: 'Bớt'),
                Text('$_qty', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                IconButton(onPressed: () => setState(() => _qty++), icon: const Icon(Icons.add_circle_outline, color: SqtColors.primary), tooltip: 'Thêm'),
              ]),
            ),
          ]),
          if ((item['description'] as String?)?.isNotEmpty ?? false) Padding(padding: const EdgeInsets.only(top: 6), child: Text(item['description'] as String)),
          const SizedBox(height: 16),
          if (notesDisabled)
            const Text('Món này không nhận ghi chú (món đóng gói sẵn)')
          else ...[
            Text('📝 Ghi chú theo ý bạn', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            Wrap(spacing: 8, children: [
              for (final q in quick)
                FilterChip(label: Text(q), selected: _tags.contains(q), onSelected: (v) => setState(() => v ? _tags.add(q) : _tags.remove(q))),
            ]),
            const SizedBox(height: 8),
            TextField(key: const Key('note'), controller: _note, maxLength: 150, decoration: const InputDecoration(hintText: 'VD: cho mình xin thêm ớt, để riêng')),
          ],
          Text('⚠ Dị ứng (quán phải xác nhận đã đọc)', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: SqtColors.danger, fontWeight: FontWeight.w700)),
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

/// Thông tin quán dưới ảnh bìa: uy tín, thời gian đến tay, khoảng cách, địa chỉ.
class _StoreInfo extends StatelessWidget {
  const _StoreInfo({required this.store, required this.place});
  final Map<String, dynamic> store;
  final Place place;

  @override
  Widget build(BuildContext context) {
    final trust = store['trust'] as Map<String, dynamic>;
    final lat = store['lat'] as num?;
    final lng = store['lng'] as num?;
    final dist = lat == null || lng == null ? 0 : distanceM(place.lat, place.lng, lat.toDouble(), lng.toDouble());
    final open = store['isOpen'] as bool;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(store['name'] as String, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          InfoPill(text: kTierLabels[trust['tier']] ?? 'Tân binh', color: SqtColors.scheduled),
          if (trust['stars'] != null) InfoPill(icon: Icons.star, text: '${trust['stars']} (${trust['reviewCount']})', color: SqtColors.waiting),
          InfoPill(icon: Icons.schedule, text: '~${etaMinutes(store['prepTimeDefaultMin'] as int? ?? 15, dist)} phút', color: SqtColors.confirmed),
          if (dist > 0) InfoPill(icon: Icons.near_me, text: distanceText(dist)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Icon(Icons.place_outlined, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 4),
          Expanded(child: Text(store['address'] as String, style: Theme.of(context).textTheme.bodySmall)),
        ]),
        if (store['orderMode'] == 'PROXY' || store['orderMode'] == 'HYBRID')
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: SqtColors.scheduled.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Text(store['orderMode'] == 'PROXY'
                ? '🛒 Quán chưa dùng app — shipper sẽ tới quán đặt món và mua giúp bạn.'
                : '🛒 Nếu quán chưa kịp nhận đơn, shipper sẽ tới quán mua giúp bạn.'),
          ),
        if (!open)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: SqtColors.waiting.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
            child: const Text('🌙 Quán đang đóng cửa — bạn vẫn có thể đặt hẹn giờ'),
          ),
      ]),
    );
  }
}

/// Một món: tên, giá, gợi ý ghi chú; nút + hoặc số lượng đã chọn.
class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.inCart, required this.onTap});
  final Map<String, dynamic> item;
  final int inCart;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final available = item['isAvailable'] as bool;
    final quick = (item['quickNotes'] as List).cast<String>();
    return Opacity(
      opacity: available ? 1 : 0.5,
      child: Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: InkWell(
          key: Key('item-${item['id']}'),
          onTap: available ? onTap : null,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                  if (quick.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text('Có thể ghi chú: ${quick.take(3).join(' · ')}', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
                    ),
                  const SizedBox(height: 6),
                  Text(available ? money(item['price'] as num) : 'Hết hàng', style: TextStyle(fontWeight: FontWeight.w800, color: available ? SqtColors.primary : SqtColors.danger)),
                ]),
              ),
              const SizedBox(width: 8),
              inCart > 0
                  ? Container(
                      width: 36,
                      height: 36,
                      decoration: const BoxDecoration(color: SqtColors.primary, shape: BoxShape.circle),
                      alignment: Alignment.center,
                      child: Text('$inCart', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    )
                  : Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(color: SqtColors.primary.withValues(alpha: available ? 1 : 0.3), shape: BoxShape.circle),
                      child: const Icon(Icons.add, color: Colors.white),
                    ),
            ]),
          ),
        ),
      ),
    );
  }
}
