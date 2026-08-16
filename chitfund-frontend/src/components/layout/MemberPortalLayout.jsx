import { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe, mobileLookup, loginByMobile, generateTransferToken, selectTenant } from '../../services/api';
import { BookOpen, LogOut, RefreshCw, Eye, EyeOff, Building2, ChevronDown } from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input } from '../ui/FormField';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

function SignOutModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ padding: 40 }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white"
        >✕</button>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 56, height: 56, backgroundColor: '#FEE2E2', marginBottom: 20 }}>
            <LogOut size={24} style={{ color: '#DC2626' }} />
          </div>
          <h3 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif', marginBottom: 8 }}>Sign out?</h3>
          <p className="text-sm text-gray-500" style={{ marginBottom: 32 }}>You'll need to sign in again to access your account.</p>
          <div className="flex w-full" style={{ gap: 16 }}>
            <button
              onClick={onClose}
              className="flex-1 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              style={{ paddingTop: 14, paddingBottom: 14 }}
            >Cancel</button>
            <button
              onClick={onConfirm}
              className="flex-1 text-sm font-medium text-white rounded-xl cursor-pointer"
              style={{ paddingTop: 14, paddingBottom: 14, backgroundColor: '#DC2626' }}
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

function SwitchOrgModal({ currentTenantId, currentTenantName, onClose }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState(null);
  const [loginToken, setLoginToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await generateTransferToken();
        setLoginToken(data.loginToken);
        setTenants((data.tenants ?? []).filter((t) => t.tenantId !== currentTenantId));
      } catch (err) {
        setError(err?.response?.data?.message ?? 'Could not load your organizations.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentTenantId]);

  async function handleSwitch(tenant) {
    setSwitching(tenant.tenantId);
    try {
      const data = await selectTenant({ loginToken, tenantId: tenant.tenantId });
      const accessToken = data.accessToken ?? data.token;
      // AuthResponse has no tenant fields — use the tenant object from the list
      login(accessToken, {
        name: data.user?.fullName ?? data.user?.username,
        role: data.user?.role,
        id: data.user?.id,
        mustChangePassword: data.user?.mustChangePassword ?? false,
      }, {
        tenantId: tenant.tenantId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        tenantPlan: tenant.plan ?? 'BASIC',
        tenantStatus: tenant.status ?? 'ACTIVE',
        planExpiresAt: tenant.planExpiresAt ?? null,
      });
      onClose();
      navigate('/member', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to switch organization.');
      setSwitching(null);
    }
  }

  return (
    <Modal title="Switch Organization" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Currently viewing <span className="font-semibold text-gray-700">{currentTenantName}</span>. Select another organization to switch to.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && tenants?.length === 0 && (
          <div className="text-center py-6">
            <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">You're not a member of any other organization.</p>
          </div>
        )}

        {!loading && tenants?.length > 0 && (
          <div className="space-y-2">
            {tenants.map((tenant) => {
              const isExpired = tenant.planExpiresAt && new Date(tenant.planExpiresAt) < new Date();
              const isSuspended = tenant.status === 'SUSPENDED';
              const isBlocked = isExpired || isSuspended;
              const blockLabel = isSuspended ? 'Suspended' : 'Plan expired';
              return (
                <button
                  key={tenant.tenantId}
                  onClick={() => !isBlocked && handleSwitch(tenant)}
                  disabled={!!switching || isBlocked}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                    isBlocked
                      ? 'border-gray-100 bg-gray-50 opacity-70 cursor-not-allowed'
                      : 'border-gray-200 hover:border-[#1E3A5F] hover:bg-[#EFF4FA] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: isBlocked ? '#9CA3AF' : '#1E3A5F', color: 'white' }}
                  >
                    {(tenant.name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{tenant.name}</p>
                    {isBlocked ? (
                      <p className="text-xs text-red-500 mt-0.5 font-medium">{blockLabel} — contact admin</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">{tenant.plan} plan</p>
                    )}
                  </div>
                  {switching === tenant.tenantId ? (
                    <div className="w-4 h-4 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronDown size={16} className={`${isBlocked ? 'text-gray-300' : 'text-gray-400'} -rotate-90 flex-shrink-0`} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="pt-1">
          <Button variant="muted" size="md" className="w-full" onClick={onClose} disabled={!!switching}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const ROLE_LABELS = {
  WORKER: 'Staff',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
  AGENT: 'Agent',
  MEMBER: 'Member',
};

export default function MemberPortalLayout() {
  const { isAuthenticated, user, tenantId, tenantName, logout } = useAuth();
  const [showSwitch, setShowSwitch] = useState(false);
  const [showSwitchOrg, setShowSwitchOrg] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();

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
  if (user?.role !== 'MEMBER') return <Navigate to="/dashboard" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;

  const displayName = user?.fullName ?? user?.name ?? user?.username ?? 'M';
  const initials = displayName.slice(0, 2).toUpperCase();

  // Find the first non-MEMBER account linked to this phone
  const altAccount = lookup?.accounts?.find((a) => a.role !== 'MEMBER');
  const altRole = altAccount?.role;
  const altLabel = altRole ? (ROLE_LABELS[altRole] ?? altRole) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F0F2F5' }}>
      {/* Top nav */}
      <header className="print:hidden bg-white border-b border-gray-100 px-4 sm:px-8 sticky top-0 z-20">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/member')}>
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
            <button
              type="button"
              onClick={toggleHidden}
              title={hidden ? 'Show amounts' : 'Hide amounts'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <NotificationBell />

            {/* Company switcher — shows current org name, click to switch */}
            <button
              onClick={() => setShowSwitchOrg(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1E3A5F] hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer"
              title="Switch organization"
            >
              <Building2 size={13} className="flex-shrink-0" />
              {tenantName && (
                <span className="hidden sm:inline max-w-[120px] truncate">{tenantName}</span>
              )}
              <ChevronDown size={11} className="hidden sm:block text-gray-400 flex-shrink-0" />
            </button>

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

            <Link to="/member/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: '#D4A017' }}
              >
                {initials}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {displayName}
              </span>
            </Link>
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

      <main className="py-6 px-4 sm:px-8 w-full">
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
      {showSwitchOrg && (
        <SwitchOrgModal
          currentTenantId={tenantId}
          currentTenantName={tenantName}
          onClose={() => setShowSwitchOrg(false)}
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
