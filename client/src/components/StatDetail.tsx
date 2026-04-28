import type { Book } from '../types';
import type { StatKey } from './Dashboard';

interface Props {
  stat: StatKey;
  books: Book[];
  onClose: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatDetail({ stat, books, onClose }: Props) {
  const finished = books.filter(b => b.status === 'finished');
  const rated = finished.filter(b => b.rating != null);
  const withPages = finished.filter(b => b.pages != null);

  // Compute stat-specific data
  let content: { title: string; rows: { label: string; value: string }[] } | null = null;

  if (stat === 'books') {
    const sorted = [...finished].sort((a, b) =>
      (b.date_finished || '').localeCompare(a.date_finished || '')
    );
    content = {
      title: 'All Finished Books',
      rows: sorted.map(b => ({
        label: b.title,
        value: b.date_finished ? formatDate(b.date_finished) : '—',
      })),
    };
  } else if (stat === 'pages') {
    const byPages = [...finished].sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0));
    const total = withPages.reduce((s, b) => s + (b.pages ?? 0), 0);
    content = {
      title: 'Books by Page Count',
      rows: byPages.map(b => ({
        label: b.title,
        value: b.pages ? `${b.pages}p` : '—',
      })),
    };
  } else if (stat === 'avg_length') {
    const avg = withPages.length > 0
      ? Math.round(withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length)
      : 0;
    const short = withPages.filter(b => (b.pages ?? 0) < 250).length;
    const medium = withPages.filter(b => (b.pages ?? 0) >= 250 && (b.pages ?? 0) < 450).length;
    const long = withPages.filter(b => (b.pages ?? 0) >= 450).length;
    content = {
      title: 'Reading Length Distribution',
      rows: [
        { label: `Short reads (< 250p)`, value: `${short} books` },
        { label: `Medium reads (250-450p)`, value: `${medium} books` },
        { label: `Long reads (> 450p)`, value: `${long} books` },
        { label: `Average length`, value: `${avg}p` },
      ],
    };
  } else if (stat === 'streak') {
    // Group by month
    const byMonth = new Map<string, number>();
    for (const b of finished) {
      if (!b.date_finished) continue;
      const month = b.date_finished.substring(0, 7); // YYYY-MM
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    content = {
      title: 'Monthly Reading Streak',
      rows: months.map(([month, count]) => ({
        label: month,
        value: `${count} book${count !== 1 ? 's' : ''}`,
      })),
    };
  } else if (stat === 'pace') {
    const rated2 = rated.filter(b => b.date_started && b.date_finished);
    const paces = rated2
      .map(b => {
        const start = new Date(b.date_started!);
        const end = new Date(b.date_finished!);
        const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
        const pages = b.pages ?? 100;
        return { title: b.title, pages, days, pps: Math.round(pages / days) };
      })
      .sort((a, b) => b.pps - a.pps);

    const avgPace = paces.length > 0
      ? Math.round(paces.reduce((s, p) => s + p.pps, 0) / paces.length)
      : 0;

    content = {
      title: 'Reading Pace (pages/day)',
      rows: paces.map(p => ({
        label: p.title,
        value: `${p.pps} p/d (${p.pages}p in ${p.days}d)`,
      })),
    };
    // Prepend average
    content.rows.unshift({ label: 'Average pace', value: `${avgPace} pages/day` });
  } else if (stat === 'rating') {
    const dist: Record<number, string[]> = {};
    for (const b of rated) {
      const r = b.rating!;
      if (!dist[r]) dist[r] = [];
      dist[r].push(b.title);
    }
    const ratings = Object.keys(dist).map(Number).sort((a, b) => b - a);
    const rows: { label: string; value: string }[] = [];
    for (const r of ratings) {
      rows.push({ label: `${'★'.repeat(r)}${'☆'.repeat(5 - r)}`, value: `${dist[r].length} book${dist[r].length !== 1 ? 's' : ''}` });
      for (const title of dist[r]) {
        rows.push({ label: `  ${title}`, value: '' });
      }
    }
    const unrated = finished.filter(b => b.rating == null).length;
    if (unrated > 0) rows.push({ label: '☆ Unrated', value: `${unrated} book${unrated !== 1 ? 's' : ''}` });
    content = { title: 'Rating Distribution', rows };
  }

  if (!content) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: 'var(--text)' }}>{content.title}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Content */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 20px' }}>
          {content.rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text2)', fontSize: 12 }}>No data available</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {content.rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 4,
                    background: row.value ? 'var(--border)' : 'transparent',
                    gap: 12,
                  }}
                >
                  <span style={{
                    fontSize: row.value ? 12 : 11,
                    color: row.value ? 'var(--text)' : 'var(--text2)',
                    fontWeight: row.value ? 600 : 400,
                    fontFamily: row.value ? "'JetBrains Mono', monospace" : "'JetBrains Mono', monospace",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    paddingLeft: row.value ? 0 : 8,
                  }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--gold)', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatDetail;
