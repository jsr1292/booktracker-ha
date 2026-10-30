import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Renders a modal on document.body. Pages sit inside transformed containers (slide
 * animation, pull to refresh), which would make position: fixed relative to them and
 * trap the modal under the nav. React still bubbles portal events to the tree that
 * rendered it, so touches and clicks stop here instead of reaching the page behind.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div onClick={stop} onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop}>{children}</div>,
    document.body,
  );
}
