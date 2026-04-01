// UNUSED — legacy API client (replaced by lib/db.ts IndexedDB layer)
import type { Book, Stats } from './types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getBooks(): Promise<Book[]> {
  const response = await fetch(`${API_BASE}/books`);
  return handleResponse<Book[]>(response);
}

export async function createBook(
  data: Omit<Book, 'id' | 'created_at'>
): Promise<Book> {
  const response = await fetch(`${API_BASE}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Book>(response);
}

export async function updateBook(
  id: number,
  data: Partial<Book>
): Promise<Book> {
  // Use PATCH for partial updates so missing fields aren't nulled out
  const response = await fetch(`${API_BASE}/books/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Book>(response);
}

export async function deleteBook(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/books/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

export async function getStats(): Promise<Stats> {
  const response = await fetch(`${API_BASE}/stats`);
  return handleResponse<Stats>(response);
}

export async function getReadingBooks(): Promise<Book[]> {
  const response = await fetch(`${API_BASE}/books/reading`);
  return handleResponse<Book[]>(response);
}
