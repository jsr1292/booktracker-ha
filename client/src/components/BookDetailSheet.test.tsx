import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Book } from '../types';

vi.mock('../lib/openLibrary', () => ({ fetchAuthorWorks: vi.fn(), fetchWorkRatings: vi.fn(), resolveAuthorKey: vi.fn().mockResolvedValue(null), getCoverUrl: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptics: {} }));
import BookDetailSheet from './BookDetailSheet';

afterEach(cleanup);
const book = (current_page: number | null, pages: number | null = 100): Book => ({
  id: 1, title: 'Progress', author: 'Writer', status: 'reading', pages, current_page,
  created_at: '', updated_at: '',
});
const props = { onEdit: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };

test('reading progress saves and shows the new page, with finish action at the end', async () => {
  const onSaveProgress = vi.fn().mockResolvedValue(book(100));
  const onMarkFinished = vi.fn();
  const { rerender } = render(<BookDetailSheet book={book(20)} {...props} onSaveProgress={onSaveProgress} onMarkFinished={onMarkFinished} />);
  expect(screen.getByText('p. 20 / 100')).toBeTruthy();
  expect(screen.queryByText('Mark as finished')).toBeNull();
  fireEvent.change(screen.getByLabelText('Current page'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
  await waitFor(() => expect(onSaveProgress).toHaveBeenCalledWith(100));
  rerender(<BookDetailSheet book={book(100)} {...props} onSaveProgress={onSaveProgress} onMarkFinished={onMarkFinished} />);
  expect(screen.getByText('p. 100 / 100')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mark as finished' })).toBeTruthy();
});

test('unknown progress shows no invented estimate', () => {
  render(<BookDetailSheet book={book(null)} {...props} onSaveProgress={vi.fn()} />);
  expect(screen.queryByText(/p\. .* \/ 100/)).toBeNull();
});

test('a failed Mark as finished shows why', async () => {
  const book = { id: 1, title: 'B', status: 'reading', pages: 10, current_page: 10, created_at: '', updated_at: '' } as Book;
  render(<BookDetailSheet book={book} onEdit={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} onSaveProgress={vi.fn()} onMarkFinished={vi.fn().mockRejectedValue(new Error('Server down'))} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark as finished' }));
  await screen.findByText('Server down');
});
