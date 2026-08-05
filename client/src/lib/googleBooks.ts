/**
 * Direct Google Books API calls — no API key needed.
 * Replaces the /api/recommendations backend endpoint.
 */

export interface GoogleBookResult {
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

const GB_BASE = 'https://www.googleapis.com/books/v1/volumes';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * ISO-639-1 two-letter codes, as returned by Google Books. Open Library speaks
 * MARC-21 three-letter codes instead — see `pickLanguage` in ./openLibrary.
 */
const LANG_MAP: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  fi: 'Finnish', pl: 'Polish', ru: 'Russian', ja: 'Japanese', zh: 'Chinese',
  ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ca: 'Catalan', eu: 'Basque',
  gl: 'Galician', und: 'Unknown',
};

export function langCodeToName(code: string): string {
  return LANG_MAP[code] ?? code.toUpperCase();
}

function parseYear(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : null;
}

/**
 * Single fetch path for Google Books. Returns null when the request fails in a
 * way the caller should treat as "no results"; throws only on timeout, which
 * callers surface so the UI can distinguish a slow network from an empty shelf.
 */
async function gbFetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function volumeToResult(item: any, excludeIds?: Set<string>): GoogleBookResult | null {
  const v = item.volumeInfo;
  const googleId = item.id;
  if (!v.title || !v.authors?.length) return null;
  if (excludeIds?.has(googleId)) return null;

  // Note: Google Books doesn't expose avg rating directly
  const rating: number | null = null;

  return {
    googleId,
    title: v.title || '',
    author: (v.authors || []).join(', '),
    coverUrl: v.imageLinks?.thumbnail?.replace('http://', 'https://') ||
               v.imageLinks?.smallThumbnail?.replace('http://', 'https://') ||
               null,
    pages: typeof v.pageCount === 'number' ? v.pageCount : null,
    genre: (v.categories || [])[0] || null,
    rating,
    description: v.description || null,
    year: parseYear(v.publishedDate),
    language: v.language ? langCodeToName(v.language) : null,
  };
}

/**
 * General search query — used for free-text search (handles q param)
 */
export async function searchGoogleBooks(
  query: string,
  maxResults = 6,
): Promise<GoogleBookResult[]> {
  if (!query || query.length < 2) return [];
  const url = `${GB_BASE}?q=${encodeURIComponent(query)}&maxResults=${maxResults}&printType=books&langRestrict=en`;
  const data = await gbFetchJson(url);
  if (!data?.items?.length) return [];
  return data.items
    .map((item: any) => volumeToResult(item))
    .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null)
    .slice(0, maxResults);
}

/** Look up a single volume by ISBN. Returns null when Google has no match. */
export async function lookupISBN(isbn: string): Promise<GoogleBookResult | null> {
  const data = await gbFetchJson(`${GB_BASE}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`);
  const item = data?.items?.[0];
  if (!item) return null;
  // Unlike search, an ISBN match is authoritative even without a listed author.
  return (
    volumeToResult(item) ?? {
      googleId: item.id,
      title: item.volumeInfo?.title || 'Unknown',
      author: (item.volumeInfo?.authors || []).join(', ') || 'Unknown',
      coverUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
      pages: typeof item.volumeInfo?.pageCount === 'number' ? item.volumeInfo.pageCount : null,
      genre: (item.volumeInfo?.categories || [])[0] || null,
      rating: null,
      description: item.volumeInfo?.description || null,
      year: parseYear(item.volumeInfo?.publishedDate),
      language: item.volumeInfo?.language ? langCodeToName(item.volumeInfo.language) : null,
    }
  );
}

/**
 * Search by genre (subject), optionally filtered by max pages.
 * Uses Google Books subject search.
 */
export async function searchByGenre(
  genre: string,
  maxPages?: number,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<GoogleBookResult[]> {
  if (!genre) return [];
  // Google Books subject search: subject:fiction
  const url = `${GB_BASE}?q=subject:${encodeURIComponent(genre)}&maxResults=${maxResults * 2}&printType=books&orderBy=relevance`;
  const data = await gbFetchJson(url);
  if (!data?.items?.length) return [];

  let results = data.items
    .map((item: any) => volumeToResult(item, excludeIds))
    .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null);

  if (maxPages) {
    results = results.filter((b: GoogleBookResult) => !b.pages || b.pages <= maxPages);
  }

  return results.slice(0, maxResults);
}

/**
 * Search by author name.
 */
export async function searchByAuthor(
  author: string,
  excludeIds?: Set<string>,
  maxResults = 8,
): Promise<GoogleBookResult[]> {
  if (!author) return [];
  const url = `${GB_BASE}?q=inauthor:${encodeURIComponent(author)}&maxResults=${maxResults * 2}&printType=books&orderBy=relevance`;
  const data = await gbFetchJson(url);
  if (!data?.items?.length) return [];
  return data.items
    .map((item: any) => volumeToResult(item, excludeIds))
    .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null)
    .slice(0, maxResults);
}
