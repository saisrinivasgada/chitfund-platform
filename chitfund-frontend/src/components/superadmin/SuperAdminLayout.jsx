import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useInactivityLogout from '../../hooks/useInactivityLogout';
import {
  superAdminListTenants,
  superAdminListRenewalRequests,
  superAdminListUpgradeRequests,
} from '../../services/api';
import { BookOpen } from 'lucide-react';
import SuperAdminProfileModal from './SuperAdminProfileModal';
import SignOutConfirmModal from './SignOutConfirmModal';

const NAV = [
  { label: 'Home',       to: '/superadmin' },
  { label: 'Orgs',       to: '/superadmin/tenants' },
  { label: 'Plans',      to: '/superadmin/plans' },
  { label: 'Billing',    to: '/superadmin/billing' },
  { label: 'Promotions', to: '/superadmin/promotions' },
  { label: 'Alerts',     to: '/superadmin/alerts', badge: true },
];

export default function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useInactivityLogout();

  const [showProfile, setShowProfile] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    Promise.all([
      superAdminListTenants({}).catch(() => []),
      superAdminListRenewalRequests().catch(() => []),
      superAdminListUpgradeRequests().catch(() => []),
    ]).then(([tenants, renewals, upgrades]) => {
      const now = new Date();
      const renewalIds = new Set((renewals ?? []).map(r => r.id));
      const pending = (tenants ?? []).filter(t => t.status === 'PENDING').length;
      const expired = (tenants ?? []).filter(t =>
        t.planExpiresAt && new Date(t.planExpiresAt) < now && t.status === 'ACTIVE' && !renewalIds.has(t.id)
      ).length;
      const expiring = (tenants ?? []).filter(t => {
        if (!t.planExpiresAt || t.status !== 'ACTIVE' || renewalIds.has(t.id)) return false;
        const d = (new Date(t.planExpiresAt) - now) / 86400000;
        return d >= 0 && d <= 14;
      }).length;
      setAlertCount(pending + expired + expiring + (renewals?.length ?? 0) + (upgrades?.length ?? 0));
    });
  }, []);

  function isActive(to) {
    if (to === '/superadmin') return location.pathname === '/superadmin';
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
              <BookOpen size={17} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Super Admin</span>
            </div>
          </div>
          <nav className="flex items-center gap-0.5 sm:gap-1 ml-1 sm:ml-2">
            {NAV.map(({ label, to, badge }) => (
              <Link
                key={to}
                to={to}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 ${
                  isActive(to)
                    ? 'font-semibold text-[#1E3A5F] bg-[#EFF4FA]'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {label}
                {badge && alertCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white text-sm font-bold hover:opacity-80 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
          >
            {user?.username ? user.username[0].toUpperCase() : 'S'}
          </button>
          <button
            type="button"
            onClick={() => setShowSignOut(true)}
            className="hidden sm:block text-sm text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {showProfile && <SuperAdminProfileModal onClose={() => setShowProfile(false)} />}
      {showSignOut && (
        <SignOutConfirmModal
          onConfirm={() => { logout(); navigate('/login', { replace: true }); }}
          onCancel={() => setShowSignOut(false)}
        />
      )}

      <Outlet />
    </div>
  );
}
