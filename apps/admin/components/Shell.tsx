'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { getToken, setToken } from '@/lib/api';

const LINKS = [
  { href: '/', label: '📊 Tổng quan' },
  { href: '/orders', label: '📦 Đơn hàng' },
  { href: '/partners', label: '🏪 Duyệt đối tác' },
  { href: '/users', label: '⭐ Quyền & xếp loại' },
  { href: '/config', label: '⚙️ Cấu hình' },
  { href: '/ai', label: '🤖 Kết nối AI' },
];

/** Khung trang Admin Console (Phần 14.1). Chưa đăng nhập thì chuyển tới /login. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname !== '/login' && !getToken()) router.replace('/login');
    else setReady(true);
  }, [pathname, router]);

  if (pathname === '/login') return <>{children}</>;
  if (!ready) return null;

  return (
    <div className="shell">
      <nav className="nav" aria-label="Điều hướng chính">
        <div className="brand">
          Ship <span>Quanh Tôi</span> · Admin
        </div>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={(l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)) ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
        <div className="spacer" />
        <button
          className="btn secondary"
          onClick={() => {
            setToken(null);
            router.replace('/login');
          }}
        >
          Đăng xuất
        </button>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export function StateBadge({ state, label }: { state: string; label: string }) {
  const tone =
    state === 'HOAN_THANH' ? 'ok' : ['DA_HUY', 'CAN_CAN_THIEP', 'GIAO_THAT_BAI'].includes(state) ? 'bad' : state.startsWith('HEN_') ? 'sched' : ['CHO_QUAN_XAC_NHAN', 'DANG_TIM_SHIPPER', 'CHO_THANH_TOAN'].includes(state) ? 'wait' : 'muted';
  return <span className={`badge tone-${tone}`}>{label}</span>;
}
