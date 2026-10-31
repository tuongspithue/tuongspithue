'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api, getToken, setToken } from '@/lib/api';

type NavLink = { href: string; label: string; icon: string; count?: 'pending' };
const GROUPS: Array<{ title: string; links: NavLink[] }> = [
  {
    title: 'Vận hành',
    links: [
      { href: '/', label: 'Tổng quan', icon: '📊' },
      { href: '/map', label: 'Bản đồ trực tiếp', icon: '🗺️' },
      { href: '/orders', label: 'Đơn hàng', icon: '📦' },
    ],
  },
  {
    title: 'Đối tác & khách',
    links: [
      { href: '/stores', label: 'Quán', icon: '🏪' },
      { href: '/riders', label: 'Shipper', icon: '🛵' },
      { href: '/customers', label: 'Khách hàng', icon: '👥' },
      { href: '/partners', label: 'Duyệt hồ sơ', icon: '✅', count: 'pending' },
    ],
  },
  {
    title: 'Hệ thống',
    links: [
      { href: '/users', label: 'Quyền & xếp loại', icon: '⭐' },
      { href: '/config', label: 'Cấu hình', icon: '⚙️' },
      { href: '/ai', label: 'Kết nối AI', icon: '🤖' },
    ],
  },
];

/** Khung trang Admin Console (Phần 14.1). Chưa đăng nhập thì chuyển tới /login. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (pathname !== '/login' && !getToken()) router.replace('/login');
    else setReady(true);
    setOpen(false);
  }, [pathname, router]);

  // Số hồ sơ đối tác đang chờ duyệt, hiện cạnh mục "Duyệt hồ sơ".
  useEffect(() => {
    if (!ready || pathname === '/login') return;
    const load = () =>
      api<{ pendingPartners?: { stores: number; riders: number } }>('/v1/admin/dashboard')
        .then((d) => setPending((d.pendingPartners?.stores ?? 0) + (d.pendingPartners?.riders ?? 0)))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [ready, pathname]);

  if (pathname === '/login') return <>{children}</>;
  if (!ready) return null;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="shell">
      <div className="topbar">
        <button aria-label="Mở menu" onClick={() => setOpen(true)}>☰</button>
        <strong>Ship Quanh Tôi · Admin</strong>
      </div>
      <nav className={`nav ${open ? 'open' : ''}`} aria-label="Điều hướng chính" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="brand">
          <span className="logo">🛵</span>
          <div>
            Ship Quanh Tôi
            <small>Bảng điều hành</small>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="group">{g.title}</div>
            {g.links.map((l) => (
              <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>
                <span className="ico">{l.icon}</span>
                {l.label}
                {l.count === 'pending' && pending > 0 && <span className="count">{pending}</span>}
              </Link>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <button
          className="logout"
          onClick={() => {
            setToken(null);
            router.replace('/login');
          }}
        >
          ↩ Đăng xuất
        </button>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export function StateBadge({ state, label }: { state: string; label: string }) {
  const tone =
    state === 'HOAN_THANH' ? 'ok' : ['DA_HUY', 'CAN_CAN_THIEP', 'GIAO_THAT_BAI'].includes(state) ? 'bad' : state.startsWith('HEN_') ? 'sched' : ['CHO_QUAN_XAC_NHAN', 'DANG_TIM_SHIPPER', 'CHO_THANH_TOAN'].includes(state) ? 'wait' : 'info';
  return <span className={`badge tone-${tone}`}>{label}</span>;
}
