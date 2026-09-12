import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { setHubToken, clearHubToken, setHubSaasToken, clearHubSaasToken } from '../../services/api';
import {
  TicketIcon, UsersIcon, MessageSquare, LogOut, Settings,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

export default function HubLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hubUser, setHubUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('hub_sidebar_collapsed') === 'true',
  );

  useEffect(() => {
    const token = localStorage.getItem('hub_token');
    const saasToken = localStorage.getItem('hub_saas_token');
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

  function handleLogout() {
    localStorage.removeItem('hub_token');
    localStorage.removeItem('hub_saas_token');
    localStorage.removeItem('hub_user');
    clearHubToken();
    clearHubSaasToken();
    navigate('/hub-login', { replace: true });
  }

  const isSuperAdmin = hubUser?.role === 'SUPER_ADMIN';
  const isSaasAdministration = location.pathname.startsWith('/superadmin');

  const HUB_NAV = [
    { label: 'Platform Console', to: '/superadmin', icon: Settings, show: isSuperAdmin },
    { label: 'Support Tickets', to: '/hub/tickets', icon: TicketIcon, show: true },
    { label: 'Team Chat',       to: '/hub/chat',    icon: MessageSquare, show: true },
    { label: 'Employees',       to: '/hub/employees', icon: UsersIcon, show: isSuperAdmin },
  ];

  function toggleSidebar() {
    setCollapsed((current) => {
      localStorage.setItem('hub_sidebar_collapsed', String(!current));
      return !current;
    });
  }

  if (!ready) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navbar */}
      <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6 gap-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            C
          </div>
          <span className="font-bold text-gray-900 text-sm" style={{ fontFamily: 'Merriweather, serif' }}>
            ChitWise Hub
          </span>
        </div>
        <div className="flex-1" />
        {hubUser && (
          <span className="text-sm text-gray-500">
            {hubUser.username}
            {hubUser.role && (
              <span className="ml-1.5 text-xs bg-[#1E3A5F]/10 text-[#1E3A5F] px-2 py-0.5 rounded-full font-medium">
                {hubUser.role.replace('_', ' ')}
              </span>
            )}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-white border-r border-gray-100 flex flex-col py-3 flex-shrink-0 transition-[width] duration-200`}>
          <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'} px-3 pb-3`}>
            <button
              type="button"
              onClick={toggleSidebar}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#1E3A5F] hover:bg-gray-50 transition-colors"
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-2">
            {HUB_NAV.filter(n => n.show).map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon size={17} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className={`flex-1 overflow-auto ${isSaasAdministration ? 'p-0' : 'p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
