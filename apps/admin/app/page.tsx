'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STATE_LABELS, api, money, time } from '@/lib/api';

interface Dashboard {
  activeOrders: Record<string, number>;
  gateA: { decided: number; within60sPct: number | null; within180sPct: number | null };
  riders: { online: number; free: number };
  problemOrders: number;
  scheduledNext2h: { upcoming: number; unclaimed: number };
  today: { orders: number; completed: number; gmv: number; cancelled_customer: number; cancelled_merchant: number; cancelled_system: number };
  system: { failedJobs: number };
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
  if (!d) return <div className="muted">Đang tải…</div>;
  const active = Object.values(d.activeOrders).reduce((a, b) => a + b, 0);
  const gateALow = d.gateA.within180sPct !== null && d.gateA.within180sPct < 85;

  return (
    <>
      <h1>Tổng quan</h1>
      <p className="muted">Cập nhật lúc {time(d.at)}</p>
      <div className="grid">
        <Link href="/orders?problem=true" className={`card ${d.problemOrders ? 'alert' : ''}`} style={{ textDecoration: 'none' }}>
          <div className="label">🚨 Đơn có vấn đề</div>
          <div className="value">{d.problemOrders}</div>
        </Link>
        <div className="card">
          <div className="label">📦 Đơn đang chạy</div>
          <div className="value">{active}</div>
        </div>
        <div className={`card ${gateALow ? 'alert' : ''}`}>
          <div className="label">⏱️ Quán xác nhận ≤ 1 phút / ≤ 3 phút</div>
          <div className="value">
            {d.gateA.within60sPct ?? '—'}% / {d.gateA.within180sPct ?? '—'}%
          </div>
        </div>
        <div className="card">
          <div className="label">🛵 Shipper online / đang rảnh</div>
          <div className="value">
            {d.riders.online} / {d.riders.free}
          </div>
        </div>
        <div className={`card ${d.scheduledNext2h.unclaimed ? 'alert' : ''}`}>
          <div className="label">🟣 Đơn hẹn 2 giờ tới / chưa ai giữ</div>
          <div className="value">
            {d.scheduledNext2h.upcoming} / {d.scheduledNext2h.unclaimed}
          </div>
        </div>
        <div className={`card ${d.system.failedJobs ? 'alert' : ''}`}>
          <div className="label">⚙️ Việc hẹn giờ lỗi</div>
          <div className="value">{d.system.failedJobs}</div>
        </div>
      </div>

      <h2>Hôm nay</h2>
      <div className="grid">
        <div className="card">
          <div className="label">Đơn đặt / hoàn thành</div>
          <div className="value">
            {d.today.orders} / {d.today.completed}
          </div>
        </div>
        <div className="card">
          <div className="label">GMV (đơn hoàn thành)</div>
          <div className="value">{money(d.today.gmv)}</div>
        </div>
        <div className="card">
          <div className="label">Huỷ do khách / quán / hệ thống</div>
          <div className="value">
            {d.today.cancelled_customer} / {d.today.cancelled_merchant} / {d.today.cancelled_system}
          </div>
        </div>
      </div>

      <h2>Đơn đang chạy theo trạng thái</h2>
      <table>
        <thead>
          <tr>
            <th>Trạng thái</th>
            <th>Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(d.activeOrders).map(([state, n]) => (
            <tr key={state}>
              <td>
                <Link href={`/orders?state=${state}`}>{STATE_LABELS[state] ?? state}</Link>
              </td>
              <td>{n}</td>
            </tr>
          ))}
          {active === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                Chưa có đơn nào đang chạy
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
