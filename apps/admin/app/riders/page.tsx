'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Avatar, Chips, Empty, Loading, OnlineBadge, PageHead, Stat, StatusBadge, TierBadge } from '@/components/ui';
import { VEHICLE_LABELS, ago, api, money } from '@/lib/api';

interface Rider {
  userId: number;
  name: string | null;
  phone: string;
  vehicleType: string;
  plateNumber: string | null;
  status: string;
  isOnline: boolean;
  locationAt: string | null;
  codBalance: number;
  codLimit: number;
  tier: string;
  score: number | null;
  stars: number | null;
  activeTrip: string | null;
  tripsToday: number;
  trips30d: number;
}
interface Data {
  summary: { total: number; approved: number; pending: number; suspended: number; online: number; busy: number };
  riders: Rider[];
}
type Filter = 'ALL' | 'ONLINE' | 'BUSY' | 'APPROVED' | 'PENDING' | 'SUSPENDED';

/** Danh sách shipper: ai đang trực tuyến, đang chạy chuyến nào, giữ bao nhiêu tiền thu hộ (Phần 14.5). */
function RidersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(params.get('online') === 'true' ? 'ONLINE' : 'ALL');

  useEffect(() => {
    const load = () =>
      api<Data>(`/v1/admin/riders?q=${encodeURIComponent(q)}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message));
    const t = setTimeout(load, 250);
    const every = setInterval(load, 15_000);
    return () => {
      clearTimeout(t);
      clearInterval(every);
    };
  }, [q]);

  const riders = useMemo(
    () =>
      (data?.riders ?? []).filter((r) =>
        filter === 'ALL' ? true : filter === 'ONLINE' ? r.isOnline : filter === 'BUSY' ? !!r.activeTrip : r.status === filter,
      ),
    [data, filter],
  );

  return (
    <>
      <PageHead title="Shipper" sub="Tự cập nhật mỗi 15 giây. Bấm vào một shipper để xem chuyến, tỉ lệ nhận lời mời và thao tác." actions={<Link className="btn secondary" href="/map">🗺️ Xem trên bản đồ</Link>} />
      {error && <div className="error">{error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid">
            <Stat icon="🛵" label="Tổng số shipper" value={data.summary.total} hint={`${data.summary.approved} đang hoạt động`} />
            <Stat icon="🟢" label="Đang trực tuyến" value={data.summary.online} tone="ok" />
            <Stat icon="📦" label="Đang chạy chuyến" value={data.summary.busy} tone="info" />
            <Stat icon="⏳" label="Chờ duyệt" value={data.summary.pending} tone="wait" href="/partners" alert={data.summary.pending > 0} />
          </div>

          <section>
            <div className="toolbar">
              <div className="search">
                <input placeholder="Tìm tên, số điện thoại, biển số…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm shipper" />
              </div>
              <Chips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả', count: data.riders.length },
                  { value: 'ONLINE', label: 'Trực tuyến', count: data.summary.online },
                  { value: 'BUSY', label: 'Đang chạy chuyến', count: data.summary.busy },
                  { value: 'PENDING', label: 'Chờ duyệt', count: data.summary.pending },
                  { value: 'SUSPENDED', label: 'Tạm khoá', count: data.summary.suspended },
                ]}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Shipper</th>
                    <th>Trạng thái</th>
                    <th>Phương tiện</th>
                    <th>Uy tín</th>
                    <th className="num">Chuyến hôm nay / 30 ngày</th>
                    <th className="num">Tiền thu hộ đang giữ</th>
                    <th>Vị trí cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => {
                    const codPct = r.codLimit ? Math.round((r.codBalance / r.codLimit) * 100) : 0;
                    return (
                      <tr key={r.userId} className="clickable" onClick={() => router.push(`/riders/${r.userId}`)}>
                        <td>
                          <div className="who">
                            <Avatar name={r.name ?? r.phone} />
                            <div>
                              <Link href={`/riders/${r.userId}`} onClick={(e) => e.stopPropagation()}>{r.name ?? 'Chưa có tên'}</Link>
                              <div className="cell-sub">{r.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {r.status === 'APPROVED' ? <OnlineBadge online={r.isOnline} busy={!!r.activeTrip} /> : <StatusBadge status={r.status} />}
                          {r.activeTrip && <div className="cell-sub">Chuyến {r.activeTrip}</div>}
                        </td>
                        <td>
                          {VEHICLE_LABELS[r.vehicleType] ?? r.vehicleType}
                          <div className="cell-sub">{r.plateNumber ?? '—'}</div>
                        </td>
                        <td>
                          <TierBadge tier={r.tier} score={r.score} />
                          {r.stars != null && <div className="cell-sub">★ {r.stars.toFixed(1)}</div>}
                        </td>
                        <td className="num"><strong>{r.tripsToday}</strong> / {r.trips30d}</td>
                        <td className="num">
                          <span className={codPct >= 80 ? 'tone-bad' : ''}>{money(r.codBalance)}</span>
                          <div className="cell-sub">hạn mức {money(r.codLimit)}</div>
                        </td>
                        <td className="cell-sub">{r.isOnline ? ago(r.locationAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {riders.length === 0 && <Empty icon="🔎">Không có shipper nào khớp bộ lọc</Empty>}
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function RidersPage() {
  return (
    <Suspense>
      <RidersInner />
    </Suspense>
  );
}
