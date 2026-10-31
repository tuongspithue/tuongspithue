import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

import 'screens/home.dart';

void main() {
  runApp(RiderApp(api: ApiClient(tokens: PrefsTokenStore(kRiderTokenKey))));
}

/// App tài xế — nút lớn ở nửa dưới màn hình, dùng được một tay (Phần 7.1, 9.5).
class RiderApp extends StatelessWidget {
  const RiderApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SQT Tài Xế',
      debugShowCheckedModeBanner: false,
      theme: sqtTheme(brightness: Brightness.light, large: true),
      darkTheme: sqtTheme(brightness: Brightness.dark, large: true),
      themeMode: ThemeMode.system,
      home: _Gate(api: api),
    );
  }
}

class _Gate extends StatefulWidget {
  const _Gate({required this.api});
  final ApiClient api;

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  bool? _signedIn;

  @override
  void initState() {
    super.initState();
    widget.api.restore().then((ok) => setState(() => _signedIn = ok));
  }

  @override
  Widget build(BuildContext context) {
    if (_signedIn == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_signedIn == false) {
      return OtpLoginScreen(api: widget.api, title: 'SQT Tài Xế — đăng nhập', onSignedIn: () => setState(() => _signedIn = true));
    }
    return RiderHome(api: widget.api);
  }
}
