import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  getMyAssignedRequests,
  getMyRequestHistory,
  getMyPendingBatches,
  collectForRequest,
  getMembers,
  getChits,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  ClipboardList, CheckCircle, History, IndianRupee, Calendar, AlertCircle,
} from 'lucide-react';

const STATUS_CONFIG = {
  COLLECTED:  { label: 'Collected',  variant: 'success' },
  CANCELLED:  { label: 'Cancelled',  variant: 'danger'  },
  ASSIGNED:   { label: 'Assigned',   variant: 'info'    },
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

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName ?? m.name ?? '—']));
  const chitMap   = Object.fromEntries(chits.map((c)   => [c.id, c.name ?? c.chitName ?? '—']));
  return { memberMap, chitMap };
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange, tasks, history }) {
  const tabs = [
    { key: 'tasks',   label: 'Active Tasks',       icon: ClipboardList, count: tasks },
    { key: 'history', label: 'My History',          icon: History,       count: null  },
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
  const [confirmCollect, setConfirmCollect] = useState(null);

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

  const collectMutation = useMutation({
    mutationFn: (requestId) => collectForRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      qc.invalidateQueries({ queryKey: ['worker-history'] });
      toast.success('Cash collected — hand it to admin to complete the payment');
      setConfirmCollect(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Collection failed');
    },
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl px-5 py-4" style={{ backgroundColor: '#EFF3F8' }}>
        <AlertCircle size={16} className="text-[#1E3A5F] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-[#1E3A5F]">How it works</p>
          <p className="text-gray-600 mt-0.5 leading-relaxed">
            Go to the member, collect the cash, then tap <strong>Mark Collected</strong>. Hand the cash to
            the admin — they'll confirm receipt to officially credit the member's account.
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
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              {/* Left: member + chit + details */}
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

              {/* Center: amount + date */}
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

              {/* Right: action */}
              <Button
                variant="success"
                size="sm"
                className="flex-shrink-0"
                onClick={() => setConfirmCollect(task)}
              >
                <CheckCircle size={14} className="mr-1" />
                Mark Collected
              </Button>
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

      {confirmCollect && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Collection"
          description={`Confirm you collected ₹${fmt(confirmCollect.requestedAmount)} from ${memberMap[confirmCollect.memberId] ?? 'member'}? Make sure you hand the cash to admin to complete the payment.`}
          actionLabel="Yes, Collected"
          loading={collectMutation.isPending}
          onConfirm={() => collectMutation.mutate(confirmCollect.id)}
          onClose={() => setConfirmCollect(null)}
        />
      )}
    </div>
  );
}

// ─── My History ───────────────────────────────────────────────────────────────
function MyHistoryTab({ memberMap, chitMap }) {
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
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <Table columns={['Member', 'Chit Fund', 'Amount', 'Date', 'Status']}>
        {history.map((r) => {
          const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, variant: 'default' };
          return (
            <Tr key={r.id}>
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
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkerTasksPage() {
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab ?? 'tasks');
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
