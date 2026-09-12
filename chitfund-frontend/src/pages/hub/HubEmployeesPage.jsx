import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  hubListEmployees, hubInviteEmployee, hubChangeRole,
  hubDeactivateEmployee, hubReactivateEmployee, hubResendEmployeeInvite,
  hubResetEmployeePassword,
} from '../../services/api';
import { Users, Plus, X, AlertCircle, UserCheck, UserX, KeyRound, Eye, EyeOff } from 'lucide-react';

const ROLE_STYLES = {
  SUPER_ADMIN:   'bg-purple-50 text-purple-700',
  SUPPORT_AGENT: 'bg-blue-50 text-blue-700',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="employee@chitwise.com"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 cursor-pointer"
            >
              <option value="SUPPORT_AGENT">Support Agent</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle size={13} /> {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => inviteMut.mutate()}
            disabled={!form.fullName.trim() || !form.email.trim() || inviteMut.isPending}
            className="flex-1 px-4 py-2 text-sm rounded-xl text-white font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {inviteMut.isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    if (temporaryPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (temporaryPassword.length < 8
        || !/[A-Z]/.test(temporaryPassword)
        || !/[a-z]/.test(temporaryPassword)
        || !/[0-9]/.test(temporaryPassword)
        || !/[^A-Za-z0-9]/.test(temporaryPassword)) {
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
          Their current sessions will be revoked. After signing in with this temporary password, they must create a permanent password.
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temporary password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={temporaryPassword}
                onChange={(event) => { setTemporaryPassword(event.target.value.replace(/\s/g, '')); setError(''); }}
                autoComplete="new-password" autoFocus
                className="w-full px-3.5 py-2 pr-10 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              <button type="button" onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm temporary password</label>
            <input type="password" value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value.replace(/\s/g, '')); setError(''); }}
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

export default function HubEmployeesPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [notice, setNotice] = useState('');

  const hubUser = (() => {
    try { return JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { return {}; }
  })();
  const isSuperAdmin = hubUser.role === 'SUPER_ADMIN';

  const { data: employees = [], isLoading, isError } = useQuery({
    queryKey: ['hub-employees'],
    queryFn: hubListEmployees,
    staleTime: 60000,
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
          Employees
        </h1>
        {isSuperAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl text-white font-medium"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            <Plus size={15} />
            Invite Employee
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-green-100 bg-green-50 text-sm text-green-700">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-600"><X size={15} /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading employees…</div>
        ) : isError ? (
          <div className="flex items-center justify-center gap-2 py-16 text-red-500 text-sm">
            <AlertCircle size={16} /> Failed to load employees
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">No employees yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Username</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined</th>
                {isSuperAdmin && <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const isActive = emp.active !== false && emp.status !== 'INACTIVE';
                const isMe = emp.id === hubUser.id || emp.username === hubUser.username;
                return (
                  <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {emp.username}
                      {isMe && <span className="ml-2 text-[10px] text-gray-400 font-normal">(you)</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{emp.email ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      {isSuperAdmin && !isMe ? (
                        <select
                          value={emp.role}
                          onChange={e => roleMut.mutate({ id: emp.id, role: e.target.value })}
                          disabled={roleMut.isPending}
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]/30 ${ROLE_STYLES[emp.role] ?? 'bg-gray-100 text-gray-600'}`}
                        >
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
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        !isActive ? 'bg-gray-100 text-gray-500'
                          : emp.mustChangePassword ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                      }`}>
                        {!isActive ? 'Inactive' : emp.mustChangePassword ? 'Password update required' : 'Active'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">{formatDate(emp.createdAt ?? emp.joinedAt)}</td>
                    {isSuperAdmin && (
                      <td className="px-5 py-3.5">
                        {!isMe && (
                          emp.invitePending ? (
                            <button
                              onClick={() => resendMut.mutate(emp.id)}
                              disabled={resendMut.isPending}
                              className="text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-40"
                            >
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
        )}
      </div>

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
    </div>
  );
}
