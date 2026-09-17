import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { setHubToken, clearHubToken, setHubSaasToken, clearHubSaasToken } from '../../services/api';
import { TicketIcon, UsersIcon, MessageSquare, LogOut, Settings } from 'lucide-react';

const INACTIVITY_MS = 15 * 60 * 1000;

export default function HubLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hubUser, setHubUser] = useState(null);
  const [ready, setReady] = useState(false);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    localStorage.removeItem('hub_token');

    const token = sessionStorage.getItem('hub_token');
    const saasToken = sessionStorage.getItem('hub_saas_token');
    const user = localStorage.getItem('hub_user');
    if (!token || !user) {
      navigate('/hub-login', { replace: true });
      return;
    }
    setHubToken(token);
    setHubSaasToken(saasToken);
    try {
      const parsed = JSON.parse(user);
      if (parsed.mustChangePassword) {
        navigate('/hub/change-password', { replace: true });
        return;
      }
      if (parsed.role === 'SUPER_ADMIN' && !saasToken) {
        navigate('/hub-login', { replace: true });
        return;
      }
      if (parsed.role !== 'SUPER_ADMIN' && location.pathname.startsWith('/superadmin')) {
        navigate('/hub', { replace: true });
        return;
      }
      setHubUser(parsed);
      setReady(true);
    } catch {
      navigate('/hub-login', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!ready) return;
    const resetTimer = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        sessionStorage.removeItem('hub_token');
        sessionStorage.removeItem('hub_saas_token');
        localStorage.removeItem('hub_user');
        clearHubToken();
        clearHubSaasToken();
        navigate('/hub-login?reason=inactivity', { replace: true });
      }
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearInterval(interval);
    };
  }, [ready, navigate]);

  function handleLogout() {
    sessionStorage.removeItem('hub_token');
    sessionStorage.removeItem('hub_saas_token');
    localStorage.removeItem('hub_user');
    clearHubToken();
    clearHubSaasToken();
    navigate('/hub-login', { replace: true });
  }

  const isSuperAdmin = hubUser?.role === 'SUPER_ADMIN';
  const isSaasAdministration = location.pathname.startsWith('/superadmin');

  const HUB_NAV = [
    { label: 'Platform Console', to: '/superadmin',    icon: Settings,     show: isSuperAdmin },
    { label: 'Tickets',          to: '/hub/tickets',   icon: TicketIcon,   show: true },
    { label: 'Team Chat',        to: '/hub/chat',      icon: MessageSquare, show: true },
    { label: 'Employees',        to: '/hub/employees', icon: UsersIcon,    show: isSuperAdmin },
  ];

  const initials = hubUser?.username ? hubUser.username[0].toUpperCase() : 'H';

  if (!ready) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="py-4 px-4 border-b border-gray-100 flex items-center gap-2.5 flex-shrink-0">
          <img
            src="/hub-logo.svg"
            alt="ChitWise Hub"
            className="w-8 h-8 rounded-lg"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1
            className="text-base font-bold leading-tight"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            ChitWise Hub
          </h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {HUB_NAV.filter(n => n.show).map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon size={17} className="flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="py-4 px-3 border-t border-gray-100 flex-shrink-0 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{hubUser?.username}</p>
              {hubUser?.role && (
                <p className="text-xs font-medium text-[#1E3A5F] leading-tight">
                  {hubUser.role.replace('_', ' ')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
          >
            <LogOut size={16} className="flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 overflow-auto ${isSaasAdministration ? 'p-0' : 'p-6'}`}>
        <Outlet />
      </main>
    </div>
  );
}
