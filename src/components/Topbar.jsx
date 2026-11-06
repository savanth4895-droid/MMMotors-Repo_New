import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';

export default function Topbar({ active, onMenuToggle }) {
  const { user } = useAuth();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });

  const PAGE_LABELS = {
    dashboard: 'Dashboard', sales: 'Sales', service: 'Service',
    vehicles: 'Vehicles', parts: 'Parts', customers: 'Customers',
    reports: 'Reports', staff: 'Staff', import: 'Import data',
    vendors: 'Vendors', 'purchase-bills': 'Purchase Bills',
    debt: 'Debt Ledger', 'service-due': 'Service Due',
    expenses: 'Expenses', 'accident-estimate': 'Accident Estimate',
    'badge-types': 'Badge Types',
  };
  const pageLabel = PAGE_LABELS[active] || 'Dashboard';

  // Each screen names its own browser tab, so several open tabs can be told apart.
  useEffect(() => {
    document.title = `${pageLabel} · MM Motors`;
  }, [pageLabel]);

  return (
    <header className="topbar-bar">
      <div className="topbar-left">
        {/* Hamburger — visible only on small screens via CSS */}
        <button type="button" className="hamburger-btn" onClick={onMenuToggle} aria-label="Open menu">
          <span />
        </button>
        <h1 className="topbar-title">{pageLabel}</h1>
        <time className="topbar-date" dateTime={new Date().toISOString().slice(0, 10)}>{dateStr}</time>
      </div>
      <div className="topbar-right">
        <Avatar name={user?.name} size={32} />
      </div>
    </header>
  );
}
