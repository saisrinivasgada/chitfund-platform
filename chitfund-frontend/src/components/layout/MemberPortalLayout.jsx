import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, LogOut } from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';

export default function MemberPortalLayout() {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'MEMBER') return <Navigate to="/" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;

  const displayName = user?.fullName ?? user?.name ?? user?.username ?? 'M';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FB' }}>
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
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
              ChitFund
            </span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: '#D4A017' }}
              >
                {initials}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {displayName}
              </span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
