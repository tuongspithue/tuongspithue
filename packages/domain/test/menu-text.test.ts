import { parseMenuText } from '../src';

describe('đọc menu dạng chữ (không cần AI)', () => {
  it('hiểu nhiều cách ghi giá phổ biến và tên nhóm', () => {
    const items = parseMenuText(`Món chính:
Cơm sườn 35k, Cơm gà 40k
- Phở bò: 55.000đ
Đồ uống:
1. Trà đá - 5000
Sinh tố bơ 25`);
    expect(items).toEqual([
      { section: 'Món chính', name: 'Cơm sườn', price: 35_000 },
      { section: 'Món chính', name: 'Cơm gà', price: 40_000 },
      { section: 'Món chính', name: 'Phở bò', price: 55_000 },
      { section: 'Đồ uống', name: 'Trà đá', price: 5_000 },
      { section: 'Đồ uống', name: 'Sinh tố bơ', price: 25_000 },
    ]);
  });

  it('bỏ qua dòng không có giá', () => {
    expect(parseMenuText('Quán mở cửa 6h sáng\nBánh mì thịt 20k')).toEqual([{ section: null, name: 'Bánh mì thịt', price: 20_000 }]);
  });
});
