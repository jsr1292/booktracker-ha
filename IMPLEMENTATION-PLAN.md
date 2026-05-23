# BookTracker-HA — Implementation Plan
## All 31 Code Review Findings

---

## Phase 1: Critical Security (C1–C5)

---

### C1 — Fix `timingSafeEqual` length oracle
**File:** `api/src/index.ts:182–185`

**Root cause:** `padEnd` only pads when `adminKey` is *shorter* than `ADMIN_KEY`. When `adminKey` is *longer*, the buffers differ in byte length and `timingSafeEqual` throws → HTTP 500. Attacker distinguishes "too long" (500) from "wrong" (401) = length oracle.

**Fix:** Always compare same-length buffers, and combine the length-mismatch signal into the constant-time comparison result so no timing branch leaks:

```ts
// api/src/index.ts — replace lines 182–187
const keyBuf = Buffer.from(typeof adminKey === 'string' ? adminKey : '');
const refBuf = Buffer.from(ADMIN_KEY);
// Always compare exactly refBuf.length bytes (prevents throws and length leak)
const cmp = Buffer.alloc(refBuf.length, 0);
keyBuf.copy(cmp, 0, 0, Math.min(keyBuf.length, refBuf.length));
// XOR length mismatch into the comparison — both checks happen in constant time
if (keyBuf.length !== refBuf.length || !timingSafeEqual(cmp, refBuf)) {
  return res.status(401).json({ error: 'Invalid admin key' });
}
```

---

### C2 — Rate-limit `/api/admin/create-user`
**File:** `api/src/index.ts:173`

The existing `authLimiter` (5 req/min) already covers `/api/auth/register` and `/api/auth/login` but is missing from the admin route.

```ts
// Before
app.post('/api/admin/create-user', async (req: Request, res: Response) => {

// After
app.post('/api/admin/create-user', authLimiter, async (req: Request, res: Response) => {
```

---

### C3 — `token_version` to invalidate JWTs on password change
**Files:** `api/src/index.ts`, `api/src/middleware/auth.ts`

Three-part change:

**Part 1 — Schema migration** (add after existing migrations ~line 87 in `api/src/index.ts`):
```ts
try {
  db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }
```

**Part 2 — Update `api/src/middleware/auth.ts`** to accept a `db` reference and check `token_version`:
```ts
// Add a module-level setter so index.ts can inject the db instance
import type Database from 'better-sqlite3';
let _db: Database | null = null;
export function setAuthDb(d: Database): void { _db = d; }

// signToken — include tokenVersion in payload
export function signToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET!, { expiresIn: '7d' });
}

// requireAuth — verify tokenVersion matches DB row
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: number; tokenVersion: number };
    const user = _db!.prepare('SELECT token_version FROM users WHERE id = ?')
      .get(payload.userId) as { token_version: number } | undefined;
    if (!user || user.token_version !== (payload.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Part 3 — Update callers in `api/src/index.ts`**:
```ts
// After initAuth() call, add:
import { setAuthDb } from './middleware/auth.js';
setAuthDb(db); // right after `const db = new Database(...)`

// Register — token_version defaults to 0 on INSERT
const token = signToken(result.lastInsertRowid as number, 0);

// Login — read token_version from DB
const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  as { id: number; username: string; password_hash: string; token_version: number } | undefined;
// ... bcrypt check ...
const token = signToken(user.id, user.token_version);

// Admin create-user — same as register
const token is not issued here; no change needed.

// change-password — increment token_version, sign new token with new version
db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
  .run(newHash, req.userId!);
const updated = db.prepare('SELECT token_version FROM users WHERE id = ?')
  .get(req.userId!) as { token_version: number };
