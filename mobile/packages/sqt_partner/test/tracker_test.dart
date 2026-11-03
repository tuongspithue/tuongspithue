import 'package:flutter_test/flutter_test.dart';
import 'package:sqt_partner/src/tracker.dart';

void expectDiff(({List<int> ring, List<int> stop}) d, {required List<int> ring, required List<int> stop}) {
  expect(d.ring, ring);
  expect(d.stop, stop);
}

void main() {
  test('kêu chuông khi có đơn mới, không kêu lại đơn cũ, tắt khi đơn đã được xử lý', () {
    final t = AlertTracker();
    expectDiff(t.update([1, 2]), ring: [1, 2], stop: <int>[]);
    expectDiff(t.update([1, 2, 3]), ring: [3], stop: <int>[]);
    expect(t.ringing, 3);
    expectDiff(t.update([3]), ring: <int>[], stop: [1, 2]);
    expectDiff(t.update([]), ring: <int>[], stop: [3]);
    expect(t.ringing, 0);
  });

  test('chỉ đơn đang chờ quán nhận mới làm kêu chuông', () {
    final orders = [
      {'id': 1, 'state': 'CHO_QUAN_XAC_NHAN'},
      {'id': 2, 'state': 'DANG_TIM_SHIPPER'},
      {'id': 3, 'state': 'HEN_CHO_QUAN_NHAN'},
      {'id': 4, 'state': 'HOAN_THANH'},
    ];
    expect(merchantPending(orders), [1, 3]);
    expect(riderPending([{'id': 9}]), [9]);
  });
}
