import React, { useRef, useCallback, useEffect } from 'react';

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
  // Use refs for all touch state to avoid stale closures
  const pullYRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const updateVisuals = useCallback(() => {
    const y = pullYRef.current;
    const loading = isLoadingRef.current;

    if (indicatorRef.current) {
      indicatorRef.current.style.height = (y > 0 || loading) ? `${loading ? 40 : y}px` : '0px';
      indicatorRef.current.style.transition = loading ? 'height 0.2s' : y > 0 ? 'none' : 'height 0.3s ease-out';

      // Update inner content based on state
      const spinnerEl = indicatorRef.current.querySelector('.ptr-spinner');
      const arrowEl = indicatorRef.current.querySelector('.ptr-arrow');
      
      if (spinnerEl) (spinnerEl as HTMLElement).style.display = loading ? 'flex' : 'none';
      if (arrowEl) {
        (arrowEl as HTMLElement).style.display = !loading && y > threshold * 0.5 ? 'flex' : 'none';
        const svg = (arrowEl as HTMLElement).querySelector('svg');
        if (svg) svg.style.transform = `rotate(${y > threshold ? 180 : 0}deg)`;
      }
    }

    if (contentRef.current) {
      contentRef.current.style.transform = y > 0 ? `translateY(${y}px)` : 'none';
    }
  }, [threshold]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isLoadingRef.current) return;
    if (window.scrollY <= 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPullingRef.current || startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      pullYRef.current = 0;
      isPullingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateVisuals);
      return;
    }
    // Rubber-band resistance: gets harder to pull the further you go
    const resisted = delta * 0.4 * (1 - Math.min(pullYRef.current / (threshold * 2), 0.6));
    pullYRef.current = Math.min(resisted + pullYRef.current * 0.3, threshold * 1.5);
    // Simpler: just use direct with damping
    pullYRef.current = Math.min(delta * 0.4, threshold * 1.5);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updateVisuals);
  }, [threshold, updateVisuals]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    const y = pullYRef.current;
    if (y >= threshold && !isLoadingRef.current) {
      isLoadingRef.current = true;
      pullYRef.current = 0;
      updateVisuals();
      triggerHaptic(5);
      try {
        await onRefresh();
      } finally {
        isLoadingRef.current = false;
        updateVisuals();
      }
    } else {
      pullYRef.current = 0;
      updateVisuals();
    }
  }, [threshold, onRefresh, updateVisuals]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '100%' }}
    >
      {/* Pull indicator */}
      <div
        ref={indicatorRef}
        style={{
          height: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'height 0.3s ease-out',
        }}
      >
        {/* Spinner (shown during loading) */}
        <div className="ptr-spinner" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="rgba(201,168,76,0.2)" strokeWidth="2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}>
            Refreshing...
          </span>
        </div>

        {/* Arrow (shown while pulling) */}
        <div className="ptr-arrow" style={{ display: 'none', paddingBottom: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform 0.2s ease' }}>
            <path d="M12 5v14M5 12l7 7 7-7" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div ref={contentRef} style={{ willChange: 'transform' }}>
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
