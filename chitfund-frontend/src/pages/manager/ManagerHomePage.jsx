import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getTodaysPaymentBatches, getPendingRemittance, getPendingPayouts,
  listStaff, getMembers, getChits, remitPayment,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useState } from 'react';
import {
  CreditCard, Banknote, Clock, CheckCircle, ArrowRight,
  IndianRupee, Users, AlertTriangle, RefreshCw,
} from 'lucide-react';

function fmt(n) {
  if (n == null) return '0';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function ManagerHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToastContext();
  const qc = useQueryClient();
  const [confirmRemit, setConfirmRemit] = useState(null);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const { data: todayBatches = [], isLoading: todayLoading } = useQuery({
    queryKey: ['today-batches'],
    queryFn: getTodaysPaymentBatches,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: pendingRemittances = [], isLoading: remLoading } = useQuery({
    queryKey: ['pending-remittances'],
    queryFn: getPendingRemittance,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: getPendingPayouts,
    staleTime: 60_000,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: () => listStaff(),
    staleTime: 300_000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    staleTime: 300_000,
  });

  const { data: chits = [] } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
    staleTime: 300_000,
  });

  const memberMap = Object.fromEntries(
    members.flatMap((m) => {
      const name = m.fullName ?? m.name ?? '—';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    })
  );
  const chitMap   = Object.fromEntries(chits.map((c)  => [c.id, c.name ?? '—']));
  const staffMap  = Object.fromEntries(staff.map((s)  => [s.id, s.fullName ?? s.username ?? 'Staff']));

  const remitMutation = useMutation({
    mutationFn: (batchId) => remitPayment(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-remittances'] });
      qc.invalidateQueries({ queryKey: ['today-batches'] });
      toast.success('Cash remitted — payment credited to member');
      setConfirmRemit(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Remittance failed'),
  });

  const completedToday = todayBatches.filter((b) => b.status === 'COMPLETED');
  const todayTotal = completedToday.reduce((s, b) => s + (b.totalAmount ?? 0), 0);
  const workers = staff.filter((s) => s.role === 'WORKER');

  if (todayLoading || remLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            {greeting()}, {user?.name ?? 'Manager'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/payments')} size="md">
            <CreditCard size={15} /> Record Payment
          </Button>
          <Button onClick={() => navigate('/payments')} size="md">
            <Banknote size={15} /> Collect Cash
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={IndianRupee}
          label="Collected Today"
          value={`₹${fmt(todayTotal)}`}
          sub={`${completedToday.length} payment${completedToday.length !== 1 ? 's' : ''}`}
          color="#16A34A"
        />
        <StatCard
          icon={Clock}
          label="Pending Remittance"
          value={pendingRemittances.length}
          sub="Cash held by workers"
          color="#D97706"
          onClick={() => navigate('/payments')}
        />
        <StatCard
          icon={Banknote}
          label="Pending Payouts"
          value={pendingPayouts.length}
          sub="Winners awaiting payment"
          color="#DC2626"
          onClick={() => navigate('/payouts')}
        />
        <StatCard
          icon={Users}
          label="Field Workers"
          value={workers.length}
          sub="Active collection staff"
          color="#1E3A5F"
          onClick={() => navigate('/team')}
        />
      </div>

      {/* Pending Remittances */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Pending Remittance</h3>
            {pendingRemittances.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-amber-500">
                {pendingRemittances.length}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">Cash collected by workers, not yet confirmed</p>
        </div>

        {pendingRemittances.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
            <CheckCircle size={18} className="text-green-400" />
            <p className="text-sm">All clear — no pending remittances</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pendingRemittances.map((batch) => (
              <div key={batch.id} className="flex items-center gap-4 px-6 py-4 flex-wrap">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#D4A017' }}
                >
                  {(memberMap[batch.memberId] ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {memberMap[batch.memberId] ?? batch.memberId?.slice(0, 8) + '…'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {chitMap[batch.chitId] ?? '—'} · Collected by {staffMap[batch.collectedBy] ?? 'Worker'} at {fmtTime(batch.collectedAt)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900 flex items-center gap-0.5 justify-end">
                    <IndianRupee size={14} />
                    {fmt(batch.totalAmount)}
                  </p>
                  <span className="text-xs text-amber-600 font-medium">Awaiting remittance</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-shrink-0"
                  onClick={() => setConfirmRemit(batch)}
                >
                  <RefreshCw size={13} className="mr-1" />
                  Remit
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Completed Collections */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} style={{ color: '#16A34A' }} />
            <h3 className="text-base font-semibold text-gray-900">Today's Collections</h3>
            {completedToday.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#16A34A' }}>
                {completedToday.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/payments')}
            className="flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer"
            style={{ color: '#1E3A5F' }}
          >
            All payments <ArrowRight size={13} />
          </button>
        </div>

        {completedToday.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No payments completed today yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {completedToday.slice(0, 6).map((batch) => (
              <div key={batch.id} className="flex items-center gap-4 px-6 py-3.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {(memberMap[batch.memberId] ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {memberMap[batch.memberId] ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {chitMap[batch.chitId] ?? '—'} · {batch.paymentMode ?? 'CASH'}
                  </p>
                </div>
                <span className="font-semibold text-green-700 flex items-center gap-0.5 flex-shrink-0 text-sm">
                  <IndianRupee size={13} />
                  {fmt(batch.totalAmount)}
                </span>
                <Badge variant="success">Done</Badge>
              </div>
            ))}
            {completedToday.length > 6 && (
              <div className="px-6 py-3 text-center">
                <button
                  onClick={() => navigate('/payments')}
                  className="text-sm font-medium cursor-pointer hover:underline"
                  style={{ color: '#1E3A5F' }}
                >
                  +{completedToday.length - 6} more → View all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending Payouts quick view */}
      {pendingPayouts.length > 0 && (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-red-50">
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-red-500" />
              <h3 className="text-base font-semibold text-gray-900">Winners Awaiting Payment</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-red-500">
                {pendingPayouts.length}
              </span>
            </div>
            <button
              onClick={() => navigate('/payouts')}
              className="flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer text-red-600"
            >
              Manage <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingPayouts.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {memberMap[p.memberId] ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400">Month {p.monthNumber} · {chitMap[p.chitId] ?? p.chitId?.slice(0, 8)}</p>
                </div>
                <span className="font-semibold text-red-600 flex items-center gap-0.5 text-sm flex-shrink-0">
                  <IndianRupee size={13} />
                  {fmt(p.netPayoutAmount)}
                </span>
                <Badge variant={p.status === 'PARTIALLY_DISBURSED' ? 'warning' : 'danger'}>
                  {p.status === 'PARTIALLY_DISBURSED' ? 'Partial' : 'Pending'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmRemit && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Received"
          description={`Confirm you received ₹${fmt(confirmRemit.totalAmount)} from ${staffMap[confirmRemit.collectedBy] ?? 'worker'} for ${memberMap[confirmRemit.memberId] ?? 'member'}? This will credit the payment to the member's account.`}
          actionLabel="Yes, Received"
          loading={remitMutation.isPending}
          onConfirm={() => remitMutation.mutate(confirmRemit.id)}
          onClose={() => setConfirmRemit(null)}
        />
      )}
    </div>
  );
}
