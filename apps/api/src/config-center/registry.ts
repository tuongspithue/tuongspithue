import { DEFAULT_GATE_A_STEPS } from '@sqt/domain';

/**
 * Danh mục tham số Admin chỉnh được (Phần 14.6.2). Mỗi tham số có kiểu, khoảng cho phép,
 * các tầng được ghi đè. `invariant` = nguyên tắc bất biến, không ai sửa được (14.6.4).
 */
export type ConfigScope = 'GLOBAL' | 'CATEGORY' | 'STORE';

export interface ConfigDefinition {
  key: string;
  module: string;
  description: string;
  type: 'INT' | 'MONEY' | 'BOOL' | 'JSON';
  default: unknown;
  min?: number;
  max?: number;
  scopes: ConfigScope[];
  invariant?: boolean;
  validate?: (value: unknown) => string | null;
}

const gateAStepsValid = (v: unknown): string | null => {
  if (!Array.isArray(v) || v.length === 0) return 'Phải là danh sách các mốc';
  const actions = ['REMIND', 'OPS_CALL', 'SUGGEST_SCHEDULE', 'AUTO_CANCEL'];
  for (const s of v) {
    if (typeof s?.afterSeconds !== 'number' || s.afterSeconds < 10 || s.afterSeconds > 900) return 'afterSeconds trong khoảng 10–900';
    if (!actions.includes(s.action)) return `action phải thuộc ${actions.join(', ')}`;
  }
  if (v[v.length - 1].action !== 'AUTO_CANCEL') return 'Mốc cuối cùng phải là AUTO_CANCEL để đơn không bị treo';
  return null;
};

export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // ---- Nguyên tắc bất biến ----
  {
    key: 'invariant.human_confirmation',
    module: 'core',
    description: 'Mọi đơn phải có người thật xác nhận ở Cổng A (quán) và Cổng B (shipper)',
    type: 'BOOL',
    default: true,
    scopes: ['GLOBAL'],
    invariant: true,
  },
  // ---- Bật/tắt tính năng ----
  { key: 'feature.scheduled_orders', module: 'feature', description: 'Cho phép đặt đơn hẹn giờ', type: 'BOOL', default: true, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'feature.cod', module: 'feature', description: 'Cho phép thanh toán tiền mặt', type: 'BOOL', default: true, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'feature.ai_assist', module: 'feature', description: 'Bật tính năng AI (cần cấu hình kết nối AI)', type: 'BOOL', default: true, scopes: ['GLOBAL'] },
  // ---- Phí ----
  // ---- Shipper mua hộ (Phần 3.8) ----
  { key: 'proxy.hybrid_wait_seconds', module: 'proxy', description: 'Chế độ song song: số giây chờ quán nhận trước khi mời shipper tới mua hộ', type: 'INT', default: 60, min: 15, max: 600, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'proxy.new_customer_max_value', module: 'proxy', description: 'Khách mới (chưa có đơn thành công) chỉ được mua hộ với tiền món dưới mức này (đồng)', type: 'MONEY', default: 200_000, min: 0, max: 5_000_000, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'proxy.price_tolerance_pct', module: 'proxy', description: 'Giá thật tại quán lệch quá % này so với app thì shipper phải gọi khách đồng ý', type: 'INT', default: 10, min: 0, max: 50, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'proxy.failed_trip_fee', module: 'proxy', description: 'Tiền bù cho shipper khi tới nơi quán không bán được (đồng, ghi để đối soát)', type: 'MONEY', default: 10_000, min: 0, max: 100_000, scopes: ['GLOBAL'] },

  { key: 'fees.service_fee', module: 'fees', description: 'Phí dịch vụ mỗi đơn (đồng)', type: 'MONEY', default: 2_000, min: 0, max: 20_000, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'fees.delivery_min', module: 'fees', description: 'Phí ship tối thiểu (đồng)', type: 'MONEY', default: 15_000, min: 0, max: 100_000, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  { key: 'fees.delivery_included_km', module: 'fees', description: 'Số km tính trong phí tối thiểu', type: 'INT', default: 2, min: 0, max: 10, scopes: ['GLOBAL', 'CATEGORY'] },
  { key: 'fees.delivery_per_km', module: 'fees', description: 'Phí mỗi km tiếp theo (đồng)', type: 'MONEY', default: 4_000, min: 0, max: 30_000, scopes: ['GLOBAL', 'CATEGORY', 'STORE'] },
  // ---- SLA Cổng A ----
  {
    key: 'sla.gate_a.steps',
    module: 'sla',
    description: 'Các mốc nhắc quán xác nhận đơn ngay (giây kể từ khi đơn tới quán)',
    type: 'JSON',
    default: DEFAULT_GATE_A_STEPS,
    scopes: ['GLOBAL', 'CATEGORY'],
    validate: gateAStepsValid,
  },
];

export const DEFINITIONS_BY_KEY = new Map(CONFIG_DEFINITIONS.map((d) => [d.key, d]));

export function validateConfigValue(def: ConfigDefinition, value: unknown): string | null {
  if (def.invariant) return 'Đây là nguyên tắc bất biến, không thể thay đổi';
  switch (def.type) {
    case 'BOOL':
      if (typeof value !== 'boolean') return 'Giá trị phải là true/false';
      break;
    case 'INT':
    case 'MONEY':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'Giá trị phải là số nguyên';
      if (def.min !== undefined && value < def.min) return `Giá trị tối thiểu ${def.min}`;
      if (def.max !== undefined && value > def.max) return `Giá trị tối đa ${def.max}`;
      break;
  }
  return def.validate?.(value) ?? null;
}
