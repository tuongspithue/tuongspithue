import 'dart:math';

import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

/// Ngành hàng: tên, biểu tượng, màu — dùng chung trang chủ, thẻ quán, trang quán (Phần 9.2).
class CategoryMeta {
  const CategoryMeta(this.label, this.emoji, this.color);
  final String label;
  final String emoji;
  final Color color;
}

const kCategoryMeta = <String, CategoryMeta>{
  'FOOD': CategoryMeta('Đồ ăn', '🍜', Color(0xFFFF6B2C)),
  'DRINK': CategoryMeta('Đồ uống', '🧋', Color(0xFF8B5CF6)),
  'GROCERY': CategoryMeta('Tạp hoá', '🛒', Color(0xFF0EA5E9)),
  'WATER_ICE': CategoryMeta('Nước, đá', '💧', Color(0xFF14B8A6)),
  'MOM_BABY': CategoryMeta('Mẹ & bé', '🍼', Color(0xFFEC4899)),
};

CategoryMeta categoryOf(String? code) => kCategoryMeta[code] ?? const CategoryMeta('Cửa hàng', '🏪', SqtColors.primary);

/// Khoảng cách đường chim bay (m) — để ước thời gian giao khi API không trả sẵn.
int distanceM(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double rad(double d) => d * pi / 180;
  final a = pow(sin(rad(lat2 - lat1) / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(rad(lng2 - lng1) / 2), 2);
  return (2 * r * asin(sqrt(a))).round();
}

/// Thời gian đến tay ước tính: chuẩn bị + di chuyển (~250 m/phút trong phố) + 5 phút lấy/giao (Phần 1.2 "siêu gần").
int etaMinutes(int prepMin, int distM) => prepMin + (distM / 250).ceil() + 5;

String distanceText(int m) => m < 1000 ? '$m m' : '${(m / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';

/// Ảnh đại diện quán: ô màu theo ngành, biểu tượng lớn (chưa có ảnh thật ở MVP).
class StoreThumb extends StatelessWidget {
  const StoreThumb({super.key, required this.category, this.size = 72, this.radius = 18});
  final String? category;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = categoryOf(category);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c.color.withValues(alpha: 0.18), c.color.withValues(alpha: 0.42)]),
      ),
      alignment: Alignment.center,
      child: Text(c.emoji, style: TextStyle(fontSize: size * 0.46)),
    );
  }
}

/// Nhãn nhỏ có biểu tượng: khoảng cách, thời gian, đánh giá…
class InfoPill extends StatelessWidget {
  const InfoPill({super.key, this.icon, required this.text, this.color});
  final IconData? icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 14, color: c), const SizedBox(width: 4)],
        Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c)),
      ]),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
        child: Row(children: [
          Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
          if (trailing != null) trailing!,
        ]),
      );
}

/// Khối xám nhấp nháy khi đang tải (thay vòng xoay — Phần 9.6).
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 96});
  final double height;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: 0.45, end: 1.0).animate(_c),
        child: Container(
          height: widget.height,
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(20)),
        ),
      );
}

/// Thanh giỏ hàng nổi ở đáy màn hình.
class CartBar extends StatelessWidget {
  const CartBar({super.key, required this.count, required this.total, required this.onTap, this.label = 'Xem giỏ hàng', this.buttonKey});
  final int count;
  final int total;
  final VoidCallback onTap;
  final String label;
  final Key? buttonKey;

  @override
  Widget build(BuildContext context) => SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Material(
          color: SqtColors.primary,
          borderRadius: BorderRadius.circular(20),
          elevation: 6,
          shadowColor: SqtColors.primary.withValues(alpha: 0.5),
          child: InkWell(
            key: buttonKey,
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(999)),
                  child: Text('$count', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16))),
                Text(money(total), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, color: Colors.white),
              ]),
            ),
          ),
        ),
      );
}
