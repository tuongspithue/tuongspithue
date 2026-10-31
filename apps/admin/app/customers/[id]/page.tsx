'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ContactButtons } from '@/components/ContactButtons';
import { StateBadge } from '@/components/Shell';
import { Avatar, Badge, Empty, History, Loading, PageHead, Stat, StatusBadge, askReason } from '@/components/ui';
import { STATE_LABELS, api, money, time } from '@/lib/api';

/** Hồ sơ khách: lịch sử đơn, tỉ lệ huỷ/bùng, khoá tài khoản (Phần 15). */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api(`/v1/admin/customers/${id}`).then(setC).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function setStatus(status: 'ACTIVE' | 'LOCKED') {
    const reason = askReason(status === 'LOCKED' ? 'Khoá tài khoản khách (đăng xuất mọi máy, không đặt được đơn)' : 'Mở khoá tài khoản khách');
    if (!reason) return;
    setMsg(null);
    setError(null);
    try {
      await api(`/v1/admin/users/${id}/status`, { method: 'PATCH', body: { status, reason } });
      setMsg(status === 'LOCKED' ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !c) return <div className="error">{error}</div>;
  if (!c) return <Loading />;
  const s = c.stats;
  const bad = s.cancelled + s.failed;

  return (
    <>
      <PageHead
        crumbs={[['/customers', 'Khách hàng']]}
        title={<span className="who"><Avatar name={c.name ?? c.phone} />{c.name ?? 'Chưa có tên'}</span>}
        sub={
          <span className="row">
            <StatusBadge status={c.status} />
            {s.completed === 0 && <Badge tone="primary">Khách mới — chưa có đơn hoàn thành</Badge>}
            <span className="muted">Tham gia {time(c.createdAt)}</span>
          </span>
        }
        actions={
          c.status === 'LOCKED' ? (
            <button className="btn success" onClick={() => setStatus('ACTIVE')}>✅ Mở khoá</button>
          ) : (
            <button className="btn danger" onClick={() => setStatus('LOCKED')}>⛔ Khoá tài khoản</button>
          )
        }
      />
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="grid">
        <Stat icon="📦" label="Tổng đơn" value={s.orders} tone="info" />
        <Stat icon="✅" label="Hoàn thành" value={s.completed} tone="ok" />
        <Stat icon="⚠️" label="Huỷ / giao thất bại" value={`${s.cancelled} / ${s.failed}`} tone="bad" alert={bad >= 2 && bad >= s.completed} />
        <Stat icon="💰" label="Đã chi" value={money(s.spent)} tone="wait" />
      </div>

      <section className="split">
        <div className="card">
          <h2>Lịch sử đơn</h2>
          {c.recentOrders.length === 0 ? (
            <Empty>Khách chưa đặt đơn nào</Empty>
          ) : (
            <div className="table-wrap" style={{ boxShadow: 'none' }}>
              <table>
                <thead><tr><th>Mã đơn</th><th>Trạng thái</th><th>Quán</th><th>Giao tới</th><th className="num">Tổng</th><th>Lúc đặt</th></tr></thead>
                <tbody>
                  {c.recentOrders.map((o: any) => (
                    <tr key={o.id}>
                      <td><Link href={`/orders/${o.id}`}>{o.code}</Link></td>
                      <td><StateBadge state={o.state} label={STATE_LABELS[o.state] ?? o.state} /></td>
                      <td>{o.storeName}</td>
                      <td className="cell-sub">{o.address ?? 'Tự đến lấy'}</td>
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
            <h2>Liên hệ</h2>
            <ContactButtons label="Khách" phone={c.phone} />
            <p className="muted">Khách đặt không cần mã xác minh. Với khách mới hoặc đơn lớn, quán/điều phối viên nên gọi xác nhận.</p>
          </div>
          <div className="card">
            <h2>Nhật ký quản trị</h2>
            <History items={c.history} />
          </div>
        </div>
      </section>
    </>
  );
}
