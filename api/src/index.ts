import express, { type Request, type Response } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { timingSafeEqual, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { requireAuth, signToken, initAuth, setAuthDb, type AuthRequest } from './middleware/auth.js';
import { sanitize, safePages, safeDate, safeDaysBetween, VALID_STATUSES, MAX_NOTES } from './shared/validation.js';
import { computeAchievements, type AchievementStats } from './shared/achievements.js';

function safeId(id: unknown): number | null {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeCoverUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url.slice(0, 2000) : null;
  } catch { return null; }
}

// Log the real error server-side, return a generic message to the client so
// internal details (schema, file paths, stack) are never leaked.
function sendServerError(res: Response, err: unknown): void {
  console.error('[server error]', err instanceof Error ? err.stack || err.message : err);
  res.status(500).json({ error: 'Internal server error' });
}

// Cost factor for password hashing. 12 is the current OWASP-recommended floor.
const BCRYPT_COST = 12;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = __dirname;
const ROOT_DIR = join(SERVER_DIR, '..');
const CLIENT_DIST = join(ROOT_DIR, 'client', 'dist');
// Use /data for persistent storage (HA addon maps this as a volume)
// Falls back to local data dir for dev
const DATA_DIR = existsSync('/data') ? '/data' : join(ROOT_DIR, 'data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'database.sqlite');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8099', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
setAuthDb(db);

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    author       TEXT,
    status       TEXT    NOT NULL DEFAULT 'reading',
    rating       INTEGER,
    pages        INTEGER,
    genre        TEXT,
    language     TEXT,
    cover_url    TEXT,
    description  TEXT,
    date_started TEXT,
    date_finished TEXT,
    planned_date TEXT,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wishlists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    google_id  TEXT    NOT NULL,
    title      TEXT,
    author     TEXT,
    cover_url  TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, google_id)
  )