const token = signToken(req.userId!, updated.token_version);
```

---

### C4 — Check `REGISTRATION_ENABLED` before bcrypt
**File:** `api/src/index.ts:132–170`

**Root cause:** `bcrypt.hash(password, 10)` is called at line 145 (~100 ms) before the `REGISTRATION_ENABLED` check at line 149. This DoS-amplifies unauthenticated requests with no rate limit on the error path.

```ts
// Replace the register handler body — check FIRST, hash second
app.post('/api/auth/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    // ← Move REGISTRATION_ENABLED check here, BEFORE any expensive work
    if (!REGISTRATION_ENABLED) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'username must be 3-50 characters' });
    }
    if (password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: 'password must be 8-256 characters' });
    }
    // ← Only hash after all cheap checks pass
    const password_hash = await bcrypt.hash(password, 10);
    let result;
    try {
      result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
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
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});
```

---

### C5 — Remove `unsafe-inline` from `script-src` CSP
**File:** `api/src/index.ts:869, 881`

The current CSP includes `'unsafe-inline'` in `script-src`, which nullifies XSS protection entirely.

**Approach:** Add a nonce-injection middleware that reads `index.html` from disk, injects a per-request nonce into every `<script>` tag, and sets the CSP header with that nonce. Static assets (JS, CSS files) are still served by `express.static`.

```ts
// api/src/index.ts — replace both static-serving blocks with this helper
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';

function serveWithNonce(distPath: string): void {
  // Serve static assets (JS, CSS, images) without middleware overhead
  app.use(express.static(distPath, { index: false }));

  // Serve HTML with per-request nonce injection
  app.get('*', (req: Request, res: Response) => {
    const indexPath = join(distPath, 'index.html');
    if (!existsSync(indexPath)) { res.status(404).send('Not found'); return; }

    const nonce = randomBytes(16).toString('base64');
    const CSP = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https://covers.openlibrary.org https://archive.org https://*.us.archive.org https://*.archive.org https://books.google.com https://books.google.com/books https://images-na.ssl-images-amazon.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://openlibrary.org https://www.googleapis.com",
      "frame-ancestors 'none'",
    ].join('; ');

    res.setHeader('Content-Security-Policy', CSP);
    // Inject nonce into all inline <script> tags (Vite module-preload polyfill, etc.)
    const html = readFileSync(indexPath, 'utf-8')
      .replace(/<script\b/g, `<script nonce="${nonce}"`);
    res.send(html);
  });
}

// Replace the two if/else static-serving blocks:
if (existsSync(newClientDist)) {
  serveWithNonce(newClientDist);
} else if (existsSync(CLIENT_DIST)) {
  serveWithNonce(CLIENT_DIST);
}
```

---

## Phase 2: High Security + Data Integrity (H1–H7)

---

### H1 — Validate `cover_url` accepts only `https://`
**File:** `api/src/index.ts:601, 684, 735` and `api/src/shared/validation.ts`

**Add helper to `api/src/shared/validation.ts`:**
```ts
/** Accept only https:// URLs for cover images; return null otherwise */
export function safeCoverUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return null;
  return trimmed.slice(0, 2000);
}
```

**Replace all three raw `cover_url` usages in `api/src/index.ts`:**

POST handler (line 601):
```ts
// Before:
typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null,
// After:
safeCoverUrl(cover_url),
```

PATCH handler (line 684):
```ts
// Before:
cover_url !== undefined ? (typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null) : existing.cover_url,
// After:
cover_url !== undefined ? safeCoverUrl(cover_url) : existing.cover_url,
```

PUT handler (line 735):
```ts
// Before:
typeof cover_url === 'string' ? cover_url.slice(0, 2000) : null,
// After:
safeCoverUrl(cover_url),
```

Add `safeCoverUrl` to the import in `api/src/index.ts`:
```ts
import { sanitize, safePages, safeDate, safeDaysBetween, safeCoverUrl, VALID_STATUSES, MAX_NOTES } from './shared/validation.js';
```

---

### H2 — Apply `sanitize()` to PUT notes field
**File:** `api/src/index.ts:739`

```ts
// Before (line 739):
(notes ?? '').slice(0, MAX_NOTES) || null,

// After:
sanitize(notes ?? '').slice(0, MAX_NOTES) || null,
```

---

### H3 — Fix PATCH author clearing
**File:** `api/src/index.ts:640`

**Root cause:** `sanitize("") || existing.author` — empty string is falsy, so clearing author falls back to the existing value.

```ts
// Before (line 640):
const cleanAuthor = author !== undefined ? (sanitize(author ?? '') || existing.author) : existing.author;

// After — use null to clear, not the existing fallback:
const cleanAuthor = author !== undefined ? (sanitize(author ?? '') || null) : existing.author;
```

---

### H4 — Unify achievement IDs (client ↔ server)
**Files:** `api/src/index.ts:422–478`, `client/src/lib/db.ts:520–616`

