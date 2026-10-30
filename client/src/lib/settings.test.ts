// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';

const auth = vi.hoisted(() => ({ loggedIn: false, fetchReadingGoal: vi.fn(), updateReadingGoal: vi.fn() }));
vi.mock('./auth', () => ({ isLoggedIn: () => auth.loggedIn, fetchReadingGoal: auth.fetchReadingGoal, updateReadingGoal: auth.updateReadingGoal }));
import { getReadingGoal, setReadingGoal } from './settings';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  auth.loggedIn = false; auth.fetchReadingGoal.mockReset(); auth.updateReadingGoal.mockReset();
});

test('offline goal uses cached local value and validates range', async () => {
  expect(await getReadingGoal()).toBe(12);
  expect(await setReadingGoal(25)).toBe(25);
  expect(await getReadingGoal()).toBe(25);
  await expect(setReadingGoal(0)).rejects.toThrow();
  await expect(setReadingGoal(1.5)).rejects.toThrow();
});

test('logged in goal reads and writes server, retaining the cache on failure', async () => {
  auth.loggedIn = true;
  auth.fetchReadingGoal.mockResolvedValue({ reading_goal: 30 });
  auth.updateReadingGoal.mockResolvedValue({ reading_goal: 40 });
  expect(await getReadingGoal()).toBe(30);
  expect(await setReadingGoal(40)).toBe(40);
  expect(localStorage.getItem('booktracker_reading_goal')).toBe('40');
  auth.fetchReadingGoal.mockRejectedValue(new Error('offline'));
  expect(await getReadingGoal()).toBe(40);
});
