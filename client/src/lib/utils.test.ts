import { expect, test } from 'vitest';
import { swipeRightAction } from './utils';

test.each([
  ['planned', 'Reading', 'reading'],
  ['reading', 'Finished', 'finished'],
  ['finished', 'Reading', 'reading'],
  ['abandoned', 'Reading', 'reading'],
] as const)('%s swipes right to %s', (status, label, nextStatus) => {
  expect(swipeRightAction(status)).toEqual({ label, status: nextStatus });
});
