import {
  ActorRole,
  GATE_A_EVENTS,
  GATE_B_EVENTS,
  OrderEvent,
  OrderEvent as E,
  OrderState,
  OrderState as S,
  TERMINAL_STATES,
  TransitionError,
  canTransition,
  listRules,
  transition,
} from '../src';

const A = ActorRole;

function run(steps: Array<[OrderEvent, ActorRole, object?]>, start: OrderState): OrderState {
  return steps.reduce<OrderState>((state, [event, actor, ctx]) => transition(state, event, actor, ctx).to, start);
}

describe('máy trạng thái đơn — luồng chuẩn', () => {
  it('đơn ngay COD đi hết tới HOAN_THANH', () => {
    const end = run(
      [
        [E.MERCHANT_ACCEPT, A.MERCHANT],
        [E.START_DISPATCH, A.SYSTEM],
        [E.RIDER_ACCEPT, A.RIDER],
        [E.RIDER_ARRIVED_STORE, A.RIDER],
        [E.RIDER_PICKED_UP, A.RIDER, { prepReady: true }],
        [E.START_DELIVERY, A.RIDER],
        [E.RIDER_ARRIVED_DROPOFF, A.RIDER],
        [E.DELIVERED, A.RIDER],
      ],
      S.CHO_QUAN_XAC_NHAN,
    );
    expect(end).toBe(S.HOAN_THANH);
  });

  it('thanh toán online thành công đưa đơn ngay tới chờ quán, đơn hẹn tới HEN_CHO_QUAN_NHAN', () => {
    expect(transition(S.CHO_THANH_TOAN, E.PAYMENT_SUCCEEDED, A.SYSTEM).to).toBe(S.CHO_QUAN_XAC_NHAN);
    expect(transition(S.CHO_THANH_TOAN, E.PAYMENT_SUCCEEDED, A.SYSTEM, { isScheduled: true }).to).toBe(
      S.HEN_CHO_QUAN_NHAN,
    );
  });

  it('khách tự đến lấy: chỉ cần Cổng A, quán bàn giao là xong', () => {
    const end = run(
      [
        [E.MERCHANT_ACCEPT, A.MERCHANT],
        [E.START_PICKUP_WAIT, A.SYSTEM],
        [E.PICKUP_HANDOVER, A.MERCHANT],
      ],
      S.CHO_QUAN_XAC_NHAN,
    );
    expect(end).toBe(S.HOAN_THANH);
  });

  it('đơn hẹn giờ: quán nhận → chợ chuyến → shipper giữ → xác nhận lại → chạy như đơn thường', () => {
    const end = run(
      [
        [E.MERCHANT_ACCEPT, A.MERCHANT],
        [E.POST_TO_BOARD, A.SYSTEM],
        [E.RIDER_CLAIM, A.RIDER],
        [E.RECONFIRMED, A.SYSTEM],
        [E.SLOT_START, A.SYSTEM],
      ],
      S.HEN_CHO_QUAN_NHAN,
    );
    expect(end).toBe(S.SHIPPER_DA_NHAN);
  });

  it('shipper nhả chuyến khi chờ món quá lâu → tìm shipper lại', () => {
    expect(transition(S.SHIPPER_DEN_QUAN, E.RIDER_RELEASE, A.RIDER).to).toBe(S.DANG_TIM_SHIPPER);
  });

  it('sự cố giữa đường chuyển sang cần can thiệp', () => {
    expect(transition(S.DANG_GIAO, E.INCIDENT, A.RIDER).to).toBe(S.CAN_CAN_THIEP);
  });
});

describe('bất biến "người thật xác nhận"', () => {
  it('SYSTEM không bao giờ được thực hiện sự kiện Cổng A hoặc Cổng B', () => {
    for (const rule of listRules()) {
      if ([...GATE_A_EVENTS, ...GATE_B_EVENTS].includes(rule.event)) {
        expect(rule.actors).not.toContain(A.SYSTEM);
      }
    }
  });

  it('Cổng A chỉ cho quán hoặc Ops; Cổng B chỉ cho shipper', () => {
    for (const rule of listRules()) {
      if (GATE_A_EVENTS.includes(rule.event)) {
        expect(rule.actors.every((a) => a === A.MERCHANT || a === A.OPS)).toBe(true);
      }
      if (GATE_B_EVENTS.includes(rule.event)) {
        expect(rule.actors).toEqual([A.RIDER]);
      }
    }
  });

  it('mọi đường tới trạng thái "quán đã nhận" đều đi qua một sự kiện do người thật thực hiện', () => {
    const humanAcceptedStates: OrderState[] = [S.QUAN_DA_NHAN, S.HEN_QUAN_DA_NHAN];
    for (const rule of listRules()) {
      const targets = typeof rule.to === 'function' ? [rule.to({}), rule.to({ isScheduled: true })] : [rule.to];
      if (targets.some((t) => humanAcceptedStates.includes(t))) {
        const fromBeforeMerchant = rule.from.every((f) =>
          [S.CHO_QUAN_XAC_NHAN, S.HEN_CHO_QUAN_NHAN].includes(f as never),
        );
        if (fromBeforeMerchant) {
          expect(GATE_A_EVENTS).toContain(rule.event);
        } else {
          // Đến từ trạng thái quán đã đề xuất (đã là xác nhận có điều kiện của người thật).
          expect(rule.from.every((f) => [S.CHO_KHACH_DUYET_THAY_DOI, S.HEN_CHO_KHACH_DUYET_GIO].includes(f as never))).toBe(
            true,
          );
        }
      }
    }
  });

  it('chỉ có thể vào SHIPPER_DA_NHAN qua RIDER_ACCEPT hoặc chuyến hẹn shipper đã giữ', () => {
    for (const rule of listRules()) {
      if (rule.to === S.SHIPPER_DA_NHAN) {
        expect(
          rule.event === E.RIDER_ACCEPT || (rule.event === E.SLOT_START && rule.from.includes(S.HEN_SAN_SANG)),
        ).toBe(true);
      }
    }
  });

  it('SYSTEM bấm nhận đơn bị từ chối', () => {
    expect(() => transition(S.CHO_QUAN_XAC_NHAN, E.MERCHANT_ACCEPT, A.SYSTEM)).toThrow(TransitionError);
    expect(canTransition(S.DANG_TIM_SHIPPER, E.RIDER_ACCEPT, A.SYSTEM)).toBe(false);
    expect(canTransition(S.DANG_TIM_SHIPPER, E.RIDER_ACCEPT, A.OPS)).toBe(false);
  });
});

