import React, { useState } from 'react';
import { login, register, isAuthenticated } from '../lib/auth';
import { getToken } from '../lib/auth';

interface Props {
  onAuth: () => void;
}

export default function AuthPage({ onAuth }: Props) {
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
      onAuth();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
        <div style={{ fontSize: 28 }}>📚</div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.05em', color: '#d4dce8' }}>
          Book Tracker
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 360,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '32px 28px',
      }}>
        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 3,
          marginBottom: 28,
        }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{
                flex: 1,
                padding: '8px 0',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(201,168,76,0.15)' : 'transparent',
                color: mode === m ? '#c9a84c' : '#8096b4',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'rgba(255,77,106,0.1)',
            border: '1px solid rgba(255,77,106,0.3)',
            fontSize: 11,
            color: '#ff4d6a',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#8096b4', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={3}
              autoComplete="username"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: '#d4dce8',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#8096b4', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: '#d4dce8',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
            {mode === 'register' && (
              <div style={{ fontSize: 10, color: '#8096b4', marginTop: 4 }}>
                At least 8 characters
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? 'rgba(201,168,76,0.3)' : 'rgba(201,168,76,0.15)',
              border: '1px solid rgba(201,168,76,0.4)',
              borderRadius: 6,
              color: '#c9a84c',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 24, fontSize: 10, color: '#8096b4', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
        Your books are stored securely on the server and synced across all your devices.
      </div>
    </div>
  );
}
