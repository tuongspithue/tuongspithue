'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, time } from '@/lib/api';

interface Pending {
  stores: Array<{ id: number; name: string; category: string; address: string; phone: string; ownerPhone: string; createdAt: string }>;
  riders: Array<{ userId: number; vehicleType: string; plateNumber: string | null; phone: string; createdAt: string }>;
}

const VEHICLES: Record<string, string> = { MOTORBIKE: 'Xe máy', EMOTORBIKE: 'Xe máy điện', CARGO: 'Xe ba gác' };

/** Hàng đợi duyệt hồ sơ quán & shipper (Phần 14.7). */
export default function PartnersPage() {
  const [data, setData] = useState<Pending | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Pending>('/v1/admin/partners/pending')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function decide(kind: 'stores' | 'riders', id: number, approve: boolean) {
    setMsg(null);
    setError(null);
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt('Lý do từ chối (đối tác sẽ nhận được):');
      if (!reason || reason.trim().length < 3) return;
    }
    try {
      await api(`/v1/admin/${kind}/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: approve ? undefined : { reason } });
      setMsg(approve ? 'Đã duyệt' : 'Đã từ chối và gửi lý do cho đối tác');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <div className="error">{error}</div> : <div className="muted">Đang tải…</div>;

  return (
    <>
      <h1>Duyệt đối tác</h1>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <h2>Quán chờ duyệt ({data.stores.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Quán</th>
            <th>Ngành</th>
            <th>Địa chỉ</th>
            <th>Liên hệ</th>
            <th>Nộp lúc</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.stores.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.category}</td>
              <td>{s.address}</td>
              <td>
                {s.phone}
                <div className="muted">Chủ: {s.ownerPhone}</div>
              </td>
              <td>{time(s.createdAt)}</td>
              <td className="row">
                <button className="btn" onClick={() => decide('stores', s.id, true)}>
                  Duyệt
                </button>
                <button className="btn secondary" onClick={() => decide('stores', s.id, false)}>
                  Từ chối
                </button>
              </td>
            </tr>
          ))}
          {data.stores.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Không có hồ sơ quán nào đang chờ
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Shipper chờ duyệt ({data.riders.length})</h2>
      <table>
        <thead>
          <tr>
            <th>SĐT</th>
            <th>Phương tiện</th>
            <th>Biển số</th>
            <th>Nộp lúc</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.riders.map((r) => (
            <tr key={r.userId}>
              <td>{r.phone}</td>
              <td>{VEHICLES[r.vehicleType] ?? r.vehicleType}</td>
              <td>{r.plateNumber ?? '—'}</td>
              <td>{time(r.createdAt)}</td>
              <td className="row">
                <button className="btn" onClick={() => decide('riders', r.userId, true)}>
                  Duyệt
                </button>
                <button className="btn secondary" onClick={() => decide('riders', r.userId, false)}>
                  Từ chối
                </button>
              </td>
            </tr>
          ))}
          {data.riders.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Không có hồ sơ shipper nào đang chờ
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
