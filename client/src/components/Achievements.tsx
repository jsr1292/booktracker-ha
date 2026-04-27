import type { Stats } from '../types';

interface Props { stats: Stats; }

const ICONS: Record<string, string> = {
  first_steps: '👶', bookworm: '🐛', speed_reader: '⚡', quarter_century: '🏛️',
  half_century: '🎖️', century_club: '💯', double_century: '👑',
  page_turner: '📄', marathon_reader: '🏃', page_10k: '📚',
  page_25k: '🏔️', page_50k: '🗻',
  streak_starter: '🔥', consistent_reader: '📅', half_year_streak: '💥', year_round: '💎',
  rating_enthusiast: '⭐', rating_pro: '🎭', rating_master: '🌟', five_star_only: '🎯',
  genre_explorer: '🗺️', genre_master: '🧭', genre_king: '🌈',
  author_explorer: '👤', author_collector: '👥',
  tome_reader: '📏', war_and_peace: '🏋️', planned_reader: '📋', collector: '📚', library: '🏛️',
  speed_demon: '⚡', slow_burn: '🐢', marathon_month: '🏃',
  completionist: '💎', genre_specialist: '🎯',
  short_and_sweet: '🍬', heavy_hitter: '💪', epic_saga: '🏔️',
};

const COLORS: Record<string, string> = {
  first_steps: '#00e5a0', bookworm: '#22c55e', speed_reader: '#10b981',
  quarter_century: '#059669', half_century: '#047857', century_club: '#c9a84c',
  double_century: '#fbbf24',
  page_turner: '#60a5fa', marathon_reader: '#3b82f6',
  page_10k: '#2563eb', page_25k: '#1d4ed8', page_50k: '#6366f1',
  streak_starter: '#ef4444', consistent_reader: '#f97316',
  half_year_streak: '#dc2626', year_round: '#a855f7',
  rating_enthusiast: '#eab308', rating_pro: '#f59e0b',
  rating_master: '#fbbf24', five_star_only: '#fb923c',
  genre_explorer: '#22c55e', genre_master: '#14b8a6', genre_king: '#06b6d4',
  author_explorer: '#0ea5e9', author_collector: '#38bdf8',
  tome_reader: '#818cf8', war_and_peace: '#6366f1', planned_reader: '#3b82f6',
  collector: '#c9a84c', library: '#fbbf24',
  speed_demon: '#facc15', slow_burn: '#a78bfa', marathon_month: '#f97316',
  completionist: '#06b6d4', genre_specialist: '#14b8a6',
  short_and_sweet: '#c084fc', heavy_hitter: '#ef4444', epic_saga: '#a855f7',
};

function getColor(id: string): string {
  return COLORS[id] ?? '#c9a84c';
}

// Mini bar chart
function MiniBarChart({ data, valueFn, color, height = 50 }: {
  data: any[];
  valueFn: (d: any) => number;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(valueFn), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((d, i) => {
        const v = valueFn(d);
        const h = (v / max) * (height - 8);
        return (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100%', maxWidth: 14, height: Math.max(h, 1),
              background: color || '#c9a84c', borderRadius: 2, opacity: 0.8,
              transition: 'height 0.3s ease',
            }} />
          </div>
        );
      })}
    </div>
  );
}

// Genre donut
function GenreDonut({ data }: { data: { genre: string; count: number }[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.count, 0);
  const colors = ['#c9a84c', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
  let cumulative = 0;
  const segments = data.slice(0, 6).map((d, i) => {
    const start = cumulative;
    const pct = (d.count / total) * 100;
    cumulative += pct;
    return { ...d, start, pct, color: colors[i % colors.length] };
  });

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(${segments.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ')})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: '#0d1117',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#d4dce8', fontFamily: "'JetBrains Mono', monospace" }}>{total}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        {segments.map(s => (
          <div key={s.genre} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 7, color: '#8096b4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.genre}</span>
            <span style={{ fontSize: 6, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Achievements({ stats }: Props) {
  const { achievements, total_finished, total_pages, reading_streak, books_per_month, genre_distribution } = stats;
  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  // Group by category
  const categories = new Map<string, typeof achievements>();
  for (const a of achievements) {
    const cat = (a as any).category || '🏆 General';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(a);
  }

  function renderAchievement(a: typeof achievements[0], isUnlocked: boolean) {
    const color = getColor(a.id);
    const pct = a.target > 0 ? Math.min(a.progress / a.target, 1) : 0;
    return (
      <div key={a.id} style={{
        padding: '8px 10px', borderRadius: 8,
        background: isUnlocked ? `${color}08` : 'rgba(19,25,41,0.3)',
        border: `1px solid ${isUnlocked ? `${color}25` : 'rgba(255,255,255,0.03)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, fontSize: 13, flexShrink: 0,
            background: isUnlocked ? `${color}12` : 'rgba(19,25,41,0.5)',
          }}>
            {ICONS[a.id] ?? '🏅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: isUnlocked ? '#d4dce8' : '#6a7a8a' }}>{a.name}</span>
              {isUnlocked && <span style={{ fontSize: 7, color, fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>✓</span>}
            </div>
            <div style={{ fontSize: 8, color: '#8096b4', marginBottom: 2 }}>{a.description}</div>
            {!isUnlocked && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                  <span style={{ fontSize: 7, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>{a.progress}/{a.target} {a.unit}</span>
                  <span style={{ fontSize: 7, color, fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(pct * 100)}%</span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 3 key metrics */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: 'Finished', value: total_finished, icon: '📚' },
          { label: 'Pages', value: total_pages.toLocaleString(), icon: '📄' },
          { label: 'Streak', value: `${reading_streak}mo`, icon: '🔥' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            flex: 1, textAlign: 'center', padding: '8px 4px',
            background: 'rgba(19,25,41,0.4)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontSize: 12, marginBottom: 1 }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#d4dce8', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 6, color: '#6a7a8a', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 2 charts side by side */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{
          flex: 1, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(19,25,41,0.4)', border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontSize: 7, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 4, textTransform: 'uppercase' }}>
            📊 Books / month
          </div>
          <MiniBarChart data={(books_per_month || []).slice(-10)} valueFn={d => d.count} color="#c9a84c" height={44} />
        </div>
        <div style={{
          flex: 1, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(19,25,41,0.4)', border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontSize: 7, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 4, textTransform: 'uppercase' }}>
            🌍 Genres
          </div>
          <GenreDonut data={genre_distribution || []} />
        </div>
      </div>

      {/* Achievement progress bar */}
      <div style={{
        padding: '8px 10px', borderRadius: 8,
        background: 'linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.02))',
        border: '1px solid rgba(201,168,76,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: '#c9a84c', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            🏆 {unlocked.length} / {achievements.length}
          </span>
          <span style={{ fontSize: 8, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round((unlocked.length / achievements.length) * 100)}%
          </span>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${(unlocked.length / achievements.length) * 100}%`,
            background: 'linear-gradient(90deg, #c9a84c80, #c9a84c)',
            borderRadius: 3, transition: 'width 0.6s ease',
            boxShadow: '0 0 6px rgba(201,168,76,0.3)',
          }} />
        </div>
      </div>

      {/* Achievement categories */}
      {Array.from(categories.entries()).map(([cat, items]) => {
        const catUnlocked = items.filter(a => a.unlocked).length;
        return (
          <div key={cat}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#d4dce8', fontWeight: 600 }}>{cat}</span>
              <span style={{ fontSize: 7, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>{catUnlocked}/{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(a => renderAchievement(a, a.unlocked))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
