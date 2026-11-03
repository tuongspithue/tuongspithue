import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import '../cart.dart';
import '../main.dart';
import '../ui.dart';
import 'cart_screen.dart';
import 'order_screen.dart';
import 'parcel_screen.dart';
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

enum _Sort { near, trust, fast }

class _HomeScreenState extends State<HomeScreen> {
  late Place _place = widget.place;
  List<dynamic>? _stores;
  String? _error;
  String? _category;
  String _query = '';
  _Sort _sort = _Sort.near;

  static const _tierRank = {'DIAMOND': 0, 'GOLD': 1, 'SILVER': 2, 'BRONZE': 3, 'ROOKIE': 4, 'IMPROVE': 5};

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
      if (!mounted) return;
      setState(() {
        _stores = res['stores'] as List;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _changePlace() async {
    final address = TextEditingController(text: _place.address);
    final lat = TextEditingController(text: '${_place.lat}');
    final lng = TextEditingController(text: '${_place.lng}');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Giao tới đâu?', style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          FilledButton.tonalIcon(
            onPressed: () {
              Navigator.pop(ctx, false);
              _useMyLocation();
            },
            icon: const Icon(Icons.my_location),
            label: const Text('Dùng vị trí hiện tại của tôi'),
          ),
          const SizedBox(height: 16),
          TextField(controller: address, decoration: const InputDecoration(labelText: 'Địa chỉ', prefixIcon: Icon(Icons.home_outlined))),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: lat, decoration: const InputDecoration(labelText: 'Vĩ độ'), keyboardType: TextInputType.number)),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: lng, decoration: const InputDecoration(labelText: 'Kinh độ'), keyboardType: TextInputType.number)),
          ]),
          const SizedBox(height: 16),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Giao tới địa chỉ này')),
        ]),
      ),
    );
    if (ok == true) {
      setState(() => _place = Place(double.tryParse(lat.text) ?? _place.lat, double.tryParse(lng.text) ?? _place.lng, address.text));
      _load();
    }
  }

  int _eta(Map<String, dynamic> s) => etaMinutes(s['prepTimeDefaultMin'] as int? ?? 15, s['distanceM'] as int? ?? 0);

  List<Map<String, dynamic>> get _shown {
    final q = _query.trim().toLowerCase();
    final list = (_stores ?? []).cast<Map<String, dynamic>>().where((s) => q.isEmpty || (s['name'] as String).toLowerCase().contains(q)).toList();
    switch (_sort) {
      case _Sort.near:
        break; // API đã sắp theo khoảng cách
      case _Sort.trust:
        list.sort((a, b) => (_tierRank[(a['trust'] as Map)['tier']] ?? 9).compareTo(_tierRank[(b['trust'] as Map)['tier']] ?? 9));
      case _Sort.fast:
        list.sort((a, b) => _eta(a).compareTo(_eta(b)));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final shown = _shown;
    return Scaffold(
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.cart,
        builder: (context, _) => widget.cart.count == 0
            ? const SizedBox.shrink()
            : CartBar(
                count: widget.cart.count,
                total: widget.cart.subtotal,
                label: widget.cart.storeName ?? 'Xem giỏ hàng',
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(api: widget.api, cart: widget.cart, place: _place))),
              ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(child: _Header(place: _place, onChangePlace: _changePlace, onSearch: (v) => setState(() => _query = v))),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 104,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                children: [
                  _CategoryTile(emoji: '✨', label: 'Tất cả', color: SqtColors.primary, selected: _category == null, onTap: () => _pickCategory(null)),
                  for (final e in kCategoryMeta.entries)
                    _CategoryTile(emoji: e.value.emoji, label: e.value.label, color: e.value.color, selected: _category == e.key, onTap: () => _pickCategory(e.key)),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: _ParcelEntry(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ParcelScreen(api: widget.api, place: _place)))),
          ),
          const SliverToBoxAdapter(child: _PromiseBanner()),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverToBoxAdapter(
              child: SectionTitle(
                _stores == null ? 'Quán quanh bạn' : 'Quán quanh bạn (${shown.length})',
                trailing: PopupMenuButton<_Sort>(
                  tooltip: 'Sắp xếp',
                  initialValue: _sort,
                  onSelected: (v) => setState(() => _sort = v),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: _Sort.near, child: Text('📍 Gần nhất')),
                    PopupMenuItem(value: _Sort.fast, child: Text('⚡ Nhanh nhất')),
                    PopupMenuItem(value: _Sort.trust, child: Text('🏅 Uy tín cao')),
                  ],
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(switch (_sort) { _Sort.near => 'Gần nhất', _Sort.fast => 'Nhanh nhất', _Sort.trust => 'Uy tín cao' }, style: const TextStyle(color: SqtColors.primary, fontWeight: FontWeight.w700)),
                    const Icon(Icons.swap_vert, color: SqtColors.primary, size: 18),
                  ]),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverList.list(children: [
              if (_error != null) _Message(emoji: '📡', title: 'Chưa tải được danh sách quán', body: _error!, action: TextButton(onPressed: _load, child: const Text('Thử lại'))),
              if (_stores == null && _error == null) ...[for (var i = 0; i < 4; i++) const Skeleton()],
              if (_stores != null && shown.isEmpty)
                _Message(
                  emoji: _query.isEmpty ? '🌙' : '🔎',
                  title: _query.isEmpty ? 'Chưa có quán nào đang mở quanh bạn' : 'Không tìm thấy "$_query"',
                  body: _query.isEmpty ? 'Thử đổi địa chỉ giao hoặc chọn ngành khác nhé.' : 'Thử từ khoá ngắn hơn, VD "phở", "trà sữa".',
                ),
              for (final s in shown) _StoreCard(store: s, eta: _eta(s), onTap: () => _open(s)),
            ]),
          ),
        ]),
      ),
    );
  }

  void _pickCategory(String? c) {
    setState(() {
      _category = c;
      _stores = null;
    });
    _load();
  }

  void _open(Map<String, dynamic> s) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(api: widget.api, cart: widget.cart, storeId: s['id'] as int, place: _place)));
  }
}

