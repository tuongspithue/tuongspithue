'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activation, ActivationCard } from '@/components/ActivationCard';
import { ContactButtons } from '@/components/ContactButtons';
import { LeafletMap } from '@/components/LeafletMap';
import { StateBadge } from '@/components/Shell';
import { Avatar, Empty, History, Loading, Meter, OnlineBadge, PageHead, Stat, StatusBadge, TierBadge, askReason } from '@/components/ui';
import { STATE_LABELS, VEHICLE_LABELS, ago, api, money, time } from '@/lib/api';

/** Hồ sơ shipper: chuyến gần đây, tỉ lệ nhận lời mời, tiền thu hộ, vị trí và thao tác quản trị. */
export default function RiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [codLimit, setCodLimit] = useState(0);

  const load = useCallback(() => {
    api(`/v1/admin/riders/${id}`)
      .then((x) => {
        setR(x);
        setCodLimit(x.codLimit);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const markers = useMemo(() => (r?.lat != null ? [{ lat: r.lat, lng: r.lng, color: '#12803a', ring: true, size: 9, popup: r.name ?? r.phone }] : []), [r?.lat, r?.lng, r?.name, r?.phone]);

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
    if (reason) run(() => api(`/v1/admin/riders/${id}`, { method: 'PATCH', body: { ...body, reason } }), ok);
  };

  if (error && !r) return <div className="error">{error}</div>;
  if (!r) return <Loading />;
  const codPct = r.codLimit ? Math.round((r.codBalance / r.codLimit) * 100) : 0;

  return (
    <>
      <PageHead
        crumbs={[['/riders', 'Shipper']]}
        title={<span className="who"><Avatar name={r.name ?? r.phone} />{r.name ?? 'Chưa có tên'}</span>}
        sub={
          <span className="row">
            {r.status === 'APPROVED' ? <OnlineBadge online={r.isOnline} busy={!!r.activeTrip} /> : <StatusBadge status={r.status} />}
            <TierBadge tier={r.tier} score={r.score} />
            <span className="muted">{VEHICLE_LABELS[r.vehicleType] ?? r.vehicleType} · {r.plateNumber ?? 'chưa có biển số'}</span>
          </span>
        }
        actions={
          <>
            <button className="btn secondary" onClick={() => run(async () => setActivation(await api(`/v1/admin/users/${r.userId}/activation-code`, { method: 'POST', body: {} })), 'Đã cấp mã kích hoạt')}>
              🔑 Cấp mã đăng nhập
            </button>
            {r.status === 'SUSPENDED' ? (
              <button className="btn success" onClick={() => update({ status: 'APPROVED' }, 'Mở khoá shipper', 'Đã mở khoá shipper')}>✅ Mở khoá</button>
            ) : (
              r.status === 'APPROVED' && <button className="btn danger" onClick={() => update({ status: 'SUSPENDED' }, 'Tạm khoá shipper (ngắt trực tuyến, không nhận được chuyến)', 'Đã tạm khoá shipper')}>⛔ Tạm khoá</button>
            )}
          </>
        }
      />
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
      {activation && <ActivationCard activation={activation} onClose={() => setActivation(null)} />}

      <div className="grid">
        <Stat icon="📦" label="Chuyến hôm nay / 30 ngày" value={`${r.tripsToday} / ${r.trips30d}`} tone="info" />
        <Stat icon="🤝" label="Nhận lời mời (30 ngày)" value={r.offers30d.acceptRate == null ? '—' : `${r.offers30d.acceptRate}%`} hint={`${r.offers30d.accepted} nhận · ${r.offers30d.declined} bỏ qua · ${r.offers30d.expired} hết hạn`} tone={r.offers30d.acceptRate == null || r.offers30d.acceptRate >= 70 ? 'ok' : 'bad'} />
        <Stat icon="💵" label="Tiền thu hộ đang giữ" value={money(r.codBalance)} hint={`${codPct}% hạn mức ${money(r.codLimit)}`} tone={codPct >= 80 ? 'bad' : 'wait'} alert={codPct >= 100} />
        <Stat icon="⭐" label="Đánh giá" value={r.stars == null ? '—' : `★ ${Number(r.stars).toFixed(1)}`} hint={`${r.reviewCount} lượt`} tone="wait" />
      </div>

      <section className="split">
        <div className="card">
          <div className="card-head"><h2>Chuyến gần đây</h2>{r.activeTrip && <span className="badge tone-info">Đang chạy {r.activeTrip}</span>}</div>
          {r.recentTrips.length === 0 ? (
            <Empty icon="🛵">Shipper chưa chạy chuyến nào</Empty>
          ) : (
            <div className="table-wrap" style={{ boxShadow: 'none' }}>
              <table>
                <thead><tr><th>Mã đơn</th><th>Trạng thái</th><th>Quán</th><th className="num">Tổng</th><th>Lúc đặt</th></tr></thead>
                <tbody>
                  {r.recentTrips.map((o: any) => (
                    <tr key={o.id}>
                      <td><Link href={`/orders/${o.id}`}>{o.code}</Link></td>
                      <td><StateBadge state={o.state} label={STATE_LABELS[o.state] ?? o.state} /></td>
                      <td>{o.storeName}</td>
                      <td className="num">{money(o.total)}<div className="cell-sub">{o.paymentMethod}</div></td>
                      <td className="cell-sub">{time(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Vị trí</h2>
            {r.lat != null ? (
              <>
                <LeafletMap markers={markers} className="map small" zoom={16} />
                <div className="cell-sub" style={{ marginTop: 6 }}>Cập nhật {ago(r.locationAt)}{!r.isOnline && ' (đang ngoại tuyến)'}</div>
              </>
            ) : (
              <div className="muted">Chưa có vị trí — shipper chưa từng bật trực tuyến.</div>
            )}
          </div>

          <div className="card">
            <h2>Liên hệ & thông tin</h2>
            <ContactButtons label="Shipper" phone={r.phone} />
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Loại</dt><dd>{r.riderType === 'STORE' ? 'Shipper của quán' : 'Shipper hệ thống'}</dd>
              <dt>Tham gia</dt><dd>{time(r.createdAt)}</dd>
              <dt>Tài khoản</dt><dd><StatusBadge status={r.userStatus} /></dd>
            </dl>
          </div>

          <div className="card">
            <h2>Hạn mức tiền thu hộ</h2>
            <Meter pct={codPct} tone={codPct >= 80 ? 'bad' : codPct >= 50 ? 'wait' : 'ok'} />
            <p className="muted">Vượt hạn mức thì shipper không nhận được đơn tiền mặt cho tới khi nộp tiền.</p>
            <div className="row">
              <input type="number" min={0} step={100000} value={codLimit} onChange={(e) => setCodLimit(Number(e.target.value))} aria-label="Hạn mức mới" />
              <button className="btn secondary" disabled={codLimit === r.codLimit} onClick={() => update({ codLimit }, `Đổi hạn mức thu hộ thành ${money(codLimit)}`, 'Đã đổi hạn mức')}>Lưu hạn mức</button>
            </div>
          </div>

          <div className="card">
            <h2>Nhật ký quản trị</h2>
            <History items={r.history} />
          </div>
        </div>
      </section>
    </>
  );
}
