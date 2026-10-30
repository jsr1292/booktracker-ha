import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { pickGenre, pickLanguage, isSupplementaryTitle } from './openLibrary';
import * as openLibrary from './openLibrary';

vi.mock('../components/TitleSearch', () => ({
  useBookSearch: () => ({ suggestions: [], searching: false, error: false, searched: false, search: vi.fn() }),
  TitleSearch: ({ onSelect }: { onSelect: (book: any) => void }) => createElement('div', null,
    createElement('button', { type: 'button', onClick: () => onSelect({ key: '/works/OL1W', title: 'First', author: 'Writer', pages: null, genre: null, coverUrl: null, description: null, language: null, isbn: null }) }, 'First choice'),
    createElement('button', { type: 'button', onClick: () => onSelect({ key: '/works/OL2W', title: 'Second', author: 'Writer', pages: null, genre: null, coverUrl: null, description: null, language: null, isbn: null }) }, 'Second choice')),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('genre picks the most specific exact subject', () => {
  expect(pickGenre(['Dune (Imaginary place)', 'Fiction', 'Fiction, science fiction, general', 'Science fiction', 'American literature'])).toBe('Science Fiction');
  expect(pickGenre(['Spanish language books', 'Fiction', 'magic realism', 'Novela'])).toBe('Fiction');
  expect(pickGenre(['Romance literature', 'Terrorism', 'Fiction', 'Families'])).toBe('Fiction');
  expect(pickGenre(['Detective and mystery stories'])).toBe('Mystery');
  expect(pickGenre(['Science-fiction'])).toBe('Science Fiction');
  expect(pickGenre(['Romance literature'])).toBeNull();
});

test('language uses a single edition or title clues, otherwise stays blank', () => {
  expect(pickLanguage(['spa'], 'Dune')).toBe('Spanish');
  expect(pickLanguage(['eng', 'spa'], 'Cien años de soledad')).toBe('Spanish');
  expect(pickLanguage(['eng', 'spa'], 'The House of Spirits')).toBe('English');
  expect(pickLanguage(['pol', 'eng'], 'Sapiens')).toBeNull();
});

test('title filter matches whole words', () => {
  expect(isSupplementaryTitle('Book Review')).toBe(true);
  expect(isSupplementaryTitle('Psychoanalysis')).toBe(false);
});

test('old work details cannot replace a newer selection or edited genre', async () => {
  let resolveFirst!: (value: openLibrary.OLWorkDetails) => void;
  let resolveSecond!: (value: openLibrary.OLWorkDetails) => void;
  vi.spyOn(openLibrary, 'fetchWorkDetails').mockImplementation(key => new Promise(resolve => {
    if (key === '/works/OL1W') resolveFirst = resolve;
    else resolveSecond = resolve;
  }));
  const { default: BookForm } = await import('../components/BookForm');
  render(createElement(BookForm, { onSave: vi.fn().mockResolvedValue(undefined), onCancel: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'First choice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Second choice' }));
  fireEvent.change(screen.getByPlaceholderText('e.g. Fiction, Science'), { target: { value: 'My genre' } });
  await act(async () => { resolveSecond({ genre: 'Fantasy', description: 'Second description' }); });
  expect((screen.getByPlaceholderText('e.g. Fiction, Science') as HTMLInputElement).value).toBe('My genre');
  await act(async () => { resolveFirst({ genre: 'History', description: 'First description' }); });
  expect((screen.getByPlaceholderText('e.g. Fiction, Science') as HTMLInputElement).value).toBe('My genre');
});

test('one stray genre tag does not outrank Fiction, but repeated tags do', () => {
  // Shapes from real Open Library works, 2026-10-30.
  expect(pickGenre(['Fiction', 'Fantasy', 'Magic realism'])).toBe('Fiction'); // Cien años de soledad
  expect(pickGenre(['Fiction', 'History', 'Philosophy', 'Biography'])).toBe('Fiction'); // Don Quijote
  expect(pickGenre(['Fantasy', 'Fantasy fiction', 'Fiction'])).toBe('Fantasy'); // The Hobbit
  expect(pickGenre(['Biography', 'Autobiography', 'History'])).toBe('Biography'); // Steve Jobs
  expect(pickGenre(['History', 'Science'])).toBe('History'); // Sapiens: no Fiction tag, so best single match
});
