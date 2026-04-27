import { useState, lazy, Suspense } from 'react';
import type { Book, Stats } from '../types';
import StatDetail from './StatDetail';

const Charts = lazy(() => import('./Charts'));

interface Props {
  stats: Stats | null;
  recentBooks: Book[];
  books: Book[];
  onAddBook: () => void;
}

export type StatKey = 'books' | 'pages' | 'avg_length' | 'streak' | 'pace' | 'rating';

// Default annual reading goal
const DEFAULT_GOAL = 12;

export default function Dashboard({ stats, recentBooks, books, onAddBook }: Props) {
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const currentYear = new Date().getFullYear();

  const currentlyReading = recentBooks.filter(b => b.status === 'reading');
  const finished = recentBooks.filter(b => b.status === 'finished');

  const yearFinished = books.filter(b => {
    if (b.status !== 'finished' || !b.date_finished) return false;
    return b.date_finished.startsWith(String(currentYear));
  });

  const goal = DEFAULT_GOAL;
  const goalProgress = Math.min(yearFinished.length / goal, 1);
  const goalPct = Math.round(goalProgress * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 8 }}>

      {/* ── HERO: Year + count + goal ── */}
      <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#8096b4', textTransform: 'uppercase', marginBottom: 8 }}>{currentYear}</div>
        <div style={{ fontSize: 'clamp(40px, 12vw, 72px)', fontWeight: 700, color: '#c9a84c', fontFamily: "'Libre Baskerville', Georgia, serif", lineHeight: 1, letterSpacing: '-0.02em' }}>
          {yearFinished.length}
        </div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 6, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {yearFinished.length === 1 ? 'book finished' : 'books finished'}
        </div>

        {/* Annual reading goal */}
        {yearFinished.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 260, margin: '0 auto' }}>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${goalPct}%`,
                  background: goalPct >= 100 ? '#00e5a0' : 'linear-gradient(90deg, #c9a84c, #e8c96a)',
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                  boxShadow: goalPct >= 100 ? '0 0 8px rgba(0,229,160,0.5)' : '0 0 6px rgba(201,168,76,0.4)',
                }} />
              </div>
              <span style={{ fontSize: 10, color: goalPct >= 100 ? '#00e5a0' : '#8096b4', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                {goalPct >= 100 ? '✓ Goal!' : `${yearFinished.length}/${goal}`}
              </span>
            </div>
            <div style={{ fontSize: 9, color: '#6a7a8a', marginTop: 6, letterSpacing: '0.1em' }}>
              {goalPct >= 100 ? 'Reading goal achieved! 🎉' : `${goal - yearFinished.length} more to hit ${goal}`}
            </div>
          </div>
        )}

        {yearFinished.length === 0 && (
          <div style={{ marginTop: 16, fontSize: 10, color: '#6a7a8a' }}>
            Set a goal: read {goal} books this year
          </div>
        )}
      </div>

      {/* ── Quick stats row ── */}
      {stats && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', background: 'rgba(13,17,32,0.4)' }}>
          {[
            { label: 'Total pages', value: stats.total_pages.toLocaleString(), stat: 'pages' as StatKey },
            { label: 'Avg rating', value: stats.global_avg_rating ? `⭐ ${stats.global_avg_rating.toFixed(1)}` : '—', stat: 'rating' as StatKey },
            { label: 'Avg pace', value: stats.avg_days_to_finish ? `${stats.avg_days_to_finish}d` : '—', stat: 'pace' as StatKey },
            { label: 'Streak', value: `${stats.current_streak ?? 0}mo`, stat: 'streak' as StatKey },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={() => setSelectedStat(item.stat)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                padding: '10px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
              <span style={{ fontSize: 9, color: '#8096b4', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Currently reading ── */}
      {currentlyReading.length > 0 && (
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>Reading</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentlyReading.map((book) => (
              <div key={book.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 22 }}>📖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                  <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{book.author}</div>
                </div>
                {book.date_started && (
                  <span style={{ fontSize: 10, color: '#6a7a8a', flexShrink: 0 }}>
                    {new Date(book.date_started + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Finished books ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Finished</span>
          {finished.length > 3 && (
            <button
              onClick={() => setShowCharts(true)}
              style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}
            >
              See all →
            </button>
          )}
        </div>

        {finished.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#8096b4', fontSize: 12 }}>
            No finished books yet. Start reading!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {finished.slice(0, 5).map((book) => (
              <div key={book.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 20 }}>📕</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                  <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{book.author}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  {book.rating && (
                    <span style={{ fontSize: 10, color: '#c9a84c', letterSpacing: 1 }}>{'★'.repeat(book.rating)}</span>
                  )}
                  {book.pages && (
                    <span style={{ fontSize: 10, color: '#6a7a8a' }}>{book.pages}p</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Achievements row ── */}
      {stats && stats.achievements.length > 0 && (
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>Achievements</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.achievements.map(a => {
              const pct = a.target > 0 ? Math.min(a.progress / a.target, 1) : 0;
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: a.unlocked ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${a.unlocked ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{a.unlocked ? '🏆' : '🔒'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: a.unlocked ? '#d4dce8' : '#6a7a8a', fontWeight: 600 }}>{a.name}</span>
                      {!a.unlocked && (
                        <span style={{ fontSize: 9, color: '#8096b4', fontFamily: "'JetBrains Mono', monospace" }}>
                          {a.progress}/{a.target}
                        </span>
                      )}
                    </div>
                    {!a.unlocked && (
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct * 100}%`, background: '#c9a84c', borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add button ── */}
      <div style={{ paddingTop: 4 }}>
        <button onClick={onAddBook} className="btn-gold" style={{ width: '100%', padding: '12px', fontSize: 10 }}>
          + Add book
        </button>
      </div>

      {/* ── Stat Detail Modal ── */}
      {selectedStat && (
        <StatDetail
          stat={selectedStat}
          books={books}
          onClose={() => setSelectedStat(null)}
        />
      )}

      {/* ── Charts Modal ── */}
      {showCharts && stats && (
        <div className="modal-overlay" onClick={() => setShowCharts(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: '#d4dce8' }}>Analytics</span>
              <button onClick={() => setShowCharts(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8096b4', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 16 }}>
              <Suspense fallback={<div style={{ textAlign: 'center', padding: 24, color: '#8096b4', fontSize: 11 }}>Loading charts...</div>}>
                <Charts stats={stats} books={books} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
