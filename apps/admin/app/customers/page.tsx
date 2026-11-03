'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Chips, Empty, Loading, PageHead, StatusBadge } from '@/components/ui';
import { ago, api, money } from '@/lib/api';

interface Customer {
  id: number;
  name: string | null;
  phone: string;
  status: string;
  orders: number;
  completed: number;
  cancelled: number;
  failed: number;
  spent: number;
  lastOrderAt: string | null;
  createdAt: string;
}
type Filter = 'ALL' | 'NEW' | 'LOYAL' | 'RISK' | 'LOCKED';

/**
 * Khách hàng: khách đặt không cần xác minh nên Admin cần thấy ngay ai mới, ai bùng đơn (Phần 13.9, 15).
 * SĐT che bớt trong danh sách; xem đủ trong hồ sơ.
 */
export default function CustomersPage() {
  const router = useRouter();
  const [list, setList] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ customers: Customer[] }>(`/v1/admin/customers?q=${encodeURIComponent(q)}`)
        .then((d) => {
          setList(d.customers);
          setError(null);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const risky = (c: Customer) => c.cancelled + c.failed >= 2 && c.cancelled + c.failed >= c.completed;
  const shown = useMemo(
    () =>
      (list ?? []).filter((c) =>
        filter === 'ALL' ? true : filter === 'NEW' ? c.completed === 0 : filter === 'LOYAL' ? c.completed >= 5 : filter === 'RISK' ? risky(c) : c.status === 'LOCKED',
      ),
    [list, filter],
  );
  const count = (f: Filter) => (list ?? []).filter((c) => (f === 'NEW' ? c.completed === 0 : f === 'LOYAL' ? c.completed >= 5 : f === 'RISK' ? risky(c) : c.status === 'LOCKED')).length;

  return (
    <>
      <PageHead title="Khách hàng" sub="Khách đặt bằng tên + số điện thoại, không cần mã. Theo dõi khách mới và khách hay huỷ/bùng đơn ở đây." />
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <div className="search">
          <input placeholder="Tìm tên hoặc số điện thoại (đủ hoặc vài số cuối)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm khách" />
        </div>
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'Tất cả', count: list?.length },
            { value: 'NEW', label: '🆕 Khách mới', count: count('NEW') },
            { value: 'LOYAL', label: '💛 Thân thiết (≥ 5 đơn)', count: count('LOYAL') },
            { value: 'RISK', label: '⚠️ Hay huỷ/bùng', count: count('RISK') },
            { value: 'LOCKED', label: '⛔ Đã khoá', count: count('LOCKED') },
          ]}
        />
      </div>
      {!list ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Khách</th>
                <th>Trạng thái</th>
                <th className="num">Đơn</th>
                <th className="num">Hoàn thành</th>
                <th className="num">Huỷ / giao thất bại</th>
                <th className="num">Đã chi</th>
                <th>Đơn gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => router.push(`/customers/${c.id}`)}>
                  <td>
                    <div className="who">
                      <Avatar name={c.name ?? c.phone} />
                      <div>
                        <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name ?? 'Chưa có tên'}</Link>
                        <div className="cell-sub">{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                    {c.completed === 0 && <div style={{ marginTop: 4 }}><Badge tone="primary">Khách mới</Badge></div>}
                    {risky(c) && <div style={{ marginTop: 4 }}><Badge tone="bad">Hay huỷ/bùng</Badge></div>}
                  </td>
                  <td className="num">{c.orders}</td>
                  <td className="num tone-ok">{c.completed}</td>
                  <td className={`num ${c.cancelled + c.failed ? 'tone-bad' : ''}`}>{c.cancelled} / {c.failed}</td>
                  <td className="num">{money(c.spent)}</td>
                  <td className="cell-sub">{ago(c.lastOrderAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <Empty icon="🔎">Không có khách nào khớp bộ lọc</Empty>}
        </div>
      )}
    </>
  );
}
