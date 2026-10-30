import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../api/bookLookup', () => ({ searchBooks: vi.fn() }));
import { searchBooks } from '../api/bookLookup';
import { TitleSearch, useBookSearch } from './TitleSearch';

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function Harness() {
  const [value, setValue] = useState('');
  const { suggestions, searching, error, searched, search } = useBookSearch();
  return <TitleSearch value={value} onChange={setValue} onSelect={vi.fn()} suggestions={suggestions} searching={searching} error={error} searched={searched} onSearch={search} />;
}

test('newer search and cleared input win over older responses', async () => {
  let resolveOld!: (value: any[]) => void;
  vi.mocked(searchBooks).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce([{ title: 'New Book', author: 'Writer', key: '/works/OL2W', pages: null, genre: null, coverUrl: null, isbn: null, language: null, description: null }]);
  render(<Harness />);
  const input = screen.getByPlaceholderText('Start typing a book title...');
  fireEvent.change(input, { target: { value: 'older' } });
  await waitFor(() => expect(searchBooks).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'newer' } });
  expect(await screen.findByText('New Book')).toBeTruthy();
  resolveOld([{ title: 'Old Book', author: 'Writer', key: '/works/OL1W', pages: null, genre: null, coverUrl: null, isbn: null, language: null, description: null }]);
  await waitFor(() => expect(screen.queryByText('Old Book')).toBeNull());
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.queryByText('New Book')).toBeNull();
});

test('shows the no matches message', async () => {
  vi.mocked(searchBooks).mockResolvedValue([]);
  render(<Harness />);
  fireEvent.change(screen.getByPlaceholderText('Start typing a book title...'), { target: { value: 'unknown' } });
  expect(await screen.findByText('No matches. You can enter the details yourself.')).toBeTruthy();
});

test('shows a network error message', async () => {
  vi.mocked(searchBooks).mockRejectedValue(new Error('offline'));
  render(<Harness />);
  fireEvent.change(screen.getByPlaceholderText('Start typing a book title...'), { target: { value: 'unknown' } });
  expect(await screen.findByText("Couldn't reach Open Library. You can enter the details yourself.")).toBeTruthy();
});
