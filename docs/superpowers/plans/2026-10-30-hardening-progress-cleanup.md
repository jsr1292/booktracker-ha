# Hardening, reading progress and cleanup

Branch: `feat/hardening-and-progress`. Do not push or release. Requested by the owner on 2026-10-30.

## Ground rules
- Codex's sandbox can't write `.git` or reach the network. Don't commit, install packages, or edit `node_modules` or lockfiles; dependencies are installed. Leave changes in the working tree. Claude reviews, tests and commits.
- Write the failing test first and show it failing wherever a task lists tests. The owner wants tests proven to fail first.
- Keep the existing inline-style idiom. Text is at least 11px, tap targets at least 44px, and use theme variables (`var(--bg2)`, `var(--card-border)`), not hard-coded colours.
- Touch only the files a task names.

Commands:
- Client: `cd client && npm test && npm run build` (the build type-checks test files; target is ES2020, so no `Array.at`).
- API: `cd api && PATH=/private/tmp/claude-501/-Users-jsr-Projects-booktracker-ha/94a28814-7ccf-4054-aad5-02a626828ce5/scratchpad/node20/bin:$PATH npm test && PATH=<same>:$PATH npx tsc --noEmit`. `better-sqlite3` needs Node 20.

Facts about the deployment:
- The add-on runs on a Raspberry Pi. HTTPS reaches it through cloudflared on the host network, which most likely targets `localhost:8099` or the LAN IP, so port 8099 must stay published on the host.
- Behind a proxy `X-Forwarded-For` holds the client address; plain LAN clients connect directly.

## Run A: protect the data (group 1)

### Task A1: API test harness
Files: `api/package.json`, `api/src/index.ts`, new `api/test/helpers.ts`, new `api/test/api.test.ts`.
- `DATA_DIR` env var overrides the data directory (default stays `/data` if present, else local).
- `"test": "node --import tsx --test test/*.test.ts"`.
- Helper starts the real server as a child process on a free port with a temp `DATA_DIR`, `JWT_SECRET` and `ADMIN_KEY`, waits until it answers, and stops it afterwards. Creates users through `/api/admin/create-user`. Allow for the 5/minute auth limiter by giving each test file its own server, or log in once and reuse the token.
- Regression tests: `/api/stats` returns 200 with a book present (the invalid `GROUP_CONCAT` bug); `/index.html` and `/` both carry a `connect-src` including `https://openlibrary.org`; `/sw.js` carries a CSP allowing the font hosts. Skip static-file checks only when no client build exists; say so in the test name.

### Task A2: Login protection
Files: new `api/src/shared/loginThrottle.ts`, `api/test/loginThrottle.test.ts`, `api/test/api.test.ts`, `api/src/index.ts`.
Problem: `trust proxy = 1` lets a direct client choose its own IP with `X-Forwarded-For`, so rotating that header defeats the 5/minute limiter.
- `app.set('trust proxy', 'loopback, linklocal, uniquelocal')`, so only private proxies are believed and a public client can't spoof.
- A LAN client is still private, so add a per-account throttle that ignores IP. `createLoginThrottle({ maxFailures: 10, windowMs: 15 * 60 * 1000, maxEntries: 5000, now })` with `isLocked(username)`, `recordFailure(username)`, `recordSuccess(username)`. Usernames are lowercased and trimmed. Failed attempts count within a sliding or fixed window. Successful login clears the count. Entries expire, and the map can't grow past `maxEntries` (evict oldest), since attackers choose the usernames.
- `/api/auth/login`: if locked, return 429 with `{ error: 'Too many attempts, please try again later' }` before any password check. Count unknown usernames too.
- Unknown username: run `bcrypt.compare` against a fixed dummy hash, so response time doesn't reveal which usernames exist.
- Keep the wording `Invalid credentials` for both failure cases.
- `/api/admin/create-user` has its own check: apply the same throttle under a fixed key so the admin key can't be brute-forced by rotating headers. Don't lock the startup flow in `addon/entrypoint.sh`, which sends the correct key.
Tests: unit tests for the throttle (locks at the limit, success clears, expiry, eviction, case-insensitive). API test: rotating `X-Forwarded-For` from a local client does not bypass the account lock; the correct password is refused while locked; a different account still works. Mind the IP limiter when writing these: rotating headers from a private peer gets a fresh IP bucket, which is exactly what lets the account lock be reached.

### Task A3: Run the add-on off the host network
Files: `addon/config.json`, `README.md` if it mentions host networking.
- Remove `"host_network": true`. Set `"ports": { "8099/tcp": 8099 }`. Keep `ports_description`.
- Nothing else in the add-on needs host access. Check `addon/entrypoint.sh` and the Dockerfile and report if that's wrong.
- `server listens on 0.0.0.0` stays: inside the container it's the container's own interface.

