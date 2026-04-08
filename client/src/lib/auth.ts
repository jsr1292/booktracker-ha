/**
 * Auth layer — JWT token management + API auth calls.
 * Tokens stored in localStorage.
 */

import type { Book } from '../types';

const TOKEN_KEY = 'booktracker_token';
const USERNAME_KEY = 'booktracker_username';

// ── Token helpers ─────────────────────────────────────────────────────────

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function isLoggedIn(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = decodeJWT(token);
    if (!payload) return false;
    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getUsername(): string | null {
  // Try stored username first
  const stored = localStorage.getItem(USERNAME_KEY);
  if (stored) return stored;
  // Decode from token
  const token = getToken();
  if (!token) return null;
  const payload = decodeJWT(token);
  return payload?.username ?? null;
}

export function storeUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

// ── JWT decode (no external dep) ────────────────────────────────────────────

function decodeJWT(token: string): { userId?: number; username?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

// ── API base URL ───────────────────────────────────────────────────────────

function apiBase(): string {
  // In dev (Vite), proxy /api to backend; in prod, same origin
  return '';
}

// ── Auth API calls ─────────────────────────────────────────────────────────

interface AuthResponse {
  token: string;
  userId?: number;
  user?: { id: number; username: string };
}

interface APIError {
  error: string;
}

// ── 401 handler (token expiry mid-session) ──────────────────────────────────

let onAuthExpired: (() => void) | null = null;

/** Register a callback for when a 401 is detected */
export function setOnAuthExpired(cb: () => void): void {
  onAuthExpired = cb;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBase()}${path}`, { ...options, headers });

  // Auto-logout on 401 (token expired or invalid)
  if (res.status === 401 && token) {
    clearToken();
    onAuthExpired?.();
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 204) {
    return {} as T;
  }

  const data = await res.json() as T & APIError;
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  storeToken(data.token);
  storeUsername(username);
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  storeToken(data.token);
  storeUsername(username);
  return data;
}

export function logout(): void {
  clearToken();
}

// ── Book API calls (used by sync layer) ───────────────────────────────────

export interface ServerBook extends Omit<Book, 'id'> {
  id: number;
}

export async function fetchServerBooks(): Promise<ServerBook[]> {
  return apiFetch<ServerBook[]>('/api/books');
}

export async function createServerBook(book: Omit<Book, 'id' | 'created_at' | 'updated_at'>): Promise<ServerBook> {
  return apiFetch<ServerBook>('/api/books', {
    method: 'POST',
    body: JSON.stringify(book),
  });
}

export async function updateServerBook(id: number, book: Partial<Book>): Promise<ServerBook> {
  return apiFetch<ServerBook>(`/api/books/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(book),
  });
}

export async function deleteServerBook(id: number): Promise<void> {
  await apiFetch(`/api/books/${id}`, { method: 'DELETE' });
}
