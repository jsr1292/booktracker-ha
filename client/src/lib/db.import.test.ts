import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Book } from '../types';

const auth = vi.hoisted(() => ({
  loggedIn: true, fetchServerBooks: vi.fn(), createServerBook: vi.fn(), updateServerBook: vi.fn(),
}));
vi.mock('./auth', () => ({ ...auth, isLoggedIn: () => auth.loggedIn }));
import { db, importBooks } from './db';

const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;
const book = (fields: Partial<Book> = {}): Book => ({
  id: 20, title: 'Dune', author: 'Frank Herbert', status: 'reading',
  created_at: '2026-01-01', updated_at: '2026-01-01', ...fields,
});
beforeEach(async () => {
  vi.resetAllMocks();
  auth.loggedIn = true;
  auth.fetchServerBooks.mockResolvedValue([]);
  auth.createServerBook.mockImplementation(async fields => book({ ...fields, id: 99 }));
  auth.updateServerBook.mockImplementation(async (id, fields) => book({ ...fields, id }));
  await db.books.clear();
});

test('logged in import creates on server without file identity or ownership', async () => {
  const result = await importBooks(file([{ ...book({ id: 123 }), user_id: 456 }]));
  expect(auth.createServerBook).toHaveBeenCalledOnce();
  const sent = auth.createServerBook.mock.calls[0][0];
  expect(sent).toMatchObject({ title: 'Dune', author: 'Frank Herbert' });
  expect(sent).not.toHaveProperty('id');
  expect(sent).not.toHaveProperty('user_id');
  expect(sent).not.toHaveProperty('created_at');
  expect(result).toEqual({ imported: 1, skipped: 0, failed: 0 });
  expect(auth.fetchServerBooks).toHaveBeenCalledOnce();
});

test('case-insensitive trimmed match fills only empty server fields', async () => {
  auth.fetchServerBooks.mockResolvedValue([book({ pages: null, notes: '', rating: 5 })]);
  const result = await importBooks(file([book({ id: 999, title: ' DUNE ', author: ' frank herbert ',
    pages: 400, notes: 'Imported notes', rating: 1, status: 'finished' })]));
  expect(auth.createServerBook).not.toHaveBeenCalled();
  expect(auth.updateServerBook).toHaveBeenCalledExactlyOnceWith(20, { pages: 400, notes: 'Imported notes' });
  expect(result).toEqual({ imported: 1, skipped: 0, failed: 0 });
});

test('failed create is counted and remaining books continue', async () => {
  auth.createServerBook.mockRejectedValueOnce(new Error('Server unavailable'));
  const result = await importBooks(file([book(), book({ title: 'Next book' })]));
  expect(auth.createServerBook).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ imported: 1, skipped: 0, failed: 1 });
});

test('missing, blank and invalid title rows are skipped', async () => {
  expect(await importBooks(file([{}, { title: ' ' }, { title: '<b></b>' }, null, { title: 42 }]))).
    toEqual({ imported: 0, skipped: 5, failed: 0 });
  expect(auth.createServerBook).not.toHaveBeenCalled();
});

test('bad JSON rejects with a readable message', async () => {
  await expect(importBooks({ text: async () => 'broken JSON' } as File)).rejects.toThrow('Invalid file: could not parse JSON');
});

test('non-array JSON rejects clearly', async () => {
  await expect(importBooks(file({ books: [] }))).rejects.toThrow('Invalid file: expected an array of books');
});

test('duplicate entries in one file reuse the newly created server book', async () => {
  await importBooks(file([book(), book({ notes: 'More notes' })]));
  expect(auth.fetchServerBooks).toHaveBeenCalledOnce();
  expect(auth.createServerBook).toHaveBeenCalledOnce();
  expect(auth.updateServerBook).toHaveBeenCalledExactlyOnceWith(99, { notes: 'More notes' });
});

test('offline import keeps local IDs and only fills empty fields', async () => {
  auth.loggedIn = false;
  await db.books.put(book({ pages: 400 }));
  expect(await importBooks(file([book({ pages: 100, notes: 'Notes' }), book({ id: 21, title: 'Other' })]))).
    toEqual({ imported: 2, skipped: 0, failed: 0 });
  expect(await db.books.get(20)).toMatchObject({ pages: 400, notes: 'Notes' });
  expect(await db.books.get(21)).toMatchObject({ title: 'Other' });
  expect(auth.fetchServerBooks).not.toHaveBeenCalled();
  expect(auth.createServerBook).not.toHaveBeenCalled();
});

test('offline import preserves existing export metadata', async () => {
  auth.loggedIn = false;
  await importBooks(file([book({ openLibraryKey: '/works/OL1W' })]));
  expect(await db.books.get(20)).toMatchObject({ openLibraryKey: '/works/OL1W', created_at: '2026-01-01' });
});
