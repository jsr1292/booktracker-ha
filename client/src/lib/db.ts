/**
 * IndexedDB layer via Dexie.js — local-first storage for Book Tracker.
 * Replaces the Express + SQLite backend.
 *
 * NOTE: Validation helpers (sanitize, safePages, safeDate, safeDaysBetween,
 * VALID_STATUSES, MAX_NOTES) are duplicated here and in api/src/shared/validation.ts.
 * The client cannot import from the server module directly, so it keeps its own copy.
 */

import Dexie, { type Table } from 'dexie';
import type { Book, Stats as AppStats } from '../types';
import { getServerId, setServerId, removeServerId } from './serverIdMap';

// ── Token helpers (inline, avoid circular import) ────────────────────────

function getToken(): string | null {
  return localStorage.getItem('booktracker_token');
}

function isLoggedIn(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('booktracker_token');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Dexie database ────────────────────────────────────────────────────────
class BookTrackerDB extends Dexie {
  books!: Table<Book, number>;

  constructor() {
    super('BookTrackerDB');
    // Version 1: Initial schema with no migration path needed
    this.version(1).stores({
      books: '++id, title, author, status, rating, pages, genre, language, date_started, date_finished, created_at',
    });
    // Future migrations example:
    // this.version(2).stores({ ... }).migrate(book => { ... });
  }
}

export const db = new BookTrackerDB();

// Re-export Stats and Achievement from types.ts
export type { Stats, Achievement } from '../types';

// ── Helpers (mirrors server-side sanitisation) ──────────────────────────

/** Strip HTML/script tags to prevent XSS */
function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

/** Clamp pages to positive integer, null if invalid */
function safePages(pages: unknown): number | null {
  const n = Number(pages);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999999);
}

/** Return null if date is invalid */
function safeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string' || !dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

/** Return positive number of days between dates, null if invalid */
function safeDaysBetween(start: string, end: string): number | null {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 0 ? Math.round(diff) : null;
}

const VALID_STATUSES = ['reading', 'finished', 'abandoned', 'planned'] as const;
const MAX_NOTES = 10000;

// ── CRUD ─────────────────────────────────────────────────────────────────

export async function getBooks(options?: {
  status?: string;
  genre?: string;
  search?: string;
}): Promise<Book[]> {
  let result: Book[];

  if (options?.status && VALID_STATUSES.includes(options.status as any)) {
    // Use indexed query for status filtering
    result = await db.books.where('status').equals(options.status).reverse().toArray();
  } else {
    result = await db.books.orderBy('created_at').reverse().toArray();
  }

  if (options?.genre) {
    result = result.filter(b => b.genre === options.genre);
  }
  if (options?.search) {
    const term = options.search.toLowerCase();
    result = result.filter(
      b =>
        b.title.toLowerCase().includes(term) ||
        (b.author?.toLowerCase().includes(term) ?? false),
    );
  }

  return result;
}

export async function getBook(id: number): Promise<Book | undefined> {
  return db.books.get(id);
}

