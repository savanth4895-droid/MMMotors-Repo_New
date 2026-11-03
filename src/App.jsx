import { useState, useEffect } from 'react';
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
import BadgeTypesPage from './pages/BadgeTypesPage';
import PartsPage     from './pages/PartsPage';
import ServicePage   from './pages/ServicePage';
import SalesPage     from './pages/SalesPage';
import VehiclesPage  from './pages/VehiclesPage';
import CustomersPage from './pages/CustomersPage';
import DebtPage      from './pages/DebtPage';
import ServiceDuePage from './pages/ServiceDuePage';
import ExpensesPage          from './pages/ExpensesPage';
import AccidentEstimatePage  from './pages/AccidentEstimatePage';
import VendorsPage           from './pages/VendorsPage';
import PurchaseBillsPage     from './pages/PurchaseBillsPage';
import Sidebar from './components/Sidebar';
import Topbar  from './components/Topbar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,          // data considered fresh for 15s
      refetchOnWindowFocus: true,  // refetch when user comes back to the tab
      refetchOnReconnect: true,    // refetch when internet reconnects
    },
  },
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Derive active page from URL — fallback to 'dashboard'
  const active    = location.pathname.replace('/', '').replace(/\//g, '') || 'dashboard';
  const setActive = (page) => { navigate('/' + page); setSidebarOpen(false); };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  if (loading) return (
    <div className="app-loading" role="status">
      <div className="spinner keep-motion" aria-hidden="true" />
      Loading…
    </div>
  );

  if (!user) return <LoginPage />;

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <Sidebar active={active} setActive={setActive} isOpen={sidebarOpen} />
      <div className="main-content">
        <Topbar active={active} onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="main-scroll-area">
          <ErrorBoundary>
            <Routes>
              <Route path="/"          element={<DashboardPage setActive={setActive} />} />
              <Route path="/dashboard" element={<DashboardPage setActive={setActive} />} />
              <Route path="/sales"     element={<SalesPage />} />
              <Route path="/service"   element={<ServicePage user={user} />} />
              <Route path="/vehicles"  element={<VehiclesPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/debt"         element={<DebtPage />} />
              <Route path="/service-due"  element={<ServiceDuePage />} />
              <Route path="/expenses"     element={<ExpensesPage />} />
              <Route path="/accident-estimate" element={<AccidentEstimatePage />} />
              <Route path="/parts"     element={<PartsPage />} />
              <Route path="/vendors"        element={<VendorsPage />} />
              <Route path="/purchase-bills" element={<PurchaseBillsPage />} />
              <Route path="/reports"   element={<ReportsPage />} />
              <Route path="/staff"     element={<StaffPage />} />
              <Route path="/badge-types" element={<BadgeTypesPage />} />
              <Route path="/import"    element={<ImportPage />} />
              <Route path="*"          element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
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
              className: 'toast',
              style: {
                background:'var(--color-ink)', color:'var(--color-paper)',
                fontSize:'var(--text-sm)', fontFamily:'var(--font-body)',
              },
              success: { iconTheme:{ primary:'var(--color-success)', secondary:'var(--color-paper)' } },
              error:   { iconTheme:{ primary:'var(--color-error)',   secondary:'var(--color-paper)' } },
            }}
          />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
