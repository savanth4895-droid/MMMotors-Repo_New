import { useState, useMemo } from 'react';
// ── Shared primitive components ────────────────────────────────────

// Primary / accent button
export function Btn({ onClick, disabled, children, color = 'var(--accent)', style = {} }) {
  const onColor = color !== 'var(--accent)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-primary${onColor ? ' btn-on-color' : ''}`}
      style={{ ...(onColor ? { background: color } : null), ...style }}
    >{children}</button>
  );
}

// Ghost / outline button
export function GhostBtn({ onClick, children, sm = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      className={`btn btn-ghost${sm ? ' btn-sm' : ''}`}
      style={style}
    >{children}</button>
  );
}

// Form field wrapper
export function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
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
export function Avatar({ name, size = 30, bg, color }) {
  const initials = name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className="avatar" aria-hidden="true" style={{
      width: size, height: size, fontSize: size * 0.38,
      ...(bg ? { background: bg } : null), ...(color ? { color } : null),
    }}>{initials}</div>
  );
}

// Loading skeleton bar
export function Skeleton({ h = 16, w = '100%', style = {} }) {
  return <div className="skeleton" aria-hidden="true" style={{ height: h, width: w, ...style }} />;
}

// Empty state
export function Empty({ message = 'No data', sub }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{message}</div>
      {sub && <div className="empty-state-sub">{sub}</div>}
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
  return <div className="api-error" role="alert">{msg}</div>;
}

// ── Sortable table hook ────────────────────────────────────────────────────────
export function useSortable(data, defaultCol = null, defaultDir = 'asc') {
  const [col, setCol]   = useState(defaultCol);
  const [dir, setDir]   = useState(defaultDir);

  const toggle = (c) => {
    if (col === c) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setCol(c); setDir('asc'); }
  };

  const sorted = useMemo(() => {
    if (!col || !Array.isArray(data)) return data || [];
    const parseDate = (v) => {
      if (!v || typeof v !== 'string') return null;
      const dmy = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`).getTime();
      const dmy2 = v.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})/);
      if (dmy2) return new Date(`${dmy2[2]} ${dmy2[1]} ${dmy2[3]}`).getTime();
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
      return null;
    };
    return [...data].sort((a, b) => {
      const av = a[col], bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const ad = parseDate(av), bd = parseDate(bv);
      const cmp = (ad !== null && bd !== null)
        ? ad - bd
        : typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [data, col, dir]);

  const Th = ({ children, field, style = {}, ...rest }) => (
    <th onClick={() => field && toggle(field)}
      aria-sort={field ? (col === field ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
      style={{ cursor: field ? 'pointer' : 'default', userSelect: 'none', ...style }}
      {...rest}>
      {children}
      {field && col === field && (
        <span className="sort-mark" aria-hidden="true">
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );

  return { sorted, col, dir, toggle, Th };
}
