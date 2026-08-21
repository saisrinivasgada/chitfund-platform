import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  superAdminListTenants,
  superAdminActivateTenant,
  superAdminSuspendTenant,
  superAdminUpdatePlan,
  superAdminGetAdminCredentials,
  superAdminProxyAs,
  superAdminCancelTenant,
  superAdminResumeTenant,
} from '../../services/api';
import {
  Building2, CheckCircle, XCircle, Clock, ChevronDown,
  Search, RefreshCw, Filter, MoreHorizontal,
  Phone, PlusCircle, Copy, Check as CheckIcon, Eye, LogIn,
} from 'lucide-react';
import ManageCreditModal from '../../components/superadmin/ManageCreditModal';

const STATUS_CONFIG = {
  ACTIVE: {
    label: 'Active',
    icon: CheckCircle,
    classes: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  },
  PENDING: {
    label: 'Pending',
    icon: Clock,
    classes: 'bg-amber-50 text-amber-700 border border-amber-100',
  },
  SUSPENDED: {
    label: 'Suspended',
    icon: XCircle,
    classes: 'bg-red-50 text-red-700 border border-red-100',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    classes: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

const PLAN_CLASSES = {
  BASIC:      'bg-gray-100 text-gray-600',
  PRO:        'bg-blue-50 text-blue-700',
  ENTERPRISE: 'bg-purple-50 text-purple-700',
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.classes}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function PlanBadge({ plan }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PLAN_CLASSES[plan] ?? PLAN_CLASSES.BASIC}`}>
      {plan}
    </span>
  );
}


function CredentialField({ label, value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
        <code className="flex-1 text-sm font-mono text-gray-900 select-all">{value ?? '—'}</code>
        {value && (
          <button type="button" onClick={copy} className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            {copied ? <CheckIcon size={15} className="text-emerald-500" /> : <Copy size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function CredentialsModal({ creds, onClose }) {
  const hasPassword = !!creds.adminTempPassword;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Org activated!</h3>
            <p className="text-xs text-gray-500">Share these credentials with the admin to log in.</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-800">
          {hasPassword
            ? 'These credentials are shown here until the admin changes their password. You can retrieve them again from the org\'s ⋯ menu.'
            : 'This admin has already set their own password — the temporary password is no longer available.'}
        </div>

        <CredentialField label="Username" value={creds.adminUsername} />
        {hasPassword
          ? <CredentialField label="Temporary password" value={creds.adminTempPassword} />
          : <div className="mb-4 text-sm text-gray-500 italic">Password already changed by admin.</div>
        }

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-3 rounded-xl text-white text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}


const PROXY_ROLES = [
  { value: 'ADMIN',   label: 'Admin',   color: 'text-purple-700' },
  { value: 'STAFF',   label: 'Staff',   color: 'text-blue-700' },
  { value: 'MANAGER', label: 'Manager', color: 'text-indigo-700' },
  { value: 'MEMBER',  label: 'Member',  color: 'text-gray-700' },
];

function TenantRow({ tenant, onAction, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [proxyMenuOpen, setProxyMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0, openUp: false });

  function openMenu() {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const menuHeight = 220; // approximate dropdown height
      const openUp = rect.bottom + menuHeight > window.innerHeight;
      setMenuPos({
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
        openUp,
      });
    }
    setMenuOpen(v => !v);
    setPlanMenuOpen(false);
  }

  return (
    <tr
      className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors group cursor-pointer"
      onClick={(e) => { if (!e.target.closest('button, a, select')) onNavigate(tenant.id); }}
    >
      <td className="px-6 py-4">
        <button
          type="button"
          onClick={() => onNavigate(tenant.id)}
          className="flex items-center gap-3 text-left cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
          >
            {tenant.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">{tenant.name}</p>
            <p className="text-xs text-gray-400 font-mono">@{tenant.slug}</p>
          </div>
        </button>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge status={tenant.status} />
          {tenant.cancellationRequestedAt && (
            <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">
              Cancels {tenant.planExpiresAt ? new Date(tenant.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'at expiry'}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => { setPlanMenuOpen((v) => !v); setMenuOpen(false); }}
            className="inline-flex items-center gap-1 cursor-pointer"
          >
            <PlanBadge plan={tenant.plan} />
            <ChevronDown size={12} className="text-gray-400" />
          </button>
          {planMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setPlanMenuOpen(false); }} />
              <div className="absolute left-0 mt-1 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 min-w-[130px]">
                {['BASIC', 'PRO', 'ENTERPRISE'].filter((p) => p !== tenant.plan).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onAction('plan', tenant.id, p); setPlanMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    Change to <strong>{p}</strong>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">{tenant.memberCount ?? '—'}</td>
      <td className="px-4 py-4 text-xs text-gray-400">
        {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
      </td>
      <td className="px-4 py-4 text-xs max-w-[200px]">
        {tenant.contactEmail && (
          <a href={`mailto:${tenant.contactEmail}`} className="text-gray-500 hover:text-blue-600 truncate block">{tenant.contactEmail}</a>
        )}
        {tenant.contactPhone && (
          <a href={`tel:${tenant.contactPhone}`} className="text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-0.5">
            <Phone size={10} />
            {tenant.contactPhone}
          </a>
        )}
        {!tenant.contactEmail && !tenant.contactPhone && <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-4 text-xs">
        {tenant.planExpiresAt ? (
          <span className={
            new Date(tenant.planExpiresAt) < new Date()
              ? 'text-red-600 font-medium'
              : new Date(tenant.planExpiresAt) - new Date() < 7 * 86400 * 1000
              ? 'text-amber-600 font-medium'
              : 'text-gray-400'
          }>
            {new Date(tenant.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ) : (
          <span className="text-gray-300">No expiry</span>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          {/* Prominent activate button for pending orgs */}
          {tenant.status === 'PENDING' && (
            <button
              type="button"
              onClick={() => onAction('activate', tenant.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer transition-colors"
            >
              <CheckCircle size={13} />
              Activate
            </button>
          )}
          <div className="relative">
            <button
              ref={menuBtnRef}
              type="button"
              onClick={openMenu}
              className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors text-gray-400 hover:text-gray-700"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setProxyMenuOpen(false); }} />
                <div className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 min-w-[175px]" style={{ top: menuPos.top, right: menuPos.right }}>
                  {tenant.status !== 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => { onAction('activate', tenant.id); setMenuOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer font-medium"
                    >
                      Activate
                    </button>
                  )}
                  {tenant.status !== 'SUSPENDED' && (
                    <button
                      type="button"
                      onClick={() => { onAction('suspend', tenant.id); setMenuOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer font-medium"
                    >
                      Suspend
                    </button>
                  )}
                  {tenant.status === 'ACTIVE' && (
                    tenant.cancellationRequestedAt ? (
                      <button
                        type="button"
                        onClick={() => { onAction('resume', tenant.id); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer font-medium"
                      >
                        Resume subscription
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { onAction('cancel', tenant.id); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 cursor-pointer font-medium"
                      >
                        Schedule cancellation
                      </button>
                    )
                  )}
                  <div className="border-t border-gray-50 my-1" />
                  <button
                    type="button"
                    onClick={() => { onAction('viewCredentials', tenant.id); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                  >
                    <Eye size={13} />
                    View credentials
                  </button>
                  {/* Proxy as submenu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProxyMenuOpen(v => !v)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                    >
                      <LogIn size={13} />
                      Proxy as
                      <ChevronDown size={12} className="ml-auto" />
                    </button>
                    {proxyMenuOpen && (
                      <div className="absolute right-full top-0 mr-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 min-w-[130px] z-30">
                        {PROXY_ROLES.map(r => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => { onAction('proxy', tenant.id, r.value); setMenuOpen(false); setProxyMenuOpen(false); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer font-medium ${r.color}`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-gray-50 my-1" />
                  <button
                    type="button"
                    onClick={() => { onAction('addCredit', tenant.id); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer flex items-center gap-2"
                  >
                    <PlusCircle size={13} />
                    Manage Credits
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function SuperAdminTenantsPage() {
  const navigate        = useNavigate();
  const [tenants, setTenants]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [toast, setToast]       = useState('');
  const [creditTenant, setCreditTenant] = useState(null);
  const [activationCreds, setActivationCreds] = useState(null); // { adminUsername, adminTempPassword }
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await superAdminListTenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load tenants', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleAction(action, tenantId, extra) {
    if (action === 'addCredit') {
      const t = tenants.find(x => x.id === tenantId);
      if (t) setCreditTenant(t);
      return;
    }
    if (action === 'viewCredentials') {
      try {
        const creds = await superAdminGetAdminCredentials(tenantId);
        setActivationCreds({ adminUsername: creds.username, adminTempPassword: creds.tempPassword });
      } catch (err) {
        showToast(err.response?.data?.message ?? 'Could not fetch credentials');
      }
      return;
    }
    if (action === 'proxy') {
      try {
        const t = tenants.find(x => x.id === tenantId);
        const { token, tenantSlug } = await superAdminProxyAs(tenantId, extra);
        // Open proxy session in a new tab — pass tenant metadata from loaded state
        let url = `${window.location.origin}/proxy?token=${encodeURIComponent(token)}&role=${extra}&slug=${tenantSlug}`;
        if (t?.name) url += `&tenantName=${encodeURIComponent(t.name)}`;
        if (t?.planExpiresAt) url += `&planExpiresAt=${encodeURIComponent(t.planExpiresAt)}`;
        window.open(url, '_blank');
      } catch (err) {
        showToast(err.response?.data?.message ?? `No ${extra} user found in this org`);
      }
      return;
    }
    try {
      if (action === 'activate') {
        const result = await superAdminActivateTenant(tenantId);
        // Only show credentials on first-time activation (new admin created), not on re-activation after suspension
        if (!result.adminAlreadyExisted) {
          setActivationCreds({ adminUsername: result.adminUsername, adminTempPassword: result.adminTempPassword });
        } else {
          showToast('Tenant activated');
        }
        load();
        return;
      }
      if (action === 'suspend')   await superAdminSuspendTenant(tenantId);
      if (action === 'plan')      await superAdminUpdatePlan(tenantId, extra);
      if (action === 'cancel')    await superAdminCancelTenant(tenantId);
      if (action === 'resume')    await superAdminResumeTenant(tenantId);
      showToast(
        action === 'suspend' ? 'Tenant suspended' :
        action === 'cancel'  ? 'Cancellation scheduled' :
        action === 'resume'  ? 'Subscription resumed' :
        `Plan updated to ${extra}`
      );
      load();
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Action failed');
    }
  }

  const filtered = tenants.filter((t) => {
    if (statusFilter === '__CANCEL__') return !!t.cancellationRequestedAt;
    if (!statusFilter && t.status === 'REJECTED') return false;
    if (statusFilter && statusFilter !== '__CANCEL__' && t.status !== statusFilter) return false;
    return !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.slug?.toLowerCase().includes(search.toLowerCase());
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = {
    total:               tenants.filter((t) => t.status !== 'REJECTED').length,
    active:              tenants.filter((t) => t.status === 'ACTIVE').length,
    pending:             tenants.filter((t) => t.status === 'PENDING').length,
    suspended:           tenants.filter((t) => t.status === 'SUSPENDED').length,
    rejected:            tenants.filter((t) => t.status === 'REJECTED').length,
    cancellationPending: tenants.filter((t) => t.cancellationRequestedAt).length,
  };

  return (
    <>
      {activationCreds && (
        <CredentialsModal creds={activationCreds} onClose={() => setActivationCreds(null)} />
      )}
      {creditTenant && (
        <ManageCreditModal
          tenant={creditTenant}
          onClose={() => setCreditTenant(null)}
          onSuccess={(msg) => { showToast(msg); setCreditTenant(null); load(); }}
        />
      )}

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Organizations</h1>
            <p className="text-sm text-gray-500 mt-1">Manage all tenant organizations on the platform</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats row — clickable to filter */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total',                value: stats.total,               color: '#1E3A5F',  filterVal: '' },
            { label: 'Active',               value: stats.active,              color: '#16A34A',  filterVal: 'ACTIVE' },
            { label: 'Pending',              value: stats.pending,             color: '#D97706',  filterVal: 'PENDING' },
            { label: 'Suspended',            value: stats.suspended,           color: '#DC2626',  filterVal: 'SUSPENDED' },
            { label: 'Cancel Pending',       value: stats.cancellationPending, color: '#B45309',  filterVal: '__CANCEL__' },
          ].map(({ label, value, color, filterVal }) => {
            const isActive = statusFilter === filterVal;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStatusFilter(filterVal)}
                className={`bg-white rounded-2xl p-5 border shadow-sm text-left cursor-pointer transition-all ${
                  isActive ? 'border-[#1E3A5F] ring-2 ring-[#1E3A5F]/20' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
                <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                {isActive && <p className="text-xs text-gray-400 mt-1">Filtered ✓</p>}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug…"
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
            />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-8 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] appearance-none cursor-pointer"
            >
              <option value="">All (excl. rejected)</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Building2 size={36} className="mb-3 opacity-30" />
              <p className="text-sm">{search ? 'No organizations match your search' : 'No organizations yet'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Organization', 'Status', 'Plan', 'Members', 'Registered', 'Contact', 'Expiry', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide first:px-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} onAction={handleAction} onNavigate={(id) => navigate(`/superadmin/tenants/${id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-400">
            {filtered.length} organization{filtered.length !== 1 ? 's' : ''} · page {page} of {Math.max(1, totalPages)}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, idx, arr) => (
                <span key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-gray-400 self-center">…</span>}
                  <button type="button" onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-xs rounded-lg border cursor-pointer ${p === page ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>{p}</button>
                </span>
              ))}
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Next</button>
            </div>
          )}
        </div>

        {/* Rejected requests link */}
        {stats.rejected > 0 && !statusFilter && (
          <div className="mt-4 text-center">
            <button type="button" onClick={() => setStatusFilter('REJECTED')}
              className="text-xs text-gray-400 hover:text-red-600 cursor-pointer transition-colors underline underline-offset-2">
              View {stats.rejected} rejected request{stats.rejected !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg animate-fade-in">
          <CheckCircle size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
}
