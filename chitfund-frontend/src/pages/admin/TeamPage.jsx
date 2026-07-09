import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listStaff, createStaff, deactivateStaff, activateStaff, softDeleteStaff } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Plus, Briefcase, UserCheck, UserX, Trash2, Shield, User, Phone, Mail, AtSign, Copy, Check, AlertTriangle } from 'lucide-react';

const ROLE_BADGE = {
  ADMIN:   { label: 'Admin',   variant: 'default' },
  WORKER:  { label: 'Worker',  variant: 'success' },
  MANAGER: { label: 'Manager', variant: 'warning' },
  AGENT:   { label: 'Agent',   variant: 'info' },
};

const INITIAL_FORM = { username: '', email: '', fullName: '', phone: '', role: 'WORKER' };

const ROLE_OPTIONS = [
  {
    value: 'WORKER',
    label: 'Worker',
    desc: 'Collects cash in the field',
    icon: UserCheck,
    color: '#16A34A',
    bg: '#F0FDF4',
    border: '#BBF7D0',
  },
  {
    value: 'MANAGER',
    label: 'Manager',
    desc: 'Operations oversight, no system edits',
    icon: Briefcase,
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    desc: 'Full platform access',
    icon: Shield,
    color: '#1E3A5F',
    bg: '#EFF3F8',
    border: '#BFCFDE',
  },
];

function StyledInput({ icon: Icon, ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 flex items-center" style={{ left: '0.75rem' }}>
          <Icon size={15} />
        </span>
      )}
      <input
        className="w-full py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 transition-all text-gray-900 placeholder-gray-400"
        style={{
          paddingLeft: Icon ? '2.25rem' : '0.875rem',
          paddingRight: '0.875rem',
        }}
        {...props}
      />
    </div>
  );
}

function CopyBothButton({ username, password }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const text = `Username: ${username}\nPassword: ${password}`;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand('copy'); document.body.removeChild(el); done();
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5 text-sm font-semibold text-gray-500 hover:text-[#1E3A5F] transition-all"
    >
      {copied ? <><Check size={15} className="text-green-500" /> Copied!</> : <><Copy size={15} /> Copy Username & Password</>}
    </button>
  );
}

function CredentialRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, done));
    } else {
      fallbackCopy(value, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand('copy'); document.body.removeChild(el); done();
  }
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-gray-500 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${mono ? 'font-mono tracking-wide text-[#1E3A5F]' : 'text-gray-900'}`}>
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          title="Copy"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { user: currentUser } = useAuth();
  const isManager = currentUser?.role === 'MANAGER';
  const [form, setForm] = useState(INITIAL_FORM);
  const [tempPass, setTempPass] = useState(null);

  const availableRoles = ROLE_OPTIONS.filter((r) =>
    isManager ? r.value === 'WORKER' : true
  );

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setTempPass(data.tempPassword ?? null);
      const label = ROLE_OPTIONS.find((r) => r.value === form.role)?.label ?? form.role;
      toast.success(`${label} account created`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to create account');
    },
  });

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  if (tempPass) {
    return (
      <Modal title="Account Created" onClose={onClose} size="sm">
        <div className="space-y-5">
          {/* Success icon */}
          <div className="flex flex-col items-center pt-2 pb-1 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <Check size={28} className="text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">Ready to go!</p>
              <p className="text-sm text-gray-400 mt-0.5">Share these credentials with the new team member.</p>
            </div>
          </div>

          {/* Credentials card */}
          <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden bg-gray-50">
            <CredentialRow label="Username" value={form.username} />
            <CredentialRow label="Temp Password" value={tempPass} mono />
          </div>

          <CopyBothButton username={form.username} password={tempPass} />

          <p className="text-xs text-center text-gray-400">
            The temporary password expires after first login.
          </p>

          <Button variant="primary" size="md" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Team Member" onClose={onClose} size="md">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-5">

        {/* Role selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Role</p>
          <div className={`grid gap-3 ${availableRoles.length === 1 ? 'grid-cols-1' : availableRoles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {availableRoles.map((r) => {
              const Icon = r.icon;
              const active = form.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set('role', r.value)}
                  className="flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 text-center transition-all cursor-pointer"
                  style={{
                    borderColor: active ? r.color : '#E5E7EB',
                    backgroundColor: active ? r.bg : '#FAFAFA',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: active ? r.color : '#F3F4F6' }}
                  >
                    <Icon size={16} style={{ color: active ? '#fff' : '#9CA3AF' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: active ? r.color : '#374151' }}>
                      {r.label}
                    </p>
                    <p className="text-[11px] leading-snug mt-0.5" style={{ color: active ? r.color : '#9CA3AF' }}>
                      {r.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin warning */}
        {form.role === 'ADMIN' && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Admin accounts have full platform access including creating other staff and managing all data. Only add trusted team members.
            </p>
          </div>
        )}

        {/* Name + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
            <StyledInput
              icon={User}
              placeholder="Sai Srinivas"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <StyledInput
              icon={Phone}
              placeholder="9876543210"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 15))}
            />
          </div>
        </div>

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Username <span className="text-red-500">*</span></label>
          <StyledInput
            icon={AtSign}
            placeholder="sai.worker"
            value={form.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            required
          />
          <p className="text-xs text-gray-400 pl-0.5">Letters, numbers, _ and . only</p>
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <StyledInput
            icon={Mail}
            type="email"
            placeholder="sai@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" onClick={onClose} size="md">Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} size="md">
            Create Account
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TeamPage() {
  const navigate = useNavigate();
  const toast = useToastContext();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'deactivate'|'activate'|'delete', staff }

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', { deleted: showDeleted }],
    queryFn: () => listStaff({ deleted: showDeleted }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ type, id }) =>
      type === 'deactivate' ? deactivateStaff(id) : activateStaff(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(vars.type === 'deactivate' ? 'Account deactivated' : 'Account reactivated');
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Action failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }) => softDeleteStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff account deleted');
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Delete failed');
    },
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Team
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage admins, managers and workers</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button
              variant={showDeleted ? 'danger' : 'secondary'}
              onClick={() => setShowDeleted((v) => !v)}
            >
              <Trash2 size={14} />
              {showDeleted ? 'Show Active' : 'Show Deleted'}
            </Button>
          )}
          {!showDeleted && (
            <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
              <Plus size={16} className="mr-1.5" />
              Add Member
            </Button>
          )}
        </div>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={showDeleted ? Trash2 : Briefcase}
          title={showDeleted ? 'No deleted staff' : 'No team members yet'}
          message={
            showDeleted
              ? 'No staff accounts have been deleted yet.'
              : 'Add workers and managers to start assigning cash collection tasks.'
          }
          action={!showDeleted ? 'Add first member' : undefined}
          onAction={!showDeleted ? () => setShowAdd(true) : undefined}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <Table columns={['Name', 'Username', 'Role', 'Status', 'Actions']}>
            {staff.map((s) => {
              const roleCfg = ROLE_BADGE[s.role] ?? { label: s.role, variant: 'default' };
              const isActive = s.enabled && !s.locked;
              const isSelf = s.id === currentUser?.id;
              const isDeleted = !!s.deletedAt;
              return (
                <Tr
                  key={s.id}
                  className={isDeleted ? 'opacity-60' : ''}
                  onClick={() => !isDeleted && navigate(`/staff/${s.id}`)}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isDeleted ? 'bg-gray-400' : ''}`}
                        style={isDeleted ? {} : { backgroundColor: '#1E3A5F' }}
                      >
                        {(s.fullName ?? s.username ?? 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {isSelf ? (
                            <span className="text-sm font-medium" style={{ color: '#1E3A5F' }}>
                              {s.fullName ?? s.username}
                            </span>
                          ) : (
                            <Link
                              to={`/staff/${s.id}`}
                              className={`text-sm font-medium hover:underline ${isDeleted ? 'line-through text-gray-400' : ''}`}
                              style={isDeleted ? {} : { color: '#1E3A5F' }}
                            >
                              {s.fullName ?? s.username}
                            </Link>
                          )}
                          {isSelf && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EFF3F8] text-[#1E3A5F]">
                              You
                            </span>
                          )}
                        </div>
                        {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                        {isDeleted && s.deletedAt && (
                          <p className="text-xs text-red-400">
                            Deleted {new Date(s.deletedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-sm text-gray-700">{s.username}</span>
                  </Td>
                  <Td>
                    <Badge variant={roleCfg.variant}>{roleCfg.label}</Badge>
                  </Td>
                  <Td>
                    {isDeleted ? (
                      <Badge variant="danger">Deleted</Badge>
                    ) : (
                      <Badge variant={isActive ? 'success' : 'danger'}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    {isDeleted ? (
                      <span className="text-xs text-gray-400 italic">—</span>
                    ) : isSelf || isManager ? (
                      <span className="text-xs text-gray-400 italic">—</span>
                    ) : isAdmin ? (
                      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {isActive ? (
                          <Button
                            variant="muted"
                            size="sm"
                            onClick={() => setConfirmAction({ type: 'deactivate', staff: s })}
                          >
                            <UserX size={14} className="mr-1" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => setConfirmAction({ type: 'activate', staff: s })}
                          >
                            <UserCheck size={14} className="mr-1" />
                            Reactivate
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmAction({ type: 'delete', staff: s })}
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </div>
      )}

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} />}

      {confirmAction && (
        <ConfirmDialog
          variant={confirmAction.type === 'delete' || confirmAction.type === 'deactivate' ? 'danger' : 'primary'}
          title={
            confirmAction.type === 'delete'
              ? 'Delete Staff Account'
              : confirmAction.type === 'deactivate'
              ? 'Deactivate Account'
              : 'Reactivate Account'
          }
          description={
            confirmAction.type === 'delete'
              ? `This will permanently mark ${confirmAction.staff.fullName ?? confirmAction.staff.username}'s account as deleted. The record is kept but the account cannot be used.`
              : confirmAction.type === 'deactivate'
              ? `${confirmAction.staff.fullName ?? confirmAction.staff.username} will no longer be able to log in.`
              : `${confirmAction.staff.fullName ?? confirmAction.staff.username} will regain access immediately.`
          }
          actionLabel={
            confirmAction.type === 'delete'
              ? 'Delete Account'
              : confirmAction.type === 'deactivate'
              ? 'Deactivate'
              : 'Reactivate'
          }
          loading={toggleMutation.isPending || deleteMutation.isPending}
          onConfirm={() =>
            confirmAction.type === 'delete'
              ? deleteMutation.mutate({ id: confirmAction.staff.id })
              : toggleMutation.mutate({ type: confirmAction.type, id: confirmAction.staff.id })
          }
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
