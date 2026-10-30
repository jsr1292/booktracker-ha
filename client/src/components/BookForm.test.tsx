import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('../api/bookLookup', () => ({ lookupISBN: lookup }));

vi.mock('./TitleSearch', () => ({
  useBookSearch: () => ({ suggestions: [], searching: false, search: vi.fn() }),
  TitleSearch: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <input value={value} onChange={e => onChange(e.target.value)} />,
}));

import BookForm from './BookForm';

afterEach(cleanup);

const initialData = { title: 'Book', author: 'Writer' };

test('double submit saves once while the promise is pending', async () => {
  let finish!: () => void;
  const onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<BookForm initialData={initialData} onSave={onSave} onCancel={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Add Book' });
  fireEvent.click(button);
  fireEvent.submit(button.closest('form')!);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(button.hasAttribute('disabled')).toBe(true);
  finish();
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
});

test('failed save shows its message and enables another try', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('Server unavailable'));
  render(<BookForm initialData={initialData} onSave={onSave} onCancel={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Add Book' });
  fireEvent.click(button);
  await screen.findByText('Server unavailable');
  expect(button.hasAttribute('disabled')).toBe(false);
});

test('shows a scan notice', () => {
  render(<BookForm onSave={vi.fn()} onCancel={vi.fn()} notice="ISBN 123 wasn't found. Enter the details below." />);
  expect(screen.getByText("ISBN 123 wasn't found. Enter the details below.")).toBeTruthy();
});

test('Fill from ISBN keeps a typed title and reports missing editions', async () => {
  lookup.mockResolvedValueOnce({ key: '/works/OL2W', title: 'Lookup title', author: 'Other', pages: 250, coverUrl: 'https://example.com/cover.jpg', language: 'English', genre: 'Fiction', description: 'Description', isbn: '9780306406157' });
  lookup.mockResolvedValueOnce(null);
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<BookForm initialData={initialData} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /More options/ }));
  fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: '9780306406157' } });
  fireEvent.click(screen.getByRole('button', { name: 'Fill from ISBN' }));
  await waitFor(() => expect(screen.getByLabelText('Pages')).toHaveProperty('value', '250'));
  fireEvent.click(screen.getByRole('button', { name: 'Add Book' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Book', isbn: '9780306406157', openlibrary_key: '/works/OL2W', pages: 250 })));
  fireEvent.click(screen.getByRole('button', { name: 'Fill from ISBN' }));
  expect(await screen.findByText(/ISBN not found/)).toBeTruthy();
});

test('Fill from ISBN refuses something that is not an ISBN', async () => {
  render(<BookForm onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByText(/More options/));
  fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Fill from ISBN' }));
  await screen.findByText('Enter a 10 or 13 digit ISBN');
});
