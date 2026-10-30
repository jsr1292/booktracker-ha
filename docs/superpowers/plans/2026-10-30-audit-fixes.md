# Audit fixes: data bugs, full library, Open Library lookup

Source: browser audit of v3.4.2 on 2026-10-30. Branch: `fix/audit-2026-10`. Do not push.

Decisions already made by the owner:
- The app is used directly over HTTPS. Ingress is off.
- Lookup uses Open Library only. No Google Books, no API key.

Already done, don't redo: service worker CSP, `/api/stats` SQL, the achievement effect loop.

Out of scope: phone layout and styling (a separate phase), and security items from the August audit. Keep the existing inline-style idiom in touched components, and don't restyle anything beyond what a task asks.

Test command after Task 1: `cd client && npm test`. Always also run `cd client && npm run build`.
API type check: `cd api && npx tsc --noEmit` (`better-sqlite3` needs Node 20; if install fails under a newer Node, say so rather than changing the dependency).

Write the failing test first and show it failing wherever a task lists tests. One commit per task.

## Run 1

### Task 1: Test harness
Files: `client/package.json`, `client/package-lock.json`, new `client/vitest.config.ts`, new `client/src/test/setup.ts`.
- Add dev dependencies: `vitest`, `jsdom`, `fake-indexeddb`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`.
- Add script `"test": "vitest run"`. Use jsdom. Don't load the PWA plugin in tests.
- Test files live next to source as `*.test.ts(x)`. `npm run build` must still pass, and test code must not reach the production bundle.
Done when: one trivial test passes through `npm test`, and the build passes.

### Task 2: Swipe does what its label says
Files: `client/src/lib/utils.ts`, `client/src/components/BookList.tsx`, test `client/src/lib/utils.test.ts`.
Bug: swiping a Planned book right is labelled "Reading" but marks it Finished with today's date (`handleStatusToggle`). The main list labels the same swipe "Finished", so the two lists also disagree.
- Add a pure helper `swipeRightAction(status)` returning `{ label, status }`: planned → Reading, reading → Finished, finished → Reading, abandoned → Reading.
- Use it for the label and the action in all three `SwipeableCard` uses.
- Moving to reading clears `date_finished` and sets `date_started` to today only if it's empty. Moving to finished sets `date_finished` to today only if it's empty.
Tests: every status maps as above.

### Task 3: A rating can be cleared
Files: `client/src/lib/db.ts`, test `client/src/lib/db.test.ts` (use `fake-indexeddb`; stub `isLoggedIn` and the auth module).
Bug: `updateBook` treats `rating: null` as "keep the old rating".
- `undefined` keeps the existing rating, `null` clears it, a number clamps to 1–5. The PATCH body must carry the `null`.
Tests: all three cases, offline and logged in (assert the PATCH payload).

### Task 4: Saving and form feedback
Files: `client/src/App.tsx`, `client/src/components/BookForm.tsx`, test `client/src/components/BookForm.test.tsx`.
- Double tap creates duplicates because `onSave` isn't awaited. Make `onSave` return a promise, await it, and block re-entry with a ref (state alone is too slow for a double tap). Button stays disabled while saving.
- Failed saves are invisible because the banner renders behind the modal. Have `handleCreateBook` and `handleUpdateBook` rethrow, and show the message in the form's existing `saveError` line. Don't also set the page banner for these.
- A scan with no match also opens the form with a hidden banner. Pass a `notice` prop to `BookForm` and show "ISBN <isbn> wasn't found. Enter the details below." Use the same place for the lookup-failed message.
- "Auto-filled from ISBN scan" shows for Discover and More-by-author too. Show it only for scans: track the source next to `initialFormData`. Remove the duplicate hint if `BookForm`'s own notice already covers the case.
- `handleRecommendationAdd` must clear `detailBook`, because the form currently opens behind the detail sheet.
Tests: double submit calls `onSave` once; a rejected `onSave` shows its message and re-enables the button; `notice` renders.

### Task 5: Show the whole library
Files: `client/src/lib/auth.ts`, `api/src/index.ts`, `client/src/App.tsx`, `client/src/components/Dashboard.tsx`, `client/src/components/BookList.tsx`, test `client/src/lib/auth.test.ts`.
- `fetchServerBooks` fetches pages of 500 (the server's cap) until a short page. Any failed page rejects the whole call, so `cacheServerBooks` never purges from a partial list.
- `GET /api/books`: order by `created_at DESC, id DESC`, so pages are stable when timestamps tie.
- Home: remove the `recentBooks` prop and `books.slice(0, 3)`. Reading shows every book with status reading. Finished shows the 5 most recent by `date_finished`. "See all →" appears when there are more than 5 and navigates to Library, not the charts.
- Library: in the `all` view with no author or genre filter, leave reading and planned books out of the main list, since their pinned sections already show them.
Tests: pagination across 3 pages; failure on page 2 rejects. Empty-page and exact-500 cases.

## Run 2

### Task 6: Remove Google Books
Files: delete `client/src/lib/googleBooks.ts`; edit `client/src/api/bookLookup.ts`, `client/src/components/Recommendations.tsx`, `client/src/components/TitleSearch.tsx`, `client/src/App.tsx`, `client/src/lib/openLibrary.ts`, `client/scripts/ol-check.mjs`, `api/src/index.ts`.
- Remove all Google calls and the fallbacks in Discover. `git grep -iE "google ?books|googleId|googleapis"` under `client/src` must return nothing.
- Drop `googleId`. Discover cards use the Open Library `key` as React key and wishlist id. This fixes one heart tap lighting all 8 results. Ignore old wishlist entries.
- Replace user-facing "Google Books" copy, for example "Searching Open Library...".
- CSP: remove `https://www.googleapis.com` from `connect-src`. Keep `https://books.google.com` in `img-src`, because saved books may have those cover URLs.
- Show Discover search results on whichever tab is active, above the tab content, because they currently appear only under For You.
- Make the language filter either work on the tab's data or hide when the tab's data has no language. Don't leave a control that does nothing.
Tests: a Discover render test that results appear on the Trending tab.

