import type { Book, Stats } from '../types';
import { formatNumber, formatDuration } from '../lib/utils';

interface Props {
  stats: Stats | null;
  books: Book[];
}

export default function StatsPage({ stats, books }: Props) {
  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 12 }}>
        Loading stats...
      </div>
    );
  }

  const totalBooks = stats.total_finished;
  const avgPagesPerBook = totalBooks > 0 ? Math.round(stats.total_pages / totalBooks) : 0;
  const maxGenre = stats.genre_distribution[0];

  // Compute books per month for the bar chart
  const booksPerMonth = stats.books_per_month.slice(-12);
  const maxMonthCount = Math.max(...booksPerMonth.map(m => m.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 8 }}>

      {/* Hero stats */}
      <div className="stats-hero">
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>
          {new Date().getFullYear()} Summary
        </div>
        <div style={{ fontSize: 'clamp(40px, 10vw, 64px)', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Libre Baskerville', Georgia, serif", lineHeight: 1 }}>
          {totalBooks}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, letterSpacing: '0.1em' }}>
          {totalBooks === 1 ? 'book finished' : 'books finished'}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="stats-kpi-grid">
        <div className="stat-kpi-card">
          <div className="stat-kpi-value">{formatNumber(stats.total_pages)}</div>
          <div className="stat-kpi-label">Pages Read</div>
        </div>
        <div className="stat-kpi-card">
          <div className="stat-kpi-value">{avgPagesPerBook}</div>
          <div className="stat-kpi-label">Avg Pages</div>
        </div>
        <div className="stat-kpi-card">
          <div className="stat-kpi-value">{stats.global_avg_rating?.toFixed(1) ?? '—'}</div>
          <div className="stat-kpi-label">Avg Rating</div>
        </div>
        <div className="stat-kpi-card">
          <div className="stat-kpi-value">{stats.current_streak ?? 0}mo</div>
          <div className="stat-kpi-label">Streak</div>
        </div>
      </div>

      {/* Reading pace */}
      {stats.avg_days_to_finish && (
        <div className="glass-card">
          <div className="section-title">Reading Pace</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
                {stats.avg_days_to_finish}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Avg Days/Book</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#00e5a0', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
                {stats.avg_days_to_finish > 0 ? Math.round(stats.total_pages / stats.avg_days_to_finish) : 0}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pages/Day</div>
            </div>
          </div>
        </div>
      )}

      {/* Books per month bar chart */}
      {booksPerMonth.length > 0 && (
        <div className="glass-card">
          <div className="section-title">Books per Month</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {booksPerMonth.map((month, i) => {
              const heightPct = (month.count / maxMonthCount) * 100;
              const [year, m] = month.month.split('-');
              const monthName = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' });
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ fontSize: 9, color: 'var(--text2)', fontFamily: "'JetBrains Mono', monospace" }}>{month.count}</div>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(heightPct, month.count > 0 ? 10 : 0)}%`,
                      background: 'linear-gradient(180deg, #c9a84c, rgba(201,168,76,0.4))',
                      borderRadius: '3px 3px 0 0',
                      minHeight: month.count > 0 ? 4 : 0,
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>{monthName}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Genre breakdown */}
      {stats.genre_distribution.length > 0 && (
        <div className="glass-card">
          <div className="section-title">Genre Breakdown</div>
          <div className="genre-bar-chart">
            {stats.genre_distribution.slice(0, 8).map((genre, i) => {
              const maxCount = stats.genre_distribution[0]?.count ?? 1;
              const widthPct = (genre.count / maxCount) * 100;
              return (
                <div key={i} className="genre-bar-item">
                  <div className="genre-bar-label">{genre.genre}</div>
                  <div className="genre-bar-track">
                    <div className="genre-bar-fill" style={{ width: `${widthPct}%` }} />
                  </div>
                  <div className="genre-bar-count">{genre.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Genre distribution pie chart alternative - colored bars */}
      {stats.genre_distribution.length > 0 && (
        <div className="glass-card">
          <div className="section-title">Reading Diversity</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.genre_distribution.slice(0, 6).map((genre, i) => {
              const colors = ['var(--gold)', '#00e5a0', '#3b82f6', '#a855f7', '#ff4d6a', '#f59e0b'];
              const color = colors[i % colors.length];
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 20,
                    background: `${color}15`,
                    border: `1px solid ${color}40`,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 10, color: 'var(--text)' }}>{genre.genre}</span>
                  <span style={{ fontSize: 9, color: 'var(--text2)' }}>({genre.count})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Currently reading stats */}
      <div className="glass-card">
        <div className="section-title">Currently Reading</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#00e5a0', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
              {stats.currently_reading}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Active</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
              {books.filter(b => b.status === 'planned').length}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Planned</div>
          </div>
        </div>
      </div>

      {/* Mind sharpness */}
      <div className="glass-card">
        <div className="section-title">Mind Sharpness</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--gold)', fontFamily: "'Libre Baskerville', Georgia, serif", lineHeight: 1 }}>
            {stats.mind_sharpness}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div
                style={{
                  height: '100%',
                  width: `${stats.mind_sharpness}%`,
                  background: 'linear-gradient(90deg, #c9a84c, #e8c96a)',
                  borderRadius: 3,
                  boxShadow: '0 0 8px rgba(201,168,76,0.3)',
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>
              Based on sqrt(finished books) × 10, capped at 100
            </div>
          </div>
        </div>
      </div>

      {/* Achievements summary */}
      <div className="glass-card">
        <div className="section-title">Achievements</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#00e5a0', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
              {stats.achievements.filter(a => a.unlocked).length}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Unlocked</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text2)', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
              {stats.achievements.filter(a => !a.unlocked).length}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Locked</div>
          </div>
        </div>
      </div>

    </div>
  );
}
