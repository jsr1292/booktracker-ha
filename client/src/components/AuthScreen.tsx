import { useState } from 'react';
import { login, register } from '../lib/auth';
import { isLoggedIn } from '../lib/auth';

interface Props {
  onAuthenticated: () => void;
  onOfflineMode: () => void;
}

export default function AuthScreen({ onAuthenticated, onOfflineMode }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOffline = () => {
    onOfflineMode();
  };

  return (
    <div style={{
      background: '#07090f',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'JetBrains Mono', monospace",
      color: '#d4dce8',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: '#c9a84c',
          textTransform: 'uppercase',
        }}>
          Book Tracker
        </div>
        <div style={{
          fontSize: 10,
          color: '#4a5568',
          letterSpacing: '0.2em',
          marginTop: 6,
          textTransform: 'uppercase',
        }}>
          {mode === 'login' ? 'Sign in to sync your library' : 'Create an account to sync'}
        </div>
      </div>

      {/* Form card */}
      <div style={{
        width: '100%',
        maxWidth: 340,
        background: 'rgba(15, 20, 35, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(201, 168, 76, 0.15)',
        borderRadius: 16,
        padding: '28px 24px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.05)',
      }}>
        {/* Toggle */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 3,
          marginBottom: 24,
        }}>
          <button
            onClick={() => { setMode('login'); setError(null); }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.08em',
              fontWeight: 600,
              transition: 'all 0.2s',
              background: mode === 'login' ? 'rgba(201,168,76,0.15)' : 'transparent',
              color: mode === 'login' ? '#c9a84c' : '#4a5568',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.08em',
              fontWeight: 600,
              transition: 'all 0.2s',
              background: mode === 'register' ? 'rgba(201,168,76,0.15)' : 'transparent',
              color: mode === 'register' ? '#c9a84c' : '#4a5568',
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 10,
              color: '#8096b4',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={3}
              autoComplete="username"
              placeholder="your username"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#d4dce8',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(201,168,76,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontSize: 10,
              color: '#8096b4',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#d4dce8',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(201,168,76,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 11,
              color: '#fc8181',
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading
                ? 'rgba(201,168,76,0.3)'
                : 'linear-gradient(135deg, #c9a84c, #b8943f)',
              border: 'none',
              borderRadius: 8,
              color: '#07090f',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
        }}>
          <button
            onClick={handleOffline}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#4a5568',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.08em',
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => { (e.target as HTMLElement).style.color = '#8096b4'; (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseOut={e => { (e.target as HTMLElement).style.color = '#4a5568'; (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            Continue offline
          </button>
        </div>
      </div>

      <div style={{
        marginTop: 32,
        fontSize: 9,
        color: '#2d3748',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        Your books are stored locally first.<br />
        Create an account to sync across devices.
      </div>
    </div>
  );
}
