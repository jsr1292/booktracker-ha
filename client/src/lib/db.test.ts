import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Book } from '../types';

const auth = vi.hoisted(() => ({ loggedIn: false, updateServerBook: vi.fn(), createServerBook: vi.fn() }));
vi.mock('./auth', () => ({
  isLoggedIn: () => auth.loggedIn,
  updateServerBook: auth.updateServerBook,
  createServerBook: auth.createServerBook,
}));

import { addBook, db, updateBook } from './db';

beforeEach(async () => {
  auth.loggedIn = false;
  auth.updateServerBook.mockReset();
  auth.createServerBook.mockReset();
  await db.books.clear();
});

const book = (rating: number | null): Book => ({
  id: 1, title: 'Test book', status: 'finished', rating,
  created_at: '2026-10-30T00:00:00.000Z', updated_at: '2026-10-30T00:00:00.000Z',
});

test.each([false, true])('rating update semantics, logged in=%s', async (loggedIn) => {
  auth.loggedIn = loggedIn;
  auth.updateServerBook.mockResolvedValue({});
  await db.books.put(book(4));

  expect((await updateBook(1, { title: 'Updated' })).rating).toBe(4);
  expect((await updateBook(1, { rating: null })).rating).toBeNull();
  expect((await updateBook(1, { rating: 8 })).rating).toBe(5);
  expect((await updateBook(1, { rating: 0 })).rating).toBe(1);

  if (loggedIn) {
    expect(auth.updateServerBook).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ rating: 4 }));
    expect(auth.updateServerBook).toHaveBeenNthCalledWith(2, 1, expect.objectContaining({ rating: null }));
    expect(auth.updateServerBook).toHaveBeenNthCalledWith(3, 1, expect.objectContaining({ rating: 5 }));
    expect(auth.updateServerBook).toHaveBeenNthCalledWith(4, 1, expect.objectContaining({ rating: 1 }));
  } else {
    expect(auth.updateServerBook).not.toHaveBeenCalled();
  }
});

test('progress and edition values are sanitized and clamped on update', async () => {
  await db.books.put({ ...book(null), pages: 100 });
  const updated = await updateBook(1, { current_page: 150, isbn: '0-306-40615-2', openlibrary_key: '/works/OL123W' });
  expect(updated).toMatchObject({ current_page: 100, isbn: '0306406152', openlibrary_key: '/works/OL123W' });
  const cleared = await updateBook(1, { current_page: null, isbn: 'bad', openlibrary_key: '/books/OL1M' });
  expect(cleared).toMatchObject({ current_page: null, isbn: null, openlibrary_key: null });
});

test('new books retain normalized progress and edition fields', async () => {
  auth.loggedIn = true;
  auth.createServerBook.mockImplementation(async fields => ({ ...fields, id: 2, created_at: '', updated_at: '' }));
  const created = await addBook({ title: 'New', status: 'reading', pages: 80, current_page: 90,
    isbn: '0-306-40615-2', openlibrary_key: '/works/OL1W' });
  expect(created).toMatchObject({ current_page: 80, isbn: '0306406152', openlibrary_key: '/works/OL1W' });
  expect(auth.createServerBook).toHaveBeenCalledWith(expect.objectContaining({ current_page: 80, isbn: '0306406152' }));
});