### Task A4: Import must reach the server
Files: `client/src/lib/db.ts`, new `client/src/lib/db.import.test.ts`, `client/src/App.tsx`.
Bug: `importBooks` writes only to IndexedDB and the next `getBooks()` purges whatever isn't on the server, so a restore while logged in loses everything it "imported".
- Logged in: fetch all server books once. Match each file entry by title and author, compared case-insensitively after trimming. No match: `createServerBook`. Match: `updateServerBook` with only the fields that are empty on the server and set in the file. Never use the file's `id`, which may belong to another user or install, and never send `user_id`.
- Offline, not logged in: keep today's local behaviour, simplified by extracting one fill-empty-fields helper used by both branches.
- Return `{ imported, skipped, failed }`. One failed book must not stop the rest. Invalid JSON and a non-array file give a clear error message.
- `App.tsx`: the banner says how many failed, if any. `handleImportFile`'s existing `fetchBooks` then shows the result.
Tests: logged in creates on the server and sends no `id`; matching fills only empty fields and doesn't overwrite; a failed create is counted and the rest continue; a row without a title is skipped; bad JSON rejects with a readable message.

### Task A5: Sync can't run twice at once
Files: `client/src/lib/sync.ts`, new `client/src/lib/sync.test.ts`.
Bug: `fullSync` has no guard, so the 60-second timer and the 2-second debounce can both create the same unmapped book.
- Concurrent calls share one in-flight promise; a call after it finishes starts a new sync.
Tests: two concurrent `fullSync` calls create one server book; a later call syncs again.

### Task A6: Check releases in a real browser
Files: new `client/scripts/pwa-check.mjs`, `client/package.json`, `.github/workflows/build-push.yml`.
- `pwa-check.mjs` uses Playwright (installed in `client`) and Chromium. It starts the built API with a temp `DATA_DIR` and the built client, creates a user, logs in by setting `booktracker_token`, and stubs `openlibrary.org` and `covers.openlibrary.org` with `page.route` so it doesn't depend on the network. A CSP-blocked request never reaches the route handler, so the stub can't hide the bug.
- Load twice, waiting for the service worker to take control. On the second load assert: navigation came from the service worker, adding a book finds a stubbed search result, a stubbed cover has `naturalWidth > 0`, no CSP violation in the console, idle main thread under 50% over 3 seconds. Exit non-zero with a clear message. Add `"check:pwa"`.
- The client build must be copied where the API serves it (`api/dist-client/dist`); the script does this itself in a temp copy or documents the step.
- Workflow: new `test` job on Node 20 runs API `npm ci`, `npm test`, `npx tsc --noEmit`; client `npm ci`, `npm test`, `npm run build`; `npx playwright install --with-deps chromium`; `npm run check:pwa`. The `build` job gets `needs: test`.
Claude verifies this fails against the old `serveWithNonce`, so don't report that as done unless you ran it.

## Run B: better tracking (group 2)

### Task B1: Schema and API
Files: `api/src/index.ts`, `api/src/shared/validation.ts`, `api/test/api.test.ts`.
- `books` gains `current_page INTEGER`, `isbn TEXT`, `openlibrary_key TEXT`; `users` gains `reading_goal INTEGER NOT NULL DEFAULT 12`. Use the file's existing `ALTER TABLE ... try/catch` migration pattern, so existing data survives.
- `safeIsbn`: strip spaces and hyphens, uppercase; valid only as 10 chars (9 digits then digit or X) or 13 digits; otherwise `null`. `safeWorkKey`: must match `^/works/OL\d+W$`, otherwise `null`.
- `current_page`: positive integer or null. If `pages` is known and it's larger, clamp to `pages`.
- POST, PATCH and PUT `/api/books` all accept the three fields. PATCH treats undefined as keep and null as clear.
- `GET /api/settings` returns `{ reading_goal }`; `PATCH /api/settings` takes an integer 1–1000, else 400.
Tests: migration on a database created with the old schema keeps its rows; each validator; clamping; settings round trip and rejection; one user can't see another's settings or books.

### Task B2: Client data layer
Files: `client/src/types.ts`, `client/src/lib/db.ts`, `client/src/lib/auth.ts`, `client/src/lib/sync.ts`, new `client/src/lib/settings.ts`, tests beside them.
- `Book` gains `current_page`, `isbn`, `openlibrary_key`. Remove the never-populated `openLibraryKey`.
- `addBook`, `updateBook`, import and every field list in `sync.ts` carry the new fields, or they'd be lost on create. Mirror the server's validation on the client.
- `getReadingGoal()` and `setReadingGoal(n)`: server when logged in, cached in `localStorage` as the offline fallback; offline mode uses only `localStorage`.

