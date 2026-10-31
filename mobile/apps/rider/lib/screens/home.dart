import 'dart:async';

import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

/// Vị trí đang dùng. TODO(GPS): thay bằng vị trí thật từ thiết bị (geolocator) khi build Android/iOS.
class RiderPosition {
  RiderPosition(this.lat, this.lng);
  double lat;
  double lng;
  Map<String, double> toJson() => {'lat': lat, 'lng': lng};
}

/// Trang chính shipper: bật trực tuyến, lời mời chuyến, chợ chuyến hẹn, chuyến của tôi, uy tín (Phần 2.3, 10.5, 11.7).
class RiderHome extends StatefulWidget {
  const RiderHome({super.key, required this.api});
  final ApiClient api;

  @override
  State<RiderHome> createState() => _RiderHomeState();
}

class _RiderHomeState extends State<RiderHome> with Polling {
  final pos = RiderPosition(10.7769, 106.7009);
  bool _online = false;
  bool _registered = true;
  List<dynamic> _offers = [];
  List<dynamic> _board = [];
  List<dynamic> _trips = [];
  Map<String, dynamic>? _trust;
  Timer? _locationTimer;

  @override
  void initState() {
    super.initState();
    startPolling(_load);
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.api.get('/v1/rider/offers'),
        widget.api.get('/v1/rider/scheduled-board'),
        widget.api.get('/v1/rider/trips'),
        widget.api.get('/v1/me/trust'),
      ]);
      if (!mounted) return;
      setState(() {
        _registered = true;
        _offers = results[0]['offers'] as List;
        _board = results[1]['trips'] as List;
        _trips = results[2]['trips'] as List;
        _trust = results[3] as Map<String, dynamic>;
      });
    } on ApiException catch (e) {
      if (e.status == 403 && mounted) setState(() => _registered = false);
    }
  }

  Future<void> _setOnline(bool v) async {
    try {
      await widget.api.post('/v1/rider/status', {'online': v, ...pos.toJson()});
      setState(() => _online = v);
      _locationTimer?.cancel();
      // Gửi vị trí định kỳ khi trực tuyến (Phần 5.4); tắt hẳn khi ngoại tuyến.
      if (v) _locationTimer = Timer.periodic(const Duration(seconds: 15), (_) => widget.api.post('/v1/rider/location', pos.toJson()).catchError((_) => null));
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _act(Future<dynamic> Function() action, String done) async {
    try {
      await action();
      if (mounted) showDone(context, done);
      await _load();
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_registered) return RegisterScreen(api: widget.api, onDone: _load);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(_online ? '🟢 Đang trực tuyến' : '⚪ Ngoại tuyến'),
          actions: [Switch(key: const Key('online'), value: _online, onChanged: _setOnline)],
          bottom: TabBar(isScrollable: true, tabs: [
            Tab(text: '🔔 Lời mời (${_offers.length})'),
            Tab(text: '🟣 Chuyến hẹn (${_board.length})'),
            Tab(text: 'Chuyến của tôi (${_trips.length})'),
            const Tab(text: '⭐ Uy tín'),
          ]),
        ),
        body: TabBarView(children: [
          _list(_offers, 'Chưa có lời mời. Bật trực tuyến để nhận chuyến.', (o) => _OfferCard(offer: o, onAccept: () => _act(() => widget.api.post('/v1/rider/offers/${o['id']}/accept'), 'Đã nhận chuyến'), onDecline: () => _act(() => widget.api.post('/v1/rider/offers/${o['id']}/decline'), 'Đã bỏ qua'))),
          _list(_board, 'Chưa có chuyến hẹn quanh bạn', (t) => _BoardCard(trip: t, onClaim: () => _act(() => widget.api.post('/v1/rider/scheduled-trips/${t['orderId']}/claim'), 'Đã giữ chuyến'))),
          _list(_trips, 'Chưa có chuyến nào', (t) => TripCard(api: widget.api, trip: t, pos: pos, onChanged: _load)),
          _TrustView(trust: _trust),
        ]),
      ),
    );
  }

  Widget _list(List<dynamic> items, String empty, Widget Function(Map<String, dynamic>) build) => RefreshIndicator(
        onRefresh: _load,
        child: items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(48), child: Text(empty, textAlign: TextAlign.center))])
            : ListView(padding: const EdgeInsets.all(12), children: [for (final i in items) build(i as Map<String, dynamic>)]),
      );
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.onAccept, required this.onDecline});
  final Map<String, dynamic> offer;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final cash = offer['cashToCollect'] as int;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Thu nhập ${money(offer['earning'] as num)}', style: Theme.of(context).textTheme.headlineSmall),
          Text('${offer['storeName']} · cách bạn ${offer['distanceToStoreM']} m'),
          Text('Quãng đường giao ~${((offer['tripDistanceM'] as num? ?? 0) / 1000).toStringAsFixed(1)} km'),
          Text(cash > 0 ? '💵 Thu tiền mặt ${money(cash)}' : '✔ Khách đã thanh toán'),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: onDecline, child: const Text('Bỏ qua'))),
            const SizedBox(width: 8),
            Expanded(flex: 2, child: FilledButton(key: Key('accept-offer-${offer['id']}'), onPressed: onAccept, child: const Text('NHẬN CHUYẾN'))),
          ]),
        ]),
      ),
    );
  }
}

