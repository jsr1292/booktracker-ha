import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Charts from './Charts';

afterEach(cleanup);
const stats = { genre_distribution: [] } as any;
const book = (date: string, rating: number) => ({ status: 'finished', date_finished: date, rating, title: 'A', author: 'B' }) as any;

test('only the current month bar is highlighted', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  const { container } = render(<Charts stats={stats} books={[book('2026-09-03', 1), book('2026-10-04', 2)]} />);
  const monthly = screen.getByText('Monthly Pace').closest('.glass-card')!;
  const bars = monthly.querySelectorAll('[data-bar]') as NodeListOf<HTMLElement>;
  expect(bars).toHaveLength(2);
  expect(bars[0].style.background).not.toBe(bars[1].style.background);
  expect(bars[1].style.background).toBe('var(--gold)');
  expect(container).toBeTruthy();
  vi.useRealTimers();
});

test('equal rating counts retain distinct bucket labels', () => {
  render(<Charts stats={stats} books={[book('2026-10-01', 1), book('2026-10-02', 2)]} />);
  const rating = screen.getByText('Rating Distribution').closest('.glass-card')!;
  expect([...rating.querySelectorAll('[data-label]')].map(node => node.textContent)).toEqual(['★', '★★', '★★★', '★★★★', '★★★★★']);
});

test('labels are real text, not stretched with the SVG', () => {
  render(<Charts stats={{ genre_distribution: [{ genre: 'A very long genre name', count: 2 }] } as any} books={[book('2026-09-03', 1)]} />);
  expect(document.querySelector('svg text')).toBeNull();
  expect(screen.getByText('A very long genre name')).toBeTruthy();
  expect(screen.getByText('Sep')).toBeTruthy();
});
