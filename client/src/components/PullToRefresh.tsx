import React, { useRef, useState, useCallback } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  disabled?: boolean;
}

const PULL_THRESHOLD = 60;

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = PULL_THRESHOLD,
  disabled = false,
}: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only activate if at top
    if (disabled || isLoading) return;
    if (window.scrollY <= 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  }, [disabled, isLoading]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPullingRef.current || startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPullY(0);
      isPullingRef.current = false;
      return;
    }
    // Resist the pull slightly
    const resisted = delta * 0.5;
    const clamped = Math.min(resisted, threshold * 1.5);
    setPullY(clamped);
  }, [threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    if (pullY >= threshold && !isLoading) {
      setIsLoading(true);
      setPullY(0);
      triggerHaptic(5);
      try {
        await onRefresh();
      } finally {
        setIsLoading(false);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, threshold, isLoading, onRefresh]);

  const spinnerRotation = isLoading ? 'rotate(360deg)' : `rotate(${Math.min(pullY / threshold, 1) * 360}deg)`;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '100%' }}
    >
      {/* Pull indicator */}
      <div
        style={{
          height: pullY > 0 ? pullY : 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: isLoading ? 'height 0.2s' : pullY > 0 ? 'none' : 'height 0.3s ease-out',
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              paddingBottom: 8,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                animation: 'spin 0.8s linear infinite',
              }}
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="rgba(201,168,76,0.2)"
                strokeWidth="2"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="#c9a84c"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}>
              Refreshing...
            </span>
          </div>
        ) : pullY > threshold * 0.5 ? (
          <div style={{ paddingBottom: 8 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                transform: `rotate(${pullY > threshold ? 180 : 0}deg)`,
                transition: 'transform 0.2s ease',
              }}
            >
              <path
                d="M12 5v14M5 12l7 7 7-7"
                stroke="#c9a84c"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div style={{ height: 20 }} />
        )}
      </div>

      <div style={{ transform: pullY > 0 ? `translateY(${pullY}px)` : 'none', transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}

function triggerHaptic(pattern: number) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {}
}
