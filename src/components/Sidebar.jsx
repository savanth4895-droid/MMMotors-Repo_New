import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import Monogram from './Monogram';


const NAV = [
  { id: 'dashboard', label: 'Dashboard',   roles: ['owner','sales','service_advisor','parts_counter'], group: 'front' },
  { id: 'sales',     label: 'Sales',        roles: ['owner','sales'], group: 'sales' },
  { id: 'service',     label: 'Service',       roles: ['owner','service_advisor'], group: 'workshop' },
  { id: 'service-due', label: 'Service Due', roles: ['owner','service_advisor'], group: 'workshop' },
  { id: 'vehicles',  label: 'Vehicles',     roles: ['owner','sales'], group: 'sales' },
  { id: 'parts',     label: 'Parts',        roles: ['owner','parts_counter'], group: 'parts' },
  { id: 'vendors',        label: 'Vendors',        roles: ['owner','parts_counter'], group: 'parts' },
  { id: 'purchase-bills', label: 'Purchase Bills', roles: ['owner','parts_counter'], group: 'parts' },
  { id: 'customers', label: 'Customers',    roles: ['owner','sales','service_advisor'], group: 'sales' },
  { id: 'debt',        label: 'Debt Ledger',  roles: ['owner','sales'], group: 'sales' },
  { id: 'expenses',    label: 'Expenses',     roles: ['owner'], group: 'office' },
  { id: 'accident-estimate', label: 'Accident Estimate', roles: ['owner','service_advisor'], group: 'workshop' },
  { id: 'reports',   label: 'Reports',      roles: ['owner'], group: 'office' },
  { id: 'staff',     label: 'Staff',        roles: ['owner'], group: 'office' },
  { id: 'badge-types', label: 'Badge Types', roles: ['owner'], group: 'office' },
  { id: 'import',    label: 'Import data',  roles: ['owner'], group: 'office' },
];

// Desks, in the order the shop works through them
const GROUPS = [
  { id: 'front',    label: null },
  { id: 'sales',    label: 'Showroom' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'parts',    label: 'Parts counter' },
  { id: 'office',   label: 'Office' },
];

const ROLE_LABELS = {
  owner: 'Owner', sales: 'Sales',
  service_advisor: 'Svc. Advisor', parts_counter: 'Parts',
  technician: 'Technician',
};

export default function Sidebar({ active, setActive, isOpen }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const allowed = (() => {
    // Owner always gets everything
    if (user?.role === 'owner') return NAV;
    // Only show pages explicitly granted by the owner — no role-based fallback
    if (Array.isArray(user?.allowed_pages)) {
      return NAV.filter(n => user.allowed_pages.includes(n.id));
    }
    return []; // no access until owner assigns pages
  })();

  // Derive active page from URL
  const currentPage = location.pathname.replace('/', '') || 'dashboard';

  return (
    <aside className={`sidebar-nav${isOpen ? ' open' : ''}`} aria-label="Main">
      <a
        href="/dashboard"
        className="sidebar-brand"
        aria-label="MM Motors, dashboard"
        onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}
      >
        <Monogram className="sidebar-brand-mark" />
        <span>
          <span className="sidebar-brand-name" style={{ display: 'block' }}>MM Motors</span>
          <span className="sidebar-brand-place" style={{ display: 'block' }}>Multi-brand, Malur</span>
        </span>
      </a>

      <nav className="sidebar-nav-scroll">
        {GROUPS.map((g) => {
          const items = allowed.filter((n) => n.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="nav-group" role="group" aria-label={g.label || 'Overview'}>
              {g.label && <div className="nav-group-label">{g.label}</div>}
              {items.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="nav-link"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => navigate('/' + item.id)}
                  >{item.label}</button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-account">
        <Avatar name={user?.name} size={30} />
        <div className="sidebar-account-who">
          <div className="sidebar-account-name">{user?.name}</div>
          <div className="sidebar-account-meta">
            <span className="sidebar-account-role">{ROLE_LABELS[user?.role]}</span>
            <button type="button" className="sign-out" onClick={logout}>Sign out</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
