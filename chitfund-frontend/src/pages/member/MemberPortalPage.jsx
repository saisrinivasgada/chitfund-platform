import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getMyMemberProfile, getChitsForMember, getMemberTotalBalance,
  getMemberBalance, getPaymentHistory, getPayoutsForMember, getPayoutById,
  getMe, createCashRequest, getMyCashRequests, memberApproveCashRequest,
  getMyPaymentBatches,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField, { Input, Select } from '../../components/ui/FormField';
import {
  BookOpen, AlertTriangle, Trophy, CheckCircle, Banknote,
  Clock, UserCheck, ExternalLink, ChevronRight, PackageCheck,
  IndianRupee, Phone, ArrowRight, Layers, LayoutDashboard,
  TrendingUp, Wallet, CalendarCheck, Zap, ArrowUpRight, ThumbsUp, ThumbsDown,
  CreditCard, Filter, ArrowDownCircle, Building2,
} from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'Home',     icon: LayoutDashboard, color: '#1E3A5F', bg: '#EEF2F8' },
  { id: 'chits',    label: 'Chits',    icon: Layers,           color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'payouts',  label: 'Payouts',  icon: Trophy,           color: '#D4A017', bg: '#FEF9C3' },
  { id: 'payments', label: 'Payments', icon: CreditCard,       color: '#16A34A', bg: '#F0FDF4' },
  { id: 'requests', label: 'Pickups',  icon: Banknote,         color: '#EA580C', bg: '#FFF7ED' },
];

// ─── Status maps ──────────────────────────────────────────────────────────────

const CHIT_STATUS = {
  ACTIVE:    { label: 'Active',    dot: '#16A34A', badge: 'bg-green-100 text-green-700',  cardBg: '#F0FDF4', borderColor: '#86EFAC' },
  COMPLETED: { label: 'Completed', dot: '#6B7280', badge: 'bg-gray-100 text-gray-600',   cardBg: '#F9FAFB', borderColor: '#D1D5DB' },
  PAUSED:    { label: 'Paused',    dot: '#D97706', badge: 'bg-amber-100 text-amber-700', cardBg: '#FFFBEB', borderColor: '#FDE68A' },
  PENDING:   { label: 'Pending',   dot: '#2563EB', badge: 'bg-blue-100 text-blue-700',   cardBg: '#EFF6FF', borderColor: '#BFDBFE' },
  DRAFT:     { label: 'Draft',     dot: '#9CA3AF', badge: 'bg-gray-100 text-gray-500',   cardBg: '#F9FAFB', borderColor: '#E5E7EB' },
};

