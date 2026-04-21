import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';

const LOGO_SVG = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJmbGV4LXNocmluazowIj48cGF0aCBkPSJNMTAgODUgTDEwIDIwIEw1MCA3MCBMOTAgMjAgTDkwIDg1IiBmaWxsPSJub25lIiBzdHJva2U9InZhcigtLWFjY2VudCkiIHN0cm9rZS13aWR0aD0iNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTI4IDg1IEwyOCA0MiBMNTAgNzAgTDcyIDQyIEw3MiA4NSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ2YXIoLS1hY2NlbnQpIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgb3BhY2l0eT0iMC42Ii8+PC9zdmc+`;

const NAV = [
  { id: 'dashboard', label: 'Dashboard',   roles: ['owner','sales','service_advisor','parts_counter'] },
  { id: 'sales',     label: 'Sales',        roles: ['owner','sales'] },
  { id: 'service',   label: 'Service',      roles: ['owner','service_advisor'] },
  { id: 'vehicles',  label: 'Vehicles',     roles: ['owner','sales'] },
  { id: 'parts',     label: 'Parts',        roles: ['owner','parts_counter'] },
  { id: 'customers', label: 'Customers',    roles: ['owner','sales','service_advisor'] },
  { id: 'reports',   label: 'Reports',      roles: ['owner'] },
  { id: 'staff',     label: 'Staff',        roles: ['owner'] },
  { id: 'import',    label: 'Import data',  roles: ['owner'] },
];

const ROLE_LABELS = {
  owner: 'Owner', sales: 'Sales',
  service_advisor: 'Svc. Advisor', parts_counter: 'Parts',
  technician: 'Technician',
};

export default function Sidebar({ active, setActive }) {
  const { user, logout } = useAuth();
  const allowed = NAV.filter((n) => n.roles.includes(user?.role));

  return (
    <div style={{
      width: 196, minWidth: 196,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100vh',
      position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <img src={LOGO_SVG} alt="MM" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            MM Motors
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--dim)', letterSpacing: '.04em' }}>
          Multi-brand · Bengaluru
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div className="label-xs" style={{ padding: '4px 8px 8px' }}>Navigation</div>
        {allowed.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px',
                background: isActive ? 'var(--surface2)' : 'transparent',
                border: isActive ? '1px solid var(--border2)' : '1px solid transparent',
                borderRadius: 3, cursor: 'pointer', textAlign: 'left', width: '100%',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                transition: 'all 80ms ease', fontFamily: 'IBM Plex Sans, sans-serif',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400 }}>{item.label}</span>
              {isActive && <span style={{ width: 4, height: 4, background: 'var(--accent)', borderRadius: '50%' }} />}
            </button>
          );
        })}
      </nav>

      {/* User card + logout */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          padding: 10, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 3, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Avatar name={user?.name} size={26} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{user?.name}</div>
            <div className="label-xs" style={{ marginTop: 2 }}>{ROLE_LABELS[user?.role]}</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 3,
            padding: 7, fontSize: 11, color: 'var(--dim)',
            cursor: 'pointer', letterSpacing: '.03em', fontFamily: 'IBM Plex Sans, sans-serif',
          }}
        >Sign out</button>
      </div>
    </div>
  );
}
