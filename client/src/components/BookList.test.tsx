import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Book } from '../types';

vi.mock('../lib/db', () => ({ updateBook: vi.fn() }));

import BookList from './BookList';

afterEach(cleanup);

const book = (id: number, status: Book['status']): Book => ({
  id, title: `Book ${id}`, author: `Author ${id}`, status,
  created_at: '2026-10-30T00:00:00.000Z', updated_at: '2026-10-30T00:00:00.000Z',
});
const list = (books: Book[]) =>
  render(<BookList books={books} onEdit={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onOpenDetail={vi.fn()} />);

test('the total counts pinned reading and planned books', () => {
  list([book(1, 'reading'), book(2, 'planned'), book(3, 'finished')]);
  expect(screen.getByText(/3 total/)).toBeTruthy();
});

test('a library of only reading and planned books is not called empty', () => {
  list([book(1, 'reading'), book(2, 'planned')]);
  expect(screen.queryByText('No books found')).toBeNull();
  expect(screen.queryByText('No books match your filters')).toBeNull();
});

test('each book appears once in the all view', () => {
  list([book(1, 'reading'), book(2, 'planned'), book(3, 'finished')]);
  for (const title of ['Book 1', 'Book 2', 'Book 3']) expect(screen.getAllByText(title)).toHaveLength(1);
});