const PAYOUT_STATUS = {
  PENDING:             { label: 'Pending',   cls: 'bg-amber-100 text-amber-700' },
  PARTIALLY_DISBURSED: { label: 'Partial',   cls: 'bg-blue-100 text-blue-700' },
  DISBURSED:           { label: 'Disbursed', cls: 'bg-green-100 text-green-700' },
  CANCELLED:           { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  VOIDED:              { label: 'Voided',    cls: 'bg-red-100 text-red-600' },
};

const REQUEST_STATUS = {
  PENDING:              { label: 'Awaiting Staff',    cls: 'bg-amber-100 text-amber-700',   icon: Clock },
  SCHEDULED:            { label: 'Pickup Scheduled',  cls: 'bg-sky-100 text-sky-700',       icon: CalendarCheck },
  ASSIGNED:             { label: 'Staff Assigned',    cls: 'bg-blue-100 text-blue-700',     icon: UserCheck },
  PICKED_UP:            { label: 'Picked Up',         cls: 'bg-green-100 text-green-700',   icon: PackageCheck },
  PARTIALLY_COLLECTED:  { label: 'Approval Needed',   cls: 'bg-purple-100 text-purple-700', icon: AlertTriangle },
  COLLECTED:            { label: 'Handed to Admin',   cls: 'bg-gray-100 text-gray-600',     icon: Banknote },
  CANCELLED:            { label: 'Cancelled',         cls: 'bg-red-100 text-red-500',       icon: AlertTriangle },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utc(s) { return s ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null; }

// Handles both old Jackson array format [y,mo,d,h,mi,s] and ISO strings.
function parseTs(val) {
  if (!val) return null;
  if (Array.isArray(val)) {
    // Jackson array format [y,mo,d,h,mi,s] — server uses UTC, treat as UTC
    const [y, mo, d, h = 0, mi = 0, s = 0] = val;
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }
  const str = String(val);
  // No tz suffix → server LocalDateTime stored in UTC — append Z so browser converts to local (IST)
  if (!str.endsWith('Z') && !str.includes('+')) return new Date(str + 'Z');
  return new Date(str);
}

function isToday(date) {
  if (!date || isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(utc(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDt(d) {
  if (!d) return null;
  const dt = new Date(utc(d));
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    + ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Chit card (used in Chits tab + Overview) ─────────────────────────────────

function ChitCard({ memberId, chit, compact = false }) {
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();

  const { data: balance } = useQuery({
    queryKey: ['memberPortalBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['memberPortalHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const outstanding = Number(balance?.totalOutstanding ?? 0);
  const settled     = history.filter(r => ['SETTLED','WAIVED','PAYOUT_DEDUCTED','SETTLEMENT_CLEARED'].includes(r.status)).length;
  const total       = history.length;
  const overdue     = history.filter(r => r.overdue).length;
  const pct         = total > 0 ? Math.round((settled / total) * 100) : 0;
  const cs          = CHIT_STATUS[chit.status] ?? CHIT_STATUS.ACTIVE;
  const isAlert     = outstanding > 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/member/chits/${chit.id}`)}
        className="w-full text-left bg-white rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden focus:outline-none"
        style={{ borderColor: isAlert ? '#FECACA' : '#E5E7EB' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = isAlert ? '#FCA5A5' : '#CBD5E1'}
        onMouseLeave={e => e.currentTarget.style.borderColor = isAlert ? '#FECACA' : '#E5E7EB'}
      >
        <div className="h-0.5 w-full" style={{ backgroundColor: isAlert ? '#DC2626' : cs.dot }} />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#1E3A5F]">{chit.name}</p>
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium flex-shrink-0">
                  <AlertTriangle size={10} />{overdue}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: isAlert ? '#DC2626' : '#16A34A' }} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{settled}/{total}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {isAlert ? (
              <p className="text-sm font-bold text-red-600">{hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`}</p>
            ) : (
              <CheckCircle size={16} className="text-green-500 ml-auto" />
            )}
            <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1E3A5F] ml-auto mt-1" />
          </div>
        </div>
      </button>
    );
  }

  const accentColor = isAlert ? '#B91C1C' : cs.dot;
  const accentBg    = isAlert ? '#FFF9F9' : cs.cardBg;
  const accentBorder = isAlert ? '#FECACA' : cs.borderColor;

  return (
    <button
      type="button"
      onClick={() => navigate(`/member/chits/${chit.id}`)}
      className="w-full text-left flex flex-col rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden focus:outline-none hover:shadow-sm active:scale-[0.99]"
      style={{
        borderColor: accentBorder,
        backgroundColor: accentBg,
        borderLeftWidth: '4px',
        borderLeftColor: accentColor,
        padding: '20px 16px 18px 20px',
        minHeight: '140px',
      }}
    >
      {/* Top: progress bar + overdue */}
      <div className="flex items-center justify-between gap-2 w-full">
        {total > 0 ? (
          <div className="flex-1">
            <div className="w-full rounded-full h-1.5" style={{ backgroundColor: `${accentColor}30` }}>
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
            </div>
          </div>
        ) : <div className="flex-1" />}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {overdue > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
              <AlertTriangle size={9} /> {overdue}
            </span>
          )}
          <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1E3A5F] transition-colors" />
        </div>
      </div>

      {/* Spacer — pushes text to bottom */}
      <div className="flex-1" />

      {/* Bottom: name + stats */}
      <div className="w-full">
        <p
          className="text-base font-bold leading-snug mb-2"
          style={{ fontFamily: 'Merriweather, Georgia, serif', color: cs.dot }}
        >
          {chit.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          {isAlert ? (
            <div className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#B91C1C' }}>
              <AlertTriangle size={10} />
              {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#15803D' }}>
              <CheckCircle size={10} /> All clear
            </div>
          )}
          <div className="text-right flex-shrink-0">
            <span className="text-xs text-gray-400">{total > 0 ? `${settled}/${total} draws` : ''}</span>
            {chit.installmentAmount && (
              <span className="text-xs text-gray-400 block">{hidden ? '••' : `₹${Number(chit.installmentAmount).toLocaleString('en-IN')}/draw`}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ memberId, chits, totalOutstanding, onNewRequest, onSwitchTab }) {
  const { hidden } = useHiddenAmounts();
  const outstanding = Number(totalOutstanding);
  const activeChits = chits.filter(c => c.status === 'ACTIVE');
  const { data: requests = [] } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const { data: myPayouts = [] } = useQuery({
    queryKey: ['memberPortalPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const activeRequests = requests.filter(r => ['PENDING','SCHEDULED','ASSIGNED','PICKED_UP','PARTIALLY_COLLECTED'].includes(r.status));
  const needsAction = activeRequests.filter(r => r.status === 'PARTIALLY_COLLECTED');
  const today = new Date().toDateString();
  const todayPickups = activeRequests.filter(r => r.scheduledFor && new Date(r.scheduledFor + 'Z').toDateString() === today);
  const scheduledPickups = activeRequests.filter(r => r.status === 'SCHEDULED' && !todayPickups.find(t => t.id === r.id));

  return (
    <div className="space-y-8 pb-4">

      {/* ── Hero balance card ─────────────────────────────────────────── */}
      {outstanding > 0 ? (
        <div
          className="rounded-3xl overflow-hidden shadow-lg"
          style={{ background: 'linear-gradient(135deg, #7F1D1D 0%, #DC2626 100%)' }}
        >
          {/* Decorative orb */}
          <div style={{ position: 'relative', padding: '20px 20px 18px' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderTopLeftRadius: 24, borderTopRightRadius: 24 }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Outstanding Balance</p>
            <p className="text-3xl font-extrabold text-white leading-none" style={{ letterSpacing: '-0.02em' }}>
              {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Due across all your chits (active, paused & completed)
            </p>
            {onNewRequest && (
              <button
                type="button"
                onClick={onNewRequest}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-red-700 bg-white px-4 py-2 rounded-xl cursor-pointer hover:bg-red-50 transition-colors"
              >
                <Banknote size={14} /> Request Cash Pickup
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="rounded-3xl overflow-hidden shadow-md"
          style={{ background: 'linear-gradient(135deg, #14532D 0%, #16A34A 100%)' }}
        >
          <div style={{ position: 'relative', padding: '18px 20px 16px' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <CheckCircle size={16} className="text-white" />
              </div>
              <p className="text-base font-bold text-white">All Clear</p>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>No outstanding dues — you're fully up to date!</p>
          </div>
        </div>
      )}

      {/* ── Action needed banner ──────────────────────────────────────── */}
      {needsAction.length > 0 && (
        <button
          type="button"
          onClick={() => onSwitchTab('requests')}
          className="w-full text-left rounded-2xl px-5 py-4 flex items-center gap-4 border cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFEDD5' }}>
            <AlertTriangle size={18} style={{ color: '#EA580C' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#9A3412' }}>Action Required</p>
            <p className="text-xs mt-0.5" style={{ color: '#C2410C' }}>
              {needsAction.length} pickup{needsAction.length > 1 ? 's' : ''} need your approval
            </p>
          </div>
          <span
            className="text-xs font-semibold px-4 py-2 rounded-xl flex-shrink-0"
            style={{ backgroundColor: '#EA580C', color: '#fff' }}
          >
            Review
          </span>
        </button>
      )}

      {/* ── Pickup today card ─────────────────────────────────────────── */}
      {todayPickups.length > 0 && (
        <button
          type="button"
          onClick={() => onSwitchTab('requests')}
          className="w-full text-left rounded-2xl px-5 py-4 flex items-center gap-4 border cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #0C4A6E 0%, #0284C7 100%)', borderColor: '#0284C7' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <Banknote size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Cash Pickup Today</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {todayPickups.length} pickup{todayPickups.length > 1 ? 's' : ''} scheduled for today — staff will visit you
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 text-[#0284C7]" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
            View
          </span>
        </button>
      )}

      {/* ── Scheduled pickup card ─────────────────────────────────────── */}
      {scheduledPickups.length > 0 && (
        <button
          type="button"
          onClick={() => onSwitchTab('requests')}
          className="w-full text-left rounded-2xl px-5 py-4 flex items-center gap-4 border cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#E0F2FE' }}>
            <CalendarCheck size={18} style={{ color: '#0284C7' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#0C4A6E' }}>
              Pickup{scheduledPickups.length > 1 ? 's' : ''} Scheduled
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#0369A1' }}>
              {scheduledPickups.length} upcoming pickup{scheduledPickups.length > 1 ? 's' : ''} — staff to be assigned soon
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0" style={{ backgroundColor: '#0284C7', color: '#fff' }}>
            View
          </span>
        </button>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'Schedule Pickup',
              icon: Banknote,
              iconColor: '#1E3A5F',
              iconBg: '#EEF2F8',
              border: '#CBD5E1',
              description: 'Request a staff member to come collect your cash installment at your door.',
              onClick: onNewRequest,
            },
            {
              label: 'My Payouts',
              icon: Trophy,
              iconColor: '#B45309',
              iconBg: '#FEF3C7',
              border: '#FDE68A',
              description: 'View your chit draw winnings and track disbursement status.',
              onClick: () => onSwitchTab('payouts'),
            },
            {
              label: 'My Chits',
              icon: Layers,
              iconColor: '#6D28D9',
              iconBg: '#EDE9FE',
              border: '#DDD6FE',
              description: 'See all chit funds you are enrolled in, active or completed.',
              onClick: () => onSwitchTab('chits'),
            },
            {
              label: 'Cash Pickups',
              icon: Zap,
              iconColor: '#EA580C',
              iconBg: '#FFF7ED',
              border: '#FED7AA',
              description: 'Track your cash pickup requests and see who is assigned to collect.',
              onClick: () => onSwitchTab('requests'),
            },
          ].filter(({ onClick }) => onClick !== null).map(({ label, icon: Icon, iconColor, iconBg, border, description, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex flex-col items-start bg-white rounded-2xl border transition-all cursor-pointer hover:shadow-sm active:scale-[0.98] text-left"
              style={{ borderColor: border, padding: '20px 16px 18px 24px', minHeight: '140px' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <div className="flex-1" />
              <div>
                <p className="text-sm font-bold leading-tight text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
      <div className="h-2" />

      {/* ── Active chits ──────────────────────────────────────────────── */}
      {activeChits.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Active Chits
            </p>
            <button
              type="button"
              onClick={() => onSwitchTab('chits')}
              className="text-xs text-[#1E3A5F] font-semibold hover:underline cursor-pointer flex items-center gap-1"
            >
              See all <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {activeChits.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} compact />)}
          </div>
        </section>
      )}

      {/* ── Pending pickups ───────────────────────────────────────────── */}
      {activeRequests.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Active Pickups
          </p>
          <div className="space-y-3">
            {activeRequests.map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
              const Icon = meta.icon;
              const isScheduled = r.status === 'SCHEDULED';
              const isToday = r.scheduledFor && new Date(r.scheduledFor + 'Z').toDateString() === today;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-4 rounded-2xl border px-5 py-4 shadow-sm"
                  style={
                    isToday
                      ? { background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', borderColor: '#7DD3FC' }
                      : isScheduled
                      ? { backgroundColor: '#F8FAFF', borderColor: '#C7D2FE' }
                      : { backgroundColor: '#fff', borderColor: '#F3F4F6' }
                  }
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isToday ? '#BAE6FD' : isScheduled ? '#EEF2FF' : '#FEF3C7' }}
                  >
                    <Icon size={16} style={{ color: isToday ? '#0284C7' : isScheduled ? '#4F46E5' : '#D97706' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-gray-900">
                      {hidden ? '••••••' : `₹${Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN')}`}
                    </p>
                    {r.scheduledFor && (
                      <p className="text-xs mt-0.5" style={{ color: isToday ? '#0284C7' : '#6366F1' }}>
                        {isToday ? 'Today' : new Date(r.scheduledFor + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {isToday && r.scheduledFor && ` · ${new Date(r.scheduledFor + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                      </p>
                    )}
                    {!r.scheduledFor && r.requestedAt && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.requestedAt)}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {activeChits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#EEF2F8' }}>
            <BookOpen size={28} style={{ color: '#1E3A5F' }} />
          </div>
          <p className="text-base font-bold text-gray-800">No active chits yet</p>
          <p className="text-sm text-gray-400 mt-2 max-w-xs leading-relaxed">The admin will enroll you in a chit fund. Check back soon.</p>
        </div>
      )}
    </div>
  );
}

// ─── Chits tab ────────────────────────────────────────────────────────────────

function ChitsTab({ memberId, chits, chitsLoading }) {
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  if (chitsLoading) return <div className="py-10 flex justify-center"><PageSpinner /></div>;
  if (chits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#EEF2F8' }}>
          <BookOpen size={28} style={{ color: '#1E3A5F' }} />
        </div>
        <p className="text-gray-700 font-semibold text-base">No chits yet</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs">The admin will enroll you in a chit fund. Check back soon.</p>
      </div>
    );
  }
  const byDate = (a, b) => {
    const ta = a.startDate ? new Date(utc(a.startDate)).getTime() : 0;
    const tb = b.startDate ? new Date(utc(b.startDate)).getTime() : 0;
    return tb - ta; // latest first
  };
  const active    = chits.filter(c => c.status === 'ACTIVE').sort(byDate);
  const other     = chits.filter(c => c.status !== 'ACTIVE' && c.status !== 'COMPLETED').sort(byDate);
  const completed = chits.filter(c => c.status === 'COMPLETED').sort(byDate);
  const visibleCompleted = showAllCompleted ? completed : completed.slice(0, 2);

  function SectionHeader({ label, count, color, bg, border }) {
    return (
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-base font-bold" style={{ color, fontFamily: 'Merriweather, Georgia, serif' }}>{label}</span>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: bg, color, border: `1px solid ${border}` }}
        >
          {count}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: border }} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {active.length > 0 && (
        <section>
          <SectionHeader label="Active" count={active.length} color="#16A34A" bg="#F0FDF4" border="#BBF7D0" />
          <div className="space-y-3">{active.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <SectionHeader label="Other" count={other.length} color="#D97706" bg="#FFFBEB" border="#FDE68A" />
          <div className="space-y-3">{other.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <SectionHeader label="Completed" count={completed.length} color="#6B7280" bg="#F3F4F6" border="#E5E7EB" />
          <div className="space-y-3">{visibleCompleted.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
          {completed.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAllCompleted(v => !v)}
              className="w-full text-xs font-semibold text-gray-500 py-2.5 mt-1 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {showAllCompleted ? 'Show less' : `Show all ${completed.length} completed →`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Payout detail modal ──────────────────────────────────────────────────────

const MODE_ICON_MAP = { CASH: Banknote, UPI: CreditCard, BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2, BANK_TRANSFER: Building2 };

function MemberPayoutDetailModal({ payoutSummary, chitName, onClose }) {
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
  const { data: payout } = useQuery({
    queryKey: ['payout', payoutSummary.id],
    queryFn: () => getPayoutById(payoutSummary.id),
    initialData: payoutSummary,
  });
  const p = payout ?? payoutSummary;
  const disbursements = p.disbursements ?? [];
  const isDisbursed = p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED';
  const fmtD = (d) => d ? new Date(utc(d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <Modal title={`Payout — Draw #${p.monthNumber}`} onClose={onClose} size="lg">
      <div className="space-y-5 pb-2">
        {chitName && <p className="text-xs text-gray-500 -mt-4 mb-1">{chitName}</p>}

        {/* Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Payout Breakdown</p>
          </div>
          <div className="px-4 divide-y divide-gray-100">
            <div className="flex justify-between py-3.5">
              <p className="text-sm font-semibold text-gray-900">Winning Amount</p>
              <p className="text-sm font-bold text-gray-900">{h(p.winningAmount)}</p>
            </div>
            {Number(p.installmentSettlement ?? 0) > 0 && (
              <div className="flex justify-between items-start py-3.5">
                <div>
                  <p className="text-sm text-gray-600">Installment Withheld</p>
                  <p className="text-xs text-gray-400 mt-0.5">Draw #{p.monthNumber} installment</p>
                </div>
                <p className="text-sm text-red-600">− {h(p.installmentSettlement)}</p>
              </div>
            )}
            {Number(p.crossChitSettlement ?? 0) > 0 && (
              <div className="flex justify-between items-start py-3.5">
                <div>
                  <p className="text-sm text-gray-600">Cross-Chit Settlement</p>
                  <p className="text-xs text-gray-400 mt-0.5">Outstanding dues from other chits</p>
                </div>
                <p className="text-sm text-red-600">− {h(p.crossChitSettlement)}</p>
              </div>
            )}
            {Number(p.manualAdjustment ?? 0) > 0 && (
              <div className="flex justify-between py-3.5">
                <p className="text-sm text-gray-600">Manual Adjustment</p>
                <p className="text-sm text-red-600">− {h(p.manualAdjustment)}</p>
              </div>
            )}
            {Number(p.discountAmount ?? 0) > 0 && (
              <div className="flex justify-between py-3 bg-red-50 -mx-4 px-4">
                <p className="text-sm text-red-600 font-semibold">Total Withheld</p>
                <p className="text-sm font-bold text-red-600">− {h(p.discountAmount)}</p>
              </div>
            )}
            <div className="flex justify-between py-3.5 bg-gray-50 -mx-4 px-4">
              <p className="text-sm font-bold text-gray-900">Net Payout</p>
              <p className="text-base font-bold" style={{ color: '#1E3A5F' }}>{h(p.netPayoutAmount)}</p>
            </div>
          </div>
        </div>

        {/* Disbursements */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Disbursements</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Paid:</span>
              <span className="font-semibold text-green-700">{h(p.disbursedAmount)}</span>
              {Number(p.remainingAmount ?? 0) > 0 && (
                <span className="text-amber-600">· {h(p.remainingAmount)} pending</span>
              )}
            </div>
          </div>
          {disbursements.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-400 text-center">
              {isDisbursed ? 'No disbursement records' : 'Not yet disbursed'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {disbursements.map((d, i) => {
                const ModeIcon = MODE_ICON_MAP[d.mode] ?? Banknote;
                return (
                  <div key={d.id ?? i} className="flex items-center gap-3.5 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                      <ModeIcon size={14} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{h(d.amount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}</p>
                      {d.notes && <p className="text-xs text-gray-500 italic mt-0.5">{d.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">{fmtD(d.disbursedAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {p.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm text-amber-900">{p.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Payouts tab ──────────────────────────────────────────────────────────────

function PayoutsTab({ memberId, chits }) {
  const { hidden } = useHiddenAmounts();
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['memberPortalPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const chitNameById = Object.fromEntries(chits.map(c => [String(c.id), c.name]));

  const counts = {
    ALL:                 payouts.length,
    PENDING:             payouts.filter(p => p.status === 'PENDING').length,
    DISBURSED:           payouts.filter(p => p.status === 'DISBURSED').length,
    PARTIALLY_DISBURSED: payouts.filter(p => p.status === 'PARTIALLY_DISBURSED').length,
    CANCELLED:           payouts.filter(p => p.status === 'CANCELLED').length,
  };

  const disbursedPayouts = payouts.filter(p => p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED');
  const totalDisbursed   = disbursedPayouts.reduce((s, p) => s + Number(p.disbursedAmount ?? 0), 0);
  const pendingCount     = counts.PENDING;

  const FILTER_CHIPS = [
    { key: 'ALL',                 label: 'All' },
    { key: 'PENDING',             label: 'Pending' },
    { key: 'DISBURSED',           label: 'Disbursed' },
    { key: 'PARTIALLY_DISBURSED', label: 'Partial' },
    { key: 'CANCELLED',           label: 'Cancelled' },
  ].filter(f => f.key === 'ALL' || f.key === 'PENDING' || counts[f.key] > 0);

  const visible = filter === 'ALL' ? payouts : payouts.filter(p => p.status === filter);

  if (isLoading) return <div className="py-10 flex justify-center"><PageSpinner /></div>;

  if (payouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FEF3C7' }}>
          <Trophy size={28} style={{ color: '#D4A017' }} />
        </div>
        <p className="text-gray-700 font-semibold text-base">No won draws yet</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs">When you win a draw, your payout details will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total Disbursed header card */}
      <div
        className="rounded-3xl overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(90deg, #1E3A5F 0%, #2563EB 100%)' }}
      >
        <div style={{ position: 'relative', padding: '20px 20px 18px' }} className="flex items-center justify-between">
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Total Disbursed</p>
            <p className="text-3xl font-extrabold text-white leading-none" style={{ letterSpacing: '-0.02em' }}>
              {hidden ? '••••••' : `₹${totalDisbursed.toLocaleString('en-IN')}`}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {disbursedPayouts.length} payout{disbursedPayouts.length !== 1 ? 's' : ''}
              {pendingCount > 0 && ` · ${pendingCount} pending disbursement`}
            </p>
          </div>
          <Trophy size={32} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
        </div>
      </div>

      {/* Filter chips */}
      {FILTER_CHIPS.length > 1 && (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12, marginBottom: 12 }}>
          {FILTER_CHIPS.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-full cursor-pointer transition-all"
                style={{
                  padding: '6px 16px',
                  backgroundColor: active ? '#1E3A5F' : '#ffffff',
                  color: active ? '#ffffff' : '#374151',
                  border: active ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
                }}
              >
                {f.label}
                <span style={{ opacity: active ? 0.7 : 1, color: active ? '#ffffff' : '#9CA3AF' }}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Payout list */}
      <div className="space-y-3">
        {visible.map(p => {
          const ps = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.PENDING;
          const isDisbursed = p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className="w-full text-left bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-150 active:scale-[0.99] cursor-pointer focus:outline-none"
            >
              <div className="h-0.5 w-full" style={{ backgroundColor: isDisbursed ? '#16A34A' : '#D4A017' }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#1E3A5F' }}>
                      D{p.monthNumber}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{chitNameById[String(p.chitId)] ?? 'Chit'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Draw #{p.monthNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ps.cls}`}>{ps.label}</span>
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400">Won</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{hidden ? '••••••' : `₹${Number(p.winningAmount ?? 0).toLocaleString('en-IN')}`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Withheld</p>
                    <p className="text-sm font-semibold text-red-500 mt-0.5">{Number(p.discountAmount ?? 0) > 0 ? (hidden ? '••••••' : `− ₹${Number(p.discountAmount).toLocaleString('en-IN')}`) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Net</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: '#16A34A' }}>{hidden ? '••••••' : `₹${Number(p.netPayoutAmount ?? 0).toLocaleString('en-IN')}`}</p>
                  </div>
                </div>
                {p.disbursedAt && (
                  <p className="text-xs text-gray-400 mt-2">
                    Paid {new Date(utc(p.disbursedAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No {filter !== 'ALL' ? filter.toLowerCase().replace('_', ' ') : ''} payouts</p>
        )}
      </div>

      {selected && (
        <MemberPayoutDetailModal
          payoutSummary={selected}
          chitName={chitNameById[String(selected.chitId)] ?? 'Chit'}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── Cash trail modal ─────────────────────────────────────────────────────────

function CashTrailModal({ request, onClose }) {
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();
  const isDone = request.status === 'COLLECTED';
  const isCancelled = request.status === 'CANCELLED';
  const steps = [
    { icon: Clock,        label: 'Request Sent',    sub: 'Admin will assign a staff member',          time: request.requestedAt },
    { icon: UserCheck,    label: 'Staff Assigned',   sub: 'A staff member is on their way',            time: request.assignedAt },
    { icon: PackageCheck, label: 'Picked Up',        sub: 'Staff collected your cash',                 time: request.pickedUpAt },
    { icon: Banknote,     label: 'Handed to Admin',  sub: 'Payment credited to your account',          time: isDone ? (request.updatedAt ?? null) : null },
  ];
  const stepIndex = { PENDING: 0, SCHEDULED: 0, ASSIGNED: 1, PICKED_UP: 2, PARTIALLY_COLLECTED: 2, COLLECTED: 3, CANCELLED: -1 };
  const current = stepIndex[request.status] ?? 0;
  return (
    <Modal title="Cash Pickup Details" onClose={onClose} size="sm">
      <div className="space-y-4">
        {/* Amount + status header */}
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${isDone ? '#BBF7D0' : isCancelled ? '#FECACA' : '#C7D2FE'}` }}>
          <div className="h-1 w-full" style={{ backgroundColor: isDone ? '#16A34A' : isCancelled ? '#DC2626' : '#1E3A5F' }} />
          <div className="flex items-center gap-4 px-4 py-4" style={{ backgroundColor: isDone ? '#F0FDF4' : isCancelled ? '#FFF9F9' : '#F0F4FF' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: isDone ? '#DCFCE7' : isCancelled ? '#FEE2E2' : '#EEF2F8' }}>
              <Banknote size={18} style={{ color: isDone ? '#16A34A' : isCancelled ? '#DC2626' : '#1E3A5F' }} />
            </div>
            <div className="flex-1">
              <p className="text-xl font-extrabold text-gray-900">
                {hidden ? '••••••' : `₹${Number(request.collectedAmount ?? request.requestedAmount).toLocaleString('en-IN')}`}
              </p>
              {request.collectedAmount && Number(request.collectedAmount) !== Number(request.requestedAmount) && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Requested: {hidden ? '••••••' : `₹${Number(request.requestedAmount).toLocaleString('en-IN')}`}
                </p>
              )}
              {request.requestedAt && (
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(request.requestedAt)}</p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${REQUEST_STATUS[request.status]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
              {REQUEST_STATUS[request.status]?.label ?? request.status}
            </span>
          </div>
        </div>

        {request.notes && (
          <p className="text-xs text-gray-500 italic px-1">Note: "{request.notes}"</p>
        )}

        {/* Status timeline */}
        {isCancelled ? (
          <div className="px-4 py-4 rounded-xl bg-red-50 border border-red-100">
            <p className="text-sm font-semibold text-red-700">Request Cancelled</p>
            {request.adminNotes && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{request.adminNotes}</p>}
          </div>
        ) : (
          <div className="pt-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const done = i <= current;
              const isLast = i === steps.length - 1;
              return (
                <div key={i} className="flex gap-3.5">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: done ? '#EEF2F8' : '#F9FAFB', border: `2px solid ${done ? '#1E3A5F' : '#E5E7EB'}` }}>
                      <Icon size={15} style={{ color: done ? '#1E3A5F' : '#9CA3AF' }} />
                    </div>
                    {!isLast && <div className="w-0.5 my-1.5 flex-1" style={{ backgroundColor: done ? '#1E3A5F' : '#E5E7EB', minHeight: '24px' }} />}
                  </div>
                  <div className={`${isLast ? 'pb-1' : 'pb-5'} flex-1 min-w-0`}>
                    <p className={`text-sm font-semibold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.sub}</p>
                    {s.time && <p className="text-xs text-gray-400 mt-1.5 font-medium">{fmtDt(s.time)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View receipt button — shown when pickup is completed and a payment batch exists */}
        {isDone && request.collectedBatchId && (
          <button
            type="button"
            onClick={() => { onClose(); navigate(`/member/transactions/${request.collectedBatchId}`); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)' }}
          >
            <ExternalLink size={15} />
            View Payment Receipt
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Payments tab ─────────────────────────────────────────────────────────────

const PAYMENT_STATUS_STYLE = {
  COMPLETED:           { label: 'Paid',       cls: 'bg-green-100 text-green-700' },
  AWAITING_REMITTANCE: { label: 'Processing', cls: 'bg-amber-100 text-amber-700' },
  VOIDED:              { label: 'Voided',     cls: 'bg-red-100 text-red-600' },
};

const PAYMENT_MODE_META = {
  CASH: { icon: Banknote,   color: '#16A34A', bg: '#F0FDF4', label: 'Cash' },
  UPI:  { icon: CreditCard, color: '#7C3AED', bg: '#F5F3FF', label: 'UPI' },
  BANK: { icon: CreditCard, color: '#2563EB', bg: '#EFF6FF', label: 'Bank' },
  NEFT: { icon: CreditCard, color: '#2563EB', bg: '#EFF6FF', label: 'NEFT' },
  RTGS: { icon: CreditCard, color: '#2563EB', bg: '#EFF6FF', label: 'RTGS' },
  IMPS: { icon: CreditCard, color: '#2563EB', bg: '#EFF6FF', label: 'IMPS' },
};

const DATE_FILTERS = [
  { key: 'today',  label: 'Today' },
  { key: '7d',     label: '7 Days' },
  { key: '30d',    label: '30 Days' },
  { key: 'all',    label: 'All' },
];

function PaymentsTab() {
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();
  const [dateFilter, setDateFilter] = useState('today');
  const [modeFilter, setModeFilter] = useState('ALL');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['myPaymentBatches'],
    refetchOnWindowFocus: true,
    queryFn: getMyPaymentBatches,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    return batches.filter((b) => {
      const effectiveDate = parseTs(b.collectedAt ?? b.createdAt);
      const ts = effectiveDate?.getTime() ?? 0;
      if (dateFilter === 'today' && !isToday(effectiveDate)) return false;
      if (dateFilter === '7d' && ts < now - 7 * 86_400_000) return false;
      if (dateFilter === '30d' && ts < now - 30 * 86_400_000) return false;
      if (modeFilter !== 'ALL' && b.paymentMode !== modeFilter) return false;
      return true;
    });
  }, [batches, dateFilter, modeFilter]);

  const totalFiltered = filtered
    .filter((b) => b.status !== 'VOIDED')
    .reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);

  if (isLoading) return <div className="py-10 flex justify-center"><PageSpinner /></div>;

  return (
    <div className="space-y-5">
      {/* ── Summary card ──────────────────────────────────────────────── */}
      <div
        className="rounded-3xl overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' }}
      >
        <div style={{ position: 'relative', padding: '20px 20px 18px' }} className="flex items-center justify-between">
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              {dateFilter === 'today' ? 'Paid Today' : dateFilter === '7d' ? 'Paid (7 Days)' : dateFilter === '30d' ? 'Paid (30 Days)' : 'Total Paid'}
            </p>
            <p className="text-3xl font-extrabold text-white leading-none" style={{ letterSpacing: '-0.02em' }}>
              {hidden ? '••••••' : `₹${totalFiltered.toLocaleString('en-IN')}`}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <ArrowDownCircle size={32} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ marginTop: 12, marginBottom: 12 }}>
        {DATE_FILTERS.map((f) => {
          const active = dateFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setDateFilter(f.key)}
              className="flex-shrink-0 text-xs font-semibold rounded-full cursor-pointer transition-all"
              style={{
                padding: '6px 16px',
                backgroundColor: active ? '#1E3A5F' : '#ffffff',
                color: active ? '#ffffff' : '#374151',
                border: active ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
              }}
            >
              {f.label}
            </button>
          );
        })}
        <div className="w-px bg-gray-200 flex-shrink-0 mx-1" />
        <span className="flex-shrink-0 self-center text-xs font-medium text-gray-400">Mode:</span>
        {['ALL', 'CASH', 'UPI', 'BANK'].map((m) => {
          const meta = m !== 'ALL' ? PAYMENT_MODE_META[m] : null;
          const active = modeFilter === m;
          const MIcon = meta?.icon;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold rounded-full cursor-pointer transition-all whitespace-nowrap"
              style={{
                padding: '6px 16px',
                backgroundColor: active ? (meta?.color ?? '#1E3A5F') : '#ffffff',
                color: active ? '#ffffff' : (meta?.color ?? '#374151'),
                border: `1.5px solid ${active ? (meta?.color ?? '#1E3A5F') : '#D1D5DB'}`,
              }}
            >
              {MIcon && <MIcon size={12} />}
              {m === 'ALL' ? 'All' : meta?.label ?? m}
            </button>
          );
        })}
      </div>

      {/* ── Transaction list ──────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-14 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#EEF2F8' }}>
            <CreditCard size={24} style={{ color: '#1E3A5F' }} />
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {dateFilter === 'today' ? 'No payments today' : 'No payments found'}
          </p>
          <p className="text-xs text-gray-400">
            {dateFilter === 'today' ? 'Try "7 Days" or "All" to see older payments' : 'Try changing the date or mode filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => {
            const statusMeta = PAYMENT_STATUS_STYLE[b.status] ?? PAYMENT_STATUS_STYLE.COMPLETED;
            const modeMeta = PAYMENT_MODE_META[b.paymentMode] ?? PAYMENT_MODE_META.CASH;
            const ModeIcon = modeMeta.icon;
            const draws = b.allocations?.map((a) => a.monthNumber).filter(Boolean).sort((x, y) => x - y);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/member/transactions/${b.id}`)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 px-4 py-4 mx-1 my-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: modeMeta.bg }}>
                    <ModeIcon size={16} style={{ color: modeMeta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                        {hidden ? '••••••' : `₹${Number(b.totalAmount).toLocaleString('en-IN')}`}
                      </p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap" style={{ backgroundColor: modeMeta.bg, color: modeMeta.color }}>
                        {modeMeta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-gray-400 flex-shrink-0">{fmtDt(b.collectedAt ?? b.createdAt)}</p>
                      {draws?.length > 0 && (
                        <span className="text-xs text-[#1E3A5F] font-medium flex-shrink-0">
                          · Draw {draws.map((n) => `#${n}`).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Requests tab ─────────────────────────────────────────────────────────────

function RequestsTab({ memberId, chits, onNewRequest }) {
  const { hidden } = useHiddenAmounts();
  const [trail, setTrail] = useState(null);
  const [approvedChoice, setApprovedChoice] = useState({}); // requestId → true/false/null
  const [approveResult, setApproveResult] = useState({});   // requestId → 'success'|'error'
  const qc = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
    refetchInterval: 20_000,
  });
  const approveMutation = useMutation({
    mutationFn: ({ requestId, approved, reason }) => memberApproveCashRequest({ requestId, approved, reason }),
    onSuccess: (_, vars) => {
      setApproveResult(p => ({ ...p, [vars.requestId]: 'success' }));
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['myCashRequests'] });
      }, 1200);
    },
    onError: (_, vars) => {
      setApproveResult(p => ({ ...p, [vars.requestId]: 'error' }));
      setApprovedChoice(p => ({ ...p, [vars.requestId]: undefined }));
    },
  });
  if (isLoading) return <div className="py-10 flex justify-center"><PageSpinner /></div>;
  const active = requests.filter(r => ['PENDING','SCHEDULED','ASSIGNED','PICKED_UP','PARTIALLY_COLLECTED'].includes(r.status));
  const past   = requests.filter(r => !['PENDING','SCHEDULED','ASSIGNED','PICKED_UP','PARTIALLY_COLLECTED'].includes(r.status));
  const todayStr = new Date().toDateString();
  const scheduledToday = active.filter(r => r.scheduledFor && new Date(r.scheduledFor + 'Z').toDateString() === todayStr);
  const scheduledUpcoming = active.filter(r => r.status === 'SCHEDULED' && (!r.scheduledFor || new Date(r.scheduledFor + 'Z').toDateString() !== todayStr));
  const otherActive = active.filter(r => !scheduledToday.find(s => s.id === r.id) && !scheduledUpcoming.find(s => s.id === r.id));
  const hasChits = chits.some(c => ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(c.status));
  return (
    <div className="space-y-6">
      {hasChits && onNewRequest && (
        <button
          type="button"
          onClick={onNewRequest}
          className="w-full flex items-center justify-between px-5 py-5 rounded-2xl border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all duration-200 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2F8' }}>
              <Banknote size={18} style={{ color: '#1E3A5F' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-[#1E3A5F]">Request Cash Pickup</p>
              <p className="text-xs text-gray-400 mt-0.5">A staff member will come to collect from you</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-gray-300 group-hover:text-[#1E3A5F] transition-colors" />
        </button>
      )}
      {/* ── Today's pickups ──────────────────────────────────────────── */}
      {scheduledToday.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-sky-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-sky-600">Pickup Today · {scheduledToday.length}</p>
          </div>
          <div className="space-y-3">
            {scheduledToday.map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.SCHEDULED;
              const Icon = meta.icon;
              return (
                <button key={r.id} type="button" onClick={() => setTrail(r)}
                  className="w-full text-left rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md"
                  style={{ background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', borderColor: '#7DD3FC' }}
                >
                  <div className="h-1 w-full" style={{ backgroundColor: '#0284C7' }} />
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#BAE6FD' }}>
                        <Icon size={16} style={{ color: '#0284C7' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: '#0C4A6E' }}>{hidden ? '••••••' : `₹${Number(r.requestedAmount).toLocaleString('en-IN')}`}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#0369A1' }}>
                          Staff visits you today
                          {r.scheduledFor && ` · ${new Date(r.scheduledFor + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">{meta.label}</span>
                      <ChevronRight size={14} style={{ color: '#7DD3FC' }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Scheduled upcoming ────────────────────────────────────────── */}
      {scheduledUpcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-indigo-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Scheduled Pickup · {scheduledUpcoming.length}</p>
          </div>
          <div className="space-y-3">
            {scheduledUpcoming.map(r => (
              <button key={r.id} type="button" onClick={() => setTrail(r)}
                className="w-full text-left bg-white rounded-2xl border hover:shadow-sm transition-all cursor-pointer overflow-hidden"
                style={{ borderColor: '#C7D2FE' }}
              >
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                      <CalendarCheck size={16} style={{ color: '#4F46E5' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{hidden ? '••••••' : `₹${Number(r.requestedAmount).toLocaleString('en-IN')}`}</p>
                      <p className="text-xs text-indigo-500 mt-0.5">
                        {r.scheduledFor
                          ? `Scheduled · ${new Date(r.scheduledFor + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                          : 'Scheduled — date to be confirmed'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">Scheduled</span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Other active ──────────────────────────────────────────────── */}
      {otherActive.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Active · {otherActive.length}</p>
          </div>
          <div className="space-y-3">
            {otherActive.map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
              const Icon = meta.icon;
              if (r.status === 'PARTIALLY_COLLECTED') {
                const collected = Number(r.collectedAmount ?? 0);
                const requested = Number(r.requestedAmount ?? 0);
                const isPending = approveMutation.isPending && approveMutation.variables?.requestId === r.id;
                const choice = approvedChoice[r.id];
                const result = approveResult[r.id];

                if (result === 'success') {
                  return (
                    <div key={r.id} className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: choice ? '#BBF7D0' : '#FECACA' }}>
                      <div className="h-1 w-full" style={{ backgroundColor: choice ? '#16A34A' : '#DC2626' }} />
                      <div className="px-5 py-5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: choice ? '#F0FDF4' : '#FFF5F5' }}>
                          {choice ? <ThumbsUp size={15} style={{ color: '#15803D' }} /> : <ThumbsDown size={15} style={{ color: '#DC2626' }} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: choice ? '#15803D' : '#DC2626' }}>
                            {choice ? 'Approved — amount confirmed' : 'Rejected — a new pickup will be arranged'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{choice ? 'Admin will review and collect the payment' : 'Admin will arrange a new pickup for you'}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
                    <div className="px-5 pt-5 pb-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-100">
                          <AlertTriangle size={15} className="text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">Partial Collection — Confirm Amount</p>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                            Staff says they collected{' '}
                            <span className="font-semibold text-gray-700">{hidden ? '••••••' : `₹${collected.toLocaleString('en-IN')}`}</span>
                            {' '}of your{' '}
                            <span className="font-semibold text-gray-700">{hidden ? '••••••' : `₹${requested.toLocaleString('en-IN')}`}</span>
                            {' '}request. Is this correct?
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setApprovedChoice(p => ({ ...p, [r.id]: true }));
                            approveMutation.mutate({ requestId: r.id, approved: true });
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer"
                          style={
                            isPending && choice === true
                              ? { backgroundColor: '#15803D', color: '#fff', borderColor: '#15803D' }
                              : { backgroundColor: '#F0FDF4', color: '#15803D', borderColor: '#BBF7D0', opacity: isPending ? 0.4 : 1 }
                          }
                        >
                          <ThumbsUp size={13} />
                          {isPending && choice === true ? 'Submitting…' : 'Yes, correct'}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setApprovedChoice(p => ({ ...p, [r.id]: false }));
                            approveMutation.mutate({ requestId: r.id, approved: false });
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer"
                          style={
                            isPending && choice === false
                              ? { backgroundColor: '#B91C1C', color: '#fff', borderColor: '#B91C1C' }
                              : { backgroundColor: '#FFF7F7', color: '#B91C1C', borderColor: '#FECACA', opacity: isPending ? 0.4 : 1 }
                          }
                        >
                          <ThumbsDown size={13} />
                          {isPending && choice === false ? 'Submitting…' : 'No, incorrect'}
                        </button>
                      </div>
                      {result === 'error' && (
                        <p className="text-xs text-red-500 text-center">{approveMutation.error?.response?.data?.message ?? 'Something went wrong. Please try again.'}</p>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <button key={r.id} type="button" onClick={() => setTrail(r)}
                  className="w-full text-left bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50">
                        <Icon size={16} className="text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{hidden ? '••••••' : `₹${Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN')}`}</p>
                        {r.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3 px-1">History · {past.length}</p>
          <div className="space-y-2">
            {past.slice(0, 8).map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.COLLECTED;
              const displayAmt = r.collectedAmount ?? r.requestedAmount;
              const isDone = r.status === 'COLLECTED' && r.collectedBatchId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTrail(r)}
                  className="w-full flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-100 px-4 py-4 hover:border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isDone ? '#F0FDF4' : '#F9FAFB' }}>
                      {isDone
                        ? <CheckCircle size={14} className="text-green-500" />
                        : <Clock size={14} className="text-gray-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{hidden ? '••••••' : `₹${Number(displayAmt).toLocaleString('en-IN')}`}</p>
                      {r.requestedAt && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.requestedAt)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
                    <ChevronRight size={13} className="text-gray-300" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {active.length === 0 && past.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#EEF2F8' }}>
            <Clock size={24} style={{ color: '#1E3A5F' }} />
          </div>
          <p className="text-gray-600 font-semibold">No requests yet</p>
          <p className="text-xs text-gray-400 mt-1">Use the button above to request a cash pickup.</p>
        </div>
      )}
      {trail && <CashTrailModal request={trail} onClose={() => setTrail(null)} />}
    </div>
  );
}

// ─── Cash pickup modal ────────────────────────────────────────────────────────

function CashPickupModal({ memberId, chits, onClose }) {
  const qc = useQueryClient();
  const { hidden } = useHiddenAmounts();
  const [chitId, setChitId] = useState(chits[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);

  // Fetch balances for ALL chits in parallel — member sees every outstanding upfront
  const balanceResults = useQueries({
    queries: chits.map((c) => ({
      queryKey: ['member-balance-for-pickup', memberId, c.id],
      queryFn: () => getMemberBalance({ memberId, chitId: c.id }),
      staleTime: 30_000,
    })),
  });
  const balanceMap = Object.fromEntries(
    chits.map((c, i) => [
      c.id,
      balanceResults[i]?.data?.totalOutstanding != null ? Number(balanceResults[i].data.totalOutstanding) : null,
    ])
  );
  const outstanding = balanceMap[chitId] ?? null;
  const balanceFetching = balanceResults.some((r) => r.isFetching);

  const mutation = useMutation({
    mutationFn: createCashRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myCashRequests'] }); setDone(true); },
  });
  if (done) {
    return (
      <Modal title="Request Sent" onClose={onClose} size="sm">
        <div className="text-center py-6 space-y-5">
          <div className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto">
            <CheckCircle size={30} className="text-green-600" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">Request submitted!</p>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">An admin will assign a staff member to collect from you soon.</p>
          </div>
          <Button className="w-full" size="md" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Request Cash Pickup" onClose={onClose} size="md">
      <form
        onSubmit={e => {
          e.preventDefault();
          mutation.mutate({ chitId, requestedAmount: amount ? parseFloat(amount) : undefined, notes: notes || undefined });
        }}
        className="space-y-5"
      >
        <p className="text-sm text-gray-500 leading-relaxed">
          A staff member will visit you to collect your payment. You'll be notified once assigned.
        </p>
        <FormField label="Chit" required>
          <Select value={chitId} onChange={e => { setChitId(e.target.value); setAmount(''); }} required>
            {chits.map(c => {
              const bal = balanceMap[c.id];
              const balSuffix = bal === null ? '' : bal > 0 ? ` — ₹${bal.toLocaleString('en-IN')} due` : ' — No dues';
              const statusSuffix = c.status !== 'ACTIVE' ? ` (${c.status.charAt(0) + c.status.slice(1).toLowerCase()})` : '';
              return <option key={c.id} value={c.id}>{c.name}{statusSuffix}{balSuffix}</option>;
            })}
          </Select>
        </FormField>
        <FormField label="Amount (₹)" required>
          <Input
            type="number" min="1" step="1"
            placeholder={outstanding > 0 ? `e.g. ${outstanding}` : 'e.g. 5000'}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          {outstanding > 0 && (
            <button type="button" onClick={() => setAmount(String(outstanding))}
              className="mt-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
              Fill {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due →
            </button>
          )}
        </FormField>
        <FormField label="Note for staff (optional)">
          <Input placeholder="e.g. Available after 6 PM" value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
        {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.message ?? 'Submission failed'}</p>}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">Submit Request</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MemberPortalPage() {
  const { user: authUser, planExpiresAt } = useAuth();
  const isPlanExpired = planExpiresAt && new Date(planExpiresAt) < new Date();
  const { hidden } = useHiddenAmounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'overview';
  const [tab, setTab] = useState(initialTab);
  const [showCashRequest, setShowCashRequest] = useState(false);

  const switchTab = useCallback((id) => {
    setTab(id);
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true });
  }, [setSearchParams]);

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: userAccount } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
    refetchOnWindowFocus: true,
  });

  const { data: myChits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['portalChits', member?.id],
    queryFn: () => getChitsForMember(member.id),
    enabled: !!member?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['portalTotalBalance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!member?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  if (memberLoading) return (
    <div className="space-y-6 pb-8 animate-pulse">
      <div className="rounded-2xl bg-gray-100 h-40 w-full" />
      <div className="flex gap-2">
        {[1,2,3,4].map(i => <div key={i} className="flex-1 h-10 rounded-xl bg-gray-100" />)}
      </div>
      <div className="space-y-3">
        <div className="h-20 rounded-2xl bg-gray-100" />
        <div className="h-20 rounded-2xl bg-gray-100" />
      </div>
    </div>
  );

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: '#EEF2F8' }}>
          <BookOpen size={28} style={{ color: '#1E3A5F' }} />
        </div>
        <p className="text-gray-800 font-semibold text-base">No profile linked</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs leading-relaxed">
          Contact your chit fund admin to link your account to a member profile.
        </p>
      </div>
    );
  }

  const outstanding    = Number(totalOutstanding);
  const activeCount    = myChits.filter(c => c.status === 'ACTIVE').length;
  const completedCount = myChits.filter(c => c.status === 'COMPLETED').length;
  const chitsForRequest = myChits.filter(c => ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(c.status));
  const initials = (member.fullName ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 pb-10">
      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {/* Top row */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-base font-bold flex-shrink-0" style={{ backgroundColor: '#1E3A5F' }}>
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{member.fullName}</h2>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {userAccount?.username && <p className="text-xs text-gray-400">@{userAccount.username}</p>}
                {member.phone && (
                  <p className="flex items-center gap-1 text-xs text-gray-400">
                    <Phone size={10} />{member.phone}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 bg-white border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Outstanding</p>
            <p className="text-lg font-bold leading-tight" style={{ color: outstanding > 0 ? '#C0392B' : '#15803D' }}>
              {hidden ? '••••••' : (outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0')}
            </p>
            <p className="text-xs text-gray-400 mt-1">{outstanding > 0 ? 'Due now' : 'All clear'}</p>
          </div>
          <div className="rounded-xl p-4 bg-white border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Active</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">{activeCount}</p>
            <p className="text-xs text-gray-400 mt-1">{activeCount === 1 ? 'chit running' : 'chits running'}</p>
          </div>
          <div className="rounded-xl p-4 bg-white border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Completed</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">{completedCount}</p>
            <p className="text-xs text-gray-400 mt-1">{completedCount === 0 ? 'none yet' : 'finished'}</p>
          </div>
        </div>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl">
        {TABS.map(n => {
          const isActive = tab === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => switchTab(n.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all duration-200 cursor-pointer"
              style={isActive
                ? { backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                : { backgroundColor: 'transparent' }
              }
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
                style={isActive
                  ? { backgroundColor: n.bg }
                  : { backgroundColor: 'transparent' }
                }
              >
                <n.icon
                  size={17}
                  style={{ color: isActive ? n.color : '#9CA3AF', transition: 'color 0.2s' }}
                />
              </div>
              <span
                className="text-[10px] font-semibold leading-none"
                style={{ color: isActive ? n.color : '#9CA3AF', transition: 'color 0.2s' }}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <OverviewTab
          memberId={member.id}
          chits={myChits}
          totalOutstanding={totalOutstanding}
          onNewRequest={isPlanExpired ? null : () => setShowCashRequest(true)}
          onSwitchTab={switchTab}
        />
      )}
      {tab === 'chits' && <ChitsTab memberId={member.id} chits={myChits} chitsLoading={chitsLoading} />}
      {tab === 'payouts' && <PayoutsTab memberId={member.id} chits={myChits} />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'requests' && <RequestsTab memberId={member.id} chits={myChits} onNewRequest={isPlanExpired ? null : () => setShowCashRequest(true)} />}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCashRequest && !isPlanExpired && outstanding > 0 && (
        <CashPickupModal memberId={member.id} chits={chitsForRequest} onClose={() => setShowCashRequest(false)} />
      )}
      {showCashRequest && !isPlanExpired && outstanding <= 0 && (
        <Modal title="No Outstanding Balance" onClose={() => setShowCashRequest(false)} size="sm">
          <p className="text-sm text-gray-600">You have no outstanding dues at the moment. Cash pickups are only needed when you have a pending balance.</p>
          <div className="flex justify-end mt-4">
            <Button variant="secondary" onClick={() => setShowCashRequest(false)}>Close</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Exported shared content (used by AdminMemberViewPage) ────────────────────

export function MemberPortalContent({ memberId }) {
  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['portalChits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });
  const [tab, setTab] = useState('chits');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'chits',    label: 'My Chits',  icon: Layers },
          { id: 'payouts',  label: 'Payouts',   icon: Trophy },
          { id: 'requests', label: 'Requests',  icon: Banknote },
        ].map(n => (
          <button key={n.id} type="button" onClick={() => setTab(n.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-all duration-200 cursor-pointer ${
              tab === n.id ? 'bg-white text-[#1E3A5F] shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <n.icon size={13} />{n.label}
          </button>
        ))}
      </div>
      {tab === 'chits' && <ChitsTab memberId={memberId} chits={chits} chitsLoading={chitsLoading} />}
      {tab === 'payouts' && <PayoutsTab memberId={memberId} chits={chits} />}
      {tab === 'requests' && <RequestsTab memberId={memberId} chits={chits} onNewRequest={() => {}} />}
    </div>
  );
}
