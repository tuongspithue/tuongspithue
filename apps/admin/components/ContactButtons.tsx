'use client';

import { contactLinks } from '@/lib/api';

/** Nút Gọi / SMS / Zalo mở app ngoài trên máy người dùng. */
export function ContactButtons({ label, phone }: { label: string; phone: string | null | undefined }) {
  if (!phone) return null;
  const l = contactLinks(phone);
  return (
    <div className="row">
      <strong>{label}</strong> <span className="muted">{phone}</span>
      <a className="btn secondary" href={l.call}>📞 Gọi</a>
      <a className="btn secondary" href={l.sms}>✉️ SMS</a>
      <a className="btn secondary" href={l.zalo} target="_blank" rel="noreferrer">💬 Zalo</a>
    </div>
  );
}
