'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { CATEGORY_LABELS, PARTNER_STATUS, TIER_LABELS } from '@/lib/api';

/** Tiêu đề trang: đường dẫn, tên, mô tả ngắn và các nút thao tác. */
export function PageHead({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: Array<[string, string]>; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map(([href, label], i) => (
              <span key={href}>
                {i > 0 && ' / '}
                <Link href={href}>{label}</Link>
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ icon, label, value, hint, tone, href, alert }: { icon: string; label: string; value: ReactNode; hint?: ReactNode; tone?: string; href?: string; alert?: boolean }) {
  const body = (
    <>
      <div className="chip" aria-hidden>{icon}</div>
      <div>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
    </>
  );
  const cls = `card stat ${tone ? `tone-${tone}` : ''} ${alert ? 'alert' : ''}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Badge({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone ? `tone-${tone}` : ''}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const s = PARTNER_STATUS[status] ?? { label: status, tone: 'muted' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function TierBadge({ tier, score }: { tier: string; score?: number | null }) {
  const t = TIER_LABELS[tier] ?? { label: tier, tone: 'muted' };
  return (
    <Badge tone={t.tone}>
      {t.label}
      {score != null && <span style={{ opacity: 0.75 }}>· {Math.round(score)}</span>}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_LABELS[category];
  return <span className="badge">{c ? `${c.icon} ${c.label}` : category}</span>;
}

export function OnlineBadge({ online, busy }: { online: boolean; busy?: boolean }) {
  if (!online) return <Badge><span className="dot" /> Ngoại tuyến</Badge>;
  return busy ? <Badge tone="info"><span className="dot" /> Đang chạy chuyến</Badge> : <Badge tone="ok"><span className="dot" /> Trực tuyến</Badge>;
}

const AVATAR_COLORS = ['#ff6b2c', '#8b5cf6', '#0ea5e9', '#14b8a6', '#ec4899', '#f59e0b', '#22c55e', '#6366f1'];

/** Ảnh đại diện bằng chữ cái đầu, màu cố định theo tên. */
export function Avatar({ name, color }: { name?: string | null; color?: string }) {
  const text = (name ?? '?').trim();
  // Chưa có tên (chỉ có số điện thoại) thì hiện "?" thay vì chữ số.
  const initials = /\p{L}/u.test(text) ? text.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() : '?';
  const bg = color ?? AVATAR_COLORS[[...text].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span className="avatar" style={{ background: bg }}>{initials}</span>;
}

/** Nhóm nút lọc dạng "chip", kèm số lượng. */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; count?: number }>; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip-btn ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = '📭', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="big">{icon}</span>
      {children}
    </div>
  );
}

export function Loading() {
  return <div className="empty">Đang tải…</div>;
}

export function Meter({ pct, tone }: { pct: number | null; tone?: 'ok' | 'wait' | 'bad' }) {
  if (pct == null) return <span className="muted">—</span>;
  const color = tone ?? (pct >= 85 ? 'ok' : pct >= 60 ? 'wait' : 'bad');
  const v = color === 'ok' ? 'var(--confirmed)' : color === 'wait' ? 'var(--waiting)' : 'var(--danger)';
  return (
    <div style={{ minWidth: 90 }}>
      <div className="meter"><span style={{ width: `${Math.min(100, pct)}%`, background: v }} /></div>
      <div className="cell-sub">{pct}%</div>
    </div>
  );
}

/** Hỏi lý do trước mọi thao tác quản trị (bắt buộc ghi nhật ký — Phần 14.8). */
export function askReason(what: string): string | null {
  const r = window.prompt(`${what}\n\nLý do (bắt buộc, sẽ ghi vào nhật ký):`);
  if (r === null) return null;
  if (r.trim().length < 3) {
    window.alert('Lý do cần ít nhất 3 ký tự');
    return null;
  }
  return r.trim();
}

export const ACTION_LABELS: Record<string, string> = {
  STORE_APPROVED: 'Duyệt / mở khoá quán',
  STORE_SUSPENDED: 'Tạm khoá quán',
  STORE_REJECTED: 'Từ chối hồ sơ quán',
  STORE_UPDATED: 'Sửa thông tin quán',
  MENU_ITEM_ON: 'Bật món',
  MENU_ITEM_OFF: 'Tắt món (hết hàng)',
  RIDER_APPROVED: 'Duyệt / mở khoá shipper',
  RIDER_SUSPENDED: 'Tạm khoá shipper',
  RIDER_REJECTED: 'Từ chối hồ sơ shipper',
  RIDER_UPDATED: 'Sửa thông tin shipper',
  USER_LOCKED: 'Khoá tài khoản',
  USER_ACTIVE: 'Mở khoá tài khoản',
  ACTIVATION_CODE_ISSUED: 'Cấp mã kích hoạt',
};

export function History({ items }: { items: Array<{ action: string; reason: string | null; at: string; actor: string }> }) {
  if (!items.length) return <div className="muted">Chưa có thao tác quản trị nào.</div>;
  return (
    <ul className="timeline">
      {items.map((h, i) => (
        <li key={i}>
          <strong>{ACTION_LABELS[h.action] ?? h.action}</strong>
          <div className="cell-sub">
            {new Date(h.at).toLocaleString('vi-VN', { hour12: false })} · {h.actor}
            {h.reason ? ` — ${h.reason}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
