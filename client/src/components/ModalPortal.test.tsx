import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ModalPortal from './ModalPortal';

afterEach(cleanup);

test('touches and clicks in a modal do not reach the page behind it', () => {
  const parent = { onClick: vi.fn(), onTouchStart: vi.fn(), onTouchMove: vi.fn(), onTouchEnd: vi.fn() };
  const inner = vi.fn();
  render(<div {...parent}><ModalPortal><button onClick={inner}>inside</button></ModalPortal></div>);
  const button = screen.getByRole('button', { name: 'inside' });
  fireEvent.touchStart(button);
  fireEvent.touchMove(button);
  fireEvent.touchEnd(button);
  fireEvent.click(button);
  expect(inner).toHaveBeenCalled();
  for (const handler of Object.values(parent)) expect(handler).not.toHaveBeenCalled();
});
