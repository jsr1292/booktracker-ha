/**
 * Open Library API client — enhanced discovery layer.
 *
 * No User-Agent header: it is a forbidden header name, so `fetch` strips it in
 * the browser. Sending one bought nothing and only risked a CORS preflight.
 */

export const OL_BASE = 'https://openlibrary.org';
export const OL_COVERS = 'https://covers.openlibrary.org';

/**
 * Fields Open Library actually returns from /search.json.
 *
 * `number_of_pages_median` is the real page-count field — `number_of_pages_latest`
 * does not exist and silently comes back undefined. `isbn` and `subject` are
 * deliberately absent: a single doc carries ~140 ISBNs and 15+ subjects, which
 * inflates the response roughly 9x (10.4KB → 1.1KB for 6 results).
 */
const SEARCH_FIELDS = [
  'key',
  'title',
  'author_name',
  'cover_i',
  'number_of_pages_median',
  'language',
  'first_publish_year',
  'edition_count',
].join(',');

// ── Types ────────────────────────────────────────────────────

export interface OLBook {
  key: string;            // e.g. "/works/OL45804W"
  title: string;
  author: string;
  coverUrl: string | null;
  coverId: number | null;
  pages: number | null;
  genre: string | null;
  rating: number | null;
  description: string | null;
  year: string | null;
  language: string | null;
  readinglogCount?: number;
  editionCount?: number;
  ratingsCount?: number;
}

export interface OLSubjectResult {
  name: string;
  works: OLBook[];
}

export interface OLWork {
  key: string;
  title: string;
  description: string | null;
  coverId: number | null;
  year: string | null;
}

export interface OLRatings {
  workKey: string;
  average: number | null;
  count: number | null;
}

// ── Cache helpers ────────────────────────────────────────────

function getCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: { timestamp: number; data: T } = JSON.parse(raw);
    if (Date.now() - cached.timestamp > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

// ── Network layer ────────────────────────────────────────────

/**
 * Open Library is slow and rate-limits without warning, so every request goes
 * through here. Three things this handles that raw fetch did not:
 *
 *  - a timeout on *every* request (fetchTrending previously had none and could
 *    hang forever);
 *  - one retry pass over 429/5xx and network blips, honouring Retry-After;
 *  - de-duplication of identical in-flight requests, so the two book-detail
 *    components asking for the same ratings cause one request, not two.
 *
 * Measured baseline: /search.json ~0.7s, /subjects/*.json 1.2–1.7s on a fast
 * wired connection, so the default budget is generous on purpose.
 */
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

const inFlight = new Map<string, Promise<any>>();

function backoffDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5000);
  // 400ms, 800ms — plus jitter so a burst of failures does not retry in lockstep.
  return 400 * 2 ** attempt + Math.random() * 200;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function olFetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = (async () => {
    let lastError: Error = new Error(`OL fetch failed: ${url}`);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`OL fetch failed: ${res.status}`);
          if (attempt < MAX_RETRIES) {
            await sleep(backoffDelay(attempt, res.headers.get('Retry-After')));
            continue;
          }
          throw lastError;
        }
        // 4xx other than 429 means the request itself is wrong — retrying won't help.
        if (!res.ok) throw new Error(`OL fetch failed: ${res.status}`);
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        const error = err instanceof Error ? err : new Error(String(err));
        // A timeout already spent the full budget; retrying would just stack
        // another 8s onto a user who is watching a spinner. Give up now.
        if (error.name === 'AbortError') throw new Error('timeout');
        if (/OL fetch failed: \d\d\d/.test(error.message)) throw error;
        lastError = error; // network error — worth one more try
        if (attempt < MAX_RETRIES) {
          await sleep(backoffDelay(attempt, null));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError;
  })();

  inFlight.set(url, request);
  // Detach the cleanup so callers never see the finally's rejection handling.
  request.catch(() => {}).finally(() => inFlight.delete(url));
  return request;
}

async function cachedFetch<T>(
  cacheKey: string,
  url: string,
  ttlMs: number,
  mapper: (data: any) => T,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const cached = getCache<T>(cacheKey, ttlMs);
  if (cached) return cached;

  const result = mapper(await olFetchJson(url, timeoutMs));
  setCache(cacheKey, result);
  return result;
}

