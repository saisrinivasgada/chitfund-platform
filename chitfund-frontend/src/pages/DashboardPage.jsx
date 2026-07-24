import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getChits, getMembers, getPendingPayouts, getWalletBalance,
  getActiveCashRequests, getPendingRemittance, listStaff,
  getOrgReservations, getCashRequestSummary, getWinners, getAllPayouts,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useHiddenAmounts } from '../hooks/useHiddenAmounts';
import Badge, { statusBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { DashboardSkeleton } from '../components/ui/Spinner';
import StaffHomePage from './staff/StaffHomePage';
import ManagerHomePage from './manager/ManagerHomePage';
import TodaysActivityFeed from '../components/TodaysActivityFeed';
import {
  BookOpen, Users, CreditCard, Banknote, Plus, UserPlus,
  ArrowRight, Wallet, Truck, Clock, Calendar, Building2,
  CheckCircle, XCircle, PackageCheck, AlertTriangle,
} from 'lucide-react';

const HIDDEN_PLACEHOLDER = '••••••';

function SectionHeader({ icon: Icon, color, title, linkLabel, onLink }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Icon size={14} style={{ color }} />
        <span className="text-sm font-semibold text-gray-700">{title}</span>
      </div>
      <div className="flex-1 h-px bg-gray-100" />
      {onLink && (
        <button
          type="button"
          onClick={onLink}
          className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium flex-shrink-0"
        >
          {linkLabel} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub, hidden, onClick }) {
  const base = "bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4";
  const interactive = onClick ? "cursor-pointer hover:shadow-md hover:border-gray-300 transition-all" : "";
  return (
    <div className={`${base} ${interactive}`} onClick={onClick}>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">
          {hidden ? HIDDEN_PLACEHOLDER : (value ?? '—')}
        </p>
        {sub && !hidden && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// Clickable workflow card for cash requests
function CashFilterCard({ icon: Icon, label, count, todayCount, color, bgColor, onClick, active }) {
  const showToday = todayCount !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 w-full text-left transition-all cursor-pointer ${
        active ? 'border-2 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
      style={active ? { borderColor: color } : {}}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: bgColor ?? `${color}18` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        {showToday ? (
          <>
            <p className="text-xl font-bold text-gray-900 leading-tight">{todayCount ?? 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">{count ?? 0} overall</p>
          </>
        ) : (
          <p className="text-xl font-bold text-gray-900 leading-tight">{count ?? 0}</p>
        )}
      </div>
    </button>
  );
}

function RemittanceCard({ batches, staffMap, hidden, onClick, cashPickedUp = 0, cashPartial = 0 }) {
  const batchTotal = batches.length;
  const cashTotal  = cashPickedUp + cashPartial;
  const total      = batchTotal + cashTotal;
  const totalAmt   = batches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const uniqueIds  = [...new Set(batches.map((b) => String(b.collectedBy)))];
  const workers    = uniqueIds.filter((id) => staffMap[id]?.role === 'STAFF').length;
  const managers   = uniqueIds.filter((id) => staffMap[id]?.role === 'MANAGER').length;

  const parts = [];
  if (cashPickedUp > 0) parts.push(`${cashPickedUp} picked up`);
  if (cashPartial  > 0) parts.push(`${cashPartial} partial`);
  if (batchTotal   > 0) parts.push(`${batchTotal} batch${batchTotal !== 1 ? 'es' : ''}`);
  if (workers      > 0) parts.push(`${workers} staff`);
  if (managers     > 0) parts.push(`${managers} manager${managers !== 1 ? 's' : ''}`);

  return (
    <button
      type="button"
      onClick={hidden ? undefined : onClick}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4 w-full text-left cursor-pointer hover:border-amber-300 hover:shadow-md transition-all"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#D9770618' }}
      >
        <Clock size={20} style={{ color: '#D97706' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">Remittance Awaiting</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{total}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {parts.length > 0 && (
            <span className="text-xs text-gray-400">{parts.join(' · ')}</span>
          )}
          {!hidden && totalAmt > 0 && (
            <span className="text-xs font-semibold text-amber-600">
              ₹{totalAmt.toLocaleString('en-IN')}
            </span>
          )}
          {hidden && total > 0 && (
            <span className="text-xs text-gray-400">{HIDDEN_PLACEHOLDER}</span>
          )}
          {!hidden && total > 0 && (
            <span className="text-xs text-amber-600 font-medium ml-auto">View →</span>
          )}
        </div>
      </div>
    </button>
  );
}

function TreasuryCard({ label, amount, icon: Icon, color, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">
          {hidden ? HIDDEN_PLACEHOLDER : `₹${Number(amount ?? 0).toLocaleString('en-IN')}`}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role === 'STAFF')  return <StaffHomePage />;
  if (user?.role === 'MANAGER') return <ManagerHomePage />;

  const { hidden } = useHiddenAmounts();
  const isAdmin = user?.role === 'ADMIN';

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers(),
  });

  // Pending Disbursement = payouts in PENDING status
  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: () => getPendingPayouts(),
  });

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => getWalletBalance(),
    enabled: isAdmin,
  });

  // Cash request summary (counts per status)
  const { data: cashSummary } = useQuery({
    queryKey: ['cashRequests', 'summary'],
    queryFn: getCashRequestSummary,
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const { data: remittanceBatches = [] } = useQuery({
    queryKey: ['remittance', 'pending'],
    queryFn: () => getPendingRemittance(),
    enabled: isAdmin,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: () => listStaff(),
    enabled: isAdmin,
  });

  const staffMap = Object.fromEntries(staff.map((s) => [String(s.id), s]));

  const { data: orgReservations = [] } = useQuery({
    queryKey: ['dash-org-reservations'],
    queryFn: getOrgReservations,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  // Pending Payout = winners selected but no payout created (across ALL chit statuses)
  const eligibleChits = chits.filter((c) => c.status !== 'DRAFT');
  const eligibleChitStr = eligibleChits.map((c) => c.id).join(',');

  const { data: chitWinnersMap = {} } = useQuery({
    queryKey: ['winners-batch-dash', eligibleChitStr],
    queryFn: async () => {
      const entries = await Promise.all(
        eligibleChits.map((c) =>
          getWinners(c.id).then((ws) => [c.id, ws]).catch(() => [c.id, []])
        )
      );
      return Object.fromEntries(entries);
    },
    enabled: isAdmin && eligibleChits.length > 0,
    staleTime: 300_000,
  });

  const { data: allPayoutsForDash = [] } = useQuery({
    queryKey: ['payouts', 'all-for-dash'],
    queryFn: () => getAllPayouts({}),
    enabled: isAdmin,
    staleTime: 300_000,
  });

  const paidKeys = new Set(
    allPayoutsForDash
      .filter((p) => p.status !== 'CANCELLED')
      .map((p) => `${p.chitId}:${p.monthNumber}:${String(p.memberId)}`)
  );
  let pendingPayoutCount = 0;
  for (const [chitId, winners] of Object.entries(chitWinnersMap)) {
    for (const w of winners) {
      const mid = w.memberId ?? w.winnerId;
      if (!paidKeys.has(`${chitId}:${w.monthNumber}:${String(mid)}`)) {
        pendingPayoutCount++;
      }
    }
  }

  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  function navToCashFilter(filter) {
    navigate(`/payments/cash-requests?filter=${filter}`);
  }

  if (chitsLoading || membersLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Welcome back, {user?.name ?? 'Admin'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Here's what's happening with your chit funds today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/chits', { state: { openAdd: true } })} size="md" className="min-w-36">
            <Plus size={15} /> New Chit
          </Button>
          <Button variant="secondary" onClick={() => navigate('/members', { state: { openAdd: true } })} size="md">
            <UserPlus size={15} /> Add Member
          </Button>
        </div>
      </div>

      {/* ── At a Glance (5 cards) ────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={BookOpen} color="#1E3A5F" title="At a Glance" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={BookOpen}
            label="Total Chits"
            value={chits.length}
            color="#1E3A5F"
            sub={`${activeChits.length} active`}
            hidden={false}
          />
          <StatCard
            icon={CreditCard}
            label="Active Chits"
            value={activeChits.length}
            color="#16A34A"
            hidden={false}
          />
          <StatCard
            icon={Users}
            label="Total Members"
            value={members.length}
            color="#D4A017"
            hidden={false}
          />
          <StatCard
            icon={Banknote}
            label="Pending Payout"
            value={pendingPayoutCount}
            color="#7C3AED"
            sub="winner selected, no payout"
            hidden={false}
            onClick={() => navigate('/payouts?tab=Pending+Payouts')}
          />
          <StatCard
            icon={CheckCircle}
            label="Pending Disbursement"
            value={pendingPayouts.length}
            color="#DC2626"
            sub="payout created, not disbursed"
            hidden={false}
            onClick={() => navigate('/payouts?tab=Pending')}
          />
        </div>
      </div>

      {/* ── Cash Collections (workflow order) ───────────────────────────── */}
      {isAdmin && (
        <div>
          <SectionHeader
            icon={Truck}
            color="#7C3AED"
            title="Cash Collections"
            linkLabel="View all"
            onLink={() => navigate('/payments/cash-requests')}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <CashFilterCard
              icon={Clock}
              label="Pending"
              count={cashSummary?.pending ?? 0}
              color="#D97706"
              onClick={() => navToCashFilter('PENDING')}
            />
            <CashFilterCard
              icon={UserPlus}
              label="Assigned"
              count={cashSummary?.assigned ?? 0}
              color="#2563EB"
              onClick={() => navToCashFilter('ASSIGNED')}
            />
            <CashFilterCard
              icon={PackageCheck}
              label="Picked Up"
              count={cashSummary?.pickedUp ?? 0}
              color="#16A34A"
              onClick={() => navToCashFilter('PICKED_UP')}
            />
            <CashFilterCard
              icon={AlertTriangle}
              label="Partial"
              count={cashSummary?.partiallyCollected ?? 0}
              color="#7C3AED"
              onClick={() => navToCashFilter('PARTIALLY_COLLECTED')}
            />
            <RemittanceCard
              batches={remittanceBatches}
              staffMap={staffMap}
              hidden={hidden}
              cashPickedUp={cashSummary?.pickedUp ?? 0}
              cashPartial={cashSummary?.partiallyCollected ?? 0}
              onClick={() => {
                const hasCash = (cashSummary?.pickedUp ?? 0) + (cashSummary?.partiallyCollected ?? 0) > 0;
                navigate(hasCash ? '/payments/cash-requests' : '/payments/remittance');
              }}
            />
            <CashFilterCard
              icon={XCircle}
              label="Cancelled"
              count={cashSummary?.cancelled ?? 0}
              todayCount={cashSummary?.todayCancelled}
              color="#6B7280"
              onClick={() => navToCashFilter('CANCELLED')}
            />
          </div>
        </div>
      )}

      {/* ── Treasury ────────────────────────────────────────────────────── */}
      {isAdmin && walletBalance && (
        <div>
          <SectionHeader
            icon={Wallet}
            color="#D4A017"
            title="Treasury Balance"
            linkLabel="Manage"
            onLink={() => navigate('/treasury')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TreasuryCard
              label="Cash on Hand"
              amount={walletBalance.cashBalance}
              icon={Banknote}
              color="bg-[#1E3A5F]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Bank Balance"
              amount={walletBalance.bankBalance}
              icon={CreditCard}
              color="bg-[#16A34A]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Total Balance"
              amount={walletBalance.totalBalance}
              icon={Wallet}
              color="bg-[#D4A017]"
              hidden={hidden}
            />
          </div>
        </div>
      )}

      {/* ── Org Holdings ────────────────────────────────────────────────── */}
      {isAdmin && orgReservations.filter((r) => r.status === 'RESERVED').length > 0 && (() => {
        const active = orgReservations.filter((r) => r.status === 'RESERVED');
        const pending = active.filter((r) => r.eligibleToRealize);
        const pendingAmount = pending.reduce((s, r) => s + Number(r.payoutAmount ?? 0), 0);
        const chitNames = [...new Set(active.map((r) => r.chitName).filter(Boolean))];
        return (
          <div>
            <SectionHeader
              icon={Building2}
              color="#1E3A5F"
              title="Org Holdings"
              linkLabel="Manage slots"
              onLink={() => navigate('/chits')}
            />
            <button
              type="button"
              onClick={() => navigate('/chits')}
              className="w-full bg-white rounded-xl border border-[#1E3A5F]/20 shadow-sm p-5 flex items-center gap-4 text-left hover:border-[#1E3A5F]/40 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1E3A5F]/8">
                <Building2 size={20} className="text-[#1E3A5F]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {active.length} active slot{active.length !== 1 ? 's' : ''} across {chitNames.length} chit{chitNames.length !== 1 ? 's' : ''}
                </p>
                {pendingAmount > 0 && (
                  <p className="text-sm font-bold mt-0.5 text-amber-600">
                    ₹{pendingAmount.toLocaleString('en-IN')} pending realization
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">Click to view chit schedules</p>
              </div>
              <ArrowRight size={16} className="text-[#1E3A5F] flex-shrink-0" />
            </button>
          </div>
        );
      })()}

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={BookOpen} color="#1E3A5F" title="Recent Activity" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent Chits */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <span className="text-sm font-semibold text-gray-800">Recent Chit Funds</span>
              <button
                type="button"
                onClick={() => navigate('/chits')}
                className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {chits.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">No chit funds yet</p>
              ) : (
                chits.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/chits/${c.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {hidden
                          ? `${HIDDEN_PLACEHOLDER} / month · ${c.totalMembers} members`
                          : `₹${c.installmentAmount?.toLocaleString()} / month · ${c.totalMembers} members`}
                      </p>
                    </div>
                    <Badge variant={statusBadge(c.status)}>{c.status}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Members */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <span className="text-sm font-semibold text-gray-800">Recent Members</span>
              <button
                type="button"
                onClick={() => navigate('/members')}
                className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {members.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">No members yet</p>
              ) : (
                members.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/members/${m.id}`)}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1E3A5F' }}
                    >
                      {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.fullName ?? m.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{m.phone}</p>
                    </div>
                    <Badge variant={statusBadge(m.status ?? 'ACTIVE')}>
                      {m.status ?? 'ACTIVE'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's Activity Feed ────────────────────────────────────────── */}
      <TodaysActivityFeed />

    </div>
  );
}
