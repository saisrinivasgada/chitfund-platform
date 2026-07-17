import { useState } from 'react';
import { useNavigate, NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getMembers, getChitsForMember, getMemberBalance, getMemberCredit,
  collectPayment, recordPayment, getAllPaymentBatches,
  getActiveCashRequests, assignStaffToRequest, cancelCashRequest, listStaff,
  getPendingRemittance, remitPayment, voidPaymentBatch,
  adminCreateCashRequest, collectForRequest, voidCashPickup, getCashRequestAuditLog,
  updateCashRequest, getCashRequestSummary, getCancelledCashRequests,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import Modal from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ListSkeleton } from '../../components/ui/Spinner';
import { CreditCard, Clock, History, Banknote, UserCheck, CheckCircle, Plus, PackageCheck, ChevronRight, XCircle, RotateCcw, AlertTriangle, Pencil, AlertCircle, HandCoins, CalendarClock } from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

const ADMIN_TABS   = ['Record Payment', 'Cash Requests', 'Remittance', 'History'];
const MANAGER_TABS = ['Record Payment', 'Cash Requests', 'Remittance', 'History'];
const STAFF_TABS   = ['Record Payment'];

const TAB_ROUTES = {
  'Record Payment': 'record',
  'Cash Requests':  'cash-requests',
  'Remittance':     'remittance',
  'History':        'history',
};

const TAB_ICONS = {
  'Record Payment': CreditCard,
  'Cash Requests':  Banknote,
  'Remittance':     Clock,
  'History':        History,
};

function TabBar({ tabs }) {
  return (
    <div className="flex gap-2 flex-wrap" style={{ marginTop: 12, marginBottom: 12 }}>
      {tabs.map((t) => {
        const Icon = TAB_ICONS[t];
        return (
          <NavLink
            key={t}
            to={TAB_ROUTES[t]}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full cursor-pointer whitespace-nowrap transition-all"
            style={({ isActive }) => ({
              padding: '6px 16px',
              backgroundColor: isActive ? '#1E3A5F' : '#ffffff',
              color: isActive ? '#ffffff' : '#374151',
              border: isActive ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
            })}
          >
            {Icon && <Icon size={14} />}
            {t}
          </NavLink>
        );
      })}
    </div>
  );
}

// ─── Cash Requests Tab ─────────────────────────────────────────────────────
const REQ_STATUS_STYLE = {
  PENDING:              'bg-amber-100 text-amber-700',
  SCHEDULED:            'bg-sky-100 text-sky-700',
  ASSIGNED:             'bg-blue-100 text-blue-700',
  PICKED_UP:            'bg-green-100 text-green-700',
  PARTIALLY_COLLECTED:  'bg-purple-100 text-purple-700',
  COLLECTED:            'bg-[#EEF2F8] text-[#1E3A5F]',
  CANCELLED:            'bg-gray-100 text-gray-500',
};

const STATUS_FILTERS = [
  { key: 'PENDING',             label: 'Pending',           icon: Clock,          color: '#D97706' },
  { key: 'SCHEDULED',           label: 'Scheduled',         icon: CalendarClock,  color: '#0284C7' },
  { key: 'ASSIGNED',            label: 'Assigned',          icon: UserCheck,      color: '#2563EB' },
  { key: 'PICKED_UP',           label: 'Picked Up',         icon: PackageCheck,   color: '#16A34A' },
  { key: 'PARTIALLY_COLLECTED', label: 'Partial',           icon: AlertCircle,    color: '#7C3AED' },
  { key: 'CANCELLED',           label: 'Cancelled',         icon: XCircle,        color: '#6B7280' },
];

