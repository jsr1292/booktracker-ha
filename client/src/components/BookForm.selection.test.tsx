import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as openLibrary from '../lib/openLibrary';

vi.mock('./TitleSearch', () => ({
  useBookSearch: () => ({ suggestions: [], searching: false, error: false, searched: false, search: vi.fn() }),
  TitleSearch: ({ value, onChange, onSelect }: { value: string; onChange: (v: string) => void; onSelect: (b: unknown) => void }) => (
    <>
      <input aria-label="title" value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => onSelect({ key: '/works/OL1W', title: 'First', author: 'Writer', pages: null, genre: null, coverUrl: null, isbn: null, description: null, language: null })}>pick</button>
    </>
  ),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('details for a picked book do not land on a title typed afterwards', async () => {
  let resolve!: (v: openLibrary.OLWorkDetails) => void;
  vi.spyOn(openLibrary, 'fetchWorkDetails').mockImplementation(() => new Promise(r => { resolve = r; }));
  const { default: BookForm } = await import('./BookForm');
  render(<BookForm onSave={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'pick' }));
  fireEvent.change(screen.getByLabelText('title'), { target: { value: 'A different book' } });
  await act(async () => { resolve({ genre: 'Fantasy', description: 'Wrong book' }); });
  expect((screen.getByPlaceholderText('e.g. Fiction, Science') as HTMLInputElement).value).toBe('');
});
