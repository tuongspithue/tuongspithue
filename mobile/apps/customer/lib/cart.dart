import 'package:flutter/foundation.dart';

/// Một dòng giỏ hàng. Cùng món nhưng ghi chú khác nhau là hai dòng riêng (Phần 2.1.4a).
class CartLine {
  CartLine({required this.itemId, required this.name, required this.price, this.quantity = 1, this.noteTags = const [], this.note, this.allergens = const []});

  final int itemId;
  final String name;
  final int price;
  int quantity;
  final List<String> noteTags;
  final String? note;
  final List<String> allergens;

  bool sameChoice(CartLine o) =>
      o.itemId == itemId && listEquals(o.noteTags, noteTags) && o.note == note && listEquals(o.allergens, allergens);

  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'quantity': quantity,
        if (noteTags.isNotEmpty) 'noteTags': noteTags,
        if (note != null && note!.trim().isNotEmpty) 'note': note,
        if (allergens.isNotEmpty) 'allergens': allergens,
      };
}

/// Giỏ hàng của một quán (MVP: mỗi giỏ thuộc 1 quán — Phần 2.1.5).
class Cart extends ChangeNotifier {
  int? storeId;
  String? storeName;
  final List<CartLine> lines = [];

  int get count => lines.fold(0, (s, l) => s + l.quantity);
  int get subtotal => lines.fold(0, (s, l) => s + l.price * l.quantity);

  /// Thêm món; nếu đang có giỏ của quán khác thì xoá giỏ cũ.
  void add(int storeId, String storeName, CartLine line) {
    if (this.storeId != storeId) {
      lines.clear();
      this.storeId = storeId;
      this.storeName = storeName;
    }
    final same = lines.where(line.sameChoice).firstOrNull;
    if (same != null) {
      same.quantity += line.quantity;
    } else {
      lines.add(line);
    }
    notifyListeners();
  }

  void changeQuantity(CartLine line, int delta) {
    line.quantity += delta;
    if (line.quantity <= 0) lines.remove(line);
    notifyListeners();
  }

  void clear() {
    lines.clear();
    storeId = null;
    storeName = null;
    notifyListeners();
  }
}
