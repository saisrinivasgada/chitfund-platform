import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getMyMemberProfile, getChitsForMember, getMemberTotalBalance,
  getMemberBalance, getPaymentHistory, getPayoutsForMember,
  getMe, createCashRequest, getMyCashRequests,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField, { Input, Select } from '../../components/ui/FormField';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import {
  BookOpen, AlertTriangle, Trophy, CheckCircle, Pencil, Banknote,
  Clock, UserCheck, ExternalLink, ChevronRight, PackageCheck,
  IndianRupee, Phone, ArrowRight, Layers, LayoutDashboard,
  TrendingUp, Wallet, CalendarCheck, Zap, ArrowUpRight,
} from 'lucide-react';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'chits',    label: 'My Chits',  icon: Layers },
  { id: 'payouts',  label: 'Payouts',   icon: Trophy },
  { id: 'requests', label: 'Requests',  icon: Banknote },
];

// ─── Status maps ──────────────────────────────────────────────────────────────

const CHIT_STATUS = {
  ACTIVE:    { label: 'Active',    dot: '#16A34A', badge: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completed', dot: '#6B7280', badge: 'bg-gray-100 text-gray-600' },
  PAUSED:    { label: 'Paused',    dot: '#D97706', badge: 'bg-amber-100 text-amber-700' },
  PENDING:   { label: 'Pending',   dot: '#2563EB', badge: 'bg-blue-100 text-blue-700' },
  DRAFT:     { label: 'Draft',     dot: '#9CA3AF', badge: 'bg-gray-100 text-gray-500' },
};

const PAYOUT_STATUS = {
  PENDING:             { label: 'Pending',   cls: 'bg-amber-100 text-amber-700' },
  PARTIALLY_DISBURSED: { label: 'Partial',   cls: 'bg-blue-100 text-blue-700' },
  DISBURSED:           { label: 'Disbursed', cls: 'bg-green-100 text-green-700' },
  CANCELLED:           { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  VOIDED:              { label: 'Voided',    cls: 'bg-red-100 text-red-600' },
};

const REQUEST_STATUS = {
  PENDING:   { label: 'Awaiting Worker',  cls: 'bg-amber-100 text-amber-700',  icon: Clock },
  ASSIGNED:  { label: 'Worker Assigned',  cls: 'bg-blue-100 text-blue-700',    icon: UserCheck },
  PICKED_UP: { label: 'Picked Up',        cls: 'bg-green-100 text-green-700',  icon: PackageCheck },
  COLLECTED: { label: 'Handed to Admin',  cls: 'bg-gray-100 text-gray-600',    icon: Banknote },
  CANCELLED: { label: 'Cancelled',        cls: 'bg-red-100 text-red-500',      icon: AlertTriangle },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDt(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    + ' · ' + new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Chit card (used in Chits tab + Overview) ─────────────────────────────────

function ChitCard({ memberId, chit, compact = false }) {
  const navigate = useNavigate();

  const { data: balance } = useQuery({
    queryKey: ['memberPortalBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['memberPortalHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
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
              <p className="text-sm font-bold text-red-600">₹{outstanding.toLocaleString('en-IN')}</p>
            ) : (
              <CheckCircle size={16} className="text-green-500 ml-auto" />
            )}
            <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1E3A5F] ml-auto mt-1" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/member/chits/${chit.id}`)}
      className="w-full text-left bg-white rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
      style={{ borderColor: isAlert ? '#FECACA' : '#E5E7EB' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = isAlert ? '#FCA5A5' : '#CBD5E1'}
      onMouseLeave={e => e.currentTarget.style.borderColor = isAlert ? '#FECACA' : '#E5E7EB'}
    >
      <div className="h-1 w-full" style={{ backgroundColor: isAlert ? '#DC2626' : cs.dot }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1E3A5F] transition-colors truncate">{chit.name}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cs.badge}`}>{cs.label}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-400">₹{Number(chit.installmentAmount ?? 0).toLocaleString('en-IN')}/mo</span>
              {chit.durationMonths && <span className="text-xs text-gray-400">{chit.durationMonths} months</span>}
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                  <AlertTriangle size={10} />{overdue} overdue
                </span>
              )}
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-[#1E3A5F] transition-colors flex-shrink-0 mt-0.5" />
        </div>
        {total > 0 && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-400">{settled}/{total} months settled</span>
              <span className="text-xs font-semibold" style={{ color: isAlert ? '#DC2626' : '#16A34A' }}>{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: isAlert ? '#DC2626' : '#16A34A' }} />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          {isAlert ? (
            <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              ₹{outstanding.toLocaleString('en-IN')} outstanding
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              <CheckCircle size={11} />All clear
            </div>
          )}
          <span className="text-xs text-gray-400">₹{Number(chit.chitValue ?? 0).toLocaleString('en-IN')} total</span>
        </div>
      </div>
    </button>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ memberId, chits, totalOutstanding, onNewRequest, onSwitchTab }) {
  const navigate = useNavigate();
  const outstanding = Number(totalOutstanding);
  const activeChits = chits.filter(c => c.status === 'ACTIVE');
  const { data: requests = [] } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
  });
  const activeRequests = requests.filter(r => ['PENDING','ASSIGNED','PICKED_UP'].includes(r.status));

  return (
    <div className="space-y-5">
      {/* Outstanding alert or clear badge */}
      {outstanding > 0 ? (
        <div
          className="rounded-2xl p-4 border border-red-200 flex items-center gap-4"
          style={{ backgroundColor: '#FFF5F5' }}
        >
          <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">Outstanding Balance</p>
            <p className="text-2xl font-extrabold text-red-600 leading-tight mt-0.5">
              ₹{outstanding.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-red-500 mt-0.5">Payment due across {activeChits.length} active chit{activeChits.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            type="button"
            onClick={onNewRequest}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-2 rounded-xl cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#DC2626' }}
          >
            <Banknote size={14} />Pay Cash
          </button>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4 border border-green-200 flex items-center gap-3"
          style={{ backgroundColor: '#F0FDF4' }}
        >
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-green-700">All Clear</p>
            <p className="text-xs text-green-600 mt-0.5">No outstanding dues — you're up to date!</p>
          </div>
        </div>
      )}

      {/* Active chits */}
      {activeChits.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Active Chits · {activeChits.length}
            </p>
            <button
              type="button"
              onClick={() => onSwitchTab('chits')}
              className="text-xs text-[#1E3A5F] font-medium hover:underline cursor-pointer flex items-center gap-1"
            >
              View all <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {activeChits.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} compact />)}
          </div>
        </section>
      )}

      {/* Active cash requests */}
      {activeRequests.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-0.5">
            Pending Pickups · {activeRequests.length}
          </p>
          <div className="space-y-2">
            {activeRequests.map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
              const Icon = meta.icon;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 bg-white rounded-xl border border-amber-200 px-4 py-3"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 flex-shrink-0">
                    <Icon size={15} style={{ color: '#D97706' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">₹{Number(r.requestedAmount).toLocaleString('en-IN')}</p>
                    {r.requestedAt && <p className="text-xs text-gray-400">{fmtDate(r.requestedAt)}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-0.5">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onNewRequest}
            className="flex flex-col items-start gap-2 p-4 bg-white rounded-2xl border border-gray-200 hover:border-[#1E3A5F] hover:bg-[#F5F8FF] transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF2F8' }}>
              <Banknote size={17} style={{ color: '#1E3A5F' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-[#1E3A5F]">Pay Cash</p>
              <p className="text-xs text-gray-400">Request pickup</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('payouts')}
            className="flex flex-col items-start gap-2 p-4 bg-white rounded-2xl border border-gray-200 hover:border-[#D4A017] hover:bg-[#FFFDF0] transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
              <Trophy size={17} style={{ color: '#D4A017' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-[#B45309]">My Payouts</p>
              <p className="text-xs text-gray-400">Won draws</p>
            </div>
          </button>
        </div>
      </section>

      {/* Empty — no active chits */}
      {activeChits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-2xl border border-gray-100">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#EEF2F8' }}>
            <BookOpen size={24} style={{ color: '#1E3A5F' }} />
          </div>
          <p className="text-gray-700 font-semibold">No active chits</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">The admin will enroll you in a chit fund. Check back soon.</p>
        </div>
      )}
    </div>
  );
}

// ─── Chits tab ────────────────────────────────────────────────────────────────

function ChitsTab({ memberId, chits, chitsLoading }) {
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
  const active    = chits.filter(c => c.status === 'ACTIVE');
  const other     = chits.filter(c => c.status !== 'ACTIVE' && c.status !== 'COMPLETED');
  const completed = chits.filter(c => c.status === 'COMPLETED');
  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">Active · {active.length}</p>
          <div className="space-y-3">{active.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">Other · {other.length}</p>
          <div className="space-y-3">{other.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">Completed · {completed.length}</p>
          <div className="space-y-3">{completed.map(c => <ChitCard key={c.id} memberId={memberId} chit={c} />)}</div>
        </section>
      )}
    </div>
  );
}

// ─── Payouts tab ──────────────────────────────────────────────────────────────

function PayoutsTab({ memberId, chits }) {
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['memberPortalPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });
  const chitNameById = Object.fromEntries(chits.map(c => [c.id, c.name]));
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
    <div className="space-y-3">
      {payouts.map(p => {
        const ps = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.PENDING;
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
            <div className="h-1 w-full" style={{ backgroundColor: '#D4A017' }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                    D{p.monthNumber}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{chitNameById[p.chitId] ?? 'Chit'} — Draw {p.monthNumber}</p>
                    {p.disbursedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Paid {new Date(p.disbursedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${ps.cls}`}>{ps.label}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Won</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">₹{Number(p.winningAmount ?? 0).toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Discount</p>
                  <p className="text-sm font-semibold text-gray-600 mt-0.5">₹{Number(p.discountAmount ?? 0).toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Net Payout</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: '#16A34A' }}>₹{Number(p.netPayoutAmount ?? 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cash trail modal ─────────────────────────────────────────────────────────

function CashTrailModal({ request, onClose }) {
  const steps = [
    { icon: Clock,        label: 'Request Sent',    sub: 'Admin will assign a worker',               time: request.requestedAt },
    { icon: UserCheck,    label: 'Worker Assigned',  sub: 'A worker is on their way',                 time: request.assignedAt },
    { icon: PackageCheck, label: 'Picked Up',        sub: 'Worker collected your cash',               time: request.pickedUpAt },
    { icon: Banknote,     label: 'Handed to Admin',  sub: 'Payment is being credited to your account', time: request.status === 'COLLECTED' ? (request.updatedAt ?? null) : null },
  ];
  const stepIndex = { PENDING: 0, ASSIGNED: 1, PICKED_UP: 2, COLLECTED: 3, CANCELLED: -1 };
  const current = stepIndex[request.status] ?? 0;
  return (
    <Modal title="Cash Pickup Status" onClose={onClose} size="sm">
      <div className="mb-4 p-3 rounded-xl" style={{ backgroundColor: '#F8FAFF', border: '1px solid #E8EEFF' }}>
        <p className="text-base font-bold text-gray-900">₹{Number(request.requestedAmount).toLocaleString('en-IN')}</p>
        {request.notes && <p className="text-xs text-gray-400 mt-0.5 italic">"{request.notes}"</p>}
      </div>
      {request.status === 'CANCELLED' ? (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-sm font-semibold text-red-700">Request Cancelled</p>
          {request.adminNotes && <p className="text-xs text-gray-500 mt-1">{request.adminNotes}</p>}
        </div>
      ) : (
        <div>
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done = i <= current;
            const isLast = i === steps.length - 1;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: done ? '#EEF2F8' : '#F9FAFB', border: `2px solid ${done ? '#1E3A5F' : '#E5E7EB'}` }}>
                    <Icon size={14} style={{ color: done ? '#1E3A5F' : '#9CA3AF' }} />
                  </div>
                  {!isLast && <div className="w-0.5 my-1 flex-1" style={{ backgroundColor: done ? '#1E3A5F' : '#E5E7EB', minHeight: '20px' }} />}
                </div>
                <div className="pb-4 flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                  {s.time && <p className="text-xs text-gray-400 mt-1 font-medium">{fmtDt(s.time)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Requests tab ─────────────────────────────────────────────────────────────

function RequestsTab({ memberId, chits, onNewRequest }) {
  const [trail, setTrail] = useState(null);
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
  });
  if (isLoading) return <div className="py-10 flex justify-center"><PageSpinner /></div>;
  const active = requests.filter(r => ['PENDING','ASSIGNED','PICKED_UP'].includes(r.status));
  const past   = requests.filter(r => !['PENDING','ASSIGNED','PICKED_UP'].includes(r.status));
  const activeChits = chits.filter(c => c.status === 'ACTIVE');
  return (
    <div className="space-y-6">
      {activeChits.length > 0 && (
        <button
          type="button"
          onClick={onNewRequest}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-dashed border-[#1E3A5F]/30 hover:border-[#1E3A5F] hover:bg-[#F5F8FF] transition-all duration-200 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2F8' }}>
              <Banknote size={18} style={{ color: '#1E3A5F' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-[#1E3A5F]">Request Cash Pickup</p>
              <p className="text-xs text-gray-400 mt-0.5">A worker will come to collect from you</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-gray-300 group-hover:text-[#1E3A5F] transition-colors" />
        </button>
      )}
      {active.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">Active · {active.length}</p>
          <div className="space-y-3">
            {active.map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
              const Icon = meta.icon;
              return (
                <button key={r.id} type="button" onClick={() => setTrail(r)}
                  className="w-full text-left bg-white rounded-2xl border border-amber-200 hover:border-amber-300 transition-colors cursor-pointer overflow-hidden"
                >
                  <div className="h-1 w-full bg-amber-400" />
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFFBEB' }}>
                        <Icon size={16} style={{ color: '#D97706' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">₹{Number(r.requestedAmount).toLocaleString('en-IN')}</p>
                        {r.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">History · {past.length}</p>
          <div className="space-y-2">
            {past.slice(0, 10).map(r => {
              const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.COLLECTED;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">₹{Number(r.requestedAmount).toLocaleString('en-IN')}</p>
                    {r.requestedAt && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.requestedAt)}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
                </div>
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
  const activeChits = chits.filter(c => c.status === 'ACTIVE');
  const [chitId, setChitId] = useState(activeChits[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: createCashRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myCashRequests'] }); setDone(true); },
  });
  if (done) {
    return (
      <Modal title="Request Sent" onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <div>
            <p className="text-gray-800 font-semibold">Request submitted!</p>
            <p className="text-sm text-gray-500 mt-1">An admin will assign a worker to collect from you soon.</p>
          </div>
          <Button className="w-full" onClick={onClose}>Done</Button>
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
          A worker will visit you to collect your payment. You'll be notified once assigned.
        </p>
        <FormField label="Chit Fund" required>
          <Select value={chitId} onChange={e => setChitId(e.target.value)} required>
            {activeChits.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Amount (₹)" required>
          <Input type="number" min="1" step="1" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} required />
        </FormField>
        <FormField label="Note for worker (optional)">
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
  const { user: authUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'overview';
  const [tab, setTab] = useState(initialTab);
  const [showEdit, setShowEdit]             = useState(false);
  const [showCashRequest, setShowCashRequest] = useState(false);
  const [showHistory, setShowHistory]       = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const switchTab = useCallback((id) => {
    setTab(id);
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true });
  }, [setSearchParams]);

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
    retry: false,
  });

  const { data: userAccount } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
  });

  const { data: myChits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['portalChits', member?.id],
    queryFn: () => getChitsForMember(member.id),
    enabled: !!member?.id,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['portalTotalBalance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!member?.id,
  });

  if (memberLoading) return <PageSpinner />;

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
  const activeChitsForRequest = myChits.filter(c => c.status === 'ACTIVE');
  const initials = (member.fullName ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5 pb-8">
      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-lg relative" style={{ backgroundColor: '#1E3A5F' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 85% 15%, rgba(212,160,23,0.2) 0%, transparent 55%)' }} />
        <div className="relative p-5">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                {initials}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: 'Merriweather, serif' }}>
                  {member.fullName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {userAccount?.username && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>@{userAccount.username}</p>}
                  {member.phone && (
                    <p className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <Phone size={10} />{member.phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={() => setShowHistory(true)} className="p-2 rounded-xl cursor-pointer" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }} title="Profile history">
                <Clock size={14} />
              </button>
              <button type="button" onClick={() => setShowEdit(true)} className="p-2 rounded-xl cursor-pointer" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }} title="Edit profile">
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl px-3 py-3 flex flex-col gap-1" style={{ backgroundColor: outstanding > 0 ? 'rgba(220,38,38,0.2)' : 'rgba(22,163,74,0.15)', border: `1px solid ${outstanding > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.25)'}` }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Outstanding</p>
              <p className={`text-base font-bold leading-tight ${outstanding > 0 ? 'text-red-300' : 'text-green-300'}`}>
                {outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{outstanding > 0 ? 'Due now' : 'All clear'}</p>
            </div>
            <div className="rounded-xl px-3 py-3 flex flex-col gap-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Active</p>
              <p className="text-base font-bold text-white leading-tight">{activeCount}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{activeCount === 1 ? 'chit running' : 'chits running'}</p>
            </div>
            <div className="rounded-xl px-3 py-3 flex flex-col gap-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Completed</p>
              <p className="text-base font-bold text-white leading-tight">{completedCount}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{completedCount === 0 ? 'none yet' : 'finished'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => switchTab(n.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
              tab === n.id ? 'bg-white text-[#1E3A5F] shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <n.icon size={13} />
            <span className="hidden sm:inline">{n.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <OverviewTab
          memberId={member.id}
          chits={myChits}
          totalOutstanding={totalOutstanding}
          onNewRequest={() => setShowCashRequest(true)}
          onSwitchTab={switchTab}
        />
      )}
      {tab === 'chits' && <ChitsTab memberId={member.id} chits={myChits} chitsLoading={chitsLoading} />}
      {tab === 'payouts' && <PayoutsTab memberId={member.id} chits={myChits} />}
      {tab === 'requests' && <RequestsTab memberId={member.id} chits={myChits} onNewRequest={() => setShowCashRequest(true)} />}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showHistory && (
        <Modal title="Profile Change History" onClose={() => setShowHistory(false)} size="md">
          <ProfileChangeHistory key={historyVersion} userId={userAccount?.id} inline />
        </Modal>
      )}
      {showEdit && (
        <EditProfileModal
          onClose={() => { setShowEdit(false); setHistoryVersion(v => v + 1); }}
          role="MEMBER"
          currentUser={{ username: userAccount?.username, email: userAccount?.email }}
          currentMember={{ fullName: member.fullName, phone: member.phone, email: member.email, address: member.address, city: member.city }}
          userId={userAccount?.id}
        />
      )}
      {showCashRequest && activeChitsForRequest.length > 0 && (
        <CashPickupModal memberId={member.id} chits={activeChitsForRequest} onClose={() => setShowCashRequest(false)} />
      )}
      {showCashRequest && activeChitsForRequest.length === 0 && (
        <Modal title="No Active Chits" onClose={() => setShowCashRequest(false)} size="sm">
          <p className="text-sm text-gray-600">You don't have any active chit funds to make a cash payment for.</p>
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
