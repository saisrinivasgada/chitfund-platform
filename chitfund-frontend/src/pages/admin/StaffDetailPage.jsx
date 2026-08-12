import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getUserById,
  resetMemberPassword,
  getStaffRequests,
  getBatchesByCollector,
  getChit,
  softDeleteStaff,
  changeStaffRole,
  getMembers,
  listStaff,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import FormField, { Select } from '../../components/ui/FormField';
import {
  ArrowLeft,
  KeyRound,
  Phone,
  Mail,
  ClipboardList,
  History,
  IndianRupee,
  Trash2,
  Banknote,
  RefreshCw,
  Clock,
  UserCheck,
  PackageCheck,
  ChevronRight,
} from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

const ROLE_BADGE = {
  ADMIN:   { label: 'Admin',   variant: 'default' },
  STAFF:   { label: 'Staff',   variant: 'success' },
  MANAGER: { label: 'Manager', variant: 'warning' },
  AGENT:   { label: 'Agent',   variant: 'info' },
};

const STATUS_BADGE = {
  PENDING:   { label: 'Pending',    variant: 'warning' },
  ASSIGNED:  { label: 'Assigned',   variant: 'info' },
  PICKED_UP: { label: 'Picked Up',  variant: 'success' },
  COLLECTED: { label: 'Collected',  variant: 'success' },
  CANCELLED: { label: 'Cancelled',  variant: 'danger' },
};

