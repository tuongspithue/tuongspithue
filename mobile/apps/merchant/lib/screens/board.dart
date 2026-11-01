import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_partner/sqt_partner.dart';

import 'menu_import.dart';

/// Khoá lưu token đăng nhập; dịch vụ nền đọc cùng khoá này.
const kMerchantTokenKey = 'sqt-merchant-token';

const _newStates = kMerchantPendingStates;
/// Chế độ song song: quán chưa nhận kịp nên đã nhờ shipper tới mua hộ — quán vẫn bấm nhận được (Phần 3.8).
bool proxyPending(Map<String, dynamic> o) => o['fulfillment'] == 'PROXY' && o['acceptedChannel'] == null && !_doneStates.contains(o['state']);

const _doneStates = {'HOAN_THANH', 'DA_HUY', 'HOAN_TRA_QUAN', 'GIAO_THAT_BAI'};

/// Bảng đơn của quán: Mới → Đang làm → Đơn hẹn → Xong (Phần 2.2.3, 9.5 "Chế độ Đơn giản").
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.api, required this.store});
  final ApiClient api;
  final Map<String, dynamic> store;

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> with Polling {
  List<Map<String, dynamic>> _orders = [];
  late bool _open = widget.store['isOpen'] as bool;
  int get _storeId => widget.store['id'] as int;

  @override
  void initState() {
    super.initState();
    startPolling(_load);
    _syncWatcher();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/v1/merchant/stores/$_storeId/orders');
      if (!mounted) return;
      setState(() => _orders = (res['orders'] as List).cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  /// Quán mở cửa thì bật dịch vụ nền: chuông kêu khi có đơn kể cả khi khoá máy (Phần 2.2.3).
  Future<void> _syncWatcher() async {
    try {
      if (_open) {
        await PartnerDevice.instance.startWatching(mode: WatchMode.merchant, tokenKey: kMerchantTokenKey, storeId: _storeId);
      } else {
        await PartnerDevice.instance.stopWatching();
      }
    } catch (_) {
      // Máy không hỗ trợ chạy nền: vẫn dùng được khi mở app.
    }
  }

  Future<void> _toggleOpen(bool v) async {
    try {
      final res = await widget.api.patch('/v1/merchant/stores/$_storeId', {'isOpen': v});
      setState(() => _open = res['isOpen'] as bool);
      await _syncWatcher();
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  List<Map<String, dynamic>> _where(bool Function(Map<String, dynamic>) f) => _orders.where(f).toList();

  @override
  Widget build(BuildContext context) {
    final fresh = _where((o) => _newStates.contains(o['state']) || proxyPending(o));
    final scheduled = _where((o) => o['schedule'] != null && !_newStates.contains(o['state']) && !_doneStates.contains(o['state']) && (o['state'] as String).startsWith('HEN_'));
    final working = _where((o) => !_newStates.contains(o['state']) && !proxyPending(o) && !_doneStates.contains(o['state']) && !(o['state'] as String).startsWith('HEN_'));
    final done = _where((o) => _doneStates.contains(o['state']));
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.store['name'] as String),
          actions: [
            IconButton(
              tooltip: 'Nhập menu nhanh',
              icon: const Icon(Icons.playlist_add),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MenuImportScreen(api: widget.api, storeId: _storeId))),
            ),
            Text(_open ? 'Đang mở' : 'Đóng cửa'),
            Switch(value: _open, onChanged: _toggleOpen),
          ],
          bottom: TabBar(isScrollable: true, tabs: [
            Tab(text: '🔔 Mới (${fresh.length})'),
            Tab(text: 'Đang làm (${working.length})'),
            Tab(text: '🟣 Đơn hẹn (${scheduled.length})'),
            const Tab(text: 'Xong'),
          ]),
        ),
        body: Column(children: [
          Material(
            color: _open ? SqtColors.confirmed.withValues(alpha: 0.12) : SqtColors.waiting.withValues(alpha: 0.15),
            child: ListTile(
              dense: true,
              leading: Icon(_open ? Icons.notifications_active : Icons.notifications_off),
              title: Text(_open ? 'Chuông đơn mới đang bật — vẫn kêu khi khoá máy' : 'Quán đang đóng — không nhận đơn mới'),
              trailing: TextButton(
                onPressed: () => PartnerDevice.instance.openDeviceCheck(context, needsBackgroundLocation: false),
                child: const Text('Kiểm tra máy'),
              ),
            ),
          ),
          Expanded(child: TabBarView(children: [
          for (final list in [fresh, working, scheduled, done])
            RefreshIndicator(
              onRefresh: _load,
              child: list.isEmpty
                  ? ListView(children: const [Padding(padding: EdgeInsets.all(48), child: Text('Chưa có đơn', textAlign: TextAlign.center))])
                  : ListView(padding: const EdgeInsets.all(12), children: [for (final o in list) OrderCard(api: widget.api, order: o, onChanged: _load)]),
            ),
          ])),
        ]),
      ),
    );
  }
}

