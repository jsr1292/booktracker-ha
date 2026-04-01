import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; message: string; }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', textAlign: 'center', minHeight: '60vh', gap: 16,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8096b4' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: '#6a7a8a', maxWidth: 300 }}>
            {this.state.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              marginTop: 8, padding: '8px 20px', background: '#1a2540',
              color: '#d4dce8', border: '1px solid #2a3a5a', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
