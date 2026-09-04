import { useState, useEffect } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getChits, getMembers, getPendingPayouts, getWalletBalance,
  getActiveCashRequests, getPendingRemittance, listStaff,
  getOrgReservations, getCashRequestSummary, getWinners, getAllPayouts,
  getMyReferralInfo, getMyEffectiveLimits, getPendingSettlements, listAuctions,
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
  CheckCircle, XCircle, PackageCheck, AlertTriangle, Copy, Check, ShieldAlert, Gavel,
} from 'lucide-react';

const HIDDEN_PLACEHOLDER = '••••••';

function OverLimitModal({ violations, onContinue }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Usage Over Plan Limit</h3>
            <p className="text-xs text-gray-500 mt-0.5">Your current usage exceeds your plan limits</p>
          </div>
        </div>
        <div className="px-6 pb-2 space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-red-800">{v.label}</p>
                <p className="text-xs text-red-600 mt-0.5">Limit: {v.limit} — You have: {v.current}</p>
              </div>
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-lg">
                +{v.current - v.limit} over
              </span>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 bg-amber-50 mx-6 mb-4 rounded-xl">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Action required:</span> Contact ChitWise support to upgrade your plan or adjust your limits. You can still view your data, but new additions may be blocked.
          </p>
        </div>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-2.5 rounded-xl bg-[#1E3A5F] text-white text-sm font-semibold hover:bg-[#162d4a] transition-colors cursor-pointer"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

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

function ReferralCard({ referralCode, creditBalance }) {
  const [copied, setCopied] = useState(false);
  function copyCode() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    if (navigator.clipboard) navigator.clipboard.writeText(referralCode).then(done).catch(() => done());
    else done();
  }
  const credit = Number(creditBalance ?? 0);
  return (
    <div className="bg-gradient-to-r from-[#EEF2F8] to-[#F0F4FA] rounded-xl border border-[#CBD5E1] p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
            <Users size={18} style={{ color: '#1E3A5F' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Refer other organizations</p>
            <p className="text-xs text-gray-500">Share your code — new orgs get a first-month discount, you earn credit after their first 30 days.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          <span className="font-mono text-sm font-bold text-[#1E3A5F] bg-[#EEF2F8] px-3 py-1.5 rounded-lg">
            {referralCode}
          </span>
          <button onClick={copyCode} className="p-2 rounded-lg text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors" title="Copy code">
            {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
          </button>
        </div>
      </div>
      {credit > 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle size={13} className="text-green-500" />
          <span className="text-xs font-semibold text-green-700">₹{credit.toFixed(0)} referral credit earned</span>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user, planExpiresAt } = useAuth();
  const isPlanExpired = planExpiresAt && new Date(planExpiresAt) < new Date();
  const navigate = useNavigate();
  const [limitsDismissed, setLimitsDismissed] = useState(
    () => !!sessionStorage.getItem('overLimitDismissed')
  );

  if (user?.role === 'STAFF')  return <StaffHomePage />;
  if (user?.role === 'MANAGER') return <ManagerHomePage />;

  const { hidden } = useHiddenAmounts();
  const isAdmin = user?.role === 'ADMIN';

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
    staleTime: 30_000,
    retry: false,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers({ size: 50 }),
    staleTime: 60_000,
    retry: false,
  });

  // Pending Disbursement = payouts in PENDING status
  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: () => getPendingPayouts(),
    staleTime: 30_000,
  });

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => getWalletBalance(),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  // Cash request summary (counts per status)
  const { data: cashSummary } = useQuery({
    queryKey: ['cashRequests', 'summary'],
    queryFn: getCashRequestSummary,
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: remittanceBatches = [] } = useQuery({
    queryKey: ['remittance', 'pending'],
    queryFn: () => getPendingRemittance(),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: () => listStaff(),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
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

  const { data: referralInfo } = useQuery({
    queryKey: ['myReferralInfo'],
    queryFn: getMyReferralInfo,
    enabled: isAdmin,
    staleTime: 300_000,
  });

  const { data: pendingSettlementsPage } = useQuery({
    queryKey: ['dash-pending-settlements'],
    queryFn: () => getPendingSettlements(0, 5),
    enabled: isAdmin,
    staleTime: 120_000,
  });
  const pendingSettlements = pendingSettlementsPage?.content ?? [];
  const pendingSettlementCount = pendingSettlementsPage?.totalElements ?? 0;
  const memberNameMap = Object.fromEntries(
    members.map(m => [String(m.id).toLowerCase(), m.fullName ?? m.name ?? ''])
  );

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
  const activeAuctionChits = activeChits.filter((c) => c.chitType === 'AUCTION' || c.winnerSelectionMode === 'AUCTION');

  const auctionSessionQueries = useQueries({
    queries: activeAuctionChits.map((c) => ({
      queryKey: ['auctions', c.id],
      queryFn: () => listAuctions(c.id),
      enabled: isAdmin,
      refetchInterval: 30_000,
      staleTime: 15_000,
    })),
  });
  const liveAuctions = activeAuctionChits.flatMap((c, i) => {
    const sessions = auctionSessionQueries[i]?.data ?? [];
    return sessions.filter((a) => a.status === 'OPEN').map((a) => ({ ...a, chitName: c.name, chitId: c.id }));
  });
  const pendingAuctions = activeAuctionChits.flatMap((c, i) => {
    const sessions = auctionSessionQueries[i]?.data ?? [];
    const hasOpen = sessions.some((a) => a.status === 'OPEN');
    if (hasOpen) return [];
    return sessions.filter((a) => a.status === 'PENDING').map((a) => ({ ...a, chitName: c.name, chitId: c.id }));
  });

  const { data: effectiveLimits } = useQuery({
    queryKey: ['my-effective-limits'],
    queryFn: getMyEffectiveLimits,
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const limitViolations = (() => {
    if (!effectiveLimits || !isAdmin) return [];
    const v = [];
    if (effectiveLimits.maxActiveChits > 0 && activeChits.length > effectiveLimits.maxActiveChits) {
      v.push({ label: 'Active Chit Groups', current: activeChits.length, limit: effectiveLimits.maxActiveChits });
    }
    if (effectiveLimits.maxMembers > 0 && members.length > effectiveLimits.maxMembers) {
      v.push({ label: 'Members', current: members.length, limit: effectiveLimits.maxMembers });
    }
    return v;
  })();

  function navToCashFilter(filter) {
    navigate(`/payments/cash-requests?filter=${filter}`);
  }

  if (chitsLoading || membersLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-8">
      {limitViolations.length > 0 && !limitsDismissed && (
        <OverLimitModal
          violations={limitViolations}
          onContinue={() => {
            sessionStorage.setItem('overLimitDismissed', '1');
            setLimitsDismissed(true);
          }}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
        {(() => {
          const chitLimitHit = !!(effectiveLimits?.maxActiveChits > 0 && activeChits.length >= effectiveLimits.maxActiveChits);
          const memberLimitHit = !!(effectiveLimits?.maxMembers > 0 && members.length >= effectiveLimits.maxMembers);
          const chitOff = isPlanExpired || chitLimitHit;
          const memberOff = isPlanExpired || memberLimitHit;
          const expiredTip = 'Your plan has expired — contact support to renew';
          return (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`transition-opacity duration-300 ${chitOff ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
                title={chitOff ? (isPlanExpired ? expiredTip : 'Active chit limit reached — upgrade to add more') : undefined}
              >
                <Button onClick={() => navigate('/chits', { state: { openAdd: true } })} size="md" className="min-w-36">
                  <Plus size={15} /> New Chit
                </Button>
              </div>
              <div
                className={`transition-opacity duration-300 ${memberOff ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
                title={memberOff ? (isPlanExpired ? expiredTip : 'Member limit reached — upgrade to add more') : undefined}
              >
                <Button variant="secondary" onClick={() => navigate('/members', { state: { openAdd: true } })} size="md">
                  <UserPlus size={15} /> Add Member
                </Button>
              </div>
            </div>
          );
        })()}
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
            color="#D97706"
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

      {/* ── Live Auctions ───────────────────────────────────────────────── */}
      {isAdmin && (liveAuctions.length > 0 || pendingAuctions.length > 0) && (
        <div>
          <SectionHeader icon={Gavel} color="#DC2626" title="Auctions" />
          <div className="space-y-2">
            {liveAuctions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/chits/${a.chitId}/auction/${a.id}`)}
                className="w-full bg-red-50 rounded-xl border border-red-200 shadow-sm p-4 flex items-center gap-3 text-left hover:border-red-400 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-100">
                  <Gavel size={16} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                    <p className="text-sm font-semibold text-gray-900">{a.chitName} — Draw {a.monthNumber}</p>
                  </div>
                  <p className="text-xs text-red-600 font-medium">Live — bidding in progress</p>
                </div>
                <ArrowRight size={14} className="text-red-500 flex-shrink-0" />
              </button>
            ))}
            {pendingAuctions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/chits/${a.chitId}/auction/${a.id}`)}
                className="w-full bg-white rounded-xl border border-amber-200 shadow-sm p-4 flex items-center gap-3 text-left hover:border-amber-400 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                  <Gavel size={16} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.chitName} — Draw {a.monthNumber}</p>
                  <p className="text-xs text-amber-600 font-medium">Auction pending — not yet started</p>
                </div>
                <ArrowRight size={14} className="text-amber-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cash Collections (workflow order) ───────────────────────────── */}
      {isAdmin && (
        <div>
          <SectionHeader
            icon={Truck}
            color="#1E3A5F"
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
              color="#2D5490"
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
              color="#D97706"
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

      {/* ── Pending Settlement Payments ──────────────────────────────────── */}
      {isAdmin && pendingSettlementCount > 0 && (
        <div>
          <SectionHeader
            icon={AlertTriangle}
            color="#D97706"
            title="Pending Settlement Payments"
            linkLabel="View all"
            onLink={() => navigate('/settlement')}
          />
          <div className="space-y-2">
            {pendingSettlements.map((s) => {
              const remainingAmt = Number(s.remainingAmount ?? 0);
              const netAmt = Number(s.totalAmount ?? 0);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/settlement?memberId=${s.memberId}&settlementId=${s.id}`)}
                  className="w-full bg-white rounded-xl border border-amber-200 shadow-sm p-4 flex items-center gap-3 text-left hover:border-amber-400 transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                    <AlertTriangle size={16} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{memberNameMap[String(s.memberId).toLowerCase()] || String(s.memberId).slice(0, 8) + '…'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Net {netAmt > 0 ? 'collect' : 'disburse'} ₹{Math.abs(netAmt).toLocaleString('en-IN')}
                      {' · '}
                      <span className="text-amber-700 font-medium">₹{Math.abs(remainingAmt).toLocaleString('en-IN')} remaining</span>
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-amber-500 flex-shrink-0" />
                </button>
              );
            })}
            {pendingSettlementCount > pendingSettlements.length && (
              <button
                type="button"
                onClick={() => navigate('/settlement')}
                className="w-full text-xs font-medium text-amber-700 hover:underline cursor-pointer py-2"
              >
                +{pendingSettlementCount - pendingSettlements.length} more pending →
              </button>
            )}
          </div>
        </div>
      )}

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
                          ? `${HIDDEN_PLACEHOLDER} / month · ${c.capacity} members`
                          : `₹${c.installmentAmount?.toLocaleString()} / month · ${c.capacity} members`}
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
