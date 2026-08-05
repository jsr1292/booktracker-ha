/**
 * Open Library contract + resilience checks.
 *
 * Runs the real client code (client/src/lib/openLibrary.ts and
 * client/src/api/bookLookup.ts) against the live Open Library API, plus a few
 * offline checks that use a stubbed fetch.
 *
 * Node strips the TypeScript types natively — neither module has relative
 * imports, so they load as-is.
 *
 *   node client/scripts/ol-check.mjs
 *
 * Network-dependent: a red run means "look at it", not necessarily "you broke it".
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The client uses Vite-style extensionless imports ("../lib/openLibrary"), which
// Node's resolver rejects. Retry those with a .ts extension.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, format: 'module-typescript', shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// ── Browser shims ────────────────────────────────────────────

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const realFetch = globalThis.fetch;
/** URLs requested since the last resetFetchLog(). */
let fetchLog = [];
globalThis.fetch = (url, opts) => {
  fetchLog.push(String(url));
  return realFetch(url, opts);
};
function resetFetchLog() {
  fetchLog = [];
}
/** Swap in a fake fetch for offline checks; returns a restore function. */
function stubFetch(impl) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = prev;
  };
}

// ── Tiny harness ─────────────────────────────────────────────

let passed = 0;
const failures = [];

