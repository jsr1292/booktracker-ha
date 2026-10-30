/** Open Library lookup for the add-a-book form. */
import * as ol from '../lib/openLibrary';

export interface BookResult {
  key: string | null;
  description: string | null;
  title: string;
  author: string;
  pages: number | null;
  genre: string | null;
  coverUrl: string | null;
  isbn: string | null;
  language: string | null;
}

function fromOpenLibrary(r: ol.OLSearchResult): BookResult {
  return {
    key: r.key, title: r.title || 'Unknown', author: r.author || 'Unknown',
    pages: r.pages, genre: r.genre, coverUrl: r.coverUrl, isbn: null,
    description: r.description, language: r.language,
  };
}

export async function lookupISBN(isbn: string): Promise<BookResult | null> {
  const normalized = isbn.replace(/[\s-]/g, '').toUpperCase();
  const hit = await ol.lookupIsbn(normalized);
  if (!hit) return null;
  return { key: hit.workKey, title: hit.title, author: hit.author, pages: hit.pages,
    genre: hit.genre, coverUrl: hit.coverUrl, isbn: normalized, language: hit.language,
    description: hit.description };
}

export async function searchBooks(query: string): Promise<BookResult[]> {
  if (query.trim().length < 3) return [];
  return (await ol.searchOpenLibrary(query, 6, 'q')).map(fromOpenLibrary);
}
