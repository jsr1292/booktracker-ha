/**
 * Open Library API — no API key, no rate limits.
 * Primary source for Discover recommendations and genre/author search.
 */

export interface OLSearchResult {
  key: string;          // e.g. "/works/OL45804W"
  googleId: string;     // kept for compatibility
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

function coverUrl(coverId: number | undefined): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

const SUMMARY_PATTERNS = [
  /summary/i, /review/i, /analysis/i, /study guide/i,
  /collection set/i, /boxed set/i, /2-book set/i,
];
const SUMMARY_AUTHORS = /^(super ?summary|good reads publishing|unique summary|shortened edition|excerpt|abridged edition)/i;

function isSummary(doc: any): boolean {
  const title = doc.title || '';
  const author = Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || '');
  if (SUMMARY_PATTERNS.some(p => p.test(title))) return true;
  if (SUMMARY_AUTHORS.test(author)) return true;
  // No cover + no subjects + no rating = likely a summary or minor derivative
  if (!doc.cover_i && !doc.subject?.length && !doc.number_of_pages_latest) return true;
  return false;
}

function makeResult(doc: any): OLSearchResult {
  return {
    key: doc.key || '',
    googleId: '',  // Open Library books don't have Google IDs
    title: doc.title || '',
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'Unknown'),
    coverUrl: coverUrl(doc.cover_i),
    pages: doc.number_of_pages_latest || doc.number_of_pages || null,
    genre: Array.isArray(doc.subject) ? doc.subject[0] : (doc.subject || null),
    rating: null,
    description: null,
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    language: doc.language?.[0] || null,
  };
}

// ── General search ───────────────────────────────────────────

export async function searchOpenLibrary(
  query: string,
  maxResults = 8,
): Promise<OLSearchResult[]> {
  if (!query.trim()) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=${maxResults * 4}&fields=key,title,author_name,cover_i,number_of_pages_latest,subject,language,first_publish_year,edition_count`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL search failed: ${res.status}`);
    const data = await res.json();
    if (!data.docs?.length) return [];
    // Filter out summaries and non-book results, then take maxResults
    const filtered = data.docs
      .filter((doc: any) => !isSummary(doc))
      .map(makeResult)
      .slice(0, maxResults);
    return filtered;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout');
    throw err; // signal failure to caller so they can fall back
  }
}

// ── Subject / Genre search ──────────────────────────────────

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
    const url = `https://openlibrary.org/subjects/${slug}.json?limit=${maxResults * 2}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL subject failed: ${res.status}`);
    const data = await res.json();
    const works: any[] = data.works || [];
    let results = works
      .map((w: any) => ({
        key: w.key || '', googleId: '',
        title: w.title || '',
        author: Array.isArray(w.authors) ? w.authors[0]?.name : (w.authors || 'Unknown'),
        coverUrl: w.cover_id ? coverUrl(w.cover_id) : null,
        pages: null, genre, rating: null, description: null,
        year: w.first_publish_year ? String(w.first_publish_year) : null,
        language: null,
      }))
      .filter((r: OLSearchResult) => {
        if (SUMMARY_PATTERNS.some(p => p.test(r.title))) return false;
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

// ── Author search ────────────────────────────────────────────

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
    const searchUrl = `https://openlibrary.org/search.json?author=${encodeURIComponent(author)}&limit=${maxResults * 2}&fields=key,title,author_name,cover_i,number_of_pages_latest,subject,language,first_publish_year,author_key`;
    const res = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OL author search failed: ${res.status}`);
    const data = await res.json();
    if (!data.docs?.length) return [];
    let results = data.docs
      .map(makeResult)
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