The two lists use different IDs for the same concepts (e.g. server `quarter_century` = client `scholar`, server `half_year_streak` = client `on_fire`). Toast notifications in `App.tsx:191–196` hardcode client IDs, so server achievements never trigger toasts.

**Approach:** Update the server achievement IDs to match the client's IDs. The client's set is the canonical one (it has the full icon map and is what users see offline too).

**Mapping of server IDs to change** (in `api/src/index.ts`):

| Current server ID | Replace with | Threshold |
|---|---|---|
| `quarter_century` | `scholar` | 25 books |
| `half_century` | `librarian` | 50 books |
| `double_century` | `master_library` | 200 books |
| `page_10k` | `bookshelf_builder` | 10K pages |
| `page_25k` | `page_mountain` | 25K pages |
| `page_50k` | `page_summit` | 50K pages |
| `half_year_streak` | `on_fire` | 6 months |
| `year_round` | `unstoppable` | 12 months |
| `rating_pro` | *(remove — fold into `critic` at 20 books)* | — |
| `rating_master` | `critic` | 20 books |
| `five_star_only` | `top_score` | 1 five-star |
| `genre_king` | `genre_legend` | 10 genres |
| `tome_reader` | `long_haul` | 1 book ≥500 pages |
| `war_and_peace` | `tome_crusher` | 5 books ≥500 pages |
| `speed_demon` | `lightning` | finish book <3 days |
| `author_explorer` | *(remove — no client equivalent)* | — |
| `author_collector` | *(remove — no client equivalent)* | — |
| `planned_reader` | *(remove — no client equivalent)* | — |
| `collector` | *(remove — no client equivalent)* | — |
| `library` | *(remove — no client equivalent)* | — |

IDs that are already the same (keep): `first_steps`, `bookworm`, `speed_reader`, `page_turner`, `marathon_reader`, `streak_starter`, `consistent_reader`, `rating_enthusiast`, `genre_explorer`, `genre_master`, `century_club`, `slow_burn`, `short_and_sweet`, `heavy_hitter`, `epic_saga`, `marathon_month`, `completionist`, `genre_specialist`.

**Also add these client-only achievements to server** (so online users see them too):
- `tough_judge` — give 1-star rating
- `polyglot` — read books in 3+ languages
- `tome_crusher` — 5 books ≥500 pages
- `fantasy_fan`, `science_nerd`, `history_buff`, `thriller_addict`, `scifi_voyager`, `deep_thinker`, `life_stories`, `business_mind`, `self_improver` — genre-specific counts

For the server, these genre achievements require adding genre-specific SQL count queries to the stats handler.

**Longer-term:** Create `api/src/shared/achievements.ts` with a `buildAchievements(stats)` function that both server (direct import) and client (maintained-in-sync copy at `client/src/lib/achievements.ts`) use. This eliminates future drift.

---

### H5 — Consolidate stats queries into CTEs
**File:** `api/src/index.ts:289–486`

The endpoint fires 26+ individual `db.prepare().get()/.all()` calls. Replace with 5 targeted queries:

**Query 1 — All scalar aggregates** (replaces ~15 individual queries):
```ts
const scalars = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) AS finished,
    SUM(CASE WHEN status='reading'  THEN 1 ELSE 0 END) AS reading,
    SUM(CASE WHEN status='planned'  THEN 1 ELSE 0 END) AS planned,
    SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) AS abandoned,
    COALESCE(SUM(CASE WHEN status='finished' AND pages>0 THEN pages ELSE 0 END), 0) AS total_pages,
    ROUND(COALESCE(AVG(CASE WHEN status='finished' AND pages>0 THEN CAST(pages AS REAL) END), 0)) AS avg_pages,
    COALESCE(AVG(CASE WHEN status='finished' AND rating IS NOT NULL THEN CAST(rating AS REAL) END), 0) AS avg_rating,
    SUM(CASE WHEN status='finished' AND rating IS NOT NULL THEN 1 ELSE 0 END) AS rated,
    COALESCE(MAX(CASE WHEN status='finished' AND pages>0 THEN pages END), 0) AS longest_book,
    COALESCE(MIN(CASE WHEN status='finished' AND pages>0 THEN pages END), 0) AS shortest_book,
    COALESCE(MAX(CASE WHEN status='finished' THEN rating END), 0) AS top_rated,
    SUM(CASE WHEN status='finished' AND rating>=4 THEN 1 ELSE 0 END) AS high_ratings,
    COUNT(DISTINCT CASE WHEN status='finished' AND author IS NOT NULL AND author!='' THEN author END) AS author_count,
    COUNT(DISTINCT CASE WHEN status='finished' AND date_finished IS NOT NULL
          THEN substr(date_finished,1,7) END) AS distinct_months,
    COALESCE(MIN(CASE WHEN status='finished'
          AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished)-julianday(date_started) BETWEEN 0 AND 3650
          THEN julianday(date_finished)-julianday(date_started) END), 999) AS fastest_finish,
    COALESCE(MAX(CASE WHEN status='finished'
          AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished)-julianday(date_started) BETWEEN 0 AND 3650
          THEN julianday(date_finished)-julianday(date_started) END), 0) AS slowest_finish,
    COALESCE(SUM(CASE WHEN status='finished'
          AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished)-julianday(date_started) BETWEEN 0 AND 3650
          AND pages>0 THEN pages ELSE 0 END), 0) AS pace_pages,
    COALESCE(SUM(CASE WHEN status='finished'
          AND date_started IS NOT NULL AND date_finished IS NOT NULL
          AND julianday(date_finished)-julianday(date_started) BETWEEN 0 AND 3650
          AND pages>0 THEN julianday(date_finished)-julianday(date_started) ELSE 0 END), 0) AS pace_days
  FROM books WHERE user_id=?
`).get(userId) as ScalarsRow;
```

**Query 2 — Rating distribution** (replaces 5 individual per-star queries):
```ts
const ratingDistRow = db.prepare(`
  SELECT
    SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) AS r1,
    SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) AS r2,
    SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) AS r3,
    SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) AS r4,
    SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) AS r5
  FROM books WHERE user_id=? AND status='finished'
`).get(userId) as { r1: number; r2: number; r3: number; r4: number; r5: number };
const ratingDist = [1,2,3,4,5].map(s => ({ rating: s, count: (ratingDistRow as any)[`r${s}`] }));
```

**Query 3 — Genre distribution + max-per-month** (CTE):
```ts
const genreRows = db.prepare(`
  SELECT genre, COUNT(*) AS count FROM books
  WHERE user_id=? AND status='finished' AND genre IS NOT NULL
  GROUP BY genre ORDER BY count DESC
`).all(userId) as { genre: string; count: number }[];
```

```ts
const maxPerMonth = (db.prepare(`
  SELECT COALESCE(MAX(cnt), 0) AS max FROM (
    SELECT COUNT(*) AS cnt FROM books
    WHERE user_id=? AND status='finished' AND date_finished IS NOT NULL
    GROUP BY substr(date_finished,1,7)
  )
`).get(userId) as { max: number }).max;
```

**Queries 4–5 — Time series** (4 group-by queries, each already one call, just kept):
- `booksPerMonth`, `pagesPerMonth`, `avgRatingOverTime`, `paceOverTime`, `readingCalendar` — keep as individual queries but move them before achievement calculation so `bpmRows` data can be used for streak (see M4).

**Net result:** ~26 queries → 7 queries.

---

### H6 — Only push books changed since last sync
**File:** `client/src/lib/sync.ts:80–153`

Add a module-level timestamp to track the last successful sync. Skip books whose `updated_at` predates it.

```ts
// Add at module level (sync.ts)
let _lastSyncAt: string | null = null;

// In syncToServer(), inside the loop for already-mapped books:
export async function syncToServer(): Promise<void> {
  if (!isLoggedIn()) return;
  const localBooks = await db.books.toArray();
  const idMap = getServerIdMap();
  const syncStart = new Date().toISOString();

  for (const book of localBooks) {
    if (book.id == null) continue;
    const serverId = idMap[book.id];

    if (serverId) {
      // Skip if not changed since last successful sync
      if (_lastSyncAt && book.updated_at <= _lastSyncAt) continue;

      try {
        const serverBook = await updateServerBook(serverId, { /* ...fields */ });
        if (new Date(serverBook.updated_at) > new Date(book.updated_at)) {
          const { id: _id, ...rest } = serverBook;
          void _id;
          await db.books.update(book.id, { ...rest });
        }
      } catch { /* skip */ }
    } else {
      // ... unchanged new-book creation logic ...
    }
  }
  _lastSyncAt = syncStart; // Only advance after the loop completes
}
```

---

### H7 — Client `safeDate` must require `YYYY-MM-DD` format
**File:** `client/src/lib/db.ts:55–60`

```ts
// Before
function safeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string' || !dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

