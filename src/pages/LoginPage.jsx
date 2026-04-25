import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const LOGO_SVG = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJmbGV4LXNocmluazowIj48cGF0aCBkPSJNMTAgODUgTDEwIDIwIEw1MCA3MCBMOTAgMjAgTDkwIDg1IiBmaWxsPSJub25lIiBzdHJva2U9InZhcigtLWFjY2VudCkiIHN0cm9rZS13aWR0aD0iNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTI4IDg1IEwyOCA0MiBMNTAgNzAgTDcyIDQyIEw3MiA4NSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ2YXIoLS1hY2NlbnQpIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgb3BhY2l0eT0iMC42Ii8+PC9zdmc+`;

const BRANDS = [
  'HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI',
  'ROYAL ENFIELD','KTM','PIAGGIO','APRILIA','TRIUMPH',
];

const DEMO_ACCOUNTS = [
  { username: 'owner',   password: 'mm@123456', label: 'owner' },
];

const INPUT_STYLE = {
  width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 3, padding: '10px 12px', color: 'var(--text)', outline: 'none',
  fontSize: 13, fontFamily: 'IBM Plex Sans, sans-serif',
};

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username.trim().toLowerCase(), form.password);
      toast.success('Welcome back!');
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
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {/* Left — login form */}
      <div style={{
        width: 440, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px 44px',
        borderRight: '1px solid var(--border)', position: 'relative',
      }}>
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)',
          backgroundSize: '40px 40px', opacity: .12, pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, color: 'var(--accent)', letterSpacing: '-.04em', fontWeight: 800 }}>
              <img src={LOGO_SVG} alt="MM" style={{ width: 40, height: 40 }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>
              MM Motors · Management System
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 32 }} />

          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6, letterSpacing: '-.02em' }}>Sign in</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 28 }}>Enter your credentials to continue</div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label-xs">Username</span>
              <input
                style={INPUT_STYLE}
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="e.g. owner"
                autoComplete="username"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label-xs">Password</span>
              <input
                style={INPUT_STYLE}
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                padding: '9px 12px', background: 'rgba(220,38,38,.08)',
                border: '1px solid rgba(220,38,38,.2)', borderRadius: 3,
                fontSize: 12, color: 'var(--red)',
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !form.username || !form.password}
              style={{
                background: 'var(--accent)', color: '#0c0c0d', border: 'none',
                borderRadius: 3, padding: 11, fontSize: 12, fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                letterSpacing: '.07em', textTransform: 'uppercase',
                opacity: loading ? .6 : 1, fontFamily: 'IBM Plex Sans, sans-serif',
              }}
            >{loading ? 'Signing in…' : 'Sign in →'}</button>
          </form>

          {/* Demo accounts */}
          <div style={{ marginTop: 28 }}>
            <div className="label-xs" style={{ marginBottom: 8 }}>Default account</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  onClick={() => setForm({ username: a.username, password: a.password })}
                  style={{
                    padding: '5px 12px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 3,
                    color: 'var(--muted)', cursor: 'pointer',
                    fontSize: 11, fontFamily: 'IBM Plex Sans, sans-serif',
                  }}
                >{a.label}</button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--dim)' }}>
              Password: <span className="mono" style={{ color: 'var(--muted)' }}>mm@123456</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right — marketing panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '0 60px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(var(--border2) 1px,transparent 1px)',
          backgroundSize: '28px 28px', opacity: .5, pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 20 }}>
            Precision Flux / 2025
          </div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 52, lineHeight: 1, letterSpacing: '-.04em', marginBottom: 28, fontWeight: 800 }}>
            Full-stack<br />
            <span style={{ color: 'var(--accent)' }}>dealership</span><br />
            control.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 36 }}>
            {[
              'Sales invoicing & PDF generation',
              'Service job cards with GST billing',
              'Multi-brand vehicle inventory',
              'Spare parts with reorder alerts',
              'WhatsApp + SMS notifications',
              'Real-time analytics & reports',
            ].map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
                <div className="dot dot-amber" style={{ width: 4, height: 4 }} />
                {f}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {BRANDS.map((b) => (
              <span key={b} className="mono" style={{
                padding: '3px 8px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 2,
                fontSize: 10, color: 'var(--dim)', letterSpacing: '.04em',
              }}>{b}</span>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 32, right: 32 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '.06em' }}>
            v2.0.0 · Bengaluru
          </div>
        </div>
      </div>
    </div>
  );
}
