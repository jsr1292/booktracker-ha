# BookTracker-HA — Comprehensive Code Audit
## Generated: 2026-05-22 | Auditor: Claude Code v2.1.145

---

## Critical (5)

### C1: `timingSafeEqual` throws for longer admin keys → length oracle attack
**`api/src/index.ts:182-185`**
`padEnd` is a no-op when adminKey > ADMIN_KEY. Buffers differ in length → `timingSafeEqual` throws → HTTP 500. 
Attacker distinguishes "key too long" (500) from "key wrong" (401) → length oracle.
**Fix:** Guard length check before comparison.

### C2: No rate limiting on `/api/admin/create-user`
**`api/src/index.ts:173`**
Register and login have `authLimiter` (5 req/min). Admin route has none → brute-force admin key.
**Fix:** Apply `authLimiter` to admin route.

### C3: Password change doesn't invalidate existing JWTs
**`api/src/index.ts:252-253`**
New token issued but old tokens valid for 7 days. Stolen credentials remain usable after password change.
**Fix:** Add `token_version` column, check in `requireAuth`, increment on password change.

### C4: `REGISTRATION_ENABLED` checked after bcrypt hashing
**`api/src/index.ts:145, 149-153`**
bcrypt cost=10 = ~100ms. Hash computed before checking if registration is even enabled.
DoS amplifier with no rate limiting on error path.
**Fix:** Check `REGISTRATION_ENABLED` before bcrypt.

### C5: CSP allows `unsafe-inline` scripts — nullifies XSS protection
**`api/src/index.ts:869, 881`**
`script-src 'self' 'unsafe-inline'` permits inline scripts and event handlers.
**Fix:** Nonce-based CSP, or at minimum remove `unsafe-inline`.

---

## High (7)

### H1: `cover_url` accepts `javascript:` and `data:` URIs → stored XSS
**`api/src/index.ts:601, 684, 735`**
Only validation is length truncation. No URL scheme check.
**Fix:** Validate `cover_url` starts with `https://`.

### H2: PUT handler skips `sanitize()` on notes field
**`api/src/index.ts:739`**
POST uses `sanitize(notes ?? '')` but PUT uses raw `(notes ?? '').slice()`.
**Fix:** Apply `sanitize()` in PUT handler too.

### H3: PATCH cannot clear `author` field
**`api/src/index.ts:640`**
`sanitize("")` is falsy → silently falls back to existing value.
**Fix:** Check `author !== undefined` before the `||` fallback.

### H4: Client and server define different achievement IDs
**`api/src/index.ts:422-478` vs `client/src/lib/db.ts:520-616`**
Server: `quarter_century`, `half_century`, `double_century`...
Client: `scholar`, `librarian`, `master_library`...
Offline vs online shows different badges. Toast notifications never fire for server achievements.
**Fix:** Unify to single achievement definition, share between client and server.

### H5: Stats endpoint fires ~22 separate SQL queries
**`api/src/index.ts:289-486`**
22 individual `db.prepare().get()`/`.all()` calls in sequence.
**Fix:** Consolidate into 3-4 queries using CTEs.

### H6: `syncToServer` makes N individual PATCH requests
**`client/src/lib/sync.ts:80-153`**
Every synced book = separate PATCH. 50 books = 50 sequential requests every 60s.
**Fix:** Only push books changed since last sync. Consider batch endpoint.

### H7: Client `safeDate` accepts formats server rejects
**`client/src/lib/db.ts:55-60`**
Client accepts `"2024-1-5"` (single digit). Server rejects non-YYYY-MM-DD.
**Fix:** Use same regex validation on client.

---

## Medium (11)

### M1: Shared AbortController gives fallback wrong timeout
**`client/src/api/bookLookup.ts:27-79`**
10s timeout shared between primary + fallback. Primary consuming 9s leaves 1s for fallback.

### M2: No dedup of concurrent `getBooks` server fetches
**`client/src/lib/db.ts:96-112`**
Multiple React renders trigger parallel fetches. No in-flight guard.
**Fix:** Module-level promise guard.

### M3: `useMemo` used instead of `useCallback`
**`client/src/components/BookList.tsx:111`**
Semantically wrong — `useMemo` is for values, `useCallback` for functions.

### M4: Server streak counts all months, not consecutive
**`api/src/index.ts:308` vs `client/src/lib/db.ts:394-424`**
Server counts DISTINCT months with any book. Client correctly counts consecutive months.
Server always reports higher streak → inflates streak achievements.

### M5: Array index as React `key` in Recommendations
**`client/src/components/Recommendations.tsx:334`**
Filtered sections cause React to reuse wrong DOM nodes.
**Fix:** Use `section.title` as key.

### M6: Personal reading data in source repo
**`client/src/books_backup.json`**
Book titles, dates, ratings committed to source code. Data exposure.
**Fix:** Delete file, add to `.gitignore`.

### M7: No response compression on Express server
Stats response can be 10-50x larger without gzip/brotli.

