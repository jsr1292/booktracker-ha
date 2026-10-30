/** Bounded, fixed-window failure counts shared by every IP for an account. */
export function createLoginThrottle({ maxFailures, windowMs, maxEntries, now = Date.now }: {
  maxFailures: number;
  windowMs: number;
  maxEntries: number;
  now?: () => number;
}) {
  const entries = new Map<string, { failures: number; expiresAt: number }>();
  const key = (username: string) => username.trim().toLowerCase();
  function expire(time: number) {
    // Insertion order is expiration order because failures do not extend the window.
    for (const [username, entry] of entries) {
      if (entry.expiresAt > time) break;
      entries.delete(username);
    }
  }
  return {
    isLocked(username: string): boolean {
      expire(now());
      return (entries.get(key(username))?.failures ?? 0) >= maxFailures;
    },
    recordFailure(username: string): void {
      const time = now();
      expire(time);
      const normalized = key(username);
      const entry = entries.get(normalized);
      if (entry) { entry.failures++; return; }
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(normalized, { failures: 1, expiresAt: time + windowMs });
    },
    recordSuccess(username: string): void {
      expire(now());
      entries.delete(key(username));
    },
  };
}
