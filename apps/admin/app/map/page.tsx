'use client';

import { useEffect, useMemo, useState } from 'react';
import { LeafletMap, MapMarker, esc } from '@/components/LeafletMap';
import { Chips, PageHead, Stat } from '@/components/ui';
import { CATEGORY_LABELS, STATE_LABELS, ago, api, time } from '@/lib/api';

interface MapData {
  stores: Array<{ id: number; name: string; category: string; isOpen: boolean; status: string; lat: number; lng: number }>;
  riders: Array<{ userId: number; name: string | null; phone: string; locationAt: string; activeTrip: string | null; lat: number; lng: number }>;
  orders: Array<{ id: number; code: string; state: string; storeId: number; lat: number; lng: number }>;
  at: string;
}
type Layer = 'ALL' | 'STORES' | 'RIDERS' | 'ORDERS';

/** Bản đồ trực tiếp (Phần 14.3): quán theo ngành, shipper đang trực tuyến, điểm giao của đơn đang chạy. Tự làm mới 15 giây. */
export default function MapPage() {
  const [d, setD] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>('ALL');
  const [onlyOpen, setOnlyOpen] = useState(false);

  useEffect(() => {
    const load = () =>
      api<MapData>('/v1/admin/map')
        .then((x) => {
          setD(x);
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    if (!d) return [];
    const out: MapMarker[] = [];
    if (layer === 'ALL' || layer === 'STORES') {
      for (const s of d.stores) {
        if (onlyOpen && !(s.isOpen && s.status === 'APPROVED')) continue;
        const c = CATEGORY_LABELS[s.category];
        out.push({
          lat: s.lat,
          lng: s.lng,
          color: c?.color ?? '#888',
          faded: !s.isOpen || s.status !== 'APPROVED',
          popup: `<strong>${esc(s.name)}</strong><br>${esc(c ? `${c.icon} ${c.label}` : s.category)} · ${s.status !== 'APPROVED' ? 'Tạm khoá/chờ duyệt' : s.isOpen ? 'Đang mở' : 'Đóng cửa'}<br><a href="/stores/${s.id}">Xem hồ sơ quán →</a>`,
        });
      }
    }
    if (layer === 'ALL' || layer === 'ORDERS') {
      for (const o of d.orders) {
        out.push({ lat: o.lat, lng: o.lng, color: '#cc2f35', size: 6, popup: `📍 Điểm giao <strong>${esc(o.code)}</strong><br>${esc(STATE_LABELS[o.state] ?? o.state)}<br><a href="/orders/${o.id}">Xem đơn →</a>` });
      }
    }
    if (layer === 'ALL' || layer === 'RIDERS') {
      for (const r of d.riders) {
        out.push({
          lat: r.lat,
          lng: r.lng,
          color: r.activeTrip ? '#1f6fd1' : '#12803a',
          ring: true,
          size: 9,
          popup: `🛵 <strong>${esc(r.name ?? r.phone)}</strong><br>${r.activeTrip ? `Đang chạy ${esc(r.activeTrip)}` : 'Đang rảnh'} · vị trí ${esc(ago(r.locationAt))}<br><a href="/riders/${r.userId}">Xem hồ sơ →</a>`,
        });
      }
    }
    return out;
  }, [d, layer, onlyOpen]);

  const open = d?.stores.filter((s) => s.isOpen && s.status === 'APPROVED').length ?? 0;
  const busy = d?.riders.filter((r) => r.activeTrip).length ?? 0;

  return (
    <>
      <PageHead title="Bản đồ trực tiếp" sub={d ? `Tự cập nhật mỗi 15 giây · lần cuối ${time(d.at)}` : 'Đang tải…'} />
      {error && <div className="error">{error}</div>}
      <div className="grid" style={{ marginBottom: 14 }}>
        <Stat icon="🏪" label="Quán đang mở / tổng" value={d ? `${open} / ${d.stores.length}` : '—'} tone="ok" />
        <Stat icon="🛵" label="Shipper trực tuyến" value={d?.riders.length ?? '—'} hint={`${busy} đang chạy chuyến`} tone="info" />
        <Stat icon="📍" label="Đơn đang chạy (điểm giao)" value={d?.orders.length ?? '—'} tone="bad" />
      </div>
      <div className="toolbar">
        <Chips
          value={layer}
          onChange={setLayer}
          options={[
            { value: 'ALL', label: 'Tất cả' },
            { value: 'STORES', label: '🏪 Quán' },
            { value: 'RIDERS', label: '🛵 Shipper' },
            { value: 'ORDERS', label: '📍 Điểm giao' },
          ]}
        />
        <label className="switch">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Chỉ quán đang mở
        </label>
        <div className="legend" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
          {Object.values(CATEGORY_LABELS).map((c) => <span key={c.label}><i style={{ background: c.color }} />{c.label}</span>)}
          <span><i style={{ background: '#12803a' }} />Shipper rảnh</span>
          <span><i style={{ background: '#1f6fd1' }} />Shipper đang chạy</span>
          <span><i style={{ background: '#cc2f35' }} />Điểm giao</span>
        </div>
      </div>
      <LeafletMap markers={markers} />
    </>
  );
}
