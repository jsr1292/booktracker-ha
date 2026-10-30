import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Book } from '../types';

const auth = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => true), fetchServerBooks: vi.fn(), createServerBook: vi.fn(),
  updateServerBook: vi.fn(), deleteServerBook: vi.fn(),
}));
vi.mock('./auth', () => auth);
import { db } from './db';
import { fullSync, getSyncStatus } from './sync';

const local: Book = { id: 1, title: 'One book', author: 'Author', status: 'reading',
  created_at: '2026-01-01', updated_at: '2026-01-01' };
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  vi.resetAllMocks();
  auth.isLoggedIn.mockReturnValue(true);
  auth.fetchServerBooks.mockResolvedValue([]);
  auth.createServerBook.mockResolvedValue({ ...local, id: 50 });
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  await db.books.clear();
  await db.books.put(local);
});

test('two concurrent fullSync calls share a promise and create one server book', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  auth.createServerBook.mockImplementation(async () => { await gate; return { ...local, id: 50 }; });
  const first = fullSync();
  const second = fullSync();
  try { await vi.waitFor(() => expect(auth.createServerBook).toHaveBeenCalled()); }
  finally { release(); await Promise.all([first, second]); }
  expect(auth.createServerBook).toHaveBeenCalledTimes(1);
  expect(first).toBe(second);
});

test('a call after completion starts another sync', async () => {
  const first = fullSync();
  await first;
  const before = auth.fetchServerBooks.mock.calls.length;
  const later = fullSync();
  await later;
  expect(later).not.toBe(first);
  expect(auth.fetchServerBooks.mock.calls.length).toBeGreaterThan(before);
  expect(auth.createServerBook).toHaveBeenCalledTimes(1);
});

test('a failed sync releases the guard for retry', async () => {
  await db.books.clear();
  auth.fetchServerBooks.mockRejectedValueOnce(new Error('Offline'));
  await fullSync();
  expect(getSyncStatus().state).toBe('error');
  await fullSync();
  expect(getSyncStatus().state).toBe('idle');
  expect(auth.fetchServerBooks).toHaveBeenCalledTimes(2);
});
