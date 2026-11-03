'use client';

import { useState } from 'react';
import { contactLinks } from '@/lib/api';

export interface Activation {
  phone: string;
  code: string;
  expiresAt: string;
  message: string;
}

/**
 * Mã kích hoạt vừa cấp + nút gửi bằng app trên máy Admin (Phần 13.9) — không dùng dịch vụ SMS/Zalo trả phí.
 * Zalo không cho điền sẵn nội dung qua đường link, nên sao chép tin trước rồi dán vào khung chat.
 */
export function ActivationCard({ activation, onClose }: { activation: Activation; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const l = contactLinks(activation.phone);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(activation.message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="card" role="dialog" aria-label="Mã kích hoạt">
      <h2>Mã kích hoạt cho {activation.phone}</h2>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>{activation.code}</div>
      <p className="muted">Dùng 1 lần, hết hạn {new Date(activation.expiresAt).toLocaleString('vi-VN')}. Chỉ gửi đúng số đã gọi xác minh.</p>
      <p>{activation.message}</p>
      <div className="row">
        <a className="btn" href={`sms:${activation.phone}?body=${encodeURIComponent(activation.message)}`}>✉️ Gửi SMS</a>
        <a className="btn" href={l.zalo} target="_blank" rel="noreferrer" onClick={copy}>💬 Mở Zalo (tự sao chép tin)</a>
        <button className="btn secondary" onClick={copy}>{copied ? '✔ Đã sao chép' : '📋 Sao chép tin'}</button>
        <a className="btn secondary" href={l.call}>📞 Gọi đọc mã</a>
        <button className="btn secondary" onClick={onClose}>Xong</button>
      </div>
    </div>
  );
}