// After — add the same regex the server uses (api/src/shared/validation.ts:21)
function safeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string' || !dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return dateStr;
}
```

---

## Phase 3: Medium Fixes (M1–M11)

---

### M1 — Separate `AbortController` per fetch in `lookupISBN`
**File:** `client/src/api/bookLookup.ts:27–79`

A single shared controller means the 10s timeout is consumed by both requests. If Google Books takes 9s, Open Library gets 1s.

```ts
// Replace lookupISBN with separate controllers:
export async function lookupISBN(isbn: string): Promise<BookResult | null> {
  // Google Books — 8s independent timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const gb = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
        { signal: controller.signal }
      );
      const gbData = await gb.json();
      clearTimeout(timeout);
      if (gbData.items?.length) {
        const v = gbData.items[0].volumeInfo;
        return {
          title: v.title || 'Unknown',
          author: (v.authors || []).join(', ') || 'Unknown',
          pages: typeof v.pageCount === 'number' ? v.pageCount : null,
          genre: (v.categories || [])[0] || null,
          coverUrl: v.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
          isbn,
          description: v.description || null,
          language: v.language ? langCodeToName(v.language) : null,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  // Open Library fallback — fresh 8s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const ol = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
        { signal: controller.signal }
      );
      const olData = await ol.json();
      clearTimeout(timeout);
      const key = `ISBN:${isbn}`;
      if (olData[key]) {
        const d = olData[key];
        return {
          title: d.title || 'Unknown',
          author: d.authors?.[0]?.name || 'Unknown',
          pages: d.number_of_pages || null,
          genre: d.subjects?.[0]?.name || null,
          coverUrl: d.cover?.medium || null,
          isbn,
          language: null,
          description: null,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  return null;
}
```

---

### M2 — In-flight dedup guard for `getBooks` server fetches
**File:** `client/src/lib/db.ts:96–112`

Multiple simultaneous React renders call `getBooks`, triggering parallel `fetchServerBooks()` calls (N+1 to the server on every re-render).

```ts
// Add at module level in db.ts
let _fetchInFlight: Promise<ServerBook[]> | null = null;

// In getBooks():
export async function getBooks(options?: { ... }): Promise<Book[]> {
  if (isLoggedIn()) {
    try {
      const { fetchServerBooks } = await import('./auth');
      // Deduplicate concurrent fetches — only one in-flight request at a time
      if (!_fetchInFlight) {
        _fetchInFlight = fetchServerBooks().finally(() => { _fetchInFlight = null; });
      }
      const serverBooks = await _fetchInFlight;
      await cacheServerBooks(serverBooks as unknown as Array<Record<string, unknown>>);
      const localBooks = await db.books.toArray();
      return applyFilters(localBooks, options);
    } catch {
      // Server unreachable — fall back to IndexedDB
    }
  }
  // ... rest of offline path unchanged ...
}
```

The import type needs `ServerBook`:
```ts
import type { ServerBook } from './auth'; // at top of db.ts (type-only, safe)
```

---

### M3 — `useMemo` → `useCallback` for `handleStatusToggle`
**File:** `client/src/components/BookList.tsx:111`

`useMemo` is for memoizing computed *values*; `useCallback` is for memoizing *functions*. Using `useMemo` for a function is semantically wrong (though it works, it misleads readers).

```ts
// Before (line 111)
const handleStatusToggle = useMemo(() => async (book: Book) => {
  // ...
}, [onRefresh]);

// After
const handleStatusToggle = useCallback(async (book: Book) => {
  // ...
}, [onRefresh]);
```

Also update the import line at the top of `BookList.tsx`:
```ts
// Before
import { useState, useMemo } from 'react';
// After
import { useState, useMemo, useCallback } from 'react';
```

---

### M4 — Fix server streak: count consecutive months, not all distinct months
**File:** `api/src/index.ts:308`

The server counts `COUNT(DISTINCT substr(date_finished,1,7))` — total distinct months with any finished book. The client counts *consecutive* months with a 1-month grace period. The server always reports a higher (inflated) streak.

**Fix:** Compute streak from the already-needed `bpmRows` data (books per month). Move `bpmRows` query before the `currentStreak` calculation, then derive the streak in TypeScript using the same consecutive-month logic as the client:

```ts
// 1. Move bpmRows query to the TOP of the stats handler (before achievements):
const bpmRows = db.prepare(`
  SELECT substr(date_finished,1,7) AS month, COUNT(*) AS count
  FROM books WHERE user_id=? AND status='finished' AND date_finished IS NOT NULL
  GROUP BY month ORDER BY month
`).all(userId) as { month: string; count: number }[];
const booksPerMonth = bpmRows.map(r => ({ month: r.month, count: r.count }));

// 2. Replace the COUNT(DISTINCT...) streak query with this:
const sortedMonths = bpmRows.map(r => r.month); // already sorted by query
let currentStreak = 0;
for (let i = 0; i < sortedMonths.length; i++) {
  if (i === 0) {
    currentStreak = 1;
  } else {
    const [py, pm] = sortedMonths[i - 1].split('-').map(Number);
    const [cy, cm] = sortedMonths[i].split('-').map(Number);
    const gap = (cy * 12 + cm) - (py * 12 + pm);
    // Grace period: gap of 2 (one skipped month) still continues streak
    currentStreak = gap <= 2 ? currentStreak + 1 : 1;
  }
}
// Remove the old single-query streak line (line 308)
```

---

### M5 — Use `section.title` as React key in Recommendations
**File:** `client/src/components/Recommendations.tsx:334`

Array-index keys cause React to reuse wrong DOM nodes when filtered sections reorder.

```tsx
// Before
{filteredSections.map((section, i) => (
  <RecommendationSection key={i} section={section} ... />
))}

// After
{filteredSections.map((section) => (
  <RecommendationSection key={section.title} section={section} ... />
))}
```

---

### M6 — Delete personal data file, add to `.gitignore`
**File:** `client/src/books_backup.json`

```bash
rm client/src/books_backup.json
```

Add to root `.gitignore`:
```gitignore
# Personal data — never commit book lists
*_backup.json
client/src/books_backup.json
```

Check nothing imports it:
```bash
grep -r "books_backup" client/src  # should return nothing
```

---

### M7 — Add response compression
**File:** `api/src/index.ts` (top of middleware stack)

Stats responses can be 10–50 KB of JSON. Compression makes a significant difference on slow connections.

```bash
# In api/
npm install compression
npm install -D @types/compression
```

```ts
// api/src/index.ts — add after other imports
import compression from 'compression';

// Add to middleware stack right after helmet():
app.use(helmet());
app.use(compression()); // ← add this line
app.use(cors({ ... }));
```

---

### M8 — JWT in localStorage (XSS-stealable)
**File:** `client/src/lib/auth.ts:8`

Tokens in `localStorage` are accessible to any JS on the page. Combined with C5 (`unsafe-inline`), any XSS can exfiltrate the token.

**Prerequisite:** Fix C5 (CSP) first. HttpOnly cookie auth is the full fix.

**Full migration plan (deferred until after C5 is deployed):**

*Server side (`api/src/index.ts`):*
1. Add `cookie-parser` middleware
2. `POST /api/auth/login` and `/register`: Set `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict` instead of returning token in body
3. `requireAuth`: read token from `req.cookies.token` if no Bearer header
4. `POST /api/auth/logout`: clear the cookie

*Client side (`client/src/lib/auth.ts`):*
1. Remove `storeToken`, `getToken`, `clearToken` localStorage calls
2. Add `credentials: 'include'` to all `apiFetch` calls
3. `isLoggedIn()`: call a lightweight `GET /api/auth/me` endpoint instead of parsing localStorage JWT

**Interim mitigation:** Tighten CSP (C5) to eliminate the inline-script vector first.

---

### M9 — Align password minimum length to 8 on server
**File:** `api/src/index.ts:240`

Client requires ≥8 characters (App.tsx:59). Server accepts ≥6. Server should match.

```ts
// Before (line 240):
if (newPassword.length < 6 || newPassword.length > 256) {
  return res.status(400).json({ error: 'New password must be 6-256 characters' });
}

// After:
if (newPassword.length < 8 || newPassword.length > 256) {
  return res.status(400).json({ error: 'New password must be 8-256 characters' });
}
```

---

### M10 — Pass `openLibraryKey` to `BookDetailSheet`
**File:** `client/src/App.tsx:755–763`

The `openLibraryKey` prop exists on `BookDetailSheet` (line 11) and drives OL community ratings, but is never passed from `App.tsx`. The feature is dead.

**Fix:** Store OL key alongside `detailBook` state:

```tsx
// In App.tsx — add state
const [detailBook, setDetailBook] = useState<Book | null>(null);
const [detailOlKey, setDetailOlKey] = useState<string | undefined>(); // ← add this

// Wherever setDetailBook is called (book list tap, search result, etc.),
// also set setDetailOlKey(book.olKey ?? undefined).
// If Book type doesn't carry olKey, add an optional field:

// In client/src/types.ts — add to Book interface:
// openLibraryKey?: string;  // populated when book comes from OL search

// Pass the prop:
<BookDetailSheet
  book={detailBook}
  openLibraryKey={detailOlKey}   // ← was missing
  onEdit={() => { setDetailBook(null); handleEditBook(detailBook); }}
  onDelete={() => { if (detailBook.id != null) handleDeleteBook(detailBook.id); setDetailBook(null); }}
  onClose={() => setDetailBook(null)}
  onAddBook={handleRecommendationAdd}
/>
```

For books opened from search results (where the OL key is known), thread the key through the `onOpenDetail` callback to carry it to `detailOlKey`.

---

### M11 — Fix `fetchTrending` incompatible cache format
**File:** `client/src/lib/openLibrary.ts:169–174`

`fetchTrending` reads with `{ ts, data }` but the rest of the file's `setCache` helper writes `{ timestamp, data }`. If any other code ever writes to the same key, the cache is unreadable. Also, `fetchTrending` writes `{ ts, ... }` on line 217, making it inconsistent with every other cache entry in the file.

**Fix:** Refactor `fetchTrending` to use the existing `getCache`/`setCache` helpers:

```ts
// Before (lines 169–174):
const raw = localStorage.getItem(cacheKey);
if (raw) {
  try {
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < ttl) return data;
  } catch { /* cache miss */ }
}

// After:
const cached = getCache<OLBook[]>(cacheKey, ttl);
if (cached) return cached;

// Before (line 217):
localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: books }));

