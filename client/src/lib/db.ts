/**
 * Book Tracker — Server API layer.
 * All data is persisted on the server via REST API (Express + SQLite).
 * IndexedDB (Dexie.js) is no longer used.
 */

import type { Book } from '../types';
import { getToken } from './auth';

export type { Stats, Achievement } from '../types';

// ── API base ────────────────────────────────────────────────────────────

const API_BASE = '/api';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Clear token so next load goes to auth page
      localStorage.removeItem('book_tracker_token');
      localStorage.removeItem('book_tracker_user_id');
      const err: any = new Error('Session expired. Please log in again.');
      err.status = 401;
      throw err;
    }
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  // DELETE returns { success: true } with no body
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── CRUD ────────────────────────────────────────────────────────────────

export async function getBooks(options?: {
  status?: string;
  genre?: string;
  search?: string;
}): Promise<Book[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.genre) params.set('genre', options.genre);
  if (options?.search) params.set('search', options.search);
  const query = params.toString();
  return apiFetch<Book[]>(`/books${query ? `?${query}` : ''}`);
}

export async function getBook(id: number): Promise<Book | undefined> {
  return apiFetch<Book>(`/books/${id}`);
}

export async function addBook(
  data: Omit<Book, 'id' | 'created_at' | 'updated_at'>,
): Promise<Book> {
  return apiFetch<Book>('/books', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBook(id: number, data: Partial<Book>): Promise<Book> {
  return apiFetch<Book>(`/books/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteBook(id: number): Promise<void> {
  await apiFetch<{ success: boolean }>(`/books/${id}`, { method: 'DELETE' });
}

// ── Stats ───────────────────────────────────────────────────────────────

export async function getStats(): Promise<import('../types').Stats> {
  return apiFetch<import('../types').Stats>('/stats');
}

// ── Aliases to match original interface ─────────────────────────────────

export { addBook as createBook };

// ── Export / Import ─────────────────────────────────────────────────────
// These remain client-side (JSON file download / upload)

export function exportBooks(): void {
  // Trigger a full fetch and download the result as JSON
  getBooks().then(books => {
    const json = JSON.stringify(books, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `books_export_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export async function importBooks(
  file: File,
): Promise<{ imported: number; skipped: number }> {
  const text = await file.text();
  const books: Book[] = JSON.parse(text);
  if (!Array.isArray(books)) throw new Error('Invalid file: expected an array of books');

  let imported = 0;
  let skipped = 0;

  for (const book of books) {
    if (!book.title) { skipped++; continue; }
    try {
      await addBook({
        title: book.title,
        author: book.author,
        status: book.status,
        rating: book.rating,
        pages: book.pages,
        genre: book.genre,
        language: book.language,
        cover_url: book.cover_url,
        description: book.description,
        date_started: book.date_started,
        date_finished: book.date_finished,
        planned_date: book.planned_date,
        notes: book.notes,
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped };
}

export async function getBookCount(): Promise<number> {
  const books = await getBooks();
  return books.length;
}
