import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import 'cart.dart';
import 'screens/home.dart';

void main() {
  runApp(CustomerApp(api: ApiClient(tokens: PrefsTokenStore('sqt-customer-token'))));
}

/// Vị trí mặc định khi chưa có GPS (trung tâm Quận 1, TP.HCM). Khách đổi được trên trang chủ.
class Place {
  const Place(this.lat, this.lng, this.address);
  final double lat;
  final double lng;
  final String address;
}

const kDefaultPlace = Place(10.7769, 106.7009, 'Quận 1, TP.HCM');

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ship Quanh Tôi',
      debugShowCheckedModeBanner: false,
      theme: sqtTheme(brightness: Brightness.light),
      darkTheme: sqtTheme(brightness: Brightness.dark),
      // Khách dùng ngay trên trình duyệt, không bắt cài đặt.
      home: HomeScreen(api: api, cart: Cart(), openOrderId: int.tryParse(Browser.startOrderId ?? '')),
    );
  }
}

/// Khách xem quán không cần đăng nhập; chỉ hỏi SĐT khi đặt hàng (Phần 2.1.1).
Future<bool> ensureSignedIn(BuildContext context, ApiClient api) async {
  if (api.signedIn || await api.restore()) return true;
  if (!context.mounted) return false;
  final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
    builder: (ctx) => OtpLoginScreen(api: api, title: 'Nhập số điện thoại để đặt hàng', onSignedIn: () => Navigator.of(ctx).pop(true)),
  ));
  return ok ?? false;
}
