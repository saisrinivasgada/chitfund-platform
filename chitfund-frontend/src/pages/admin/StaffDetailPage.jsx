import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getUserById,
  resetMemberPassword,
  getWorkerRequests,
  getBatchesByCollector,
  getMember,
  getChit,
  softDeleteStaff,
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
import {
  ArrowLeft,
  KeyRound,
  Phone,
  Mail,
  ClipboardList,
  History,
  IndianRupee,
  User,
  Trash2,
  Banknote,
} from 'lucide-react';

const ROLE_BADGE = {
  ADMIN:   { label: 'Admin',   variant: 'default' },
  WORKER:  { label: 'Worker',  variant: 'success' },
  MANAGER: { label: 'Manager', variant: 'warning' },
  AGENT:   { label: 'Agent',   variant: 'info' },
};

const STATUS_BADGE = {
  PENDING:   { label: 'Pending',   variant: 'warning' },
  ASSIGNED:  { label: 'Assigned',  variant: 'info' },
  COLLECTED: { label: 'Collected', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

function fmt(n) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Fetches member name for a given memberId — cached by React Query
function useMemberName(memberId) {
  const { data } = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => getMember(memberId),
    staleTime: 5 * 60_000,
    enabled: !!memberId,
  });
  return data?.name ?? data?.fullName ?? memberId?.slice(0, 8) + '…';
}

// Fetches chit name for a given chitId — cached by React Query
function useChitName(chitId) {
  const { data } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    staleTime: 5 * 60_000,
    enabled: !!chitId,
  });
  return data?.name ?? data?.chitName ?? '—';
}

function MemberCell({ memberId }) {
  const name = useMemberName(memberId);
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
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tempCreds, setTempCreds] = useState(null); // { username, tempPassword }

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff-detail', id],
    queryFn: () => getUserById(id),
    staleTime: 30_000,
  });

  const isCollector = staff?.role === 'WORKER' || staff?.role === 'MANAGER';

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['worker-requests', id],
    queryFn: () => getWorkerRequests(id),
    staleTime: 30_000,
    enabled: staff?.role === 'WORKER',
  });

  const { data: collectionBatches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['collector-batches', id],
    queryFn: () => getBatchesByCollector(id),
    staleTime: 30_000,
    enabled: isCollector,
  });

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

  const currentAssignments = requests.filter(r => r.status === 'ASSIGNED');
  const history = requests.filter(r => r.status !== 'ASSIGNED');

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">

      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
      >
        <ArrowLeft size={15} />
        Back to Team
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
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              <KeyRound size={14} className="mr-1.5" />
              Reset Password
            </Button>
            {isAdmin && currentUser?.id !== staff.id && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete Account
              </Button>
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

        {/* Last login */}
        {staff.lastLoginAt && (
          <p className="mt-3 text-xs text-gray-400">
            Last login: {fmtDate(staff.lastLoginAt)}
          </p>
        )}
      </div>

      {/* Worker: current assignments from CashRequests */}
      {staff.role === 'WORKER' && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} style={{ color: '#1E3A5F' }} />
            <h2 className="text-base font-bold" style={{ color: '#1E3A5F' }}>Current Assignments</h2>
            {currentAssignments.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#1E3A5F' }}>
                {currentAssignments.length}
              </span>
            )}
          </div>
          {requestsLoading ? (
            <div className="h-20 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />
          ) : currentAssignments.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No active assignments" message="No cash collection tasks currently assigned." />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <Table columns={['Member', 'Chit Fund', 'Amount', 'Assigned On', 'Notes']}>
                {currentAssignments.map((r) => (
                  <Tr key={r.id}>
                    <Td><MemberCell memberId={r.memberId} /></Td>
                    <Td><ChitCell chitId={r.chitId} /></Td>
                    <Td>
                      <span className="flex items-center gap-0.5 font-semibold text-gray-900">
                        <IndianRupee size={13} />
                        {r.requestedAmount != null ? fmt(r.requestedAmount) : 'All outstanding'}
                      </span>
                    </Td>
                    <Td><span className="text-sm text-gray-500">{fmtDate(r.assignedAt)}</span></Td>
                    <Td><span className="text-sm text-gray-500">{r.notes ?? '—'}</span></Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
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
                      <Td><MemberCell memberId={b.memberId} /></Td>
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
