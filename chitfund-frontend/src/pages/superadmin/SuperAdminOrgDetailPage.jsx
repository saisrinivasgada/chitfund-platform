import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, BookOpen, Settings, ChevronDown,
  CheckCircle, XCircle, Clock, Edit2, X, UserPlus,
  Shield, Briefcase, User, AlertCircle, Sliders, Trash2, Calendar,
  Copy, Check, KeyRound, LogIn, Lock, LockOpen,
} from 'lucide-react';
import {
  superAdminGetTenant,
  superAdminListOrgUsers,
  superAdminListOrgChits,
  superAdminActivateTenant,
  superAdminSuspendTenant,
  superAdminUpdateTenant,
  superAdminAddOrgUser,
  superAdminGetEffectiveLimits,
  superAdminSetCustomLimits,
  superAdminRemoveCustomLimits,
  superAdminListPlans,
  superAdminSetPlanExpiry,
  superAdminGetDiscount,
  superAdminSetDiscount,
  superAdminRemoveDiscount,
  superAdminSetTenantStatus,
  superAdminReactivateTenant,
  resetMemberPassword,
  superAdminProxyAs,
  lockUser,
  unlockUser,
} from '../../services/api';
import Button from '../../components/ui/Button';
import RecordOrgPaymentModal from '../../components/superadmin/RecordOrgPaymentModal';
import ManageCreditModal from '../../components/superadmin/ManageCreditModal';