describe('điều kiện chặn (guard)', () => {
  it('đơn có dị ứng: quán phải xác nhận đã đọc ghi chú dị ứng', () => {
    try {
      transition(S.CHO_QUAN_XAC_NHAN, E.MERCHANT_ACCEPT, A.MERCHANT, { hasAllergens: true });
      throw new Error('không được tới đây');
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError);
      expect((e as TransitionError).reason).toBe('ALLERGY_ACK_REQUIRED');
    }
    expect(
      transition(S.CHO_QUAN_XAC_NHAN, E.MERCHANT_ACCEPT, A.MERCHANT, { hasAllergens: true, allergyAcknowledged: true }).to,
    ).toBe(S.QUAN_DA_NHAN);
  });

  it('shipper chỉ lấy hàng khi món đã sẵn sàng', () => {
    expect(canTransition(S.SHIPPER_DEN_QUAN, E.RIDER_PICKED_UP, A.RIDER, { prepReady: false })).toBe(false);
    expect(canTransition(S.SHIPPER_DEN_QUAN, E.RIDER_PICKED_UP, A.RIDER, { prepReady: true })).toBe(true);
  });
});

describe('chuyển không hợp lệ', () => {
  it('trạng thái kết thúc không đi tiếp được', () => {
    for (const terminal of TERMINAL_STATES) {
      for (const rule of listRules()) {
        expect(rule.from).not.toContain(terminal);
      }
    }
  });

  it('khách không huỷ được sau khi shipper đã lấy hàng (chỉ Ops)', () => {
    expect(canTransition(S.DANG_GIAO, E.CUSTOMER_CANCEL, A.CUSTOMER)).toBe(false);
    expect(canTransition(S.DANG_GIAO, E.OPS_CANCEL, A.OPS)).toBe(true);
  });

  it('báo lỗi rõ ràng khi sự kiện không hợp với trạng thái', () => {
    expect(() => transition(S.HOAN_THANH, E.DELIVERED, A.RIDER)).toThrow(/HOAN_THANH/);
  });
});

describe('không shipper nào nhận (Phần 3.4)', () => {
  it('hệ thống chỉ được huỷ đơn đang tìm shipper — không bao giờ tự nhận thay shipper', () => {
    expect(transition(S.DANG_TIM_SHIPPER, E.NO_RIDER_CANCEL, A.SYSTEM).to).toBe(S.DA_HUY);
    expect(() => transition(S.SHIPPER_DA_NHAN, E.NO_RIDER_CANCEL, A.SYSTEM)).toThrow(TransitionError);
    expect(() => transition(S.DANG_TIM_SHIPPER, E.RIDER_ACCEPT, A.SYSTEM)).toThrow(TransitionError);
  });
});

describe('shipper mua hộ (Phần 3.8)', () => {
  it('chỉ hệ thống chuyển đơn đang chờ quán sang mời shipper mua hộ; không ai khác làm thay', () => {
    expect(transition(S.CHO_QUAN_XAC_NHAN, E.SWITCH_TO_PROXY, A.SYSTEM).to).toBe(S.DANG_TIM_SHIPPER);
    expect(() => transition(S.CHO_QUAN_XAC_NHAN, E.SWITCH_TO_PROXY, A.RIDER)).toThrow(TransitionError);
    expect(() => transition(S.QUAN_DA_NHAN, E.SWITCH_TO_PROXY, A.SYSTEM)).toThrow(TransitionError);
  });

  it('chuyển sang mua hộ không phải là xác nhận: đơn vẫn phải chờ shipper bấm nhận', () => {
    const s = transition(S.CHO_QUAN_XAC_NHAN, E.SWITCH_TO_PROXY, A.SYSTEM).to;
    expect(() => transition(s, E.RIDER_ACCEPT, A.SYSTEM)).toThrow(TransitionError);
    expect(transition(s, E.RIDER_ACCEPT, A.RIDER).to).toBe(S.SHIPPER_DA_NHAN);
  });

  it('shipper tới quán thấy không bán được thì báo huỷ; hệ thống không tự huỷ thay', () => {
    expect(transition(S.SHIPPER_DEN_QUAN, E.PROXY_STORE_UNAVAILABLE, A.RIDER).to).toBe(S.DA_HUY);
    expect(() => transition(S.SHIPPER_DEN_QUAN, E.PROXY_STORE_UNAVAILABLE, A.SYSTEM)).toThrow(TransitionError);
    expect(() => transition(S.DANG_GIAO, E.PROXY_STORE_UNAVAILABLE, A.RIDER)).toThrow(TransitionError);
  });
});

