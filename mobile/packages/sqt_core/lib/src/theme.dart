import 'package:flutter/material.dart';

/// Màu theo ý nghĩa — Phần 9.2. Trạng thái luôn đi kèm biểu tượng + chữ, không chỉ màu.
class SqtColors {
  static const primary = Color(0xFFFF6B2C);
  static const confirmed = Color(0xFF1DB954);
  static const waiting = Color(0xFFFFB020);
  static const scheduled = Color(0xFF7C5CFF);
  static const danger = Color(0xFFE5484D);
}

/// [large] = app quán/shipper: chữ tối thiểu 16, nút ≥ 56 dp (Phần 7.1, 9.9).
ThemeData sqtTheme({required Brightness brightness, bool large = false}) {
  final scheme = ColorScheme.fromSeed(seedColor: SqtColors.primary, brightness: brightness, primary: SqtColors.primary, error: SqtColors.danger);
  final base = ThemeData(colorScheme: scheme, useMaterial3: true, brightness: brightness);
  final minButton = Size(64, large ? 56 : 48);
  return base.copyWith(
    textTheme: large ? base.textTheme.apply(fontSizeFactor: 1.1) : base.textTheme,
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: minButton, shape: const StadiumBorder())),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: minButton, shape: const StadiumBorder())),
    // Nền xám nhạt, thẻ trắng viền mảnh: nhìn sạch, dễ phân khối thông tin (Phần 9.2).
    scaffoldBackgroundColor: brightness == Brightness.light ? const Color(0xFFF5F6F8) : scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: brightness == Brightness.light ? const Color(0xFFF5F6F8) : scheme.surface,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      titleTextStyle: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: scheme.onSurface),
    ),
    cardTheme: CardThemeData(
      margin: const EdgeInsets.symmetric(vertical: 6),
      elevation: 0,
      color: brightness == Brightness.light ? Colors.white : scheme.surfaceContainer,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: const BorderRadius.all(Radius.circular(20)), side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6))),
    ),
    chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder()),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)))),
  );
}

Color stateColor(String state) {
  if (state == 'HOAN_THANH') return SqtColors.confirmed;
  if (state == 'DA_HUY' || state == 'CAN_CAN_THIEP' || state == 'GIAO_THAT_BAI') return SqtColors.danger;
  if (state.startsWith('HEN_')) return SqtColors.scheduled;
  if (state.startsWith('CHO_') || state == 'DANG_TIM_SHIPPER') return SqtColors.waiting;
  return SqtColors.confirmed;
}

IconData stateIcon(String state) {
  if (state == 'HOAN_THANH') return Icons.check_circle;
  if (state == 'DA_HUY' || state == 'GIAO_THAT_BAI') return Icons.cancel;
  if (state == 'CAN_CAN_THIEP') return Icons.support_agent;
  if (state.startsWith('HEN_')) return Icons.schedule;
  if (state.startsWith('CHO_') || state == 'DANG_TIM_SHIPPER') return Icons.hourglass_top;
  return Icons.delivery_dining;
}
