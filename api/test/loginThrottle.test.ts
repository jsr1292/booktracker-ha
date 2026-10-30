import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginThrottle } from '../src/shared/loginThrottle.js';

function setup(maxEntries = 5000) {
  let time = 0;
  const throttle = createLoginThrottle({ maxFailures: 10, windowMs: 900000, maxEntries, now: () => time });
  return { ...throttle, advance: (ms: number) => { time += ms; } };
}

test('locks at ten failures, not before; successful login clears failures', () => {
  const throttle = setup();
  for (let i = 0; i < 9; i++) throttle.recordFailure('reader');
  assert.equal(throttle.isLocked('reader'), false);
  throttle.recordFailure('reader');
  assert.equal(throttle.isLocked('reader'), true);
  throttle.recordSuccess('reader');
  assert.equal(throttle.isLocked('reader'), false);
  throttle.recordFailure('reader');
  assert.equal(throttle.isLocked('reader'), false);
});

test('failures expire at the fixed window boundary', () => {
  const throttle = setup();
  for (let i = 0; i < 10; i++) throttle.recordFailure('reader');
  throttle.advance(899999);
  assert.equal(throttle.isLocked('reader'), true);
  throttle.advance(1);
  assert.equal(throttle.isLocked('reader'), false);
  throttle.recordFailure('reader');
  assert.equal(throttle.isLocked('reader'), false);
});

test('evicts oldest entries and expires stale entries before eviction', () => {
  const throttle = setup(2);
  for (let i = 0; i < 10; i++) throttle.recordFailure('oldest');
  throttle.advance(1);
  for (let i = 0; i < 10; i++) throttle.recordFailure('newer');
  throttle.recordFailure('third');
  assert.equal(throttle.isLocked('oldest'), false);
  assert.equal(throttle.isLocked('newer'), true);
  throttle.advance(900000);
  throttle.recordFailure('fourth');
  assert.equal(throttle.isLocked('newer'), false);
});

test('normalizes case and whitespace for failures, checks and success', () => {
  const throttle = setup();
  for (let i = 0; i < 10; i++) throttle.recordFailure(i % 2 ? ' Reader ' : 'READER');
  assert.equal(throttle.isLocked('reader'), true);
  throttle.recordSuccess(' READER ');
  assert.equal(throttle.isLocked('reader'), false);
});