### M8: JWT in localStorage (XSS-stealable)
**`client/src/lib/auth.ts:8`**
Combined with C5 (unsafe-inline), any XSS exfiltrates tokens.
**Fix:** HttpOnly cookies, or tighten CSP first.

### M9: Password min-length inconsistency
**Client: 8 chars (`App.tsx:59`) vs Server: 6 chars (`index.ts:240`)**
Server accepts what client rejects.

### M10: `openLibraryKey` never passed to `BookDetailSheet`
**`client/src/App.tsx:755-763`**
OL community ratings feature is dead code — prop never passed.

### M11: `fetchTrending` uses incompatible cache format
**`client/src/lib/openLibrary.ts:169-174`**
`{ ts, data }` vs `{ timestamp, data }` used by `cachedFetch`.

---

## Low (7)

### L1: PATCH SELECT-after-update missing `user_id` filter
**`api/src/index.ts:692`** — Not exploitable now but inconsistent pattern.

### L2: PUT silently defaults invalid status to `'finished'`
**`api/src/index.ts:716`** — POST returns 400 for same case. Inconsistent.

### L3: Dead-code legacy API client
**`client/src/api.ts`** — Unauthenticated fetch calls, marked unused. Delete.

### L4: Date comparison timezone bug
**`client/src/components/BookForm.tsx:133`** — `new Date("2024-01-15")` is UTC, rest of codebase uses local time.

### L5: ESLint suppression hides stale `toastRef` closure
**`client/src/App.tsx:199`** — `toastRef` not in dependency array.

### L6: `sanitize()` doesn't strip event-handler strings
**`api/src/shared/validation.ts:6`** — Strips HTML tags but `onerror=alert(1)` passes through.

### L7: Module-level stats cache stale across HMR reloads
**`client/src/lib/db.ts:344`** — Dev-only issue, confusing during development.

---

## Implementation Plan

### Phase 1: Critical Security (C1-C5) — 2-3 hours
All parallel:
- C1: Guard admin key length before `timingSafeEqual`
- C2: Apply `authLimiter` to admin routes
- C3: Add `token_version` to users table + JWT + auth middleware
- C4: Move `REGISTRATION_ENABLED` check before bcrypt
- C5: Replace `unsafe-inline` with nonce-based CSP

### Phase 2: High Security + Data Integrity (H1-H7) — 3-4 hours
- H1: Validate `cover_url` scheme is `https://`
- H2: Apply `sanitize()` to PUT notes field
- H3: Fix PATCH author clearing (check undefined before fallback)
- H4: Unify achievement IDs between client and server (shared file)
- H5: Consolidate 22 stats queries into 3-4 CTEs
- H6: Add `last_synced_at` tracking, only push changed books
- H7: Client-side date validation matching server regex

### Phase 3: Medium Fixes (M1-M11) — 2-3 hours
- M1: Separate AbortController per fetch
- M2: In-flight promise guard for getBooks
- M3: `useMemo` → `useCallback`
- M4: Fix server streak calculation to match client logic
- M5: Use `section.title` as React key
- M6: Delete `books_backup.json`, add to `.gitignore`
- M7: Add `compression` middleware
- M8: HttpOnly cookie auth (or at minimum tighten CSP first)
- M9: Align password min-length (8 everywhere)
- M10: Pass `openLibraryKey` prop to BookDetailSheet
- M11: Fix `fetchTrending` cache format to `{ timestamp, data }`

### Phase 4: Low Quality (L1-L7) — 1-2 hours
- L1: Add `user_id` filter to PATCH SELECT
- L2: Return 400 for invalid status in PUT (match POST)
- L3: Delete `client/src/api.ts`
- L4: Use `new Date(dateStr + 'T00:00:00')` consistently
- L5: Add `toastRef` to useEffect dependency array
- L6: Strip `on\w+=` patterns in sanitize()
- L7: Reset `statsCache.dirty` on HMR (dev-only)

**Total estimated effort: 8-12 hours**

---

## Security audit follow-up (2026-06-23)

Full-history audit of the public repo. Applied:
- Untracked dev DBs (`api/database.sqlite*`, `api/data/books.db`) and `client/src/books_backup.json`; tightened `.gitignore`. **These plus `api/key.pem`/`api/cert.pem` were purged from all git history (filter-repo) and the keypair rotated** — they had been committed historically and were recoverable via `git show`.
- Rate-limited `/api/auth/change-password` and `/api/backfill-covers`.
- Generic error responses (no `err.message` leakage) via `sendServerError()`.
- bcrypt cost 10 → 12.
- Defense-in-depth `user_id` filter on the `PUT /api/books/:id` response SELECT.
- Hardened `sanitize()` (loop-strip) in both copies.

Deferred (deliberate):
- **M8 HttpOnly cookie auth** — needs runtime testing under HA ingress (SameSite/Secure/path); `script-src` is already nonce-only so the localStorage XSS vector is substantially mitigated. Revisit with a live ingress test.
- **CSP `style-src 'unsafe-inline'`** — kept; the React UI relies on inline `style={{}}` props. Removing it requires migrating all inline styles to CSS classes. Low risk given the nonce'd `script-src`.
