import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('./AnimatedCounter', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));
import Dashboard from './Dashboard';

afterEach(cleanup);
const props = { stats: null, books: [], onAddBook: vi.fn(), onBookClick: vi.fn(), onNavigate: vi.fn() };

test('shows custom goal, validates edits, and saves a new goal', async () => {
  const onSaveGoal = vi.fn().mockResolvedValue(undefined);
  render(<Dashboard {...props} readingGoal={30} onSaveGoal={onSaveGoal} />);
  fireEvent.click(screen.getByRole('button', { name: /Goal: read 30 books this year/ }));
  const input = screen.getByLabelText('Yearly reading goal');
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
  expect(onSaveGoal).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
  await waitFor(() => expect(onSaveGoal).toHaveBeenCalledWith(42));
});

test('View charts opens Analytics', async () => {
  render(<Dashboard {...props} stats={{ total_pages: 0, achievements: [] } as any} />);
  const button = screen.getByRole('button', { name: 'View charts →' });
  expect(button.getAttribute('style')).toContain('min-height: 44px');
  fireEvent.click(button);
  expect(await screen.findByText('Analytics')).toBeTruthy();
});

test('modals render at page level, so a transformed page container cannot trap them', async () => {
  const { container } = render(<Dashboard {...props} stats={{ total_pages: 0, achievements: [] } as any} readingGoal={30} onSaveGoal={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'View charts →' }));
  await waitFor(() => expect(document.querySelector('.modal-box')).toBeTruthy());
  expect(container.querySelector('.modal-box')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: /Goal: read 30/ }));
  expect(document.querySelector('.modal-box')).toBeTruthy();
  expect(container.querySelector('.modal-box')).toBeNull();
});