/// Thẻ đơn với nút hành động lớn. Đơn có dị ứng bắt buộc tick "Đã đọc ghi chú dị ứng".
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.api, required this.order, required this.onChanged});
  final ApiClient api;
  final Map<String, dynamic> order;
  final Future<void> Function() onChanged;

  int get _id => order['id'] as int;

  Future<void> _run(BuildContext context, Future<dynamic> Function() action, String done) async {
    try {
      await action();
      if (context.mounted) showDone(context, done);
      await onChanged();
    } on ApiException catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  Future<void> _accept(BuildContext context) async {
    final result = await showDialog<(int, bool)>(context: context, builder: (_) => AcceptDialog(hasAllergens: order['hasAllergens'] as bool));
    if (result == null || !context.mounted) return;
    await _run(context, () => api.post('/v1/merchant/orders/$_id/accept', {'prepTimeMin': result.$1, 'allergyAck': result.$2}), 'Đã nhận đơn');
  }

  Future<void> _reject(BuildContext context) async {
    const reasons = ['Hết hàng', 'Quán quá tải', 'Sắp đóng cửa', 'Ngoài khu vực giao'];
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(title: const Text('Lý do từ chối'), children: [
        for (final r in reasons) SimpleDialogOption(onPressed: () => Navigator.pop(ctx, r), child: Padding(padding: const EdgeInsets.all(8), child: Text(r))),
      ]),
    );
    if (reason == null || !context.mounted) return;
    await _run(context, () => api.post('/v1/merchant/orders/$_id/reject', {'reason': reason}), 'Đã từ chối đơn');
  }

  Future<void> _handover(BuildContext context) async {
    final code = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Khách đọc mã đơn'),
        content: TextField(controller: code, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(hintText: 'SQT-XXXXXX')),
        actions: [FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Giao cho khách'))],
      ),
    );
    if (ok != true || !context.mounted) return;
    await _run(context, () => api.post('/v1/merchant/orders/$_id/handover', {'code': code.text}), 'Đã giao cho khách');
  }

  @override
  Widget build(BuildContext context) {
    final state = order['state'] as String;
    final schedule = order['schedule'] as Map<String, dynamic>?;
    final pendingProxy = proxyPending(order);
    final isNew = _newStates.contains(state) || pendingProxy;
    final buyer = (order['buyer'] as Map?) ?? const {};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(order['code'] as String, style: Theme.of(context).textTheme.titleMedium)),
            StateChip(state),
          ]),
          if (schedule != null) Text('🟣 Lấy hàng lúc ${hhmm(schedule['pickupAt'] as String?)}', style: const TextStyle(color: SqtColors.scheduled, fontWeight: FontWeight.bold)),
          Text('${money(order['total'] as num)} · ${order['paymentMethod']} · ${order['customerName'] ?? 'Khách'} ✔ ${order['customerCompletedOrders'] ?? 0} đơn'),
          // Khách đặt không cần mã xác minh: khách mới thì quán gọi xác nhận trước khi làm món (Phần 13.9).
          if (isNew && (order['customerCompletedOrders'] ?? 0) == 0)
            const Text('🆕 Khách mới — bấm Gọi để xác nhận đơn trước khi nhận', style: TextStyle(color: SqtColors.danger, fontWeight: FontWeight.bold)),
          if (pendingProxy)
            Container(
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: SqtColors.scheduled.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: const Text('🛵 Quán chưa nhận kịp nên shipper đang tới quán đặt món trực tiếp. Bấm NHẬN ĐƠN nếu quán làm kịp — shipper sẽ chỉ việc lấy món.'),
            ),
          if (order['fulfillment'] == 'PROXY' && order['acceptedChannel'] == 'RIDER_PROXY')
            const Text('🛒 Shipper đã đặt món trực tiếp tại quầy', style: TextStyle(color: SqtColors.scheduled, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          OrderItemsView(order),
          // Tên + SĐT người đặt để quán liên lạc và ghi lên túi hàng.
          ContactButtons(label: 'Người đặt ${buyer['name'] ?? ''}'.trim(), phone: (order['contacts'] as Map?)?['customer'] as String? ?? buyer['phone'] as String?),
          ContactButtons(label: 'Shipper', phone: (order['contacts'] as Map?)?['rider'] as String?),
          const SizedBox(height: 8),
          if (isNew)
            Row(children: [
              if (!pendingProxy) ...[
                Expanded(child: OutlinedButton(onPressed: () => _reject(context), child: const Text('✖ Từ chối'))),
                const SizedBox(width: 8),
              ],
              Expanded(flex: 2, child: FilledButton(key: Key('accept-$_id'), onPressed: () => _accept(context), child: const Text('✅ NHẬN ĐƠN'))),
            ]),
          if (order['prepState'] == 'PREPARING' && order['fulfillment'] != 'PROXY' && !_doneStates.contains(state))
            FilledButton(onPressed: () => _run(context, () => api.post('/v1/merchant/orders/$_id/ready'), 'Đã báo món xong'), child: const Text('🍜 XONG MÓN')),
          if (state == 'CHO_KHACH_DEN_LAY') OutlinedButton(onPressed: () => _handover(context), child: const Text('Khách đến lấy — nhập mã đơn')),
          if (schedule != null && schedule['merchantReconfirmed'] == false && state.startsWith('HEN_') && !isNew && state != 'HEN_CHO_KHACH_DUYET_GIO')
            OutlinedButton(onPressed: () => _run(context, () => api.post('/v1/merchant/orders/$_id/reconfirm'), 'Đã xác nhận vẫn làm đơn hẹn'), child: const Text('Vẫn làm đơn hẹn này ✔')),
        ]),
      ),
    );
  }
}

