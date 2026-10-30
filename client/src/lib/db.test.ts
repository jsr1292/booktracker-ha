import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Book } from '../types';

const auth = vi.hoisted(() => ({ loggedIn: false, updateServerBook: vi.fn() }));
vi.mock('./auth', () => ({
  isLoggedIn: () => auth.loggedIn,
  updateServerBook: auth.updateServerBook,
}));

import { db, updateBook } from './db';

beforeEach(async () => {
  auth.loggedIn = false;
  auth.updateServerBook.mockReset();
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