### Task B3: Reading progress UI
Files: `client/src/components/BookForm.tsx`, `BookDetailSheet.tsx`, `BookList.tsx`, `Dashboard.tsx`, `client/src/App.tsx`, tests.
- Form: a Current page field when status is Reading.
- Detail sheet, for reading books: a progress bar, current page input (`inputMode="numeric"`, `enterKeyHint="done"`) and Save. Show "Mark as finished" when current page reaches pages. After saving, the open sheet shows the new value, so `App` must refresh `detailBook`.
- Library rows and Home reading rows show a thin bar and `p. 120 / 450` only when `current_page` is set. With no page count show just `p. 120`. Nothing invented: no estimates from dates.
Tests: bar and text appear only with real data; saving calls `updateBook` and updates the display; "Mark as finished" appears only at the end.

### Task B4: Editable yearly goal
Files: `client/src/components/Dashboard.tsx`, `client/src/App.tsx`, test.
- Remove `DEFAULT_GOAL`. Load the goal once. Tapping the goal text opens a small `.modal-box` with a number input and Save. Validate 1–1000. If saving fails, show the error in the modal.
Tests: renders a custom goal; saving calls `setReadingGoal`; invalid input is refused.

### Task B5: Save the edition
Files: `client/src/components/BookForm.tsx`, `client/src/App.tsx`, `client/src/components/BookDetailSheet.tsx`, `client/src/components/Recommendations.tsx`, `client/src/api/bookLookup.ts`, tests.
- Picking a search result stores `openlibrary_key` and clears `isbn`. A scan or manual ISBN stores both. Discover adds store `openlibrary_key`. If a form opens with a key and no genre or description, fetch the work details the same way `handleSelect` does; that closes the gap for books added from Trending.
- More options gains an ISBN field with "Fill from ISBN". It calls `lookupISBN` and overwrites pages, cover and language with that edition's values, sets genre and description only if empty, stores key and ISBN, and leaves title and author alone unless they're empty. Show not-found and failure in the form.
- Detail sheet passes `book.openlibrary_key`, so the existing community ratings and "more by" exclusion finally work.
Tests: each path stores what's listed; Fill from ISBN doesn't overwrite a typed title; not-found message appears.

## Run C: finish what's half-built (group 3)

### Task C1: One Discover card; heart adds to Planned
Files: `client/src/components/Recommendations.tsx`, `client/src/App.tsx`, `client/src/components/Recommendations.test.tsx`.
- Replace `OLBookCard` and `BookCard` with one card. Its corner button is a heart. Tapping an empty heart creates the book with status `planned`, including its key, cover, author and whatever genre and description `fetchWorkDetails` returns, then fills the heart. If the details call fails, still add the book.
- A heart is filled when the book is already in the library: same `openlibrary_key`, or same title and author compared case-insensitively. A filled heart does nothing, and its label says so. Prevent double taps from creating duplicates.
- Tapping the card opens the existing detail modal with `+ Add to Library`, which opens the form for people who want to set the status.
- Remove the `wishlist` state and the `localStorage` key.
- `App` passes `books` and an `onQuickAdd` that creates, refreshes books and stats, and surfaces failures on the card.
Tests: tap adds once with status planned; already-in-library shows filled and doesn't add; a double tap adds once; details failure still adds; failure to add leaves the heart empty and shows a message.

### Task C2: Charts can be opened
Files: `client/src/components/Dashboard.tsx`, `client/src/components/Charts.tsx`, test.
- A `View charts →` button (44px) under the quick stats opens the existing Analytics modal.
- Fix the current-month highlight, which compares a month label to `YYYY-MM`: carry the key in the data. Fix rating labels: remove `formatLabel`, which picks the first bucket with an equal count.
- Single-column layout for the bottom pair, because two columns are too narrow at 320–390px.
Tests: `MonthlyChart` highlights only the current month; ties in rating counts keep their own labels; the button opens the modal.

### Task C3: Delete dead code
Files: as listed. Before deleting anything, confirm with `git grep` that nothing live references it, and report what you found.
- Client: `components/AuthPage.tsx`, `BookDetail.tsx` and its lazy import in `App.tsx`, `StatsPage.tsx`, `MindSharpness.tsx`, `Layout.tsx`, `Navigation.tsx`, `DarkModeToggle.tsx`, `context/ThemeContext.tsx` and its provider in `main.tsx`, `src/api.ts`, `lib/serverIdMap.ts` functions with no callers only, the six unused haptic exports in `lib/utils.ts`, and `docToOLBook` in `lib/openLibrary.ts`.
- Keep `lib/achievements.ts`; report whether anything imports it.
- API: routes `/api/backfill-covers`, `/api/preferences`, `/api/wishlist*`, and `expensiveLimiter`. Keep the `wishlists` table so no data is destroyed.
Done when: tests and build pass, and the app has no unused-import errors.
