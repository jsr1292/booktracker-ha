/**
 * JWT token management for the Book Tracker API.
 * Tokens are stored in localStorage and attached to every API request.
 */

const TOKEN_KEY = 'book_tracker_token';
const USER_ID_KEY = 'book_tracker_user_id';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, userId?: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (userId !== undefined) {
    localStorage.setItem(USER_ID_KEY, String(userId));
  }
}

export function getUserId(): number | null {
  const id = localStorage.getItem(USER_ID_KEY);
  return id ? parseInt(id, 10) : null;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Login and store token */
export async function login(username: string, password: string): Promise<{ token: string; userId: number }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  setToken(data.token, data.userId);
  return { token: data.token, userId: data.userId };
}

/** Register and store token */
export async function register(username: string, password: string): Promise<{ token: string; userId: number }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  setToken(data.token, data.userId);
  return { token: data.token, userId: data.userId };
}

export function logout(): void {
  clearToken();
}
