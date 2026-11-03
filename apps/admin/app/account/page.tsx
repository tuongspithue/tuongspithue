'use client';

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, Loading, PageHead } from '@/components/ui';
import { API_BASE, api, setToken } from '@/lib/api';

interface Me {
  id: number;
  phone: string;
  name: string | null;
  roles: string[];
  hasPassword: boolean;
  via: 'code' | 'password' | null;
}

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Admin', OPS: 'Điều phối viên', CUSTOMER: 'Khách', MERCHANT_OWNER: 'Chủ quán', MERCHANT_STAFF: 'Nhân viên quán', RIDER: 'Shipper' };

/** Tài khoản của tôi: đặt/đổi mật khẩu đăng nhập Admin Console (Phần 13.9). */
function AccountInner() {
  const setup = useSearchParams().get('setup') === '1';
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Me>('/v1/auth/me').then(setMe).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Đã có mật khẩu và đang đăng nhập bằng mật khẩu thì phải nhập mật khẩu cũ để đổi.
  const needCurrent = !!me?.hasPassword && me.via === 'password';
  const problem =
    next.length > 0 && next.length < 8 ? 'Mật khẩu cần ít nhất 8 ký tự' : /^\d+$/.test(next) ? 'Không dùng mật khẩu chỉ toàn chữ số' : again && again !== next ? 'Hai lần nhập chưa khớp' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || next !== again) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{ accessToken: string; message: string }>('/v1/auth/password', {
        method: 'POST',
        body: { newPassword: next, ...(needCurrent ? { currentPassword: current } : {}) },
      });
      setToken(res.accessToken);
      setMsg(res.message);
      setCurrent('');
      setNext('');
      setAgain('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return error ? <div className="error">{error}</div> : <Loading />;

  return (
    <>
      <PageHead title="Tài khoản của tôi" sub="Đặt mật khẩu để lần sau đăng nhập bằng số điện thoại + mật khẩu, không cần xin mã kích hoạt." />
      {setup && !me.hasPassword && (
        <div className="card alert" style={{ marginBottom: 16 }}>
          <strong>🔒 Hãy đặt mật khẩu ngay</strong>
          <div className="muted">Mã kích hoạt chỉ dùng được 1 lần. Có mật khẩu rồi, bạn đăng nhập trên máy nào cũng được.</div>
        </div>
      )}
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="split">
        <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <h2>{me.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}</h2>
          {needCurrent && (
            <div className="field">
              <label htmlFor="current">Mật khẩu hiện tại</label>
              <input id="current" type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
          )}
          {me.hasPassword && !needCurrent && <div className="muted">Bạn đang đăng nhập bằng mã kích hoạt nên có thể đặt lại mật khẩu mà không cần mật khẩu cũ.</div>}
          <div className="field">
            <label htmlFor="new">Mật khẩu mới</label>
            <input id="new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="again">Nhập lại mật khẩu mới</label>
            <input id="again" type={show ? 'text' : 'password'} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
          </div>
          <label className="switch">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Hiện mật khẩu
          </label>
          {problem && <div className="tone-bad" style={{ fontSize: 13 }}>{problem}</div>}
          <div className="muted" style={{ fontSize: 12.5 }}>Ít nhất 8 ký tự, nên có chữ và số. Lưu mật khẩu sẽ đăng xuất các máy khác đang đăng nhập tài khoản này.</div>
          <div>
            <button className="btn" disabled={busy || !!problem || !next || next !== again}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
          </div>
        </form>

        <div className="card">
          <div className="who" style={{ marginBottom: 12 }}>
            <Avatar name={me.name ?? me.phone} />
            <div>
              <div className="cell-main">{me.name ?? 'Chưa có tên'}</div>
              <div className="cell-sub">{me.phone}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Vai trò</dt>
            <dd className="row">{me.roles.filter((r) => r !== 'CUSTOMER').map((r) => <Badge key={r} tone="primary">{ROLE_LABELS[r] ?? r}</Badge>)}</dd>
            <dt>Mật khẩu</dt>
            <dd>{me.hasPassword ? <Badge tone="ok">Đã đặt</Badge> : <Badge tone="wait">Chưa đặt</Badge>}</dd>
            <dt>Phiên này</dt>
            <dd>{me.via === 'password' ? 'Đăng nhập bằng mật khẩu (30 ngày)' : 'Đăng nhập bằng mã kích hoạt'}</dd>
          </dl>
        </div>
      </div>

      <ServerAddressCard />
    </>
  );
}

/** Địa chỉ máy chủ để quán/shipper nhập vào app ở lần mở đầu tiên (màn "Kết nối máy chủ"). */
function ServerAddressCard() {
  const [copied, setCopied] = useState(false);
  const local = API_BASE.includes('localhost');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(API_BASE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
      <h2>📱 Địa chỉ máy chủ cho app quán & shipper</h2>
      <div className="muted">Lần đầu mở app, quán/shipper được hỏi địa chỉ này. Bấm Sao chép rồi gửi cho họ qua Zalo.</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <code data-testid="server-address" style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-soft, rgba(0,0,0,.05))', wordBreak: 'break-all' }}>{API_BASE}</code>
        <button type="button" className="btn" onClick={copy}>{copied ? 'Đã sao chép ✓' : 'Sao chép'}</button>
      </div>
      {local && (
        <div className="tone-bad" style={{ fontSize: 13 }}>
          Đây là địa chỉ trên máy chạy thử, điện thoại không vào được. Trong Codespace hãy chạy <code>bash scripts/codespace.sh</code> để Admin Console dùng địa chỉ cổng 3000 công khai.
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountInner />
    </Suspense>
  );
}
