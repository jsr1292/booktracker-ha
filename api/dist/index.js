import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken, initAuth } from './middleware/auth.js';
import { sanitize, safePages, safeDate, safeDaysBetween, VALID_STATUSES, MAX_NOTES } from './shared/validation.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = __dirname;
const ROOT_DIR = join(SERVER_DIR, '..');
const CLIENT_DIST = 'client/dist';
const DB_PATH = join(ROOT_DIR, 'database.sqlite');
const app = express();
app.use(cors({
    methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json());
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
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
try {
    db.exec(`ALTER TABLE books ADD COLUMN user_id INTEGER DEFAULT 1`);
}
catch (_) { /* column already exists */ }
// toBook was a no-op identity — removed; inline casts used where needed
// ── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'username and password are required' });
        }
        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({ error: 'username must be 3-50 characters' });
        }
        if (password.length < 6 || password.length > 256) {
            return res.status(400).json({ error: 'password must be 6-256 characters' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        let result;
        try {
            result = stmt.run(username, password_hash);
        }
        catch (dbErr) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            return res.status(400).json({ error: 'Registration failed' });
        }
        const token = signToken(result.lastInsertRowid);
        res.status(201).json({ token, userId: result.lastInsertRowid });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'username and password are required' });
        }
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = signToken(user.id);
        res.json({ token, userId: user.id });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }
        if (newPassword.length < 6 || newPassword.length > 256) {
            return res.status(400).json({ error: 'New password must be 6-256 characters' });
        }
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        const newHash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.userId);
        const token = signToken(req.userId);
        res.json({ token, message: 'Password updated' });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// Helpers (sanitize, safePages, safeDate, safeDaysBetween, VALID_STATUSES, MAX_NOTES)
