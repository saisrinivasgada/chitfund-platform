import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { selectTenant } from '../services/api';
import { BookOpen, Building2, ChevronRight, Shield, Users, Briefcase } from 'lucide-react';

function roleLabel(role) {
  switch (role) {
    case 'ADMIN':   return 'Administrator';
    case 'MANAGER': return 'Manager';
    case 'STAFF':
    case 'AGENT':   return 'Staff';
    case 'MEMBER':  return 'Member';
    default:        return role;
  }
}

function RoleIcon({ role }) {
  const icon = role === 'ADMIN' ? Shield : role === 'MANAGER' ? Briefcase : role === 'MEMBER' ? Users : Briefcase;
  const Icon = icon;
  return <Icon size={18} />;
}

function OrgCard({ tenant, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer group ${
        selected
          ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 shadow-md'
          : 'border-gray-100 bg-white hover:border-[#1E3A5F]/40 hover:shadow-sm'
      }`}
    >
      {/* Org avatar */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2a4f7c 100%)' }}
      >
        {tenant.name?.[0]?.toUpperCase() ?? '?'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-base truncate">{tenant.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: '#EFF4FA', color: '#1E3A5F' }}>
            <RoleIcon role={tenant.role} />
            {roleLabel(tenant.role)}
          </span>
          <span className="text-xs text-gray-400">@{tenant.slug}</span>
        </div>
      </div>

      <ChevronRight
        size={18}
        className={`transition-colors flex-shrink-0 ${selected ? 'text-[#1E3A5F]' : 'text-gray-300 group-hover:text-gray-500'}`}
      />
    </button>
  );
}

export default function SelectCompanyPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { loginToken, tenants = [] } = location.state ?? {};

  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // If already logged in, redirect
  if (isAuthenticated && user) {
    const dest = user.role === 'MEMBER' ? '/member' : user.role === 'SUPER_ADMIN' ? '/superadmin' : user.role === 'STAFF' ? '/tasks' : '/dashboard';
    return <Navigate to={dest} replace />;
  }

  if (!loginToken || tenants.length === 0) {
    return <Navigate to="/login" replace />;
  }

  async function handleSelect(tenant) {
    setSelected(tenant.tenantId);
    setError('');
    setLoading(true);
    try {
      const authData = await selectTenant({ loginToken, tenantId: tenant.tenantId });
      const accessToken = authData?.accessToken ?? authData?.token;
      const role = authData?.user?.role ?? 'MEMBER';
      const userData = {
        name: authData?.user?.fullName ?? authData?.user?.username,
        role,
        id: authData?.user?.id,
        mustChangePassword: authData?.user?.mustChangePassword ?? false,
      };
      login(accessToken, userData, {
        tenantId:     tenant.tenantId,
        tenantSlug:   tenant.slug,
        tenantName:   tenant.name,
        tenantPlan:   tenant.plan ?? 'BASIC',
        tenantStatus: tenant.status ?? 'ACTIVE',
        planExpiresAt: tenant.planExpiresAt ?? null,
        analyticsEnabled: tenant.analyticsEnabled !== false,
      });
      if (userData.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else if (role === 'MEMBER') {
        navigate('/member', { replace: true });
      } else if (role === 'STAFF' || role === 'AGENT') {
        navigate('/tasks', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setSelected(null);
      setError(err.response?.data?.message ?? 'Could not sign in to this organization. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
          <BookOpen size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>ChitWise</h1>
          <p className="text-xs text-gray-400">Chitfund Management Platform</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EFF4FA]">
            <Building2 size={20} style={{ color: '#1E3A5F' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Choose your organization</h2>
            <p className="text-sm text-gray-500">You have access to {tenants.length} organizations</p>
          </div>
        </div>

        <div className="h-px bg-gray-100 my-6" />

        <div className="space-y-3">
          {tenants.map((tenant) => (
            <OrgCard
              key={tenant.tenantId}
              tenant={tenant}
              selected={selected === tenant.tenantId && loading}
              onClick={() => !loading && handleSelect(tenant)}
            />
          ))}
        </div>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center justify-center gap-2 text-[#1E3A5F] text-sm">
            <div className="w-4 h-4 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
            Signing in…
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate('/login')}
        className="mt-6 text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
      >
        ← Back to login
      </button>
    </div>
  );
}