/// Đầu trang: địa chỉ giao (bấm để đổi), lời chào, ô tìm quán.
class _Header extends StatelessWidget {
  const _Header({required this.place, required this.onChangePlace, required this.onSearch});
  final Place place;
  final VoidCallback onChangePlace;
  final ValueChanged<String> onSearch;

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greet = hour < 10 ? 'Chào buổi sáng ☀️' : hour < 14 ? 'Trưa nay ăn gì? 🍱' : hour < 18 ? 'Chiều rồi, làm ly gì nhé 🧋' : 'Tối nay ăn gì? 🌙';
    return Container(
      padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 14, 16, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFF7A3D), Color(0xFFFF4D2E)]),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(
          onTap: onChangePlace,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.place, color: Colors.white, size: 18),
              const SizedBox(width: 4),
              const Text('Giao tới ', style: TextStyle(color: Colors.white70)),
              Flexible(child: Text(place.address, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
              const Icon(Icons.expand_more, color: Colors.white),
            ]),
          ),
        ),
        const SizedBox(height: 14),
        Text(greet, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('Quán quanh bạn, có người thật xác nhận từng đơn', style: TextStyle(color: Colors.white70)),
        const SizedBox(height: 14),
        TextField(
          key: const Key('search'),
          onChanged: onSearch,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Tìm quán: phở, trà sữa, nước đá…',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          ),
        ),
      ]),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.emoji, required this.label, required this.color, required this.selected, required this.onTap});
  final String emoji;
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            width: 72,
            child: Column(children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: selected ? color : color.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: selected ? [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 4))] : null,
                ),
                alignment: Alignment.center,
                child: Text(emoji, style: const TextStyle(fontSize: 26)),
              ),
              const SizedBox(height: 6),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: selected ? FontWeight.w800 : FontWeight.w500)),
            ]),
          ),
        ),
      );
}

/// Lối vào dịch vụ Gửi hàng: đặt shipper lấy & giao giúp (Phần 2.1.9).
class _ParcelEntry extends StatelessWidget {
  const _ParcelEntry({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
        child: Material(
          borderRadius: BorderRadius.circular(20),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: const Key('open-parcel'),
            onTap: onTap,
            child: Ink(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF5B41E0), Color(0xFF8B5CF6)])),
              child: const Row(children: [
                Text('📦', style: TextStyle(fontSize: 36)),
                SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Gửi hàng', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
                    SizedBox(height: 2),
                    Text('Đặt shipper tới lấy và giao tận tay người nhận', style: TextStyle(color: Colors.white70)),
                  ]),
                ),
                Icon(Icons.arrow_forward, color: Colors.white),
              ]),
            ),
          ),
        ),
      );
}

/// Cam kết khác biệt của sản phẩm (Phần 1.2): nói ngắn, đặt ngay trang chủ.
class _PromiseBanner extends StatelessWidget {
  const _PromiseBanner();

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [SqtColors.confirmed.withValues(alpha: 0.12), SqtColors.scheduled.withValues(alpha: 0.1)]),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Row(children: [
          Text('🤝', style: TextStyle(fontSize: 30)),
          SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Mọi đơn đều có người thật xác nhận', style: TextStyle(fontWeight: FontWeight.w800)),
              SizedBox(height: 2),
              Text('Quán bấm nhận đơn, shipper bấm nhận chuyến — bạn luôn biết ai đang lo đơn của mình.', style: TextStyle(fontSize: 12.5)),
            ]),
          ),
        ]),
      );
}

/// Thẻ quán "đọc trong 1 giây" (Phần 9.4): ngành, uy tín, khoảng cách, thời gian đến tay.
class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.store, required this.eta, required this.onTap});
  final Map<String, dynamic> store;
  final int eta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final trust = store['trust'] as Map<String, dynamic>;
    final stars = trust['stars'];
    final dist = store['distanceM'] as int? ?? 0;
    final c = categoryOf(store['category'] as String?);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            StoreThumb(category: store['category'] as String?),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(store['name'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(kTierLabels[trust['tier']] ?? '', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                  if (stars != null) Text('★ $stars (${trust['reviewCount']})', style: const TextStyle(fontSize: 12.5, color: SqtColors.waiting, fontWeight: FontWeight.w700)),
                  Text(c.label, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ]),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  InfoPill(icon: Icons.schedule, text: '~$eta phút', color: SqtColors.confirmed),
                  InfoPill(icon: Icons.near_me, text: distanceText(dist)),
                  if (store['orderMode'] == 'PROXY') const InfoPill(icon: Icons.shopping_bag_outlined, text: 'Shipper mua hộ', color: SqtColors.scheduled),
                ]),
              ]),
            ),
            const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.emoji, required this.title, required this.body, this.action});
  final String emoji;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
        child: Column(children: [
          Text(emoji, style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(body, textAlign: TextAlign.center),
          if (action != null) action!,
        ]),
      );
}
