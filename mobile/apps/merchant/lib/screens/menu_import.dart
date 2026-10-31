import 'package:flutter/material.dart';
import 'package:sqt_core/sqt_core.dart';

/// Nhập menu nhanh từ danh sách chữ (Phần 2.2.2, 12.3-6): dán → xem nháp → chọn món để thêm. Không tự đăng.
class MenuImportScreen extends StatefulWidget {
  const MenuImportScreen({super.key, required this.api, required this.storeId});
  final ApiClient api;
  final int storeId;

  @override
  State<MenuImportScreen> createState() => _MenuImportScreenState();
}

class _MenuImportScreenState extends State<MenuImportScreen> {
  final _text = TextEditingController();
  List<Map<String, dynamic>>? _draft;
  String? _source;
  final _selected = <int>{};
  bool _busy = false;

  Future<void> _parse() async {
    setState(() => _busy = true);
    try {
      final res = await widget.api.post('/v1/merchant/stores/${widget.storeId}/menu/import-text', {'text': _text.text});
      setState(() {
        _draft = (res['items'] as List).cast<Map<String, dynamic>>();
        _source = res['source'] as String;
        _selected
          ..clear()
          ..addAll(List.generate(_draft!.length, (i) => i));
      });
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      for (final i in _selected) {
        final d = _draft![i];
        await widget.api.post('/v1/merchant/stores/${widget.storeId}/menu-items', {
          'name': d['name'],
          'price': d['price'],
          if (d['section'] != null) 'section': d['section'],
        });
      }
      if (!mounted) return;
      showDone(context, 'Đã thêm ${_selected.length} món');
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nhập menu nhanh')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Dán hoặc gõ danh sách món, mỗi món kèm giá. VD: "Cơm sườn 35k, Cơm gà 40k"'),
        const SizedBox(height: 8),
        TextField(controller: _text, minLines: 4, maxLines: 10, decoration: const InputDecoration(hintText: 'Món chính:\nCơm sườn 35k\nCơm gà 40k')),
        const SizedBox(height: 8),
        FilledButton(onPressed: _busy ? null : _parse, child: const Text('Đọc danh sách')),
        if (_draft != null) ...[
          const SizedBox(height: 12),
          Text(_source == 'AI' ? '✨ Gợi ý bởi AI — vui lòng kiểm tra từng món' : 'Đã đọc theo quy tắc — vui lòng kiểm tra từng món'),
          for (var i = 0; i < _draft!.length; i++)
            CheckboxListTile(
              value: _selected.contains(i),
              onChanged: (v) => setState(() => v == true ? _selected.add(i) : _selected.remove(i)),
              title: Text('${_draft![i]['name']} · ${money(_draft![i]['price'] as num)}'),
              subtitle: _draft![i]['section'] != null ? Text(_draft![i]['section'] as String) : null,
            ),
          FilledButton(onPressed: _busy || _selected.isEmpty ? null : _save, child: Text('Thêm ${_selected.length} món vào menu')),
        ],
      ]),
    );
  }
}