class _BoardCard extends StatelessWidget {
  const _BoardCard({required this.trip, required this.onClaim});
  final Map<String, dynamic> trip;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('🟣 Lấy lúc ${hhmm(trip['pickupAt'] as String?)}', style: const TextStyle(color: SqtColors.scheduled, fontWeight: FontWeight.bold)),
            Text('${trip['storeName']} · cách bạn ${trip['distanceToStoreM']} m'),
            Text('Thu nhập ${money(trip['earning'] as num)}${(trip['bonus'] as num) > 0 ? ' (gồm thưởng ${money(trip['bonus'] as num)})' : ''}'),
            const SizedBox(height: 8),
            FilledButton(onPressed: onClaim, child: const Text('🤚 GIỮ CHUYẾN NÀY')),
          ]),
        ),
      );
}

/// Một chuyến đang làm: nút bước tiếp theo theo trạng thái (Phần 2.3.4).
class TripCard extends StatelessWidget {
  const TripCard({super.key, required this.api, required this.trip, required this.pos, required this.onChanged});
  final ApiClient api;
  final Map<String, dynamic> trip;
  final RiderPosition pos;
  final Future<void> Function() onChanged;

  int get _id => trip['id'] as int;

  Future<void> _call(BuildContext context, String path, Map<String, dynamic> body, String done) async {
    try {
      await api.post(path, body);
      if (context.mounted) showDone(context, done);
      await onChanged();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      // GPS yếu: cho xác nhận kèm ảnh chụp tại chỗ, đơn bị gắn cờ hậu kiểm.
      if (e.code == 'OUTSIDE_GEOFENCE') {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Bạn đang ở xa điểm đến'),
            content: Text('${e.message}\n\nNếu GPS yếu, chụp ảnh tại chỗ để xác nhận.'),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Quay lại')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('📷 Chụp ảnh xác nhận'))],
          ),
        );
        // TODO(camera): chụp ảnh thật và tải lên kho ảnh; tạm dùng đường dẫn giữ chỗ.
        if (ok == true && context.mounted) await _call(context, path, {...body, 'photoUrl': 'pending-upload://$_id'}, done);
        return;
      }
      showError(context, e);
    }
  }

  Future<String?> _ask(BuildContext context, String title, String hint) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(controller: c, autofocus: true, decoration: InputDecoration(hintText: hint)),
        actions: [FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Xác nhận'))],
      ),
    );
    return ok == true ? c.text.trim() : null;
  }

  @override
  Widget build(BuildContext context) {
    final state = trip['state'] as String;
    final schedule = trip['schedule'] as Map<String, dynamic>?;
    final p = pos.toJson();
    final actions = <Widget>[];
    switch (state) {
      case 'SHIPPER_DA_NHAN':
        actions.add(FilledButton(onPressed: () => _call(context, '/v1/rider/orders/$_id/arrived-store', p, 'Đã báo tới quán'), child: const Text('📍 ĐÃ TỚI QUÁN')));
      case 'SHIPPER_DEN_QUAN':
        actions.add(FilledButton(
          onPressed: () async {
            final code = await _ask(context, 'Quét/nhập mã trên túi hàng', 'SQT-XXXXXX');
            if (code != null && context.mounted) await _call(context, '/v1/rider/orders/$_id/picked-up', {...p, 'code': code}, 'Đã lấy hàng');
          },
          child: const Text('📦 ĐÃ LẤY HÀNG'),
        ));
        actions.add(OutlinedButton(
          onPressed: () => _call(context, '/v1/rider/orders/$_id/release', {'reason': 'Chờ món quá lâu'}, 'Đã nhả chuyến'),
          child: const Text('Nhả chuyến (chờ món quá lâu)'),
        ));
      case 'DANG_GIAO':
        actions.add(FilledButton(onPressed: () => _call(context, '/v1/rider/orders/$_id/arrived-dropoff', p, 'Đã báo tới nơi'), child: const Text('🏁 ĐÃ TỚI ĐIỂM GIAO')));
      case 'DA_DEN_NOI':
        actions.add(FilledButton(
          onPressed: () async {
            try {
              await api.post('/v1/rider/orders/$_id/delivered', {});
              if (context.mounted) showDone(context, 'Đã giao xong 🎉');
              await onChanged();
            } on ApiException catch (e) {
              if (e.code != 'PIN_MISMATCH' || !context.mounted) {
                if (context.mounted) showError(context, e);
                return;
              }
              final pin = await _ask(context, 'Hỏi khách mã nhận hàng 4 số', '1234');
              if (pin != null && context.mounted) await _call(context, '/v1/rider/orders/$_id/delivered', {'pin': pin}, 'Đã giao xong 🎉');
            }
          },
          child: const Text('✅ ĐÃ GIAO'),
        ));
      case 'HEN_SHIPPER_DA_GIU':
        if (schedule?['riderReconfirmed'] != true) {
          actions.add(FilledButton(onPressed: () => _call(context, '/v1/rider/scheduled-trips/$_id/ready', {}, 'Đã xác nhận sẵn sàng'), child: const Text('🙋 TÔI SẴN SÀNG')));
        }
        actions.add(OutlinedButton(onPressed: () => _call(context, '/v1/rider/scheduled-trips/$_id/release', {'reason': 'Bận việc đột xuất'}, 'Đã nhả chuyến hẹn'), child: const Text('Nhả chuyến hẹn')));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Expanded(child: Text(trip['code'] as String, style: Theme.of(context).textTheme.titleMedium)), StateChip(state)]),
          if (schedule != null) Text('🟣 Lấy hàng lúc ${hhmm(schedule['pickupAt'] as String?)}'),
          Text(trip['paymentMethod'] == 'COD' ? '💵 Thu tiền mặt ${money(trip['total'] as num)}' : '✔ Khách đã thanh toán'),
          Text('Khách ✔ ${trip['customerCompletedOrders'] ?? 0} đơn thành công'),
          const SizedBox(height: 8),
          OrderItemsView(trip),
          const SizedBox(height: 8),
          ...actions.map((a) => Padding(padding: const EdgeInsets.only(top: 6), child: a)),
        ]),
      ),
    );
  }
}

