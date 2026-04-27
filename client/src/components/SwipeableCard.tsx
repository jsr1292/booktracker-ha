import React, { useRef, useState, useCallback, useEffect } from 'react';

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
  threshold?: number;
  autoThreshold?: number;
}

const AUTO_SWIPE_THRESHOLD = 100;

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Delete',
  rightLabel = 'Done',
  leftColor = '#ff4d6a',
  rightColor = '#00e5a0',
  autoThreshold = AUTO_SWIPE_THRESHOLD,
}: SwipeableCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const offsetXRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const wasSwipeRef = useRef(false);
  const isSwipingRef = useRef(false);
  const directionLocked = useRef<'h' | 'v' | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    wasSwipeRef.current = false;
    directionLocked.current = null;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // Lock direction on first significant movement
    if (!directionLocked.current) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        directionLocked.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'h' : 'v';
      } else {
        return; // not enough movement yet
      }
    }

    // If vertical scroll, bail out entirely — let the browser handle it
    if (directionLocked.current === 'v') {
      if (offsetXRef.current !== 0) {
        offsetXRef.current = 0;
        setOffsetX(0);
      }
      setIsDragging(false);
      return;
    }

    // Horizontal swipe — prevent vertical scroll
    e.preventDefault();

    if (Math.abs(deltaX) > 10) {
      wasSwipeRef.current = true;
    }

    const clamped = Math.max(-180, Math.min(180, deltaX));
    offsetXRef.current = clamped;
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const currentOffset = offsetXRef.current;
    directionLocked.current = null;

    if (currentOffset < -autoThreshold && onSwipeLeft) {
      if (isSwipingRef.current) return;
      isSwipingRef.current = true;
      setOffsetX(-300);
      triggerHaptic();
      setTimeout(() => {
        offsetXRef.current = 0;
        setOffsetX(0);
        onSwipeLeft();
        isSwipingRef.current = false;
      }, 250);
    } else if (currentOffset > autoThreshold && onSwipeRight) {
      if (isSwipingRef.current) return;
      isSwipingRef.current = true;
      setOffsetX(300);
      triggerHaptic();
      setTimeout(() => {
        offsetXRef.current = 0;
        setOffsetX(0);
        onSwipeRight();
        isSwipingRef.current = false;
      }, 250);
    } else {
      offsetXRef.current = 0;
      setOffsetX(0);
    }
  }, [onSwipeLeft, onSwipeRight, autoThreshold]);

  // Capture click events after a swipe to prevent inner onClick
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const handleClick = (e: MouseEvent) => {
      if (wasSwipeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        wasSwipeRef.current = false;
      }
    };
    card.addEventListener('click', handleClick, true);
    return () => card.removeEventListener('click', handleClick, true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (offsetX === 0) return;
    const handler = () => { offsetXRef.current = 0; setOffsetX(0); };
    const id = setTimeout(() => document.addEventListener('click', handler, { once: true }), 100);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [offsetX]);

  const showLeft = offsetX < -5;
  const showRight = offsetX > 5;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
      {/* Left action backdrop — visible on RIGHT when card slides left */}
      {onSwipeLeft && (
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            right: 0,
            background: leftColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 16,
            opacity: showLeft ? 1 : 0,
            transition: isDragging ? 'none' : 'opacity 0.15s',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span style={{
            fontSize: 11,
            color: '#fff',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            {leftLabel}
          </span>
        </div>
      )}

      {/* Right action backdrop — visible on LEFT when card slides right */}
      {onSwipeRight && (
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            right: 0,
            background: rightColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 16,
            opacity: showRight ? 1 : 0,
            transition: isDragging ? 'none' : 'opacity 0.15s',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span style={{
            fontSize: 11,
            color: '#fff',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            {rightLabel}
          </span>
        </div>
      )}

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function triggerHaptic() {
  try { navigator?.vibrate?.(10); } catch {}
}
