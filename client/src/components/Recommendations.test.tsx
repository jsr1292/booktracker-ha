import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/db', () => ({ getBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('../lib/openLibrary', () => ({
  fetchWorkDetails: vi.fn().mockResolvedValue({ genre: 'Fantasy', description: 'A description' }),
  fetchTrending: vi.fn().mockResolvedValue([]),
  fetchSubject: vi.fn().mockResolvedValue({ works: [] }),
  searchOpenLibrary: vi.fn().mockResolvedValue([{ key: '/works/OL1W', title: 'A Unique Result', author: 'Writer', coverUrl: null, pages: null, genre: null, rating: null, description: null, year: null, language: null }]),
  searchByGenre: vi.fn().mockResolvedValue([]),
  searchByAuthor: vi.fn().mockResolvedValue([]),
}));

import Recommendations from './Recommendations';
import { fetchWorkDetails } from '../lib/openLibrary';

afterEach(cleanup);

async function search() {
  fireEvent.change(screen.getByPlaceholderText('Search any book or author...'), { target: { value: 'unique' } });
  await screen.findByText('A Unique Result');
}

test('heart quick adds a planned book once with work details', async () => {
  const onQuickAdd = vi.fn().mockResolvedValue(undefined);
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={onQuickAdd} />);
  await search();
  fireEvent.click(screen.getByRole('button', { name: /Add A Unique Result to library/ }));
  await waitFor(() => expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned', openlibrary_key: '/works/OL1W', genre: 'Fantasy', description: 'A description' })));
  expect(await screen.findByRole('button', { name: /A Unique Result already in library/ })).toBeTruthy();
});

test('matching title and author fills the heart and prevents adding', async () => {
  const onQuickAdd = vi.fn();
  render(<Recommendations books={[{ id: 1, title: ' a unique result ', author: 'WRITER' } as any]} onAddBook={vi.fn()} onQuickAdd={onQuickAdd} />);
  await search();
  fireEvent.click(screen.getByRole('button', { name: /already in library/ }));
  expect(onQuickAdd).not.toHaveBeenCalled();
});

test('double tap creates one book even while details are pending', async () => {
  const onQuickAdd = vi.fn().mockResolvedValue(undefined);
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={onQuickAdd} />);
  await search();
  const heart = screen.getByRole('button', { name: /Add A Unique Result to library/ });
  fireEvent.click(heart);
  fireEvent.click(heart);
  await waitFor(() => expect(onQuickAdd).toHaveBeenCalledTimes(1));
});

test('details failure still adds the book', async () => {
  vi.mocked(fetchWorkDetails).mockRejectedValueOnce(new Error('details unavailable'));
  const onQuickAdd = vi.fn().mockResolvedValue(undefined);
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={onQuickAdd} />);
  await search();
  fireEvent.click(screen.getByRole('button', { name: /Add A Unique Result to library/ }));
  expect(await screen.findByRole('button', { name: /A Unique Result already in library/ })).toBeTruthy();
  expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned', openlibrary_key: '/works/OL1W' }));
});

test('add failure leaves heart empty with an error', async () => {
  const onQuickAdd = vi.fn().mockRejectedValueOnce(new Error('Save failed'));
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={onQuickAdd} />);
  await search();
  fireEvent.click(screen.getByRole('button', { name: /Add A Unique Result to library/ }));
  expect(await screen.findByText('Save failed')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Add A Unique Result to library/ })).toBeTruthy();
  expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned', openlibrary_key: '/works/OL1W' }));
});

test('search results appear on the active Trending tab', async () => {
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('Search any book or author...'), { target: { value: 'unique' } });
  expect(await screen.findByText('A Unique Result')).toBeTruthy();
});

test('Discover form add carries the work key', async () => {
  const onAddBook = vi.fn();
  render(<Recommendations books={[]} onAddBook={onAddBook} onQuickAdd={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('Search any book or author...'), { target: { value: 'unique' } });
  await screen.findByText('A Unique Result');
  fireEvent.click(screen.getByText('A Unique Result'));
  fireEvent.click(screen.getByRole('button', { name: /Add to Library/ }));
  expect(onAddBook).toHaveBeenCalledWith(expect.objectContaining({ openlibrary_key: '/works/OL1W' }));
});

test('the old wishlist key is cleared', () => {
  const removeItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem });
  render(<Recommendations books={[]} onAddBook={vi.fn()} onQuickAdd={vi.fn()} />);
  expect(removeItem).toHaveBeenCalledWith('wishlist');
  vi.unstubAllGlobals();
});
