import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sqt_core/sqt_core.dart';

import '../order_text.dart';
import '../status_animation.dart';

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
    final hasStore = _o!['storeId'] != null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Đánh giá đơn hàng'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            if (hasStore) ...[const Text('Món ăn của quán'), _Stars(value: storeStars, onChanged: (v) => set(() => storeStars = v))],
            if (hasRider) ...[const Text('Shipper'), _Stars(value: riderStars, onChanged: (v) => set(() => riderStars = v))],
          ]),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Gửi đánh giá'))],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.post('/v1/orders/${widget.orderId}/review', {
        if (hasStore) 'store': {'stars': storeStars},
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
          _StatusHero(
            state: state,
            selfPickup: o['deliveryMode'] == 'SELF_PICKUP',
            parcel: o['kind'] == 'PARCEL',
            schedule: schedule,
            proxy: o['fulfillment'] == 'PROXY',
            proxyAllowed: o['proxyAllowed'] == true,
            orderedAtStore: o['acceptedChannel'] == 'RIDER_PROXY',
            since: DateTime.tryParse(o['stateSince'] as String? ?? ''),
            dispatchRound: (o['dispatchRound'] as num?)?.toInt() ?? 1,
            opsOnDuty: o['opsOnDuty'] == true,
            cancelReason: o['cancelReason'] as String?,
          ),
          if (o['kind'] != 'PARCEL' && !['HOAN_THANH', 'DA_HUY'].contains(state)) _SendToStoreCard(order: o),
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
          if (o['kind'] == 'PARCEL' && !['HOAN_THANH', 'DA_HUY'].contains(state)) ..._parcelCards(o, state),
          if (o['deliveryPin'] != null && state != 'HOAN_THANH' && o['kind'] != 'PARCEL')
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
            if (o['kind'] == 'PARCEL') _ParcelRoute(o) else OrderItemsView(o),
            const Divider(height: 24),
            if (o['kind'] != 'PARCEL') _Line('Tiền món', money(o['subtotal'] as num)),
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

/// Gửi hàng: mã đơn để đọc cho shipper lúc lấy hàng; mã nhận hàng để gửi cho người nhận.
List<Widget> _parcelCards(Map<String, dynamic> o, String state) {
  final pin = o['deliveryPin'] as String?;
  final receiver = o['recipientPhone'] as String?;
  final beforePickup = ['DANG_TIM_SHIPPER', 'CAN_CAN_THIEP', 'SHIPPER_DA_NHAN', 'SHIPPER_DEN_QUAN'].contains(state);
  return [
    if (beforePickup)
      Card(
        color: SqtColors.confirmed.withValues(alpha: 0.08),
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('📤 Mã đơn — đọc cho shipper khi giao hàng cho shipper', style: TextStyle(fontWeight: FontWeight.w700)),
            Text('${o['code']}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 2, color: SqtColors.confirmed)),
          ]),
        ),
      ),
    if (pin != null)
      Card(
        color: SqtColors.primary.withValues(alpha: 0.08),
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('📥 Mã nhận hàng — gửi cho người nhận', style: TextStyle(fontWeight: FontWeight.w700)),
            Text(pin, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 8, color: SqtColors.primary)),
            const Text('Người nhận đọc mã này cho shipper khi đã nhận đủ hàng.'),
            if (receiver != null) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.tonalIcon(
                  onPressed: () => openSms(receiver, 'Ship Quanh Tôi: đơn ${o['code']} đang được giao tới bạn. Mã nhận hàng là $pin — chỉ đọc cho shipper khi đã nhận đủ hàng.'),
                  icon: const Icon(Icons.sms_outlined),
                  label: const Text('Gửi mã qua SMS'),
                ),
                OutlinedButton.icon(onPressed: () => openZalo(receiver), icon: const Icon(Icons.chat_outlined), label: const Text('Mở Zalo người nhận')),
              ]),
            ],
          ]),
        ),
      ),
  ];
}

/// Lộ trình gửi hàng: lấy ở đâu → giao tới đâu, loại hàng, ai trả phí.
class _ParcelRoute extends StatelessWidget {
  const _ParcelRoute(this.o);
  final Map<String, dynamic> o;

  static const _types = {'DOCUMENT': '📄 Giấy tờ', 'FOOD': '🍱 Đồ ăn', 'CLOTHES': '👕 Quần áo', 'ELECTRONICS': '📱 Điện tử', 'OTHER': '📦 Khác'};
  static const _sizes = {'SMALL': 'Nhỏ', 'MEDIUM': 'Vừa', 'LARGE': 'Lớn'};

