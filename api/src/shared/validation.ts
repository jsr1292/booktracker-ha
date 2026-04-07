// Shared validation/sanitization utilities for Book Tracker API
// NOTE: Client-side code in client/src/lib/db.ts has a duplicate copy
// (it cannot directly import from this server module).

/** Strip HTML/script tags to prevent XSS */
export function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

/** Clamp pages to positive integer, null if invalid */
export function safePages(pages: unknown): number | null {
  const n = Number(pages);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999999);
}

/** Return null if date is invalid */
export function safeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string' || !dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

/** Return positive number of days between dates, null if invalid */
export function safeDaysBetween(start: string, end: string): number | null {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 0 ? Math.round(diff) : null;
}

export const VALID_STATUSES = ['reading', 'finished', 'abandoned', 'planned'] as const;
export const MAX_NOTES = 10000;