// After:
setCache(cacheKey, books);
```

`getCache` and `setCache` are currently private (not exported). Either export them or make them module-scope helpers (they already are — just not exported). Make them exported:
```ts
// Change in openLibrary.ts:
export function getCache<T>( ... ) { ... }
export function setCache<T>( ... ) { ... }
```

---

## Phase 4: Low Quality (L1–L7)

---

### L1 — Add `user_id` filter to PATCH SELECT-after-update
**File:** `api/src/index.ts:692`

Not exploitable now (the row was already found with `user_id` filter in the pre-update SELECT), but inconsistent and fragile — a future refactor could break authorization if the update query is reordered.

```ts
// Before (line 692):
res.json(db.prepare('SELECT * FROM books WHERE id=?').get(id) as BookRow);

// After:
res.json(db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow);
```

Same fix applies to the PUT handler (line 743):
```ts
// Before:
res.json(db.prepare('SELECT * FROM books WHERE id=?').get(id) as BookRow);
// After:
res.json(db.prepare('SELECT * FROM books WHERE id=? AND user_id=?').get(id, req.userId) as BookRow);
```

---

### L2 — Return 400 for invalid status in PUT (match POST behavior)
**File:** `api/src/index.ts:716`

POST returns 400 for invalid/missing status. PUT silently defaults to `'finished'`.

```ts
// Before (line 716):
const s = (VALID_STATUSES as readonly string[]).includes(status as string)
  ? status as typeof VALID_STATUSES[number]
  : 'finished';

