import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { setHubToken, clearHubToken } from '../../services/api';
import { TicketIcon, UsersIcon, MessageSquare, LogOut } from 'lucide-react';

export default function HubLayout() {
  const navigate = useNavigate();
  const [hubUser, setHubUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('hub_token');
    const user = localStorage.getItem('hub_user');
    if (!token) {
      navigate('/hub-login', { replace: true });
      return;
    }
    setHubToken(token);
    if (user) {
      try { setHubUser(JSON.parse(user)); } catch { /* ignore malformed JSON */ }
    }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem('hub_token');
    localStorage.removeItem('hub_user');
    clearHubToken();
    navigate('/hub-login', { replace: true });
  }

  const isSuperAdmin = hubUser?.role === 'SUPER_ADMIN';

  const NAV = [
    { label: 'Support Tickets', to: '/hub/tickets', icon: TicketIcon, show: true },
    { label: 'Team Chat',       to: '/hub/chat',    icon: MessageSquare, show: true },
    { label: 'Employees',       to: '/hub/employees', icon: UsersIcon, show: isSuperAdmin },
  ];

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
            {NAV.filter(n => n.show).map(({ label, to, icon: Icon }) => (
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
