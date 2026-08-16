import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';
import NotificationBell from '../notifications/NotificationBell';
import useToast from '../../hooks/useToast';
import { createContext, useContext } from 'react';
import { Menu, BookOpen, Eye, EyeOff, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates';

const ToastContext = createContext(null);
export const useToastContext = () => useContext(ToastContext);

export default function AppLayout() {
  const { isAuthenticated, user, tenantName } = useAuth();
  const { toasts, toast, dismiss } = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );
  function toggleSidebarCollapse() {
    setSidebarCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebarCollapsed', next);
      return next;
    });
  }
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();
  useRealtimeUpdates(isAuthenticated);
  const navigate = useNavigate();
  const [planExpiredOpen, setPlanExpiredOpen] = useState(false);

  useEffect(() => {
    const handler = () => setPlanExpiredOpen(true);
    window.addEventListener('plan-expired', handler);
    return () => window.removeEventListener('plan-expired', handler);
  }, []);

  // Close drawer whenever the route changes (tapping a nav link on mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Update browser tab title per route
  useEffect(() => {
    const p = location.pathname;
    const titles = [
      ['/members/', 'Member Detail'],
      ['/members', 'Members'],
      ['/chits/', 'Chit Detail'],
      ['/chits', 'Chits'],
      ['/payments/record', 'Payments — Record'],
      ['/payments/cash-requests', 'Payments — Cash Requests'],
      ['/payments/remittance', 'Payments — Remittance'],
      ['/payments/history', 'Payments — History'],
      ['/payments', 'Payments'],
      ['/payouts', 'Payouts'],
      ['/draws', 'Draws'],
      ['/reports', 'Reports'],
      ['/treasury', 'Treasury'],
      ['/settlement', 'Settlement'],
      ['/team', 'Team'],
      ['/my-account', 'My Account'],
      ['/staff/', 'Staff Detail'],
      ['/transactions/', 'Transaction Detail'],
      ['/dashboard', 'Dashboard'],
    ];
    const match = titles.find(([prefix]) => p === prefix || p.startsWith(prefix));
    document.title = match ? `${match[1]} — ChitWise` : 'ChitWise';
  }, [location.pathname]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'MEMBER') return <Navigate to="/member" replace />;

  return (
    <ToastContext.Provider value={toast}>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FB' }}>

        {/* ── Backdrop — mobile/tablet only ─────────────────────────────── */}
        <div
          className={`fixed inset-0 z-40 bg-black/40 lg:hidden transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Mobile / tablet top header — hidden on desktop */}
          <header className="print:hidden lg:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-gray-100 flex-shrink-0 z-30 shadow-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            {/* Centre: logo + org name */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                <BookOpen size={14} className="text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <span
                  className="text-base font-bold"
                  style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
                >
                  ChitWise
                </span>
                {tenantName && (
                  <span className="text-xs text-gray-400 truncate max-w-[140px]">{tenantName}</span>
                )}
              </div>
            </div>

            {/* Right: notification bell + hide toggle */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleHidden}
                title={hidden ? 'Show amounts' : 'Hide amounts'}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {hidden ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
              <NotificationBell />
            </div>
          </header>

          {/* ── Scrollable content ──────────────────────────────────────── */}
          <main
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="p-4 sm:p-8 lg:p-10 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>


        <Toast toasts={toasts} onDismiss={dismiss} />

        {planExpiredOpen && (
          <Modal title="Subscription Expired" onClose={() => setPlanExpiredOpen(false)} size="sm">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: '#FEE2E2' }}>
                <AlertCircle size={26} style={{ color: '#DC2626' }} />
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-2">Your subscription has expired</p>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                This action is not available while your plan is inactive. Renew your subscription to continue managing chits, members, and transactions.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setPlanExpiredOpen(false)} className="flex-1">Dismiss</Button>
                <button
                  type="button"
                  onClick={() => { setPlanExpiredOpen(false); navigate('/billing'); }}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#DC2626' }}
                >
                  Renew Plan
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </ToastContext.Provider>
  );
}
