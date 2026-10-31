/**
 * Ghi chú theo sở thích cho từng món — Phần 2.1.4a.
 */

export const ITEM_NOTE_MAX_LENGTH = 150;
export const ORDER_NOTE_MAX_LENGTH = 200;

export const ALLERGENS = ['PEANUT', 'SEAFOOD', 'MILK', 'EGG', 'GLUTEN', 'SOY', 'TREE_NUT', 'OTHER'] as const;
export type Allergen = (typeof ALLERGENS)[number];

const PHONE_PATTERN = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/g;
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

export interface NoteInput {
  note?: string | null;
  tags?: string[] | null;
  allergens?: string[] | null;
}

export interface SanitizedNote {
  note: string | null;
  tags: string[];
  allergens: Allergen[];
}

export class NoteValidationError extends Error {
  constructor(public readonly code: 'NOTE_TOO_LONG' | 'UNKNOWN_ALLERGEN' | 'NOTES_DISABLED', message: string) {
    super(message);
  }
}

/** Lọc số điện thoại và đường link, chuẩn hoá khoảng trắng, kiểm tra độ dài. */
export function sanitizeNoteText(text: string | null | undefined, maxLength: number): string | null {
  if (text == null) return null;
  const cleaned = text
    .replace(PHONE_PATTERN, '[đã ẩn]')
    .replace(LINK_PATTERN, '[đã ẩn]')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > maxLength) {
    throw new NoteValidationError('NOTE_TOO_LONG', `Ghi chú tối đa ${maxLength} ký tự`);
  }
  return cleaned;
}

export function sanitizeItemNote(input: NoteInput, opts: { notesDisabled?: boolean } = {}): SanitizedNote {
  const hasNote = Boolean(input.note?.trim()) || Boolean(input.tags?.length);
  if (opts.notesDisabled && hasNote) {
    throw new NoteValidationError('NOTES_DISABLED', 'Món này không nhận ghi chú');
  }
  const allergens = [...new Set(input.allergens ?? [])];
  for (const a of allergens) {
    if (!(ALLERGENS as readonly string[]).includes(a)) {
      throw new NoteValidationError('UNKNOWN_ALLERGEN', `Dị ứng không hợp lệ: ${a}`);
    }
  }
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 10);
  return {
    note: sanitizeNoteText(input.note, ITEM_NOTE_MAX_LENGTH),
    tags,
    allergens: allergens as Allergen[],
  };
}
