import { useState, lazy, Suspense } from 'react';
import type { Book, Stats } from '../types';
import StatDetail from './StatDetail';
import AnimatedCounter from './AnimatedCounter';

const Charts = lazy(() => import('./Charts'));

interface Props {
  stats: Stats | null;
  books: Book[];
  onAddBook: () => void;
  onBookClick: (book: Book) => void;
  onNavigate: (page: 'dashboard' | 'books' | 'recommendations' | 'achievements' | 'timeline') => void;
  readingGoal?: number;
  onSaveGoal?: (goal: number) => Promise<void>;
}

export type StatKey = 'books' | 'pages' | 'avg_length' | 'streak' | 'pace' | 'rating';

export default function Dashboard({ stats, books, onAddBook, onBookClick, onNavigate, readingGoal = 12, onSaveGoal }: Props) {
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(readingGoal));
  const [goalError, setGoalError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  const currentlyReading = books.filter(b => b.status === 'reading');
  const finished = books.filter(b => b.status === 'finished')
    .sort((a, b) => (b.date_finished ?? '').localeCompare(a.date_finished ?? ''));

  const yearFinished = books.filter(b => {
    if (b.status !== 'finished' || !b.date_finished) return false;
    return b.date_finished.startsWith(String(currentYear));
  });

  const goal = readingGoal;
  const goalProgress = Math.min(yearFinished.length / goal, 1);
  const goalPct = Math.round(goalProgress * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 8 }}>

      {/* ── HERO: Compact year + goal ── */}
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{currentYear}</div>
        <div style={{ fontSize: 'clamp(32px, 8vw, 48px)', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Libre Baskerville', Georgia, serif", lineHeight: 1.1 }}>
          <AnimatedCounter value={yearFinished.length} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase' }}>
          {yearFinished.length === 1 ? 'book finished' : 'books finished'}
        </div>

        {/* Annual reading goal */}
        {yearFinished.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 260, margin: '0 auto' }}>
              <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${goalPct}%`,
                  background: goalPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg, #c9a84c, #e8c96a)',
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                  boxShadow: goalPct >= 100 ? '0 0 8px rgba(0,229,160,0.5)' : '0 0 6px rgba(201,168,76,0.4)' }} />
              </div>
              <button type="button" onClick={() => { setGoalInput(String(goal)); setShowGoal(true); }} style={{ minHeight: 44, border: 0, background: 'none', cursor: 'pointer', fontSize: 11, color: goalPct >= 100 ? 'var(--green)' : 'var(--text2)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                {goalPct >= 100 ? '✓ Goal!' : `${yearFinished.length}/${goal}`}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              {goalPct >= 100 ? 'Reading goal achieved! 🎉' : `${goal - yearFinished.length} more to hit ${goal}`}
            </div>
          </div>
        )}

        {yearFinished.length === 0 && (
          <button type="button" onClick={() => { setGoalInput(String(goal)); setShowGoal(true); }} style={{ marginTop: 12, minHeight: 44, fontSize: 11, color: 'var(--text3)', background: 'none', border: 0, cursor: 'pointer' }}>
            Goal: read {goal} books this year
          </button>
        )}
      </div>

      {/* ── Quick stats row ── */}
      {stats && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, border: '1px solid var(--card-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)' }}>
          {[
            { label: 'Total pages', value: stats.total_pages, display: stats.total_pages.toLocaleString(), stat: 'pages' as StatKey },
            { label: 'Avg rating', value: stats.global_avg_rating ?? 0, display: stats.global_avg_rating ? `⭐ ${stats.global_avg_rating.toFixed(1)}` : '—', stat: 'rating' as StatKey },
            { label: 'Avg pace', value: stats.avg_days_to_finish ?? 0, display: stats.avg_days_to_finish ? `${stats.avg_days_to_finish} pg/d` : '—', stat: 'pace' as StatKey },
            { label: 'Streak', value: stats.current_streak ?? 0, display: `${stats.current_streak ?? 0}mo`, stat: 'streak' as StatKey },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={() => setSelectedStat(item.stat)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderRight: i < 3 ? '1px solid var(--card-border)' : 'none',
                padding: '10px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>
                {item.label === 'Avg rating'
                  ? item.display
                  : <AnimatedCounter
                      value={item.value}
                      formatter={(n) => {
                        if (item.label === 'Streak') return `${n}mo`;
                        if (item.label === 'Avg pace') return n > 0 ? `${n} pg/d` : '—';
                        return n.toLocaleString();
                      }}
                    />
                }
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>{item.label}</span>
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
              <div key={book.id} onClick={() => onBookClick(book)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ fontSize: 22 }}>📖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{book.author}</div>
                  {book.current_page != null && <>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>p. {book.current_page}{book.pages ? ` / ${book.pages}` : ''}</div>
                    {book.pages && <div role="progressbar" aria-valuenow={book.current_page} aria-valuemax={book.pages} style={{ height: 3, marginTop: 3, background: 'var(--border-strong)', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, book.current_page / book.pages * 100)}%`, height: '100%', background: 'var(--gold)' }} /></div>}
                  </>}
                </div>
                {book.date_started && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
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
          {finished.length > 5 && (
            <button
              onClick={() => onNavigate('books')}
              style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            >
              See all →
            </button>
          )}
        </div>

        {finished.length === 0 && yearFinished.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text3)', fontSize: 12, border: '1px dashed rgba(201,168,76,0.2)', borderRadius: 12, background: 'rgba(201,168,76,0.03)' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📚</div>
            <div style={{ marginBottom: 4 }}>No finished books yet</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Tap <span style={{ color: 'var(--gold)' }}>+</span> to add your first book</div>
          </div>
        ) : finished.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
            No recently finished books
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {finished.slice(0, 5).map((book) => (
              <div key={book.id} onClick={() => onBookClick(book)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--card-border)', cursor: 'pointer' }}>
                <div style={{ fontSize: 20 }}>📕</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{book.author}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  {book.rating && (
                    <span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 1 }}>{'★'.repeat(book.rating)}</span>
                  )}
                  {book.pages && (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{book.pages}p</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Next achievements (top 2 closest) ── */}
      {stats && stats.achievements.length > 0 && (() => {
        const locked = stats.achievements.filter(a => !a.unlocked).sort((a, b) => {
          const pctA = a.target > 0 ? a.progress / a.target : 0;
          const pctB = b.target > 0 ? b.progress / b.target : 0;
          return pctB - pctA;
        });
        const top = locked.slice(0, 2);
        if (top.length === 0) return null;
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="section-title" style={{ marginBottom: 0 }}>Next up</span>
              <span style={{ color: 'var(--gold)', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} onClick={() => onNavigate('achievements')}>
                All awards →
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top.map(a => {
                const pct = a.target > 0 ? Math.min(a.progress / a.target, 1) : 0;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(201,168,76,0.04)',
                      border: '1px solid rgba(201,168,76,0.15)' }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{a.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>
                          {a.progress}/{a.target}
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(201,168,76,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct * 100}%`, background: 'linear-gradient(90deg, #c9a84c, #e8c96a)', borderRadius: 2, boxShadow: '0 0 6px rgba(201,168,76,0.3)' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Stat Detail Modal ── */}
      {showGoal && <div className="modal-overlay" onClick={() => setShowGoal(false)}>
        <div className="modal-box" onClick={e => e.stopPropagation()} style={{ padding: 20, maxWidth: 320 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text)' }}>Yearly reading goal
            <input type="number" min={1} max={1000} value={goalInput} onChange={e => setGoalInput(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--card-border)' }} />
          </label>
          {goalError && <p style={{ color: 'var(--red)', fontSize: 11 }}>{goalError}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button" className="btn-primary" style={{ flex: 1, minHeight: 44 }} onClick={async () => {
            const value = Number(goalInput);
            if (!Number.isInteger(value) || value < 1 || value > 1000) { setGoalError('Enter a whole number from 1 to 1000'); return; }
            try { await onSaveGoal?.(value); setGoalError(null); setShowGoal(false); }
            catch (error) { setGoalError(error instanceof Error ? error.message : 'Could not save goal'); }
          }}>Save goal</button>
          <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={() => setShowGoal(false)}>Cancel</button>
          </div>
        </div>
      </div>}
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
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: 'var(--text)' }}>Analytics</span>
              <button onClick={() => setShowCharts(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 16 }}>
              <Suspense fallback={<div style={{ textAlign: 'center', padding: 24, color: 'var(--text2)', fontSize: 11 }}>Loading charts...</div>}>
                <Charts stats={stats} books={books} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
