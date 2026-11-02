import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Monogram from '../components/Monogram';

const BRANDS = [
  'HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI',
  'ROYAL ENFIELD','KTM','PIAGGIO','APRILIA','TRIUMPH',
];

// Acronym marks stay in capitals; the rest read as names.
const BRAND_ACRONYMS = new Set(['TVS', 'KTM']);
const brandName = (b) => BRAND_ACRONYMS.has(b)
  ? b
  : b.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const FEATURES = [
  'Sales invoicing & PDF generation',
  'Service job cards with GST billing',
  'Multi-brand vehicle inventory',
  'Spare parts with reorder alerts',
  'WhatsApp + SMS notifications',
  'Real-time analytics & reports',
];

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = 'Sign in · MM Motors'; }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username.trim().toLowerCase(), form.password);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map(d => d.msg || d).join(', ')
        : err?.message || 'Invalid credentials';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      {/* Form column */}
      <main className="login-form-col">
        <div className="login-form-wrap">
          <div className="login-wordmark">
            <Monogram size={36} className="login-wordmark-mark" />
            <div>
              <div className="login-wordmark-name">MM Motors</div>
              <div className="login-wordmark-sub">Management System</div>
            </div>
          </div>

          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="field">
              <label className="field-label" htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="e.g. owner"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {error && <div id="login-error" className="api-error" role="alert">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary login-submit"
              disabled={loading || !form.username || !form.password}
              aria-busy={loading || undefined}
            >{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>

        </div>
      </main>

      {/* Brand panel */}
      <aside className="login-panel" aria-label="About MM Motors">
        <Monogram size={168} className="login-panel-mark" />
        <div className="login-panel-body">
          <h2 className="login-panel-head">Full-stack<br />dealership control.</h2>
          <ul className="login-features">
            {FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p className="login-brands">
            {BRANDS.map(brandName).join(', ')}
          </p>
        </div>
        <div className="login-panel-foot">
          <span>v2.0.0</span>
          <span>Bengaluru</span>
        </div>
      </aside>
    </div>
  );
}
