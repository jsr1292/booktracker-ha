import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Book } from '../types';

vi.mock('../lib/db', () => ({ updateBook: vi.fn() }));

import BookList from './BookList';

afterEach(cleanup);

const book = (id: number, status: Book['status']): Book => ({
  id, title: `Book ${id}`, author: `Author ${id}`, status,
  created_at: '2026-10-30T00:00:00.000Z', updated_at: '2026-10-30T00:00:00.000Z',
});
const list = (books: Book[]) =>
  render(<BookList books={books} onDelete={vi.fn()} onOpenDetail={vi.fn()} />);

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

test('search matches title or author, ignoring case and accents', () => {
  const books = [{ ...book(1, 'finished'), title: 'Cien años de soledad', author: 'Gabriel García Márquez' }, { ...book(2, 'finished'), title: 'Dune', author: 'Frank Herbert' }];
  list(books);
  fireEvent.change(screen.getByPlaceholderText('Search title or author'), { target: { value: 'garcia' } });
  expect(screen.getByText('Cien años de soledad')).toBeTruthy();
  expect(screen.queryByText('Dune')).toBeNull();
  expect(screen.getByText(/1 of 2/)).toBeTruthy();
});

test('status tabs narrow the list and show one flat list', () => {
  list([book(1, 'reading'), book(2, 'planned'), book(3, 'finished')]);
  fireEvent.click(screen.getByRole('button', { name: /^Planned/ }));
  expect(screen.getByText('Book 2')).toBeTruthy();
  expect(screen.queryByText('Book 1')).toBeNull();
  expect(screen.queryByText('Book 3')).toBeNull();
});

test('author and genre filters are single controls, not one chip per value', () => {
  const books = Array.from({ length: 40 }, (_, i) => ({ ...book(i + 1, 'finished'), genre: `Genre ${i}` }));
  list(books);
  fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Author 7' } });
  expect(screen.getByText('Book 7')).toBeTruthy();
  expect(screen.queryByText('Book 8')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Author 8' })).toBeNull();
});