export async function addBook(data: Omit<Book, 'id' | 'created_at' | 'updated_at'>): Promise<Book> {
  const cleanTitle = sanitize(data.title);
  if (!cleanTitle) throw new Error('title is required');

  const cleanAuthor = sanitize(data.author ?? '');
  const cleanNotes = (data.notes ?? '').slice(0, MAX_NOTES);
  const cleanDesc = sanitize(data.description ?? '');

  const status = VALID_STATUSES.includes(data.status as any) ? data.status : 'reading';

  const cleanDateStarted = safeDate(data.date_started);
  const cleanDateFinished = safeDate(data.date_finished);
  const cleanPlannedDate = safeDate(data.planned_date);

  const cleanRating =
    data.rating != null
      ? Math.min(5, Math.max(1, Math.round(Number(data.rating))))
      : null;

  const cleanPages = safePages(data.pages);

  const now = new Date().toISOString();

  const id = await db.books.add({
    title: cleanTitle,
    author: cleanAuthor || null,
    status,
    rating: cleanRating,
    pages: cleanPages,
    genre: sanitize(data.genre ?? '') || null,
    language: sanitize(data.language ?? '') || null,
    cover_url: typeof data.cover_url === 'string' ? data.cover_url.slice(0, 2000) : null,
    description: cleanDesc || null,
    date_started: cleanDateStarted,
    date_finished: cleanDateFinished,
    planned_date: cleanPlannedDate,
    notes: cleanNotes || null,
    created_at: now,
    updated_at: now,
  } as Book);

  markStatsDirty();

  // ── Background server sync ────────────────────────────────────────────
  if (isLoggedIn()) {
    const { createServerBook } = await import('./auth');
    createServerBook({
      title: cleanTitle,
      author: cleanAuthor || null,
      status,
      rating: cleanRating,
      pages: cleanPages,
      genre: sanitize(data.genre ?? '') || null,
      language: sanitize(data.language ?? '') || null,
      cover_url: typeof data.cover_url === 'string' ? data.cover_url.slice(0, 2000) : null,
      description: cleanDesc || null,
      date_started: cleanDateStarted,
      date_finished: cleanDateFinished,
      planned_date: cleanPlannedDate,
      notes: cleanNotes || null,
    }).then(serverBook => {
      setServerId(id, serverBook.id);
    }).catch(() => {
      // Best effort — local write succeeded
    });
  }

  return (await db.books.get(id))!;
}

export async function updateBook(
  id: number,
  data: Partial<Book>,
): Promise<Book> {
  const existing = await db.books.get(id);
  if (!existing) throw new Error('Book not found');

  const cleanTitle =
    data.title !== undefined
      ? (sanitize(data.title) || existing.title)
      : existing.title;

  const cleanAuthor =
    data.author !== undefined ? sanitize(data.author ?? '') : existing.author;

  const s =
    data.status !== undefined
      ? VALID_STATUSES.includes(data.status as any)
        ? data.status
        : existing.status
      : existing.status;

  const cleanRating =
    data.rating != null
      ? Math.min(5, Math.max(1, Math.round(Number(data.rating))))
      : existing.rating;

  const cleanPages =
    data.pages !== undefined ? safePages(data.pages) : existing.pages;

  const cleanDateStarted =
    data.date_started !== undefined
      ? data.date_started === null
        ? null
        : safeDate(data.date_started)
      : existing.date_started;

  let cleanDateFinished =
    data.date_finished !== undefined
      ? data.date_finished === null
        ? null
        : safeDate(data.date_finished)
      : existing.date_finished;

  // Validate date order — only when BOTH dates are explicitly provided in the update
  if (data.date_started !== undefined && data.date_finished !== undefined) {
    if (cleanDateStarted && cleanDateFinished) {
      const ds = new Date(cleanDateStarted + 'T00:00:00');
      const de = new Date(cleanDateFinished + 'T00:00:00');
      if (ds > de) throw new Error('date_started cannot be after date_finished');
    }
  }

  const cleanNotes =
    data.notes !== undefined
      ? (data.notes ?? '').slice(0, MAX_NOTES) || null
      : existing.notes;

  const now = new Date().toISOString();

  await db.books.update(id, {
    title: cleanTitle,
    author: cleanAuthor ?? null,
    status: s,
    rating: cleanRating,
    pages: cleanPages,
    genre: data.genre !== undefined ? (sanitize(data.genre ?? '') || null) : existing.genre,
    language: data.language !== undefined ? (sanitize(data.language ?? '') || null) : existing.language,
    cover_url:
      data.cover_url !== undefined
        ? typeof data.cover_url === 'string'
          ? data.cover_url.slice(0, 2000)
          : null
        : existing.cover_url,
    description:
      data.description !== undefined
        ? sanitize(data.description ?? '') || null
        : existing.description,
    date_started: cleanDateStarted,
    date_finished: cleanDateFinished,
    planned_date:
      data.planned_date !== undefined
        ? safeDate(data.planned_date)
        : existing.planned_date,
    notes: cleanNotes,
    updated_at: now,
  });

  markStatsDirty();

  // ── Background server sync ────────────────────────────────────────────
  if (isLoggedIn()) {
    const serverId = getServerId(id);
    if (serverId) {
      const { updateServerBook } = await import('./auth');
      updateServerBook(serverId, {
        title: cleanTitle,
        author: cleanAuthor ?? null,
        status: s,
        rating: cleanRating,
        pages: cleanPages,
        genre: data.genre !== undefined ? (sanitize(data.genre ?? '') || null) : existing.genre,
        language: data.language !== undefined ? (sanitize(data.language ?? '') || null) : existing.language,
        cover_url:
          data.cover_url !== undefined
            ? typeof data.cover_url === 'string'
              ? data.cover_url.slice(0, 2000)
              : null
            : existing.cover_url,
        description:
          data.description !== undefined
            ? sanitize(data.description ?? '') || null
            : existing.description,
        date_started: cleanDateStarted,
        date_finished: cleanDateFinished,
        planned_date:
          data.planned_date !== undefined
            ? safeDate(data.planned_date)
            : existing.planned_date,
        notes: cleanNotes,
      }).catch(() => {
        // Best effort — local write succeeded
      });
    }
  }

  return (await db.books.get(id))!;
}

