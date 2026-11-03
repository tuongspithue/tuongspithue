'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, time } from '@/lib/api';

interface Definition {
  key: string;
  module: string;
  description: string;
  type: 'INT' | 'MONEY' | 'BOOL' | 'JSON';
  default: unknown;
  min?: number;
  max?: number;
  scopes: string[];
  invariant: boolean;
  effective: { value: unknown; source: string; version: number | null };
  overrides: Array<{ scope: string; scopeId: string; value: unknown; version: number }>;
}

const SCOPE_LABELS: Record<string, string> = { GLOBAL: 'Toàn hệ thống', CATEGORY: 'Ngành hàng', STORE: 'Quán', DEFAULT: 'Mặc định' };
const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

function Editor({ def, onSaved }: { def: Definition; onSaved: () => void }) {
  const [scope, setScope] = useState(def.scopes[0]);
  const [scopeId, setScopeId] = useState('');
  const [value, setValue] = useState(show(def.effective.value));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);

  function parse(): unknown {
    if (def.type === 'BOOL') return value === 'true';
    if (def.type === 'JSON') return JSON.parse(value);
    return Number(value);
  }

  async function save() {
    setError(null);
    try {
      await api(`/v1/admin/config/${def.key}`, { method: 'PUT', body: { scope, scopeId: scope === 'GLOBAL' ? undefined : scopeId, value: parse(), reason } });
      setReason('');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rollback(h: any) {
    const why = window.prompt(`Lý do hoàn tác về v${h.version}:`);
    if (!why) return;
    try {
      await api(`/v1/admin/config/${def.key}/rollback`, { method: 'POST', body: { scope: h.scope_type, scopeId: h.scope_id || undefined, version: h.version, reason: why } });
      onSaved();
      setHistory(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (def.invariant) return <div className="muted">🔒 Nguyên tắc bất biến — không thể thay đổi.</div>;

  return (
    <div>
      <div className="row">
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Tầng áp dụng">
          {def.scopes.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS[s]}
            </option>
          ))}
        </select>
        {scope !== 'GLOBAL' && <input placeholder={scope === 'STORE' ? 'Mã quán' : 'Mã ngành (VD FOOD)'} value={scopeId} onChange={(e) => setScopeId(e.target.value)} />}
        {def.type === 'BOOL' ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Giá trị">
            <option value="true">Bật</option>
            <option value="false">Tắt</option>
          </select>
        ) : def.type === 'JSON' ? null : (
          <input type="number" value={value} min={def.min} max={def.max} onChange={(e) => setValue(e.target.value)} aria-label="Giá trị" />
        )}
        <input placeholder="Lý do thay đổi (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" disabled={reason.trim().length < 3} onClick={save}>
          Lưu
        </button>
        <button className="btn secondary" onClick={() => api(`/v1/admin/config/${def.key}/history`).then((r) => setHistory(r.history))}>
          Lịch sử
        </button>
      </div>
      {def.type === 'JSON' && <textarea rows={5} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Giá trị JSON" />}
      {(def.min !== undefined || def.max !== undefined) && (
        <div className="muted">
          Khoảng cho phép: {def.min} – {def.max}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {history && (
        <table style={{ marginTop: 8 }}>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td>
                  v{h.version} · {SCOPE_LABELS[h.scope_type]} {h.scope_id}
                </td>
                <td>{show(h.value)}</td>
                <td>{h.status}</td>
                <td>
                  {h.reason}
                  <div className="muted">
                    {time(h.created_at)} · {h.by_phone}
                  </div>
                </td>
                <td>
                  <button className="btn secondary" onClick={() => rollback(h)}>
                    Hoàn tác về bản này
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Trung tâm cấu hình phân tầng (Phần 14.6). */
export default function ConfigPage() {
  const [defs, setDefs] = useState<Definition[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ definitions: Definition[] }>('/v1/admin/config')
      .then((r) => setDefs(r.definitions))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (!defs) return error ? <div className="error">{error}</div> : <div className="muted">Đang tải…</div>;
  return (
    <>
      <h1>Cấu hình</h1>
      <p className="muted">Giá trị ở tầng cụ thể nhất được áp dụng: quán → ngành → toàn hệ thống → mặc định. Có hiệu lực trong khoảng 30 giây, không cần phát hành app.</p>
      <table>
        <thead>
          <tr>
            <th>Tham số</th>
            <th>Đang áp dụng (toàn hệ thống)</th>
            <th>Ghi đè</th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => (
            <tr key={d.key}>
              <td>
                <button className="btn secondary" onClick={() => setOpen(open === d.key ? null : d.key)} aria-expanded={open === d.key}>
                  {d.invariant ? '🔒 ' : ''}
                  {d.description}
                </button>
                <div className="muted">{d.key}</div>
                {open === d.key && (
                  <div style={{ marginTop: 8 }}>
                    <Editor def={d} onSaved={load} />
                  </div>
                )}
              </td>
              <td>
                {show(d.effective.value)}
                <div className="muted">từ: {SCOPE_LABELS[d.effective.source]}</div>
              </td>
              <td>
                {d.overrides.map((o) => (
                  <div key={`${o.scope}-${o.scopeId}`}>
                    {SCOPE_LABELS[o.scope]} {o.scopeId}: {show(o.value)} <span className="muted">v{o.version}</span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