// After:
if (!status || !(VALID_STATUSES as readonly string[]).includes(status as string)) {
  res.status(400).json({
    error: status
      ? `Invalid status '${status}'. Valid values: ${VALID_STATUSES.join(', ')}`
      : `status is required. Valid values: ${VALID_STATUSES.join(', ')}`,
  });
  return;
}
const s = status as typeof VALID_STATUSES[number];
```

---

### L3 — Delete dead-code legacy API client
**File:** `client/src/api.ts`

The file is self-documenting as unused (`// UNUSED — legacy API client`). Verify no imports remain, then delete:

```bash
grep -r "from.*['\"]../api['\"]" client/src   # must return nothing
grep -r "from.*['\"]\./api['\"]" client/src   # must return nothing
rm client/src/api.ts
```

---

### L4 — Fix date comparison timezone bug in `BookForm`
**File:** `client/src/components/BookForm.tsx:133`

`new Date("2024-01-15")` parses as UTC midnight, but the rest of the codebase uses local midnight (`+ 'T00:00:00'`). This can cause an off-by-one: in UTC-5, `2024-01-15` UTC = 2024-01-14 19:00 local, making the comparison `> new Date(dateFinished + 'T00:00:00')` incorrect.

```ts
// Before (line 133):
if (dateStarted && dateFinished && new Date(dateStarted) > new Date(dateFinished)) {
  e.dateStarted = 'Must be before finish date';
}

// After:
if (dateStarted && dateFinished &&
    new Date(dateStarted + 'T00:00:00') > new Date(dateFinished + 'T00:00:00')) {
  e.dateStarted = 'Must be before finish date';
}
```

