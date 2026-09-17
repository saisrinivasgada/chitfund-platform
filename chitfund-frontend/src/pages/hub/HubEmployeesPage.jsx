import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  hubListEmployees, hubInviteEmployee, hubChangeRole,
  hubDeactivateEmployee, hubReactivateEmployee, hubResendEmployeeInvite,
  hubResetEmployeePassword, hubUpdateIdentityPermissions,
  hubListRoles, hubCreateRole, hubUpdateRole, hubDeleteRole, hubAssignCustomRole,
} from '../../services/api';
import {
  Users, Plus, X, AlertCircle, UserCheck, UserX, KeyRound,
  Eye, EyeOff, Shield, Pencil, Trash2, ChevronRight,
} from 'lucide-react';

// ── Permission definitions ─────────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    group: 'Ticket Visibility',
    items: [
      { key: 'TICKET_VIEW_BILLING',         label: 'Billing' },
      { key: 'TICKET_VIEW_PAYMENT',         label: 'Payment' },
      { key: 'TICKET_VIEW_PAYOUT',          label: 'Payout' },
      { key: 'TICKET_VIEW_CHIT',            label: 'Chit' },
      { key: 'TICKET_VIEW_DRAW',            label: 'Draw' },
      { key: 'TICKET_VIEW_ACCOUNT',         label: 'Account' },
      { key: 'TICKET_VIEW_MEMBER_MGMT',     label: 'Member Management' },
      { key: 'TICKET_VIEW_TECHNICAL',       label: 'Technical' },
      { key: 'TICKET_VIEW_FEATURE_REQUEST', label: 'Feature Requests' },
      { key: 'TICKET_VIEW_INQUIRY',         label: 'Inquiry' },
      { key: 'TICKET_VIEW_GENERAL',         label: 'General' },
    ],
  },
  {
    group: 'Ticket Workflow',
    items: [
      { key: 'TICKET_REOPEN',     label: 'Reopen resolved/completed tickets' },
      { key: 'TICKET_ASSIGN_ANY', label: 'Assign tickets to other agents' },
    ],
  },
  {
    group: 'Access',
    items: [
      { key: 'PROXY_ACCESS', label: 'Proxy access (impersonate org accounts)' },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_STYLES = {
  SUPER_ADMIN:   'bg-purple-50 text-purple-700',
  SUPPORT_AGENT: 'bg-blue-50 text-blue-700',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Invite Modal ───────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ fullName: '', email: '', role: 'SUPPORT_AGENT' });
  const [error, setError] = useState('');

  const inviteMut = useMutation({
    mutationFn: () => hubInviteEmployee(form),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e) => setError(e?.response?.data?.message ?? 'Failed to send invite'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Invite Employee
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input type="text" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="employee@chitwise.com"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 cursor-pointer">
              <option value="SUPPORT_AGENT">Support Agent</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => inviteMut.mutate()}
            disabled={!form.fullName.trim() || !form.email.trim() || inviteMut.isPending}
            className="flex-1 px-4 py-2 text-sm rounded-xl text-white font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1E3A5F' }}>
            {inviteMut.isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ───────────────────────────────────────────────────────

function ResetPasswordModal({ employee, onClose, onSuccess }) {
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const resetMut = useMutation({
    mutationFn: () => hubResetEmployeePassword(employee.id, temporaryPassword),
    onSuccess: () => { onSuccess(employee); onClose(); },
    onError: (err) => setError(err?.response?.data?.message ?? 'Unable to reset password'),
  });

  function submit() {
    if (temporaryPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (temporaryPassword.length < 8 || !/[A-Z]/.test(temporaryPassword) || !/[a-z]/.test(temporaryPassword)
      || !/[0-9]/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword)) {
      setError('Use 8+ characters with uppercase, lowercase, number and special character.');
      return;
    }
    setError('');
    resetMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Set temporary password</h2>
            <p className="text-xs text-gray-500 mt-1">For {employee.fullName || employee.username}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
          Their current sessions will be revoked. After signing in they must create a permanent password.
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temporary password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={temporaryPassword}
                onChange={e => { setTemporaryPassword(e.target.value.replace(/\s/g, '')); setError(''); }}
                autoComplete="new-password" autoFocus
                className="w-full px-3.5 py-2 pr-10 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm temporary password</label>
            <input type="password" value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value.replace(/\s/g, '')); setError(''); }}
              autoComplete="new-password"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} />{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600">Cancel</button>
          <button onClick={submit} disabled={!temporaryPassword || !confirmPassword || resetMut.isPending}
            className="flex-1 px-4 py-2 text-sm rounded-xl text-white font-medium disabled:opacity-40 bg-[#1E3A5F]">
            {resetMut.isPending ? 'Saving…' : 'Set temporary password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Role Modal (create/edit) ───────────────────────────────────────────────────

function RoleModal({ role, onClose, onSuccess }) {
  const isEdit = !!role;
  const [form, setForm] = useState({
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissions: new Set(role?.permissions ?? []),
  });
  const [error, setError] = useState('');

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, description: form.description || null, permissions: [...form.permissions] };
      return isEdit ? hubUpdateRole(role.id, payload) : hubCreateRole(payload);
    },
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e) => setError(e?.response?.data?.message ?? 'Failed to save role'),
  });

  function togglePerm(key) {
    setForm(f => {
      const next = new Set(f.permissions);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...f, permissions: next };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            {isEdit ? 'Edit Role' : 'Create Role'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role Name <span className="text-red-400">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Billing Agent"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What this role is for"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
          </div>
        </div>

        <div className="space-y-4 mb-5">
          {PERMISSION_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group}</p>
              <div className="space-y-1.5">
                {items.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form.permissions.has(key)}
                      onChange={() => togglePerm(key)}
                      className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]/30 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-500 flex items-center gap-1.5 mb-3"><AlertCircle size={13} />{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => saveMut.mutate()}
            disabled={!form.name.trim() || saveMut.isPending}
            className="flex-1 px-4 py-2 text-sm rounded-xl text-white font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1E3A5F' }}>
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HubEmployeesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('employees');
  const [showInvite, setShowInvite] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [notice, setNotice] = useState('');

  const hubUser = (() => {
    try { return JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { return {}; }
  })();
  const isSuperAdmin = hubUser.role === 'SUPER_ADMIN';

  const { data: employees = [], isLoading: empLoading, isError: empError } = useQuery({
    queryKey: ['hub-employees'],
    queryFn: hubListEmployees,
    staleTime: 60000,
  });

  const { data: roles = [], isLoading: rolesLoading, isError: rolesError } = useQuery({
    queryKey: ['hub-roles'],
    queryFn: hubListRoles,
    staleTime: 60000,
    enabled: isSuperAdmin,
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }) => hubChangeRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => hubDeactivateEmployee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const reactivateMut = useMutation({
    mutationFn: (id) => hubReactivateEmployee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const resendMut = useMutation({
    mutationFn: (id) => hubResendEmployeeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const identityAccessMut = useMutation({
    mutationFn: ({ id, enabled }) => hubUpdateIdentityPermissions(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const customRoleMut = useMutation({
    mutationFn: ({ id, customRoleId }) => hubAssignCustomRole(id, customRoleId || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-employees'] }),
  });

  const deleteRoleMut = useMutation({
    mutationFn: (id) => hubDeleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub-roles'] });
      qc.invalidateQueries({ queryKey: ['hub-employees'] });
    },
    onError: (e) => setNotice(e?.response?.data?.message ?? 'Cannot delete role'),
  });

  const roleOptions = roles.map(r => ({ value: r.id, label: r.name }));

  const TABS = [
    { key: 'employees', label: 'Employees' },
    { key: 'roles', label: 'Roles' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
          Employees
        </h1>
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            {activeTab === 'employees' && (
              <button onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl text-white font-medium"
                style={{ backgroundColor: '#1E3A5F' }}>
                <Plus size={15} /> Invite Employee
              </button>
            )}
            {activeTab === 'roles' && (
              <button onClick={() => { setEditRole(null); setShowRoleModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl text-white font-medium"
                style={{ backgroundColor: '#1E3A5F' }}>
                <Plus size={15} /> Create Role
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      {isSuperAdmin && (
        <div className="flex gap-0.5 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'text-[#1E3A5F] border-[#1E3A5F]'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-green-100 bg-green-50 text-sm text-green-700">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-600"><X size={15} /></button>
        </div>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {empLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading employees…</div>
          ) : empError ? (
            <div className="flex items-center justify-center gap-2 py-16 text-red-500 text-sm">
              <AlertCircle size={16} /> Failed to load employees
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <Users size={32} className="opacity-30" />
              <p className="text-sm">No employees yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Username</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Role</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Identity Cases</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined</th>
                    {isSuperAdmin && <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const isActive = emp.active !== false && emp.status !== 'INACTIVE';
                    const isMe = emp.id === hubUser.id || emp.username === hubUser.username;
                    const isSuperAdminEmp = emp.role === 'SUPER_ADMIN';
                    return (
                      <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-900">
                          {emp.username}
                          {isMe && <span className="ml-2 text-[10px] text-gray-400 font-normal">(you)</span>}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">{emp.email ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          {isSuperAdmin && !isMe ? (
                            <select value={emp.role}
                              onChange={e => roleMut.mutate({ id: emp.id, role: e.target.value })}
                              disabled={roleMut.isPending}
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]/30 ${ROLE_STYLES[emp.role] ?? 'bg-gray-100 text-gray-600'}`}>
                              <option value="SUPER_ADMIN">Super Admin</option>
                              <option value="SUPPORT_AGENT">Support Agent</option>
                            </select>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_STYLES[emp.role] ?? 'bg-gray-100 text-gray-600'}`}>
                              {emp.role?.replace('_', ' ') ?? emp.role}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {isSuperAdminEmp ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : isSuperAdmin && !isMe ? (
                            <select
                              value={emp.customRoleId ?? ''}
                              onChange={e => customRoleMut.mutate({ id: emp.id, customRoleId: e.target.value || null })}
                              disabled={customRoleMut.isPending || roles.length === 0}
                              className="px-2.5 py-0.5 rounded-lg text-xs border border-gray-200 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]/30 text-gray-700"
                            >
                              <option value="">No custom role</option>
                              {roleOptions.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-500">
                              {emp.customRoleName ?? <span className="text-gray-300">—</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            !isActive ? 'bg-gray-100 text-gray-500'
                              : emp.mustChangePassword ? 'bg-amber-50 text-amber-700'
                                : 'bg-green-50 text-green-700'
                          }`}>
                            {!isActive ? 'Inactive' : emp.mustChangePassword ? 'Password update required' : 'Active'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {emp.platformOwner
                            ? <span className="text-xs font-semibold text-purple-700">Protected owner</span>
                            : hubUser.platformOwner ? (
                              <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={emp.canManageIdentityCases === true}
                                  disabled={identityAccessMut.isPending || isMe}
                                  onChange={e => identityAccessMut.mutate({ id: emp.id, enabled: e.target.checked })} />
                                Investigator
                              </label>
                            ) : (
                              <span className="text-xs text-gray-400">{emp.canManageIdentityCases ? 'Investigator' : 'No access'}</span>
                            )}
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs">{formatDate(emp.createdAt ?? emp.joinedAt)}</td>
                        {isSuperAdmin && (
                          <td className="px-5 py-3.5">
                            {!isMe && (
                              emp.invitePending ? (
                                <button onClick={() => resendMut.mutate(emp.id)} disabled={resendMut.isPending}
                                  className="text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-40">
                                  Resend invite
                                </button>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setResetTarget(emp)}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                                    <KeyRound size={13} /> Reset password
                                  </button>
                                  {isActive ? (
                                    <button onClick={() => deactivateMut.mutate(emp.id)} disabled={deactivateMut.isPending}
                                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-40">
                                      <UserX size={13} /> Deactivate
                                    </button>
                                  ) : (
                                    <button onClick={() => reactivateMut.mutate(emp.id)} disabled={reactivateMut.isPending}
                                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 transition-colors disabled:opacity-40">
                                      <UserCheck size={13} /> Reactivate
                                    </button>
                                  )}
                                </div>
                              )
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div>
          {rolesLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading roles…</div>
          ) : rolesError ? (
            <div className="flex items-center justify-center gap-2 py-16 text-red-500 text-sm">
              <AlertCircle size={16} /> Failed to load roles
            </div>
          ) : roles.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-4 py-20">
              <Shield size={36} className="text-gray-200" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">No custom roles yet</p>
                <p className="text-xs text-gray-400 mt-1">Create roles to define fine-grained permissions for support agents.</p>
              </div>
              <button onClick={() => { setEditRole(null); setShowRoleModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl text-white font-medium mt-1"
                style={{ backgroundColor: '#1E3A5F' }}>
                <Plus size={15} /> Create first role
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map(role => {
                const permCount = role.permissions?.length ?? 0;
                return (
                  <div key={role.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <Shield size={16} className="text-[#1E3A5F] flex-shrink-0" />
                          <h3 className="text-sm font-bold text-gray-900">{role.name}</h3>
                          <span className="text-xs text-gray-400 font-normal">
                            {role.employeeCount} {role.employeeCount === 1 ? 'employee' : 'employees'}
                          </span>
                        </div>
                        {role.description && (
                          <p className="text-xs text-gray-500 mb-2 ml-6">{role.description}</p>
                        )}
                        {permCount > 0 ? (
                          <div className="ml-6 flex flex-wrap gap-1.5">
                            {(role.permissions ?? []).map(p => {
                              const label = PERMISSION_GROUPS.flatMap(g => g.items).find(i => i.key === p)?.label ?? p;
                              return (
                                <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EFF4FA] text-[#1E3A5F]">
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 ml-6">No permissions assigned</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => { setEditRole(role); setShowRoleModal(true); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            if (role.employeeCount > 0) {
                              setNotice(`Cannot delete "${role.name}" — it's assigned to ${role.employeeCount} employee(s). Unassign first.`);
                            } else {
                              deleteRoleMut.mutate(role.id);
                            }
                          }}
                          disabled={deleteRoleMut.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['hub-employees'] })}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          employee={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={(employee) => {
            qc.invalidateQueries({ queryKey: ['hub-employees'] });
            setNotice(`Temporary password set for ${employee.fullName || employee.username}.`);
          }}
        />
      )}
      {showRoleModal && (
        <RoleModal
          role={editRole}
          onClose={() => { setShowRoleModal(false); setEditRole(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['hub-roles'] });
            setNotice(editRole ? 'Role updated.' : 'Role created.');
          }}
        />
      )}
    </div>
  );
}
