import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';
import 'package:sqt_partner/sqt_partner.dart';

import 'screens/board.dart';

void main() {
  runApp(MerchantApp(api: ApiClient(tokens: PrefsTokenStore(kMerchantTokenKey))));
}

/// App quán — chữ to, nút lớn cho người lớn tuổi (Phần 7.1, 9.5).
class MerchantApp extends StatelessWidget {
  const MerchantApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SQT Đối Tác',
      debugShowCheckedModeBanner: false,
      theme: sqtTheme(brightness: Brightness.light, large: true),
      darkTheme: sqtTheme(brightness: Brightness.dark, large: true),
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
  List<dynamic>? _stores;

  @override
  void initState() {
    super.initState();
    widget.api.restore().then((ok) {
      setState(() => _signedIn = ok);
      if (ok) _loadStores();
    });
  }

  Future<void> _loadStores() async {
    try {
      final res = await widget.api.get('/v1/merchant/stores');
      setState(() => _stores = res['stores'] as List);
    } on ApiException catch (e) {
      if (e.status == 401) setState(() => _signedIn = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_signedIn == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_signedIn == false) {
      return PartnerSignInScreen(
        api: widget.api,
        title: 'SQT Đối Tác — đăng nhập quán',
        onSignedIn: () {
          setState(() => _signedIn = true);
          _loadStores();
        },
        onApply: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PartnerApplyScreen(api: widget.api, kind: PartnerKind.merchant))),
      );
    }
    final stores = _stores;
    if (stores == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (stores.isEmpty) {
      return const Scaffold(body: Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Tài khoản chưa có quán. Hãy đăng xuất và bấm "Đăng ký đối tác", hoặc liên hệ Admin.', textAlign: TextAlign.center))));
    }
    if (stores.length == 1) return BoardScreen(api: widget.api, store: stores.first as Map<String, dynamic>);
    return Scaffold(
      appBar: AppBar(title: const Text('Chọn quán')),
      body: ListView(children: [
        for (final s in stores)
          ListTile(
            title: Text(s['name'] as String),
            subtitle: Text(s['address'] as String),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BoardScreen(api: widget.api, store: s as Map<String, dynamic>))),
          ),
      ]),
    );
  }
}
