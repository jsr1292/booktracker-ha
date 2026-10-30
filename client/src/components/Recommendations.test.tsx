import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/db', () => ({ getBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('../lib/openLibrary', () => ({
  fetchTrending: vi.fn().mockResolvedValue([]),
  fetchSubject: vi.fn().mockResolvedValue({ works: [] }),
  searchOpenLibrary: vi.fn().mockResolvedValue([{ key: '/works/OL1W', title: 'A Unique Result', author: 'Writer', coverUrl: null, pages: null, genre: null, rating: null, description: null, year: null, language: null }]),
  searchByGenre: vi.fn().mockResolvedValue([]),
  searchByAuthor: vi.fn().mockResolvedValue([]),
}));

import Recommendations from './Recommendations';

afterEach(cleanup);

test('search results appear on the active Trending tab', async () => {
  render(<Recommendations onAddBook={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('Search any book or author...'), { target: { value: 'unique' } });
  expect(await screen.findByText('A Unique Result')).toBeTruthy();
});

test('Discover form add carries the work key', async () => {
  const onAddBook = vi.fn();
  render(<Recommendations onAddBook={onAddBook} />);
  fireEvent.change(screen.getByPlaceholderText('Search any book or author...'), { target: { value: 'unique' } });
  await screen.findByText('A Unique Result');
  fireEvent.click(screen.getByText('A Unique Result'));
  fireEvent.click(screen.getByRole('button', { name: /Add to Library/ }));
  expect(onAddBook).toHaveBeenCalledWith(expect.objectContaining({ openlibrary_key: '/works/OL1W' }));
});
