'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Chips } from '@/components/ui';
import { ApiError, api, setToken } from '@/lib/api';

type Mode = 'password' | 'code';
const MODE_KEY = 'sqt-admin-login-mode';

/**
 * Đăng nhập Admin Console (Phần 13.9): SĐT + mật khẩu tự đặt, hoặc SĐT + mã kích hoạt 8 số
 * (lần đầu, hoặc khi quên mật khẩu). Chỉ tài khoản ADMIN/OPS vào được.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'code' || m === 'password') setMode(m);
    } catch {
      /* trình duyệt chặn lưu trữ: dùng mặc định */
    }
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setSecret('');
    setError(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* bỏ qua */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'password'
          ? await api<{ accessToken: string }>('/v1/auth/password-login', { method: 'POST', body: { phone, password: secret } })
          : await api<{ accessToken: string }>('/v1/auth/activate', { method: 'POST', body: { phone, code: secret } });
      setToken(res.accessToken);
      // Chỉ ADMIN/OPS vào được Admin Console.
      await api('/v1/admin/dashboard');
      // Đăng nhập bằng mã mà chưa có mật khẩu: mời đặt mật khẩu để lần sau khỏi xin mã.
      const me = await api<{ hasPassword: boolean }>('/v1/auth/me');
      router.replace(me.hasPassword ? '/' : '/account?setup=1');
    } catch (err) {
      setToken(null);
      const e2 = err as ApiError;
      if (e2.code === 'PASSWORD_NOT_SET') switchMode('code');
      setError(e2.status === 403 && e2.code !== 'ACCOUNT_LOCKED' ? 'Tài khoản này không có quyền vào Admin Console' : e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 44 }}>🛵</div>
        <h1>Ship Quanh Tôi · Admin</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Bảng điều hành dành cho Admin và điều phối viên</p>
      </div>
      <form className="card" onSubmit={submit}>
        <Chips
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'password', label: '🔒 Mật khẩu' },
            { value: 'code', label: '🔑 Mã kích hoạt' },
          ]}
        />
        <div className="field">
          <label htmlFor="phone">Số điện thoại</label>
          <input id="phone" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value.trim())} placeholder="0901234567" required />
        </div>
        {mode === 'password' ? (
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} required style={{ flex: 1 }} />
              <button type="button" className="btn secondary small" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                {show ? '🙈' : '👁️'}
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Quên mật khẩu hoặc lần đầu đăng nhập? Chọn <a href="#" onClick={(e) => { e.preventDefault(); switchMode('code'); }}>Mã kích hoạt</a>.
            </span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="code">Mã kích hoạt (8 số)</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" value={secret} onChange={(e) => setSecret(e.target.value.trim())} maxLength={8} required />
            <span className="muted" style={{ fontSize: 12.5 }}>
              Mã dùng 1 lần, do Admin khác cấp (Duyệt hồ sơ → Cấp lại mã). Admin đầu tiên lấy mã trên máy chủ:{' '}
              <code>bash scripts/codespace.sh code &lt;SĐT&gt;</code>. Đăng nhập xong hãy đặt mật khẩu để lần sau khỏi xin mã.
            </span>
          </div>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}
