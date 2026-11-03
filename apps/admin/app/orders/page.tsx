'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { StateBadge } from '@/components/Shell';
import { PROBLEM_LABELS, STATE_LABELS, api, money, time } from '@/lib/api';

interface Row {
  id: number;
  code: string;
  state: string;
  total: number;
  paymentMethod: string;
  isScheduled: boolean;
  pickupAt: string | null;
  storeName: string;
  storePhone: string;
  customerPhone: string;
  problem: string | null;
  createdAt: string;
}

function OrdersInner() {
  const params = useSearchParams();
  const [problem, setProblem] = useState(params.get('problem') === 'true');
  const [state, setState] = useState(params.get('state') ?? '');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (problem) qs.set('problem', 'true');
    if (state) qs.set('state', state);
    if (q.trim()) qs.set('q', q.trim());
    const load = () =>
      api<{ orders: Row[] }>(`/v1/admin/orders?${qs}`)
        .then((r) => setRows(r.orders))
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [problem, state, q]);

  return (
    <>
      <h1>Đơn hàng</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="row">
          <input type="checkbox" checked={problem} onChange={(e) => setProblem(e.target.checked)} /> Chỉ đơn có vấn đề
        </label>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Lọc theo trạng thái">
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input placeholder="Mã đơn, SĐT khách, tên quán…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm đơn" />
      </div>
      {error && <div className="error">{error}</div>}
      {!rows ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Trạng thái</th>
              {problem && <th>Vấn đề</th>}
              <th>Quán</th>
              <th>Khách</th>
              <th>Tổng</th>
              <th>Đặt lúc</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/orders/${r.id}`}>{r.code}</Link>
                  {r.isScheduled && <div className="muted">🟣 lấy lúc {time(r.pickupAt)}</div>}
                </td>
                <td>
                  <StateBadge state={r.state} label={STATE_LABELS[r.state] ?? r.state} />
                </td>
                {problem && <td className="tone-bad">{r.problem ? PROBLEM_LABELS[r.problem] ?? r.problem : ''}</td>}
                <td>
                  {r.storeName}
                  {problem && r.problem === 'MERCHANT_SILENT' && (
                    <div>
                      <a href={`tel:${r.storePhone}`}>📞 Gọi quán {r.storePhone}</a>
                    </div>
                  )}
                </td>
                <td>{r.customerPhone}</td>
                <td>
                  {money(r.total)} <span className="muted">{r.paymentMethod}</span>
                </td>
                <td>{time(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Không có đơn nào khớp bộ lọc
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersInner />
    </Suspense>
  );
}
