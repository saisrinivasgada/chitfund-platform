import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listStaff, createStaff, deactivateStaff, activateStaff, softDeleteStaff, changeStaffRole } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Plus, Briefcase, UserCheck, UserX, Trash2, RefreshCw } from 'lucide-react';

const ROLE_BADGE = {
  ADMIN:   { label: 'Admin',   variant: 'default' },
  WORKER:  { label: 'Worker',  variant: 'success' },
  MANAGER: { label: 'Manager', variant: 'warning' },
  AGENT:   { label: 'Agent',   variant: 'info' },
};

const INITIAL_FORM = { username: '', email: '', fullName: '', phone: '', role: 'WORKER' };

function AddStaffModal({ onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { user: currentUser } = useAuth();
  const isManager = currentUser?.role === 'MANAGER';
  const [form, setForm] = useState(INITIAL_FORM);
  const [tempPass, setTempPass] = useState(null);

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setTempPass(data.tempPassword ?? null);
      const label = form.role === 'ADMIN' ? 'Admin' : form.role === 'MANAGER' ? 'Manager' : 'Worker';
      toast.success(`${label} account created`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to create account');
    },
  });

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate(form);
  }

  if (tempPass) {
    return (
      <Modal title="Account Created" onClose={onClose} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Share these login credentials with the new team member. The temporary password
            will expire after their first login.
          </p>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-gray-500 font-medium">Username</span>
              <span className="font-semibold text-gray-900">{form.username}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-gray-500 font-medium">Temp Password</span>
              <span className="font-mono font-bold text-[#1E3A5F] select-all">{tempPass}</span>
            </div>
          </div>
          <Button variant="primary" className="w-full" onClick={onClose} size="md">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Team Member" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField label="Role" required>
          <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="WORKER">Worker — field cash collector</option>
            {!isManager && <option value="MANAGER">Manager — operations, no system edits</option>}
            {!isManager && <option value="ADMIN">Admin — full platform access</option>}
          </Select>
        </FormField>
        {form.role === 'ADMIN' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Admin accounts have full platform access including creating other staff accounts and managing all data. Only create this for trusted team members.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" required>
            <Input
              placeholder="e.g. Ravi Kumar"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
            />
          </FormField>
          <FormField label="Phone">
            <Input
              placeholder="9876543210"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Username" required>
          <Input
            placeholder="e.g. ravi.worker"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            required
          />
        </FormField>

        <FormField label="Email">
          <Input
            type="email"
            placeholder="ravi@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="muted" onClick={onClose} size="md">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            loading={mutation.isPending}
            size="md"
          >
            Create Account
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeRoleModal({ staff, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [role, setRole] = useState(staff.role);

  const mutation = useMutation({
    mutationFn: () => changeStaffRole({ id: staff.id, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['staff-detail', staff.id] });
      toast.success(`Role changed to ${role}`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to change role'),
  });

  return (
    <Modal title="Change Role" onClose={onClose} size="sm">
      <div className="space-y-5">
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}>
            {(staff.fullName ?? staff.username ?? 'U').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{staff.fullName ?? staff.username}</p>
            <p className="text-xs text-gray-400">@{staff.username}</p>
          </div>
        </div>

        <FormField label="New Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="WORKER">Worker — field cash collector</option>
            <option value="MANAGER">Manager — operations, no system edits</option>
            <option value="ADMIN">Admin — full platform access</option>
          </Select>
        </FormField>

        {role === 'ADMIN' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Admin accounts have full platform access. Only assign this role to fully trusted members.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            loading={mutation.isPending}
            disabled={role === staff.role}
            onClick={() => mutation.mutate()}
          >
            Change Role
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TeamPage() {
  const toast = useToastContext();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'deactivate'|'activate'|'delete', staff }
  const [changeRoleTarget, setChangeRoleTarget] = useState(null); // staff object

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', { deleted: showDeleted }],
    queryFn: () => listStaff({ deleted: showDeleted }),
    staleTime: 30_000,
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
            <button
              onClick={() => setShowDeleted((v) => !v)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                showDeleted
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              <Trash2 size={14} />
              {showDeleted ? 'Deleted Staff' : 'Show Deleted'}
            </button>
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
                <Tr key={s.id} className={isDeleted ? 'opacity-60' : ''}>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setChangeRoleTarget(s)}
                        >
                          <RefreshCw size={14} className="mr-1" />
                          Change Role
                        </Button>
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
      {changeRoleTarget && <ChangeRoleModal staff={changeRoleTarget} onClose={() => setChangeRoleTarget(null)} />}

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
