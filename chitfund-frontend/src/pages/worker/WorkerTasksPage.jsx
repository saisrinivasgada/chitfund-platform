import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  getMyAssignedRequests,
  getMyRequestHistory,
  getMyPendingBatches,
  markPickedUp,
  rescheduleRequest,
  workerCancelRequest,
  getMembers,
  getChits,
  listStaff,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import {
  ClipboardList, CheckCircle, History, IndianRupee, Calendar, AlertCircle,
  Clock, UserCheck, Banknote, PackageCheck, ChevronRight, X, CalendarClock,
} from 'lucide-react';

const STATUS_CONFIG = {
  COLLECTED:  { label: 'Collected',  variant: 'success' },
  CANCELLED:  { label: 'Cancelled',  variant: 'danger'  },
  ASSIGNED:   { label: 'Assigned',   variant: 'info'    },
  PICKED_UP:  { label: 'Picked Up',  variant: 'warning' },
};

function fmt(n) {
  if (n == null) return 'Outstanding';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Name resolvers ───────────────────────────────────────────────────────────
function useLookupMaps() {
  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers(),
    staleTime: 5 * 60_000,
  });
  const { data: chits = [] } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
    staleTime: 5 * 60_000,
  });
  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: () => listStaff(),
    staleTime: 5 * 60_000,
  });

  // Payment-service stores memberId as the member's userId (JWT principal).
  // Index by both m.id (member-service UUID) and m.userId so both lookup paths resolve.
  const memberMap = Object.fromEntries([
    ...staff.map((s) => [s.id, s.fullName ?? s.username ?? '—']),
    ...members.flatMap((m) => {
      const name = m.fullName ?? m.name ?? '—';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
  ]);
  const chitMap   = Object.fromEntries(chits.map((c)   => [c.id, c.name ?? c.chitName ?? '—']));
  return { memberMap, chitMap };
}

// ─── Cash Request Timeline Modal ─────────────────────────────────────────────
function CashRequestTimelineModal({ request, memberMap, chitMap, onClose }) {
  const timeline = [
    {
      key: 'requested',
      icon: Clock,
      color: '#1E3A5F',
      bg: '#EEF2F8',
      label: 'Pickup Initiated',
      sub: 'Request created',
      time: request.requestedAt,
      done: true,
    },
    {
      key: 'assigned',
      icon: UserCheck,
      color: '#D97706',
      bg: '#FEF3C7',
      label: 'Assigned to Worker',
      sub: request.assignedAt ? `You were assigned` : 'Waiting for assignment',
      time: request.assignedAt,
      done: !!request.assignedAt,
    },
    {
      key: 'picked_up',
      icon: PackageCheck,
      color: '#16A34A',
      bg: '#F0FDF4',
      label: 'Picked Up from Member',
      sub: request.pickedUpAt ? 'You confirmed physical pickup' : 'Not yet picked up',
      time: request.pickedUpAt,
      done: !!request.pickedUpAt,
    },
    {
      key: 'collected',
      icon: Banknote,
      color: '#1E3A5F',
      bg: '#EEF2F8',
      label: 'Handed to Admin',
      sub: request.status === 'COLLECTED' ? 'Admin confirmed receipt — payment credited' : 'Awaiting admin confirmation',
      time: request.status === 'COLLECTED' ? request.updatedAt : null,
      done: request.status === 'COLLECTED',
    },
  ];

  return (
    <Modal title="Cash Pickup Trail" onClose={onClose} size="sm">
      <div className="space-y-1 pb-2">
        <div className="flex items-center gap-2.5 mb-4 px-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {memberMap[request.memberId] ?? '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {chitMap[request.chitId] ?? '—'} · ₹{fmt(request.requestedAmount)}
            </p>
          </div>
        </div>

        <div className="space-y-0">
          {timeline.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === timeline.length - 1;
            return (
              <div key={step.key} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: step.done ? step.bg : '#F3F4F6',
                      border: `2px solid ${step.done ? step.color : '#D1D5DB'}`,
                    }}
                  >
                    <Icon size={14} style={{ color: step.done ? step.color : '#9CA3AF' }} />
                  </div>
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1 my-1"
                      style={{ backgroundColor: step.done ? step.color : '#E5E7EB', minHeight: '20px' }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className={`pb-4 ${isLast ? '' : ''} min-w-0 flex-1`}>
                  <p className={`text-sm font-semibold ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>
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
            <p className="text-xs text-gray-500 font-medium mb-0.5">Notes</p>
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

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange, tasks, history }) {
  const tabs = [
    { key: 'tasks',   label: 'Active Tasks',  icon: ClipboardList, count: tasks },
    { key: 'history', label: 'My History',     icon: History,       count: null  },
  ];
  return (
    <div className="flex border-b border-gray-200 gap-1">
      {tabs.map(({ key, label, icon: Icon, count }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px flex items-center gap-2 ${
            active === key
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon size={14} />
          {label}
          {count > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Active Tasks ─────────────────────────────────────────────────────────────
function ActiveTasksTab({ memberMap, chitMap }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [confirmPickup, setConfirmPickup] = useState(null);
  const [viewTimeline, setViewTimeline] = useState(null);
  const [deferTask, setDeferTask] = useState(null); // shows reschedule/cancel sheet

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['worker-tasks'],
    queryFn: getMyAssignedRequests,
    refetchInterval: 30_000,
  });

  // Admin-assigned direct payments (no CashRequest was created — just a batch awaiting remittance)
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['worker-pending-batches'],
    queryFn: getMyPendingBatches,
    refetchInterval: 30_000,
  });

  const pickupMutation = useMutation({
    mutationFn: (requestId) => markPickedUp(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      toast.success('Marked as picked up — hand the cash to admin to complete the payment');
      setConfirmPickup(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to mark as picked up');
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ requestId, scheduledFor }) => rescheduleRequest({ requestId, scheduledFor }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      const label = vars.label ?? 'a future date';
      toast.success(`Rescheduled to ${label} — admin has been notified`);
      setDeferTask(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Reschedule failed'),
  });

  const cancelWorkerMutation = useMutation({
    mutationFn: (requestId) => workerCancelRequest({ requestId, reason: 'Member not available' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      qc.invalidateQueries({ queryKey: ['worker-history'] });
      toast.success('Task cancelled — admin has been notified');
      setDeferTask(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Cancel failed'),
  });

  if (isLoading) return <PageSpinner />;

  const assignedTasks  = tasks.filter((t) => t.status === 'ASSIGNED');
  const pickedUpTasks  = tasks.filter((t) => t.status === 'PICKED_UP');

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl px-5 py-4" style={{ backgroundColor: '#EFF3F8' }}>
        <AlertCircle size={16} className="text-[#1E3A5F] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-[#1E3A5F]">How it works</p>
          <p className="text-gray-600 mt-0.5 leading-relaxed">
            Visit the member, collect the cash, then tap <strong>Mark Picked Up</strong>. Hand the cash to
            admin — they'll confirm receipt to officially credit the member's account.
          </p>
        </div>
      </div>

      {tasks.length === 0 && pendingBatches.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No active tasks"
          message="When an admin assigns you a cash collection task, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {/* ASSIGNED tasks — worker needs to go collect */}
          {assignedTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => setViewTimeline(task)}
              className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between gap-4 flex-wrap cursor-pointer hover:border-[#1E3A5F]/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {(memberMap[task.memberId] ?? '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {memberMap[task.memberId] ?? task.memberId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {chitMap[task.chitId] ?? task.chitId?.slice(0, 8) + '…'}
                  </p>
                  {task.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">"{task.notes}"</p>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900 flex items-center gap-0.5 justify-end text-lg">
                  <IndianRupee size={15} />
                  {fmt(task.requestedAmount)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 justify-end">
                  <Calendar size={11} />
                  Assigned {fmtDate(task.assignedAt)}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setConfirmPickup(task); }}
                >
                  <PackageCheck size={14} className="mr-1" />
                  Mark Picked Up
                </Button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeferTask(task); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer underline-offset-2 hover:underline"
                >
                  Can't go today?
                </button>
              </div>
            </div>
          ))}

          {/* PICKED_UP tasks — waiting for admin to confirm */}
          {pickedUpTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => setViewTimeline(task)}
              className="bg-green-50 rounded-2xl border border-green-200 p-5 flex items-center justify-between gap-4 flex-wrap cursor-pointer hover:border-green-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#16A34A' }}
                >
                  {(memberMap[task.memberId] ?? '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {memberMap[task.memberId] ?? task.memberId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {chitMap[task.chitId] ?? task.chitId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-xs text-green-700 mt-1 font-medium">
                    Picked up {fmtDateTime(task.pickedUpAt)} — awaiting admin to confirm receipt
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900 flex items-center gap-0.5 justify-end text-lg">
                  <IndianRupee size={15} />
                  {fmt(task.requestedAmount)}
                </p>
              </div>
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
                Waiting for Admin
              </span>
            </div>
          ))}

          {/* Admin-direct batches: already collected, awaiting admin remittance */}
          {pendingBatches.map((batch) => (
            <div
              key={batch.id}
              className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#D4A017' }}
                >
                  {(memberMap[batch.memberId] ?? '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {memberMap[batch.memberId] ?? batch.memberId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {chitMap[batch.chitId] ?? batch.chitId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    Cash collected — awaiting admin to confirm receipt
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900 flex items-center gap-0.5 justify-end text-lg">
                  <IndianRupee size={15} />
                  {fmt(batch.totalAmount)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 justify-end">
                  <Calendar size={11} />
                  {fmtDate(batch.collectedAt)}
                </p>
              </div>
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
                Pending Remittance
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Defer dialog — centered */}
      {deferTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
            onClick={() => setDeferTask(null)}
          />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl">
            <div className="px-5 pt-5 pb-2">
              <p className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                Can't collect today?
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {memberMap[deferTask.memberId] ?? '—'} · ₹{fmt(deferTask.requestedAmount)}
              </p>
            </div>
            <div className="px-5 pb-2 space-y-3 pt-3">
              {/* Tomorrow */}
              <button
                type="button"
                disabled={rescheduleMutation.isPending}
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  rescheduleMutation.mutate({
                    requestId: deferTask.id,
                    scheduledFor: d.toISOString().slice(0, 19),
                    label: 'tomorrow',
                  });
                }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-[#1E3A5F] text-[#1E3A5F] font-semibold text-base hover:bg-[#EEF2F8] transition-colors cursor-pointer disabled:opacity-50"
              >
                <CalendarClock size={22} />
                <div className="text-left">
                  <p className="font-bold">Tomorrow</p>
                  <p className="text-xs font-normal text-gray-500">I will go tomorrow</p>
                </div>
              </button>
              {/* Next Week */}
              <button
                type="button"
                disabled={rescheduleMutation.isPending}
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  d.setHours(9, 0, 0, 0);
                  rescheduleMutation.mutate({
                    requestId: deferTask.id,
                    scheduledFor: d.toISOString().slice(0, 19),
                    label: 'next week',
                  });
                }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-base hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Calendar size={22} />
                <div className="text-left">
                  <p className="font-bold">Next Week</p>
                  <p className="text-xs font-normal text-gray-500">I will go next week</p>
                </div>
              </button>
              {/* Cancel */}
              <button
                type="button"
                disabled={cancelWorkerMutation.isPending}
                onClick={() => cancelWorkerMutation.mutate(deferTask.id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-base hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={22} />
                <div className="text-left">
                  <p className="font-bold">Cancel</p>
                  <p className="text-xs font-normal text-gray-500">Member not available, cancel task</p>
                </div>
              </button>
            </div>
            <div className="px-5 pb-6 pt-2">
              <button
                type="button"
                onClick={() => setDeferTask(null)}
                className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPickup && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Pickup"
          description={`Confirm you physically collected ₹${fmt(confirmPickup.requestedAmount)} from ${memberMap[confirmPickup.memberId] ?? 'member'}? This creates a proof-of-pickup record. Hand the cash to admin next.`}
          actionLabel="Yes, I Picked It Up"
          loading={pickupMutation.isPending}
          onConfirm={() => pickupMutation.mutate(confirmPickup.id)}
          onClose={() => setConfirmPickup(null)}
        />
      )}

      {viewTimeline && (
        <CashRequestTimelineModal
          request={viewTimeline}
          memberMap={memberMap}
          chitMap={chitMap}
          onClose={() => setViewTimeline(null)}
        />
      )}
    </div>
  );
}

// ─── My History ───────────────────────────────────────────────────────────────
function MyHistoryTab({ memberMap, chitMap }) {
  const [viewTimeline, setViewTimeline] = useState(null);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['worker-history'],
    queryFn: getMyRequestHistory,
    staleTime: 30_000,
  });

  if (isLoading) return <PageSpinner />;

  if (history.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No collection history yet"
        message="Completed and cancelled cash collection tasks will appear here."
      />
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <Table columns={['Member', 'Chit Fund', 'Amount', 'Date', 'Status', '']}>
          {history.map((r) => {
            const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, variant: 'default' };
            return (
              <Tr key={r.id} onClick={() => setViewTimeline(r)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                <Td>
                  <span className="text-sm font-medium text-gray-900">
                    {memberMap[r.memberId] ?? r.memberId?.slice(0, 8) + '…'}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm text-gray-600">
                    {chitMap[r.chitId] ?? r.chitId?.slice(0, 8) + '…'}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-0.5 font-semibold text-gray-900">
                    <IndianRupee size={13} />
                    {fmt(r.requestedAmount)}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm text-gray-500">{fmtDateTime(r.updatedAt)}</span>
                </Td>
                <Td>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </Td>
                <Td>
                  <ChevronRight size={15} className="text-gray-300" />
                </Td>
              </Tr>
            );
          })}
        </Table>
      </div>

      {viewTimeline && (
        <CashRequestTimelineModal
          request={viewTimeline}
          memberMap={memberMap}
          chitMap={chitMap}
          onClose={() => setViewTimeline(null)}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkerTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'tasks';
  const setTab = (t) => { const p = new URLSearchParams(searchParams); p.set('tab', t); setSearchParams(p, { replace: true }); };
  const { memberMap, chitMap } = useLookupMaps();

  const { data: tasks = [] } = useQuery({
    queryKey: ['worker-tasks'],
    queryFn: getMyAssignedRequests,
    staleTime: 30_000,
  });
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['worker-pending-batches'],
    queryFn: getMyPendingBatches,
    staleTime: 30_000,
  });

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          My Tasks
        </h1>
        <p className="text-sm text-gray-500 mt-1">Cash collection requests assigned to you</p>
      </div>

      <div className="space-y-5">
        <TabBar active={tab} onChange={setTab} tasks={tasks.length + pendingBatches.length} />

        {tab === 'tasks' && <ActiveTasksTab memberMap={memberMap} chitMap={chitMap} />}
        {tab === 'history' && <MyHistoryTab memberMap={memberMap} chitMap={chitMap} />}
      </div>
    </div>
  );
}
