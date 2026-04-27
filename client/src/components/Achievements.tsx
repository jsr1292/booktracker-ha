import type { Stats } from '../types';

interface Props { stats: Stats; }

const ICONS: Record<string, string> = {
  // Books
  first_steps: '👶', bookworm: '🐛', speed_reader: '⚡', scholar: '🎓',
  librarian: '📖', century_club: '💯', master_library: '🏛️',
  // Pages
  page_turner: '📄', marathon_reader: '🏃', bookshelf_builder: '📚',
  page_mountain: '🏔️', page_summit: '🗻',
  // Streaks
  streak_starter: '🔥', consistent_reader: '📅', on_fire: '💥', unstoppable: '💎',
  // Ratings
  rating_enthusiast: '⭐', critic: '🎭', top_score: '🌟', tough_judge: '🎯',
  // Diversity
  genre_explorer: '🗺️', genre_master: '🧭', genre_legend: '🌈', polyglot: '🌍',
  // Pace
  lightning: '⚡', slow_burn: '🐢',
  // Book size
  long_haul: '📏', tome_crusher: '🏋️', short_and_sweet: '🍬',
  // Genre-specific
  fantasy_fan: '🧙', science_nerd: '🔬', history_buff: '📜',
  thriller_addict: '🔍', scifi_voyager: '🚀', deep_thinker: '🤔',
  life_stories: '👤', business_mind: '💼', self_improver: '📈',
  // Engagement
  note_taker: '📓',
};

const COLORS: Record<string, string> = {
  // Books — green tones
  first_steps: '#00e5a0', bookworm: '#22c55e', speed_reader: '#10b981',
  scholar: '#059669', librarian: '#047857', century_club: '#c9a84c',
  master_library: '#fbbf24',
  // Pages — blue tones
  page_turner: '#60a5fa', marathon_reader: '#3b82f6',
  bookshelf_builder: '#2563eb', page_mountain: '#1d4ed8', page_summit: '#6366f1',
  // Streaks — red/orange
  streak_starter: '#ef4444', consistent_reader: '#f97316',
  on_fire: '#dc2626', unstoppable: '#a855f7',
  // Ratings — gold
  rating_enthusiast: '#eab308', critic: '#f59e0b',
  top_score: '#fbbf24', tough_judge: '#fb923c',
  // Diversity — teal/cyan
  genre_explorer: '#22c55e', genre_master: '#14b8a6', genre_legend: '#06b6d4',
  polyglot: '#0ea5e9',
  // Pace — yellow/purple
  lightning: '#facc15', slow_burn: '#a78bfa',
  // Book size — indigo
  long_haul: '#818cf8', tome_crusher: '#6366f1', short_and_sweet: '#c084fc',
  // Genre-specific — unique
  fantasy_fan: '#a855f7', science_nerd: '#06b6d4', history_buff: '#d97706',
  thriller_addict: '#ef4444', scifi_voyager: '#3b82f6', deep_thinker: '#8b5cf6',
  life_stories: '#f59e0b', business_mind: '#10b981', self_improver: '#14b8a6',
  // Engagement
  note_taker: '#f472b6',
};

function getColor(id: string): string {
  return COLORS[id] ?? '#c9a84c';
}

export default function Achievements({ stats }: Props) {
  const { achievements, total_books, total_pages, mind_sharpness, reading_streak } = stats;

  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  const kpis = [
    { label: 'Books', value: total_books, icon: '📚' },
    { label: 'Pages', value: total_pages.toLocaleString(), icon: '📄' },
    { label: 'Mind', value: `${mind_sharpness}%`, icon: '🧠' },
    { label: 'Streak', value: `${reading_streak}mo`, icon: '🔥' },
  ];

  function renderAchievement(a: { id: string; name: string; description: string; unlocked: boolean; progress: number; target: number; unit: string }, isUnlocked: boolean) {
    const color = getColor(a.id);
    const pct = a.target > 0 ? Math.min(a.progress / a.target, 1) : 0;
    return (
      <div
        key={a.id}
        className={`achievement-badge ${isUnlocked ? 'unlocked' : ''}`}
        style={{
          padding: '12px 14px',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, fontSize: 18, flexShrink: 0,
            background: isUnlocked ? `${color}15` : 'rgba(19,25,41,0.5)',
            border: `1px solid ${isUnlocked ? `${color}40` : 'rgba(255,255,255,0.04)'}`,
          }}>
            {ICONS[a.id] ?? '🏅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: isUnlocked ? '#d4dce8' : '#6a7a8a' }}>
                {a.name}
              </span>
              {isUnlocked && (
                <span style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 3,
                  color, background: `${color}15`,
                  border: `1px solid ${color}40`,
                  letterSpacing: '0.08em',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  ✓
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#8096b4', marginBottom: 4 }}>{a.description}</div>
            {!isUnlocked && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>
                    {a.progress}/{a.target} {a.unit}
                  </span>
                  <span style={{ fontSize: 9, color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {Math.round(pct * 100)}%
                  </span>
                </div>
                <div className="score-bar" style={{ height: 3 }}>
                  <div style={{
                    height: '100%',
                    width: `${pct * 100}%`,
                    background: `linear-gradient(90deg, ${color}80, ${color})`,
                    borderRadius: 2,
                    transition: 'width 0.4s ease',
                    boxShadow: `0 0 6px ${color}40`,
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {kpis.map(({ label, value, icon }) => (
          <div key={label} className="glass-card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
            <div className="stat-value" style={{ fontSize: 16 }}>{value}</div>
            <div className="stat-label" style={{ fontSize: 8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Achievement detail level */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="section-title">Achievements</span>
          <span style={{ fontSize: 10, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>
            {unlocked.length}/{achievements.length} unlocked
          </span>
        </div>

        {/* Unlocked first */}
        {unlocked.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: locked.length > 0 ? 16 : 0 }}>
            {unlocked.map((a) => renderAchievement(a, true))}
          </div>
        )}

        {/* Locked with progress */}
        {locked.length > 0 && (
          <>
            {unlocked.length > 0 && (
              <div style={{ fontSize: 9, color: '#6a7a8a', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                In progress ({locked.length})
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {locked.map((a) => renderAchievement(a, false))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
