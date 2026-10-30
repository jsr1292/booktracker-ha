import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fetchServerBooks } from './auth';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null }));

function mockPages(pages: number[], failedPage = -1) {
  const fetch = vi.fn(async (url: string) => {
    const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset'));
    const page = offset / 500;
    if (page === failedPage) return { ok: false, status: 500, json: async () => ({ error: 'Page failed' }) };
    return {
      ok: true, status: 200,
      json: async () => Array.from({ length: pages[page] ?? 0 }, (_, i) => ({ id: offset + i + 1 })),
    };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

test('fetches three pages through the short final page', async () => {
  const fetch = mockPages([500, 500, 2]);
  const books = await fetchServerBooks();
  expect(books).toHaveLength(1002);
  expect(books[books.length - 1].id).toBe(1002);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/books?limit=500&offset=0',
    '/api/books?limit=500&offset=500',
    '/api/books?limit=500&offset=1000',
  ]);
});

test('rejects the whole fetch when page two fails', async () => {
  const fetch = mockPages([500, 500], 1);
  await expect(fetchServerBooks()).rejects.toThrow('Page failed');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('an empty first page returns an empty list', async () => {
  const fetch = mockPages([0]);
  await expect(fetchServerBooks()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('an exact page of 500 fetches the next empty page', async () => {
  const fetch = mockPages([500, 0]);
  await expect(fetchServerBooks()).resolves.toHaveLength(500);
  expect(fetch).toHaveBeenCalledTimes(2);
});