// ── Cover / Author helpers ──────────────────────────────────

export function getCoverUrl(coverId: number | null, size: 'S' | 'M' | 'L' = 'M'): string | null {
  if (!coverId) return null;
  return `${OL_COVERS}/b/id/${coverId}-${size}.jpg?default=false`;
}

export function getAuthorPhotoUrl(authorOlid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${OL_COVERS}/a/olid/${authorOlid}-${size}.jpg?default=false`;
}

// ── Language ─────────────────────────────────────────────────

/**
 * Open Library reports languages as MARC-21 three-letter codes. Some languages have two MARC
 * codes (a bibliographic and a terminology form, e.g. ger/deu) and both appear
 * in the wild, so both are mapped.
 */
const MARC_LANG: Record<string, string> = {
  eng: 'English', spa: 'Spanish', fre: 'French', fra: 'French',
  ger: 'German', deu: 'German', ita: 'Italian', por: 'Portuguese',
  dut: 'Dutch', nld: 'Dutch', swe: 'Swedish', nor: 'Norwegian',
  dan: 'Danish', fin: 'Finnish', pol: 'Polish', rus: 'Russian',
  jpn: 'Japanese', chi: 'Chinese', zho: 'Chinese', kor: 'Korean',
  ara: 'Arabic', hin: 'Hindi', cat: 'Catalan', baq: 'Basque',
  eus: 'Basque', glg: 'Galician', cze: 'Czech', ces: 'Czech',
  gre: 'Greek', ell: 'Greek', heb: 'Hebrew', tur: 'Turkish',
  ukr: 'Ukrainian', rum: 'Romanian', ron: 'Romanian', hun: 'Hungarian',
  vie: 'Vietnamese', tha: 'Thai', ind: 'Indonesian', lat: 'Latin',
  und: 'Unknown',
};

/** Choose a language only when the edition or title provides a reliable clue. */
export function pickLanguage(codes: unknown, title = ''): string | null {
  const list = (Array.isArray(codes) ? codes : [codes])
    .map(c => typeof c === 'string' ? c.replace('/languages/', '').toLowerCase() : '')
    .filter(Boolean);
  const distinct = [...new Set(list)];
  if (distinct.length === 1) return MARC_LANG[distinct[0]] ?? null;
  if (/[áéíóúñü]/i.test(title) || /\b(el|la|los|las|del|de|y|un|una)\b/i.test(title)) {
    if (distinct.includes('spa')) return 'Spanish';
  }
  if (/\b(the|of|and|a)\b/i.test(title) && distinct.includes('eng')) return 'English';
  return null;
}

const GENRE_SUBJECTS: [string, string[]][] = [
  ['Science Fiction', ['science fiction', 'science-fiction', 'fiction, science fiction, general']],
  ['Fantasy', ['fantasy', 'fantasy fiction']],
  ['Mystery', ['mystery', 'detective and mystery stories']],
  ['Thriller', ['thriller', 'thrillers']],
  ['Horror', ['horror', 'horror fiction']],
  ['Romance', ['romance', 'romance fiction']],
  ['Biography', ['biography', 'autobiography', 'biographies', 'autobiographies']],
  ['History', ['history']],
  ['Philosophy', ['philosophy']],
  ['Poetry', ['poetry']],
  ['Science', ['science']],
  ['Self-Help', ['self-help', 'self help']],
  ['Fiction', ['fiction']],
];

export function pickGenre(subjects: unknown): string | null {
  if (!Array.isArray(subjects)) return null;
  const normalized = new Set(subjects.filter((s): s is string => typeof s === 'string').map(s => s.trim().toLowerCase()));
  for (const [genre, variants] of GENRE_SUBJECTS) {
    if (variants.some(variant => normalized.has(variant))) return genre;
  }
  return null;
}

export function isSupplementaryTitle(title: string): boolean {
  return /\b(summary|review|analysis|study guide|boxed set|2-book set)\b/i.test(title);
}

export interface OLWorkDetails { genre: string | null; description: string | null }

export async function fetchWorkDetails(workKey: string): Promise<OLWorkDetails> {
  if (!/^\/works\/OL\d+W$/.test(workKey)) return { genre: null, description: null };
  try {
    return await cachedFetch<OLWorkDetails>(`ol_work_details_${workKey}`, `${OL_BASE}${workKey}.json`, 6 * 60 * 60 * 1000, data => ({
      genre: pickGenre(data.subjects),
      description: typeof data.description === 'string' ? data.description : typeof data.description?.value === 'string' ? data.description.value : null,
    }));
  } catch {
    return { genre: null, description: null };
  }
}

// ── API Functions ────────────────────────────────────────────

function docToOLBook(doc: any): OLBook {
  const coverId = doc.cover_i ?? null;
  return {
    key: doc.key || '',
    title: doc.title || '',
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
    coverUrl: getCoverUrl(coverId, 'M'),
    coverId,
    pages: doc.number_of_pages_median || doc.number_of_pages || null,
    genre: pickGenre(doc.subject),
    rating: null,
    description: null,
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    language: pickLanguage(doc.language, doc.title),
    readinglogCount: doc.readinglog_count || undefined,
    editionCount: doc.edition_count || undefined,
    ratingsCount: doc.ratings_count || undefined,
  };
}

function workToOLBook(w: any, defaultGenre?: string): OLBook {
  return {
    key: w.key || '',
    title: w.title || '',
    author: Array.isArray(w.authors) ? w.authors[0]?.name || 'Unknown' : (w.authors?.[0]?.name || 'Unknown'),
    coverUrl: getCoverUrl(w.cover_id ?? null, 'M'),
    coverId: w.cover_id ?? null,
    pages: null,
    genre: defaultGenre || null,
    rating: null,
    description: null,
    year: w.first_publish_year ? String(w.first_publish_year) : null,
    language: null,
    readinglogCount: w.readinglog_count || undefined,
    editionCount: undefined,
    ratingsCount: undefined,
  };
}

/** Trending / Popular books — sorted by readinglog_count */
export async function fetchTrending(limit = 20): Promise<OLBook[]> {
  const cacheKey = 'ol_trending_cache';
  const ttl = 30 * 60 * 1000; // 30 minutes

  // Use a wider pool of subjects, pick randomly each time for variety
  const allSubjects = ['fiction', 'fantasy', 'science_fiction', 'mystery', 'romance', 'thriller', 'historical_fiction', 'horror', 'biography', 'philosophy', 'poetry', 'science', 'history', 'psychology', 'self_help', 'adventure'];
  const randomOffset = Math.floor(Math.random() * allSubjects.length);
  const trendingSubjects = allSubjects.slice(randomOffset, randomOffset + 5);
  const perSubject = Math.ceil(limit / trendingSubjects.length);

  const cachedBooks = getCache<OLBook[]>(cacheKey, ttl);
  if (cachedBooks) return cachedBooks;

  {
    const results = await Promise.allSettled(
      trendingSubjects.map(subject =>
        olFetchJson(`${OL_BASE}/subjects/${subject}.json?limit=${perSubject}`)
          .then(data => (data.works || []).map((w: any): OLBook => ({
            key: w.key || '',
        title: w.title || '',
            author: w.authors?.[0]?.name || 'Unknown',
            coverId: w.cover_id ?? null,
            coverUrl: w.cover_id ? getCoverUrl(w.cover_id, 'M') : null,
            year: w.first_publish_year?.toString() ?? null,
            readinglogCount: undefined,
            editionCount: w.edition_count ?? null,
            pages: null,
            genre: null,
            rating: null,
            ratingsCount: undefined,
            language: null,
            description: null,
          })))
      )
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<OLBook[]> => r.status === 'fulfilled',
    );
    // allSettled never rejects, so a total outage used to surface as an empty
    // shelf rather than an error. Only claim success if something came back.
    if (fulfilled.length === 0) throw new Error('Could not load trending books');

    let books = fulfilled
      .flatMap(r => r.value)
      // Filter out summary-like entries
      .filter(b => !isSupplementaryTitle(b.title))
      // Remove duplicates by title
      .filter((b, i, arr) => arr.findIndex(x => x.title === b.title) === i);

    // Shuffle for variety
    for (let i = books.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [books[i], books[j]] = [books[j], books[i]];
    }
    books = books.slice(0, limit);

    setCache(cacheKey, books);
    return books;
  }
}

/** Browse books by genre/subject */
export async function fetchSubject(genre: string, limit = 24): Promise<OLSubjectResult> {
  const cacheKey = `ol_cache_${genre.toLowerCase().replace(/\s+/g, '_')}`;
  const ttl = 6 * 60 * 60 * 1000; // 6 hours

  const slug = genre.toLowerCase().replace(/\s+/g, '_');
  const url = `${OL_BASE}/subjects/${slug}.json?limit=${limit}`;

  return cachedFetch<OLSubjectResult>(cacheKey, url, ttl, (data) => {
    const works: any[] = data.works || [];
    return {
      name: data.name || genre,
      works: works
        .filter((w: any) => {
          const t = w.title || '';
          if (isSupplementaryTitle(t)) return false;
          return true;
        })
        .map((w: any) => workToOLBook(w, genre)),
    };
  });
}

/** Fetch other works by an author (excludes current work) */
/** Resolve author name to OL author key */
export async function resolveAuthorKey(authorName: string): Promise<string | null> {
  if (!authorName) return null;
  const cacheKey = `ol_author_key_${authorName.toLowerCase().replace(/\s+/g, '_')}`;
  // A corrupt entry used to throw synchronously out of this function and break
  // author recommendations until storage was cleared by hand.
  const cachedKey = getCache<string>(cacheKey, 7 * 24 * 60 * 60 * 1000);
  if (cachedKey) return cachedKey;

  try {
    const data = await olFetchJson(
      `${OL_BASE}/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`,
    );
    const author = data.docs?.[0];
    if (!author?.key) return null;
    const key = author.key.replace('/authors/', '');
    setCache(cacheKey, key);
    return key;
  } catch {
    return null;
  }
}

export async function fetchAuthorWorks(authorKey: string, excludeKey?: string, limit = 10): Promise<OLWork[]> {
  const cacheKey = `ol_author_${authorKey}`;
  const ttl = 6 * 60 * 60 * 1000; // 6 hours

  const url = `${OL_BASE}/authors/${authorKey}/works.json?limit=${limit + 1}`;

  return cachedFetch<OLWork[]>(cacheKey, url, ttl, (data) => {
    if (!data.entries?.length) return [];
    return data.entries
      .filter((e: any) => e.key !== excludeKey)
      .slice(0, limit)
      .map((e: any) => ({
        key: e.key || '',
        title: e.title || '',
        description: e.description || null,
        coverId: e.covers?.[0] ?? null,
        // The entry's `created` is when the record was added to Open Library, not the publication year.
        year: null,
      }));
  });
}

/** Data for one authoritative ISBN edition. */
export interface OLIsbnResult {
  title: string;
  author: string;
  pages: number | null;
  genre: string | null;
  coverUrl: string | null;
  language: string | null;
  workKey: string | null;
  description: string | null;
}

export async function lookupIsbn(isbn: string): Promise<OLIsbnResult | null> {
  const [bulk, edition] = await Promise.all([
    olFetchJson(`${OL_BASE}/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`).catch(() => null),
    olFetchJson(`${OL_BASE}/isbn/${encodeURIComponent(isbn)}.json`).catch(() => null),
  ]);
  // A miss still answers {} on the bulk endpoint, so both failing means we couldn't ask.
  if (!bulk && !edition) throw new Error('Could not reach Open Library');
  const d = bulk?.[`ISBN:${isbn}`];
  if (!d && !edition) return null;
  const workKey = edition?.works?.[0]?.key ?? null;
  const details = workKey ? await fetchWorkDetails(workKey) : { genre: null, description: null };
  return {
    title: d?.title || edition?.title || 'Unknown',
    author: d?.authors?.[0]?.name || 'Unknown',
    pages: d?.number_of_pages || edition?.number_of_pages || null,
    genre: details.genre,
    coverUrl: d?.cover?.medium || getCoverUrl(edition?.covers?.[0] ?? null),
    language: pickLanguage(edition?.languages?.map((l: { key: string }) => l.key), d?.title || edition?.title || ''),
    workKey,
    description: details.description,
  };
}

/** Fetch ratings for a specific work */
export async function fetchWorkRatings(workKey: string): Promise<OLRatings> {
  // Extract just the OLID from the key (e.g. "/works/OL45804W" → "OL45804W")
  const olid = workKey.replace('/works/', '');
  const url = `${OL_BASE}/works/${olid}/ratings.json`;
  const cacheKey = `ol_ratings_${olid}`;
  const ttl = 6 * 60 * 60 * 1000;

  return cachedFetch<OLRatings>(cacheKey, url, ttl, (data) => ({
    workKey,
    average: typeof data.average === 'number' ? Math.round(data.average * 10) / 10 : null,
    count: typeof data.count === 'number' ? data.count : null,
  }));
}

// ── Re-export existing types for compatibility ──────────────

export interface OLSearchResult {
  key: string;
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  genre: string | null;
  rating: number | null;
  description: string | null;
  year: string | null;
  language: string | null;
}

/**
 * @param field `title` matches titles only; `q` is Open Library's general index
 *   and also matches authors. The add-book search uses `q` so that typing an
 *   author's name finds their books.
 */
export async function searchOpenLibrary(
  query: string,
  maxResults = 8,
  field: 'title' | 'q' = 'title',
): Promise<OLSearchResult[]> {
  if (!query.trim()) return [];
  {
    const url = `${OL_BASE}/search.json?${field}=${encodeURIComponent(query)}&limit=${maxResults * 4}&fields=${SEARCH_FIELDS}`;
    const data = await olFetchJson(url);
    if (!data.docs?.length) return [];
    const filtered = data.docs
      .filter((doc: any) => {
        const title = doc.title || '';
        if (isSupplementaryTitle(title)) return false;
        // Drop shell records with nothing to show. `subject` is no longer
        // requested (it dwarfed the payload), so judge on cover/pages/year.
        if (!doc.cover_i && !doc.number_of_pages_median && !doc.first_publish_year) return false;
        return true;
      })
      .map((doc: any): OLSearchResult => ({
        key: doc.key || '',
        title: doc.title || '',
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
        coverUrl: getCoverUrl(doc.cover_i ?? null, 'M'),
        pages: doc.number_of_pages_median || doc.number_of_pages || null,
        genre: pickGenre(doc.subject),
        rating: null,
        description: null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
        language: pickLanguage(doc.language, doc.title),
      }))
      .slice(0, maxResults);
    return filtered;
  }
}

export async function searchByGenre(
  genre: string,
  maxPages?: number,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!genre) return [];
  {
    const slug = genre.toLowerCase().replace(/\s+/g, '_');
    const url = `${OL_BASE}/subjects/${slug}.json?limit=${maxResults * 2}`;
    const data = await olFetchJson(url);
    const works: any[] = data.works || [];
    let results = works
      .map((w: any): OLSearchResult => ({
        key: w.key || '',
        title: w.title || '',
        author: Array.isArray(w.authors) ? w.authors[0]?.name : (w.authors || 'Unknown'),
        coverUrl: getCoverUrl(w.cover_id ?? null, 'M'),
        pages: null,
        genre,
        rating: null,
        description: null,
        year: w.first_publish_year ? String(w.first_publish_year) : null,
        language: null,
      }))
      .filter((r: OLSearchResult) => {
        if (isSupplementaryTitle(r.title)) return false;
        if (excludeIds?.has(r.key)) return false;
        if (maxPages && r.pages && r.pages > maxPages) return false;
        return true;
      });
    // Shuffle for variety — different books each visit
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }
    return results.slice(0, maxResults);
  }
}

export async function searchByAuthor(
  author: string,
  maxPages?: number,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!author) return [];
  {
    const searchUrl = `${OL_BASE}/search.json?author=${encodeURIComponent(author)}&limit=${maxResults * 2}&fields=${SEARCH_FIELDS},author_key`;
    const data = await olFetchJson(searchUrl);
    if (!data.docs?.length) return [];
    let results = data.docs
      .map((doc: any): OLSearchResult => ({
        key: doc.key || '',
        title: doc.title || '',
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
        coverUrl: getCoverUrl(doc.cover_i ?? null, 'M'),
        pages: doc.number_of_pages_median || doc.number_of_pages || null,
        genre: pickGenre(doc.subject),
        rating: null,
        description: null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
        language: pickLanguage(doc.language, doc.title),
      }))
      .filter((r: OLSearchResult) => {
        if (excludeIds?.has(r.key)) return false;
        if (maxPages && r.pages && r.pages > maxPages) return false;
        return true;
      });
    return results.slice(0, maxResults);
  }
}
