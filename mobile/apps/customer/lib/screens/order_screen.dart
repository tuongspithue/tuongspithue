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

  Widget _card(List<Widget> children, {Color? color}) => Card(
        color: color,
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children)),
      );

  @override
  Widget build(BuildContext context) {
    final o = _o;
    if (o == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final state = o['state'] as String;
    final schedule = o['schedule'] as Map<String, dynamic>?;
    final cancellable = !['DA_LAY_HANG', 'DANG_GIAO', 'DA_DEN_NOI', 'HOAN_THANH', 'DA_HUY', 'HOAN_TRA_QUAN', 'GIAO_THAT_BAI'].contains(state);
    final contacts = (o['contacts'] as Map?) ?? const {};
    return Scaffold(
      appBar: AppBar(title: Text('Đơn ${o['code']}')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          _StatusHero(state: state, selfPickup: o['deliveryMode'] == 'SELF_PICKUP', schedule: schedule),
          const SizedBox(height: 12),
          PushBanner(api: widget.api, app: 'CUSTOMER'),
          const InstallTip(),
          if (state == 'HEN_CHO_KHACH_DUYET_GIO')
            _card(color: SqtColors.scheduled.withValues(alpha: 0.1), [
              Text('Quán đề xuất lấy hàng lúc ${hhmm(schedule?['proposedPickupAt'] as String?)}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => _respondProposal(false), child: const Text('Không đồng ý'))),
                const SizedBox(width: 8),
                Expanded(child: FilledButton(onPressed: () => _respondProposal(true), child: const Text('Đồng ý giờ mới'))),
              ]),
            ]),
          if (o['deliveryPin'] != null && state != 'HOAN_THANH')
            _card(color: SqtColors.primary.withValues(alpha: 0.08), [
              const Text('🔐 Mã nhận hàng', style: TextStyle(fontWeight: FontWeight.w700)),
              Text('${o['deliveryPin']}', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 8, color: SqtColors.primary)),
              const Text('Chỉ đọc mã cho shipper khi đã nhận đủ hàng'),
            ]),
          if (state == 'CHO_KHACH_DEN_LAY')
            _card(color: SqtColors.confirmed.withValues(alpha: 0.1), [
              const Text('🏃 Món đã sẵn sàng', style: TextStyle(fontWeight: FontWeight.w800)),
              Text('Đọc mã đơn ${o['code']} tại quầy để nhận hàng'),
            ]),
          if (contacts['store'] != null || contacts['rider'] != null)
            _card([
              const Text('Liên hệ', style: TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              ContactButtons(label: 'Quán ${o['storeName'] ?? ''}', phone: contacts['store'] as String?),
              if (o['riderId'] != null) Text('Shipper · ${kTierLabels[o['riderTier']] ?? ''}'),
              ContactButtons(label: 'Shipper', phone: contacts['rider'] as String?),
            ]),
          _card([
            Text(o['storeName'] as String? ?? 'Món đã đặt', style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OrderItemsView(o),
            const Divider(height: 24),
            _Line('Tiền món', money(o['subtotal'] as num)),
            _Line('Phí ship', money(o['deliveryFee'] as num)),
            _Line('Phí dịch vụ', money(o['serviceFee'] as num)),
            const SizedBox(height: 4),
            _Line('Tổng cộng', money(o['total'] as num), bold: true),
          ]),
          _card([
            const Text('Ai đã xác nhận đơn của bạn', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OrderTimeline(o['timeline'] as List),
          ]),
          if (state == 'HOAN_THANH' && !_reviewed) FilledButton.icon(onPressed: _review, icon: const Icon(Icons.star), label: const Text('Đánh giá quán & shipper')),
          if (cancellable) TextButton(onPressed: _cancel, style: TextButton.styleFrom(foregroundColor: SqtColors.danger), child: const Text('Huỷ đơn')),
        ]),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.bold = false});
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w400, fontSize: bold ? 17 : 14);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [Text(label, style: style), const Spacer(), Text(value, style: bold ? style.copyWith(color: SqtColors.primary) : style)]),
    );
  }
}

