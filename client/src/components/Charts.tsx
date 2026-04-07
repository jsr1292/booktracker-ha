// Plain SVG/CSS charts — replaces recharts for ~450KB bundle savings.
// Visual style preserved: dark background #07090f, gold accents #c9a84c.
import type { Book, Stats } from '../types';

interface Props {
  stats: Stats;
  books: Book[];
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' });
}

// ── SVG bar chart helper ─────────────────────────────────────────────────
function SvgBarChart({
  data,
  maxValue,
  barColor,
  hoverColor,
  height = 120,
  formatLabel,
}: {
  data: { label: string; value: number }[];
  maxValue: number;
  barColor: string;
  hoverColor?: string;
  height?: number;
  formatLabel?: (v: number) => string;
}) {
  const width = 100; // percentage-based
  const chartHeight = height - 24; // leave room for labels
  const barGap = 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    >
      {data.map((d, i) => {
        const barWidth = Math.max(0, (width - (data.length - 1) * barGap) / data.length);
        const barHeight = maxValue > 0 ? (d.value / maxValue) * chartHeight : 0;
        const x = i * (barWidth + barGap);
        const y = chartHeight - barHeight;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill={barColor}
              opacity={0.4 + (d.value / maxValue) * 0.6}
            />
            <text
              x={x + barWidth / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill="#8096b4"
              fontFamily="'JetBrains Mono', monospace"
            >
              {formatLabel ? formatLabel(d.value) : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG area/sparkline chart ────────────────────────────────────────────
function SvgSparkline({
  data,
  height = 120,
  strokeColor = '#c9a84c',
}: {
  data: { x: number; y: number; label?: string }[];
  height?: number;
  strokeColor?: string;
}) {
  if (data.length < 2) return null;
  const chartH = height - 16;
  const minY = Math.min(...data.map(d => d.y));
  const maxY = Math.max(...data.map(d => d.y));
  const range = maxY - minY || 1;
  const w = 100;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = chartH - ((d.y - minY) / range) * chartH;
    return `${x},${y}`;
  });

  const areaPoints = [
    `0,${chartH}`,
    ...points,
    `${w},${chartH}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: `${height}px`, display: 'block' }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sparkGrad)" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Pages over time (cumulative area chart) ──────────────────────────────
function PagesOverTime({ books }: { books: Book[] }) {
  const finished = books.filter(b => b.date_finished && b.pages);
  const sorted = [...finished].sort((a, b) => (a.date_finished! > b.date_finished! ? 1 : -1));

  let cumulative = 0;
  const data = sorted.map(b => {
    cumulative += b.pages!;
    return { value: cumulative, label: formatMonth(b.date_finished!) };
  });

  if (data.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
        <p style={{ fontSize: 12, color: '#8096b4' }}>No pages data yet</p>
      </div>
    );
  }

  const maxVal = data[data.length - 1].value;

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Pages Read Over Time</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{cumulative.toLocaleString()} total pages · {data.length} books</div>
      </div>
      <SvgSparkline
        data={data.map((d, i) => ({ x: i, y: d.value }))}
        height={140}
        strokeColor="#c9a84c"
      />
    </div>
  );
}

// ── Genre bar chart ─────────────────────────────────────────────────────
function GenreChart({ stats }: { stats: Stats }) {
  const data = (stats.genre_distribution ?? []).slice(0, 8).map(g => ({
    label: g.genre.length > 12 ? g.genre.substring(0, 12) + '…' : g.genre,
    value: g.count,
  }));

  if (!data.length) return null;

  const max = Math.max(...data.map(d => d.value));

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Genre Breakdown</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{data.length} genres tracked</div>
      </div>
      <SvgBarChart data={data} maxValue={max} barColor="#c9a84c" height={130} />
    </div>
  );
}

// ── Rating distribution ─────────────────────────────────────────────────
function RatingChart({ books }: { books: Book[] }) {
  const rated = books.filter(b => b.rating != null);
  const buckets = [1, 2, 3, 4, 5].map(n => ({
    label: '★'.repeat(n),
    value: rated.filter(b => b.rating === n).length,
    color: n < 3 ? 'rgba(239,68,68,0.7)' : n < 5 ? 'rgba(234,179,8,0.75)' : 'rgba(201,168,76,0.9)',
  }));

  if (!rated.length) {
    return (
      <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
        <p style={{ fontSize: 12, color: '#8096b4' }}>No ratings yet</p>
      </div>
    );
  }

  const max = Math.max(...buckets.map(b => b.value), 1);

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Rating Distribution</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>{rated.length} rated books</div>
      </div>
      <SvgBarChart
        data={buckets.map(b => ({ label: b.label, value: b.value }))}
        maxValue={max}
        barColor="#c9a84c"
        height={110}
        formatLabel={(v) => buckets.find(b => b.value === v)?.label ?? ''}
      />
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
      return { label, value: count };
    });

  if (!data.length) return null;

  const max = Math.max(...data.map(d => d.value));
  const currentMonth = new Date().toISOString().substring(0, 7);

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d4dce8', fontFamily: "'Libre Baskerville', serif" }}>Monthly Pace</div>
        <div style={{ fontSize: 11, color: '#8096b4', marginTop: 2 }}>Books finished per month</div>
      </div>
      <SvgBarChart
        data={data}
        maxValue={max}
        barColor={data.some(d => d.label === currentMonth) ? '#c9a84c' : 'rgba(201,168,76,0.35)'}
        height={110}
      />
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
