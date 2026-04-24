import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[MM Motors] Uncaught error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: 40, textAlign: 'center',
      }}>
        <div className="display" style={{ fontSize: 64, color: 'var(--border2)', marginBottom: 16 }}>!</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, maxWidth: 400, lineHeight: 1.6 }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '9px 18px', background: 'var(--accent)', color: '#0c0c0d', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'IBM Plex Sans,sans-serif' }}
          >Try again</button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '9px 18px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border2)', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontFamily: 'IBM Plex Sans,sans-serif' }}
          >Reload page</button>
        </div>
      </div>
    );
  }
}
