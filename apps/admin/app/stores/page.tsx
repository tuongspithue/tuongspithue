'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, CategoryBadge, Chips, Empty, Loading, Meter, PageHead, Stat, StatusBadge, TierBadge } from '@/components/ui';
import { CATEGORY_LABELS, ORDER_MODES, api, money } from '@/lib/api';

interface Store {
  id: number;
  name: string;
  category: string;
  status: string;
  isOpen: boolean;
  orderMode: string;
  address: string;
  phone: string;
  ownerName: string | null;
  ownerPhone: string;
  tier: string;
  score: number | null;
  stars: number | null;
  reviewCount: number;
  menuCount: number;
  ordersToday: number;
  activeOrders: number;
  orders30d: number;
  completionRate30d: number | null;
  gmv30d: number;
}
interface Data {
  summary: { total: number; approved: number; pending: number; suspended: number; open_now: number };
  stores: Store[];
}

type StatusFilter = 'ALL' | 'OPEN' | 'APPROVED' | 'PENDING' | 'SUSPENDED';

/** Danh sách quán: tìm, lọc theo ngành/trạng thái, xem nhanh hiệu quả 30 ngày (Phần 14.5). */
export default function StoresPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  useEffect(() => {
    const t = setTimeout(() => {
      api<Data>(`/v1/admin/stores?q=${encodeURIComponent(q)}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const stores = useMemo(
    () =>
      (data?.stores ?? []).filter(
        (s) =>
          (category === 'ALL' || s.category === category) &&
          (status === 'ALL' || (status === 'OPEN' ? s.status === 'APPROVED' && s.isOpen : s.status === status)),
      ),
    [data, category, status],
  );
  const byCategory = (c: string) => (data?.stores ?? []).filter((s) => s.category === c).length;

  return (
    <>
      <PageHead title="Quán" sub="Tất cả quán trên hệ thống — bấm vào một quán để xem menu, đơn, uy tín và thao tác." />
      {error && <div className="error">{error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid">
            <Stat icon="🏪" label="Tổng số quán" value={data.summary.total} />
            <Stat icon="🟢" label="Đang mở cửa" value={data.summary.open_now} tone="ok" />
            <Stat icon="⏳" label="Chờ duyệt" value={data.summary.pending} tone="wait" href="/partners" alert={data.summary.pending > 0} />
            <Stat icon="⛔" label="Tạm khoá" value={data.summary.suspended} tone="bad" />
          </div>

          <section>
            <div className="toolbar">
              <div className="search">
                <input placeholder="Tìm tên quán, số điện thoại, địa chỉ…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm quán" />
              </div>
              <Chips
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'ALL', label: 'Tất cả' },
                  { value: 'OPEN', label: 'Đang mở' },
                  { value: 'APPROVED', label: 'Hoạt động' },
                  { value: 'PENDING', label: 'Chờ duyệt' },
                  { value: 'SUSPENDED', label: 'Tạm khoá' },
                ]}
              />
            </div>
            <div className="toolbar">
              <Chips
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'ALL', label: 'Mọi ngành', count: data.stores.length },
                  ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}`, count: byCategory(k) })),
                ]}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quán</th>
                    <th>Trạng thái</th>
                    <th>Uy tín</th>
                    <th className="num">Hôm nay</th>
                    <th>Hoàn thành 30 ngày</th>
                    <th className="num">Doanh số 30 ngày</th>
                    <th>Chủ quán</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => router.push(`/stores/${s.id}`)}>
                      <td>
                        <div className="who">
                          <Avatar name={s.name} color={CATEGORY_LABELS[s.category]?.color} />
                          <div>
                            <Link href={`/stores/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link>
                            <div className="row"><CategoryBadge category={s.category} /><span className="cell-sub">{s.menuCount} món</span></div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                        {s.status === 'APPROVED' && <div className={`cell-sub ${s.isOpen ? 'tone-ok' : ''}`}>{s.isOpen ? '● Đang mở cửa' : '○ Đóng cửa'}</div>}
                        {s.orderMode !== 'APP' && <div className="cell-sub">{ORDER_MODES[s.orderMode]?.label}</div>}
                      </td>
                      <td>
                        <TierBadge tier={s.tier} score={s.score} />
                        {s.stars != null && <div className="cell-sub">★ {s.stars.toFixed(1)} · {s.reviewCount} đánh giá</div>}
                      </td>
                      <td className="num">
                        <strong>{s.ordersToday}</strong> đơn
                        {s.activeOrders > 0 && <div className="cell-sub tone-wait">{s.activeOrders} đang chạy</div>}
                      </td>
                      <td>{s.orders30d ? <Meter pct={s.completionRate30d} /> : <span className="muted">Chưa có đơn</span>}</td>
                      <td className="num">{money(s.gmv30d)}</td>
                      <td>
                        <div className="cell-main">{s.ownerName ?? s.ownerPhone}</div>
                        {s.ownerName && <div className="cell-sub">{s.ownerPhone}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stores.length === 0 && <Empty icon="🔎">Không có quán nào khớp bộ lọc</Empty>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
