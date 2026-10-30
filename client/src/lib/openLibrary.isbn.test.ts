import { afterEach, expect, test, vi } from 'vitest';
import { fetchWorkRatings, lookupIsbn } from './openLibrary';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });

test('an unknown ISBN is not found rather than an error', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/isbn/') ? respond(404, {}) : respond(200, {}))));
  await expect(lookupIsbn('9780000000001')).resolves.toBeNull();
});

test('a lookup where both requests fail is an error, not "not found"', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => respond(400, {})));
  await expect(lookupIsbn('9780000000002')).rejects.toThrow();
});

test('community ratings are read from the summary Open Library returns', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => respond(200, { summary: { average: 4.306, count: 457, sortable: 4.2 }, counts: {} })));
  await expect(fetchWorkRatings('/works/OL893414W')).resolves.toMatchObject({ average: 4.3, count: 457 });
});
