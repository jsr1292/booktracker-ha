import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const quagga = vi.hoisted(() => ({
  init: vi.fn((_config: unknown, cb: (err?: unknown) => void) => cb()),
  start: vi.fn(),
  stop: vi.fn(),
  onDetected: vi.fn(),
  offDetected: vi.fn(),
}));
vi.mock('@ericblade/quagga2', () => ({ default: quagga }));

import BarcodeScanner from './BarcodeScanner';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('manual entry replaces the camera view instead of inheriting its elements', () => {
  render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
  expect(document.body.innerHTML).toContain('animation:scan');
  fireEvent.click(screen.getByText('Enter ISBN manually'));
  expect(screen.getByPlaceholderText('Enter ISBN')).toBeTruthy();
  expect(document.body.innerHTML).not.toContain('animation:scan');
  expect(quagga.stop).toHaveBeenCalled();
});

test('going back restarts the camera in a fresh view', () => {
  render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Enter ISBN manually'));
  fireEvent.click(screen.getByText('← Back'));
  expect(quagga.init).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('.scanner-preview')).toHaveLength(1);
});

test('an error view does not inherit camera elements', () => {
  quagga.init.mockImplementationOnce((_config: unknown, cb: (err?: unknown) => void) => cb(new DOMException('denied', 'NotAllowedError')));
  render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText(/Camera permission denied/)).toBeTruthy();
  expect(document.body.innerHTML).not.toContain('animation:scan');
});
