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
