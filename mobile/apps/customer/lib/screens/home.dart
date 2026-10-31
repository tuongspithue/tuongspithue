import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import '../cart.dart';
import '../main.dart';
import 'cart_screen.dart';
import 'order_screen.dart';
import 'store_screen.dart';

/// "Quanh tôi": các quán đang mở quanh vị trí, sắp theo khoảng cách (Phần 2.1.2, 9.4).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.cart, this.place = kDefaultPlace, this.openOrderId});
  final ApiClient api;
  final Cart cart;
  final Place place;

  /// Mở thẳng một đơn khi bấm vào thông báo đẩy.
  final int? openOrderId;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Place _place = widget.place;
  List<dynamic>? _stores;
  String? _error;
  String? _category;

  static const _categories = {null: 'Tất cả', 'FOOD': '🍜 Đồ ăn', 'DRINK': '🧋 Đồ uống', 'GROCERY': '🛒 Tạp hoá', 'WATER_ICE': '💧 Nước & đá', 'MOM_BABY': '👶 Mẹ & bé'};

  @override
  void initState() {
    super.initState();
    _load();
    _useMyLocation(silent: true);
    final id = widget.openOrderId;
    if (id != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (await widget.api.restore() && mounted) {
          Navigator.push(context, MaterialPageRoute(builder: (_) => OrderScreen(api: widget.api, orderId: id)));
        }
      });
    }
  }

  /// "Quanh tôi" theo GPS của máy; không được phép thì giữ địa chỉ mặc định/đã chọn.
  Future<void> _useMyLocation({bool silent = false}) async {
    final p = await currentPosition(onError: silent ? null : (r) => showDone(context, r));
    if (p == null || !mounted) return;
    setState(() => _place = Place(p.lat, p.lng, 'Vị trí hiện tại của bạn'));
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/v1/discovery/nearby', {
        'lat': '${_place.lat}',
        'lng': '${_place.lng}',
        if (_category != null) 'category': _category!,
      });
      setState(() {
        _stores = res['stores'] as List;
        _error = null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  Future<void> _changePlace() async {
    final address = TextEditingController(text: _place.address);
    final lat = TextEditingController(text: '${_place.lat}');
    final lng = TextEditingController(text: '${_place.lng}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Giao tới đâu?'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: address, decoration: const InputDecoration(labelText: 'Địa chỉ')),
          TextField(controller: lat, decoration: const InputDecoration(labelText: 'Vĩ độ'), keyboardType: TextInputType.number),
          TextField(controller: lng, decoration: const InputDecoration(labelText: 'Kinh độ'), keyboardType: TextInputType.number),
        ]),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx, false);
              _useMyLocation();
            },
            child: const Text('📍 Dùng vị trí của tôi'),
          ),
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Huỷ')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Dùng địa chỉ này')),
        ],
      ),
    );
    if (ok == true) {
      setState(() => _place = Place(double.tryParse(lat.text) ?? _place.lat, double.tryParse(lng.text) ?? _place.lng, address.text));
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: InkWell(
          onTap: _changePlace,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.place, color: SqtColors.primary),
            const SizedBox(width: 4),
            Flexible(child: Text(_place.address, overflow: TextOverflow.ellipsis)),
            const Icon(Icons.expand_more),
          ]),
        ),
      ),
      floatingActionButton: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) => widget.cart.count == 0
            ? const SizedBox.shrink()
            : FloatingActionButton.extended(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(api: widget.api, cart: widget.cart, place: _place))),
                icon: const Icon(Icons.shopping_basket),
                label: Text('${widget.cart.count} món · ${money(widget.cart.subtotal)}'),
              ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final e in _categories.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.value),
                      selected: _category == e.key,
                      onSelected: (_) {
                        setState(() => _category = e.key);
                        _load();
                      },
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 8),
            if (_error != null) Text(_error!, style: const TextStyle(color: SqtColors.danger)),
            if (_stores == null && _error == null) const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
            if (_stores != null && _stores!.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('Chưa có quán nào đang mở quanh bạn', textAlign: TextAlign.center)),
            for (final s in _stores ?? []) _StoreCard(store: s as Map<String, dynamic>, onTap: () => _open(s)),
          ],
        ),
      ),
    );
  }

  void _open(Map<String, dynamic> s) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(api: widget.api, cart: widget.cart, storeId: s['id'] as int, place: _place)));
  }
}

/// Thẻ quán "đọc trong 1 giây" (Phần 9.4).
class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.store, required this.onTap});
  final Map<String, dynamic> store;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final trust = store['trust'] as Map<String, dynamic>;
    final stars = trust['stars'];
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(store['name'] as String, style: Theme.of(context).textTheme.titleMedium)),
              Text(kTierLabels[trust['tier']] ?? ''),
            ]),
            const SizedBox(height: 4),
            Text([
              '🟢 Đang mở',
              '${store['distanceM']} m',
              if (stars != null) '★ $stars (${trust['reviewCount']})',
            ].join(' · ')),
            Text('Chuẩn bị ~${store['prepTimeDefaultMin']} phút · ${store['address']}', style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
      ),
    );
  }
}
