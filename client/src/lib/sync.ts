/**
 * Sync layer — two-way sync between IndexedDB and server.
 * - IndexedDB is the primary store (works offline)
 * - Server is secondary; failures are queued for retry
 * - Conflict resolution: last-write-wins using updated_at
 */

import { db } from './db';
import {
  isLoggedIn,
  fetchServerBooks,
  createServerBook,
  updateServerBook,
  deleteServerBook,
  type ServerBook,
} from './auth';
import type { Book } from '../types';

// ── Sync state ─────────────────────────────────────────────────────────────

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null; // unix ms
  errorMessage: string | null;
}

let _status: SyncStatus = {
  state: 'idle',
  lastSyncedAt: null,
  errorMessage: null,
};

const _listeners: Set<(s: SyncStatus) => void> = new Set();
let _autoSyncTimer: ReturnType<typeof setInterval> | null = null;

export function getSyncStatus(): SyncStatus {
  return { ..._status };
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify(next: Partial<SyncStatus>) {
  _status = { ..._status, ...next };
  _listeners.forEach(fn => fn(_status));
}

// ── Debounce helper ─────────────────────────────────────────────────────────

function debounce<T extends (...args: unknown[]) => Promise<void>>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  }) as T;
}

// ── ID mapping: localId ↔ serverId ────────────────────────────────────────

/** Store mapping of local ID → server ID */
const SERVER_ID_MAP_KEY = 'booktracker_server_id_map';

function getServerIdMap(): Record<number, number> {
  try {
    const raw = localStorage.getItem(SERVER_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setServerIdMap(map: Record<number, number>): void {
  localStorage.setItem(SERVER_ID_MAP_KEY, JSON.stringify(map));
}

function getLocalIdForServer(serverId: number): number | undefined {
  const map = getServerIdMap();
  return Number(Object.entries(map).find(([, sid]) => sid === serverId)?.[0]);
}

function setLocalIdForServer(localId: number, serverId: number): void {
  const map = getServerIdMap();
  map[localId] = serverId;
  setServerIdMap(map);
}

function removeServerIdMapping(localId: number): void {
  const map = getServerIdMap();
  delete map[localId];
  setServerIdMap(map);
}

// ── Sync to server ─────────────────────────────────────────────────────────

/** Push all local books to server (for initial migration). */
export async function syncToServer(): Promise<void> {
  if (!isLoggedIn()) return;

  const localBooks = await db.books.toArray();
  const idMap = getServerIdMap();

  for (const book of localBooks) {
    if (book.id == null) continue;

    const serverId = idMap[book.id];
    if (serverId) {
      // Already migrated — update if local is newer
      try {
        const serverBook = await updateServerBook(serverId, {
          title: book.title,
          author: book.author,
          status: book.status,
          rating: book.rating,
          pages: book.pages,
          genre: book.genre,
          language: book.language,
          cover_url: book.cover_url,
          description: book.description,
          date_started: book.date_started,
          date_finished: book.date_finished,
          planned_date: book.planned_date,
          notes: book.notes,
          updated_at: book.updated_at,
        });
        // If server has newer updated_at, overwrite local
        if (new Date(serverBook.updated_at) > new Date(book.updated_at)) {
          await db.books.update(book.id, { ...serverBook, id: undefined });
        }
      } catch {
        // Skip on error — will retry later
      }
    } else {
      // New book — create on server
      try {
        const serverBook = await createServerBook({
          title: book.title,
          author: book.author,
          status: book.status,
          rating: book.rating,
          pages: book.pages,
          genre: book.genre,
          language: book.language,
          cover_url: book.cover_url,
          description: book.description,
          date_started: book.date_started,
          date_finished: book.date_finished,
          planned_date: book.planned_date,
          notes: book.notes,
        });
        setLocalIdForServer(book.id, serverBook.id);
      } catch {
        // Skip — will retry
      }
    }
  }
}

// ── Sync from server ───────────────────────────────────────────────────────

/** Pull server books to local IndexedDB. */
export async function syncFromServer(): Promise<void> {
  if (!isLoggedIn()) return;

  let serverBooks: ServerBook[];
  try {
    serverBooks = await fetchServerBooks();
  } catch (err) {
    throw new Error(`Server unreachable: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  const idMap = getServerIdMap();
  // Build reverse map: serverId → localId
  const reverseMap: Record<number, number> = {};
  for (const [localId, serverId] of Object.entries(idMap)) {
    reverseMap[serverId] = Number(localId);
  }

  const now = new Date().toISOString();

  for (const sb of serverBooks) {
    const existingLocalId = reverseMap[sb.id];

    if (existingLocalId != null) {
      // Book exists locally — check for conflict
      const local = await db.books.get(existingLocalId);
      if (local) {
        const localTime = new Date(local.updated_at).getTime();
        const serverTime = new Date(sb.updated_at).getTime();
        if (serverTime > localTime) {
          // Server wins — update local
          const { id: _id, ...rest } = sb;
          void _id;
          await db.books.update(existingLocalId, { ...rest });
        }
        // else local wins — skip (already handled by syncToServer)
      }
    } else {
      // New book from server — add to local
      const { id: _sid, ...bookData } = sb;
      void _sid;
      const newId = await db.books.add({ ...bookData, updated_at: now } as Book);
      setLocalIdForServer(newId, sb.id);
    }
  }
}

// ── Full sync ──────────────────────────────────────────────────────────────

export async function fullSync(): Promise<void> {
  if (!isLoggedIn()) return;

  _notify({ state: 'syncing', errorMessage: null });

  try {
    // Step 1: Push all local → server
    await syncToServer();

    // Step 2: Pull server → local
    await syncFromServer();

    _notify({ state: 'idle', lastSyncedAt: Date.now(), errorMessage: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    _notify({ state: 'error', errorMessage: msg });
    // Don't throw — app should keep working offline
  }
}

// ── Delete sync ─────────────────────────────────────────────────────────────

/** Called when a book is deleted locally — delete from server too. */
export async function syncDeleteToServer(localId: number): Promise<void> {
  if (!isLoggedIn()) return;
  const serverId = getServerIdMap()[localId];
  if (!serverId) return;
  try {
    await deleteServerBook(serverId);
    removeServerIdMapping(localId);
  } catch {
    // Best effort — server may already be gone
  }
}

// ── Auto-sync ─────────────────────────────────────────────────────────────

const _debouncedSync = debounce(async () => { await fullSync(); }, 2000);

/** Call this after any local CRUD to trigger a debounced sync. */
export function onBookChange(): void {
  if (!isLoggedIn()) return;
  _debouncedSync();
}

/** Start periodic pull from server. */
export function startAutoSync(intervalMs: number = 60_000): void {
  stopAutoSync();
  _autoSyncTimer = setInterval(() => {
    if (isLoggedIn()) {
      void syncFromServer();
    }
  }, intervalMs);
}

export function stopAutoSync(): void {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = null;
  }
}