function utc(s) { return s ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null; }
function fmtCRDateTime(d) {
  if (!d) return null;
  const dt = new Date(utc(d));
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const AUDIT_ACTION_META = {
  CREATED:              { icon: Clock,         color: '#1E3A5F', bg: '#EEF2F8', label: 'Request Created' },
  ASSIGNED:             { icon: UserCheck,     color: '#D97706', bg: '#FEF3C7', label: 'Staff Assigned' },
  PICKED_UP:            { icon: PackageCheck,  color: '#16A34A', bg: '#F0FDF4', label: 'Picked Up by Staff' },
  PARTIALLY_COLLECTED:  { icon: AlertCircle,   color: '#7C3AED', bg: '#F5F3FF', label: 'Partial Collection Recorded' },
  MEMBER_APPROVED:      { icon: CheckCircle,   color: '#16A34A', bg: '#F0FDF4', label: 'Member Approved Partial' },
  MEMBER_REJECTED:      { icon: XCircle,       color: '#DC2626', bg: '#FEF2F2', label: 'Member Rejected Partial' },
  PICKUP_VOIDED:        { icon: RotateCcw,     color: '#DC2626', bg: '#FEF2F2', label: 'Pickup Voided by Admin' },
  COLLECTED:            { icon: Banknote,      color: '#1E3A5F', bg: '#EEF2F8', label: 'Admin Confirmed Collection' },
  CANCELLED:            { icon: XCircle,       color: '#6B7280', bg: '#F3F4F6', label: 'Cancelled' },
  RESCHEDULED:          { icon: Clock,         color: '#7C3AED', bg: '#F5F3FF', label: 'Rescheduled' },
  UPDATED:              { icon: Pencil,        color: '#6B7280', bg: '#F3F4F6', label: 'Updated by Admin' },
};

function AdminCashTrailModal({ request, memberMap, staffMap, onClose }) {
  const { hidden } = useHiddenAmounts();
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['cashAudit', request.id],
    queryFn: () => getCashRequestAuditLog(request.id),
  });

  return (
    <Modal title="Cash Pickup Audit Trail" onClose={onClose} size="sm">
      <div className="space-y-4 pb-2">
        {/* Header summary */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-9 h-9 rounded-full bg-[#EEF2F8] flex items-center justify-center text-[#1E3A5F] font-bold text-sm flex-shrink-0">
            {(memberMap[request.memberId] ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {memberMap[request.memberId] ?? request.memberId?.slice(0, 8)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hidden ? '••••••' : `₹${Number(request.requestedAmount).toLocaleString('en-IN')}`}
              {request.assignedStaffId && ` · ${staffMap[request.assignedStaffId] ?? 'Staff'}`}
              {' · '}
              <span className={`font-medium ${
                request.status === 'PICKED_UP' ? 'text-green-600'
                : request.status === 'COLLECTED' ? 'text-[#1E3A5F]'
                : request.status === 'CANCELLED' ? 'text-gray-500'
                : 'text-amber-600'}`}>
                {request.status}
              </span>
            </p>
          </div>
        </div>

        {/* Live audit timeline */}
        {isLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading audit log…</div>
        ) : auditLogs.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-400">No audit entries (pre-existing request)</div>
        ) : (
          <div className="space-y-0">
            {auditLogs.map((entry, i) => {
              const meta = AUDIT_ACTION_META[entry.action] ?? { icon: Clock, color: '#6B7280', bg: '#F3F4F6', label: entry.action };
              const Icon = meta.icon;
              const isLast = i === auditLogs.length - 1;
              const isVoid = entry.action === 'PICKUP_VOIDED';
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: meta.bg, border: `2px solid ${meta.color}` }}
                    >
                      <Icon size={14} style={{ color: meta.color }} />
                    </div>
                    {!isLast && (
                      <div className="w-0.5 flex-1 my-1" style={{ backgroundColor: meta.color + '40', minHeight: '20px' }} />
                    )}
                  </div>
                  <div className={`pb-4 min-w-0 flex-1 ${isVoid ? 'bg-red-50 rounded-xl px-3 py-2 -ml-1 mb-1' : ''}`}>
                    <p className={`text-sm font-semibold ${isVoid ? 'text-red-700' : 'text-gray-900'}`}>
                      {meta.label}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {entry.performedByRole && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          entry.performedByRole === 'ADMIN' ? 'bg-[#EEF2F8] text-[#1E3A5F]'
                          : (entry.performedByRole === 'WORKER' || entry.performedByRole === 'STAFF') ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {entry.performedByRole}
                          {entry.performedBy && staffMap[entry.performedBy] ? ` · ${staffMap[entry.performedBy]}` : ''}
                        </span>
                      )}
                      {entry.fromStatus && entry.fromStatus !== entry.toStatus && (
                        <span className="text-xs text-gray-400">
                          {entry.fromStatus} → {entry.toStatus}
                        </span>
                      )}
                    </div>
                    {entry.reason && (
                      <p className={`text-xs mt-1 italic ${isVoid ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        "{entry.reason}"
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{fmtCRDateTime(entry.performedAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notes */}
        {request.notes && (
          <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-0.5">Member Note</p>
            <p className="text-sm text-gray-700 italic">"{request.notes}"</p>
          </div>
        )}
        {request.adminNotes && (
          <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-xs text-amber-700 font-medium mb-0.5">Admin Note</p>
            <p className="text-sm text-gray-700 italic">"{request.adminNotes}"</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AssignWorkerModal({ request, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [workerId, setWorkerId] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const { hidden } = useHiddenAmounts();

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
  });
  const workers = staff.filter((s) => s.role === 'STAFF' && s.enabled);

  const mutation = useMutation({
    mutationFn: () => assignStaffToRequest({ requestId: request.id, staffId: workerId, adminNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      toast.success('Staff assigned');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Assignment failed'),
  });

  return (
    <Modal title="Assign Staff" onClose={onClose} size="sm">
      <div className="space-y-5">
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm space-y-1">
          <p className="text-gray-500">Member ID: <span className="font-mono text-gray-800">{request.memberId.slice(0, 8)}…</span></p>
          <p className="text-gray-500">Amount: <span className="font-semibold text-gray-900">{hidden ? '••••••' : `₹${Number(request.requestedAmount).toLocaleString('en-IN')}`}</span></p>
          {request.notes && <p className="text-gray-500">Note: <span className="text-gray-700">{request.notes}</span></p>}
        </div>
        <FormField label="Select Staff" required>
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
            <option value="">— Choose a staff member —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.fullName ?? w.username}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Admin Notes (optional)">
          <Input
            placeholder="Any instructions for the staff member"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-3">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={!workerId} loading={mutation.isPending}
            onClick={() => mutation.mutate()}>
            Assign Staff
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SetupCashPickupModal({ onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [memberId, setMemberId] = useState('');
  const [chitId, setChitId] = useState('');
  const [amount, setAmount] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [notes, setNotes] = useState('');
  const { hidden } = useHiddenAmounts();

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);

  const { data: memberChits = [] } = useQuery({
    queryKey: ['member-chits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });
  const activeChits = memberChits.filter((c) =>
    c.status === 'ACTIVE' || c.status === 'PAUSED' || c.status === 'COMPLETED'
  );

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const workers = staff.filter((s) => (s.role === 'STAFF' || s.role === 'MANAGER') && s.enabled !== false);

  const selectedChit = activeChits.find((c) => c.id === chitId);

  // Fetch balances for ALL of the member's chits in parallel once the chit list loads
  const balanceResults = useQueries({
    queries: activeChits.map((c) => ({
      queryKey: ['member-balance-for-pickup', memberId, c.id],
      queryFn: () => getMemberBalance({ memberId, chitId: c.id }),
      enabled: !!memberId,
      staleTime: 30_000,
    })),
  });
  const balanceMap = Object.fromEntries(
    activeChits.map((c, i) => [
      c.id,
      balanceResults[i]?.data?.totalOutstanding != null ? Number(balanceResults[i].data.totalOutstanding) : null,
    ])
  );
  const outstanding = balanceMap[chitId] ?? null;
  const balanceFetching = balanceResults.some((r) => r.isFetching);

  const mutation = useMutation({
    mutationFn: () => adminCreateCashRequest({
      memberId, staffId: workerId || undefined,
      chitId, requestedAmount: Number(amount), notes: notes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      toast.success(workerId ? 'Cash pickup created and staff assigned' : 'Cash pickup request created');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to create pickup'),
  });

  return (
    <Modal title="Setup Cash Pickup" onClose={onClose} size="sm">
      <div className="space-y-4">
        <FormField label="Member" required>
          <Select value={memberId} onChange={(e) => { setMemberId(e.target.value); setChitId(''); }}>
            <option value="">— Select member —</option>
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Chit" required>
          {!memberId ? (
            <Select disabled><option>— Select member first —</option></Select>
          ) : activeChits.length === 0 && memberChits.length > 0 ? (
            <p className="text-xs text-red-500 py-2">No chits found for this member.</p>
          ) : (
            <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
              <option value="">— Select chit —</option>
              {activeChits.map((c) => {
                const bal = balanceMap[c.id];
                const balSuffix = bal === null ? '' : bal > 0 ? ` — ₹${bal.toLocaleString('en-IN')} due` : ' — No dues';
                return <option key={c.id} value={c.id}>{c.name} [{c.status}]{balSuffix}</option>;
              })}
            </Select>
          )}
        </FormField>
        {selectedChit && (
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-xs text-gray-500 flex items-center gap-3">
            <ChitStatusDot status={selectedChit.status} />
            <span className="font-medium text-gray-700">{selectedChit.name}</span>
            {selectedChit.installmentAmount && (
              <span>{hidden ? '••••••' : `₹${Number(selectedChit.installmentAmount).toLocaleString('en-IN')}`} / draw</span>
            )}
          </div>
        )}
        <FormField label="Amount (₹)" required>
          <Input
            type="number" min="1"
            placeholder={outstanding > 0 ? String(outstanding) : selectedChit?.installmentAmount ? String(selectedChit.installmentAmount) : 'Enter amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {outstanding > 0 && (
            <button type="button" onClick={() => setAmount(String(outstanding))}
              className="mt-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
              Fill {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due →
            </button>
          )}
        </FormField>
        <FormField label="Assign Staff" required>
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
            <option value="">— Select staff member —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.role === 'STAFF' ? 'Staff' : 'Manager'}: {w.fullName ?? w.username}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Notes">
          <Textarea placeholder="Instructions for the staff member…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="md"
            disabled={!memberId || !chitId || !amount || Number(amount) <= 0 || !workerId}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Plus size={14} /> Create Pickup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidPickupModal({ request, memberMap, staffMap, loading, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const { hidden } = useHiddenAmounts();
  return (
    <Modal title="Void Cash Pickup" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">This will undo the staff member's pickup mark</p>
            <p className="text-xs text-red-600 mt-0.5">
              The request goes back to <strong>Assigned</strong> — the same staff member still owns it and
              must physically re-visit the member and mark pickup again.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm space-y-1">
          <p className="text-gray-500">Member: <span className="font-semibold text-gray-900">{memberMap[request.memberId] ?? '—'}</span></p>
          <p className="text-gray-500">Staff: <span className="font-semibold text-gray-900">{staffMap[request.assignedStaffId] ?? '—'}</span></p>
          <p className="text-gray-500">Amount: <span className="font-semibold text-gray-900">{hidden ? '••••••' : `₹${Number(request.requestedAmount).toLocaleString('en-IN')}`}</span></p>
        </div>

        <FormField label="Reason (required — logged in audit trail)" required>
          <Input
            placeholder="e.g. Staff marked wrong member by mistake"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-3">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger" size="md"
            disabled={!reason.trim()}
            loading={loading}
            onClick={() => onConfirm(reason)}
          >
            <RotateCcw size={14} /> Void Pickup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditCashRequestModal({ request, memberMap, staffMap, staff, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();

  const [amount, setAmount] = useState(request.requestedAmount != null ? String(request.requestedAmount) : '');
  const [workerId, setWorkerId] = useState(request.assignedStaffId ?? '');
  const [adminNotes, setAdminNotes] = useState(request.adminNotes ?? '');

  const workers = (staff ?? []).filter((s) => s.role === 'STAFF' || s.role === 'MANAGER');

  const mutation = useMutation({
    mutationFn: () => updateCashRequest({
      requestId: request.id,
      requestedAmount: amount ? Number(amount) : undefined,
      updateStaff: workerId !== (request.assignedStaffId ?? ''),
      staffId: workerId || null,
      adminNotes: adminNotes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      toast.success('Cash pickup request updated');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Update failed'),
  });

  const memberName = memberMap[request.memberId] ?? '—';

  return (
    <Modal title="Edit Cash Pickup Request" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
          <p className="text-gray-500">Member: <span className="font-semibold text-gray-900">{memberName}</span></p>
          <p className="text-gray-500 mt-0.5">Status: <span className="font-semibold text-gray-900 capitalize">{request.status.toLowerCase().replace('_', ' ')}</span></p>
        </div>

        <FormField label="Amount (₹)">
          <Input
            type="number"
            placeholder="Leave blank to keep current"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>

        <FormField label="Assigned Staff">
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">— Unassign (move to Pending) —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.role === 'STAFF' ? 'Staff' : 'Manager'}: {w.fullName ?? w.username}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Admin Notes">
          <Textarea
            placeholder="Internal note (visible to admins only)"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="md"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Pencil size={14} /> Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PartialFollowUpModal({ request, memberMap, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { hidden } = useHiddenAmounts();
  const remaining = request._remaining ?? 0;
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : '');
  const [scheduledFor, setScheduledFor] = useState('');
  const [staffId, setStaffId] = useState(request.assignedStaffId ?? '');
  const [creating, setCreating] = useState(false);

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const workers = staff.filter((s) => s.role === 'STAFF' || s.role === 'MANAGER');

  function quickDate(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  async function handleCreate() {
    if (!amount) return;
    setCreating(true);
    try {
      await adminCreateCashRequest({
        memberId: request.memberId,
        chitId: request.chitId,
        staffId: staffId || undefined,
        requestedAmount: Number(amount),
        notes: `Follow-up pickup — originally requested ₹${Number(request.requestedAmount).toLocaleString('en-IN')}, ₹${Number(request.collectedAmount ?? 0).toLocaleString('en-IN')} collected on ${new Date(utc(request.partiallyCollectedAt ?? request.updatedAt)).toLocaleDateString('en-IN')}`,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString().replace('Z', '') : undefined,
      });
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      toast.success(staffId ? 'Follow-up pickup created and assigned to staff' : 'Follow-up cash pickup created');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create follow-up');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="Create Follow-Up Pickup?" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-purple-800">
            Partial collection remitted — {hidden ? '••••••' : `₹${remaining > 0 ? remaining.toLocaleString('en-IN') : 0}`} remaining
          </p>
          <p className="text-xs text-purple-600 mt-0.5">
            Member: {memberMap[request.memberId] ?? '—'}<br />
            Original request: {hidden ? '••••••' : `₹${Number(request.requestedAmount).toLocaleString('en-IN')}`} · Collected: {hidden ? '••••••' : `₹${Number(request.collectedAmount ?? 0).toLocaleString('en-IN')}`}
          </p>
        </div>

        <FormField label="Amount for new pickup (₹)">
          <Input
            type="number" min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>

        <FormField label="Assign to staff (optional)">
          <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">— Assign later —</option>
            {workers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.role === 'STAFF' ? 'Staff' : 'Manager'}: {s.fullName ?? s.username}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Schedule date">
          <div className="flex gap-2 mb-2">
            {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([label, days]) => (
              <button
                key={label}
                type="button"
                onClick={() => setScheduledFor(quickDate(days))}
                className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer transition-colors ${
                  scheduledFor === quickDate(days)
                    ? 'border-[#1E3A5F] bg-[#EEF2F8] text-[#1E3A5F] font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Input
            type="date"
            value={scheduledFor}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </FormField>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel Remaining
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!amount || creating}
            loading={creating}
            onClick={handleCreate}
          >
            <Plus size={14} /> Create Pickup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CashRequestsTab() {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState(searchParams.get('filter') ?? null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [collectTarget, setCollectTarget] = useState(null);
  const [voidPickupTarget, setVoidPickupTarget] = useState(null);
  const [trailTarget, setTrailTarget] = useState(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  // Post-partial remittance follow-up
  const [partialFollowUpTarget, setPartialFollowUpTarget] = useState(null);

  function setFilter(key) {
    const next = activeFilter === key ? null : key;
    setActiveFilter(next);
    const p = new URLSearchParams(searchParams);
    if (next) p.set('filter', next); else p.delete('filter');
    setSearchParams(p, { replace: true });
  }

  const { data: activeRequests = [], isLoading } = useQuery({
    queryKey: ['cashRequests'],
    queryFn: getActiveCashRequests,
    refetchInterval: 10_000,
    refetchOnMount: 'always',
  });

  const { data: cancelledRequests = [] } = useQuery({
    queryKey: ['cashRequests', 'cancelled'],
    queryFn: getCancelledCashRequests,
    enabled: activeFilter === 'CANCELLED',
    refetchInterval: 60_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['cashRequests', 'summary'],
    queryFn: getCashRequestSummary,
    refetchInterval: 10_000,
    refetchOnMount: 'always',
  });

  // Combine and filter
  const allRequests = activeFilter === 'CANCELLED'
    ? cancelledRequests
    : activeFilter
      ? activeRequests.filter((r) => r.status === activeFilter)
      : activeRequests;

  // Use allRequests alias but keep backward compat
  const requests = allRequests;

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const { data: allChitsList = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits});
  const chitMap = Object.fromEntries((allChitsList?.content ?? allChitsList ?? []).map((c) => [c.id, c.name]));
  const staffMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.fullName ?? s.username ?? 'Staff']));
  const memberMap = Object.fromEntries([
    ...(staff ?? []).map((s) => [s.id, `${s.fullName ?? s.username ?? 'Staff'} (Admin)`]),
    ...(allMembers ?? []).flatMap((m) => {
      const name = m.fullName ?? m.name ?? 'Member';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
  ]);

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelCashRequest({ requestId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      toast.success('Request cancelled');
      setCancelTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Cancel failed'),
  });

  const collectMutation = useMutation({
    mutationFn: (id) => collectForRequest(id),
    onError: (err) => toast.error(err.response?.data?.message ?? 'Collection failed'),
  });

  const voidPickupMutation = useMutation({
    mutationFn: ({ id, reason }) => voidCashPickup({ requestId: id, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashRequests'] });
      qc.invalidateQueries({ queryKey: ['cashAudit'] });
      qc.invalidateQueries({ queryKey: ['active-cash-requests'] });
      toast.success('Pickup voided — request reverted to Assigned');
      setVoidPickupTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Void failed'),
  });

  if (isLoading) return <ListSkeleton rows={6} cols={4} />;

  const STATUS_LABEL = {
    PENDING: 'Pending', SCHEDULED: 'Scheduled', ASSIGNED: 'Assigned', PICKED_UP: 'Picked Up',
    PARTIALLY_COLLECTED: 'Partial', COLLECTED: 'Collected', CANCELLED: 'Cancelled',
  };

  return (
    <div className="space-y-4">
      {/* ── Filter cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STATUS_FILTERS.map(({ key, label, icon: Icon, color }) => {
          const count = key === 'PENDING' ? (summary?.pending ?? 0)
            : key === 'SCHEDULED' ? (activeRequests.filter((r) => r.status === 'SCHEDULED').length)
            : key === 'ASSIGNED' ? (summary?.assigned ?? 0)
            : key === 'PICKED_UP' ? (summary?.pickedUp ?? 0)
            : key === 'PARTIALLY_COLLECTED' ? (summary?.partiallyCollected ?? 0)
            : (summary?.cancelled ?? 0);
          const todayCount = key === 'CANCELLED' ? summary?.todayCancelled : undefined;
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'border-2 bg-white shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
              style={isActive ? { borderColor: color } : {}}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${color}18` }}>
                <Icon size={14} style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 leading-none">{label}</p>
                {todayCount !== undefined ? (
                  <>
                    <p className="text-base font-bold text-gray-900 leading-tight">{todayCount}</p>
                    <p className="text-xs text-gray-400">{count} overall</p>
                  </>
                ) : (
                  <p className="text-base font-bold text-gray-900 leading-tight">{count}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeFilter
            ? `${requests.length} ${STATUS_LABEL[activeFilter]?.toLowerCase() ?? activeFilter.toLowerCase()} request${requests.length !== 1 ? 's' : ''}`
            : requests.length > 0 ? `${requests.length} active request${requests.length !== 1 ? 's' : ''}` : 'No active cash requests'}
          {activeFilter && (
            <button onClick={() => setFilter(activeFilter)} className="ml-2 text-xs text-blue-600 hover:underline cursor-pointer">
              Clear filter
            </button>
          )}
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowSetupModal(true)}>
          <Plus size={13} /> Setup Cash Pickup
        </Button>
      </div>
      {requests.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
          Members can request cash pickup from their portal, or you can create one above.
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <Table columns={['Member', 'Chit', 'Staff', 'Amount', 'Note', 'Status', 'Requested', 'Actions']}>
          {requests.map((r) => (
            <Tr key={r.id} onClick={() => setTrailTarget(r)}>
              <Td>
                <span className="text-sm font-medium text-gray-900">
                  {memberMap[r.memberId] ?? <span className="font-mono text-xs text-gray-400">{r.memberId?.slice(0, 8)}…</span>}
                </span>
              </Td>
              <Td>
                <span className="text-sm text-gray-700">{chitMap[r.chitId] ?? <span className="text-xs text-gray-400 italic">—</span>}</span>
              </Td>
              <Td>
                {r.assignedStaffId
                  ? <span className="text-sm text-gray-700">{staffMap[r.assignedStaffId] ?? '—'}</span>
                  : <span className="text-xs text-gray-400 italic">Not assigned</span>}
              </Td>
              <Td>
                <div>
                  <span className="font-semibold text-gray-900">₹{Number(r.requestedAmount).toLocaleString('en-IN')}</span>
                  {r.collectedAmount != null && r.status === 'PARTIALLY_COLLECTED' && (
                    <p className="text-xs text-purple-600 mt-0.5">
                      Collected: ₹{Number(r.collectedAmount).toLocaleString('en-IN')}
                      {r.memberApproved === true && <span className="ml-1 text-green-600 font-semibold">✓ Approved</span>}
                      {r.memberApproved === false && <span className="ml-1 text-red-600 font-semibold">✗ Rejected</span>}
                      {r.memberApproved == null && (
                        <span className="ml-1 font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          ⚠ Not approved
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </Td>
              <Td>
                <div className="max-w-[160px]">
                  {r.notes && <p className="text-sm text-gray-500 truncate">{r.notes}</p>}
                  {r.adminNotes && <p className="text-xs text-amber-600 truncate italic">{r.adminNotes}</p>}
                  {r.memberRejectionReason && (
                    <p className="text-xs text-red-600 truncate">Rejected: {r.memberRejectionReason}</p>
                  )}
                </div>
              </Td>
              <Td>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${REQ_STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-gray-400">
                  {new Date(utc(r.requestedAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </Td>
              <Td>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {(r.status === 'PENDING' || r.status === 'ASSIGNED') && (
                    <button
                      onClick={() => setEditTarget(r)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors cursor-pointer"
                      title="Edit request"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {(r.status === 'PENDING' || r.status === 'SCHEDULED') && (
                    <Button variant="primary" size="sm" onClick={() => setAssignTarget(r)}>
                      <UserCheck size={13} className="mr-1" /> Assign
                    </Button>
                  )}
                  {r.status === 'PICKED_UP' && (
                    <>
                      <Button variant="success" size="sm" onClick={() => setCollectTarget(r)}>
                        <CheckCircle size={13} className="mr-1" /> Collect
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setVoidPickupTarget(r)}
                        title="Void this pickup — staff marked wrong member">
                        <RotateCcw size={13} className="mr-1" /> Void
                      </Button>
                    </>
                  )}
                  {r.status === 'PARTIALLY_COLLECTED' && (
                    <Button
                      variant={r.memberApproved == null ? 'warning' : 'success'}
                      size="sm"
                      onClick={() => setCollectTarget(r)}
                    >
                      {r.memberApproved == null
                        ? <><AlertTriangle size={13} className="mr-1" /> Remit ₹{Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN')}</>
                        : <><HandCoins size={13} className="mr-1" /> Remit ₹{Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN')}</>
                      }
                    </Button>
                  )}
                  {(r.status === 'PENDING' || r.status === 'SCHEDULED' || r.status === 'ASSIGNED' || r.status === 'PICKED_UP' || r.status === 'PARTIALLY_COLLECTED') && (
                    <Button variant="muted" size="sm" onClick={() => setCancelTarget(r)}>Cancel</Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>

      {assignTarget && <AssignWorkerModal request={assignTarget} onClose={() => setAssignTarget(null)} />}
      {editTarget && (
        <EditCashRequestModal
          request={editTarget}
          memberMap={memberMap}
          staffMap={staffMap}
          staff={staff}
          onClose={() => setEditTarget(null)}
        />
      )}
      {showSetupModal && <SetupCashPickupModal onClose={() => setShowSetupModal(false)} />}
      {trailTarget && (
        <AdminCashTrailModal
          request={trailTarget}
          memberMap={memberMap}
          staffMap={staffMap}
          onClose={() => setTrailTarget(null)}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          variant="warning"
          title="Cancel Request"
          description={`Cancel the ₹${Number(cancelTarget.requestedAmount).toLocaleString('en-IN')} cash pickup request?`}
          actionLabel="Cancel Request"
          loading={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate(cancelTarget.id)}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {collectTarget && (
        <ConfirmDialog
          variant={collectTarget.status === 'PARTIALLY_COLLECTED' && collectTarget.memberApproved == null ? 'warning' : 'success'}
          title={collectTarget.status === 'PARTIALLY_COLLECTED' ? 'Confirm Partial Receipt' : 'Confirm Cash Receipt'}
          description={
            collectTarget.status === 'PARTIALLY_COLLECTED'
              ? `Confirm you received ₹${Number(collectTarget.collectedAmount ?? collectTarget.requestedAmount).toLocaleString('en-IN')} (partial) from ${staffMap[collectTarget.assignedStaffId] ?? 'staff'}? Remaining ₹${(Number(collectTarget.requestedAmount) - Number(collectTarget.collectedAmount ?? collectTarget.requestedAmount)).toLocaleString('en-IN')} will need a follow-up pickup.`
              : `Confirm you received ₹${Number(collectTarget.requestedAmount).toLocaleString('en-IN')} from staff ${staffMap[collectTarget.assignedStaffId] ?? ''}? This will credit the member's account.`
          }
          actionLabel="Yes, Received"
          loading={collectMutation.isPending}
          onConfirm={() => {
            const isPartial = collectTarget.status === 'PARTIALLY_COLLECTED';
            const remaining = isPartial
              ? Number(collectTarget.requestedAmount) - Number(collectTarget.collectedAmount ?? collectTarget.requestedAmount)
              : 0;
            const targetSnapshot = { ...collectTarget, _remaining: remaining };
            collectMutation.mutate(collectTarget.id, {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: ['cashRequests'] });
                qc.invalidateQueries({ queryKey: ['active-cash-requests'] });
                qc.invalidateQueries({ queryKey: ['wallet-balance'] });
                qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
                qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
                qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'draws' });
                toast.success('Cash confirmed — member account has been credited');
                setCollectTarget(null);
                if (isPartial && remaining > 0) {
                  setPartialFollowUpTarget(targetSnapshot);
                }
              },
            });
          }}
          onClose={() => setCollectTarget(null)}
        >
          {collectTarget.status === 'PARTIALLY_COLLECTED' && collectTarget.memberApproved == null && (
            <div className="mt-3 rounded-lg px-4 py-3 bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Member has not approved yet</p>
                <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                  The member was notified about the partial amount of ₹{Number(collectTarget.collectedAmount ?? 0).toLocaleString('en-IN')} but hasn't confirmed it. Consider waiting for their approval before remitting.
                </p>
              </div>
            </div>
          )}
        </ConfirmDialog>
      )}

      {partialFollowUpTarget && (
        <PartialFollowUpModal
          request={partialFollowUpTarget}
          memberMap={memberMap}
          staffMap={staffMap}
          onClose={() => setPartialFollowUpTarget(null)}
        />
      )}

      {voidPickupTarget && (
        <VoidPickupModal
          request={voidPickupTarget}
          memberMap={memberMap}
          staffMap={staffMap}
          loading={voidPickupMutation.isPending}
          onConfirm={(reason) => voidPickupMutation.mutate({ id: voidPickupTarget.id, reason })}
          onClose={() => setVoidPickupTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Chit status dot ──────────────────────────────────────────────────────
function ChitStatusDot({ status }) {
  const color = status === 'ACTIVE' ? 'bg-green-500' : status === 'COMPLETED' ? 'bg-blue-500'
    : status === 'PAUSED' ? 'bg-amber-500' : 'bg-gray-400';
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

// ─── Record Payment Tab ────────────────────────────────────────────────────
const PAYMENT_MODES = [
  { value: 'CASH',          label: 'Cash',          desc: 'Physical cash — admin or staff collected' },
  { value: 'UPI',           label: 'UPI',            desc: 'Instantly credited to treasury bank' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer',  desc: 'NEFT/RTGS/IMPS — credited to treasury bank' },
];

export function RecordPaymentTab() {
  const { user } = useAuth();
  const toast = useToastContext();
  const qc = useQueryClient();
  const { hidden } = useHiddenAmounts();

  const [memberId, setMemberId]     = useState('');
  const [chitId, setChitId]         = useState('');
  const [amount, setAmount]         = useState('');
  const [notes, setNotes]           = useState('');
  const [paymentMode, setMode]      = useState('CASH');
  const [collectedBy, setCollectedBy] = useState('SELF'); // only relevant for CASH

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);

  const { data: memberChits = [] } = useQuery({
    queryKey: ['member-chits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });
  const collectableChits = memberChits.filter((c) =>
    c.status === 'ACTIVE' || c.status === 'PAUSED' || c.status === 'COMPLETED'
  );

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
  });
  const collectors = staff.filter((s) => (s.role === 'STAFF' || s.role === 'MANAGER') && s.enabled !== false);

  const mutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = crypto.randomUUID();
      if (paymentMode === 'CASH' && collectedBy !== 'SELF') {
        // Worker/Manager collected → AWAITING_REMITTANCE
        return collectPayment({ chitId, memberId, amount: Number(amount), notes: notes || null, overrideCollectedBy: collectedBy }, idempotencyKey);
      } else {
        // Admin direct (cash/upi/bank) → COMPLETED immediately
        return recordPayment({ chitId, memberId, amount: Number(amount), paymentMode, notes: notes || null, idempotencyKey });
      }
    },
    onSuccess: () => {
      const msg = paymentMode === 'CASH' && collectedBy !== 'SELF'
        ? 'Cash collection recorded — pending remittance from staff'
        : 'Payment recorded successfully';
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['payment-batches-all'] });
      qc.invalidateQueries({ queryKey: ['memberCredit', memberId] });
      qc.invalidateQueries({ queryKey: ['memberBalance', memberId] });
      // Refresh draw payment rows in ChitDetailPage so per-draw status updates
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'draw-payments' });
      if (chitId) {
        qc.invalidateQueries({ queryKey: ['draws', chitId] });
        qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, memberId] });
      }
      if (!(paymentMode === 'CASH' && collectedBy !== 'SELF')) {
        // Direct payments (admin self or UPI/bank) immediately credit treasury
        qc.invalidateQueries({ queryKey: ['wallet-balance'] });
        qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      }
      setMemberId(''); setChitId(''); setAmount(''); setNotes('');
      setMode('CASH'); setCollectedBy('SELF');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record payment'),
  });

  const selectedChit = collectableChits.find((c) => c.id === chitId);
  const isCash = paymentMode === 'CASH';

  // Fetch balances for ALL of this member's chits in parallel once the list loads
  const chitBalanceResults = useQueries({
    queries: collectableChits.map((c) => ({
      queryKey: ['memberBalance', memberId, c.id],
      queryFn: () => getMemberBalance({ memberId, chitId: c.id }),
      enabled: !!memberId,
      staleTime: 30_000,
    })),
  });
  const balanceMap = Object.fromEntries(
    collectableChits.map((c, i) => [
      c.id,
      chitBalanceResults[i]?.data?.totalOutstanding != null ? Number(chitBalanceResults[i].data.totalOutstanding) : null,
    ])
  );

  const { data: memberCredit } = useQuery({
    queryKey: ['memberCredit', memberId],
    queryFn: () => getMemberCredit(memberId),
    enabled: !!memberId,
  });
  const creditBalance = memberCredit ? Number(memberCredit.balance ?? 0) : 0;

  const outstanding = chitId ? (balanceMap[chitId] ?? null) : null;
  const amtNum = Number(amount || 0);
  // Effective amount after credit auto-applies
  const effectiveAmount = amtNum + creditBalance;
  const isOverpay = outstanding !== null && effectiveAmount > outstanding && outstanding > 0;

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Record Payment
        </h3>

        {/* Payment Mode selector */}
        <FormField label="Payment Method" required>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => { setMode(m.value); setCollectedBy('SELF'); }}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer text-center ${
                  paymentMode === m.value
                    ? 'border-[#1E3A5F] bg-[#EFF3F8] text-[#1E3A5F]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {PAYMENT_MODES.find((m) => m.value === paymentMode)?.desc}
          </p>
        </FormField>

        {/* Member */}
        <FormField label="Member" required>
          <Select value={memberId} onChange={(e) => { setMemberId(e.target.value); setChitId(''); }} required>
            <option value="">— Select member —</option>
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
            ))}
          </Select>
          {memberId && creditBalance > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-emerald-800 font-medium">
                Credit balance: <strong>₹{creditBalance.toLocaleString('en-IN')}</strong>
              </span>
              <span className="text-xs text-emerald-600 ml-auto">Auto-applied to outstanding</span>
            </div>
          )}
          {memberId && creditBalance === 0 && memberCredit && (
            <p className="text-xs text-gray-400 mt-1">No credit balance</p>
          )}
        </FormField>

        {/* Chit */}
        <FormField label="Chit" required>
          {!memberId ? (
            <Select disabled><option>— Select a member first —</option></Select>
          ) : collectableChits.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No active chits found for this member.</p>
          ) : (
            <Select value={chitId} onChange={(e) => setChitId(e.target.value)} required>
              <option value="">— Select chit —</option>
              {collectableChits.map((c) => {
                const bal = balanceMap[c.id];
                const balSuffix = bal === null ? '' : bal > 0 ? ` — ₹${bal.toLocaleString('en-IN')} due` : ' — No dues';
                return <option key={c.id} value={c.id}>{c.name} [{c.status}]{balSuffix}</option>;
              })}
            </Select>
          )}
        </FormField>

        {selectedChit && (
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-xs text-gray-500 space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <ChitStatusDot status={selectedChit.status} />
              <span className="font-medium text-gray-700">{selectedChit.name}</span>
              <Badge variant={statusBadge(selectedChit.status)}>{selectedChit.status}</Badge>
            </div>
            {creditBalance > 0 && outstanding !== null && outstanding > 0 && (
              <div className="flex items-center gap-2 text-emerald-700 font-medium border-t border-gray-200 pt-1.5">
                <span>Credit ₹{creditBalance.toLocaleString('en-IN')} will auto-apply →</span>
                <span className="text-red-600">
                  Remaining to collect: <strong>₹{Math.max(0, outstanding - creditBalance).toLocaleString('en-IN')}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Amount */}
        <FormField label="Amount (₹)" required>
          <Input
            type="number"
            min="1"
            placeholder={selectedChit?.installmentAmount ? String(selectedChit.installmentAmount) : 'Enter amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {outstanding > 0 && (
            <button type="button" onClick={() => setAmount(String(outstanding))}
              className="mt-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
              Fill {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due →
            </button>
          )}
          {isOverpay && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span className="flex-shrink-0">ℹ</span>
              <span>
                Effective payment (₹{amtNum.toLocaleString('en-IN')}{creditBalance > 0 ? ` + ₹${creditBalance.toLocaleString('en-IN')} credit` : ''} = ₹{effectiveAmount.toLocaleString('en-IN')}) exceeds this chit's outstanding ₹{outstanding.toLocaleString('en-IN')}.
                The excess <strong>₹{(effectiveAmount - outstanding).toLocaleString('en-IN')}</strong> will auto-apply to any other chit outstanding — if all clear, it becomes credit balance.
              </span>
            </div>
          )}
        </FormField>

        {/* Collected By — only for CASH */}
        {isCash && (
          <FormField label="Collected By" required>
            <Select value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)}>
              <option value="SELF">Self (I collected it directly)</option>
              {collectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role === 'STAFF' ? 'Staff' : 'Manager'}: {s.fullName ?? s.username}
                </option>
              ))}
            </Select>
            {collectedBy !== 'SELF' && (
              <p className="text-xs text-amber-600 mt-1.5">
                Cash stays with collector — appears in Remittance until collected from them.
              </p>
            )}
          </FormField>
        )}

        {/* Notes */}
        <FormField label="Notes">
          <Textarea
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        <Button
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!memberId || !chitId || !amount || Number(amount) <= 0}
          className="w-full"
        >
          <CreditCard size={15} />
          {isCash && collectedBy !== 'SELF'
            ? 'Record Collection (Remittance)'
            : `Record ${PAYMENT_MODES.find((m) => m.value === paymentMode)?.label} Payment`}
        </Button>
      </div>
    </div>
  );
}

// ─── Remittance Tab ─────────────────────────────────────────────────
function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <span className="text-gray-300 ml-1 text-xs">↕</span>;
  return <span className="text-[#1E3A5F] ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export function PendingRemittanceTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToastContext();
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [collectPickupTarget, setCollectPickupTarget] = useState(null);
  const [partialFollowUp, setPartialFollowUp] = useState(null);
  const [sortField, setSortField] = useState('collectedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [filterCollector, setFilterCollector] = useState('');

  function handleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['pending-remittance'],
    queryFn: getPendingRemittance,
    refetchInterval: 30_000,
  });

  // PICKED_UP and PARTIALLY_COLLECTED cash requests = worker has cash, admin hasn't collected yet
  const { data: allActiveRequests = [] } = useQuery({
    queryKey: ['cashRequests'],
    queryFn: getActiveCashRequests,
    refetchInterval: 30_000,
  });
  const pickedUpRequests = allActiveRequests.filter(
    (r) => r.status === 'PICKED_UP' || r.status === 'PARTIALLY_COLLECTED'
  );

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });
  const { data: allChits = [] } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
  });
  const chitMap = Object.fromEntries(allChits.map((c) => [c.id, c.name]));

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
  });
  const staffMap = Object.fromEntries(staff.map((s) => [s.id, s.fullName ?? s.username]));
  const memberMap = Object.fromEntries([
    ...(staff ?? []).map((s) => [s.id, `${s.fullName ?? s.username ?? 'Staff'} (Admin)`]),
    ...allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name ?? m.id;
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
  ]);

  const remitMutation = useMutation({
    mutationFn: (batchId) => remitPayment(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['payment-batches-all'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'draws' });
      toast.success('Cash collected from staff — payment credited to member');
      setConfirmTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to remit'),
  });

  const voidMutation = useMutation({
    mutationFn: ({ batchId, reason }) => voidPaymentBatch({ batchId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['payment-batches-all'] });
      toast.success('Remittance cancelled — no payment was recorded');
      setVoidTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to cancel'),
  });

  const collectPickupMutation = useMutation({
    mutationFn: (requestId) => collectForRequest(requestId),
    onError: (err) => toast.error(err.response?.data?.message ?? 'Collection failed'),
  });

  // All workers + managers for the filter dropdown (not just those with pending batches)
  const collectorOptions = staff.filter((s) => s.role === 'STAFF' || s.role === 'MANAGER');

  if (isLoading) return <ListSkeleton rows={6} cols={4} />;

  const filteredBatches = filterCollector
    ? batches.filter((b) => b.collectedBy === filterCollector)
    : batches;

  const totalPending = filteredBatches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);

  const sortedBatches = [...filteredBatches].sort((a, b) => {
    let av, bv;
    if (sortField === 'collectedAt')  { av = new Date(a.collectedAt ?? 0); bv = new Date(b.collectedAt ?? 0); }
    else if (sortField === 'totalAmount') { av = Number(a.totalAmount); bv = Number(b.totalAmount); }
    else if (sortField === 'collector') { av = staffMap[a.collectedBy] ?? ''; bv = staffMap[b.collectedBy] ?? ''; }
    else if (sortField === 'member') { av = memberMap[a.memberId] ?? ''; bv = memberMap[b.memberId] ?? ''; }
    else return 0;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (batches.length === 0 && pickedUpRequests.length === 0 && !filterCollector) {
    return (
      <>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <Select value={filterCollector} onChange={(e) => setFilterCollector(e.target.value)}>
              <option value="">All Collectors</option>
              {collectorOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role === 'STAFF' ? 'W' : 'M'}: {s.fullName ?? s.username}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <EmptyState
          icon={Clock}
          title="No pending remittances"
          message="When a staff member or manager collects cash from a member, it appears here until you collect it from them."
        />
      </>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── PICKED_UP section: worker has cash, admin needs to collect ── */}
      {pickedUpRequests.length > 0 && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck size={15} className="text-green-700" />
            <p className="text-sm font-semibold text-green-800">
              {pickedUpRequests.length} pickup{pickedUpRequests.length !== 1 ? 's' : ''} ready — collect cash from staff
            </p>
          </div>
          {pickedUpRequests.map((r) => {
            const isPartial = r.status === 'PARTIALLY_COLLECTED';
            const displayAmt = isPartial ? (r.collectedAmount ?? r.requestedAmount) : r.requestedAmount;
            return (
              <div key={r.id} className={`flex items-center justify-between gap-3 bg-white rounded-xl px-4 py-3 border ${isPartial ? 'border-purple-200' : 'border-green-100'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isPartial ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                    {(memberMap[r.memberId] ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {memberMap[r.memberId] ?? '—'}
                      </p>
                      {isPartial && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex-shrink-0">Partial</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      Staff: {staffMap[r.assignedStaffId] ?? '—'} ·{' '}
                      <span className="font-semibold">₹{Number(displayAmt).toLocaleString('en-IN')}</span>
                      {isPartial && <span className="text-gray-400"> of ₹{Number(r.requestedAmount).toLocaleString('en-IN')}</span>}
                    </p>
                    {isPartial && r.memberApproved === true && (
                      <p className="text-xs text-green-600 mt-0.5">✓ Member approved</p>
                    )}
                    {isPartial && r.memberApproved === false && (
                      <p className="text-xs text-red-600 mt-0.5">✗ Member rejected · {r.memberRejectionReason}</p>
                    )}
                    {isPartial && r.memberApproved == null && (
                      <p className="text-xs text-gray-400 mt-0.5">Awaiting member approval</p>
                    )}
                    {r.pickedUpAt && !isPartial && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Picked up {new Date(utc(r.pickedUpAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant={isPartial ? 'primary' : 'success'}
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => setCollectPickupTarget(r)}
                >
                  <CheckCircle size={13} className="mr-1" /> {isPartial ? 'Remit' : 'Collect'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {(sortedBatches.length > 0 || filterCollector) && (
      <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Select
            value={filterCollector}
            onChange={(e) => setFilterCollector(e.target.value)}
          >
            <option value="">All Collectors</option>
            {collectorOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.role === 'STAFF' ? 'W' : 'M'}: {s.fullName ?? s.username}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-gray-500 ml-auto">
          {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}
          {filterCollector ? ` for ${staffMap[filterCollector] ?? 'selected collector'}` : ' awaiting remittance'}
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-700">
          Total: ₹{totalPending.toLocaleString('en-IN')}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table columns={[
          <button key="col" type="button" className="cursor-pointer hover:text-[#1E3A5F] flex items-center" onClick={() => handleSort('collector')}>Collector<SortIcon field="collector" sortField={sortField} sortDir={sortDir} /></button>,
          <button key="mem" type="button" className="cursor-pointer hover:text-[#1E3A5F] flex items-center" onClick={() => handleSort('member')}>Member<SortIcon field="member" sortField={sortField} sortDir={sortDir} /></button>,
          'Chit',
          <button key="amt" type="button" className="cursor-pointer hover:text-[#1E3A5F] flex items-center" onClick={() => handleSort('totalAmount')}>Amount<SortIcon field="totalAmount" sortField={sortField} sortDir={sortDir} /></button>,
          <button key="date" type="button" className="cursor-pointer hover:text-[#1E3A5F] flex items-center" onClick={() => handleSort('collectedAt')}>Collected On<SortIcon field="collectedAt" sortField={sortField} sortDir={sortDir} /></button>,
          'Action',
        ]}>
          {sortedBatches.map((b) => (
            <Tr key={b.id} onClick={() => navigate(`/transactions/${b.id}`, { state: { returnTab: 'Remittance' } })}
              className="cursor-pointer hover:bg-blue-50/30 transition-colors">
              <Td>
                <span className="text-sm font-medium text-gray-800">
                  {staffMap[b.collectedBy] ?? b.collectedBy?.slice(0, 8) ?? '—'}
                </span>
              </Td>
              <Td>{memberMap[b.memberId] ?? b.memberId?.slice(0, 8) ?? '—'}</Td>
              <Td>{chitMap[b.chitId] ?? b.chitId?.slice(0, 8) ?? '—'}</Td>
              <Td className="font-semibold text-gray-900">
                ₹{Number(b.totalAmount).toLocaleString('en-IN')}
              </Td>
              <Td className="text-xs text-gray-400">
                {b.collectedAt ? new Date(utc(b.collectedAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
              </Td>
              <Td>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button variant="success" size="sm" onClick={() => setConfirmTarget(b)}>
                    <CheckCircle size={13} /> Collected
                  </Button>
                  <Button variant="muted" size="sm" onClick={() => setVoidTarget(b)}>
                    Cancel
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>
      </>
      )}

      {confirmTarget && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Received"
          description={`Confirm you received ₹${Number(confirmTarget.totalAmount).toLocaleString('en-IN')} from ${staffMap[confirmTarget.collectedBy] ?? 'the collector'}? This will credit the payment to the member.`}
          actionLabel="Confirm Received"
          loading={remitMutation.isPending}
          onConfirm={() => remitMutation.mutate(confirmTarget.id)}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {voidTarget && (
        <ConfirmDialog
          variant="warning"
          title="Cancel Remittance"
          description={`Cancel this ₹${Number(voidTarget.totalAmount).toLocaleString('en-IN')} remittance from ${staffMap[voidTarget.collectedBy] ?? 'collector'}? The member's payment record will be rolled back.`}
          actionLabel="Cancel Remittance"
          loading={voidMutation.isPending}
          onConfirm={() => voidMutation.mutate({ batchId: voidTarget.id, reason: 'Cancelled from Remittance' })}
          onClose={() => setVoidTarget(null)}
        />
      )}

      {collectPickupTarget && (
        <ConfirmDialog
          variant={collectPickupTarget.status === 'PARTIALLY_COLLECTED' && collectPickupTarget.memberApproved == null ? 'warning' : 'success'}
          title={collectPickupTarget.status === 'PARTIALLY_COLLECTED' ? 'Confirm Partial Receipt' : 'Confirm Cash Received from Staff'}
          description={
            collectPickupTarget.status === 'PARTIALLY_COLLECTED'
              ? `Confirm you received ₹${Number(collectPickupTarget.collectedAmount ?? collectPickupTarget.requestedAmount).toLocaleString('en-IN')} (partial) from ${staffMap[collectPickupTarget.assignedStaffId] ?? 'staff'}? Member's account will be credited with this amount.`
              : `Confirm you received ₹${Number(collectPickupTarget.requestedAmount).toLocaleString('en-IN')} from ${staffMap[collectPickupTarget.assignedStaffId] ?? 'staff'}? The member's account will be credited and treasury updated immediately.`
          }
          actionLabel="Yes, Received"
          loading={collectPickupMutation.isPending}
          onConfirm={() => {
            const snap = { ...collectPickupTarget };
            collectPickupMutation.mutate(collectPickupTarget.id, {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: ['cashRequests'] });
                qc.invalidateQueries({ queryKey: ['active-cash-requests'] });
                qc.invalidateQueries({ queryKey: ['wallet-balance'] });
                qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
                qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
                qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'draws' });
                toast.success('Cash received — member account credited, treasury updated');
                setCollectPickupTarget(null);
                if (snap.status === 'PARTIALLY_COLLECTED') {
                  const remaining = Number(snap.requestedAmount) - Number(snap.collectedAmount ?? snap.requestedAmount);
                  if (remaining > 0) setPartialFollowUp({ ...snap, _remaining: remaining });
                }
              },
            });
          }}
          onClose={() => setCollectPickupTarget(null)}
        >
          {collectPickupTarget.status === 'PARTIALLY_COLLECTED' && collectPickupTarget.memberApproved == null && (
            <div className="mt-3 rounded-lg px-4 py-3 bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Member has not approved yet</p>
                <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                  The member was notified about the partial amount of ₹{Number(collectPickupTarget.collectedAmount ?? collectPickupTarget.requestedAmount).toLocaleString('en-IN')} but hasn't confirmed it yet.
                </p>
              </div>
            </div>
          )}
        </ConfirmDialog>
      )}

      {partialFollowUp && (
        <PartialFollowUpModal
          request={partialFollowUp}
          memberMap={memberMap}
          onClose={() => setPartialFollowUp(null)}
        />
      )}
    </div>
  );
}

