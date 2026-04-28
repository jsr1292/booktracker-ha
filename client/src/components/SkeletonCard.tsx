import React from 'react';

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="skeleton skeleton-cover" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-author" />
          <div className="skeleton skeleton-meta" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="skeleton skeleton-stars" />
          <div style={{ display: 'flex', gap: 4 }}>
            <div className="skeleton skeleton-btn" />
            <div className="skeleton skeleton-btn" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)', padding: '10px 8px' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderRight: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none', padding: '0 8px' }}>
          <div className="skeleton" style={{ width: 48, height: 16, borderRadius: 3 }} />
          <div className="skeleton" style={{ width: 60, height: 10, borderRadius: 2 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <div className="skeleton" style={{ width: 60, height: 10, borderRadius: 2, margin: '0 auto 8px' }} />
      <div className="skeleton" style={{ width: 80, height: 48, borderRadius: 4, margin: '0 auto 4px' }} />
      <div className="skeleton" style={{ width: 100, height: 10, borderRadius: 2, margin: '0 auto' }} />
    </div>
  );
}