  @override
  Widget build(BuildContext context) {
    final p = (o['parcel'] as Map?) ?? const {};
    Widget stop(IconData icon, Color color, String title, String? address, String? who) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: Theme.of(context).textTheme.bodySmall),
                Text(address ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                if (who != null) Text(who),
              ]),
            ),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      stop(Icons.trip_origin, SqtColors.confirmed, 'Lấy hàng', o['pickupAddress'] as String?, p['senderName'] == null ? null : 'Người gửi: ${p['senderName']}'),
      stop(Icons.place, SqtColors.danger, 'Giao tới', o['dropoffAddress'] as String?, o['recipientName'] == null ? null : 'Người nhận: ${o['recipientName']}'),
      const SizedBox(height: 6),
      Wrap(spacing: 6, runSpacing: 6, children: [
        Chip(label: Text(_types[p['type']] ?? '📦 Hàng hoá'), visualDensity: VisualDensity.compact),
        Chip(label: Text('Cỡ ${_sizes[p['size']] ?? ''}'), visualDensity: VisualDensity.compact),
        Chip(label: Text(p['feePayer'] == 'RECEIVER' ? '💵 Người nhận trả phí' : '💵 Người gửi trả phí'), visualDensity: VisualDensity.compact),
      ]),
      if (o['orderNote'] != null) Text('Ghi chú: ${o['orderNote']}'),
    ]);
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
  const _StatusHero({required this.state, required this.selfPickup, this.parcel = false, this.schedule, this.proxy = false, this.proxyAllowed = false, this.orderedAtStore = false, this.since, this.dispatchRound = 1, this.opsOnDuty = false, this.cancelReason});
  final String state;
  final bool selfPickup;
  final bool parcel;
  final bool proxy;
  final bool proxyAllowed;
  final bool orderedAtStore;
  final DateTime? since;
  final Map<String, dynamic>? schedule;
  final int dispatchRound;
  final bool opsOnDuty;
  final String? cancelReason;

  /// Nói thật với khách: chỉ nhắc "điều phối viên" khi có người đang trực (Phần 3.4).
  (String, String)? get _special {
    if (state == 'DANG_TIM_SHIPPER' && dispatchRound >= 2) return ('🔁', 'Chưa có shipper nhận — đang gọi lại quán và mời shipper thêm một lượt');
    if (state == 'CAN_CAN_THIEP') {
      return opsOnDuty ? ('🧑‍💼', 'Điều phối viên đang hỗ trợ đơn của bạn') : ('⚠️', 'Đơn đang gặp trục trặc — bạn có thể gọi quán hoặc shipper ở mục Liên hệ');
    }
    if (state == 'DA_HUY' && cancelReason == 'NO_RIDER') return ('😔', 'Rất tiếc, chưa có shipper nhận đơn lúc này. Đơn đã huỷ — nếu đã trả trước, bạn được hoàn tiền');
    if (state == 'DA_HUY' && cancelReason == 'MERCHANT_TIMEOUT') return ('😔', 'Quán chưa phản hồi. Đơn đã huỷ — nếu đã trả trước, bạn được hoàn tiền');
    return null;
  }

  static const _messages = {
    'CHO_THANH_TOAN': ('💳', 'Đang chờ bạn thanh toán'),
    'CHO_QUAN_XAC_NHAN': ('🏪', 'Quán đang xem đơn — vui lòng chờ giây lát'),
    'QUAN_DA_NHAN': ('👨‍🍳', 'Quán đã nhận và đang chuẩn bị món'),
    'DANG_TIM_SHIPPER': ('🔎', 'Đang mời shipper gần quán nhận chuyến'),
    'CAN_CAN_THIEP': ('⚠️', 'Đơn đang gặp trục trặc'),
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

  static const _parcelMessages = {
    'DANG_TIM_SHIPPER': ('🔎', 'Đang mời shipper gần điểm lấy hàng'),
    'SHIPPER_DA_NHAN': ('🛵', 'Shipper đã nhận chuyến, đang tới lấy hàng'),
    'SHIPPER_DEN_QUAN': ('📍', 'Shipper đã tới điểm lấy — đọc mã đơn cho shipper'),
    'DA_LAY_HANG': ('📦', 'Shipper đã lấy hàng'),
  };

  /// Shipper mua hộ (Phần 3.8): nói rõ ai đang lo đơn để khách yên tâm.
  (String, String)? get _proxyMessage => switch (state) {
        'DANG_TIM_SHIPPER' => ('🔎', 'Quán chưa nhận trên app — đang tìm shipper tới quán mua giúp bạn'),
        'SHIPPER_DA_NHAN' => ('🛵', 'Shipper đã nhận, đang tới quán mua giúp bạn'),
        'SHIPPER_DEN_QUAN' => orderedAtStore ? ('🛵', 'Shipper đã đặt món tại quán, đang chờ món') : ('🛵', 'Shipper đã tới quán, đang đặt món giúp bạn'),
        _ => null,
      };

  /// Bước hiện tại trên thanh tiến trình (0..4).
  int get _step {
    if (parcel) {
      if (state == 'HOAN_THANH') return 4;
      if (['DANG_GIAO', 'DA_DEN_NOI'].contains(state)) return 3;
      if (state == 'DA_LAY_HANG') return 2;
      if (['SHIPPER_DA_NHAN', 'SHIPPER_DEN_QUAN'].contains(state)) return 1;
      return 0;
    }
    // Mua hộ: quán chưa nhận trên app, nên chưa tô bước "Quán nhận" khi còn đang tìm shipper.
    if (proxy && ['DANG_TIM_SHIPPER', 'CAN_CAN_THIEP'].contains(state)) return 0;
    if (state == 'HOAN_THANH') return 4;
    if (['DA_LAY_HANG', 'DANG_GIAO', 'DA_DEN_NOI', 'CHO_KHACH_DEN_LAY'].contains(state)) return 3;
    if (['SHIPPER_DA_NHAN', 'SHIPPER_DEN_QUAN', 'HEN_SHIPPER_DA_GIU', 'HEN_SAN_SANG'].contains(state)) return 2;
    if (['QUAN_DA_NHAN', 'DANG_TIM_SHIPPER', 'CAN_CAN_THIEP', 'HEN_QUAN_DA_NHAN', 'HEN_TREN_CHO_CHUYEN'].contains(state)) return 1;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final color = stateColor(state);
    final msg = _special ?? (proxy ? _proxyMessage : null) ?? (parcel ? _parcelMessages[state] : null) ?? _messages[state] ?? (state.startsWith('HEN_') ? ('🟣', 'Đơn hẹn giờ — chúng tôi nhắc quán & shipper đúng giờ') : ('📦', ''));
    final ended = state == 'DA_HUY' || state == 'GIAO_THAT_BAI';
    final labels = parcel
        ? ['Đặt', 'Shipper nhận', 'Lấy hàng', 'Đang giao', 'Đã giao']
        : selfPickup
            ? ['Đặt', 'Quán nhận', 'Chuẩn bị', 'Sẵn sàng', 'Đã lấy']
            : ['Đặt', 'Quán nhận', 'Shipper nhận', 'Đang giao', 'Đã giao'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color.withValues(alpha: 0.16), color.withValues(alpha: 0.05)]),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          StatusAnimation(state: state, emoji: msg.$1, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              StateChip(state),
              const SizedBox(height: 4),
              Text(msg.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              if (!ended && state != 'HOAN_THANH') ElapsedText(since: since),
              if (state == 'CHO_QUAN_XAC_NHAN' && proxyAllowed)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text('Nếu quán chưa phản hồi, chúng tôi sẽ nhờ shipper tới quán mua giúp bạn.', style: TextStyle(fontSize: 12.5)),
                ),
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

/// Sao chép đơn để gửi thẳng cho quán qua Zalo/SMS (VD quán chưa thấy đơn trên app) — có tên + SĐT người đặt.
class _SendToStoreCard extends StatelessWidget {
  const _SendToStoreCard({required this.order});
  final Map<String, dynamic> order;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: orderText(order)));
    if (context.mounted) showDone(context, 'Đã sao chép đơn — dán vào Zalo/tin nhắn gửi quán');
  }

  @override
  Widget build(BuildContext context) {
    final storePhone = (order['contacts'] as Map?)?['store'] as String?;
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('📤 Gửi đơn cho quán', style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          const Text('Sao chép nội dung đơn (món, ghi chú, địa chỉ, SĐT của bạn) để gửi thẳng cho quán.', style: TextStyle(fontSize: 12.5)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton.tonalIcon(key: const Key('copy-order'), onPressed: () => _copy(context), icon: const Icon(Icons.copy), label: const Text('Sao chép đơn')),
            if (storePhone != null) ...[
              OutlinedButton.icon(
                onPressed: () async {
                  // Zalo không cho điền sẵn nội dung: sao chép trước rồi mở Zalo của quán để dán.
                  await _copy(context);
                  await openZalo(storePhone);
                },
                icon: const Icon(Icons.chat_outlined),
                label: const Text('Zalo quán'),
              ),
              OutlinedButton.icon(onPressed: () => openSms(storePhone, orderText(order)), icon: const Icon(Icons.sms_outlined), label: const Text('SMS quán')),
            ],
          ]),
        ]),
      ),
    );
  }
}

