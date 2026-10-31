'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ApiError, api, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'phone') {
        const res = await api<{ devCode?: string }>('/v1/auth/otp/request', { method: 'POST', body: { phone } });
        setHint(res.devCode ? `Mã thử nghiệm: ${res.devCode}` : 'Đã gửi mã OTP tới số điện thoại');
        setStep('code');
      } else {
        const res = await api<{ accessToken: string }>('/v1/auth/otp/verify', { method: 'POST', body: { phone, code } });
        setToken(res.accessToken);
        // Chỉ ADMIN/OPS vào được Admin Console.
        await api('/v1/admin/dashboard');
        router.replace('/');
      }
    } catch (err) {
      setToken(null);
      setError(err instanceof ApiError && err.status === 403 ? 'Tài khoản này không có quyền vào Admin Console' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>Đăng nhập Admin Console</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="phone">Số điện thoại</label>
        <input id="phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" disabled={step === 'code'} required />
        {step === 'code' && (
          <>
            <label htmlFor="code">Mã OTP</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required autoFocus />
          </>
        )}
        {hint && <div className="muted">{hint}</div>}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" disabled={busy}>
          {step === 'phone' ? 'Gửi mã' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