async function check(name, fn) {
  store.clear(); // never let one check's cache satisfy the next
  resetFetchLog();
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const ol = await import('../src/lib/openLibrary.ts');
const lookup = await import('../src/api/bookLookup.ts');

// ── 1. Field contract ────────────────────────────────────────

section('Field contract');

await check('OL search returns page counts (not always null)', async () => {
  // Live contract check, so it can blip when Open Library's search backend
  // degrades and answers from an index missing some fields. One retry keeps
  // that from reading as a regression; a genuine field-name break fails both
  // attempts, and the URL check below catches it offline regardless.
  let results = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    results = await ol.searchOpenLibrary('dune', 8);
    if (results.some(r => typeof r.pages === 'number' && r.pages > 0)) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(results.length > 0, 'no results for "dune"');
  assert(
    false,
    `all ${results.length} results had pages === null across two attempts — the ` +
      `requested page field is not one Open Library returns (it is number_of_pages_median)`,
  );
});

await check('search URL does not request the invalid page field', async () => {
  await ol.searchOpenLibrary('dune', 8).catch(() => {});
  const url = fetchLog.find(u => u.includes('/search.json'));
  assert(url, 'no /search.json request was made');
  assert(
    !url.includes('number_of_pages_latest'),
    'still requesting number_of_pages_latest, which Open Library does not return',
  );
});

await check('bookLookup title search returns page counts', async () => {
  const results = await lookup.searchBooks('dune');
  assert(results.length > 0, 'no results for "dune"');
  // Google Books supplies pages too, so require OL-shaped results specifically:
  // those are the ones with no description.
  const olish = results.filter(r => r.description === null);
  if (olish.length === 0) return; // Google Books answered everything; nothing to assert
  assert(
    olish.some(r => typeof r.pages === 'number' && r.pages > 0),
    `all ${olish.length} Open Library results had pages === null`,
  );
});

// ── 2. Language handling ─────────────────────────────────────

section('Language handling');

await check('language is a readable name, not a raw/uppercased code', async () => {
  const results = await ol.searchOpenLibrary('dune', 8);
  const langs = results.map(r => r.language).filter(Boolean);
  assert(langs.length > 0, 'no result carried a language');
  // openLibrary.ts passes the code through raw ("pol"); bookLookup.ts uppercases
  // an unmapped code ("POL"). Catch both.
  const bad = langs.filter(l => /^[a-z]{2,3}$/i.test(l));
  assert(
    bad.length === 0,
    `got un-mapped codes ${JSON.stringify([...new Set(bad)])} — Open Library ` +
      `returns MARC-21 three-letter codes (eng, spa, ger), but LANG_MAP is keyed by two-letter ISO-639-1`,
  );
});

await check('English editions are labelled English, not an arbitrary edition', async () => {
  // "Dune" has editions in many languages; language[0] is whichever edition sorts
  // first, so a naive [0] pick reports e.g. Polish for an English-language work.
  const results = await ol.searchOpenLibrary('dune', 8);
  const named = results.map(r => r.language).filter(Boolean);
  assert(named.length > 0, 'no result carried a language');
  assert(
    named.includes('English'),
    `no result was labelled English; got ${JSON.stringify([...new Set(named)])}`,
  );
});

// ── 3. Payload leanness ──────────────────────────────────────

section('Payload leanness');

await check('search does not request the isbn/subject bulk fields', async () => {
  await lookup.searchBooks('dune').catch(() => {});
  const url = fetchLog.find(u => u.includes('openlibrary.org/search.json'));
  assert(url, 'no Open Library search request was made');
  const fields = decodeURIComponent(new URL(url).searchParams.get('fields') || '');
  const bulky = ['isbn', 'subject'].filter(f =>
    fields.split(',').map(s => s.trim()).includes(f),
  );
  assert(
    bulky.length === 0,
    `requesting ${bulky.join(' + ')} — one doc carries ~140 ISBNs and 15+ subjects, ` +
      `inflating the response roughly 9x`,
  );
});

// ── 4. Resilience ────────────────────────────────────────────

section('Resilience');

await check('fetchTrending gives up instead of hanging forever', async () => {
  // A server that accepts the connection and then says nothing. The fake must
  // honour AbortSignal exactly as real fetch does, or the timeout under test
  // has nothing to act on.
  const restore = stubFetch(
    (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  );
  try {
    const outcome = await Promise.race([
      ol.fetchTrending(20).then(() => 'resolved', () => 'rejected'),
      new Promise(r => setTimeout(() => r('hung'), 12000)),
    ]);
    assert(outcome !== 'hung', 'still pending after 12s — no timeout on the trending requests');
  } finally {
    restore();
  }
});

await check('resolveAuthorKey survives a corrupt cache entry', async () => {
  localStorage.setItem('ol_author_key_frank_herbert', '{ this is not json');
  // Must not throw synchronously, and must recover by re-fetching.
  const key = await ol.resolveAuthorKey('Frank Herbert');
  assert(key, 'returned no author key after hitting a corrupt cache entry');
});

await check('concurrent identical calls are de-duplicated into one request', async () => {
  resetFetchLog();
  await Promise.all([
    ol.fetchWorkRatings('/works/OL45804W'),
    ol.fetchWorkRatings('/works/OL45804W'),
    ol.fetchWorkRatings('/works/OL45804W'),
  ]);
  const hits = fetchLog.filter(u => u.includes('/ratings.json')).length;
  assert(hits === 1, `made ${hits} network requests for the same resource; expected 1`);
});

await check('a 429 is retried rather than surfaced as an error', async () => {
  let calls = 0;
  const restore = stubFetch(async () => {
    calls++;
    if (calls === 1) {
      return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
    }
    return new Response(JSON.stringify({ average: 4.2, count: 100 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  try {
    const r = await ol.fetchWorkRatings('/works/OL45804W');
    assert(calls > 1, 'did not retry after a 429');
    assert(r.average === 4.2, `retry succeeded but returned ${JSON.stringify(r)}`);
  } finally {
    restore();
  }
});

// ── 5. Provider fallback ─────────────────────────────────────

section('Provider fallback');

/** A fetch that hangs (honouring abort) for hosts matching `hangOn`, and serves `routes` otherwise. */
function routedFetch(hangOn, routes) {
  return (url, opts) => {
    const u = String(url);
    if (hangOn.test(u)) {
      return new Promise((_res, rej) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          rej(err);
        });
      });
    }
    for (const [pattern, body] of routes) {
      if (pattern.test(u)) {
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
}

await check('a Google Books timeout still falls through to Open Library', async () => {
  const restore = stubFetch(
    routedFetch(/googleapis\.com/, [
      [
        /openlibrary\.org\/api\/books/,
        {
          'ISBN:9780441013593': {
            title: 'Dune',
            authors: [{ name: 'Frank Herbert' }],
            number_of_pages: 604,
          },
        },
      ],
    ]),
  );
  try {
    const result = await lookup.lookupISBN('9780441013593');
    assert(
      result !== null,
      'returned null — a Google Books timeout aborted the whole lookup instead of ' +
        'falling through to the Open Library fallback',
    );
    assert(result.title === 'Dune', `fell through but mis-mapped: ${JSON.stringify(result)}`);
  } finally {
    restore();
  }
}, 40000);

await check('title search retries a 429 from Open Library', async () => {
  let olCalls = 0;
  const restore = stubFetch((url, opts) => {
    const u = String(url);
    if (/googleapis\.com/.test(u)) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (/openlibrary\.org\/search\.json/.test(u)) {
      olCalls++;
      if (olCalls === 1) {
        return Promise.resolve(
          new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            docs: [
              {
                key: '/works/OL1W',
                title: 'Dune',
                author_name: ['Frank Herbert'],
                cover_i: 1,
                number_of_pages_median: 604,
                language: ['eng'],
                first_publish_year: 1965,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.resolve(new Response('nope', { status: 404 }));
  });
  try {
    const results = await lookup.searchBooks('dune');
    assert(olCalls > 1, 'did not retry the 429 — this path bypasses the shared retry layer');
    assert(results.length > 0, 'retry happened but no results were returned');
    assert(results[0].title === 'Dune', `unexpected mapping: ${JSON.stringify(results[0])}`);
  } finally {
    restore();
  }
});

// ── Summary ──────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m${passed} passed, 0 failed\x1b[0m`);
} else {
  console.log(`\x1b[31m${passed} passed, ${failures.length} failed\x1b[0m`);
  for (const f of failures) console.log(`  · ${f.name}`);
}
process.exit(failures.length === 0 ? 0 : 1);
