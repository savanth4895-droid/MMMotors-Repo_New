import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/ConfirmModal';
import ErrorBoundary from './components/ErrorBoundary';

import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage   from './pages/ReportsPage';
import ImportPage    from './pages/ImportPage';
import StaffPage     from './pages/StaffPage';
import PartsPage     from './pages/PartsPage';
import ServicePage   from './pages/ServicePage';
import SalesPage     from './pages/SalesPage';
import VehiclesPage  from './pages/VehiclesPage';
import CustomersPage from './pages/CustomersPage';
import Sidebar from './components/Sidebar';
import Topbar  from './components/Topbar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Derive active page from URL — fallback to 'dashboard'
  const active    = location.pathname.replace('/', '').replace(/\//g, '') || 'dashboard';
  const setActive = (page) => navigate('/' + page);

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'var(--muted)', fontSize:12 }}>
      <div style={{ width:28, height:28, border:'2px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      Loading…
    </div>
  );

  if (!user) return <LoginPage />;

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar active={active} setActive={setActive} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }} className="main-content">
        <Topbar active={active} />
        <div style={{ flex:1, overflowY:'auto' }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/"          element={<DashboardPage setActive={setActive} />} />
              <Route path="/dashboard" element={<DashboardPage setActive={setActive} />} />
              <Route path="/sales"     element={<SalesPage />} />
              <Route path="/service"   element={<ServicePage user={user} />} />
              <Route path="/vehicles"  element={<VehiclesPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/parts"     element={<PartsPage />} />
              <Route path="/reports"   element={<ReportsPage />} />
              <Route path="/staff"     element={<StaffPage />} />
              <Route path="/import"    element={<ImportPage />} />
              <Route path="*"          element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <ErrorBoundary>
            <AppLayout />
          </ErrorBoundary>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 3000,
              style: {
                background:'var(--surface)', color:'var(--text)',
                border:'1px solid var(--border)', fontSize:12,
                fontFamily:'IBM Plex Sans,sans-serif',
                boxShadow:'0 4px 20px rgba(0,0,0,.15)',
              },
              success: { iconTheme:{ primary:'var(--green)',   secondary:'var(--surface)' } },
              error:   { iconTheme:{ primary:'var(--red)',     secondary:'var(--surface)' } },
            }}
          />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