---

### L5 — Add `toastRef` to `useEffect` dependency array
**File:** `client/src/App.tsx:199`

`toastRef` (the DOM element reference used for confetti positioning) is captured in a `setTimeout` inside a `useEffect` but is not in the effect's dependency array. ESLint is suppressed rather than the issue being fixed.

**Investigation step first:** Determine how `toastRef` is declared. If it is a `useRef` object, the *ref object* is stable and should not be in deps — but `toastRef.current` (a mutable value) can be stale inside closures.

```tsx
// If toastRef is stored as a ref callback result (a DOM element in state):
// Move to useRef pattern:
const toastRef = useRef<HTMLElement | null>(null);
// In JSX: ref={el => { toastRef.current = el; }}

// The useEffect that reads toastRef should use toastRef.current inside the closure;
// the ref object itself is stable so it's fine to omit from deps.
// The ESLint suppression comment can then be removed.
```

If `toastRef` is held in state (not a ref), add it to the dependency array and accept the re-run.

---

### L6 — Strip event-handler strings in `sanitize()`
**File:** `api/src/shared/validation.ts:6` and `client/src/lib/db.ts:42–45`

The current regex strips HTML tags but not inline event attributes (`onerror=alert(1)`) or `javascript:` URLs that appear outside tag context.

```ts
// Before (api/src/shared/validation.ts:6):
export function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

// After:
export function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')            // strip HTML tags
    .replace(/\bon\w+\s*=\s*\S+/gi, '') // strip event handler attributes (onerror=, onclick=, etc.)
    .replace(/javascript\s*:/gi, '')     // strip javascript: URI schemes
    .trim();
}
```

Apply the **same change** to the duplicate function in `client/src/lib/db.ts:42–45`.

---

### L7 — Reset `statsCache.dirty` on HMR
**File:** `client/src/lib/db.ts:344`

`statsCache` is a module-level variable that never resets during Vite HMR. Stale stats persist across hot reloads in development.

```ts
// Add at the very end of client/src/lib/db.ts:
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    statsCache = { stats: null, dirty: true };
  });
}
```

This is a dev-only change — `import.meta.hot` is undefined in production builds.

---

## Execution Order

```
Phase 1 (parallel, ~2–3 h):   C1, C2, C3, C4, C5
Phase 2 (parallel, ~3–4 h):   H1, H2, H3, H7   then   H4, H5, H6
Phase 3 (parallel, ~2–3 h):   M1, M2, M3, M4, M5, M6, M7, M9, M10, M11   then   M8 (after C5)
Phase 4 (parallel, ~1 h):     L1, L2, L3, L4, L5, L6, L7
```

**Total estimated effort: 8–12 hours**

**Risk order (address first):**
1. C1 — active security bug (throws in production, leaks timing info)
2. C4 — DoS amplifier with no cost to attacker
3. H1 — stored XSS via `javascript:` cover URLs
4. C3 — credential theft survives password change
5. C2 + C5 — complete the auth hardening pass
