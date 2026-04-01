import type { Stats } from '../types';

interface Props { stats: Stats; }

const ICONS: Record<string, string> = {
  first_steps: '👶',
  bookworm: '🐛',
  speed_reader: '⚡',
  page_turner: '📖',
  marathon_reader: '🏃',
  streak_starter: '🔥',
  consistent_reader: '📅',
  rating_enthusiast: '⭐',
  genre_explorer: '🗺️',
  century_club: '💯',
};

const COLORS: Record<string, string> = {
  first_steps: '#00e5a0',
  bookworm: '#c9a84c',
  speed_reader: '#f59e0b',
  page_turner: '#60a5fa',
  marathon_reader: '#a855f7',
  streak_starter: '#ef4444',
  consistent_reader: '#f97316',
  rating_enthusiast: '#eab308',
  genre_explorer: '#22c55e',
  century_club: '#c9a84c',
};

function getColor(id: string): string {
  return COLORS[id] ?? '#c9a84c';
}

export default function Achievements({ stats }: Props) {
  const { achievements, total_books, total_pages, mind_sharpness, reading_streak } = stats;

  const kpis = [
    { label: 'Books', value: total_books, icon: '📚' },
    { label: 'Pages', value: total_pages.toLocaleString(), icon: '📄' },
    { label: 'Mind', value: `${mind_sharpness}%`, icon: '🧠' },
    { label: 'Streak', value: `${reading_streak}mo`, icon: '🔥' },
  ];

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
        <span className="section-title">Achievements</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {achievements.map((a) => {
            const color = getColor(a.id);
            const pct = a.target > 0 ? Math.min(a.progress / a.target, 1) : 0;
            return (
              <div
                key={a.id}
                className={`achievement-badge ${a.unlocked ? 'unlocked' : ''}`}
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Icon circle */}
                  <div style={{
                    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10, fontSize: 22, flexShrink: 0,
                    background: a.unlocked ? `${color}15` : 'rgba(19,25,41,0.5)',
                    border: `1px solid ${a.unlocked ? `${color}40` : 'rgba(255,255,255,0.04)'}`,
                  }}>
                    {ICONS[a.id] ?? '🏅'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: a.unlocked ? '#d4dce8' : '#6a7a8a' }}>
                        {a.name}
                      </span>
                      {a.unlocked && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 3,
                          color, background: `${color}15`,
                          border: `1px solid ${color}40`,
                          letterSpacing: '0.08em',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#8096b4', marginBottom: 6 }}>{a.description}</div>

                    {/* Progress bar — only for locked achievements */}
                    {!a.unlocked && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: '#6a7a8a', fontFamily: "'JetBrains Mono', monospace" }}>
                            {a.progress}/{a.target} {a.unit}
                          </span>
                          <span style={{ fontSize: 9, color, fontFamily: "'JetBrains Mono', monospace" }}>
                            {Math.round(pct * 100)}%
                          </span>
                        </div>
                        <div className="score-bar" style={{ height: 4 }}>
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
          })}
        </div>
      </div>
    </div>
  );
}