class _TrustView extends StatelessWidget {
  const _TrustView({required this.trust});
  final Map<String, dynamic>? trust;

  @override
  Widget build(BuildContext context) {
    final t = trust;
    if (t == null) return const Center(child: CircularProgressIndicator());
    final c = (t['components'] as Map).cast<String, dynamic>();
    String pct(Object? v) => v == null ? 'chưa có dữ liệu' : '${(v as num).round()}%';
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(kTierLabels[t['tier']] ?? '', style: Theme.of(context).textTheme.headlineMedium),
      Text('Điểm ${t['score']} · ${t['completed']} chuyến hoàn thành${t['adjusted'] == true ? ' · cấp đang được điều chỉnh có thời hạn' : ''}'),
      const Divider(),
      ListTile(title: const Text('Hoàn thành chuyến đã nhận'), trailing: Text(pct(c['completion']))),
      ListTile(title: const Text('Đánh giá của khách'), trailing: Text(t['stars'] == null ? 'chưa có' : '★ ${t['stars']}')),
      ListTile(title: const Text('Giữ cam kết chuyến hẹn'), trailing: Text(pct(c['scheduledKept']))),
    ]);
  }
}

/// Đăng ký làm shipper (Phần 2.3.1, mức MVP). eKYC qua nhà cung cấp làm ở bước duyệt.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.api, required this.onDone});
  final ApiClient api;
  final Future<void> Function() onDone;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  String _vehicle = 'MOTORBIKE';
  final _plate = TextEditingController();
  bool _sent = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Đăng ký làm shipper')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          if (_sent)
            const Text('Hồ sơ đã gửi. Bạn có thể bật trực tuyến sau khi được duyệt (thường trong 24 giờ).')
          else ...[
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'MOTORBIKE', label: Text('Xe máy')), ButtonSegment(value: 'EMOTORBIKE', label: Text('Xe điện')), ButtonSegment(value: 'CARGO', label: Text('Ba gác'))],
              selected: {_vehicle},
              onSelectionChanged: (v) => setState(() => _vehicle = v.first),
            ),
            const SizedBox(height: 12),
            TextField(controller: _plate, decoration: const InputDecoration(labelText: 'Biển số xe')),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () async {
                try {
                  await widget.api.post('/v1/rider/register', {'vehicleType': _vehicle, if (_plate.text.trim().isNotEmpty) 'plateNumber': _plate.text.trim()});
                  setState(() => _sent = true);
                } on ApiException catch (e) {
                  if (context.mounted) showError(context, e);
                }
              },
              child: const Text('Gửi hồ sơ'),
            ),
          ],
        ]),
      );
}
