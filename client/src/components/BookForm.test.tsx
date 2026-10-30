import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
