'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activation, ActivationCard } from '@/components/ActivationCard';
import { ContactButtons } from '@/components/ContactButtons';
import { api, time } from '@/lib/api';

interface Pending {
  stores: Array<{ id: number; name: string; category: string; address: string; phone: string; ownerPhone: string; ownerName: string | null; createdAt: string }>;
  riders: Array<{ userId: number; vehicleType: string; plateNumber: string | null; phone: string; fullName: string | null; createdAt: string }>;
}

const VEHICLES: Record<string, string> = { MOTORBIKE: 'Xe máy', EMOTORBIKE: 'Xe máy điện', CARGO: 'Xe ba gác' };

/**
 * Hàng đợi duyệt hồ sơ quán & shipper (Phần 14.7). Admin gọi xác minh trước khi duyệt;
 * duyệt xong hệ thống cấp mã kích hoạt để Admin gửi qua Zalo/SMS (Phần 13.9).
 */
export default function PartnersPage() {
  const [data, setData] = useState<Pending | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [phone, setPhone] = useState('');
  const [revoke, setRevoke] = useState(false);

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
      if (approve && !window.confirm('Bạn đã gọi xác minh đúng chủ số điện thoại này chưa?')) return;
      const res = await api<{ activation: Activation | null }>(`/v1/admin/${kind}/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: approve ? undefined : { reason } });
      setMsg(approve ? 'Đã duyệt — gửi mã kích hoạt bên dưới cho đối tác' : 'Đã từ chối và gửi lý do cho đối tác');
      setActivation(res.activation);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reissue(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      setActivation(await api<Activation>('/v1/admin/activation-codes', { method: 'POST', body: { phone, revokeOthers: revoke } }));
      setMsg(revoke ? 'Đã cấp mã mới và đăng xuất các máy cũ' : 'Đã cấp mã mới');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!data) return error ? <div className="error">{error}</div> : <div className="muted">Đang tải…</div>;

  return (
    <>
      <h1>Duyệt đối tác</h1>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
      {activation && <ActivationCard activation={activation} onClose={() => setActivation(null)} />}
      <p className="muted">Trước khi duyệt: bấm Gọi để xác minh đúng chủ số điện thoại (với quán: hỏi tên quán, địa chỉ). Không có SMS tự động.</p>

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
                <ContactButtons label={s.ownerName ?? 'Chủ quán'} phone={s.ownerPhone} />
                {s.phone !== s.ownerPhone && <div className="muted">SĐT quán: {s.phone}</div>}
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
            <th>Shipper</th>
            <th>Phương tiện</th>
            <th>Biển số</th>
            <th>Nộp lúc</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.riders.map((r) => (
            <tr key={r.userId}>
              <td>
                <ContactButtons label={r.fullName ?? 'Shipper'} phone={r.phone} />
              </td>
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

      <h2>Cấp lại mã kích hoạt</h2>
      <p className="muted">Khi đối tác đổi/mất điện thoại, cài lại app hoặc mã cũ hết hạn. Nhân viên Ops cũng đăng nhập Admin Console bằng mã này.</p>
      <form className="row" onSubmit={reissue}>
        <input inputMode="tel" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <label className="row">
          <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} /> Đăng xuất các máy cũ (mất máy)
        </label>
        <button className="btn">Cấp mã</button>
      </form>
    </>
  );
}
