export interface BookResult {
  description: string | null;
  title: string;
  author: string;
  pages: number | null;
  genre: string | null;
  coverUrl: string | null;
  isbn: string | null;
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

// ── ISBN Lookup ──────────────────────────────────────────────

export async function lookupISBN(isbn: string): Promise<BookResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  // Try Google Books first
  try {
    const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`, { signal: controller.signal });
    const gbData = await gb.json();
    if (gbData.items?.length) {
      clearTimeout(timeout);
      const v = gbData.items[0].volumeInfo;
      return {
        title: v.title || 'Unknown',
        author: (v.authors || []).join(', ') || 'Unknown',
        pages: typeof v.pageCount === 'number' ? v.pageCount : null,
        genre: (v.categories || [])[0] || null,
        coverUrl: v.imageLinks?.thumbnail || null,
        isbn,
        description: v.description || null,
        language: v.language ? langCodeToName(v.language) : null,
      };
    }
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw e; // re-throw timeout
    /* try next */
  }

  // Fallback: Open Library (reuses same AbortController)
  try {
    const ol = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { signal: controller.signal });
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
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw e; // re-throw timeout
    /* try next */
  }

  return null;
}

// ── Title Search ────────────────────────────────────────────

async function searchGoogleBooks(query: string): Promise<BookResult[]> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&printType=books`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) return [];
    return data.items
      .filter((item: any) => item.volumeInfo.title && (item.volumeInfo.authors?.length ?? 0) > 0)
      .map((item: any) => {
        const v = item.volumeInfo;
        return {
          title: v.title || '',
          author: (v.authors || []).join(', '),
          pages: typeof v.pageCount === 'number' ? v.pageCount : null,
          genre: (v.categories || [])[0] || null,
          coverUrl: v.imageLinks?.thumbnail || null,
          isbn: (v.industryIdentifiers || [])[0]?.identifier || null,
          language: v.language ? langCodeToName(v.language) : null,
          description: v.description || null,
        };
      });
  } catch { return []; }
}

async function searchOpenLibrary(query: string): Promise<BookResult[]> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=6&fields=key,title,author_name,cover_i,isbn,number_of_pages_latest,subject,language,first_publish_year`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.docs?.length) return [];
    return data.docs.map((d: any) => ({
      title: d.title || '',
      author: d.author_name?.[0] || 'Unknown',
      pages: d.number_of_pages_latest || null,
      genre: d.subject?.[0] || null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      isbn: d.isbn?.[0] || null,
      language: d.language?.[0] ? langCodeToName(d.language[0]) : null,
      description: null, // OL search doesn't return descriptions
    }));
  } catch { return []; }
}

export async function searchBooks(query: string): Promise<BookResult[]> {
  if (query.length < 3) return [];

  // Open Library is primary (no rate limits, no key needed).
  // Google Books is fallback in case OL doesn't have the book.
  const [olResults, gbResults] = await Promise.allSettled([
    searchOpenLibrary(query),
    searchGoogleBooks(query),
  ]);

  const seen = new Set<string>();
  const merged: BookResult[] = [];

  // OL results first, then GB fallback
  for (const result of [olResults, gbResults]) {
    if (result.status !== 'fulfilled') continue;
    for (const book of result.value) {
      if (book.isbn && seen.has(book.isbn)) continue;
      if (book.isbn) seen.add(book.isbn);
      merged.push(book);
    }
    if (merged.length >= 6) break;
  }

  return merged.slice(0, 6);
}