const STATUS_CONFIG = {
  ACTIVE:    { label: 'Active',    icon: CheckCircle, cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  PENDING:   { label: 'Pending',   icon: Clock,       cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  SUSPENDED: { label: 'Suspended', icon: XCircle,     cls: 'bg-red-50 text-red-700 border-red-100' },
  REJECTED:  { label: 'Rejected',  icon: XCircle,     cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};
const CHIT_STATUS = {
  ACTIVE:    'bg-emerald-100 text-emerald-700',
  DRAFT:     'bg-gray-100 text-gray-600',
  CLOSED:    'bg-blue-50 text-blue-700',
  PAUSED:    'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-red-100 text-red-600',
};
const ROLE_CONFIG = {
  ADMIN:   { label: 'Admin',   icon: Shield,    cls: 'bg-purple-50 text-purple-700' },
  MANAGER: { label: 'Manager', icon: Briefcase, cls: 'bg-blue-50 text-blue-700' },
  STAFF:   { label: 'Staff',   icon: Users,     cls: 'bg-teal-50 text-teal-700' },
  MEMBER:  { label: 'Member',  icon: User,      cls: 'bg-gray-100 text-gray-600' },
};

const PLAN_LIMITS = {
  BASIC:      { chits: 1, members: 20,  staff: 0, chitTypes: 'RESERVATION only' },
  GROWTH:     { chits: 2, members: 30,  staff: 2, chitTypes: 'Standard' },
  PRO:        { chits: 20, members: 1000, staff: 0, chitTypes: 'Standard, Post-Payout, Reservation' },
  ENTERPRISE: { chits: 3, members: 50,  staff: 3, chitTypes: 'All types' },
};

const PLAN_CHIT_TYPES = {
  BASIC:      ['RESERVATION'],
  GROWTH:     ['RESERVATION'],
  ENTERPRISE: ['RESERVATION'],
  'ENTERPRISE+': ['RESERVATION'],
  CUSTOM:     ['RESERVATION', 'LOTTERY', 'AUCTION'],
  CUSTOM:     [],
};

function UsageBar({ label, used, limit }) {
  const isUnlimited = limit === Infinity;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const danger = pct >= 90;
  const warning = pct >= 70;
  const barColor = danger ? '#EF4444' : warning ? '#F59E0B' : '#10B981';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-500">
          {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </div>
  );
}

function PlanUsageCard({ plan, chits, memberCount, staffCount, effectiveLimits }) {
  const planKey = (plan ?? 'BASIC').toUpperCase();
  const activeChits = chits.filter((c) => c.status === 'ACTIVE').length;

  let chitLimit, memberLimit, staffLimit, chitTypesLabel;
  if (planKey === 'CUSTOM' && effectiveLimits) {
    chitLimit = effectiveLimits.maxActiveChits === -1 ? Infinity : effectiveLimits.maxActiveChits;
    memberLimit = effectiveLimits.maxMembers === -1 ? Infinity : effectiveLimits.maxMembers;
    staffLimit = effectiveLimits.maxStaff === -1 ? Infinity : (effectiveLimits.maxStaff ?? null);
    chitTypesLabel = effectiveLimits.allowedChitTypes ?? 'Custom';
  } else {
    const limits = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.BASIC;
    chitLimit = limits.chits;
    memberLimit = limits.members;
    staffLimit = limits.staff ?? null;
    chitTypesLabel = limits.chitTypes;
  }

  const showStaff = staffLimit !== null;
  const planColor = planKey === 'ENTERPRISE' ? { bg: '#7C3AED20', fg: '#7C3AED' }
                  : planKey === 'GROWTH'     ? { bg: '#10B98120', fg: '#059669' }
                  : planKey === 'CUSTOM'     ? { bg: '#D9770620', fg: '#D97706' }
                  :                            { bg: '#6B728020', fg: '#374151' };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">Plan Usage</p>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: planColor.bg, color: planColor.fg }}>
            {planKey}
          </span>
        </div>
        <span className="text-xs text-gray-400">{chitTypesLabel}</span>
      </div>
      <div className={`grid gap-5 ${showStaff ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <UsageBar label="Active Chits" used={activeChits} limit={chitLimit} />
        <UsageBar label="Members" used={memberCount} limit={memberLimit} />
        {showStaff && <UsageBar label="Staff Accounts" used={staffCount} limit={staffLimit} />}
      </div>
      {planKey === 'CUSTOM' && effectiveLimits?.priceMonthlyInr > 0 && (
        <p className="text-xs text-amber-600 mt-3 font-medium">
          Custom pricing: ₹{(effectiveLimits.priceMonthlyInr / 100).toLocaleString('en-IN')}/month
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.MEMBER;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl">
      {msg}
    </div>
  );
}

function CredentialsPopup({ username, password, onDone, title = 'User Created', subtitle = 'Share these credentials with the user' }) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-5 text-center border-b border-gray-100">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={24} className="text-emerald-600" />
          </div>
          <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Username</p>
              <p className="font-mono font-semibold text-gray-900">{username}</p>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Temporary Password</p>
              <p className="font-mono font-semibold text-gray-900 text-lg tracking-widest">{password}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">User must change this password on first login.</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={copyAll}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Copy Credentials'}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ tenantId, onClose, onSuccess }) {
  const [form, setForm] = useState({ fullName: '', countryCode: '+91', phone: '', email: '', role: 'ADMIN', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await superAdminAddOrgUser(tenantId, {
        fullName: form.fullName,
        phone: form.phone,
        phoneCountryCode: form.countryCode,
        email: form.email || null,
        role: form.role,
        password: form.password || null,
      });
      setCredentials({ username: result.username, password: result.tempPassword });
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to add user');
    } finally {
      setLoading(false);
    }
  }

  if (credentials) {
    return (
      <CredentialsPopup
        username={credentials.username}
        password={credentials.password}
        onDone={() => { onSuccess('User added successfully'); onClose(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Add User to Org</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="e.g. Ravi Kumar"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:border-blue-400">
                <select
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                  className="bg-gray-50 px-2 py-2 text-sm border-r border-gray-200 focus:outline-none text-gray-600 w-20"
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+971">+971</option>
                  <option value="+65">+65</option>
                  <option value="+60">+60</option>
                </select>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                  placeholder="9876543210"
                  type="tel"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              >
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email (optional)</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="ravi@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Initial Password <span className="text-gray-400 font-normal">(auto-generated if empty)</span></label>
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 font-mono"
              placeholder="Leave empty to auto-generate"
            />
          </div>
          <p className="text-xs text-gray-400">Username is auto-generated from the phone number. The user must change their password on first login.</p>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>{loading ? 'Adding…' : 'Add User'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SetExpiryModal({ tenantId, currentExpiry, onClose, onSuccess }) {
  const toInputValue = (iso) => {
    if (!iso) return '';
    return new Date(iso).toISOString().slice(0, 10);
  };
  const default30Days = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };
  const [date, setDate] = useState(currentExpiry ? toInputValue(currentExpiry) : default30Days());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Send as local datetime string — Spring parses LocalDateTime without timezone conversion
      const iso = date ? date + 'T23:59:59' : null;
      await superAdminSetPlanExpiry(tenantId, iso);
      onSuccess(date ? `Plan expiry set to ${date}` : 'Plan expiry cleared');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to update expiry');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Set Plan Expiry Date</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date (leave blank to clear)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <p className="text-xs text-gray-400">
            7-day warning banners will appear for the admin. Org is blocked once the date passes.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>{loading ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CHIT_TYPE_OPTIONS = ['RESERVATION', 'LOTTERY', 'AUCTION'];

function SetCustomLimitsModal({ tenantId, existing, onClose, onSuccess }) {
  const [form, setForm] = useState({
    maxActiveChits: existing?.maxActiveChits ?? 5,
    maxMembers: existing?.maxMembers ?? 100,
    maxStaff: existing?.maxStaff ?? 3,
    analyticsEnabled: existing?.analyticsEnabled ?? false,
    prioritySupport: existing?.prioritySupport ?? false,
    allowedChitTypes: existing?.allowedChitTypes
      ? existing.allowedChitTypes.split(',').map((s) => s.trim()).filter(t => ['RESERVATION','LOTTERY','AUCTION'].includes(t))
      : ['RESERVATION'],
    priceMonthlyInr: existing?.priceMonthlyInr ? existing.priceMonthlyInr / 100 : 0,
    notes: existing?.notes ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetPlan, setResetPlan] = useState('BASIC');
  const [resetting, setResetting] = useState(false);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    superAdminListPlans().then(all => setPlans(all.filter(p => p.isPublic && p.isActive))).catch(() => {});
  }, []);

  async function handleReset() {
    setResetting(true);
    setError('');
    try {
      await superAdminRemoveCustomLimits(tenantId, resetPlan);
      onSuccess(`Limits reset to ${resetPlan} plan defaults`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to reset limits');
    } finally {
      setResetting(false);
    }
  }

  function toggleType(type) {
    setForm((f) => ({
      ...f,
      allowedChitTypes: f.allowedChitTypes.includes(type)
        ? f.allowedChitTypes.filter((t) => t !== type)
        : [...f.allowedChitTypes, type],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.allowedChitTypes.length === 0) {
      setError('Select at least one chit type.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await superAdminSetCustomLimits(tenantId, {
        maxActiveChits: Number(form.maxActiveChits),
        maxMembers: Number(form.maxMembers),
        maxStaff: Number(form.maxStaff),
        analyticsEnabled: form.analyticsEnabled,
        prioritySupport: form.prioritySupport,
        allowedChitTypes: form.allowedChitTypes.join(','),
        priceMonthlyInr: Math.round(Number(form.priceMonthlyInr) * 100),
        notes: form.notes || null,
      });
      onSuccess('Custom limits saved');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to save custom limits');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-amber-600" />
            <h3 className="font-bold text-gray-900">Set Custom Plan Limits</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Limits grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'maxActiveChits', label: 'Max Chits' },
              { key: 'maxMembers',     label: 'Max Members' },
              { key: 'maxStaff',       label: 'Max Staff' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min="-1"
                    disabled={form[key] === -1}
                    value={form[key] === -1 ? '' : form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder={form[key] === -1 ? '∞' : ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    title="Toggle unlimited"
                    onClick={() => setForm({ ...form, [key]: form[key] === -1 ? 5 : -1 })}
                    className={`flex-shrink-0 px-2 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${form[key] === -1 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                  >∞</button>
                </div>
              </div>
            ))}
          </div>

          {/* Feature toggles */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Features</label>
            <div className="flex gap-3">
              {[
                { key: 'analyticsEnabled', label: 'Analytics' },
                { key: 'prioritySupport',  label: 'Priority Support' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, [key]: !form[key] })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${form[key] ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                >
                  <div className={`w-3 h-3 rounded-full ${form[key] ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Allowed Chit Types</label>
            <div className="flex flex-wrap gap-2">
              {CHIT_TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                    form.allowedChitTypes.includes(type)
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Price (₹/month)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.priceMonthlyInr}
                onChange={(e) => setForm({ ...form, priceMonthlyInr: e.target.value })}
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (internal)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
              placeholder="e.g. Negotiated pricing for Kethaki Chitfunds — 3-month trial"
            />
          </div>
          {/* Reset to plan defaults */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Reset to Plan Defaults</p>
            <div className="flex gap-2 items-center">
              <select
                value={resetPlan}
                onChange={e => setResetPlan(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
              >
                {plans.length > 0
                  ? plans.map(p => (
                      <option key={p.plan} value={p.plan}>{p.displayName ?? p.plan}</option>
                    ))
                  : ['BASIC', 'GROWTH', 'ENTERPRISE'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
              </select>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap"
              >
                {resetting ? 'Resetting…' : 'Reset to Plan'}
              </button>
            </div>
            {/* Plan preview */}
            {(() => {
              const preview = plans.find(p => p.plan === resetPlan);
              if (!preview) return null;
              const priceInr = preview.priceMonthlyInr ? Math.round(preview.priceMonthlyInr / 100) : null;
              return (
                <div className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">{preview.displayName ?? resetPlan} plan</span>
                    {priceInr != null && <span className="font-bold text-amber-600">₹{priceInr.toLocaleString('en-IN')}/mo</span>}
                  </div>
                  {preview.tagline && <p className="text-gray-400">{preview.tagline}</p>}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: 'Max Chits', value: preview.maxActiveChits === -1 ? '∞' : preview.maxActiveChits },
                      { label: 'Max Members', value: preview.maxMembers === -1 ? '∞' : preview.maxMembers },
                      { label: 'Max Staff', value: preview.maxStaff === -1 ? '∞' : preview.maxStaff },
                    ].map(({ label, value }) => value != null && (
                      <div key={label} className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                        <p className="font-bold text-gray-800">{value}</p>
                        <p className="text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>{loading ? 'Saving…' : 'Save Custom Limits'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RenameModal({ tenant, onClose, onSuccess }) {
  const [name, setName] = useState(tenant.name ?? '');
  const [slug, setSlug] = useState(tenant.slug ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await superAdminUpdateTenant(tenant.id, { name, slug });
      onSuccess('Org updated successfully');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to update org');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Edit Org Details</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Organization Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subdomain / Slug</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <span className="px-3 py-2 bg-gray-50 text-gray-400 text-xs border-r border-gray-200">chitwise.app/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
                placeholder="your-org"
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>{loading ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminOrgDetailPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();

  const [tenant, setTenant]   = useState(null);
  const [users, setUsers]     = useState([]);
  const [chits, setChits]     = useState([]);
  const [tab, setTab]         = useState('users');
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');
  const [showAddUser, setShowAddUser]         = useState(false);
  const [showRename, setShowRename]           = useState(false);
  const [showCustomLimits, setShowCustomLimits] = useState(false);
  const [showSetExpiry, setShowSetExpiry]       = useState(false);
  const [effectiveLimits, setEffectiveLimits]   = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [discount, setDiscount] = useState(null);
  const [showSetDiscount, setShowSetDiscount] = useState(false);
  const [billingModal, setBillingModal] = useState(null); // { type, toPlan, afterSave }
  const [resetCredentials, setResetCredentials] = useState(null); // { username, password } shown after reset
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [proxyingUserId, setProxyingUserId] = useState(null);
  const [lockingUserId, setLockingUserId] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [plans, setPlans] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [chitPage, setChitPage] = useState(1);
  const PAGE_SIZE = 10;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === tenant.status) { setShowStatusDropdown(false); return; }
    if (newStatus === 'ACTIVE' && tenant.status === 'PENDING') {
      // Activating a pending org — use the existing billing+activation flow
      setShowStatusDropdown(false);
      setBillingModal({
        type: 'PURCHASE',
        toPlan: tenant.plan ?? 'BASIC',
        afterSave: async () => {
          const activationResult = await superAdminActivateTenant(tenantId);
          showToast('Org activated and payment recorded');
          if (activationResult?.adminUsername) {
            setResetCredentials({
              username: activationResult.adminUsername,
              password: activationResult.adminTempPassword,
              title: 'Org Activated',
              subtitle: activationResult.adminAlreadyExisted
                ? 'Admin account credentials — share with the org owner'
                : 'Auto-created admin credentials — share with the org owner',
            });
          }
          loadAll();
        },
      });
      return;
    }
    setStatusChanging(true);
    try {
      const updated = await superAdminSetTenantStatus(tenantId, newStatus);
      setTenant((prev) => ({ ...prev, status: updated.status }));
      showToast(`Status changed to ${updated.status}`);
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Failed to change status');
    } finally {
      setStatusChanging(false);
      setShowStatusDropdown(false);
    }
  }

  async function handleProxy(user) {
    setProxyingUserId(user.userId);
    // Open a blank window synchronously (direct user gesture) so popup blocker doesn't fire.
    // After the async API call we navigate it to the proxy URL.
    const proxyWin = window.open('', '_blank');
    try {
      const result = await superAdminProxyAs(tenantId, user.role, user.userId);
      const params = new URLSearchParams({
        token: result.token,
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: tenant?.name ?? '',
        role: result.proxyRole,
      });
      if (proxyWin) {
        proxyWin.location.href = `/proxy?${params}`;
      } else {
        window.open(`/proxy?${params}`, '_blank');
      }
    } catch (err) {
      proxyWin?.close();
      showToast(err.response?.data?.message ?? 'Proxy failed');
    } finally {
      setProxyingUserId(null);
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([
        superAdminGetTenant(tenantId),
        superAdminListOrgUsers(tenantId),
      ]);
      setTenant(t);
      setUsers(Array.isArray(u) ? u : []);
      // Non-fatal fetches
      superAdminListOrgChits(tenantId).then(c => setChits(Array.isArray(c) ? c : [])).catch(() => setChits([]));
      superAdminGetEffectiveLimits(tenantId).then(setEffectiveLimits).catch(() => setEffectiveLimits(null));
      superAdminGetDiscount(tenantId).then(setDiscount).catch(() => setDiscount(null));
    } catch (err) {
      console.error('Failed to load org detail', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    superAdminListPlans().then(all => setPlans(all.filter(p => p.isActive))).catch(() => {});
  }, []);

  async function handleStatusToggle() {
    if (tenant.status !== 'ACTIVE') {
      // Activating a pending/suspended org — record payment first
      setBillingModal({
        type: 'PURCHASE',
        toPlan: tenant.plan ?? 'BASIC',
        afterSave: async () => {
          const activationResult = await superAdminActivateTenant(tenantId);
          showToast('Org activated and payment recorded');
          if (activationResult?.adminUsername) {
            setResetCredentials({
              username: activationResult.adminUsername,
              password: activationResult.adminTempPassword,
              title: 'Org Activated',
              subtitle: activationResult.adminAlreadyExisted
                ? 'Admin account credentials — share with the org owner'
                : 'Auto-created admin credentials — share with the org owner',
            });
          }
          loadAll();
        },
      });
      return;
    }
    try {
      await superAdminSuspendTenant(tenantId);
      showToast('Subscription paused');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Action failed');
    }
  }

  async function handlePlanChange(plan) {
    setPlanOpen(false);
    const type = !tenant.plan ? 'PURCHASE'
               : tenant.plan === plan ? 'RENEWAL'
               : 'UPGRADE';
    setBillingModal({
      type,
      toPlan: plan,
      afterSave: async () => {
        showToast(`Plan ${type === 'UPGRADE' ? 'upgraded' : type === 'RENEWAL' ? 'renewed' : 'purchased'} — payment recorded`);
        loadAll();
      },
    });
  }

  async function handleRemoveCustomLimits() {
    try {
      await superAdminRemoveCustomLimits(tenantId, 'BASIC');
      showToast('Custom limits removed — plan reverted to BASIC');
      setPlanOpen(false);
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Failed to remove custom limits');
    }
  }

  const byRole = (role) => users.filter((u) => u.role === role);
  const adminCount   = byRole('ADMIN').length;
  const managerCount = byRole('MANAGER').length;
  const staffCount   = byRole('STAFF').length;
  const memberCount  = byRole('MEMBER').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-gray-500">Organization not found.</p>
      </div>
    );
  }

  return (
    <>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <button
            type="button"
            onClick={() => navigate('/superadmin/tenants')}
            className="hover:text-gray-700 cursor-pointer transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Tenants
          </button>
          <span>/</span>
          <span className="text-gray-700 font-medium">Tenant Detail</span>
        </div>
        {/* Org hero card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
              >
                {tenant.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">{tenant.name}</h1>
                  <button
                    type="button"
                    onClick={() => setShowRename(true)}
                    className="p-1 rounded-md hover:bg-gray-100 cursor-pointer text-gray-400 hover:text-gray-700"
                    title="Edit org name"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm text-gray-500 font-mono">@{tenant.slug}</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowStatusDropdown((v) => !v)}
                      disabled={statusChanging}
                      className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50"
                      title="Click to change status"
                    >
                      <StatusBadge status={tenant.status} />
                      <ChevronDown size={11} className="text-gray-400 -ml-0.5" />
                    </button>
                    {showStatusDropdown && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[160px]">
                        {['ACTIVE', 'PENDING', 'SUSPENDED'].map((s) => {
                          const cfg = STATUS_CONFIG[s];
                          const Icon = cfg.icon;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleStatusChange(s)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-gray-50 cursor-pointer transition-colors ${s === tenant.status ? 'opacity-40 cursor-default' : ''}`}
                            >
                              <Icon size={12} className={cfg.cls.includes('emerald') ? 'text-emerald-600' : cfg.cls.includes('amber') ? 'text-amber-600' : 'text-red-600'} />
                              {cfg.label}
                              {s === tenant.status && <span className="ml-auto text-gray-400">✓</span>}
                            </button>
                          );
                        })}
                        {tenant.status === 'PENDING' && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              type="button"
                              onClick={() => { setShowStatusDropdown(false); handleStatusChange('REJECTED'); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                            >
                              <XCircle size={12} />
                              Reject Request
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {tenant.plan}
                  </span>
                  {tenant.planExpiresAt ? (
                    <button
                      type="button"
                      onClick={() => setShowSetExpiry(true)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        new Date(tenant.planExpiresAt) < new Date()
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : new Date(tenant.planExpiresAt) - new Date() < 7 * 86400 * 1000
                          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                      title="Click to update expiry"
                    >
                      <Calendar size={10} />
                      Expires {new Date(tenant.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSetExpiry(true)}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 cursor-pointer transition-colors"
                      title="Set plan expiry date"
                    >
                      <Calendar size={10} />
                      No expiry
                    </button>
                  )}
                </div>
                {tenant.contactEmail && (
                  <p className="text-xs text-gray-400 mt-1">{tenant.contactEmail}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Change plan */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlanOpen((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <Settings size={14} />
                  Change Plan
                  <ChevronDown size={13} />
                </button>
                {planOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPlanOpen(false)} />
                    <div className="absolute right-0 mt-1 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 min-w-[220px]">
                      {(plans.length > 0 ? plans : [{ plan: 'BASIC' }, { plan: 'GROWTH' }, { plan: 'ENTERPRISE' }]).map((p) => {
                        const planKey = (p.plan ?? p).toUpperCase();
                        const priceInr = p.priceMonthlyInr ? Math.round(p.priceMonthlyInr / 100) : null;
                        const isCurrent = planKey === (tenant.plan ?? '').toUpperCase();
                        return (
                          <button
                            key={planKey}
                            type="button"
                            onClick={() => handlePlanChange(planKey)}
                            className={`w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between ${isCurrent ? 'font-bold text-blue-600' : 'text-gray-700'}`}
                          >
                            <span>{p.displayName ?? planKey} {isCurrent && '✓'}</span>
                            {priceInr != null && (
                              <span className="text-xs font-semibold" style={{ color: '#059669' }}>₹{priceInr.toLocaleString('en-IN')}/mo</span>
                            )}
                          </button>
                        );
                      })}
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        type="button"
                        onClick={() => { setPlanOpen(false); setShowCustomLimits(true); }}
                        className="w-full text-left px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 text-amber-700 flex items-center gap-2"
                      >
                        <Sliders size={13} />
                        {tenant.plan === 'CUSTOM' ? 'Edit Custom Limits' : 'Set Custom Limits…'}
                      </button>
                      {tenant.plan === 'CUSTOM' && (
                        <button
                          type="button"
                          onClick={handleRemoveCustomLimits}
                          className="w-full text-left px-4 py-2 text-sm cursor-pointer hover:bg-red-50 text-red-600 flex items-center gap-2"
                        >
                          <Trash2 size={13} />
                          Remove Custom Limits
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Pause / Activate / Reactivate */}
              {tenant.status === 'REJECTED' ? (
                <button
                  type="button"
                  onClick={() => setShowReactivate(true)}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors"
                >
                  <CheckCircle size={14} />
                  Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStatusToggle}
                  className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    tenant.status === 'ACTIVE'
                      ? 'border border-red-200 text-red-600 hover:bg-red-50'
                      : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {tenant.status === 'ACTIVE' ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {tenant.status === 'ACTIVE' ? 'Pause Subscription' : 'Activate'}
                </button>
              )}

              {/* Add user */}
              <button
                type="button"
                onClick={() => setShowAddUser(true)}
                className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-white cursor-pointer transition-colors"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                <UserPlus size={14} />
                Add User
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-50">
            {[
              { label: 'Admins',   value: adminCount,   color: 'text-purple-700' },
              { label: 'Managers', value: managerCount, color: 'text-blue-700' },
              { label: 'Staff',    value: staffCount,   color: 'text-teal-700' },
              { label: 'Members',  value: memberCount,  color: 'text-gray-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Org-level alerts */}
        {tenant.planExpiresAt && (() => {
          const exp = new Date(tenant.planExpiresAt);
          const now = new Date();
          const daysLeft = Math.ceil((exp - now) / 86400000);
          if (exp < now) {
            return (
              <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
                <XCircle size={18} className="text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">Plan expired</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Expired on {exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Extend the plan to restore access.
                  </p>
                </div>
                <button type="button"
                  onClick={() => setBillingModal({ type: 'RENEWAL', toPlan: tenant.plan ?? 'BASIC', afterSave: () => { showToast('Plan renewed — payment recorded'); loadAll(); } })}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer">
                  Extend Plan
                </button>
              </div>
            );
          }
          if (daysLeft <= 14) {
            return (
              <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                <Clock size={18} className="text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">
                    Plan expires {daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {tenant.plan} plan
                  </p>
                </div>
                <button type="button"
                  onClick={() => setBillingModal({ type: 'RENEWAL', toPlan: tenant.plan ?? 'BASIC', afterSave: () => { showToast('Plan renewed — payment recorded'); loadAll(); } })}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 cursor-pointer">
                  Extend Plan
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* Pending admin banner — shown for PENDING orgs so super-admin can see who registered */}
        {tenant.status === 'PENDING' && (() => {
          const pendingAdmin = users.find(u => u.role === 'ADMIN');
          if (!pendingAdmin) return null;
          return (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Registered Admin Account</p>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-amber-600">Username</p>
                    <p className="text-sm font-mono font-semibold text-gray-900">{pendingAdmin.username}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600">Full Name</p>
                    <p className="text-sm font-semibold text-gray-900">{pendingAdmin.fullName ?? '—'}</p>
                  </div>
                  {pendingAdmin.email && (
                    <div>
                      <p className="text-xs text-amber-600">Email</p>
                      <p className="text-sm text-gray-700">{pendingAdmin.email}</p>
                    </div>
                  )}
                  {pendingAdmin.phone && (
                    <div>
                      <p className="text-xs text-amber-600">Phone</p>
                      <p className="text-sm text-gray-700">{pendingAdmin.phone}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-amber-600 bg-amber-100 rounded-xl px-3 py-2 text-center">
                <p className="font-semibold">Pending Activation</p>
                <p className="mt-0.5">Activate to enable login</p>
              </div>
            </div>
          );
        })()}

        {/* Info grid: Org Details | Subscription | Admin Contacts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Org Details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Org Details</p>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-400">Registered on</span>
                <span className="text-xs font-medium text-gray-700">
                  {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-400">Subdomain</span>
                <span className="text-xs font-mono font-medium text-gray-700">@{tenant.slug}</span>
              </div>
              {tenant.contactEmail && (
                <div className="flex justify-between items-start gap-3">
                  <span className="text-xs text-gray-400 flex-shrink-0">Contact Email</span>
                  <a href={`mailto:${tenant.contactEmail}`} className="text-xs text-blue-600 hover:underline text-right break-all">
                    {tenant.contactEmail}
                  </a>
                </div>
              )}
              {tenant.contactPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Contact Phone</span>
                  <a href={`tel:${tenant.contactPhone}`} className="text-xs font-medium text-blue-600 hover:underline">
                    {tenant.contactPhone}
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Total Chits</span>
                <span className="text-xs font-semibold text-gray-700">{chits.length}</span>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Subscription</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Plan</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{tenant.plan}</span>
                  <button
                    type="button"
                    onClick={() => setShowCustomLimits(true)}
                    className="text-xs text-amber-600 hover:text-amber-800 hover:underline cursor-pointer font-medium flex items-center gap-1"
                    title="Edit custom limits"
                  >
                    <Sliders size={11} />
                    {tenant.plan === 'CUSTOM' ? 'Edit Limits' : 'Set Custom'}
                  </button>
                </div>
              </div>
              {(effectiveLimits?.priceMonthlyInr > 0) ? (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Monthly Price</span>
                  <span className="text-xs font-semibold text-gray-800">
                    ₹{(effectiveLimits.priceMonthlyInr / 100).toLocaleString('en-IN')}/month
                  </span>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Billing</span>
                  <span className="text-xs text-gray-400 italic">Standard pricing</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Plan Expiry</span>
                {tenant.planExpiresAt ? (
                  <button
                    type="button"
                    onClick={() => setShowSetExpiry(true)}
                    className={`text-xs font-medium cursor-pointer hover:underline ${
                      new Date(tenant.planExpiresAt) < new Date() ? 'text-red-600' :
                      new Date(tenant.planExpiresAt) - new Date() < 7 * 86400000 ? 'text-amber-600' : 'text-blue-600'
                    }`}
                  >
                    {new Date(tenant.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {new Date(tenant.planExpiresAt) < new Date() && ' (Expired)'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setShowSetExpiry(true)} className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer">
                    No expiry — set one
                  </button>
                )}
              </div>
              <div className="pt-1 border-t border-gray-50">
                <p className="text-xs font-bold text-gray-400 mb-2">Allowed Chit Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {(effectiveLimits?.allowedChitTypes
                      ? effectiveLimits.allowedChitTypes.split(',').map((t) => t.trim()).filter(Boolean)
                      : (PLAN_CHIT_TYPES[tenant.plan] ?? PLAN_CHIT_TYPES.BASIC)
                    ).map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{t}</span>
                  ))}
                </div>
              </div>
              {/* Credit balance */}
              <div className="flex justify-between items-center border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-400">Credit Balance</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${(tenant.creditBalanceInr ?? 0) > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                    ₹{Number(tenant.creditBalanceInr ?? 0).toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCredit(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    Manage
                  </button>
                </div>
              </div>
              {effectiveLimits?.notes && (
                <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-2">{effectiveLimits.notes}</p>
              )}
              {/* Per-org discount */}
              <div className="flex justify-between items-center border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-400">Org Discount</span>
                <div className="flex items-center gap-2">
                  {discount ? (
                    <>
                      <span className="text-xs font-semibold text-emerald-700">
                        {discount.discountType === 'PERCENTAGE'
                          ? `${discount.discountValue}% off`
                          : `₹${(parseFloat(discount.discountValue) / 100).toLocaleString('en-IN')} off`}
                      </span>
                      <button type="button" onClick={() => setShowSetDiscount(true)} className="text-xs text-blue-600 hover:underline cursor-pointer">Edit</button>
                      <button
                        type="button"
                        onClick={async () => {
                          try { await superAdminRemoveDiscount(tenantId); setDiscount(null); showToast('Discount removed'); }
                          catch { showToast('Failed to remove discount'); }
                        }}
                        className="text-xs text-red-400 hover:text-red-600 cursor-pointer"
                      >✕</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowSetDiscount(true)} className="text-xs text-blue-600 hover:underline cursor-pointer">+ Set</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Admin Contacts */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Admin Contacts</p>
              <button
                type="button"
                onClick={() => setShowAddUser(true)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
              >
                <UserPlus size={11} />
                Add
              </button>
            </div>
            {byRole('ADMIN').length === 0 ? (
              <p className="text-xs text-gray-400 italic">No admins yet</p>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-y-auto">
                {byRole('ADMIN').map((u) => (
                  <div key={u.userId} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 flex-shrink-0">
                      {(u.fullName ?? u.username ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{u.fullName ?? u.username}</p>
                      {u.phone ? (
                        <a href={`tel:${u.phone}`} className="text-xs text-blue-600 hover:underline">{u.phone}</a>
                      ) : (
                        <p className="text-xs text-gray-400">No phone</p>
                      )}
                      <p className="text-xs text-gray-300 mt-0.5">
                        {u.lastLoginAt
                          ? `Last login: ${new Date(u.lastLoginAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : 'Never logged in'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Plan usage */}
        <PlanUsageCard plan={tenant.plan} chits={chits} memberCount={memberCount} staffCount={managerCount + staffCount} effectiveLimits={effectiveLimits} />

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl border border-gray-100 p-1 w-fit">
          {[
            { id: 'users', label: `Users (${users.length})`, icon: Users },
            { id: 'chits', label: `Chits (${chits.length})`, icon: BookOpen },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                tab === id ? 'bg-[#1E3A5F] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {users.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No users yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE).map((u) => (
                      <tr key={u.userId} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3.5">
                          <div>
                            <p className="font-medium text-gray-900">{u.fullName ?? '—'}</p>
                            <p className="text-xs text-gray-400 font-mono">{u.username}</p>
                            {u.email && <p className="text-xs text-gray-400">{u.email}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3.5">
                          {u.phone
                            ? <a href={`tel:${u.phone}`} className="text-sm text-blue-600 hover:underline">{u.phone}</a>
                            : <span className="text-gray-400 text-sm">—</span>
                          }
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${u.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                              {u.enabled ? 'Active' : 'Disabled'}
                            </span>
                            {u.locked && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full w-fit bg-amber-50 text-amber-700 flex items-center gap-1">
                                <Lock size={10} /> Locked
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : <span className="text-gray-300">Never</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Proxy as this user"
                              disabled={proxyingUserId === u.userId}
                              onClick={() => handleProxy(u)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors disabled:opacity-50"
                            >
                              <LogIn size={12} />
                              {proxyingUserId === u.userId ? '…' : 'Proxy'}
                            </button>
                            <button
                              type="button"
                              title="Reset Password"
                              onClick={async () => {
                                try {
                                  const result = await resetMemberPassword(u.userId);
                                  setResetCredentials({ username: result.username ?? u.username, password: result.tempPassword });
                                } catch {
                                  showToast('Failed to reset password');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 cursor-pointer transition-colors"
                            >
                              <KeyRound size={12} />
                              Reset
                            </button>
                            <button
                              type="button"
                              disabled={lockingUserId === u.userId}
                              title={u.locked ? 'Unlock Account' : 'Lock Account'}
                              onClick={async () => {
                                setLockingUserId(u.userId);
                                try {
                                  if (u.locked) {
                                    await unlockUser(u.userId);
                                    setUsers(prev => prev.map(x => x.userId === u.userId ? { ...x, locked: false } : x));
                                    showToast('Account unlocked');
                                  } else {
                                    await lockUser(u.userId);
                                    setUsers(prev => prev.map(x => x.userId === u.userId ? { ...x, locked: true } : x));
                                    showToast('Account locked');
                                  }
                                } catch {
                                  showToast(u.locked ? 'Failed to unlock' : 'Failed to lock');
                                } finally {
                                  setLockingUserId(null);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors disabled:opacity-50 ${
                                u.locked
                                  ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-red-200 text-red-600 hover:bg-red-50'
                              }`}
                            >
                              {u.locked ? <LockOpen size={12} /> : <Lock size={12} />}
                              {lockingUserId === u.userId ? '…' : u.locked ? 'Unlock' : 'Lock'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Users pagination */}
                {Math.ceil(users.length / PAGE_SIZE) > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{users.length} users · page {userPage} of {Math.ceil(users.length / PAGE_SIZE)}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Prev</button>
                      <button type="button" onClick={() => setUserPage(p => Math.min(Math.ceil(users.length / PAGE_SIZE), p + 1))} disabled={userPage === Math.ceil(users.length / PAGE_SIZE)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chits tab */}
        {tab === 'chits' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {chits.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No chits created yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Chit Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Members</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Start Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chits.slice((chitPage - 1) * PAGE_SIZE, chitPage * PAGE_SIZE).map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => navigate('/chits/' + c.id)}
                        className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5">
                          <p className="font-medium text-gray-900 hover:text-[#1E3A5F]">{c.name}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{c.chitType}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHIT_STATUS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-800">
                          ₹{Number(c.chitValue ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-gray-700">
                          {c.enrolledCount ?? 0} / {c.totalMembers}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600">{c.durationMonths} months</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {c.startDate ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Chits pagination */}
                {Math.ceil(chits.length / PAGE_SIZE) > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{chits.length} chits · page {chitPage} of {Math.ceil(chits.length / PAGE_SIZE)}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setChitPage(p => Math.max(1, p - 1))} disabled={chitPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Prev</button>
                      <button type="button" onClick={() => setChitPage(p => Math.min(Math.ceil(chits.length / PAGE_SIZE), p + 1))} disabled={chitPage === Math.ceil(chits.length / PAGE_SIZE)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 cursor-pointer">Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {showAddUser && (
        <AddUserModal
          tenantId={tenantId}
          onClose={() => setShowAddUser(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); }}
        />
      )}
      {billingModal && (
        <RecordOrgPaymentModal
          tenant={tenant}
          type={billingModal.type}
          toPlan={billingModal.toPlan}
          onClose={() => setBillingModal(null)}
          onSuccess={async () => {
            try { await billingModal.afterSave(); } catch (err) { showToast(err.response?.data?.message ?? 'Post-payment action failed'); }
            setBillingModal(null);
          }}
        />
      )}
      {showRename && (
        <RenameModal
          tenant={tenant}
          onClose={() => setShowRename(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); }}
        />
      )}
      {showCustomLimits && (
        <SetCustomLimitsModal
          tenantId={tenantId}
          existing={effectiveLimits}
          onClose={() => setShowCustomLimits(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); }}
        />
      )}
      {showSetExpiry && (
        <SetExpiryModal
          tenantId={tenantId}
          currentExpiry={tenant.planExpiresAt}
          onClose={() => setShowSetExpiry(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); }}
        />
      )}
      {showSetDiscount && (
        <SetDiscountModal
          tenantId={tenantId}
          existing={discount}
          onClose={() => setShowSetDiscount(false)}
          onSuccess={(d) => { setDiscount(d); setShowSetDiscount(false); showToast('Discount saved'); }}
        />
      )}
      {resetCredentials && (
        <CredentialsPopup
          username={resetCredentials.username}
          password={resetCredentials.password}
          title={resetCredentials.title ?? 'Password Reset'}
          subtitle={resetCredentials.subtitle ?? 'New temporary credentials — share with the user'}
          onDone={() => setResetCredentials(null)}
        />
      )}
      {showAddCredit && tenant && (
        <ManageCreditModal
          tenant={tenant}
          onClose={() => setShowAddCredit(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); setShowAddCredit(false); }}
        />
      )}
      {showReactivate && tenant && (
        <ReactivateModal
          tenant={tenant}
          onClose={() => setShowReactivate(false)}
          onSuccess={(msg) => { showToast(msg); loadAll(); setShowReactivate(false); }}
        />
      )}
      <Toast msg={toast} />
    </>
  );
}

function SetDiscountModal({ tenantId, existing, onClose, onSuccess }) {
  const [form, setForm] = useState({
    discountType: existing?.discountType ?? 'PERCENTAGE',
    discountValue: existing
      ? (existing.discountType === 'FIXED_PAISE'
          ? String(parseFloat(existing.discountValue) / 100)
          : String(existing.discountValue))
      : '',
    reason: existing?.reason ?? '',
    expiresAt: existing?.expiresAt ? existing.expiresAt.substring(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) {
      setError('Enter a valid discount value'); return;
    }
    setSaving(true);
    setError('');
    try {
      const value = form.discountType === 'FIXED_PAISE'
        ? parseFloat(form.discountValue) * 100
        : parseFloat(form.discountValue);
      const body = {
        discountType: form.discountType,
        discountValue: value,
        reason: form.reason || null,
        expiresAt: form.expiresAt ? form.expiresAt + 'T00:00:00' : null,
      };
      const result = await superAdminSetDiscount(tenantId, body);
      onSuccess(result);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const INPUT_CLS = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10 bg-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-base">Set Org Discount</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Discount type</label>
            <div className="flex gap-3">
              {[['PERCENTAGE', '% Percent'], ['FIXED_PAISE', '₹ Fixed']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set('discountType', val)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${
                    form.discountType === val ? 'border-[#1E3A5F] bg-[#EFF4FA] text-[#1E3A5F]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {form.discountType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount (₹)'}
            </label>
            <input
              type="number"
              min="0"
              step={form.discountType === 'PERCENTAGE' ? '0.01' : '1'}
              max={form.discountType === 'PERCENTAGE' ? '100' : undefined}
              className={INPUT_CLS}
              value={form.discountValue}
              onChange={e => set('discountValue', e.target.value)}
              placeholder={form.discountType === 'PERCENTAGE' ? '20' : '500'}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason <span className="font-normal text-gray-400">(optional)</span></label>
            <input className={INPUT_CLS} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Loyalty discount" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Expires on <span className="font-normal text-gray-400">(optional)</span></label>
            <input type="date" className={INPUT_CLS} value={form.expiresAt} onChange={e => set('expiresAt', e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReactivateModal({ tenant, onClose, onSuccess }) {
  const [slug, setSlug] = useState(tenant.slug ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!slug.trim()) { setError('Subdomain is required'); return; }
    setError('');
    setLoading(true);
    try {
      const newSlug = slug.trim() !== tenant.slug ? slug.trim() : undefined;
      await superAdminReactivateTenant(tenant.id, newSlug);
      onSuccess('Registration reactivated — now PENDING review');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to reactivate');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Reactivate Registration</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Reactivating <strong className="text-gray-900">{tenant.name}</strong> will move it back to <span className="text-amber-600 font-semibold">PENDING</span>. Verify the subdomain is available.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subdomain</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-blue-400">
              <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 flex-shrink-0">app.chitwise.com/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_.]/g, ''))}
                className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none"
              />
            </div>
            {slug !== tenant.slug && (
              <p className="text-xs text-amber-600 mt-1">Changed from original: <span className="font-mono">{tenant.slug}</span></p>
            )}
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />{error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>{loading ? 'Reactivating…' : 'Reactivate'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