function fmt(n) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function CashPickupTrailModal({ request, workerName, memberMap = {}, onClose }) {
  const { hidden } = useHiddenAmounts();
  const steps = [
    {
      icon: Clock,
      color: '#1E3A5F',
      bg: '#EEF2F8',
      label: 'Pickup Initiated',
      sub: 'Admin created cash pickup request',
      time: request.requestedAt,
      done: true,
    },
    {
      icon: UserCheck,
      color: '#D97706',
      bg: '#FEF3C7',
      label: 'Assigned to Staff',
      sub: workerName ? `Assigned to ${workerName}` : 'Assigned to staff',
      time: request.assignedAt,
      done: !!request.assignedAt,
    },
    {
      icon: PackageCheck,
      color: '#16A34A',
      bg: '#F0FDF4',
      label: 'Picked Up from Member',
      sub: request.pickedUpAt
        ? `${workerName ?? 'Staff'} confirmed physical pickup`
        : 'Staff has not yet marked as picked up',
      time: request.pickedUpAt,
      done: !!request.pickedUpAt,
    },
    {
      icon: Banknote,
      color: '#1E3A5F',
      bg: '#EEF2F8',
      label: 'Handed to Admin & Confirmed',
      sub: request.status === 'COLLECTED'
        ? 'Admin confirmed receipt — member account credited'
        : request.status === 'CANCELLED'
        ? 'Request was cancelled'
        : 'Awaiting admin to confirm receipt',
      time: request.status === 'COLLECTED' || request.status === 'CANCELLED' ? request.updatedAt : null,
      done: request.status === 'COLLECTED',
      cancelled: request.status === 'CANCELLED',
    },
  ];

  return (
    <Modal title="Cash Pickup Audit Trail" onClose={onClose} size="sm">
      <div className="pb-2">
        {/* Summary header */}
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <MemberCell memberId={request.memberId} memberMap={memberMap} />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                request.status === 'COLLECTED' ? 'bg-green-100 text-green-700' :
                request.status === 'PICKED_UP' ? 'bg-green-100 text-green-700' :
                request.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' :
                'bg-blue-100 text-blue-700'
              }`}>
                {STATUS_BADGE[request.status]?.label ?? request.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              <ChitCell chitId={request.chitId} /> · {hidden ? '••••••' : `₹${fmt(request.requestedAmount)}`}
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === steps.length - 1;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: step.done ? step.bg : step.cancelled ? '#FEE2E2' : '#F3F4F6',
                      border: `2px solid ${step.done ? step.color : step.cancelled ? '#EF4444' : '#D1D5DB'}`,
                    }}
                  >
                    <Icon size={14} style={{ color: step.done ? step.color : step.cancelled ? '#DC2626' : '#9CA3AF' }} />
                  </div>
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1 my-1"
                      style={{ backgroundColor: step.done ? step.color : '#E5E7EB', minHeight: '20px' }}
                    />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${step.done || step.cancelled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{step.sub}</p>
                  {step.time && (
                    <p className="text-xs text-gray-400 mt-1 font-medium">{fmtDateTime(step.time)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {request.notes && (
          <div className="mt-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-0.5">Member Note</p>
            <p className="text-sm text-gray-700 italic">"{request.notes}"</p>
          </div>
        )}
        {request.adminNotes && (
          <div className="mt-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-xs text-amber-700 font-medium mb-0.5">Admin Note</p>
            <p className="text-sm text-gray-700 italic">"{request.adminNotes}"</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Fetches chit name for a given chitId — cached by React Query
function useChitName(chitId) {
  const { data } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    enabled: !!chitId,
  });
  return data?.name ?? data?.chitName ?? '—';
}

function MemberCell({ memberId, memberMap = {} }) {
  const name = memberMap[memberId] ?? memberId?.slice(0, 8) + '…';
  return (
    <Link
      to={`/members/${memberId}`}
      className="text-sm font-medium hover:underline"
      style={{ color: '#1E3A5F' }}
    >
      {name}
    </Link>
  );
}

function ChitCell({ chitId }) {
  const name = useChitName(chitId);
  return <span className="text-sm text-gray-700">{name}</span>;
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
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {(staff.fullName ?? staff.username ?? 'U').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{staff.fullName ?? staff.username}</p>
            <p className="text-xs text-gray-400">@{staff.username}</p>
          </div>
        </div>
        <FormField label="New Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STAFF">Staff — field cash collector</option>
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

function TempPassModal({ username, tempPassword, onClose }) {
  return (
    <Modal title="New Temporary Password" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Share these credentials with the staff member. The password expires after first login.
        </p>
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-gray-500 font-medium">Username</span>
            <span className="font-semibold text-gray-900">{username}</span>
          </div>
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-gray-500 font-medium">Temp Password</span>
            <span className="font-mono font-bold text-[#1E3A5F] select-all">{tempPassword}</span>
          </div>
        </div>
        <Button variant="primary" className="w-full" onClick={onClose} size="md">Done</Button>
      </div>
    </Modal>
  );
}

export default function StaffDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToastContext();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [tempCreds, setTempCreds] = useState(null);
  const [trailRequest, setTrailRequest] = useState(null);
  const { hidden } = useHiddenAmounts();

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff-detail', id],
    queryFn: () => getUserById(id),
  });

  const isCollector = staff?.role === 'STAFF' || staff?.role === 'MANAGER';

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['staff-requests', id],
    queryFn: () => getStaffRequests(id),
    enabled: isCollector,
  });

  const { data: collectionBatches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['collector-batches', id],
    queryFn: () => getBatchesByCollector(id),
    enabled: isCollector,
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});
  const { data: allStaffList = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const staffLookup = Object.fromEntries(allStaffList.map((s) => [s.id, s.fullName ?? s.username ?? '—']));
  const memberMap = Object.fromEntries([
    ...allStaffList.map((s) => [s.id, s.fullName ?? s.username ?? '—']),
    ...allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name ?? '—';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
  ]);

  const resetMutation = useMutation({
    mutationFn: () => resetMemberPassword(id),
    onSuccess: (data) => {
      setConfirmReset(false);
      setTempCreds({ username: staff.username, tempPassword: data.tempPassword });
      toast.success('Temporary password generated');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to reset password');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff account deleted');
      navigate('/team');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Delete failed');
    },
  });

  if (isLoading) return <PageSpinner />;
  if (!staff) return (
    <div className="p-8 text-center text-gray-500">Staff member not found.</div>
  );

  const isActive = staff.enabled && !staff.locked;
  const isDeleted = !!staff.deletedAt;
  const roleCfg = ROLE_BADGE[staff.role] ?? { label: staff.role, variant: 'default' };

  const currentAssignments = requests.filter(r => r.status === 'ASSIGNED' || r.status === 'PICKED_UP');
  const requestHistory = requests.filter(r => r.status === 'COLLECTED' || r.status === 'CANCELLED');
  const pendingBatches = collectionBatches.filter(b => b.status === 'AWAITING_REMITTANCE');
  const totalCashPending = pendingBatches.reduce((sum, b) => sum + Number(b.totalAmount ?? 0), 0);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Deleted banner */}
      {isDeleted && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <Trash2 size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">This account has been deleted</p>
            <p className="text-xs text-red-500 mt-0.5">
              Deleted {new Date(staff.deletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {' '}— Record is read-only. All data is preserved for audit purposes.
            </p>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className={`bg-white rounded-2xl border border-gray-200 p-6 ${isDeleted ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${isDeleted ? 'bg-gray-400' : ''}`}
              style={isDeleted ? {} : { backgroundColor: '#1E3A5F' }}
            >
              {(staff.fullName ?? staff.username ?? 'U').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1
                className={`text-xl font-bold ${isDeleted ? 'text-gray-400 line-through' : ''}`}
                style={isDeleted ? {} : { color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
              >
                {staff.fullName ?? staff.username}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">@{staff.username}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant={roleCfg.variant}>{roleCfg.label}</Badge>
                {isDeleted ? (
                  <Badge variant="danger">Deleted</Badge>
                ) : (
                  <Badge variant={isActive ? 'success' : 'danger'}>
                    {isActive ? 'Active' : 'Inactive'}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {!isDeleted && (
          <div className="flex items-center gap-2 flex-wrap">
            {!isManager && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              <KeyRound size={14} className="mr-1.5" />
              Reset Password
            </Button>
            )}
            {isAdmin && currentUser?.id !== staff.id && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setShowChangeRole(true)}>
                  <RefreshCw size={14} className="mr-1.5" />
                  Change Role
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} className="mr-1.5" /> Delete Account
                </Button>
              </>
            )}
          </div>
          )}
        </div>

        {/* Contact info */}
        {(staff.phone || staff.email) && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap gap-5">
            {staff.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400" />
                {staff.phone}
              </div>
            )}
            {staff.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={14} className="text-gray-400" />
                {staff.email}
              </div>
            )}
          </div>
        )}

        {/* Last login + audit trail */}
        <div className="mt-3 space-y-0.5">
          {staff.lastLoginAt && (
            <p className="text-xs text-gray-400">Last login: {fmtDate(staff.lastLoginAt)}</p>
          )}
          {staff.createdAt && (
            <p className="text-xs text-gray-400">
              Created: {fmtDate(staff.createdAt)}
              {staff.createdBy && staffLookup[staff.createdBy] && (
                <span className="text-gray-300"> · by {staffLookup[staff.createdBy]}</span>
              )}
            </p>
          )}
          {staff.updatedAt && staff.updatedAt !== staff.createdAt && (
            <p className="text-xs text-gray-400">
              Last changed: {fmtDate(staff.updatedAt)}
              {staff.updatedBy && staffLookup[staff.updatedBy] && (
                <span className="text-gray-300"> · by {staffLookup[staff.updatedBy]}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Worker + Manager: live status summary */}
      {isCollector && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`rounded-2xl border p-5 ${currentAssignments.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-3xl font-extrabold ${currentAssignments.length > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
              {currentAssignments.length}
            </p>
            <p className={`text-xs font-semibold mt-1 ${currentAssignments.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>Pending Pickups</p>
            <p className="text-xs text-gray-400 mt-0.5">Assigned but not yet handed to admin</p>
          </div>
          <div className={`rounded-2xl border p-5 ${pendingBatches.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-3xl font-extrabold ${pendingBatches.length > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
              {pendingBatches.length}
            </p>
            <p className={`text-xs font-semibold mt-1 ${pendingBatches.length > 0 ? 'text-orange-700' : 'text-gray-400'}`}>Pending Remittance</p>
            <p className="text-xs text-gray-400 mt-0.5">Collected but not yet remitted to admin</p>
          </div>
          <div className={`rounded-2xl border p-5 ${totalCashPending > 0 ? 'bg-[#EEF2F8] border-[#1E3A5F]/30' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-extrabold truncate ${totalCashPending > 0 ? 'text-[#1E3A5F]' : 'text-gray-300'}`}>
              {hidden ? '••••••' : `₹${fmt(totalCashPending) ?? '0'}`}
            </p>
            <p className={`text-xs font-semibold mt-1 ${totalCashPending > 0 ? 'text-[#1E3A5F]' : 'text-gray-400'}`}>Cash to Remit</p>
            <p className="text-xs text-gray-400 mt-0.5">Total outstanding cash with this person</p>
          </div>
        </div>
      )}

      {/* Worker + Manager: active cash pickup assignments */}
      {isCollector && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} style={{ color: '#1E3A5F' }} />
            <h2 className="text-base font-bold" style={{ color: '#1E3A5F' }}>Pending Pickups</h2>
            {currentAssignments.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#1E3A5F' }}>
                {currentAssignments.length}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 -mt-1">Tasks currently assigned to this person — cash not yet delivered to admin.</p>
          {requestsLoading ? (
            <div className="h-20 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />
          ) : currentAssignments.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No pending pickups" message="No cash collection tasks currently assigned." />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <Table columns={['Member', 'Chit Fund', 'Amount', 'Assigned On', 'Status', '']}>
                {currentAssignments.map((r) => {
                  const cfg = STATUS_BADGE[r.status] ?? { label: r.status, variant: 'default' };
                  return (
                    <Tr key={r.id}>
                      <Td><MemberCell memberId={r.memberId} memberMap={memberMap} /></Td>
                      <Td><ChitCell chitId={r.chitId} /></Td>
                      <Td>
                        <span className="flex items-center gap-0.5 font-semibold text-gray-900">
                          <IndianRupee size={13} />
                          {r.requestedAmount != null ? fmt(r.requestedAmount) : 'All outstanding'}
                        </span>
                      </Td>
                      <Td><span className="text-sm text-gray-500">{fmtDate(r.assignedAt)}</span></Td>
                      <Td>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          {r.status === 'PICKED_UP' && r.pickedUpAt && (
                            <span className="text-xs text-gray-400">at {fmtDate(r.pickedUpAt)}</span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <button
                          onClick={() => setTrailRequest(r)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors cursor-pointer"
                          title="View full details"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </Td>
                    </Tr>
                  );
                })}
              </Table>
            </div>
          )}
        </section>
      )}

      {/* Worker + Manager: completed / cancelled cash request history */}
      {isCollector && requestHistory.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History size={16} style={{ color: '#1E3A5F' }} />
            <h2 className="text-base font-bold" style={{ color: '#1E3A5F' }}>Cash Pickup History</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#1E3A5F' }}>
              {requestHistory.length}
            </span>
          </div>
          <p className="text-xs text-gray-400 -mt-1">
            Physical pickup requests completed or cancelled — tracks whether cash was actually collected from the member.
            <span className="ml-1 font-medium text-gray-500">(Different from Collection History below ↓)</span>
          </p>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <Table columns={['Member', 'Chit Fund', 'Amount', 'Date', 'Status', '']}>
              {requestHistory.map((r) => {
                const cfg = STATUS_BADGE[r.status] ?? { label: r.status, variant: 'default' };
                return (
                  <Tr key={r.id}>
                    <Td><MemberCell memberId={r.memberId} memberMap={memberMap} /></Td>
                    <Td><ChitCell chitId={r.chitId} /></Td>
                    <Td>
                      <span className="flex items-center gap-0.5 font-semibold text-gray-900">
                        <IndianRupee size={13} />
                        {r.requestedAmount != null ? fmt(r.requestedAmount) : '—'}
                      </span>
                    </Td>
                    <Td><span className="text-sm text-gray-500">{fmtDate(r.updatedAt)}</span></Td>
                    <Td><Badge variant={cfg.variant}>{cfg.label}</Badge></Td>
                    <Td>
                      <button
                        onClick={() => setTrailRequest(r)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors cursor-pointer"
                        title="View full details"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </div>
        </section>
      )}

      {/* Worker + Manager: full payment batch collection history */}
      {isCollector && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Banknote size={16} style={{ color: '#1E3A5F' }} />
            <h2 className="text-base font-bold" style={{ color: '#1E3A5F' }}>Collection History</h2>
            {collectionBatches.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#1E3A5F' }}>
                {collectionBatches.length}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 -mt-1">
            Payment batches — financial records created after cash is confirmed received and credited to the member's account.
            <span className="ml-1 font-medium text-gray-500">(These come after a successful pickup above ↑)</span>
          </p>
          {batchesLoading ? (
            <div className="h-32 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />
          ) : collectionBatches.length === 0 ? (
            <EmptyState icon={History} title="No collection history yet" message="Cash collections by this person will appear here." />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <Table columns={['Member', 'Chit Fund', 'Amount', 'Date', 'Status']}>
                {collectionBatches.map((b) => {
                  const statusStyle =
                    b.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    b.status === 'AWAITING_REMITTANCE' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500';
                  const statusLabel =
                    b.status === 'AWAITING_REMITTANCE' ? 'Pending Remittance' : b.status;
                  return (
                    <Tr key={b.id}>
                      <Td><MemberCell memberId={b.memberId} memberMap={memberMap} /></Td>
                      <Td><ChitCell chitId={b.chitId} /></Td>
                      <Td>
                        <span className="flex items-center gap-0.5 font-semibold text-gray-900">
                          <IndianRupee size={13} />
                          {fmt(b.totalAmount)}
                        </span>
                      </Td>
                      <Td><span className="text-sm text-gray-500">{fmtDate(b.collectedAt ?? b.createdAt)}</span></Td>
                      <Td>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </Table>
            </div>
          )}
        </section>
      )}

      {/* Cash pickup trail */}
      {trailRequest && (
        <CashPickupTrailModal
          request={trailRequest}
          workerName={staff.fullName ?? staff.username}
          memberMap={memberMap}
          onClose={() => setTrailRequest(null)}
        />
      )}

      {/* Confirm reset */}
      {confirmReset && (
        <ConfirmDialog
          variant="primary"
          title="Reset Password"
          description={`Generate a new temporary password for ${staff.fullName ?? staff.username}? They will be required to change it on next login.`}
          actionLabel="Reset Password"
          loading={resetMutation.isPending}
          onConfirm={() => resetMutation.mutate()}
          onClose={() => setConfirmReset(false)}
        />
      )}

      {/* Show temp credentials */}
      {tempCreds && (
        <TempPassModal
          username={tempCreds.username}
          tempPassword={tempCreds.tempPassword}
          onClose={() => setTempCreds(null)}
        />
      )}

      {/* Change role */}
      {showChangeRole && (
        <ChangeRoleModal staff={staff} onClose={() => setShowChangeRole(false)} />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmDialog
          variant="danger"
          title="Delete Staff Account"
          description={`Are you sure you want to delete ${staff.fullName ?? staff.username}'s account? The record is kept in the database but the account will be permanently disabled.`}
          actionLabel="Delete Account"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
