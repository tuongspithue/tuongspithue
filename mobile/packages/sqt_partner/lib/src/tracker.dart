/// Quyết định khi nào kêu chuông và khi nào tắt — tách riêng để test được.
class AlertTracker {
  final _rung = <int>{};

  /// [pending]: id các đơn/lời mời đang chờ người này xử lý (đơn mới của quán, lời mời chuyến của shipper).
  /// Trả về id cần kêu chuông (mới xuất hiện) và id cần tắt chuông (đã được xử lý hoặc hết hạn).
  ({List<int> ring, List<int> stop}) update(Iterable<int> pending) {
    final now = pending.toSet();
    final ring = now.difference(_rung).toList()..sort();
    final stop = _rung.difference(now).toList()..sort();
    _rung
      ..addAll(ring)
      ..removeAll(stop);
    return (ring: ring, stop: stop);
  }

  int get ringing => _rung.length;
}

/// Đơn đang chờ quán nhận (Cổng A).
const kMerchantPendingStates = {'CHO_QUAN_XAC_NHAN', 'HEN_CHO_QUAN_NHAN'};

List<int> merchantPending(List<dynamic> orders) =>
    [for (final o in orders) if (kMerchantPendingStates.contains(o['state'])) o['id'] as int];

List<int> riderPending(List<dynamic> offers) => [for (final o in offers) o['id'] as int];
