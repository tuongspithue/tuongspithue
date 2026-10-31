/**
 * Đọc danh sách món dạng chữ quán dán/gõ (Phần 2.2.2, 12.3-6) — phương án không-AI.
 * VD: "Cơm sườn 35k, Cơm gà 40k" · "Trà đá - 5.000đ" · "Phở bò: 55000" · dòng "Đồ uống:" là tên nhóm.
 */

export interface MenuDraftItem {
  section: string | null;
  name: string;
  price: number;
}

const PRICE = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|ng|đ|d|vnd|vnđ|tr|triệu)?\s*$/i;

function toVnd(amount: string, unit: string | undefined): number | null {
  const u = (unit ?? '').toLowerCase();
  const hasThousandSep = /^\d{1,3}([.,]\d{3})+$/.test(amount);
  const n = hasThousandSep ? Number(amount.replace(/[.,]/g, '')) : Number(amount.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  let value: number;
  if (['k', 'nghìn', 'ngàn', 'ng'].includes(u)) value = n * 1000;
  else if (['tr', 'triệu'].includes(u)) value = n * 1_000_000;
  else value = n < 1000 && !hasThousandSep ? n * 1000 : n; // "35" trong menu quán thường là 35.000đ
  return Math.round(value / 100) * 100;
}

export function parseMenuText(text: string): MenuDraftItem[] {
  const items: MenuDraftItem[] = [];
  let section: string | null = null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const pieces = line.split(/[,;]|\s+\|\s+/).map((p) => p.trim()).filter(Boolean);
    for (const raw of pieces) {
      const piece = raw.replace(/^[-•*\d.)\s]+(?=\D)/, '').trim();
      const m = piece.match(PRICE);
      if (!m || m.index === undefined || m.index === 0) {
        if (pieces.length === 1 && /:$/.test(piece)) section = piece.replace(/:$/, '').trim() || null;
        continue;
      }
      const name = piece.slice(0, m.index).replace(/[\s:–—-]+$/, '').trim();
      const price = toVnd(m[1], m[2]);
      if (name.length >= 2 && price !== null) items.push({ section, name: name.slice(0, 160), price });
    }
  }
  return items;
}