// were moved to ./shared/validation.ts and are imported above.
// ── Backfill covers for existing books ──────────────────────────────
app.post('/api/backfill-covers', requireAuth, async (req, res) => {
    try {
        const books = db.prepare('SELECT * FROM books WHERE user_id = ? AND (cover_url IS NULL OR cover_url = "")').all(req.userId);
        let updated = 0;
        for (const book of books) {
            try {
                const query = encodeURIComponent(`${book.title} ${book.author || ''}`);
                const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
                const data = await resp.json();
                if (data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail) {
                    const coverUrl = data.items[0].volumeInfo.imageLinks.thumbnail.replace('http://', 'https://');
                    const desc = data.items[0].volumeInfo.description || book.description;
                    db.prepare('UPDATE books SET cover_url = ?, description = COALESCE(description, ?) WHERE id = ?').run(coverUrl, desc, book.id);
                    updated++;
                }
            }
            catch { /* skip */ }
        }
        res.json({ total: books.length, updated });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// ── Protected Routes ──────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
    try {
        const all = db.prepare('SELECT * FROM books WHERE user_id=?').all(req.userId);
        const total = all.length;
        // Count all books marked as finished (date_finished is informational, not a requirement)
        const finished = all.filter(b => b.status === 'finished');
        const reading = all.filter(b => b.status === 'reading');
        const rated = finished.filter(b => b.rating != null);
        // Safe page sum — ignore negative/invalid pages
        const finishedWithPages = finished.filter(b => b.pages != null && b.pages > 0);
        const totalPages = finishedWithPages.reduce((s, b) => s + (b.pages ?? 0), 0);
        const avgPages = finishedWithPages.length
            ? Math.round(finishedWithPages.reduce((s, b) => s + (b.pages ?? 0), 0) / finishedWithPages.length)
            : 0;
        const globalAvgRating = rated.length
            ? Math.round(rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length * 10) / 10
            : null;
        // Month streak
        const monthCounts = new Map();
        for (const b of finished) {
            if (!b.date_finished)
                continue;
            const m = b.date_finished.substring(0, 7);
            monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
        }
        const currentStreak = monthCounts.size;
        // Avg days to finish — only valid, positive date pairs
        const finishTimes = [];
        for (const b of finished) {
            if (!b.date_started || !b.date_finished)
                continue;
            const days = safeDaysBetween(b.date_started, b.date_finished);
            if (days !== null)
                finishTimes.push(days);
        }
        const avgDaysToFinish = finishTimes.length
            ? Math.round(finishTimes.reduce((s, d) => s + d, 0) / finishTimes.length)
            : null;
        // Mind sharpness: sqrt(finished) * 10, capped at 100
        const mindSharpness = Math.min(100, Math.round(Math.sqrt(finished.length) * 10));
        // Genre distribution
        const genreMap = {};
        for (const b of finished) {
            if (b.genre)
                genreMap[b.genre] = (genreMap[b.genre] ?? 0) + 1;
        }
        const genreDistribution = Object.entries(genreMap)
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count);
        const genreCount = genreDistribution.length;
        // Achievements
        const achievements = [
            { id: 'first_steps', name: 'First Steps', description: 'Finish your first book', unlocked: finished.length >= 1, progress: Math.min(finished.length, 1), target: 1, unit: 'books' },
            { id: 'bookworm', name: 'Bookworm', description: 'Finish 5 books', unlocked: finished.length >= 5, progress: Math.min(finished.length, 5), target: 5, unit: 'books' },
            { id: 'speed_reader', name: 'Speed Reader', description: 'Finish 10 books', unlocked: finished.length >= 10, progress: Math.min(finished.length, 10), target: 10, unit: 'books' },
            { id: 'page_turner', name: 'Page Turner', description: 'Read 1,000 pages', unlocked: totalPages >= 1000, progress: Math.min(totalPages, 1000), target: 1000, unit: 'pages' },
            { id: 'marathon_reader', name: 'Marathon Reader', description: 'Read 5,000 pages', unlocked: totalPages >= 5000, progress: Math.min(totalPages, 5000), target: 5000, unit: 'pages' },
            { id: 'streak_starter', name: 'Streak Starter', description: 'Read for 1 month in a row', unlocked: currentStreak >= 1, progress: Math.min(currentStreak, 1), target: 1, unit: 'streak' },
            { id: 'consistent_reader', name: 'Consistent Reader', description: 'Read for 3 months in a row', unlocked: currentStreak >= 3, progress: Math.min(currentStreak, 3), target: 3, unit: 'streak' },
            { id: 'rating_enthusiast', name: 'Rating Enthusiast', description: 'Rate 5 books', unlocked: rated.length >= 5, progress: Math.min(rated.length, 5), target: 5, unit: 'books' },
            { id: 'genre_explorer', name: 'Genre Explorer', description: 'Read 3 different genres', unlocked: genreCount >= 3, progress: Math.min(genreCount, 3), target: 3, unit: 'genres' },
            { id: 'century_club', name: 'Century Club', description: 'Finish 100 books', unlocked: finished.length >= 100, progress: Math.min(finished.length, 100), target: 100, unit: 'books' },
        ];
        res.json({
            total_books: total, total_finished: finished.length, currently_reading: reading.length,
            total_pages: totalPages, avg_pages: avgPages,
            global_avg_rating: globalAvgRating, current_streak: currentStreak,
            avg_days_to_finish: avgDaysToFinish,
            mind_sharpness: mindSharpness,
            genre_distribution: genreDistribution,
            achievements,
        });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.get('/api/books', requireAuth, (req, res) => {
    try {
        const { status, genre, search } = req.query;
        let sql = 'SELECT * FROM books WHERE user_id = ?';
        const params = [req.userId];
        if (status) {
            if (!VALID_STATUSES.includes(status)) {
                res.status(400).json({ error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
                return;
            }
            sql += ' AND status = ?';
            params.push(status);
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
        res.json(db.prepare(sql).all(...params));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.post('/api/books', requireAuth, (req, res) => {
    try {
        const { title, author, status, rating, pages, genre, language, cover_url, description, date_started, date_finished, planned_date, notes, } = req.body;
        // Validation
        const cleanTitle = sanitize(title);
        if (!cleanTitle) {
            res.status(400).json({ error: 'title is required' });
            return;
        }
        const cleanAuthor = sanitize(author ?? '');
        if (!cleanAuthor) {
            res.status(400).json({ error: 'author is required' });
            return;
        }
        const cleanNotes = (notes ?? '').slice(0, MAX_NOTES);
        const cleanDesc = sanitize(description ?? '');
        const s = VALID_STATUSES.includes(status) ? status : null;
        if (!s) {
            res.status(400).json({ error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
            return;
        }
        // Enforce date logic
        const cleanDateStarted = safeDate(date_started);
        let cleanDateFinished = safeDate(date_finished);
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
        const result = stmt.run(req.userId, cleanTitle, cleanAuthor || null, s, cleanRating, cleanPages, sanitize(genre ?? '') || null, sanitize(language ?? '') || null, typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null, cleanDesc || null, cleanDateStarted, cleanDateFinished, safeDate(planned_date), cleanNotes || null);
        res.status(201).json(db.prepare('SELECT * FROM books WHERE id=?').get(result.lastInsertRowid));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.get('/api/books/:id', requireAuth, (req, res) => {
    try {
        const book = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(req.params.id, req.userId);
        if (!book) {
            res.status(404).json({ error: 'Book not found' });
            return;
        }
        res.json(book);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// PATCH — partial update (merges with existing)
app.patch('/api/books/:id', requireAuth, (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(req.params.id, req.userId);
        if (!existing) {
            res.status(404).json({ error: 'Book not found' });
            return;
        }
        const { title, author, status, rating, pages, genre, language, cover_url, description, date_started, date_finished, planned_date, notes, } = req.body;
        const cleanTitle = title !== undefined
            ? (sanitize(title) || existing.title)
            : existing.title;
        const cleanAuthor = author !== undefined ? sanitize(author ?? '') : existing.author;
        const s = status !== undefined
            ? (VALID_STATUSES.includes(status) ? status : existing.status)
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
            ? ((notes ?? '').slice(0, MAX_NOTES) || null)
            : existing.notes;
        db.prepare(`
      UPDATE books SET title=?,author=?,status=?,rating=?,pages=?,genre=?,language=?,
      cover_url=?,description=?,date_started=?,date_finished=?,planned_date=?,notes=?,
      updated_at=datetime('now') WHERE id=?`)
            .run(cleanTitle, cleanAuthor ?? null, s, cleanRating, cleanPages, genre !== undefined ? (sanitize(genre ?? '') || null) : existing.genre, language !== undefined ? (sanitize(language ?? '') || null) : existing.language, cover_url !== undefined ? (typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null) : existing.cover_url, description !== undefined ? (sanitize(description ?? '') || null) : existing.description, cleanDateStarted, cleanDateFinished, planned_date !== undefined ? safeDate(planned_date) : existing.planned_date, cleanNotes, req.params.id);
        res.json(db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// PUT — full replace
app.put('/api/books/:id', requireAuth, (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(req.params.id, req.userId);
        if (!existing) {
            res.status(404).json({ error: 'Book not found' });
            return;
        }
        const { title, author, status, rating, pages, genre, language, cover_url, description, date_started, date_finished, planned_date, notes, } = req.body;
        const cleanTitle = sanitize(title ?? '');
        if (!cleanTitle) {
            res.status(400).json({ error: 'title is required' });
            return;
        }
        const cleanAuthor = sanitize(author ?? '');
        if (!cleanAuthor) {
            res.status(400).json({ error: 'author is required' });
            return;
        }
        const s = VALID_STATUSES.includes(status) ? status : 'finished';
        let cleanDateStarted = date_started !== undefined ? safeDate(date_started) : existing.date_started;
        let cleanDateFinished = date_finished !== undefined ? safeDate(date_finished) : existing.date_finished;
        if (cleanDateStarted && cleanDateFinished) {
            const ds = new Date(cleanDateStarted + 'T00:00:00');
            const de = new Date(cleanDateFinished + 'T00:00:00');
            if (ds > de) {
                res.status(400).json({ error: 'date_started cannot be after date_finished' });
                return;
            }
        }
        db.prepare(`
      UPDATE books SET title=?,author=?,status=?,rating=?,pages=?,genre=?,language=?,
      cover_url=?,description=?,date_started=?,date_finished=?,planned_date=?,notes=?,
      updated_at=datetime('now') WHERE id=?`)
            .run(cleanTitle, cleanAuthor, s, rating !== undefined && rating !== '' && rating != null
            ? Math.min(5, Math.max(1, Math.round(Number(rating)))) : null, safePages(pages), sanitize(genre ?? '') || null, sanitize(language ?? '') || null, typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null, sanitize(description ?? '') || null, cleanDateStarted, cleanDateFinished, safeDate(planned_date), (notes ?? '').slice(0, MAX_NOTES) || null, req.params.id);
        res.json(db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.delete('/api/books/:id', requireAuth, (req, res) => {
    try {
        const info = db.prepare('DELETE FROM books WHERE id=? AND user_id=?').run(req.params.id, req.userId);
        if (info.changes === 0) {
            res.status(404).json({ error: 'Book not found' });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// ── Wishlist ──────────────────────────────────────────────────────────────
app.get('/api/wishlist', requireAuth, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM wishlists WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.post('/api/wishlist/:googleId', requireAuth, (req, res) => {
    try {
        const { title, author, cover_url } = req.body || {};
        db.prepare(`INSERT OR IGNORE INTO wishlists (user_id, google_id, title, author, cover_url) VALUES (?, ?, ?, ?, ?)`)
            .run(req.userId, req.params.googleId, title ?? null, author ?? null, cover_url ?? null);
        res.status(201).json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.delete('/api/wishlist/:googleId', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM wishlists WHERE user_id=? AND google_id=?').run(req.userId, req.params.googleId);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.get('/api/preferences', requireAuth, (req, res) => {
    try {
        const books = db.prepare("SELECT * FROM books WHERE status = 'finished' AND date_finished IS NOT NULL AND user_id = ?").all(req.userId);
        const genreMap = new Map();
        for (const b of books) {
            if (b.genre)
                genreMap.set(b.genre, (genreMap.get(b.genre) ?? 0) + 1);
        }
        const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count }));
        const withPages = books.filter(b => b.pages != null && b.pages > 0);
        const avgPages = withPages.length > 0 ? Math.round(withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length) : 300;
        const lengthBucket = avgPages < 250 ? 'short' : avgPages < 400 ? 'medium' : 'long';
        const authorMap = {};
        for (const b of books) {
            if (b.author && b.rating != null) {
                if (!authorMap[b.author])
                    authorMap[b.author] = { total: 0, count: 0 };
                authorMap[b.author].total += b.rating;
                authorMap[b.author].count += 1;
            }
        }
        const topAuthors = Object.entries(authorMap).filter(([, v]) => v.count >= 1)
            .map(([author, v]) => ({ author, avgRating: Math.round((v.total / v.count) * 10) / 10 }))
            .sort((a, b) => b.avgRating - a.avgRating).slice(0, 5);
        res.json({ topGenres, avgPages, lengthBucket, topAuthors, totalRated: books.filter(b => b.rating != null).length });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
app.get('/api/recommendations', requireAuth, async (req, res) => {
    try {
        const { genre, maxPages, minRating, author, q, exclude } = req.query;
        let searchQ = q ? String(q) : author ? `inauthor:${author}${genre ? '+subject:' + genre : ''}` : genre ? `subject:${genre}` : 'subject:fiction';
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQ)}&maxResults=20&printType=books&langRestrict=en`;
        const resp = await fetch(url);
        if (!resp.ok)
            throw new Error(`Google Books API error: ${resp.status}`);
        const data = await resp.json();
        if (!data.items?.length)
            return res.json([]);
        // Build exclusion set from ALL books (not just finished)
        const excludeSet = new Set();
        if (exclude) {
            db.prepare('SELECT title, author FROM books WHERE user_id=?').all(req.userId).forEach((b) => {
                if (b.title && b.author)
                    excludeSet.add(`${b.title}|${b.author}`.toLowerCase());
            });
        }
        const LANG_MAP = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
        const recs = data.items.map((item) => {
            const v = item.volumeInfo;
            const title = v.title || '', authors = (v.authors || []).join(', ');
            const key = `${title}|${authors}`.toLowerCase();
            // Exclude books already in library
            if (excludeSet.has(key))
                return null;
            if (maxPages && v.pageCount && v.pageCount > Number(maxPages))
                return null;
            if (minRating && (!v.averageRating || v.averageRating < Number(minRating)))
                return null;
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
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
// ── Static Files ──────────────────────────────────────────────────────────────
// Try new client dist path first
const newClientDist = join(__dirname, '..', 'dist-client', 'dist');
if (existsSync(newClientDist)) {
    const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://covers.openlibrary.org https://books.google.com https://images-na.ssl-images-amazon.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://openlibrary.org https://www.googleapis.com; frame-ancestors 'none';";
    app.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', CSP);
        next();
    });
    app.use(express.static(newClientDist));
    app.get('*', (_req, res) => {
        const index = join(newClientDist, 'index.html');
        res.sendFile(existsSync(index) ? index : newClientDist);
    });
}
else if (existsSync(CLIENT_DIST)) {
    // Fallback to old path
    const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://covers.openlibrary.org https://books.google.com https://images-na.ssl-images-amazon.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://openlibrary.org https://www.googleapis.com; frame-ancestors 'none';";
    app.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', CSP);
        next();
    });
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => {
        const index = join(CLIENT_DIST, 'index.html');
        res.sendFile(existsSync(index) ? index : CLIENT_DIST);
    });
}
const PORT = parseInt(process.env.PORT ?? '3443');
initAuth(); // Validate JWT_SECRET before starting
app.listen(PORT, '0.0.0.0', () => console.log(`Book Tracker API on http://0.0.0.0:${PORT}`));
