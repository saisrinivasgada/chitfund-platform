import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  hubListEmployees, hubInviteEmployee, hubChangeRole,
  hubDeactivateEmployee, hubReactivateEmployee, hubResendEmployeeInvite,
} from '../../services/api';
import { Users, Plus, X, AlertCircle, UserCheck, UserX } from 'lucide-react';

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

export default function HubEmployeesPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

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
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isActive ? 'Active' : 'Inactive'}
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
                          ) : isActive ? (
                            <button
                              onClick={() => deactivateMut.mutate(emp.id)}
                              disabled={deactivateMut.isPending}
                              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                            >
                              <UserX size={13} /> Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => reactivateMut.mutate(emp.id)}
                              disabled={reactivateMut.isPending}
                              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 transition-colors disabled:opacity-40"
                            >
                              <UserCheck size={13} /> Reactivate
                            </button>
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
    </div>
  );
}
