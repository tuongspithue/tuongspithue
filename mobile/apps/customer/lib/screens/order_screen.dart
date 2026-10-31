import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

/// Theo dõi đơn: trạng thái, ai đã xác nhận, mã PIN, huỷ, đánh giá (Phần 2.1.6, 2.1.7).
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.api, required this.orderId});
  final ApiClient api;
  final int orderId;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> with Polling {
  Map<String, dynamic>? _o;
  bool _reviewed = false;

  @override
  void initState() {
    super.initState();
    startPolling(_load);
  }

  Future<void> _load() async {
    try {
      final o = await widget.api.get('/v1/orders/${widget.orderId}');
      if (mounted) setState(() => _o = o as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ đơn?'),
        content: const Text('Trước khi quán nhận đơn bạn được hoàn tiền toàn bộ. Sau đó áp dụng chính sách huỷ.'),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Giữ đơn')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Huỷ đơn'))],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.post('/v1/orders/${widget.orderId}/cancel');
      await _load();
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _respondProposal(bool accept) async {
    try {
      await widget.api.post('/v1/orders/${widget.orderId}/proposal', {'accept': accept});
      await _load();
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _review() async {
    int storeStars = 5;
    int riderStars = 5;
    final hasRider = _o!['riderId'] != null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Đánh giá đơn hàng'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Món ăn của quán'),
            _Stars(value: storeStars, onChanged: (v) => set(() => storeStars = v)),
            if (hasRider) ...[const Text('Shipper'), _Stars(value: riderStars, onChanged: (v) => set(() => riderStars = v))],
          ]),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Gửi đánh giá'))],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.post('/v1/orders/${widget.orderId}/review', {
        'store': {'stars': storeStars},
        if (hasRider) 'rider': {'stars': riderStars},
      });
      setState(() => _reviewed = true);
      if (mounted) showDone(context, 'Cảm ơn bạn đã đánh giá!');
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    if (o == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final state = o['state'] as String;
    final schedule = o['schedule'] as Map<String, dynamic>?;
    final cancellable = !['DA_LAY_HANG', 'DANG_GIAO', 'DA_DEN_NOI', 'HOAN_THANH', 'DA_HUY', 'HOAN_TRA_QUAN', 'GIAO_THAT_BAI'].contains(state);
    return Scaffold(
      appBar: AppBar(title: Text('Đơn ${o['code']}')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Align(alignment: Alignment.centerLeft, child: StateChip(state)),
          if (schedule != null) Text('🟣 Hẹn lấy hàng lúc ${hhmm(schedule['pickupAt'] as String?)}', style: const TextStyle(color: SqtColors.scheduled)),
          if (state == 'HEN_CHO_KHACH_DUYET_GIO') ...[
            Text('Quán đề xuất lấy hàng lúc ${hhmm(schedule?['proposedPickupAt'] as String?)}'),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => _respondProposal(false), child: const Text('Không đồng ý'))),
              const SizedBox(width: 8),
              Expanded(child: FilledButton(onPressed: () => _respondProposal(true), child: const Text('Đồng ý giờ mới'))),
            ]),
          ],
          if (o['deliveryPin'] != null && state != 'HOAN_THANH')
            Card(child: ListTile(leading: const Icon(Icons.pin), title: Text('Mã nhận hàng: ${o['deliveryPin']}'), subtitle: const Text('Chỉ đọc mã cho shipper khi đã nhận đủ hàng'))),
          if (state == 'CHO_KHACH_DEN_LAY') Card(child: ListTile(leading: const Icon(Icons.storefront), title: Text('Đọc mã đơn ${o['code']} tại quầy'))),
          if (o['riderId'] != null) Text('Shipper: ${kTierLabels[o['riderTier']] ?? ''}'),
          const SizedBox(height: 8),
          OrderItemsView(o),
          const Divider(),
          Text('Món ${money(o['subtotal'] as num)} · Ship ${money(o['deliveryFee'] as num)} · Dịch vụ ${money(o['serviceFee'] as num)}'),
          Text('Tổng ${money(o['total'] as num)}', style: Theme.of(context).textTheme.titleMedium),
          const Divider(),
          OrderTimeline(o['timeline'] as List),
          if (cancellable) OutlinedButton(onPressed: _cancel, child: const Text('Huỷ đơn')),
          if (state == 'HOAN_THANH' && !_reviewed) FilledButton(onPressed: _review, child: const Text('⭐ Đánh giá')),
        ]),
      ),
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 1; i <= 5; i++)
          IconButton(
            tooltip: '$i sao',
            onPressed: () => onChanged(i),
            icon: Icon(i <= value ? Icons.star : Icons.star_border, color: SqtColors.waiting),
          ),
      ]);
}
