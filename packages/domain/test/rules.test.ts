import {
  NoteValidationError,
  OrderState,
  computeDeliveryFee,
  computeSubtotal,
  decideCustomerCancellation,
  sanitizeItemNote,
} from '../src';

describe('phí ship (Phần 4.1)', () => {
  it('≤ 2 km tính phí tối thiểu', () => {
    expect(computeDeliveryFee(0.4)).toBe(15_000);
    expect(computeDeliveryFee(2)).toBe(15_000);
  });

  it('mỗi km tiếp theo (làm tròn lên) cộng 4.000đ', () => {
    expect(computeDeliveryFee(2.1)).toBe(19_000);
    expect(computeDeliveryFee(4.6)).toBe(27_000);
  });

  it('hệ số cao điểm bị chặn trần và làm tròn lên 1.000đ', () => {
    expect(computeDeliveryFee(2, { surgeMultiplier: 1.2 })).toBe(18_000);
    expect(computeDeliveryFee(2, { surgeMultiplier: 3 })).toBe(23_000); // trần 1,5 → 22.500 → 23.000
  });

  it('phụ phí và trợ giá', () => {
    expect(computeDeliveryFee(1, { surcharges: [5_000], promoSubsidy: 10_000 })).toBe(10_000);
    expect(computeDeliveryFee(1, { promoSubsidy: 50_000 })).toBe(0);
  });

  it('từ chối quãng đường không hợp lệ', () => {
    expect(() => computeDeliveryFee(-1)).toThrow(RangeError);
  });

  it('tạm tính là tổng số nguyên', () => {
    expect(computeSubtotal([{ unitPrice: 35_000, quantity: 2 }, { unitPrice: 5_000, quantity: 1 }])).toBe(75_000);
    expect(() => computeSubtotal([{ unitPrice: 1.5, quantity: 1 }])).toThrow(RangeError);
  });
});

describe('ghi chú từng món (Phần 2.1.4a)', () => {
  it('ẩn số điện thoại và đường link, gộp khoảng trắng', () => {
    const r = sanitizeItemNote({ note: '  ít  đá, gọi 0901 234 567 hoặc xem https://x.vn  ' });
    expect(r.note).toBe('ít đá, gọi [đã ẩn] hoặc xem [đã ẩn]');
  });

  it('giới hạn 150 ký tự', () => {
    expect(() => sanitizeItemNote({ note: 'a'.repeat(151) })).toThrow(NoteValidationError);
  });

  it('bỏ trùng chip, kiểm tra mã dị ứng', () => {
    expect(sanitizeItemNote({ tags: ['Không hành', 'Không hành', ' '], allergens: ['PEANUT'] })).toEqual({
      note: null,
      tags: ['Không hành'],
      allergens: ['PEANUT'],
    });
    expect(() => sanitizeItemNote({ allergens: ['TOMATO'] })).toThrow(/Dị ứng/);
  });

  it('món tắt ghi chú: từ chối ghi chú nhưng vẫn nhận khai báo dị ứng', () => {
    expect(() => sanitizeItemNote({ note: 'không cay' }, { notesDisabled: true })).toThrow(/không nhận ghi chú/);
    expect(sanitizeItemNote({ allergens: ['MILK'] }, { notesDisabled: true }).allergens).toEqual(['MILK']);
  });
});

describe('chính sách huỷ của khách (Phần 3.5, 10.2)', () => {
  const base = { prepStarted: false, secondsSinceAccepted: null, freeCancellationsUsedThisMonth: 0 };

  it('trước khi quán nhận: hoàn toàn bộ', () => {
    expect(decideCustomerCancellation({ ...base, state: OrderState.CHO_QUAN_XAC_NHAN }).refund).toBe('FULL');
  });

  it('trong 2 phút sau khi quán nhận và chưa làm: miễn phí, tính 1 lượt', () => {
    const d = decideCustomerCancellation({ ...base, state: OrderState.QUAN_DA_NHAN, secondsSinceAccepted: 60 });
    expect(d).toMatchObject({ refund: 'FULL', countsAsFreeCancellation: true });
  });

  it('hết lượt miễn phí hoặc quán đã làm: giữ tiền món', () => {
    expect(
      decideCustomerCancellation({
        ...base,
        state: OrderState.QUAN_DA_NHAN,
        secondsSinceAccepted: 60,
        freeCancellationsUsedThisMonth: 3,
      }).refund,
    ).toBe('EXCEPT_ITEMS');
    expect(
      decideCustomerCancellation({ ...base, state: OrderState.DANG_TIM_SHIPPER, prepStarted: true, secondsSinceAccepted: 30 })
        .refund,
    ).toBe('EXCEPT_ITEMS');
  });

  it('shipper đã tới quán: giữ thêm phí ship', () => {
    expect(
      decideCustomerCancellation({ ...base, state: OrderState.SHIPPER_DEN_QUAN, prepStarted: true, secondsSinceAccepted: 600 })
        .refund,
    ).toBe('EXCEPT_ITEMS_AND_DELIVERY');
  });

  it('sau khi shipper lấy hàng: không huỷ được', () => {
    expect(decideCustomerCancellation({ ...base, state: OrderState.DANG_GIAO }).allowed).toBe(false);
  });

  it('đơn hẹn: miễn phí khi còn ≥ 30 phút và quán chưa làm', () => {
    expect(
      decideCustomerCancellation({ ...base, state: OrderState.HEN_SHIPPER_DA_GIU, secondsUntilSlot: 3600 }).refund,
    ).toBe('FULL');
    expect(
      decideCustomerCancellation({ ...base, state: OrderState.HEN_SHIPPER_DA_GIU, secondsUntilSlot: 600 }).refund,
    ).toBe('EXCEPT_ITEMS');
  });
});