`);

// Migration: add user_id column to existing books table (safe: only runs if column doesn't exist)
try { db.exec(`ALTER TABLE books ADD COLUMN user_id INTEGER DEFAULT 1`); } catch (_) { /* column already exists */ }
// Migration: add token_version column for JWT revocation on password change
try { db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'); } catch (_e) { /* already exists */ }

// Database indexes for performance
db.exec('CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_books_user_status ON books(user_id, status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at)');

interface BookRow {
  id: number; title: string; author: string | null; status: string;
  rating: number | null; pages: number | null; genre: string | null;
  language: string | null; cover_url: string | null; description: string | null;
  date_started: string | null; date_finished: string | null;
  planned_date: string | null; notes: string | null;
  created_at: string; updated_at: string; user_id?: number;
}

// toBook was a no-op identity — removed; inline casts used where needed

// ── Auth Routes ──────────────────────────────────────────────────────────────

// Rate limiting on auth endpoints — 5 attempts per minute per IP
const recommendationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recommendation requests, please wait a minute' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again after a minute' },
});

// Limiter for expensive endpoints that fan out to external APIs (cover backfill).
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please wait a minute' },
});

// ── Registration config ──────────────────────────────────────────────────
const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED === 'true';
const ADMIN_KEY = process.env.ADMIN_KEY || null; // Secret key for admin endpoints

app.get('/api/auth/config', (_req: Request, res: Response) => {
  res.json({ registrationEnabled: REGISTRATION_ENABLED });
});

app.post('/api/auth/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    // Check if registration is enabled
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'username must be 3-50 characters' });
    }
    if (password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: 'password must be 8-256 characters' });
    }
    if (!REGISTRATION_ENABLED) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }
    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    let result;
    try {
      result = db.transaction(() => {
        return db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
      })();
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      return res.status(400).json({ error: 'Registration failed' });
    }
    const token = signToken(result.lastInsertRowid as number, 0);
    res.status(201).json({ token, userId: result.lastInsertRowid });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// ── Admin: Create user (requires ADMIN_KEY) ─────────────────────────────
app.post('/api/admin/create-user', authLimiter, async (req: Request, res: Response) => {
  try {
    const { adminKey, username, password } = req.body;
    if (!ADMIN_KEY) {
      return res.status(403).json({ error: 'Admin access not configured' });
    }
    if (!adminKey || !ADMIN_KEY) {
      return res.status(401).json({ error: 'Invalid admin key' });
    }
    const keyBuf = Buffer.from(typeof adminKey === 'string' ? adminKey : '');
    const refBuf = Buffer.from(ADMIN_KEY);
    const cmp = Buffer.alloc(refBuf.length, 0);
    keyBuf.copy(cmp, 0, 0, Math.min(keyBuf.length, refBuf.length));
    if (keyBuf.length !== refBuf.length || !timingSafeEqual(cmp, refBuf)) {
      return res.status(401).json({ error: 'Invalid admin key' });
    }
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'username must be 3-50 characters' });
    }
    if (password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: 'password must be 8-256 characters' });
    }
    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    try {
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
      res.status(201).json({ message: 'User created', userId: result.lastInsertRowid });
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      return res.status(400).json({ error: 'Failed to create user' });
    }
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as { id: number; username: string; password_hash: string; token_version: number } | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user.id, user.token_version);
    res.json({ token, userId: user.id });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.post('/api/auth/change-password', authLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
      return res.status(400).json({ error: 'New password must be 8-256 characters' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as { id: number; password_hash: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(newHash, req.userId!);
    const updated = db.prepare('SELECT token_version FROM users WHERE id = ?').get(req.userId!) as { token_version: number };
    const token = signToken(req.userId!, updated.token_version);
    res.json({ token, message: 'Password updated' });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// Helpers (sanitize, safePages, safeDate, safeDaysBetween, VALID_STATUSES, MAX_NOTES)
// were moved to ./shared/validation.ts and are imported above.

// ── Backfill covers for existing books ──────────────────────────────
app.post('/api/backfill-covers', expensiveLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const books = db.prepare('SELECT * FROM books WHERE user_id = ? AND (cover_url IS NULL OR cover_url = "")').all(req.userId!) as BookRow[];
    let updated = 0;
    for (const book of books) {
      try {
        const query = encodeURIComponent(`${book.title} ${book.author || ''}`);
        const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
        const data = await resp.json() as any;
        if (data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail) {
          const coverUrl = data.items[0].volumeInfo.imageLinks.thumbnail.replace('http://', 'https://');
          const desc = data.items[0].volumeInfo.description || book.description;
          db.prepare('UPDATE books SET cover_url = ?, description = COALESCE(description, ?) WHERE id = ?').run(coverUrl, desc, book.id);
          updated++;
        }
      } catch { /* skip */ }
    }
    res.json({ total: books.length, updated });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// ── Protected Routes ──────────────────────────────────────────────────────

app.get('/api/stats', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const p = { userId };

    // ── Query 1: Master stats — single conditional-aggregation query (~17 scalar values) ──
    const m = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN status='reading' THEN 1 ELSE 0 END) as reading,
        SUM(CASE WHEN status='planned' THEN 1 ELSE 0 END) as planned,
        SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) as abandoned,
        COALESCE(SUM(CASE WHEN status='finished' AND pages > 0 THEN pages END), 0) as total_pages,
        COALESCE(AVG(CASE WHEN status='finished' AND pages > 0 THEN pages END), 0) as avg_pages,
        COALESCE(AVG(CASE WHEN status='finished' AND rating IS NOT NULL THEN rating END), 0) as avg_rating,
        SUM(CASE WHEN status='finished' AND rating IS NOT NULL THEN 1 ELSE 0 END) as rated,
        SUM(CASE WHEN status='finished' AND rating >= 4 THEN 1 ELSE 0 END) as high_ratings,
        COALESCE(MAX(CASE WHEN status='finished' AND pages > 0 THEN pages ELSE 0 END), 0) as longest_book,
        COALESCE(MIN(CASE WHEN status='finished' AND pages > 0 THEN pages END), 0) as shortest_book,
        COALESCE(MAX(CASE WHEN status='finished' AND rating IS NOT NULL THEN rating ELSE 0 END), 0) as top_rated,
        COALESCE(SUM(CASE WHEN status='finished' AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished) - julianday(date_started) BETWEEN 0 AND 3650
          AND pages IS NOT NULL AND pages > 0
        THEN pages ELSE 0 END), 0) as pace_pages,
        COALESCE(SUM(CASE WHEN status='finished' AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished) - julianday(date_started) BETWEEN 0 AND 3650
          AND pages IS NOT NULL AND pages > 0
        THEN julianday(date_finished) - julianday(date_started) ELSE 0 END), 0) as pace_days,
        COALESCE(MIN(CASE WHEN status='finished' AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished) - julianday(date_started) >= 0
        THEN julianday(date_finished) - julianday(date_started) END), 999) as fastest_finish,
        COALESCE(MAX(CASE WHEN status='finished' AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished) - julianday(date_started) BETWEEN 0 AND 3650
        THEN julianday(date_finished) - julianday(date_started) END), 0) as slowest_finish,
        (SELECT GROUP_CONCAT(DISTINCT substr(date_finished,1,7))
         FROM books WHERE user_id = $userId AND status='finished' AND date_finished IS NOT NULL) as finished_months,
        (SELECT COUNT(DISTINCT author)
         FROM books WHERE user_id = $userId AND status='finished' AND author IS NOT NULL AND author != '') as author_count,
        (SELECT COALESCE(MAX(cnt), 0) FROM (
          SELECT COUNT(*) as cnt FROM books
          WHERE user_id = $userId AND status='finished' AND date_finished IS NOT NULL
          GROUP BY substr(date_finished,1,7)
        )) as max_per_month
      FROM books WHERE user_id = $userId
    `).get(p) as {
      total: number; finished: number; reading: number; planned: number; abandoned: number;
      total_pages: number; avg_pages: number; avg_rating: number; rated: number; high_ratings: number;
      longest_book: number; shortest_book: number; top_rated: number;
      pace_pages: number; pace_days: number; fastest_finish: number; slowest_finish: number;
      finished_months: string | null; author_count: number; max_per_month: number;
    };

    // ── Query 2: Genre distribution ──
    const genreRows = db.prepare(`
      SELECT genre, COUNT(*) as count FROM books
      WHERE user_id = $userId AND status='finished' AND genre IS NOT NULL
      GROUP BY genre ORDER BY count DESC
    `).all(p) as { genre: string; count: number }[];
    const genreDistribution = genreRows.map(g => ({ genre: g.genre, count: g.count }));
    const genreCount = genreDistribution.length;
    const maxGenreCount = Math.max(0, ...genreDistribution.map(g => g.count));

    // ── Query 3: Rating distribution — one query replaces 5 individual star-queries ──
    const ratingRows = db.prepare(`
      SELECT rating, COUNT(*) as count FROM books
      WHERE user_id = $userId AND status='finished' AND rating IS NOT NULL
      GROUP BY rating
    `).all(p) as { rating: number; count: number }[];
    const ratingMap = new Map(ratingRows.map(r => [r.rating, r.count]));
    const ratingDist = [1, 2, 3, 4, 5].map(star => ({ rating: star, count: ratingMap.get(star) || 0 }));

    // ── Query 4: Monthly stats — one query replaces books-per-month, pages-per-month, avg-rating-over-time, pace-over-time ──
    const monthRows = db.prepare(`
      SELECT
        substr(date_finished,1,7) as month,
        COUNT(*) as books_count,
        COALESCE(SUM(CASE WHEN pages > 0 THEN pages ELSE 0 END), 0) as total_pages,
        AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating,
        AVG(CASE WHEN julianday(date_finished) - julianday(date_started) BETWEEN 0 AND 3650
          THEN julianday(date_finished) - julianday(date_started) END) as avg_days
      FROM books
      WHERE user_id = $userId AND status='finished' AND date_finished IS NOT NULL
      GROUP BY month ORDER BY month
    `).all(p) as { month: string; books_count: number; total_pages: number; avg_rating: number | null; avg_days: number | null }[];

    // ── Query 5: Reading calendar ──
    const calendarRows = db.prepare(`
      SELECT date_finished, COUNT(*) as count FROM books
      WHERE user_id = $userId AND status='finished' AND date_finished IS NOT NULL
      GROUP BY date_finished ORDER BY date_finished
    `).all(p) as { date_finished: string; count: number }[];

    // ── Derived values ──
    const total = m.total;
    const finished = m.finished;
    const totalPages = m.total_pages;
    const avgPages = Math.round(m.avg_pages);
    const globalAvgRating = m.avg_rating > 0 ? Math.round(m.avg_rating * 10) / 10 : null;
    // Compute consecutive streak with grace period (matching client logic)
    const sortedMonths = (m.finished_months || '').split(',').filter(Boolean).sort();
    let streakWithGrace = 0;
    for (let i = 0; i < sortedMonths.length; i++) {
      if (i === 0) {
        streakWithGrace = 1;
      } else {
        const [prevY, prevM] = sortedMonths[i - 1].split('-').map(Number);
        const [currY, currM] = sortedMonths[i].split('-').map(Number);
        const prevIdx = prevY * 12 + prevM;
        const currIdx = currY * 12 + currM;
        const gap = currIdx - prevIdx;
        if (gap <= 1) streakWithGrace++;
        else streakWithGrace = 1;
      }
    }
    const currentStreak = streakWithGrace;
    const avgDaysToFinish = m.pace_days > 0 ? Math.round(m.pace_pages / m.pace_days) : null;
    const mindSharpness = Math.min(100, Math.round(Math.sqrt(finished) * 10));
    const completionRate = (finished + m.abandoned) > 0 ? finished / (finished + m.abandoned) : 1;

    const booksPerMonth = monthRows.map(r => ({ month: r.month, count: r.books_count }));
    const pagesPerMonth = monthRows.filter(r => r.total_pages > 0).map(r => ({ month: r.month, total: r.total_pages }));
    const avgRatingOverTime = monthRows.filter(r => r.avg_rating != null).map(r => ({ month: r.month, avg_rating: Math.round(r.avg_rating! * 10) / 10 }));
    const paceOverTime = monthRows.map(r => ({ month: r.month, avg_days: Math.round((r.avg_days || 0) * 10) / 10 }));
    const readingCalendar = calendarRows.map(r => ({ date: r.date_finished, count: r.count }));

    // ── Achievements via shared module (H4) ──
    const achievementStats: AchievementStats = {
      finished,
      totalPages,
      currentStreak,
      rated: m.rated,
      genreCount,
      authorCount: m.author_count,
      longestBook: m.longest_book,
      shortestBook: m.shortest_book,
      planned: m.planned,
      total,
      fastestFinish: m.fastest_finish,
      slowestFinish: m.slowest_finish,
      maxPerMonth: m.max_per_month,
      completionRate,
      maxGenreCount,
      highRatings: m.high_ratings,
      topRated: m.top_rated,
    };
    const achievements = computeAchievements(achievementStats);

    res.json({
      total_books: total, total_finished: finished, currently_reading: m.reading,
      total_pages: totalPages, avg_pages: avgPages,
      global_avg_rating: globalAvgRating, current_streak: currentStreak,
      reading_streak: currentStreak,
      avg_days_to_finish: avgDaysToFinish,
      mind_sharpness: mindSharpness,
      genre_distribution: genreDistribution,
      books_per_month: booksPerMonth,
      avg_rating_over_time: avgRatingOverTime,
      pages_per_month: pagesPerMonth,
      rating_distribution: ratingDist,
      pace_over_time: paceOverTime,
      reading_calendar: readingCalendar,
      achievements,
    });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.get('/api/books', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const { status, genre, search } = req.query;
    let sql = 'SELECT * FROM books WHERE user_id = ?';
    const params: unknown[] = [req.userId];

    if (status) {
      if (!(VALID_STATUSES as readonly string[]).includes(status as string)) {
        res.status(400).json({ error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
        return;
      }
      sql += ' AND status = ?';
      params.push(status as string);
    }
    if (genre) {
      sql += ' AND genre = ?';
      params.push(genre);
    }
    if (search) {
      sql += ' AND (title LIKE ? OR author LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY created_at DESC';

    // Pagination — limit/offset
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    res.json(db.prepare(sql).all(...params) as BookRow[]);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.post('/api/books', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const {
      title, author, status, rating, pages, genre, language,
      cover_url, description, date_started, date_finished, planned_date, notes,
    } = req.body;

    // Validation
    const cleanTitle = sanitize(title);
    if (!cleanTitle) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const cleanAuthor = sanitize(author ?? '') || null;
    const cleanNotes = sanitize(notes ?? '').slice(0, MAX_NOTES);
    const cleanDesc = sanitize(description ?? '');

    const s = (VALID_STATUSES as readonly string[]).includes(status as string) ? status as typeof VALID_STATUSES[number] : null;
    if (!s) {
      res.status(400).json({ error: status ? `Invalid status '${status}'. Valid values: ${VALID_STATUSES.join(', ')}` : `status is required. Valid values: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    // Enforce date logic
    const cleanDateStarted = safeDate(date_started);
    let cleanDateFinished = safeDate(date_finished);
    // Validate date order
    if (cleanDateStarted && cleanDateFinished) {
      const ds = new Date(cleanDateStarted + 'T00:00:00');
      const df = new Date(cleanDateFinished + 'T00:00:00');
      if (ds > df) {
        res.status(400).json({ error: 'date_started cannot be after date_finished' });
        return;
      }
    }
    // Auto-set date_finished to today when marking as finished without a date
    if (s === 'finished' && !cleanDateFinished) {
      cleanDateFinished = new Date().toISOString().split('T')[0];
    }

    const cleanRating = (rating !== '' && rating != null)
      ? Math.min(5, Math.max(1, Math.round(Number(rating))))
      : null;

    const cleanPages = safePages(pages);

    const stmt = db.prepare(`
      INSERT INTO books (user_id,title,author,status,rating,pages,genre,language,cover_url,description,date_started,date_finished,planned_date,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const result = stmt.run(
      req.userId,
      cleanTitle, cleanAuthor || null, s, cleanRating, cleanPages,
      sanitize(genre ?? '') || null, sanitize(language ?? '') || null,
      safeCoverUrl(cover_url),
      cleanDesc || null, cleanDateStarted, cleanDateFinished,
      safeDate(planned_date),
      cleanNotes || null,
    );
    res.status(201).json(db.prepare('SELECT * FROM books WHERE id=?').get(result.lastInsertRowid) as BookRow);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.get('/api/books/:id', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const id = safeId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid book ID' }); return; }
    const book = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow | undefined;
    if (!book) { res.status(404).json({ error: 'Book not found' }); return; }
    res.json(book);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// PATCH — partial update (merges with existing)
app.patch('/api/books/:id', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const id = safeId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid book ID' }); return; }
    const existing = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow | undefined;
    if (!existing) { res.status(404).json({ error: 'Book not found' }); return; }

    const {
      title, author, status, rating, pages, genre, language,
      cover_url, description, date_started, date_finished, planned_date, notes,
    } = req.body;

    const cleanTitle = title !== undefined
      ? (sanitize(title) || existing.title)
      : existing.title;
    const cleanAuthor = author !== undefined ? sanitize(author ?? '') || null : existing.author;
    const s = status !== undefined
      ? ((VALID_STATUSES as readonly string[]).includes(status as string) ? status as typeof VALID_STATUSES[number] : existing.status)
      : existing.status;

    const cleanRating = rating !== undefined
      ? (rating === '' || rating == null ? null : Math.min(5, Math.max(1, Math.round(Number(rating)))))
      : existing.rating;
    const cleanPages = pages !== undefined ? safePages(pages) : existing.pages;

    // Date handling: only update if explicitly provided
    const cleanDateStarted = date_started !== undefined
      ? (date_started === null ? null : safeDate(date_started))
      : existing.date_started;
    let cleanDateFinished = date_finished !== undefined
      ? (date_finished === null ? null : safeDate(date_finished))
      : existing.date_finished;
    // Auto-set date_finished to today when marking as finished without a date
    if (s === 'finished' && !cleanDateFinished) {
      cleanDateFinished = new Date().toISOString().split('T')[0];
    }

    // Validate date order if both are set
    if (cleanDateStarted && cleanDateFinished) {
      const ds = new Date(cleanDateStarted + 'T00:00:00');
      const de = new Date(cleanDateFinished + 'T00:00:00');
      if (ds > de) {
        res.status(400).json({ error: 'date_started cannot be after date_finished' });
        return;
      }
    }

    const cleanNotes = notes !== undefined
      ? (sanitize(notes ?? '').slice(0, MAX_NOTES) || null)
      : existing.notes;

    db.prepare(`
      UPDATE books SET title=?,author=?,status=?,rating=?,pages=?,genre=?,language=?,
      cover_url=?,description=?,date_started=?,date_finished=?,planned_date=?,notes=?,
      updated_at=datetime('now') WHERE id=?`)
      .run(
        cleanTitle, cleanAuthor ?? null, s, cleanRating, cleanPages,
        genre !== undefined ? (sanitize(genre ?? '') || null) : existing.genre,
        language !== undefined ? (sanitize(language ?? '') || null) : existing.language,
        cover_url !== undefined ? safeCoverUrl(cover_url) : existing.cover_url,
        description !== undefined ? (sanitize(description ?? '') || null) : existing.description,
        cleanDateStarted, cleanDateFinished,
        planned_date !== undefined ? safeDate(planned_date) : existing.planned_date,
        cleanNotes,
        id,
      );

    res.json(db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// PUT — full replace
app.put('/api/books/:id', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const id = safeId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid book ID' }); return; }
    const existing = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow | undefined;
    if (!existing) { res.status(404).json({ error: 'Book not found' }); return; }

    const {
      title, author, status, rating, pages, genre, language,
      cover_url, description, date_started, date_finished, planned_date, notes,
    } = req.body;

    const cleanTitle = sanitize(title ?? '');
    if (!cleanTitle) { res.status(400).json({ error: 'title is required' }); return; }
    const cleanAuthor = sanitize(author ?? '');
    if (!cleanAuthor) { res.status(400).json({ error: 'author is required' }); return; }

    if (!(VALID_STATUSES as readonly string[]).includes(status as string)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const s = status as typeof VALID_STATUSES[number];
    let cleanDateStarted = date_started !== undefined ? safeDate(date_started) : existing.date_started;
    let cleanDateFinished = date_finished !== undefined ? safeDate(date_finished) : existing.date_finished;
    if (cleanDateStarted && cleanDateFinished) {
      const ds = new Date(cleanDateStarted + 'T00:00:00');
      const de = new Date(cleanDateFinished + 'T00:00:00');
      if (ds > de) { res.status(400).json({ error: 'date_started cannot be after date_finished' }); return; }
    }

    db.prepare(`
      UPDATE books SET title=?,author=?,status=?,rating=?,pages=?,genre=?,language=?,
      cover_url=?,description=?,date_started=?,date_finished=?,planned_date=?,notes=?,
      updated_at=datetime('now') WHERE id=?`)
      .run(
        cleanTitle, cleanAuthor, s,
        rating !== undefined && rating !== '' && rating != null
          ? Math.min(5, Math.max(1, Math.round(Number(rating)))) : null,
        safePages(pages),
        sanitize(genre ?? '') || null, sanitize(language ?? '') || null,
        safeCoverUrl(cover_url),
        sanitize(description ?? '') || null,
        cleanDateStarted, cleanDateFinished,
        safeDate(planned_date),
        sanitize(notes ?? '').slice(0, MAX_NOTES) || null,
        id,
      );

    res.json(db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.delete('/api/books/:id', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const id = safeId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid book ID' }); return; }
    const info = db.prepare('DELETE FROM books WHERE id=? AND user_id=?').run(id, req.userId);
    if (info.changes === 0) { res.status(404).json({ error: 'Book not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// ── Wishlist ──────────────────────────────────────────────────────────────
app.get('/api/wishlist', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM wishlists WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
    res.json(rows);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.post('/api/wishlist/:googleId', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const { title, author, cover_url } = req.body || {};
    db.prepare(`INSERT OR IGNORE INTO wishlists (user_id, google_id, title, author, cover_url) VALUES (?, ?, ?, ?, ?)`)
      .run(req.userId, req.params.googleId, title ?? null, author ?? null, cover_url ?? null);
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.delete('/api/wishlist/:googleId', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM wishlists WHERE user_id=? AND google_id=?').run(req.userId, req.params.googleId);
    res.json({ success: true });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.get('/api/preferences', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const books = db.prepare("SELECT * FROM books WHERE status = 'finished' AND date_finished IS NOT NULL AND user_id = ?").all(req.userId) as BookRow[];
    const genreMap = new Map<string, number>();
    for (const b of books) { if (b.genre) genreMap.set(b.genre, (genreMap.get(b.genre) ?? 0) + 1); }
    const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count }));
    const withPages = books.filter(b => b.pages != null && b.pages > 0);
    const avgPages = withPages.length > 0 ? Math.round(withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length) : 300;
    const lengthBucket = avgPages < 250 ? 'short' : avgPages < 400 ? 'medium' : 'long';
    const authorMap: Record<string, { total: number; count: number }> = {};
    for (const b of books) {
      if (b.author && b.rating != null) {
        if (!authorMap[b.author]) authorMap[b.author] = { total: 0, count: 0 };
        authorMap[b.author].total += b.rating;
        authorMap[b.author].count += 1;
      }
    }
    const topAuthors = Object.entries(authorMap).filter(([, v]) => v.count >= 1)
      .map(([author, v]) => ({ author, avgRating: Math.round((v.total / v.count) * 10) / 10 }))
      .sort((a, b) => b.avgRating - a.avgRating).slice(0, 5);
    res.json({ topGenres, avgPages, lengthBucket, topAuthors, totalRated: books.filter(b => b.rating != null).length });
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

app.get('/api/recommendations', recommendationsLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { genre, maxPages, minRating, author, q, exclude } = req.query;
    let searchQ = q ? String(q) : author ? `inauthor:${author}${genre ? '+subject:' + genre : ''}` : genre ? `subject:${genre}` : 'subject:fiction';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQ)}&maxResults=20&printType=books&langRestrict=en`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`Google Books API error: ${resp.status}`);
    const data = await resp.json() as any;
    if (!data.items?.length) return res.json([]);

    // Build exclusion set from ALL books (not just finished)
    const excludeSet = new Set<string>();
    if (exclude) {
      (db.prepare('SELECT title, author FROM books WHERE user_id=?').all(req.userId) as BookRow[]).forEach((b) => {
        if (b.title && b.author) excludeSet.add(`${b.title}|${b.author}`.toLowerCase());
      });
    }

    const LANG_MAP: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
    const recs = data.items.map((item: any) => {
      const v = item.volumeInfo;
      const title = v.title || '', authors = (v.authors || []).join(', ');
      const key = `${title}|${authors}`.toLowerCase();
      // Exclude books already in library
      if (excludeSet.has(key)) return null;
      if (maxPages && v.pageCount && v.pageCount > Number(maxPages)) return null;
      if (minRating && (!v.averageRating || v.averageRating < Number(minRating))) return null;
      return {
        googleId: item.id, title, author: authors,
        coverUrl: v.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        pages: v.pageCount || null,
        genre: (v.categories || [])[0] || null,
        rating: v.averageRating || null,
        description: v.description || null,
        year: v.publishedDate ? v.publishedDate.substring(0, 4) : null,
        language: v.language ? (LANG_MAP[v.language] || v.language) : null,
      };
    }).filter(Boolean).slice(0, 12);
    res.json(recs);
  } catch (err: unknown) {
    sendServerError(res, err);
  }
});

// ── Static Files ──────────────────────────────────────────────────────────────

function serveWithNonce(distPath: string): void {
  const serveIndex = (_req: Request, res: Response): void => {
    const indexPath = join(distPath, 'index.html');
    if (!existsSync(indexPath)) { res.status(404).send('Not found'); return; }
    const nonce = randomBytes(16).toString('base64');
    const CSP = [
      "default-src 'self'",
      // script-src is nonce-only (no 'unsafe-inline') — this is the primary XSS control.
      `script-src 'self' 'nonce-${nonce}'`,
      // 'unsafe-inline' is required here because the React UI uses inline style={{...}}
      // props, which render as style="" attributes. Removing it needs all inline styles
      // refactored to CSS classes. Style-only injection is low risk given the nonce'd script-src.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https://covers.openlibrary.org https://archive.org https://*.us.archive.org https://*.archive.org https://books.google.com https://books.google.com/books https://images-na.ssl-images-amazon.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://openlibrary.org https://www.googleapis.com",
      "frame-ancestors 'none'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', CSP);
    const html = readFileSync(indexPath, 'utf-8')
      .replace(/<script\b/g, `<script nonce="${nonce}"`);
    res.send(html);
  };
  // Must precede express.static: the service worker precaches /index.html and replays
  // its response headers on every navigation, so a static copy would carry helmet's
  // default CSP and block Open Library and external covers.
  app.get('/index.html', serveIndex);
  // A service worker's own fetches obey the CSP of its script, and it proxies the web
  // fonts. Helmet's default would block them whenever the worker controls the page.
  const swPath = join(distPath, 'sw.js');
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath === swPath) {
        res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com");
      }
    },
  }));
  app.get('*', serveIndex);
}

// Try new client dist path first
const newClientDist = join(__dirname, '..', 'dist-client', 'dist');
if (existsSync(newClientDist)) {
  serveWithNonce(newClientDist);
} else if (existsSync(CLIENT_DIST)) {
  serveWithNonce(CLIENT_DIST);
}

const PORT = parseInt(process.env.PORT ?? '8099');
initAuth(); // Validate JWT_SECRET before starting
app.listen(PORT, '0.0.0.0', () => console.log(`Book Tracker API on http://0.0.0.0:${PORT}`));
