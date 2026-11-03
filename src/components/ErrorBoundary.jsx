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
      <div className="crash" role="alert">
        <h2 className="crash-title">Something went wrong</h2>
        <p className="crash-msg">
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <div className="crash-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >Try again</button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.location.reload()}
          >Reload page</button>
        </div>
      </div>
    );
  }
}