/// Thẻ trạng thái lớn: đang ở bước nào, ai đang lo đơn, việc tiếp theo (Phần 2.1.6, 9.4).
class _StatusHero extends StatelessWidget {
  const _StatusHero({required this.state, required this.selfPickup, this.schedule});
  final String state;
  final bool selfPickup;
  final Map<String, dynamic>? schedule;

  static const _messages = {
    'CHO_THANH_TOAN': ('💳', 'Đang chờ bạn thanh toán'),
    'CHO_QUAN_XAC_NHAN': ('🏪', 'Quán đang xem đơn — thường dưới 3 phút'),
    'QUAN_DA_NHAN': ('👨‍🍳', 'Quán đã nhận và đang chuẩn bị món'),
    'DANG_TIM_SHIPPER': ('🔎', 'Đang mời shipper gần quán nhận chuyến'),
    'CAN_CAN_THIEP': ('🧑‍💼', 'Điều phối viên đang hỗ trợ đơn của bạn'),
    'SHIPPER_DA_NHAN': ('🛵', 'Shipper đã nhận chuyến, đang tới quán'),
    'SHIPPER_DEN_QUAN': ('🛵', 'Shipper đã tới quán, chờ lấy món'),
    'DA_LAY_HANG': ('📦', 'Shipper đã lấy hàng'),
    'DANG_GIAO': ('🛵', 'Shipper đang trên đường tới bạn'),
    'DA_DEN_NOI': ('📍', 'Shipper đã tới nơi — ra nhận hàng nhé'),
    'CHO_KHACH_DEN_LAY': ('🏃', 'Món đã xong, mời bạn tới lấy'),
    'HOAN_THANH': ('🎉', 'Giao thành công. Chúc ngon miệng!'),
    'DA_HUY': ('😔', 'Đơn đã huỷ — nếu đã trả trước, bạn được hoàn tiền'),
    'GIAO_THAT_BAI': ('⚠️', 'Giao không thành công — CSKH sẽ liên hệ bạn'),
  };

  /// Bước hiện tại trên thanh tiến trình (0..4).
  int get _step {
    if (state == 'HOAN_THANH') return 4;
    if (['DA_LAY_HANG', 'DANG_GIAO', 'DA_DEN_NOI', 'CHO_KHACH_DEN_LAY'].contains(state)) return 3;
    if (['SHIPPER_DA_NHAN', 'SHIPPER_DEN_QUAN', 'HEN_SHIPPER_DA_GIU', 'HEN_SAN_SANG'].contains(state)) return 2;
    if (['QUAN_DA_NHAN', 'DANG_TIM_SHIPPER', 'CAN_CAN_THIEP', 'HEN_QUAN_DA_NHAN', 'HEN_TREN_CHO_CHUYEN'].contains(state)) return 1;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final color = stateColor(state);
    final msg = _messages[state] ?? (state.startsWith('HEN_') ? ('🟣', 'Đơn hẹn giờ — chúng tôi nhắc quán & shipper đúng giờ') : ('📦', ''));
    final ended = state == 'DA_HUY' || state == 'GIAO_THAT_BAI';
    final labels = selfPickup ? ['Đặt', 'Quán nhận', 'Chuẩn bị', 'Sẵn sàng', 'Đã lấy'] : ['Đặt', 'Quán nhận', 'Shipper nhận', 'Đang giao', 'Đã giao'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color.withValues(alpha: 0.16), color.withValues(alpha: 0.05)]),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(msg.$1, style: const TextStyle(fontSize: 40)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              StateChip(state),
              const SizedBox(height: 4),
              Text(msg.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              if (schedule != null) Text('🟣 Hẹn lấy hàng lúc ${hhmm(schedule!['pickupAt'] as String?)}', style: const TextStyle(color: SqtColors.scheduled, fontWeight: FontWeight.w600)),
            ]),
          ),
        ]),
        if (!ended) ...[
          const SizedBox(height: 16),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (var i = 0; i < labels.length; i++) ...[
              Expanded(
                child: Column(children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    height: 6,
                    decoration: BoxDecoration(color: i <= _step ? color : color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(99)),
                  ),
                  const SizedBox(height: 6),
                  Text(labels[i], textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, fontWeight: i == _step ? FontWeight.w800 : FontWeight.w500)),
                ]),
              ),
              if (i < labels.length - 1) const SizedBox(width: 4),
            ],
          ]),
        ],
      ]),
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