/// Chọn thời gian chuẩn bị; đơn có dị ứng phải tick xác nhận đã đọc (Phần 2.1.4a, 3.3).
class AcceptDialog extends StatefulWidget {
  const AcceptDialog({super.key, required this.hasAllergens});
  final bool hasAllergens;

  @override
  State<AcceptDialog> createState() => _AcceptDialogState();
}

class _AcceptDialogState extends State<AcceptDialog> {
  int _prep = 15;
  bool _ack = false;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nhận đơn'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Món xong sau khoảng'),
        Wrap(spacing: 8, children: [
          for (final m in [5, 10, 15, 20, 30]) ChoiceChip(label: Text('$m phút'), selected: _prep == m, onSelected: (_) => setState(() => _prep = m)),
        ]),
        if (widget.hasAllergens)
          CheckboxListTile(
            key: const Key('allergy-ack'),
            contentPadding: EdgeInsets.zero,
            value: _ack,
            onChanged: (v) => setState(() => _ack = v ?? false),
            title: const Text('⚠ Tôi đã đọc ghi chú dị ứng và làm được', style: TextStyle(color: SqtColors.danger, fontWeight: FontWeight.bold)),
          ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Quay lại')),
        FilledButton(
          key: const Key('confirm-accept'),
          onPressed: widget.hasAllergens && !_ack ? null : () => Navigator.pop(context, (_prep, _ack)),
          child: const Text('Nhận đơn'),
        ),
      ],
    );
  }
}
