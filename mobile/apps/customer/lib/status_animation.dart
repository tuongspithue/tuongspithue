import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

/// Hình động cho biết đơn đang ở bước nào, để người đặt yên tâm là hệ thống đang làm việc (Phần 9.6):
///  - đợi quán: sóng lan ra quanh biểu tượng quán
///  - tìm shipper: radar quét
///  - shipper tới quán / đang giao: xe chạy nhún nhảy trên đường
///  - quán đang làm: biểu tượng lắc nhẹ
class StatusAnimation extends StatefulWidget {
  const StatusAnimation({super.key, required this.state, required this.emoji, required this.color});
  final String state;
  final String emoji;
  final Color color;

  @override
  State<StatusAnimation> createState() => _StatusAnimationState();
}

enum _Kind { ripple, radar, ride, wobble, still }

class _StatusAnimationState extends State<StatusAnimation> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  _Kind get _kind {
    final s = widget.state;
    if (['CHO_QUAN_XAC_NHAN', 'HEN_CHO_QUAN_NHAN', 'CHO_THANH_TOAN', 'HEN_CHO_KHACH_DUYET_GIO'].contains(s)) return _Kind.ripple;
    if (['DANG_TIM_SHIPPER', 'CAN_CAN_THIEP', 'HEN_TREN_CHO_CHUYEN'].contains(s)) return _Kind.radar;
    if (['SHIPPER_DA_NHAN', 'SHIPPER_DEN_QUAN', 'DA_LAY_HANG', 'DANG_GIAO', 'DA_DEN_NOI'].contains(s)) return _Kind.ride;
    if (['QUAN_DA_NHAN', 'HEN_QUAN_DA_NHAN', 'CHO_KHACH_DEN_LAY'].contains(s)) return _Kind.wobble;
    return _Kind.still;
  }

  @override
  Widget build(BuildContext context) {
    final kind = _kind;
    final emoji = Text(widget.emoji, style: const TextStyle(fontSize: 34));
    return SizedBox(
      width: 76,
      height: 76,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          switch (kind) {
            case _Kind.ripple:
              return CustomPaint(painter: _RipplePainter(t, widget.color), child: Center(child: emoji));
            case _Kind.radar:
              return CustomPaint(painter: _RadarPainter(t, widget.color), child: Center(child: emoji));
            case _Kind.ride:
              // Xe chạy qua lại và nhún nhảy như đang đi trên đường.
              return Stack(alignment: Alignment.center, children: [
                Positioned(bottom: 14, left: 6, right: 6, child: Container(height: 3, decoration: BoxDecoration(color: widget.color.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(2)))),
                Transform.translate(offset: Offset(sin(t * 2 * pi) * 10, -(sin(t * 4 * pi).abs()) * 4), child: emoji),
              ]);
            case _Kind.wobble:
              return Center(child: Transform.rotate(angle: sin(t * 2 * pi) * 0.12, child: emoji));
            case _Kind.still:
              return Center(child: emoji);
          }
        },
      ),
    );
  }
}

class _RipplePainter extends CustomPainter {
  _RipplePainter(this.t, this.color);
  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final maxR = size.shortestSide / 2;
    for (var i = 0; i < 3; i++) {
      final p = (t + i / 3) % 1;
      canvas.drawCircle(c, maxR * (0.35 + 0.65 * p), Paint()..color = color.withValues(alpha: (1 - p) * 0.45)..style = PaintingStyle.stroke..strokeWidth = 3);
    }
    canvas.drawCircle(c, maxR * 0.42, Paint()..color = color.withValues(alpha: 0.15));
  }

  @override
  bool shouldRepaint(_RipplePainter old) => old.t != t;
}

class _RadarPainter extends CustomPainter {
  _RadarPainter(this.t, this.color);
  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    final ring = Paint()..color = color.withValues(alpha: 0.25)..style = PaintingStyle.stroke..strokeWidth = 1.5;
    canvas.drawCircle(c, r * 0.95, ring);
    canvas.drawCircle(c, r * 0.6, ring);
    final rect = Rect.fromCircle(center: c, radius: r * 0.95);
    final start = t * 2 * pi;
    canvas.drawArc(
      rect,
      start,
      pi / 2.2,
      true,
      Paint()..shader = SweepGradient(startAngle: start, endAngle: start + pi / 2.2, colors: [color.withValues(alpha: 0), color.withValues(alpha: 0.5)], transform: GradientRotation(0)).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_RadarPainter old) => old.t != t;
}

/// "đã chờ 1:05" — đếm từ lúc đơn sang trạng thái hiện tại, tự cập nhật mỗi giây.
class ElapsedText extends StatefulWidget {
  const ElapsedText({super.key, required this.since, this.prefix = 'đã chờ', this.style});
  final DateTime? since;
  final String prefix;
  final TextStyle? style;

  @override
  State<ElapsedText> createState() => _ElapsedTextState();
}

class _ElapsedTextState extends State<ElapsedText> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final since = widget.since;
    if (since == null) return const SizedBox.shrink();
    final s = DateTime.now().difference(since).inSeconds.clamp(0, 359999);
    final text = s < 3600 ? '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}' : '${s ~/ 3600} giờ ${(s % 3600) ~/ 60} phút';
    return Text('${widget.prefix} $text', style: widget.style ?? Theme.of(context).textTheme.bodySmall);
  }
}
