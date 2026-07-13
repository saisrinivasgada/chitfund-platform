import { useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe, mobileLookup, loginByMobile } from '../../services/api';
import { BookOpen, LogOut, RefreshCw, Eye, EyeOff } from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input } from '../ui/FormField';

function SignOutModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white"
        >✕</button>
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FEE2E2' }}>
            <LogOut size={22} style={{ color: '#DC2626' }} />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1" style={{ fontFamily: 'Merriweather, serif' }}>Sign out?</h3>
          <p className="text-sm text-gray-500 mb-6">You'll need to sign in again to access your account.</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
            >Cancel</button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-colors cursor-pointer"
              style={{ backgroundColor: '#DC2626' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B91C1C')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
            >Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchRoleModal({ phone, altRole, altLabel, onClose }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const switchMutation = useMutation({
    mutationFn: () => loginByMobile({ phone, password, role: altRole }),
    onSuccess: (data) => {
      const token = data?.accessToken ?? data?.token;
      const role = data?.user?.role ?? altRole;
      login(token, {
        name: data?.user?.fullName ?? data?.user?.username,
        role,
        id: data?.user?.id,
        mustChangePassword: data?.user?.mustChangePassword ?? false,
      });
      onClose();
      if (role === 'MEMBER') {
        navigate('/member');
      } else {
        navigate('/tasks');
      }
    },
    onError: (e) => {
      setError(e.response?.data?.message ?? 'Invalid password. Please try again.');
    },
  });

  return (
    <Modal title={`Switch to ${altLabel}`} onClose={onClose} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-gray-500 leading-relaxed">
          Enter your password to switch to your <span className="font-semibold text-gray-700">{altLabel}</span> account.
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your password"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') switchMutation.mutate(); }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="muted" size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            loading={switchMutation.isPending}
            disabled={!password.trim()}
            onClick={() => switchMutation.mutate()}
          >
            Switch
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const ROLE_LABELS = {
  WORKER: 'Worker',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
  AGENT: 'Agent',
  MEMBER: 'Member',
};

export default function MemberPortalLayout() {
  const { isAuthenticated, user, logout } = useAuth();
  const [showSwitch, setShowSwitch] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
    enabled: isAuthenticated && user?.role === 'MEMBER',
  });

  const { data: lookup } = useQuery({
    queryKey: ['mobileLookup', me?.phone],
    queryFn: () => mobileLookup(me.phone),
    enabled: !!me?.phone,
  });

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'MEMBER') return <Navigate to="/" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;

  const displayName = user?.fullName ?? user?.name ?? user?.username ?? 'M';
  const initials = displayName.slice(0, 2).toUpperCase();

  // Find the first non-MEMBER account linked to this phone
  const altAccount = lookup?.accounts?.find((a) => a.role !== 'MEMBER');
  const altRole = altAccount?.role;
  const altLabel = altRole ? (ROLE_LABELS[altRole] ?? altRole) : null;

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
              ChitWise
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />

            {/* Role switch button — only shown when user has a staff account on same phone */}
            {altLabel && (
              <button
                onClick={() => setShowSwitch(true)}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1E3A5F] hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer"
                title={`Switch to ${altLabel} account`}
              >
                <RefreshCw size={13} />
                <span className="hidden sm:inline">Switch to {altLabel}</span>
                <span className="sm:hidden">{altLabel}</span>
              </button>
            )}

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
              onClick={() => setShowSignOut(true)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer"
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

      {showSwitch && altRole && me?.phone && (
        <SwitchRoleModal
          phone={me.phone}
          altRole={altRole}
          altLabel={altLabel}
          onClose={() => setShowSwitch(false)}
        />
      )}
      {showSignOut && (
        <SignOutModal
          onConfirm={logout}
          onClose={() => setShowSignOut(false)}
        />
      )}
    </div>
  );
}