export async function deleteBook(id: number): Promise<void> {
  await db.books.delete(id);
  markStatsDirty();

  // ── Background server sync ────────────────────────────────────────────
  if (isLoggedIn()) {
    const serverId = getServerId(id);
    if (serverId) {
      const { deleteServerBook } = await import('./auth');
      deleteServerBook(serverId).catch(() => {
        // Best effort
      });
    }
    removeServerId(id);
  }
}

// ── Stats cache (avoids full IndexedDB scan on every mutation) ───────────

let statsCache: { stats: AppStats | null; dirty: boolean } = { stats: null, dirty: true };

function markStatsDirty() {
  statsCache.dirty = true;
}

// ── Stats ────────────────────────────────────────────────────────────────

export async function computeStats(): Promise<AppStats> {
  if (!statsCache.dirty && statsCache.stats !== null) {
    return statsCache.stats;
  }

  const all = await db.books.toArray();
  const total = all.length;

  // Only count books with a valid finish date as truly "finished"
  const finished = all.filter(b => b.status === 'finished' && b.date_finished);
  const reading = all.filter(b => b.status === 'reading');
  const rated = finished.filter(b => b.rating != null);

  // Safe page sum
  const finishedWithPages = finished.filter(b => b.pages != null && b.pages > 0);
  const totalPages = finishedWithPages.reduce((s, b) => s + (b.pages ?? 0), 0);
  const avgPages = finishedWithPages.length
    ? Math.round(finishedWithPages.reduce((s, b) => s + (b.pages ?? 0), 0) / finishedWithPages.length)
    : 0;
  const globalAvgRating = rated.length
    ? Math.round(rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length * 10) / 10
    : null;

  // Month streak — counts distinct months with at least one finished book.
  // Grace period: allows exactly 1 gap month (0 books) between consecutive months,
  // so a pattern like Jan→Feb→Apr is still treated as a 3-month streak.
  // This makes achievements achievable for casual readers who occasionally skip a month.
  const monthCounts = new Map<string, number>();
  for (const b of finished) {
    if (!b.date_finished) continue;
    const m = b.date_finished.substring(0, 7);
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const sortedMonths = [...monthCounts.keys()].sort();
  let streakWithGrace = 0;
  for (let i = 0; i < sortedMonths.length; i++) {
    if (i === 0) {
      streakWithGrace = 1;
    } else {
      const [prevY, prevM] = sortedMonths[i - 1].split('-').map(Number);
      const [currY, currM] = sortedMonths[i].split('-').map(Number);
      const prevMonthIndex = prevY * 12 + prevM;
      const currMonthIndex = currY * 12 + currM;
      const gap = currMonthIndex - prevMonthIndex;
      if (gap <= 1) {
        streakWithGrace++;
      } else if (gap === 2) {
        // Grace period: one gap month resets streak to 1 (not 0)
        streakWithGrace = 1;
      } else {
        streakWithGrace = 1;
      }
    }
  }
  const currentStreak = streakWithGrace;

  // Avg days to finish
  // Pages per day: total pages ÷ total days for finished books with both dates
  let totalPagesPerDay: number | null = null;
  {
    let totalDays = 0;
    let totalPgs = 0;
    for (const b of finished) {
      if (!b.date_started || !b.date_finished || !b.pages) continue;
      const days = safeDaysBetween(b.date_started, b.date_finished);
      if (days !== null && days > 0) {
        totalDays += days;
        totalPgs += b.pages;
      }
    }
    if (totalDays > 0) totalPagesPerDay = Math.round(totalPgs / totalDays);
  }
  const avgDaysToFinish = totalPagesPerDay;

  // Mind sharpness: sqrt(finished) * 10, capped at 100
  const mindSharpness = Math.min(100, Math.round(Math.sqrt(finished.length) * 10));

  // New stats for achievements
  const languageSet = new Set<string>();
  for (const b of finished) { if (b.language) languageSet.add(b.language); }
  const languageCount = languageSet.size;

  const booksWithNotes = finished.filter(b => b.notes && b.notes.trim().length > 0);
  const booksWithNotesCount = booksWithNotes.length;

  const bigBooks = finished.filter(b => b.pages != null && b.pages >= 500);
  const shortBooks = finished.filter(b => b.pages != null && b.pages > 0 && b.pages <= 100);
  const fiveStars = finished.filter(b => b.rating === 5);
  const oneStars = finished.filter(b => b.rating === 1);

  // Fast/slow reads for achievements
  const finishTimes: number[] = [];
  for (const b of finished) {
    if (!b.date_started || !b.date_finished) continue;
    const days = safeDaysBetween(b.date_started, b.date_finished);
    if (days !== null) finishTimes.push(days);
  }
  const fastReads = finishTimes.filter(d => d <= 3).length;
  const slowBurns = finishTimes.filter(d => d >= 30).length;

  // Genre counts for genre-specific achievements
  const fictionCount = finished.filter(b => b.genre && /fiction|novel|literary/i.test(b.genre)).length;
  const scienceCount = finished.filter(b => b.genre && /science|physics|biology|chemistry|astronomy/i.test(b.genre)).length;
  const businessCount = finished.filter(b => b.genre && /business|management|economics|finance|entrepreneur/i.test(b.genre)).length;
  const historyCount = finished.filter(b => b.genre && /history|historical/i.test(b.genre)).length;
  const thrillerCount = finished.filter(b => b.genre && /thriller|mystery|suspense|crime/i.test(b.genre)).length;
  const fantasyCount = finished.filter(b => b.genre && /fantasy|magic|epic/i.test(b.genre)).length;
  const scifiCount = finished.filter(b => b.genre && /science fiction|sci-fi|scifi/i.test(b.genre)).length;
  const philosophyCount = finished.filter(b => b.genre && /philosophy|philosophical/i.test(b.genre)).length;
  const biographyCount = finished.filter(b => b.genre && /biography|autobiography|memoir/i.test(b.genre)).length;
  const selfHelpCount = finished.filter(b => b.genre && /self.help|personal development|productivity/i.test(b.genre)).length;

  // Total pages across ALL books (not just finished)
  const allPages = all.filter(b => b.pages != null && b.pages > 0).reduce((s, b) => s + (b.pages ?? 0), 0);

  // Genre distribution
  const genreMap: Record<string, number> = {};
  for (const b of finished) {
    if (b.genre) genreMap[b.genre] = (genreMap[b.genre] ?? 0) + 1;
  }
  const genreDistribution = Object.entries(genreMap)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);
  const genreCount = genreDistribution.length;

  // Books per month
  const booksPerMonth: Record<string, number> = {};
  for (const b of finished) {
    if (!b.date_finished) continue;
    const m = b.date_finished.substring(0, 7);
    booksPerMonth[m] = (booksPerMonth[m] ?? 0) + 1;
  }
  const booksPerMonthArr = Object.entries(booksPerMonth)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Avg rating over time
  const ratingByMonth: Record<string, { total: number; count: number }> = {};
  for (const b of rated) {
    if (!b.date_finished) continue;
    const m = b.date_finished.substring(0, 7);
    if (!ratingByMonth[m]) ratingByMonth[m] = { total: 0, count: 0 };
    ratingByMonth[m].total += b.rating ?? 0;
    ratingByMonth[m].count += 1;
  }
  const avgRatingOverTime = Object.entries(ratingByMonth)
    .map(([month, { total, count }]) => ({
      month,
      avg_rating: Math.round((total / count) * 10) / 10,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // ── Achievements (35 total) ──────────────────────────────────────────
  const achievements = [
    // ── Books finished (tiered) ──
    { id: 'first_steps', name: 'First Steps', description: 'Finish your first book',
      unlocked: finished.length >= 1, progress: Math.min(finished.length, 1), target: 1, unit: 'books' },
    { id: 'bookworm', name: 'Bookworm', description: 'Finish 5 books',
      unlocked: finished.length >= 5, progress: Math.min(finished.length, 5), target: 5, unit: 'books' },
    { id: 'speed_reader', name: 'Speed Reader', description: 'Finish 10 books',
      unlocked: finished.length >= 10, progress: Math.min(finished.length, 10), target: 10, unit: 'books' },
    { id: 'scholar', name: 'Scholar', description: 'Finish 25 books',
      unlocked: finished.length >= 25, progress: Math.min(finished.length, 25), target: 25, unit: 'books' },
    { id: 'librarian', name: 'Librarian', description: 'Finish 50 books',
      unlocked: finished.length >= 50, progress: Math.min(finished.length, 50), target: 50, unit: 'books' },
    { id: 'century_club', name: 'Century Club', description: 'Finish 100 books',
      unlocked: finished.length >= 100, progress: Math.min(finished.length, 100), target: 100, unit: 'books' },
    { id: 'master_library', name: 'Master Library', description: 'Finish 200 books',
      unlocked: finished.length >= 200, progress: Math.min(finished.length, 200), target: 200, unit: 'books' },

    // ── Pages read (tiered) ──
    { id: 'page_turner', name: 'Page Turner', description: 'Read 1,000 pages',
      unlocked: allPages >= 1000, progress: Math.min(allPages, 1000), target: 1000, unit: 'pages' },
    { id: 'marathon_reader', name: 'Marathon Reader', description: 'Read 5,000 pages',
      unlocked: allPages >= 5000, progress: Math.min(allPages, 5000), target: 5000, unit: 'pages' },
    { id: 'bookshelf_builder', name: 'Bookshelf Builder', description: 'Read 10,000 pages',
      unlocked: allPages >= 10000, progress: Math.min(allPages, 10000), target: 10000, unit: 'pages' },
    { id: 'page_mountain', name: 'Page Mountain', description: 'Read 25,000 pages',
      unlocked: allPages >= 25000, progress: Math.min(allPages, 25000), target: 25000, unit: 'pages' },
    { id: 'page_summit', name: 'Page Summit', description: 'Read 50,000 pages',
      unlocked: allPages >= 50000, progress: Math.min(allPages, 50000), target: 50000, unit: 'pages' },

    // ── Streaks ──
    { id: 'streak_starter', name: 'Streak Starter', description: 'Read for 1 month in a row',
      unlocked: currentStreak >= 1, progress: Math.min(currentStreak, 1), target: 1, unit: 'months' },
    { id: 'consistent_reader', name: 'Consistent Reader', description: 'Read for 3 months in a row',
      unlocked: currentStreak >= 3, progress: Math.min(currentStreak, 3), target: 3, unit: 'months' },
    { id: 'on_fire', name: 'On Fire', description: 'Read for 6 months in a row',
      unlocked: currentStreak >= 6, progress: Math.min(currentStreak, 6), target: 6, unit: 'months' },
    { id: 'unstoppable', name: 'Unstoppable', description: 'Read for 12 months in a row',
      unlocked: currentStreak >= 12, progress: Math.min(currentStreak, 12), target: 12, unit: 'months' },

    // ── Ratings ──
    { id: 'rating_enthusiast', name: 'Rating Enthusiast', description: 'Rate 5 books',
      unlocked: rated.length >= 5, progress: Math.min(rated.length, 5), target: 5, unit: 'ratings' },
    { id: 'critic', name: 'Critic', description: 'Rate 20 books',
      unlocked: rated.length >= 20, progress: Math.min(rated.length, 20), target: 20, unit: 'ratings' },
    { id: 'top_score', name: 'Top Score', description: 'Give a 5-star rating',
      unlocked: fiveStars.length >= 1, progress: Math.min(fiveStars.length, 1), target: 1, unit: '★★★★★' },
    { id: 'tough_judge', name: 'Tough Judge', description: 'Give a 1-star rating',
      unlocked: oneStars.length >= 1, progress: Math.min(oneStars.length, 1), target: 1, unit: '★' },

    // ── Genre & diversity ──
    { id: 'genre_explorer', name: 'Genre Explorer', description: 'Read 3 different genres',
      unlocked: genreCount >= 3, progress: Math.min(genreCount, 3), target: 3, unit: 'genres' },
    { id: 'genre_master', name: 'Genre Master', description: 'Read 5 different genres',
      unlocked: genreCount >= 5, progress: Math.min(genreCount, 5), target: 5, unit: 'genres' },
    { id: 'genre_legend', name: 'Genre Legend', description: 'Read 10 different genres',
      unlocked: genreCount >= 10, progress: Math.min(genreCount, 10), target: 10, unit: 'genres' },
    { id: 'polyglot', name: 'Polyglot', description: 'Read books in 3+ languages',
      unlocked: languageCount >= 3, progress: Math.min(languageCount, 3), target: 3, unit: 'languages' },

    // ── Pace ──
    { id: 'lightning', name: 'Lightning', description: 'Finish a book in under 3 days',
      unlocked: fastReads >= 1, progress: Math.min(fastReads, 1), target: 1, unit: 'speed reads' },
    { id: 'slow_burn', name: 'Slow Burn', description: 'Take 30+ days to finish a book',
      unlocked: slowBurns >= 1, progress: Math.min(slowBurns, 1), target: 1, unit: 'slow reads' },

    // ── Book size ──
    { id: 'long_haul', name: 'Long Haul', description: 'Finish a 500+ page book',
      unlocked: bigBooks.length >= 1, progress: Math.min(bigBooks.length, 1), target: 1, unit: 'big books' },
    { id: 'tome_crusher', name: 'Tome Crusher', description: 'Finish 5 books with 500+ pages',
      unlocked: bigBooks.length >= 5, progress: Math.min(bigBooks.length, 5), target: 5, unit: 'big books' },
    { id: 'short_and_sweet', name: 'Short & Sweet', description: 'Finish a book under 100 pages',
      unlocked: shortBooks.length >= 1, progress: Math.min(shortBooks.length, 1), target: 1, unit: 'short reads' },

    // ── Genre-specific ──
    { id: 'fantasy_fan', name: 'Fantasy Fan', description: 'Read 5 fantasy books',
      unlocked: fantasyCount >= 5, progress: Math.min(fantasyCount, 5), target: 5, unit: 'fantasy' },
    { id: 'science_nerd', name: 'Science Nerd', description: 'Read 5 science books',
      unlocked: scienceCount >= 5, progress: Math.min(scienceCount, 5), target: 5, unit: 'science' },
    { id: 'history_buff', name: 'History Buff', description: 'Read 5 history books',
      unlocked: historyCount >= 5, progress: Math.min(historyCount, 5), target: 5, unit: 'history' },
    { id: 'thriller_addict', name: 'Thriller Addict', description: 'Read 5 thrillers/mysteries',
      unlocked: thrillerCount >= 5, progress: Math.min(thrillerCount, 5), target: 5, unit: 'thrillers' },
    { id: 'scifi_voyager', name: 'Sci-Fi Voyager', description: 'Read 5 sci-fi books',
      unlocked: scifiCount >= 5, progress: Math.min(scifiCount, 5), target: 5, unit: 'sci-fi' },
    { id: 'deep_thinker', name: 'Deep Thinker', description: 'Read 3 philosophy books',
      unlocked: philosophyCount >= 3, progress: Math.min(philosophyCount, 3), target: 3, unit: 'philosophy' },
    { id: 'life_stories', name: 'Life Stories', description: 'Read 5 biographies/memoirs',
      unlocked: biographyCount >= 5, progress: Math.min(biographyCount, 5), target: 5, unit: 'biographies' },
    { id: 'business_mind', name: 'Business Mind', description: 'Read 5 business books',
      unlocked: businessCount >= 5, progress: Math.min(businessCount, 5), target: 5, unit: 'business' },
    { id: 'self_improver', name: 'Self Improver', description: 'Read 3 self-help books',
      unlocked: selfHelpCount >= 3, progress: Math.min(selfHelpCount, 3), target: 3, unit: 'self-help' },

    // ── Engagement ──
    { id: 'note_taker', name: 'Note Taker', description: 'Add notes to 10 books',
      unlocked: booksWithNotesCount >= 10, progress: Math.min(booksWithNotesCount, 10), target: 10, unit: 'notes' },
  ].map(a => ({ ...a, unlocked_at: null as string | null }));

  const stats: AppStats = {
    total_books: total,
    total_finished: finished.length,
    currently_reading: reading.length,
    total_pages: totalPages,
    avg_pages: avgPages,
    global_avg_rating: globalAvgRating,
    current_streak: currentStreak,
    reading_streak: currentStreak,
    avg_days_to_finish: avgDaysToFinish,
    mind_sharpness: mindSharpness,
    genre_distribution: genreDistribution,
    books_per_month: booksPerMonthArr,
    avg_rating_over_time: avgRatingOverTime,
    achievements,
  };

  statsCache = { stats, dirty: false };
  return stats;
}

// ── Export / Import ─────────────────────────────────────────────────────

export function exportBooks(): void {
  markStatsDirty();
  db.books.toArray().then(books => {
    const json = JSON.stringify(books, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `books_export_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export async function importBooks(file: File): Promise<{ imported: number; skipped: number }> {
  markStatsDirty();
  const text = await file.text();
  const books: Book[] = JSON.parse(text);

  if (!Array.isArray(books)) throw new Error('Invalid file: expected an array of books');

  let imported = 0;
  let skipped = 0;

  for (const book of books) {
    if (!book.title) { skipped++; continue; }

    // Sanitize all text fields before storing (prevent XSS from imported files)
    const clean: Partial<Book> = {
      ...book,
      title: sanitize(book.title),
      author: sanitize(book.author ?? '') || undefined,
      description: sanitize(book.description ?? '') || undefined,
      genre: sanitize(book.genre ?? '') || undefined,
      language: sanitize(book.language ?? '') || undefined,
      notes: sanitize(book.notes ?? '') || undefined,
    };

    // Upsert by title+author if id not provided
    if (clean.id != null) {
      const existing = await db.books.get(clean.id);
      if (existing) {
        await db.books.update(clean.id, clean);
      } else {
        await db.books.add(clean as Book);
      }
    } else {
      // Check for duplicate by title+author
      const existing = await db.books
        .where('title')
        .equals(clean.title!)
        .first();
      if (existing) {
        // Only update fields that are empty in local book but non-empty in import
        // This preserves user data that may be newer than the import
        const mergedUpdate: Partial<Book> = {};
        for (const key of Object.keys(clean) as (keyof Book)[]) {
          if (key === 'id' || key === 'created_at') continue; // skip these fields
          const importedValue = clean[key];
          const existingValue = existing[key as keyof Book];
          // Only include if imported has value and local is empty/null
          if (importedValue != null && importedValue !== '' && (existingValue == null || existingValue === '')) {
            (mergedUpdate as any)[key] = importedValue;
          }
        }
        if (Object.keys(mergedUpdate).length > 0) {
          await db.books.update(existing.id!, mergedUpdate);
        }
      } else {
        await db.books.add(clean as Book);
      }
    }
    imported++;
  }

  return { imported, skipped };
}

export async function getBookCount(): Promise<number> {
  return db.books.count();
}

// ── Aliases to match original api.ts interface ───────────────────────────
export { addBook as createBook, computeStats as getStats };
