/**
 * Book lookup for the add-a-book flow.
 *
 * This module owns no network code of its own: it composes the Google Books and
 * Open Library clients in ./lib and adapts their results to the flat shape the
 * form expects. That way both providers get their client's timeout, retry and
 * request de-duplication rather than each caller re-inventing them.
 */

import * as gb from '../lib/googleBooks';
import * as ol from '../lib/openLibrary';

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

function fromGoogle(r: gb.GoogleBookResult, isbn: string | null = null): BookResult {
  return {
    title: r.title || 'Unknown',
    author: r.author || 'Unknown',
    pages: r.pages,
    genre: r.genre,
    coverUrl: r.coverUrl,
    isbn,
    description: r.description,
    language: r.language,
  };
}

function fromOpenLibrary(r: ol.OLSearchResult): BookResult {
  return {
    title: r.title || 'Unknown',
    author: r.author || 'Unknown',
    pages: r.pages,
    genre: r.genre,
    coverUrl: r.coverUrl,
    isbn: null, // search.json has no single authoritative ISBN for a work
    description: r.description,
    language: r.language,
  };
}

// ── ISBN Lookup ──────────────────────────────────────────────

/**
 * Resolve a scanned ISBN. Google Books first (it carries descriptions), then
 * Open Library.
 *
 * Each provider is allowed to fail independently — including by timeout. A
 * Google timeout used to abort the whole lookup, so the fallback never ran in
 * exactly the case it existed for.
 */
export async function lookupISBN(isbn: string): Promise<BookResult | null> {
  try {
    const hit = await gb.lookupISBN(isbn);
    if (hit) return fromGoogle(hit, isbn);
  } catch {
    /* timeout or network error — try Open Library */
  }

  try {
    const hit = await ol.lookupIsbn(isbn);
    if (hit) {
      return {
        title: hit.title,
        author: hit.author,
        pages: hit.pages,
        genre: hit.genre,
        coverUrl: hit.coverUrl,
        isbn,
        language: null,
        description: null,
      };
    }
  } catch {
    /* both providers failed */
  }

  return null;
}

// ── Title Search ────────────────────────────────────────────

export async function searchBooks(query: string): Promise<BookResult[]> {
  if (query.length < 3) return [];

  // Open Library is primary (no rate limits, no key needed); Google Books fills
  // in when Open Library is thin. `q` rather than `title` so that typing an
  // author's name works too.
  const [olResults, gbResults] = await Promise.allSettled([
    ol.searchOpenLibrary(query, 6, 'q').then(rs => rs.map(fromOpenLibrary)),
    gb.searchGoogleBooks(query, 6).then(rs => rs.map(r => fromGoogle(r))),
  ]);

  const seen = new Set<string>();
  const merged: BookResult[] = [];

  // Identify a book by title+author rather than ISBN: the two providers rarely
  // agree on an edition, so an ISBN match almost never fired and the same book
  // appeared twice.
  const identity = (b: BookResult) =>
    `${b.title.toLowerCase().replace(/\W+/g, ' ').trim()}|${b.author.toLowerCase().replace(/\W+/g, ' ').trim()}`;

  // OL results first, then GB fallback
  for (const result of [olResults, gbResults]) {
    if (result.status !== 'fulfilled') continue;
    for (const book of result.value) {
      const id = identity(book);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(book);
    }
    if (merged.length >= 6) break;
  }

  return merged.slice(0, 6);
}
