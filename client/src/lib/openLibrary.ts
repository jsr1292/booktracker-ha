/**
 * Open Library API client — enhanced discovery layer.
 * User-Agent triples rate limit from 1→3 req/sec.
 */

export const OL_BASE = 'https://openlibrary.org';
export const OL_COVERS = 'https://covers.openlibrary.org';

const headers = {
  'User-Agent': 'BookTrackerPWA/1.3 (https://github.com/jsr1292/booktracker-ha)',
};

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
  googleId: string;      // empty for OL-only results
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

async function cachedFetch<T>(
  cacheKey: string,
  url: string,
  ttlMs: number,
  mapper: (data: any) => T,
): Promise<T> {
  const cached = getCache<T>(cacheKey, ttlMs);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL fetch failed: ${res.status}`);
    const data = await res.json();
    const result = mapper(data);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

// ── Cover / Author helpers ──────────────────────────────────

export function getCoverUrl(coverId: number | null, size: 'S' | 'M' | 'L' = 'M'): string | null {
  if (!coverId) return null;
  return `${OL_COVERS}/b/id/${coverId}-${size}.jpg?default=false`;
}

export function getAuthorPhotoUrl(authorOlid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${OL_COVERS}/a/olid/${authorOlid}-${size}.jpg?default=false`;
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
    pages: doc.number_of_pages_latest || doc.number_of_pages || null,
    genre: Array.isArray(doc.subject) ? doc.subject[0] : (doc.subject || null),
    rating: null,
    description: null,
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    language: doc.language?.[0] || null,
    readinglogCount: doc.readinglog_count || undefined,
    editionCount: doc.edition_count || undefined,
    ratingsCount: doc.ratings_count || undefined,
    googleId: '',
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
    googleId: '',
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

  // Check cache first
  const raw = localStorage.getItem(cacheKey);
  if (raw) {
    try {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < ttl) return data;
    } catch { /* cache miss */ }
  }

  try {
    const results = await Promise.allSettled(
      trendingSubjects.map(subject =>
        fetch(`${OL_BASE}/subjects/${subject}.json?limit=${perSubject}`, { headers })
          .then(r => r.json())
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
            googleId: '',
          })))
      )
    );

    let books = results
      .filter((r): r is PromiseFulfilledResult<OLBook[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      // Filter out summary-like entries
      .filter(b => !/summary|review|analysis|study guide|boxed set/i.test(b.title))
      // Remove duplicates by title
      .filter((b, i, arr) => arr.findIndex(x => x.title === b.title) === i);

    // Shuffle for variety
    for (let i = books.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [books[i], books[j]] = [books[j], books[i]];
    }
    books = books.slice(0, limit);

    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: books }));
    return books;
  } catch {
    throw new Error('Could not load trending books');
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
          if (/summary|review|analysis|study guide|boxed set|2-book set/i.test(t)) return false;
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
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { ts, key } = JSON.parse(cached);
    if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return key; // 7 day cache
  }
  try {
    const res = await fetch(`${OL_BASE}/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const author = data.docs?.[0];
    if (!author?.key) return null;
    const key = author.key.replace('/authors/', '');
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), key }));
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
        year: e.created?.value ? new Date(e.created.value).getFullYear().toString() : null,
      }));
  });
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
  googleId: string;
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

export async function searchOpenLibrary(
  query: string,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!query.trim()) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `${OL_BASE}/search.json?title=${encodeURIComponent(query)}&limit=${maxResults * 4}&fields=key,title,author_name,cover_i,number_of_pages_latest,subject,language,first_publish_year,edition_count`;
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL search failed: ${res.status}`);
    const data = await res.json();
    if (!data.docs?.length) return [];
    const filtered = data.docs
      .filter((doc: any) => {
        const title = doc.title || '';
        if (/summary|review|analysis|study guide|boxed set|2-book set/i.test(title)) return false;
        if (!doc.cover_i && !doc.subject?.length && !doc.number_of_pages_latest) return false;
        return true;
      })
      .map((doc: any): OLSearchResult => ({
        key: doc.key || '',
        googleId: '',
        title: doc.title || '',
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
        coverUrl: getCoverUrl(doc.cover_i ?? null, 'M'),
        pages: doc.number_of_pages_latest || doc.number_of_pages || null,
        genre: Array.isArray(doc.subject) ? doc.subject[0] : (doc.subject || null),
        rating: null,
        description: null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
        language: doc.language?.[0] || null,
      }))
      .slice(0, maxResults);
    return filtered;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

export async function searchByGenre(
  genre: string,
  maxPages?: number,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!genre) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const slug = genre.toLowerCase().replace(/\s+/g, '_');
    const url = `${OL_BASE}/subjects/${slug}.json?limit=${maxResults * 2}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL subject failed: ${res.status}`);
    const data = await res.json();
    const works: any[] = data.works || [];
    let results = works
      .map((w: any): OLSearchResult => ({
        key: w.key || '',
        googleId: '',
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
        if (/summary|review|analysis|study guide|boxed set|2-book set/i.test(r.title)) return false;
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
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

export async function searchByAuthor(
  author: string,
  maxPages?: number,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!author) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const searchUrl = `${OL_BASE}/search.json?author=${encodeURIComponent(author)}&limit=${maxResults * 2}&fields=key,title,author_name,cover_i,number_of_pages_latest,subject,language,first_publish_year,author_key`;
    const res = await fetch(searchUrl, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL author search failed: ${res.status}`);
    const data = await res.json();
    if (!data.docs?.length) return [];
    let results = data.docs
      .map((doc: any): OLSearchResult => ({
        key: doc.key || '',
        googleId: '',
        title: doc.title || '',
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
        coverUrl: getCoverUrl(doc.cover_i ?? null, 'M'),
        pages: doc.number_of_pages_latest || doc.number_of_pages || null,
        genre: Array.isArray(doc.subject) ? doc.subject[0] : (doc.subject || null),
        rating: null,
        description: null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
        language: doc.language?.[0] || null,
      }))
      .filter((r: OLSearchResult) => {
        if (excludeIds?.has(r.key)) return false;
        if (maxPages && r.pages && r.pages > maxPages) return false;
        return true;
      });
    return results.slice(0, maxResults);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}
