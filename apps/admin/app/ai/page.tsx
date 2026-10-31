'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, time } from '@/lib/api';

const TASK_LABELS: Record<string, string> = {
  assistant_chat: 'Trợ lý "Hỏi Quanh"',
  extract_json: 'Bóc tách JSON (menu từ chữ, yêu cầu mở)',
  moderation: 'Kiểm duyệt văn bản',
  summarize_review: 'Tóm tắt đánh giá',
  speech_to_text: 'Giọng nói → chữ',
};

/** Kết nối AI do Admin nhập — mặc định Groq (Phần 12.8). */
export default function AiPage() {
  const [data, setData] = useState<any>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [check, setCheck] = useState<any>(null);
  const [models, setModels] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api('/v1/admin/ai')
      .then((d) => {
        setData(d);
        const groq = d.providers.find((p: any) => p.isDefault);
        setBaseUrl(groq?.baseUrl ?? '');
        setCheck(groq?.lastCheck ?? null);
        setModels(Object.fromEntries(d.tasks.map((t: any) => [t.task, t.model ?? ''])));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <div className="error">{error}</div> : <div className="muted">Đang tải…</div>;
  const provider = data.providers.find((p: any) => p.isDefault);
  const available: string[] = check?.models ?? [];

  return (
    <>
      <h1>Kết nối AI</h1>
      <p className="muted">Khi chưa có key, key sai hoặc AI lỗi, các tính năng AI tự ẩn và ứng dụng chạy bình thường.</p>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="row">
          <strong>{provider.displayName}</strong>
          <span className={`badge ${check?.ok ? 'tone-ok' : check ? 'tone-bad' : 'tone-muted'}`}>
            {check ? (check.ok ? `Kết nối OK · ${check.latencyMs} ms` : `Lỗi: ${check.error}`) : 'Chưa kiểm tra'}
          </span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label style={{ flex: 1 }}>
            Đường dẫn kết nối
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={{ width: '100%' }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label style={{ flex: 1 }}>
            Khoá API {provider.hasKey && <span className="muted">(đang dùng key ••••{provider.keyLast4})</span>}
            <input type="password" autoComplete="off" placeholder={provider.hasKey ? 'Nhập key mới để thay' : 'Dán key Groq'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ width: '100%' }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => run(async () => {
            await api(`/v1/admin/ai/providers/${provider.code}`, { method: 'PUT', body: { baseUrl, apiKey: apiKey || undefined } });
            setApiKey('');
          }, 'Đã lưu. Key chỉ hiển thị 4 ký tự cuối.')}>Lưu</button>
          <button className="btn secondary" disabled={!provider.hasKey} onClick={() => run(() => api(`/v1/admin/ai/providers/${provider.code}/test`, { method: 'POST' }), 'Đã kiểm tra kết nối')}>
            Kiểm tra kết nối
          </button>
          {check?.at && <span className="muted">Lần kiểm tra gần nhất: {time(check.at)}</span>}
        </div>
      </div>

      <h2>Model theo tác vụ</h2>
      <table>
        <thead>
          <tr><th>Tác vụ</th><th>Model</th><th>Trạng thái</th><th /></tr>
        </thead>
        <tbody>
          {data.tasks.map((t: any) => (
            <tr key={t.task}>
              <td>{TASK_LABELS[t.task] ?? t.task}</td>
              <td>
                {available.length ? (
                  <select value={models[t.task] ?? ''} onChange={(e) => setModels({ ...models, [t.task]: e.target.value })} aria-label="Model">
                    <option value="">Chọn model…</option>
                    {available.map((m) => <option key={m}>{m}</option>)}
                  </select>
                ) : (
                  <input placeholder="Kiểm tra kết nối để lấy danh sách" value={models[t.task] ?? ''} onChange={(e) => setModels({ ...models, [t.task]: e.target.value })} aria-label="Model" />
                )}
              </td>
              <td><span className={`badge ${t.enabled ? 'tone-ok' : 'tone-muted'}`}>{t.enabled ? 'Đang bật' : 'Tắt'}</span></td>
              <td className="row">
                <button className="btn secondary" onClick={() => run(() => api(`/v1/admin/ai/tasks/${t.task}`, { method: 'PUT', body: { model: models[t.task] || undefined } }), 'Đã lưu model')}>Lưu model</button>
                <button className="btn" onClick={() => run(() => api(`/v1/admin/ai/tasks/${t.task}`, { method: 'PUT', body: { enabled: !t.enabled } }), t.enabled ? 'Đã tắt' : 'Đã bật')}>
                  {t.enabled ? 'Tắt' : 'Bật'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
