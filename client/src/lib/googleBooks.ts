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

const LANG_MAP: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  fi: 'Finnish', pl: 'Polish', ru: 'Russian', ja: 'Japanese', zh: 'Chinese',
  ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ca: 'Catalan', eu: 'Basque',
  gl: 'Galician', und: 'Unknown',
};

function langCodeToName(code: string): string {
  return LANG_MAP[code] ?? code.toUpperCase();
}

function parseYear(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : null;
}

function volumeToResult(item: any, excludeIds?: Set<string>): GoogleBookResult | null {
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&printType=books&langRestrict=en`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items
      .map((item: any) => volumeToResult(item))
      .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null)
      .slice(0, maxResults);
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw new Error('timeout');
    return [];
  }
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Google Books subject search: subject:fiction
    const subjectQuery = `subject:${encodeURIComponent(genre)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${subjectQuery}&maxResults=${maxResults * 2}&printType=books&orderBy=relevance`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];

    let results = data.items
      .map((item: any) => volumeToResult(item, excludeIds))
      .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null);

    if (maxPages) {
      results = results.filter((b: GoogleBookResult) => !b.pages || b.pages <= maxPages);
    }

    return results.slice(0, maxResults);
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw new Error('timeout');
    return [];
  }
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const authorQuery = `inauthor:${encodeURIComponent(author)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${authorQuery}&maxResults=${maxResults * 2}&printType=books&orderBy=relevance`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items
      .map((item: any) => volumeToResult(item, excludeIds))
      .filter((r: GoogleBookResult | null): r is GoogleBookResult => r !== null)
      .slice(0, maxResults);
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw new Error('timeout');
    return [];
  }
}
