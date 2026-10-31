'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CategoryBadge, Empty, Loading, PageHead, Stat } from '@/components/ui';
import { StateBadge } from '@/components/Shell';
import { STATE_LABELS, api, money, time } from '@/lib/api';

interface Dashboard {
  activeOrders: Record<string, number>;
  gateA: { decided: number; within60sPct: number | null; within180sPct: number | null };
  riders: { online: number; free: number };
  problemOrders: number;
  scheduledNext2h: { upcoming: number; unclaimed: number };
  today: { orders: number; completed: number; gmv: number; cancelled_customer: number; cancelled_merchant: number; cancelled_system: number };
  system: { failedJobs: number };
  hourly: Array<{ hour: number; orders: number; completed: number }>;
  pendingPartners: { stores: number; riders: number };
  topStores: Array<{ id: number; name: string; category: string; orders: number; gmv: number }>;
  at: string;
}

/** Tổng quan "nhìn trong 5 giây" (Phần 14.2), tự làm mới mỗi 10 giây. */
export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Dashboard>('/v1/admin/dashboard')
      .then((x) => {
        setD(x);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <Loading />;
  const active = Object.values(d.activeOrders).reduce((a, b) => a + b, 0);
  const gateALow = d.gateA.within180sPct !== null && d.gateA.within180sPct < 85;
  const cancelled = d.today.cancelled_customer + d.today.cancelled_merchant + d.today.cancelled_system;
  const max = Math.max(1, ...d.hourly.map((h) => h.orders));
  const pending = d.pendingPartners.stores + d.pendingPartners.riders;

  return (
    <>
      <PageHead title="Tổng quan" sub={`Tự cập nhật mỗi 10 giây · lần cuối ${time(d.at)}`} actions={<Link className="btn secondary" href="/map">🗺️ Mở bản đồ trực tiếp</Link>} />

      <div className="grid">
        <Stat icon="🚨" label="Đơn có vấn đề" value={d.problemOrders} hint="Bấm để xử lý ngay" tone="bad" alert={d.problemOrders > 0} href="/orders?problem=true" />
        <Stat icon="📦" label="Đơn đang chạy" value={active} tone="info" href="/orders" />
        <Stat icon="⏱️" label="Quán nhận ≤ 1 phút / ≤ 3 phút" value={`${d.gateA.within60sPct ?? '—'}% / ${d.gateA.within180sPct ?? '—'}%`} hint={`${d.gateA.decided} đơn hôm nay`} tone={gateALow ? 'bad' : 'ok'} alert={gateALow} />
        <Stat icon="🛵" label="Shipper trực tuyến / đang rảnh" value={`${d.riders.online} / ${d.riders.free}`} tone="ok" href="/riders?online=true" />
        <Stat icon="🟣" label="Đơn hẹn 2 giờ tới / chưa ai giữ" value={`${d.scheduledNext2h.upcoming} / ${d.scheduledNext2h.unclaimed}`} tone="sched" alert={d.scheduledNext2h.unclaimed > 0} />
        <Stat icon="✅" label="Hồ sơ đối tác chờ duyệt" value={pending} hint={`${d.pendingPartners.stores} quán · ${d.pendingPartners.riders} shipper`} tone="wait" alert={pending > 0} href="/partners" />
      </div>

      <section className="split">
        <div className="card">
          <div className="card-head">
            <h2>Đơn 24 giờ qua theo giờ</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--primary)' }} />Đơn đặt</span>
              <span><i style={{ background: 'var(--confirmed)' }} />Hoàn thành</span>
            </div>
          </div>
          <div className="bars" role="img" aria-label="Biểu đồ số đơn theo giờ">
            {d.hourly.map((h) => (
              <div key={h.hour} className="bar" title={`${h.hour}h: ${h.orders} đơn, ${h.completed} hoàn thành`}>
                <span style={{ height: `${(h.orders / max) * 100}%` }} />
                <span className="done" style={{ height: `${(h.completed / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bars-axis">
            {d.hourly.map((h, i) => <span key={h.hour}>{i % 3 === 0 ? `${h.hour}h` : ''}</span>)}
          </div>
        </div>

        <div className="card">
          <h2>Hôm nay</h2>
          <dl className="kv">
            <dt>Đơn đặt</dt>
            <dd>{d.today.orders}</dd>
            <dt>Hoàn thành</dt>
            <dd className="tone-ok">{d.today.completed}</dd>
            <dt>Doanh số (GMV)</dt>
            <dd>{money(d.today.gmv)}</dd>
            <dt>Đã huỷ</dt>
            <dd>
              {cancelled}
              <div className="cell-sub">Khách {d.today.cancelled_customer} · Quán {d.today.cancelled_merchant} · Hệ thống {d.today.cancelled_system}</div>
            </dd>
            <dt>Việc hẹn giờ lỗi</dt>
            <dd className={d.system.failedJobs ? 'tone-bad' : ''}>{d.system.failedJobs}</dd>
          </dl>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="card-head">
            <h2>Đơn đang chạy theo trạng thái</h2>
            <Link href="/orders" className="btn secondary small">Xem tất cả</Link>
          </div>
          {active === 0 ? (
            <Empty icon="😌">Chưa có đơn nào đang chạy</Empty>
          ) : (
            <table>
              <tbody>
                {Object.entries(d.activeOrders).map(([state, n]) => (
                  <tr key={state}>
                    <td><Link href={`/orders?state=${state}`}><StateBadge state={state} label={STATE_LABELS[state] ?? state} /></Link></td>
                    <td className="num"><strong>{n}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Quán nhiều đơn nhất hôm nay</h2>
            <Link href="/stores" className="btn secondary small">Tất cả quán</Link>
          </div>
          {d.topStores.length === 0 ? (
            <Empty icon="🏪">Hôm nay chưa có đơn</Empty>
          ) : (
            <table>
              <tbody>
                {d.topStores.map((s, i) => (
                  <tr key={s.id}>
                    <td className="muted">#{i + 1}</td>
                    <td>
                      <Link href={`/stores/${s.id}`}>{s.name}</Link>
                      <div><CategoryBadge category={s.category} /></div>
                    </td>
                    <td className="num">
                      <strong>{s.orders}</strong> đơn
                      <div className="cell-sub">{money(s.gmv)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
