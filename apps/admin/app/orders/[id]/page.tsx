'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ContactButtons } from '@/components/ContactButtons';
import { StateBadge } from '@/components/Shell';
import { ALLERGEN_LABELS, EVENT_LABELS, STATE_LABELS, api, money, time } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = { CUSTOMER: 'Khách', MERCHANT: 'Quán', RIDER: 'Shipper', OPS: 'Điều phối viên', SYSTEM: 'Hệ thống' };
const CHANNEL_LABELS: Record<string, string> = { APP: 'app', OPS_CALL: 'Ops gọi điện', SYSTEM: 'tự động', WEB: 'web' };

/** Hồ sơ đơn: dòng thời gian ai xác nhận, lúc nào, qua kênh nào (Phần 14.5). */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prep, setPrep] = useState(15);
  const [ack, setAck] = useState(false);

  const load = useCallback(() => {
    api(`/v1/admin/orders/${id}`)
      .then(setO)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function acceptOnBehalf() {
    setMsg(null);
    setError(null);
    try {
      await api(`/v1/ops/orders/${id}/accept-on-behalf`, { method: 'POST', body: { prepTimeMin: prep, allergyAck: ack } });
      setMsg('Đã xác nhận thay quán (ghi kênh "Ops gọi điện")');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !o) return <div className="error">{error}</div>;
  if (!o) return <div className="muted">Đang tải…</div>;

  return (
    <>
      <h1>
        Đơn {o.code} <StateBadge state={o.state} label={STATE_LABELS[o.state] ?? o.state} />
      </h1>
      <div className="grid">
        <div className="card">
          <div className="label">Tổng tiền</div>
          <div className="value">{money(o.total)}</div>
          <div className="muted">
            Món {money(o.subtotal)} · Ship {money(o.deliveryFee)} · Dịch vụ {money(o.serviceFee)} · {o.paymentMethod}
          </div>
        </div>
        <div className="card">
          <div className="label">Giao hàng</div>
          <div>{o.deliveryMode === 'SELF_PICKUP' ? 'Khách tự đến lấy' : 'Shipper hệ thống'}</div>
          {o.schedule && <div className="tone-sched">🟣 Hẹn lấy lúc {time(o.schedule.pickupAt)}</div>}
          {o.riderId && <div className="muted">Shipper #{o.riderId} · cấp {o.riderTier}</div>}
        </div>
        <div className={`card ${o.hasAllergens && !o.allergyAcknowledged ? 'alert' : ''}`}>
          <div className="label">Dị ứng</div>
          <div>{o.hasAllergens ? (o.allergyAcknowledged ? '⚠ Có — quán đã xác nhận đã đọc' : '⚠ Có — quán CHƯA xác nhận') : 'Không'}</div>
        </div>
      </div>

      <h2>Liên hệ</h2>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <ContactButtons label={`Quán ${o.storeName ?? ''}`} phone={o.contacts?.store} />
        <ContactButtons label={o.recipientName ? `Người nhận ${o.recipientName}` : 'Khách'} phone={o.contacts?.customer} />
        <ContactButtons label="Shipper" phone={o.contacts?.rider} />
        {o.dropoffAddress && <div className="muted">Giao tới: {o.dropoffAddress}{o.dropoffNote ? ` — ${o.dropoffNote}` : ''}</div>}
      </div>

      <h2>Món & ghi chú</h2>
      <table>
        <thead>
          <tr>
            <th>Món</th>
            <th>SL</th>
            <th>Ghi chú</th>
            <th>Dị ứng</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i: any, idx: number) => (
            <tr key={idx}>
              <td>{i.name}</td>
              <td>{i.quantity}</td>
              <td>{[...i.noteTags, i.note].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
              <td className="tone-bad">{i.allergens.map((a: string) => ALLERGEN_LABELS[a] ?? a).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {o.orderNote && <p>Ghi chú chung: {o.orderNote}</p>}

      {o.state === 'CHO_QUAN_XAC_NHAN' && (
        <>
          <h2>Ops xác nhận thay quán</h2>
          <p className="muted">Bấm "Gọi" ở mục Liên hệ để gọi quán, đọc đơn (kể cả ghi chú và dị ứng), rồi xác nhận khi quán đồng ý nhận.</p>
          <div className="row">
            <label>
              Thời gian chuẩn bị{' '}
              <select value={prep} onChange={(e) => setPrep(Number(e.target.value))}>
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} phút
                  </option>
                ))}
              </select>
            </label>
            {o.hasAllergens && (
              <label className="row">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Quán đã nghe ghi chú dị ứng
              </label>
            )}
            <button className="btn" onClick={acceptOnBehalf}>
              Xác nhận thay quán
            </button>
          </div>
        </>
      )}
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <h2>Dòng thời gian</h2>
      <ul className="timeline">
        {o.timeline.map((e: any, idx: number) => (
          <li key={idx}>
            <strong>{EVENT_LABELS[e.event] ?? e.event}</strong> → {STATE_LABELS[e.to] ?? e.to}
            <div className="muted">
              {time(e.at)} · {ROLE_LABELS[e.byRole] ?? e.byRole}
              {e.byName ? ` ${e.byName}` : ''} · qua {CHANNEL_LABELS[e.channel] ?? e.channel}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
