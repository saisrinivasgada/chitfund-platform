import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { setHubToken, clearHubToken, setHubSaasToken, clearHubSaasToken } from '../../services/api';
import {
  TicketIcon, UsersIcon, MessageSquare, LogOut, Home, Building2,
  CreditCard, Gift, Bell, LifeBuoy, Layers3,
} from 'lucide-react';

export default function HubLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hubUser, setHubUser] = useState(null);
  const [ready, setReady] = useState(false);

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

  const HUB_NAV = [
    { label: 'Support Tickets', to: '/hub/tickets', icon: TicketIcon, show: true },
    { label: 'Team Chat',       to: '/hub/chat',    icon: MessageSquare, show: true },
    { label: 'Employees',       to: '/hub/employees', icon: UsersIcon, show: isSuperAdmin },
  ];

  const SAAS_NAV = [
    { label: 'SaaS Home',     to: '/superadmin', icon: Home },
    { label: 'Organizations', to: '/superadmin/tenants', icon: Building2 },
    { label: 'Plans',         to: '/superadmin/plans', icon: Layers3 },
    { label: 'Billing',       to: '/superadmin/billing', icon: CreditCard },
    { label: 'Promotions',    to: '/superadmin/promotions', icon: Gift },
    { label: 'SaaS Helpdesk', to: '/superadmin/helpdesk', icon: LifeBuoy },
    { label: 'Alerts',        to: '/superadmin/alerts', icon: Bell },
  ];

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
        <aside className="w-56 bg-white border-r border-gray-100 flex flex-col py-4 flex-shrink-0">
          <nav className="flex flex-col gap-0.5 px-3">
            {isSuperAdmin && (
              <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">SaaS control</p>
            )}
            {isSuperAdmin && SAAS_NAV.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/superadmin'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
            <p className="px-3 pt-5 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Hub operations</p>
            {HUB_NAV.filter(n => n.show).map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
