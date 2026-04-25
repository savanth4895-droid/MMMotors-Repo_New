// ── Shared primitive components ────────────────────────────────────

// Primary / accent button
export function Btn({ onClick, disabled, children, color = 'var(--accent)', style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: color,
        color: color === 'var(--accent)' ? '#0c0c0d' : '#fff',
        border: 'none', borderRadius: 3, padding: '8px 18px',
        fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .45 : 1, fontSize: 12,
        letterSpacing: '.05em', textTransform: 'uppercase',
        fontFamily: 'IBM Plex Sans, sans-serif',
        ...style,
      }}
    >{children}</button>
  );
}

// Ghost / outline button
export function GhostBtn({ onClick, children, sm = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: '1px solid var(--border2)',
        borderRadius: 3, padding: sm ? '5px 10px' : '8px 14px',
        color: 'var(--muted)', cursor: 'pointer',
        fontSize: sm ? 11 : 12, fontFamily: 'IBM Plex Sans, sans-serif',
        ...style,
      }}
    >{children}</button>
  );
}

// Form field wrapper
export function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span className="label-xs">{label}</span>
      {children}
    </div>
  );
}

// Native select (styled via global CSS)
export function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

// Status badge
const PILL_MAP = {
  in_progress: { cls: 'pill-amber', label: 'In progress' },
  ready:       { cls: 'pill-green', label: 'Ready' },
  pending:     { cls: 'pill-dim',   label: 'Pending' },
  delivered:   { cls: 'pill-dim',   label: 'Delivered' },
  new:         { cls: 'pill-green', label: 'New' },
  used:        { cls: 'pill-blue',  label: 'Pre-owned' },
  sale:        { cls: 'pill-amber', label: 'Invoice' },
  service:     { cls: 'pill-green', label: 'Service' },
  notif:       { cls: 'pill-blue',  label: 'Notif' },
  parts:       { cls: 'pill-dim',   label: 'Parts' },
  alert:       { cls: 'pill-red',   label: 'Alert' },
  in_stock:    { cls: 'pill-green', label: 'In stock' },
  in_service:  { cls: 'pill-amber', label: 'In service' },
  sold:        { cls: 'pill-dim',   label: 'Sold' },
  active:      { cls: 'pill-green', label: 'Active' },
  inactive:    { cls: 'pill-red',   label: 'Inactive' },
  on_leave:    { cls: 'pill-amber', label: 'On leave' },
};

export function StatusPill({ status }) {
  const { cls = 'pill-dim', label = status } = PILL_MAP[status] || {};
  return <span className={`pill ${cls}`}>{label}</span>;
}

// Initials avatar
export function Avatar({ name, size = 30, bg = 'var(--accent)', color = '#0c0c0d' }) {
  const initials = name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, background: bg, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.37, fontWeight: 700, color, flexShrink: 0,
    }}>{initials}</div>
  );
}

// Loading skeleton bar
export function Skeleton({ h = 16, w = '100%', style = {} }) {
  return (
    <div style={{
      height: h, width: w, background: 'var(--surface2)',
      borderRadius: 3, animation: 'pulse 1.5s ease infinite', ...style,
    }} />
  );
}

// Empty state
export function Empty({ message = 'No data', sub }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dim)', fontSize: 12 }}>
      <div style={{ marginBottom: 4 }}>{message}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Error display
export function ApiError({ error }) {
  const detail = error?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail
    : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
    : detail ? JSON.stringify(detail)
    : error?.message || 'Something went wrong';
  return (
    <div style={{
      padding: '10px 14px', background: 'rgba(220,38,38,.06)',
      border: '1px solid rgba(220,38,38,.2)', borderRadius: 3,
      fontSize: 12, color: 'var(--red)',
    }}>{msg}</div>
  );
}
