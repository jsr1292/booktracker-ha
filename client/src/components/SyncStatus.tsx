import { useState, useEffect } from 'react';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../lib/sync';

export default function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    return subscribeSyncStatus(setStatus);
  }, []);

  const formatTime = (ts: number | null): string => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    const now = Date.now();
    const diff = Math.round((now - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  const getIcon = (): string => {
    switch (status.state) {
      case 'syncing': return '⟳';
      case 'error': return '⚠';
      case 'offline': return '⚠';
      default: return '✓';
    }
  };

  const getColor = (): string => {
    switch (status.state) {
      case 'syncing': return '#c9a84c';
      case 'error': return '#fc8181';
      case 'offline': return '#fc8181';
      default: return '#68d391';
    }
  };

  const getLabel = (): string => {
    switch (status.state) {
      case 'syncing': return 'Syncing...';
      case 'error': return 'Sync error';
      case 'offline': return 'Offline';
      default: return 'Synced';
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        onBlur={() => setShowTooltip(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          fontSize: 14,
          lineHeight: 1,
          color: getColor(),
          animation: status.state === 'syncing' ? 'syncSpin 1.2s linear infinite' : 'none',
        }}
        title={`${getLabel()} — Last sync: ${formatTime(status.lastSyncedAt)}`}
      >
        {getIcon()}
      </button>

      {showTooltip && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          background: '#151a2e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '10px 14px',
          minWidth: 180,
          zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 10, color: '#8096b4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Sync Status
          </div>
          <div style={{ fontSize: 12, color: '#d4dce8', marginBottom: 4 }}>
            {getLabel()}
          </div>
          <div style={{ fontSize: 10, color: '#4a5568' }}>
            Last sync: {formatTime(status.lastSyncedAt)}
          </div>
          {status.errorMessage && (
            <div style={{ fontSize: 10, color: '#fc8181', marginTop: 6 }}>
              {status.errorMessage}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes syncSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