// ─── History Tab ────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

export function HistoryTab() {
  const navigate = useNavigate();
  const [chitId, setChitId]     = useState('');
  const [memberId, setMemberId] = useState('');
  const [page, setPage] = useState(0);
  const [allBatches, setAllBatches] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: allChits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits});
  const chits = allChits.filter((c) => c.status !== 'DRAFT');

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });
  const memberMap = Object.fromEntries(
    allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name;
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    })
  );

  const { isLoading, isError, refetch } = useQuery({
    queryKey: ['payment-batches-all', chitId, memberId],
    queryFn: async () => {
      const result = await getAllPaymentBatches({ ...(chitId ? { chitId } : {}), ...(memberId ? { memberId } : {}), page: 0, size: PAGE_SIZE });
      setAllBatches(result.content ?? []);
      setHasMore(result.hasMore ?? false);
      setPage(0);
      return result;
    },
    retry: 2,
  });

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getAllPaymentBatches({ ...(chitId ? { chitId } : {}), ...(memberId ? { memberId } : {}), page: nextPage, size: PAGE_SIZE });
      setAllBatches(prev => [...prev, ...(result.content ?? [])]);
      setHasMore(result.hasMore ?? false);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  const batches = allBatches;

  const chitMap = Object.fromEntries(chits.map((c) => [c.id, { name: c.name, status: c.status }]));

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const staffMap = Object.fromEntries(staff.map((s) => [s.id, s.fullName ?? s.username]));

  const selectedChit = chits.find((c) => c.id === chitId);

  function drawLabel(allocations) {
    if (!allocations?.length) return '—';
    const nums = allocations.map((a) => a.monthNumber).sort((a, b) => a - b);
    if (nums.length === 1) return `Draw ${nums[0]}`;
    return `Draws ${nums.join(', ')}`;
  }

  const BATCH_STATUS_STYLE = {
    COMPLETED:          'bg-green-100 text-green-700',
    AWAITING_REMITTANCE:'bg-amber-100 text-amber-700',
    VOIDED:             'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="min-w-[200px] flex-1 max-w-xs">
          <FormField label="Member">
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">All Members</option>
              {allMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="min-w-[200px] flex-1 max-w-xs">
          <FormField label="Chit">
            <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
              <option value="">All Chits</option>
              {chits.map((c) => (
                <option key={c.id} value={c.id}>{c.name} [{c.status}]</option>
              ))}
            </Select>
          </FormField>
        </div>
      </div>

      {/* Selected chit details row */}
      {selectedChit && (
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5 text-xs text-gray-500">
          <ChitStatusDot status={selectedChit.status} />
          <span className="font-medium text-gray-700">{selectedChit.name}</span>
          {selectedChit.installmentAmount && (
            <span>₹{Number(selectedChit.installmentAmount).toLocaleString('en-IN')} / draw</span>
          )}
          <Badge variant={statusBadge(selectedChit.status)}>{selectedChit.status}</Badge>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <div className="p-6"><ListSkeleton rows={6} cols={4} /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <History size={32} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">Failed to load payment history</p>
            <p className="text-xs text-gray-400">Make sure the payment service is running.</p>
            <Button size="sm" variant="muted" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : batches.length === 0 ? (
          <EmptyState icon={History} title="No payment history"
            message={chitId ? 'No payments recorded for this chit.' : 'No payments recorded yet.'} />
        ) : (
          <>
          <Table columns={['Member', 'Chit', 'Draw(s)', 'Amount', 'Mode', 'Recorded By', 'Date & Time', 'Status']}>
            {batches.map((b, idx) => (
              <Tr key={b.id} onClick={() => navigate(`/transactions/${b.id}`, { state: { returnTab: 'History' } })} className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                <Td className="font-medium text-gray-900">
                  {memberMap[b.memberId] ?? b.memberId?.slice(0, 8) ?? '—'}
                </Td>
                <Td className="text-gray-600 text-sm">
                  {chitMap[b.chitId]?.name ?? b.chitId?.slice(0, 8) ?? '—'}
                </Td>
                <Td className="text-gray-700 text-sm font-medium">
                  {drawLabel(b.allocations)}
                </Td>
                <Td className="font-semibold text-green-700">
                  ₹{Number(b.totalAmount).toLocaleString('en-IN')}
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    b.paymentMode === 'CASH' ? 'bg-amber-100 text-amber-700'
                    : b.paymentMode === 'BANK_TRANSFER' ? 'bg-blue-100 text-blue-700'
                    : b.paymentMode === 'UPI' ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {b.paymentMode ?? '—'}
                  </span>
                </Td>
                <Td className="text-gray-600 text-sm">
                  {staffMap[b.recordedBy ?? b.remittedBy ?? b.collectedBy]
                    ?? (b.recordedBy ?? b.remittedBy ?? b.collectedBy)?.slice(0, 8)
                    ?? '—'}
                </Td>
                <Td className="text-xs text-gray-400">
                  {b.collectedAt
                    ? new Date(utc(b.collectedAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : b.createdAt
                    ? new Date(utc(b.createdAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BATCH_STATUS_STYLE[b.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {b.status === 'AWAITING_REMITTANCE' ? 'PENDING' : (b.status ?? '—')}
                  </span>
                </Td>
              </Tr>
            ))}
          </Table>
          {hasMore && (
            <div className="flex justify-center py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-sm font-semibold rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : `Load more (${batches.length} loaded)`}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'ADMIN';
  const tabs = role === 'STAFF' ? STAFF_TABS : role === 'MANAGER' ? MANAGER_TABS : ADMIN_TABS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Payments
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {role === 'STAFF'
            ? 'Record cash payments collected from members.'
            : 'Record payments, manage cash requests, and view payment history.'}
        </p>
      </div>

      <div className="space-y-5">
        <TabBar tabs={tabs} />
        <Outlet />
      </div>
    </div>
  );
}