### Task 7: Better lookup data
Files: `client/src/lib/openLibrary.ts`, `client/src/api/bookLookup.ts`, `client/src/components/BookForm.tsx`, tests `client/src/lib/openLibrary.test.ts`.
Facts from the live API (2026-10-30): `/works/<id>.json` returns `subjects` and `description` (string or `{value}`). Search `editions` is not usable for language ("Cien años de soledad" returned a Chinese edition, "Sapiens" a Polish one).
- `pickGenre(subjects)`: exact, case-insensitive match against an allowlist, most specific first: Science Fiction, Fantasy, Mystery, Thriller, Horror, Romance, Biography (also Autobiography), History, Philosophy, Poetry, Science, Self-Help, then Fiction. "Romance literature" must not match Romance. No match gives `null`. Check real subject strings for variants such as `Science-fiction`, `Detective and mystery stories` and `Fiction, science fiction, general`.
- `fetchWorkDetails(workKey)`: returns `{ genre, description }`, cached like the other calls, failing soft.
- On picking a search result, fill the form at once, then merge genre and description when the details arrive. Don't overwrite anything the user has typed since, and ignore the response if another result was picked meanwhile.
- `pickLanguage`: stop preferring English. Rules in order: a single language gives that one; a title that looks Spanish (accents or stopwords el, la, los, las, del, de, y, un, una) with `spa` available gives Spanish; a title that looks English (the, of, and, a) with `eng` available gives English; otherwise `null`. Blank is better than wrong.
- ISBN: also read `/isbn/<isbn>.json` for its authoritative `languages` and `works[0].key`, then use `fetchWorkDetails`. Don't use the first raw subject as a genre.
- Picking a suggestion replaces cover, description and language, clearing them when the new result has none, so nothing carries over from an earlier pick.
- Title filter: match whole words (`\b`), so "Psychoanalysis" survives and "Book Review" doesn't.
Tests: `pickGenre` with the Dune, Cien años and Patria subjects below; `pickLanguage` cases; title filter cases; stale-details race.
- Dune: `Dune (Imaginary place)`, `Fiction`, `Fiction, science fiction, general`, `Science fiction`, `American literature` → Science Fiction.
- Cien años: `Spanish language books`, `Fiction`, `magic realism`, `Novela` → Fiction.
- Patria: `Romance literature`, `Terrorism`, `Fiction`, `Families` → Fiction.

### Task 8: Search feedback in the add form
Files: `client/src/components/TitleSearch.tsx`, `client/src/api/bookLookup.ts`, `client/src/lib/openLibrary.ts` if needed, test `client/src/components/TitleSearch.test.tsx`.
- Last-write-wins: a slow older response must never replace a newer one, including when the input has been cleared. Same sequence pattern as `handleSearch` in `Recommendations.tsx`.
- `searchBooks` must distinguish "no results" from "failed", which it can't do while it swallows errors.
- Show "No matches. You can enter the details yourself." and "Couldn't reach Open Library. You can enter the details yourself." in the dropdown position.
- The spinner replaces the list instead of overlapping it. The dropdown background is opaque (`var(--bg2)`), because form fields show through it now.
Tests: out-of-order responses; empty state; error state.

### Task 9: Scanner
Files: `client/src/components/BarcodeScanner.tsx`, `client/src/App.tsx` if the message needs it.
No unit test required; Claude verifies it with a fake-camera browser test.
- The camera opens twice: the component calls `getUserMedia`, then passes a `<video>` as Quagga's `target`, so Quagga nests a hidden video and opens its own stream. Remove the component's own `getUserMedia` and its video. Give Quagga the container div as `target`, with `constraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }`. Style Quagga's video and canvas to fill the container. Keep the scan overlay. Done means one `getUserMedia` call.
- Quagga's callback returns on any error, leaving a blank screen. Check unmount first, then show the error and offer manual entry.
- Distinguish errors: `!window.isSecureContext` or no `navigator.mediaDevices` gives "The camera needs HTTPS."; `NotAllowedError` gives the existing permission message; `NotFoundError` gives "No camera found."; otherwise a generic message.
- Remove the 10-second race; permission prompts can legitimately take longer. Make sure the camera is released on unmount and that a late-arriving stream can't stay on.
- "Enter ISBN manually" is always visible below the camera, because right now it's reachable only after an error. The offline link must work too. Manual entry works without the camera running.
- Only accept codes starting with 978 or 979 from the camera, so a shop barcode can't trigger a wrong lookup. Unregister the `onDetected` handler on unmount.
