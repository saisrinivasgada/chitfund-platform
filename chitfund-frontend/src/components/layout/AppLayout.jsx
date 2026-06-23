import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';
import NotificationBell from '../notifications/NotificationBell';
import useToast from '../../hooks/useToast';
import { createContext, useContext } from 'react';
import { Menu, BookOpen } from 'lucide-react';

const ToastContext = createContext(null);
export const useToastContext = () => useContext(ToastContext);

export default function AppLayout() {
  const { isAuthenticated, user } = useAuth();
  const { toasts, toast, dismiss } = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close drawer whenever the route changes (tapping a nav link on mobile)
  useEffect(() => {
    setSidebarOpen(false);
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
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Mobile / tablet top header — hidden on desktop */}
          <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-gray-100 flex-shrink-0 z-30 shadow-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            {/* Centre: logo */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                <BookOpen size={14} className="text-white" />
              </div>
              <span
                className="text-base font-bold"
                style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
              >
                ChitWise
              </span>
            </div>

            {/* Right: notification bell */}
            <NotificationBell />
          </header>

          {/* ── Scrollable content ──────────────────────────────────────── */}
          <main
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>

        <Toast toasts={toasts} onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}
