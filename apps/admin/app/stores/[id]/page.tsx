'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Activation, ActivationCard } from '@/components/ActivationCard';
import { ContactButtons } from '@/components/ContactButtons';
import { LeafletMap } from '@/components/LeafletMap';
import { StateBadge } from '@/components/Shell';
import { Avatar, Badge, CategoryBadge, Empty, History, Loading, PageHead, Stat, StatusBadge, TierBadge, askReason } from '@/components/ui';
import { CATEGORY_LABELS, STATE_LABELS, api, money, time } from '@/lib/api';

const ROLE = { MERCHANT_OWNER: 'Chủ quán', MERCHANT_STAFF: 'Nhân viên' } as Record<string, string>;
const COMPONENT_LABELS: Record<string, string> = {
  acceptance: 'Tỉ lệ nhận đơn',
  speed: 'Tốc độ xác nhận',
  rating: 'Đánh giá của khách',
  cancellation: 'Ít huỷ đơn',
  accuracy: 'Đúng món',
  prepAccuracy: 'Đúng giờ chuẩn bị',
};

/** Hồ sơ quán 360°: thông tin, menu, đơn gần đây, uy tín, nhân sự và thao tác quản trị (Phần 14.5). */
export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', deliveryRadiusM: 5000, prepTimeDefaultMin: 15 });

  const load = useCallback(() => {
    api(`/v1/admin/stores/${id}`)
      .then((x) => {
        setS(x);
        setForm({ name: x.name, phone: x.phone, address: x.address, deliveryRadiusM: x.deliveryRadiusM, prepTimeDefaultMin: x.prepTimeDefaultMin });
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const markers = useMemo(() => (s ? [{ lat: s.lat, lng: s.lng, color: CATEGORY_LABELS[s.category]?.color ?? '#ff6b2c', icon: CATEGORY_LABELS[s.category]?.icon ?? '🏪', size: 36, popup: s.name }] : []), [s]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const update = (body: Record<string, unknown>, what: string, ok: string) => {
    const reason = askReason(what);
    if (reason) run(() => api(`/v1/admin/stores/${id}`, { method: 'PATCH', body: { ...body, reason } }), ok);
  };

  function save(e: FormEvent) {
    e.preventDefault();
    const reason = askReason('Lưu thay đổi thông tin quán');
    if (!reason) return;
    run(async () => {
      await api(`/v1/admin/stores/${id}`, { method: 'PATCH', body: { ...form, reason } });
      setEditing(false);
    }, 'Đã lưu thông tin quán');
  }

  if (error && !s) return <div className="error">{error}</div>;
  if (!s) return <Loading />;
  const st = s.stats30d;
  const rate = st.orders ? Math.round((st.completed / st.orders) * 100) : null;
  const sections = Array.from(new Set<string>(s.menu.map((m: any) => m.section ?? 'Khác')));

  return (
    <>
      <PageHead
        crumbs={[['/stores', 'Quán']]}
        title={
          <span className="who">
            <Avatar name={s.name} color={CATEGORY_LABELS[s.category]?.color} />
            {s.name}
          </span>
        }
        sub={
          <span className="row">
            <CategoryBadge category={s.category} />
            <StatusBadge status={s.status} />
            {s.status === 'APPROVED' && <Badge tone={s.isOpen ? 'ok' : undefined}>{s.isOpen ? '● Đang mở cửa' : '○ Đóng cửa'}</Badge>}
            <TierBadge tier={s.trust.tier} score={s.trust.score} />
          </span>
        }
        actions={
          <>
            {s.status === 'APPROVED' && (
              <button className="btn secondary" onClick={() => update({ isOpen: !s.isOpen }, s.isOpen ? 'Đóng cửa quán hộ chủ quán' : 'Mở cửa quán hộ chủ quán', s.isOpen ? 'Đã đóng cửa quán' : 'Đã mở cửa quán')}>
                {s.isOpen ? '🚪 Đóng cửa hộ' : '🟢 Mở cửa hộ'}
              </button>
            )}
            <button className="btn secondary" onClick={() => run(async () => setActivation(await api(`/v1/admin/users/${s.owner.id}/activation-code`, { method: 'POST', body: {} })), 'Đã cấp mã kích hoạt cho chủ quán')}>
              🔑 Cấp mã đăng nhập
            </button>
            {s.status === 'SUSPENDED' ? (
              <button className="btn success" onClick={() => update({ status: 'APPROVED' }, 'Mở khoá quán', 'Đã mở khoá quán')}>✅ Mở khoá</button>
            ) : (
              s.status === 'APPROVED' && <button className="btn danger" onClick={() => update({ status: 'SUSPENDED' }, 'Tạm khoá quán (quán bị đóng cửa và ẩn khỏi khách)', 'Đã tạm khoá quán')}>⛔ Tạm khoá</button>
            )}
          </>
        }
      />
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
      {activation && <ActivationCard activation={activation} onClose={() => setActivation(null)} />}

      <div className="grid">
        <Stat icon="📦" label="Đơn 30 ngày" value={st.orders} hint={`${st.completed} hoàn thành`} tone="info" />
        <Stat icon="✅" label="Tỉ lệ hoàn thành" value={rate == null ? '—' : `${rate}%`} tone={rate == null || rate >= 85 ? 'ok' : 'bad'} />
        <Stat icon="⏱️" label="Thời gian nhận đơn TB" value={st.avgAcceptSeconds == null ? '—' : `${st.avgAcceptSeconds} giây`} tone={st.avgAcceptSeconds > 120 ? 'bad' : 'ok'} />
        <Stat icon="💰" label="Doanh số 30 ngày" value={money(st.gmv)} hint={st.merchantCancelled ? `${st.merchantCancelled} đơn quán huỷ/bỏ lỡ` : undefined} tone="wait" />
      </div>

      <section className="split">
        <div>
          <div className="card">
            <div className="card-head">
              <h2>Đơn gần đây</h2>
              <Link className="btn secondary small" href={`/orders?q=${encodeURIComponent(s.name)}`}>Tất cả đơn của quán</Link>
            </div>
            {s.recentOrders.length === 0 ? (
              <Empty>Quán chưa có đơn nào</Empty>
            ) : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table>
                  <thead>
                    <tr><th>Mã đơn</th><th>Trạng thái</th><th>Khách</th><th className="num">Tổng</th><th>Lúc đặt</th></tr>
                  </thead>
                  <tbody>
                    {s.recentOrders.map((o: any) => (
                      <tr key={o.id}>
                        <td><Link href={`/orders/${o.id}`}>{o.code}</Link></td>
                        <td><StateBadge state={o.state} label={STATE_LABELS[o.state] ?? o.state} /></td>
                        <td>{o.customerName ?? '—'}</td>
                        <td className="num">{money(o.total)}<div className="cell-sub">{o.paymentMethod}</div></td>
                        <td className="cell-sub">{time(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Menu ({s.menu.length} món)</h2>
              <span className="muted">Tắt món khi quán báo hết hàng qua điện thoại</span>
            </div>
            {s.menu.length === 0 && <Empty icon="🍽️">Quán chưa có món nào</Empty>}
            {sections.map((sec) => (
              <div key={sec} style={{ marginBottom: 12 }}>
                <h3>{sec}</h3>
                <table>
                  <tbody>
                    {s.menu.filter((m: any) => (m.section ?? 'Khác') === sec).map((m: any) => (
                      <tr key={m.id}>
                        <td style={{ opacity: m.isAvailable ? 1 : 0.5 }}>
                          <div className="cell-main">{m.name}</div>
                          {m.quickNotes.length > 0 && <div className="cell-sub">Ghi chú nhanh: {m.quickNotes.join(' · ')}</div>}
                        </td>
                        <td className="num">{money(m.price)}</td>
                        <td style={{ width: 150 }}>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={m.isAvailable}
                              onChange={(e) => run(() => api(`/v1/admin/menu-items/${m.id}`, { method: 'PATCH', body: { isAvailable: e.target.checked } }), e.target.checked ? `Đã bật "${m.name}"` : `Đã tắt "${m.name}"`)}
                            />
                            {m.isAvailable ? 'Đang bán' : 'Hết hàng'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Thông tin quán</h2>
              {!editing && <button className="btn secondary small" onClick={() => setEditing(true)}>✏️ Sửa</button>}
            </div>
            {editing ? (
              <form onSubmit={save} className="stack" style={{ display: 'grid', gap: 10 }}>
                <div className="field"><label>Tên quán</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="field"><label>SĐT quán</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                <div className="field"><label>Địa chỉ</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></div>
                <div className="form-grid">
                  <div className="field"><label>Bán kính giao (m)</label><input type="number" min={500} max={7000} value={form.deliveryRadiusM} onChange={(e) => setForm({ ...form, deliveryRadiusM: Number(e.target.value) })} /></div>
                  <div className="field"><label>Chuẩn bị mặc định (phút)</label><input type="number" min={1} max={120} value={form.prepTimeDefaultMin} onChange={(e) => setForm({ ...form, prepTimeDefaultMin: Number(e.target.value) })} /></div>
                </div>
                <div className="row">
                  <button className="btn">Lưu</button>
                  <button type="button" className="btn secondary" onClick={() => setEditing(false)}>Huỷ</button>
                </div>
              </form>
            ) : (
              <dl className="kv">
                <dt>Địa chỉ</dt><dd>{s.address}</dd>
                <dt>SĐT quán</dt><dd>{s.phone}</dd>
                <dt>Bán kính giao</dt><dd>{(s.deliveryRadiusM / 1000).toLocaleString('vi-VN')} km</dd>
                <dt>Chuẩn bị</dt><dd>{s.prepTimeDefaultMin} phút</dd>
                <dt>Kiểu giao</dt><dd>{s.deliveryMode}</dd>
                <dt>Tham gia</dt><dd>{time(s.createdAt)}</dd>
              </dl>
            )}
            <div style={{ marginTop: 12 }}><LeafletMap markers={markers} className="map small" zoom={16} /></div>
          </div>

          <div className="card">
            <h2>Liên hệ</h2>
            <ContactButtons label="Quán" phone={s.phone} />
            {s.staff.map((p: any) => (
              <div key={p.userId} style={{ marginTop: 8 }}>
                <ContactButtons label={`${ROLE[p.role] ?? p.role}: ${p.name ?? ''}`} phone={p.phone} />
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Uy tín</h2>
            <div className="row" style={{ marginBottom: 8 }}>
              <TierBadge tier={s.trust.tier} score={s.trust.score} />
              {s.trust.stars != null && <span className="muted">★ {Number(s.trust.stars).toFixed(1)} · {s.trust.reviewCount} đánh giá</span>}
            </div>
            {s.trust.components ? (
              <dl className="kv">
                {Object.entries(s.trust.components as Record<string, number>).map(([k, v]) => (
                  <Fragment key={k}><dt>{COMPONENT_LABELS[k] ?? k}</dt><dd>{typeof v === 'number' ? Math.round(v) : String(v)}</dd></Fragment>
                ))}
              </dl>
            ) : (
              <div className="muted">Chưa đủ đơn để tính điểm — quán đang ở cấp Tân binh.</div>
            )}
          </div>

          <div className="card">
            <h2>Nhật ký quản trị</h2>
            <History items={s.history} />
          </div>
        </div>
      </section>
    </>
  );
}
