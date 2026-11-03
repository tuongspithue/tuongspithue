'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, time } from '@/lib/api';

type Subject = 'CUSTOMER' | 'STORE' | 'RIDER';
const SUBJECT_LABELS: Record<Subject, string> = { CUSTOMER: 'Khách hàng', STORE: 'Quán', RIDER: 'Shipper' };
const REASON_LABELS: Record<string, string> = {
  QUALITY_ISSUE: 'Chất lượng dịch vụ',
  FRAUD_SUSPECTED: 'Nghi vấn gian lận',
  COD_REFUSED: 'Bỏ đơn tiền mặt',
  STRATEGIC_PARTNER: 'Đối tác chiến lược',
  CAMPAIGN: 'Chiến dịch',
  FIELD_INSPECTION: 'Kết quả kiểm tra thực địa',
  APPEAL_ACCEPTED: 'Khiếu nại được chấp nhận',
  OTHER: 'Khác',
};
const TIERS = ['DIAMOND', 'GOLD', 'SILVER', 'BRONZE', 'ROOKIE', 'IMPROVE'];

/** Phân quyền chức năng & xếp loại người dùng (Phần 15). */
export default function UsersPage() {
  const [defs, setDefs] = useState<any[]>([]);
  const [subject, setSubject] = useState<Subject>('CUSTOMER');
  const [subjectId, setSubjectId] = useState('');
  const [data, setData] = useState<any>(null);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('false');
  const [reasonCode, setReasonCode] = useState('OTHER');
  const [note, setNote] = useState('');
  const [days, setDays] = useState(30);
  const [tier, setTier] = useState('GOLD');
  const [tierAction, setTierAction] = useState<'SET_TIER' | 'LOCK'>('SET_TIER');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api('/v1/admin/users/entitlements/definitions').then((r) => setDefs(r.definitions)).catch((e) => setError(e.message));
  }, []);

  const keys = defs.filter((d) => d.subject === subject);
  const def = keys.find((d) => d.key === key);

  async function lookup(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      setData(await api(`/v1/admin/users/${subject}/${Number(subjectId)}/entitlements`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      await lookup();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Quyền & xếp loại</h1>
      <p className="muted">Mọi điều chỉnh cần lý do, có thời hạn tối đa 90 ngày, được ghi nhật ký và người bị ảnh hưởng được thông báo.</p>
      <form className="row" onSubmit={lookup}>
        <select value={subject} onChange={(e) => { setSubject(e.target.value as Subject); setData(null); setKey(''); }} aria-label="Loại người dùng">
          {Object.entries(SUBJECT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder={subject === 'STORE' ? 'Mã quán' : 'Mã người dùng'} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required />
        <button className="btn">Xem</button>
      </form>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <h2>Quyền hiệu lực</h2>
          <table>
            <tbody>
              {Object.entries(data.effective).map(([k, v]) => (
                <tr key={k}>
                  <td>{defs.find((d) => d.key === k)?.description ?? k}</td>
                  <td>{v === null ? 'Theo cấp uy tín' : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.overrides.length > 0 && (
            <>
              <h2>Điều chỉnh đang hiệu lực</h2>
              <table>
                <tbody>
                  {data.overrides.map((o: any) => (
                    <tr key={o.id}>
                      <td>{o.key}</td>
                      <td>{JSON.stringify(o.value)}</td>
                      <td>{REASON_LABELS[o.reason_code] ?? o.reason_code}{o.note ? ` — ${o.note}` : ''}</td>
                      <td>đến {time(o.effective_to)}</td>
                      <td>
                        <button className="btn secondary" onClick={() => {
                          const reason = window.prompt('Lý do thu hồi:');
                          if (reason) void run(() => api(`/v1/admin/users/entitlements/${o.id}/revoke`, { method: 'POST', body: { reason } }), 'Đã thu hồi');
                        }}>Thu hồi</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>Điều chỉnh quyền chức năng</h2>
          <div className="row">
            <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Quyền">
              <option value="">Chọn quyền…</option>
              {keys.map((d) => <option key={d.key} value={d.key}>{d.description}</option>)}
            </select>
            {def?.type === 'BOOL' ? (
              <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Giá trị"><option value="true">Cho phép</option><option value="false">Tắt</option></select>
            ) : (
              <input type="number" value={value} min={def?.min} max={def?.max} onChange={(e) => setValue(e.target.value)} aria-label="Giá trị" />
            )}
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} aria-label="Lý do">
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Số ngày" style={{ width: 80 }} /> ngày
            <input placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" disabled={!key} onClick={() => run(() => api('/v1/admin/users/entitlements', {
              method: 'POST',
              body: { subject, subjectId: Number(subjectId), key, value: def?.type === 'BOOL' ? value === 'true' : Number(value), reasonCode, note: note || undefined, days },
            }), 'Đã lưu điều chỉnh')}>Lưu</button>
          </div>

          {subject !== 'CUSTOMER' && (
            <>
              <h2>Điều chỉnh cấp uy tín</h2>
              <div className="row">
                <select value={tierAction} onChange={(e) => setTierAction(e.target.value as 'SET_TIER' | 'LOCK')} aria-label="Hành động">
                  <option value="SET_TIER">Đặt cấp</option>
                  <option value="LOCK">Khoá cấp hiện tại</option>
                </select>
                {tierAction === 'SET_TIER' && (
                  <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Cấp">{TIERS.map((x) => <option key={x}>{x}</option>)}</select>
                )}
                <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} aria-label="Lý do">
                  {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Số ngày" style={{ width: 80 }} /> ngày
                <button className="btn" onClick={() => run(() => api('/v1/admin/users/tier-overrides', {
                  method: 'POST',
                  body: { subject, subjectId: Number(subjectId), action: tierAction, tier: tierAction === 'SET_TIER' ? tier : undefined, reasonCode, note: note || undefined, days },
                }), 'Đã điều chỉnh cấp')}>Áp dụng</button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
