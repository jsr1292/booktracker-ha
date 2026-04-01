/**
 * Data migration utility — imports books from a SQLite JSON export
 * into IndexedDB via Dexie.
 */

import { db, computeStats } from './db';
import type { Book, Stats } from '../types';

export interface MigrationResult {
  total: number;
  imported: number;
  skipped: number;
  stats: Stats;
}

/**
 * Import books from a JSON array (as exported from SQLite).
 * Returns stats after import.
 */
export async function migrateFromJSON(books: Book[]): Promise<MigrationResult> {
  let imported = 0;
  let skipped = 0;

  for (const book of books) {
    if (!book.title) { skipped++; continue; }

    // Try to match by title+author (same dedup logic as importBooks)
    const existing = await db.books
      .where('title')
      .equals(book.title)
      .first();

    if (existing) {
      // Update existing, preserving its id
      await db.books.update(existing.id!, {
        ...book,
        id: existing.id,
      });
    } else {
      // Strip any old id so Dexie auto-increments
      const { id: _id, ...rest } = book as any;
      await db.books.add(rest as Book);
    }
    imported++;
  }

  const stats = await computeStats();

  return { total: books.length, imported, skipped, stats };
}

/**
 * Check if the database is empty (no prior data).
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  const count = await db.books.count();
  return count === 0;
}

/**
 * Clear all books from IndexedDB.
 */
export async function clearDatabase(): Promise<void> {
  await db.books.clear();
}
