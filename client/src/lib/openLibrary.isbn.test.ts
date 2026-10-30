import { afterEach, expect, test, vi } from 'vitest';
import { lookupIsbn } from './openLibrary';

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
