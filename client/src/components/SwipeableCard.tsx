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

const SWIPE_THRESHOLD = 40;
const AUTO_SWIPE_THRESHOLD = 100;

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Delete',
  rightLabel = 'Done',
  leftColor = '#ff4d6a',
  rightColor = '#00e5a0',
  threshold = SWIPE_THRESHOLD,
  autoThreshold = AUTO_SWIPE_THRESHOLD,
}: SwipeableCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isTapRef = useRef(true);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isTapRef.current = true;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const deltaX = e.touches[0].clientX - startXRef.current;
    const startY = startYRef.current ?? 0;
    const deltaY = e.touches[0].clientY - startY;

    // If vertical movement > horizontal, don't swipe
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      isTapRef.current = false;
      setIsDragging(false);
      setOffsetX(0);
      return;
    }

    // Mark as swipe if moved enough
    if (Math.abs(deltaX) > 10) {
      isTapRef.current = false;
    }

    // Limit swipe range
    const clamped = Math.max(-180, Math.min(180, deltaX));
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (offsetX < -autoThreshold && onSwipeLeft) {
      // Auto-complete left swipe
      setOffsetX(-300);
      triggerHaptic();
      setTimeout(() => {
        onSwipeLeft();
        setOffsetX(0);
      }, 200);
    } else if (offsetX > autoThreshold && onSwipeRight) {
      // Auto-complete right swipe
      setOffsetX(300);
      triggerHaptic();
      setTimeout(() => {
        onSwipeRight();
        setOffsetX(0);
      }, 200);
    } else {
      // Snap back
      setOffsetX(0);
    }
    startXRef.current = null;
    startYRef.current = null;
  }, [offsetX, onSwipeLeft, onSwipeRight, autoThreshold]);

  // Close on outside click
  useEffect(() => {
    if (offsetX === 0) return;
    const handler = () => {
      setOffsetX(0);
    };
    // Use a small delay to not capture the current gesture's up event
    const id = setTimeout(() => {
      document.addEventListener('click', handler, { once: true });
    }, 100);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [offsetX]);

  const leftVisible = offsetX < 0;
  const rightVisible = offsetX > 0;
  const leftWidth = Math.abs(Math.min(0, offsetX));
  const rightWidth = Math.max(0, offsetX);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
      {/* Left action (revealed on swipe left) */}
      {onSwipeLeft && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: leftWidth,
            background: leftColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            opacity: leftVisible ? 1 : 0,
            transition: isDragging ? 'none' : 'opacity 0.2s',
            overflow: 'hidden',
          }}
        >
          <span style={{
            fontSize: 10,
            color: '#fff',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '0 12px',
          }}>
            {leftLabel}
          </span>
        </div>
      )}

      {/* Right action (revealed on swipe right) */}
      {onSwipeRight && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: rightWidth,
            background: rightColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            opacity: rightVisible ? 1 : 0,
            transition: isDragging ? 'none' : 'opacity 0.2s',
            overflow: 'hidden',
          }}
        >
          <span style={{
            fontSize: 10,
            color: '#fff',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '0 12px',
          }}>
            {rightLabel}
          </span>
        </div>
      )}

      {/* Card itself */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          background: '#0d1421',
          borderRadius: 8,
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  } catch {}
}
