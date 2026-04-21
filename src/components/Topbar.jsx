import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';

const TICKER_ITEMS = [
  'HERO · Splendor+ · ₹73,200',
  'HONDA · Activa 6G · ₹80,500',
  'BAJAJ · Pulsar 150 · ₹1,02,000',
  'TVS · Jupiter · ₹80,000',
  'YAMAHA · FZ-S · ₹1,12,000',
  'ROYAL ENFIELD · Classic 350 · ₹1,85,000',
  'KTM · Duke 200 · ₹1,99,000',
  'SUZUKI · Access 125 · ₹88,000',
];

export default function Topbar({ active }) {
  const { user } = useAuth();
  const ticker = TICKER_ITEMS.join('  ·  ') + '  ·  ';
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });

  const PAGE_LABELS = {
    dashboard: 'Dashboard', sales: 'Sales', service: 'Service',
    vehicles: 'Vehicles', parts: 'Parts', customers: 'Customers',
    reports: 'Reports', staff: 'Staff', import: 'Import data',
  };

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Price ticker */}
      <div style={{
        height: 28, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', overflow: 'hidden',
      }}>
        <div style={{
          flexShrink: 0, padding: '0 12px',
          borderRight: '1px solid var(--border)',
          fontSize: 9, letterSpacing: '.1em', color: 'var(--accent)', fontWeight: 700,
        }}>LIVE</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div className="ticker-inner" style={{ display: 'flex', whiteSpace: 'nowrap' }}>
            {[ticker, ticker].map((t, i) => (
              <span key={i} style={{
                display: 'inline-block', padding: '0 48px',
                fontSize: 10, letterSpacing: '.06em',
                color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Page header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 46,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em' }}>
            {PAGE_LABELS[active] || 'Dashboard'}
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{dateStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dot dot-green pulse" />
          <span className="label-xs">System live</span>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          <Avatar name={user?.name} size={28} />
        </div>
      </div>
    </div>
  );
}
