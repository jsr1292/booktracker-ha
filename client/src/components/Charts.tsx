import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import type { Book, Stats } from '../types';

interface Props {
  stats: Stats;
  books: Book[];
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' });
}

// ── Pages over time (cumulative area chart) ──────────────────────────────
function PagesOverTime({ books }: { books: Book[] }) {
  const finished = books.filter(b => b.date_finished && b.pages);
  const sorted = [...finished].sort((a, b) => (a.date_finished! > b.date_finished! ? 1 : -1));

  let cumulative = 0;
  const data = sorted.map(b => {
    cumulative += b.pages!;
    return {
      date: formatMonth(b.date_finished!),
      full: b.date_finished!,
      pages: b.pages!,
      cumulative,
      title: b.title,
    };
  });

  if (data.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
        <p style={{ fontSize: 12, color: '#8096b4' }}>No pages data yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Pages Read Over Time</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{cumulative.toLocaleString()} total pages · {data.length} books</div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="pagesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#c9a84c" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
          <Tooltip
            contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#d4dce8' }}
            itemStyle={{ color: '#c9a84c' }}
            formatter={((value: number, name: string) => [name === 'cumulative' ? `${value.toLocaleString()} pages` : `${value}p`, name === 'cumulative' ? 'Total' : 'Book']) as any}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.full ?? label}
          />
          <Area type="monotone" dataKey="cumulative" stroke="#c9a84c" strokeWidth={2} fill="url(#pagesGrad)" dot={{ fill: '#c9a84c', r: 3, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Genre bar chart ─────────────────────────────────────────────────────
function GenreChart({ stats }: { stats: Stats }) {
  const data = (stats.genre_distribution ?? []).slice(0, 8).map(g => ({
    genre: g.genre.length > 12 ? g.genre.substring(0, 12) + '…' : g.genre,
    count: g.count,
  }));

  if (!data.length) return null;

  const max = Math.max(...data.map(d => d.count));

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Genre Breakdown</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{data.length} genres tracked</div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <XAxis dataKey="genre" tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#d4dce8' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={`rgba(201, 168, 76, ${0.4 + (data[i].count / max) * 0.6})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Rating distribution ─────────────────────────────────────────────────
function RatingChart({ books }: { books: Book[] }) {
  const rated = books.filter(b => b.rating != null);
  const buckets = [1, 2, 3, 4, 5].map(n => ({
    stars: n,
    label: n === 1 ? '★' : '★'.repeat(n),
    count: rated.filter(b => b.rating === n).length,
  }));

  if (!rated.length) {
    return (
      <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
        <p style={{ fontSize: 12, color: '#8096b4' }}>No ratings yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Rating Distribution</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{rated.length} rated books</div>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={buckets} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <XAxis dataKey="label" tick={{ fill: '#c9a84c', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#d4dce8' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {buckets.map((_, i) => (
              <Cell key={i} fill={i < 3 ? 'rgba(239,68,68,0.6)' : i < 4 ? 'rgba(234,179,8,0.7)' : 'rgba(201,168,76,0.85)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Monthly reading (books per month bar chart) ────────────────────────
function MonthlyChart({ books }: { books: Book[] }) {
  const finished = books.filter(b => b.date_finished);
  const monthMap = new Map<string, number>();
  for (const b of finished) {
    const m = b.date_finished!.substring(0, 7);
    monthMap.set(m, (monthMap.get(m) ?? 0) + 1);
  }
  const data = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => {
      const [y, m] = month.split('-');
      const label = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' });
      return { month, label, count };
    });

  if (!data.length) return null;

  const max = Math.max(...data.map(d => d.count));
  const currentMonth = new Date().toISOString().substring(0, 7);

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Monthly Pace</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>Books finished per month</div>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <XAxis dataKey="label" tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8096b4', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#d4dce8' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.month === currentMonth ? '#c9a84c' : 'rgba(201,168,76,0.35)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────
export default function Charts({ stats, books }: Props) {
  const finished = books.filter(b => b.status === 'finished');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8096b4', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Analytics</div>

      <PagesOverTime books={finished} />
      <MonthlyChart books={finished} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GenreChart stats={stats} />
        <RatingChart books={finished} />
      </div>
    </div>
  );
}
