import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { setHubToken, clearHubToken, setHubSaasToken, clearHubSaasToken } from '../../services/api';
import { TicketIcon, UsersIcon, MessageSquare, LogOut, Settings, Menu, X } from 'lucide-react';

const INACTIVITY_MS = 15 * 60 * 1000;

export default function HubLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hubUser, setHubUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      const perms = new Set(parsed.customPermissions ?? []);
      if (location.pathname.startsWith('/superadmin') && !saasToken && !perms.has('PLATFORM_CONSOLE_ACCESS')) {
        navigate('/hub', { replace: true });
        return;
      }
      if (location.pathname.startsWith('/superadmin') && perms.has('PLATFORM_CONSOLE_ACCESS') && !saasToken) {
        navigate('/hub-login', { replace: true });
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

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  function handleLogout() {
    sessionStorage.removeItem('hub_token');
    sessionStorage.removeItem('hub_saas_token');
    localStorage.removeItem('hub_user');
    clearHubToken();
    clearHubSaasToken();
    navigate('/hub-login', { replace: true });
  }

  const isSuperAdmin = hubUser?.role === 'SUPER_ADMIN';
  const customPermissions = new Set(hubUser?.customPermissions ?? []);
  const hasPlatformAccess = isSuperAdmin || customPermissions.has('PLATFORM_CONSOLE_ACCESS');
  const isSaasAdministration = location.pathname.startsWith('/superadmin');
  const isWorkspace = location.pathname.startsWith('/hub/tickets') || location.pathname.startsWith('/hub/chat');

  const HUB_NAV = [
    { label: 'Platform Console', to: '/superadmin',    icon: Settings,     show: hasPlatformAccess },
    { label: 'Tickets',          to: '/hub/tickets',   icon: TicketIcon,   show: true },
    { label: 'Team Chat',        to: '/hub/chat',      icon: MessageSquare, show: true },
    { label: 'Employees',        to: '/hub/employees', icon: UsersIcon,    show: isSuperAdmin },
  ];

  const initials = hubUser?.username ? hubUser.username[0].toUpperCase() : 'H';
  const visibleNav = HUB_NAV.filter(n => n.show);
  const navLinks = (closeMenu = false) => visibleNav.map(({ label, to, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={closeMenu ? () => setMenuOpen(false) : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          isActive ? 'bg-[#1E3A5F] text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon size={17} className="flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  ));

  if (!ready) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col lg:flex-row overflow-hidden">
      <header className="lg:hidden flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open Hub navigation"
          className="flex-shrink-0 p-2 -ml-2 rounded-lg text-[#1E3A5F] hover:bg-gray-100">
          <Menu size={21} />
        </button>
        <img src="/hub-logo.svg" alt="" className="w-7 h-7 rounded-lg" onError={(e) => { e.target.style.display = 'none'; }} />
        <span className="min-w-0 truncate text-sm font-bold text-[#1E3A5F]" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise Hub</span>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 w-full h-full bg-black/40" aria-label="Close Hub navigation" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-[min(18rem,85vw)] bg-white shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-label="Hub navigation">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="font-bold text-[#1E3A5F]">ChitWise Hub</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="p-2 rounded-lg hover:bg-gray-100"><X size={19} /></button>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">{navLinks(true)}</nav>
            <div className="border-t border-gray-100 p-3">
              <p className="px-3 pb-2 text-xs font-semibold text-gray-500 truncate">{hubUser?.username}</p>
              <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600"><LogOut size={16} />Sign out</button>
            </div>
          </aside>
        </div>
      )}
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
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
          {navLinks()}
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
          <button type="button" onClick={() => navigate('/delete-account?source=hub')}
            className="px-3 py-1 text-xs font-medium text-[#1E3A5F] underline hover:text-red-700">
            Privacy and account deletion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 min-w-0 min-h-0 ${isWorkspace ? 'overflow-hidden p-0' : isSaasAdministration ? 'overflow-auto p-0' : 'overflow-auto p-3 sm:p-6'}`}>
        <Outlet />
      </main>
    </div>
  );
}
