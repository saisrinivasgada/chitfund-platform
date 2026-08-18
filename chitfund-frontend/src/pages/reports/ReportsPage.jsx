import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getChit, getMembers, getMember,
  getChitsForMember, getMemberTotalBalance,
  getPaymentHistory, getPayoutsForMember, getMemberSettlements,
  getAllPaymentBatches, getAllPayouts,
  getPayoutsByChit, getDraws, getDrawPayments, getPaymentBatches,
  getCollectionsReport, getMembersReport, getPayoutsReport,
  getWalletBalance, getWalletTransactions,
  listStaff, getPayoutById, getPaymentBatchById,
} from '../../services/api';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { Select, Input } from '../../components/ui/FormField';
import { ListSkeleton } from '../../components/ui/Spinner';
import {
  BarChart2, DollarSign, Users, Banknote,
  Download, Filter, Printer, ChevronDown, ChevronRight,
  Wallet, AlertCircle, TrendingUp, TrendingDown, FileText, ExternalLink, Layers,
  User, Building2, Hash, Calendar, IndianRupee, CheckCircle, Clock, XCircle, CreditCard,
  ArrowLeftRight, Tag, X,
} from 'lucide-react';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const str = String(d);
  // Date-only strings (YYYY-MM-DD) must be local, not UTC midnight (which shifts by timezone)
  const dt = str.length === 10
    ? new Date(str + 'T00:00:00')
    : new Date(str.endsWith('Z') || str.includes('+') ? str : str + 'Z');
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d.endsWith('Z') ? d : d + 'Z');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

function AdjCell({ p }) {
  const cross   = Number(p.crossChitSettlement ?? 0);
  const manual  = Number(p.manualAdjustment ?? 0);
  const instmt  = Number(p.installmentSettlement ?? 0);
  const hasAdj  = cross > 0 || manual !== 0 || instmt > 0;
  if (!hasAdj) return <span className="text-gray-300">—</span>;
  const parts = [];
  if (cross  > 0)    parts.push(`Cross-chit: ${fmt(cross)}`);
  if (instmt > 0)    parts.push(`Instmt: ${fmt(instmt)}`);
  if (manual !== 0)  parts.push(`Manual: ${manual < 0 ? '-' : '+'}${fmt(Math.abs(manual))}`);
  return (
    <span title={parts.join(' · ')} className="inline-flex items-center gap-1 text-indigo-600 font-semibold cursor-help">
      <Layers size={11} />✓
    </span>
  );
}

// Computes "MMM YYYY" for draw #N given chit start date
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function drawMonthLabel(startDate, monthNumber) {
  if (!startDate || !monthNumber) return '';
  const d = new Date(startDate + (startDate.length === 10 ? 'T00:00:00' : ''));
  d.setDate(1);
  d.setMonth(d.getMonth() + (Number(monthNumber) - 1));
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function drawLabel(startDate, monthNumber) {
  const ml = drawMonthLabel(startDate, monthNumber);
  return `#${monthNumber}${ml ? ` (${ml})` : ''}`;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

function useSessionState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch { return defaultValue; }
  });
  const setAndPersist = useCallback((newVal) => {
    setValue((prev) => {
      const next = typeof newVal === 'function' ? newVal(prev) : newVal;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [value, setAndPersist];
}

// ─── Country code → flag ──────────────────────────────────────────────────────
const CC_FLAGS = {
  '+91': '🇮🇳', '+1': '🇺🇸', '+44': '🇬🇧', '+971': '🇦🇪', '+61': '🇦🇺',
  '+65': '🇸🇬', '+60': '🇲🇾', '+966': '🇸🇦', '+974': '🇶🇦', '+968': '🇴🇲',
  '+973': '🇧🇭', '+965': '🇰🇼', '+49': '🇩🇪', '+33': '🇫🇷', '+64': '🇳🇿',
  '+31': '🇳🇱', '+353': '🇮🇪', '+27': '🇿🇦', '+234': '🇳🇬', '+254': '🇰🇪',
};
const countryFlag = (code) => CC_FLAGS[code] ?? '🌐';

// ─── Member Picker Modal ──────────────────────────────────────────────────────
function MemberPickerModal({ members, value, onChange, onClose }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.toLowerCase();
  const filtered = members.filter((m) =>
    !q ||
    (m.fullName ?? '').toLowerCase().includes(q) ||
    (m.phone ?? '').includes(q) ||
    (m.city ?? '').toLowerCase().includes(q)
  );
  const sorted = [...filtered].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Users size={16} className="text-[#1E3A5F]" />
          <span className="font-semibold text-gray-800 flex-1">Select Member</span>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white">✕</button>
        </div>
        {/* Search */}
        <div className="border-b border-gray-100" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12 }}>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or city…"
            className="w-full border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:border-[#1E3A5F]"
            style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}
          />
        </div>
        {/* List */}
        <div className="overflow-y-auto flex-1" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-gray-400" style={{ paddingTop: 32, paddingBottom: 32 }}>No members found</p>
          ) : sorted.map((m) => {
            const flag = countryFlag(m.phoneCountryCode ?? '+91');
            const isSelected = String(m.id) === String(value);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { onChange(String(m.id)); onClose(); }}
                className={`w-full flex items-center gap-3 text-left transition-colors cursor-pointer ${isSelected ? '' : 'hover:bg-blue-50'}`}
                style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10, backgroundColor: isSelected ? 'rgba(30,58,95,0.05)' : undefined }}
              >
                <span className="text-xl leading-none">{flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: isSelected ? '#1E3A5F' : '#1f2937' }}>{m.fullName ?? m.username}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {[m.phoneCountryCode, m.phone].filter(Boolean).join(' ')}
                    {m.city ? ` · ${m.city}` : ''}
                  </p>
                </div>
                {isSelected && <span className="text-sm font-bold" style={{ color: '#1E3A5F' }}>✓</span>}
              </button>
            );
          })}
        </div>
        {/* Footer count */}
        <div className="border-t border-gray-100 text-xs text-gray-400 text-right" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10 }}>
          {sorted.length} member{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Draw Detail Modal ────────────────────────────────────────────────────────
const STATUS_COLORS = {
  SETTLED: 'bg-green-100 text-green-700',
  PAYOUT_DEDUCTED: 'bg-green-100 text-green-700',
  WAIVED: 'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  OUTSTANDING: 'bg-red-100 text-red-700',
  SETTLEMENT_CLEARED: 'bg-green-100 text-green-700',
};
const DRAW_STATUS_COLORS = {
  CLOSED: 'bg-green-100 text-green-700',
  OPEN: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-amber-100 text-amber-700',
};

function MemberBatches({ memberId, chitId, monthNumber }) {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['paymentBatches', chitId, memberId],
    queryFn: () => getPaymentBatches({ memberId, chitId }),
    enabled: !!memberId && !!chitId,
  });

  const relevant = batches.filter((b) =>
    b.status !== 'VOIDED' &&
    (b.allocations ?? []).some((a) => a.monthNumber === monthNumber)
  );

  if (isLoading) return <p className="text-xs text-gray-400 py-2 animate-pulse">Loading transactions…</p>;
  if (relevant.length === 0) return <p className="text-xs text-gray-400 py-2 italic">No transactions recorded for this draw.</p>;

  return (
    <div className="space-y-2 pt-1">
      {relevant.map((b) => {
        const alloc = (b.allocations ?? []).filter((a) => a.monthNumber === monthNumber);
        const allocTotal = alloc.reduce((s, a) => s + Number(a.allocatedAmount ?? 0), 0);
        const date = b.createdAt
          ? new Date(b.createdAt.endsWith('Z') ? b.createdAt : b.createdAt + 'Z')
              .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        return (
          <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#1f2937' }}>{h(allocTotal)}</span>
              {b.totalAmount !== allocTotal && (
                <span style={{ color: '#9ca3af' }}>(of {fmt(b.totalAmount)} total batch)</span>
              )}
              <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 4, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 10 }}>{b.paymentMode?.replace(/_/g, ' ')}</span>
            </div>
            <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{date}</span>
          </div>
        );
      })}
    </div>
  );
}

function DrawDetailModal({ draw, chit, onClose }) {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['drawPayments', draw.drawId],
    queryFn: () => getDrawPayments(draw.drawId),
    enabled: !!draw.drawId,
  });

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members-all'],
    queryFn: () => getMembers({ size: 1000 }),
  });
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m]));

  const sorted = [...payments].sort((a, b) => {
    const order = { OUTSTANDING: 0, PARTIALLY_PAID: 1, SETTLED: 2, PAYOUT_DEDUCTED: 3, WAIVED: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  const monthLabel = drawMonthLabel(chit?.startDate, draw.monthNumber);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[3px] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[98vh]" onClick={(e) => e.stopPropagation()}>
        {/* Close button — pinned inside top-right corner */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white"
        >✕</button>
        {/* Header */}
        <div className="border-b border-gray-100" style={{ paddingLeft: 24, paddingRight: 56, paddingTop: 20, paddingBottom: 16 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-gray-900">Draw #{draw.monthNumber}</span>
            {monthLabel && <span className="text-sm text-gray-500">· {monthLabel}</span>}
            {draw.drawStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${DRAW_STATUS_COLORS[draw.drawStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                {draw.drawStatus}
              </span>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            {draw.dueDate  && <span>Due: <strong>{fmtDate(draw.dueDate)}</strong></span>}
            {draw.closedAt && <span>Closed: <strong>{fmtDate(draw.closedAt)}</strong></span>}
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex gap-6 py-3 bg-gray-50 border-b border-gray-100 text-xs flex-wrap" style={{ paddingLeft: 24, paddingRight: 32 }}>
          <span>Total Due: <strong>{h(draw.totalDue)}</strong></span>
          <span className="text-green-700">Collected: <strong>{h(draw.totalCollected)}</strong></span>
          {Number(draw.outstanding) > 0 && (
            <span className="text-red-600">Outstanding: <strong>{h(draw.outstanding)}</strong></span>
          )}
          {payments.length > 0 && <span className="text-gray-400 ml-auto">{payments.length} members</span>}
        </div>

        {/* Members table */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-gray-400 animate-pulse">Loading members…</div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No payment records for this draw.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#e5e7eb]">
                <tr>
                  <th className="py-3 text-left text-xs font-semibold text-gray-500 uppercase" style={{ paddingLeft: 24, paddingRight: 12 }}>Member</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Due</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                  <th className="py-3 text-right text-xs font-semibold text-gray-500 uppercase" style={{ minWidth: 96, paddingLeft: 12, paddingRight: 16, whiteSpace: 'nowrap' }}>Balance</th>
                  <th className="py-3 text-left text-xs font-semibold text-gray-500 uppercase" style={{ minWidth: 144, paddingLeft: 16, paddingRight: 16, whiteSpace: 'nowrap' }}>Status</th>
                  <th className="py-3 w-8" style={{ paddingLeft: 12, paddingRight: 24 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const member = memberMap[String(p.memberId)];
                  const isExpanded = expandedMemberId === p.memberId;
                  const hasPaid = Number(p.amountPaid) > 0;
                  return (
                    <>
                      <tr
                        key={p.id}
                        className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => setExpandedMemberId(isExpanded ? null : p.memberId)}
                      >
                        <td className="py-3" style={{ paddingLeft: 24, paddingRight: 12 }}>
                          <p className="font-medium text-gray-800">{member?.fullName ?? `Member #${String(p.memberId).slice(0, 8)}`}</p>
                          {member?.phone && (
                            <p className="text-xs text-gray-400">{[member.phoneCountryCode, member.phone].filter(Boolean).join(' ')}{member.city ? ` · ${member.city}` : ''}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 font-medium">{h(p.amountDue)}</td>
                        <td className="px-3 py-3 text-right text-green-700 font-medium">{hasPaid ? fmt(p.amountPaid) : '—'}</td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {Number(p.balance) > 0
                            ? <span className="text-red-600">{h(p.balance)}</span>
                            : <span className="text-green-600">✓</span>}
                        </td>
                        <td className="px-4 py-3 w-32">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {p.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 text-gray-400 text-xs" style={{ paddingLeft: 12, paddingRight: 24 }}>{isExpanded ? '▲' : '▼'}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-txns`}>
                          <td colSpan={6} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 16, borderTop: '1px solid #e5e7eb', backgroundColor: '#f8fafc' }}>
                            <p className="text-xs font-semibold text-gray-500 uppercase" style={{ marginBottom: 8 }}>Transactions for this draw</p>
                            <MemberBatches memberId={p.memberId} chitId={chit?.id} monthNumber={draw.monthNumber} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="py-3 border-t border-gray-100 text-xs text-gray-400 text-right" style={{ paddingLeft: 20, paddingRight: 32 }}>
          {chit?.name} · Click a member row to see their transactions for this draw
        </div>
      </div>
    </div>
  );
}

const PAYOUT_STATUS_CONFIG = {
  PENDING:             { label: 'Pending',             Icon: Clock,        bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  PARTIALLY_DISBURSED: { label: 'Partially Disbursed', Icon: AlertCircle,  bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  DISBURSED:           { label: 'Disbursed',           Icon: CheckCircle,  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  CANCELLED:           { label: 'Cancelled',           Icon: XCircle,      bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  VOIDED:              { label: 'Voided',              Icon: XCircle,      bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
};
const DISBURSE_ICON = { CASH: Banknote, UPI: CreditCard, BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2, BANK_TRANSFER: Building2 };

function PayoutDeductionRow({ label, amount, sub, highlight }) {
  if (!amount || Number(amount) === 0) return null;
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 ${highlight ? 'font-semibold' : ''}`}>
      <div>
        <p className={`text-sm ${highlight ? 'text-gray-900' : 'text-gray-600'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm tabular-nums ${highlight ? 'text-gray-900' : 'text-red-600'}`}>
        {highlight ? fmt(amount) : `− ${fmt(amount)}`}
      </p>
    </div>
  );
}

function PayoutDetailModal({ payoutId, onClose }) {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: payout, isLoading } = useQuery({
    queryKey: ['payout', payoutId],
    queryFn:  () => getPayoutById(payoutId),
    enabled:  !!payoutId,
  });
  const { data: member } = useQuery({
    queryKey: ['member', payout?.memberId],
    queryFn:  () => getMember(payout.memberId),
    enabled:  !!payout?.memberId,
  });
  const { data: chit } = useQuery({
    queryKey: ['chit', payout?.chitId],
    queryFn:  () => getChit(payout.chitId),
    enabled:  !!payout?.chitId,
  });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const nameMap = Object.fromEntries([
    ...staff.map((s) => [String(s.id), s.fullName ?? s.username]),
    ...allMembers.map((m) => [String(m.id), m.fullName ?? m.username]),
  ]);

  const status = payout ? (PAYOUT_STATUS_CONFIG[payout.status] ?? PAYOUT_STATUS_CONFIG.PENDING) : null;
  const disbursements = payout?.disbursements ?? [];
  const hasDeductions = payout && Number(payout.discountAmount ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[3px] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[98vh]" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 z-20 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white">✕</button>

        {/* Header */}
        <div className="pt-5 pb-4 border-b border-gray-100 flex-shrink-0" style={{ paddingLeft: 32, paddingRight: 56 }}>
          {isLoading || !payout ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-gray-900">Payout — Draw #{payout.monthNumber}</h2>
                {status && (
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${status.bg} ${status.text} ${status.border}`}>
                    <status.Icon size={11} />{status.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{fmtDateTime(payout.createdAt)}</p>
            </>
          )}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-0" style={{ paddingLeft: 32, paddingRight: 32 }}>
          {isLoading ? (
            <div className="space-y-3 animate-pulse py-4">
              {[40, 40, 40].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          ) : !payout ? (
            <p className="text-center text-sm text-gray-400 py-10">Payout not found.</p>
          ) : (
            <>
              {/* Info rows */}
              <div className="py-1">
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Winner</span>
                  <span className="text-sm font-semibold text-gray-900">{member?.fullName ?? '…'}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Chit</span>
                  <span className="text-sm font-semibold text-gray-900">{chit?.name ?? '…'}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Draw</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">#{payout.monthNumber}</p>
                    {drawMonthLabel(chit?.startDate, payout.monthNumber) && (
                      <p className="text-xs text-gray-400">{drawMonthLabel(chit?.startDate, payout.monthNumber)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="pt-4 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Payout Breakdown</p>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-sm text-gray-800 font-semibold">Winning Amount</span>
                  <span className="text-sm font-semibold text-gray-900">{h(payout.winningAmount)}</span>
                </div>
                {hasDeductions && (
                  <>
                    {Number(payout.installmentSettlement ?? 0) > 0 && (() => {
                      const breakdown = payout.installmentSettlementMonths
                        ? payout.installmentSettlementMonths.split(',').map((pair) => {
                            const [m, a] = pair.split(':');
                            return { month: Number(m), amount: Number(a) };
                          })
                        : null;
                      const multiDraw = breakdown && breakdown.length > 1;
                      return (
                        <div className="border-b border-gray-100">
                          <div className="flex items-center justify-between py-2.5">
                            <p className="text-sm text-gray-600">Installment Withheld</p>
                            <p className="text-sm tabular-nums text-red-600">− {h(payout.installmentSettlement)}</p>
                          </div>
                          {breakdown && breakdown.map(({ month, amount }) => (
                            <div key={month} className="flex items-center justify-between" style={{ paddingLeft: 16, paddingBottom: 10 }}>
                              <div>
                                <p className="text-xs font-medium text-gray-700">Draw #{month}</p>
                                <p className="text-xs text-gray-400">{drawMonthLabel(chit?.startDate, month)}</p>
                              </div>
                              <p className="text-xs tabular-nums text-red-500">− {h(amount)}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <PayoutDeductionRow label="Cross-Chit Settlement" amount={payout.crossChitSettlement} sub="Outstanding dues from other chits" />
                    <PayoutDeductionRow label="Manual Adjustment" amount={payout.manualAdjustment} />
                    <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                      <span className="text-xs text-gray-400">Total Deductions</span>
                      <span className="text-xs font-semibold text-red-600">− {h(payout.discountAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between py-3 mt-1 bg-gray-50" style={{ marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32 }}>
                  <span className="text-sm font-bold text-gray-900">Net Payout</span>
                  <span className="text-base font-bold text-[#1E3A5F]">{h(payout.netPayoutAmount)}</span>
                </div>
              </div>

              {/* Disbursements */}
              <div className="pt-4 pb-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Disbursements</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Disbursed:</span>
                    <span className="font-semibold text-green-700">{h(payout.disbursedAmount)}</span>
                    {Number(payout.remainingAmount ?? 0) > 0 && (
                      <span className="text-amber-600">· {fmt(payout.remainingAmount)} pending</span>
                    )}
                  </div>
                </div>
                {disbursements.length === 0 ? (
                  <p className="py-3 text-xs text-gray-400">No disbursements yet</p>
                ) : disbursements.map((d, i) => {
                  const ModeIcon = DISBURSE_ICON[d.mode] ?? Banknote;
                  return (
                    <div key={d.id ?? i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                      <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                        <ModeIcon size={13} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{h(d.amount)}</p>
                        <p className="text-xs text-gray-400">
                          {d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}
                          {d.disbursedBy ? ` · by ${nameMap[String(d.disbursedBy)] ?? 'Admin'}` : ''}
                        </p>
                        {d.notes && <p className="text-xs text-gray-500 italic">{d.notes}</p>}
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">{fmtDate(d.disbursedAt)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              {payout.notes && (
                <div className="pt-3 pb-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-amber-600 mb-0.5">Notes</p>
                  <p className="text-sm text-gray-700">{payout.notes}</p>
                </div>
              )}

              {/* Cancellation / void */}
              {(payout.cancellationReason || payout.voidReason) && (
                <div className="pt-3 pb-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-red-500 mb-0.5">
                    {payout.cancellationReason ? 'Cancellation Reason' : 'Void Reason'}
                  </p>
                  <p className="text-sm text-gray-700">{payout.cancellationReason ?? payout.voidReason}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {fmtDateTime(payout.cancelledAt ?? payout.voidedAt)}
                    {(payout.cancelledBy ?? payout.voidedBy)
                      ? ` · by ${nameMap[String(payout.cancelledBy ?? payout.voidedBy)] ?? 'Admin'}`
                      : ''}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 pt-3 pb-4 border-t border-gray-100">
                <Calendar size={11} className="text-gray-300" />
                <p className="text-xs text-gray-400">
                  Created {fmtDateTime(payout.createdAt)}
                  {payout.createdBy ? ` · by ${nameMap[String(payout.createdBy)] ?? 'Admin'}` : ''}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PRESETS = [
  { label: 'Today',       fn: () => ({ from: todayStr(), to: todayStr() }) },
  { label: 'Last 7 days', fn: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: localDateStr(d), to: todayStr() }; } },
  { label: 'This Month',  fn: () => ({ from: monthStartStr(), to: todayStr() }) },
  { label: 'Last Month',  fn: () => {
    const n = new Date();
    const s = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const e = new Date(n.getFullYear(), n.getMonth(), 0);
    return { from: localDateStr(s), to: localDateStr(e) };
  }},
  { label: 'All Time', fn: () => ({ from: '', to: '' }) },
];

const PMT_STATUS_COLOR = {
  SETTLED: 'green', PAYOUT_DEDUCTED: 'green', WAIVED: 'blue', SETTLEMENT_CLEARED: 'green',
  PARTIALLY_PAID: 'yellow', OUTSTANDING: 'red',
};
const PY_STATUS_COLOR = { DISBURSED: 'green', PENDING: 'yellow', CANCELLED: 'red', VOIDED: 'gray' };

const TABS = ['Overview', 'Member Report', 'Chit Report', 'Payments', 'Payouts', 'Treasury'];

// ─── Payment Detail Modal ─────────────────────────────────────────────────────
const BATCH_STATUS_CFG = {
  COMPLETED:           { label: 'Completed',           bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  AWAITING_REMITTANCE: { label: 'Awaiting Remittance', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  VOIDED:              { label: 'Voided',               bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
};
const PMODE_ICON = { CASH: Banknote, UPI: CreditCard, BANK_TRANSFER: Building2 };

function PaymentDetailModal({ batchId, onClose }) {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', batchId],
    queryFn:  () => getPaymentBatchById(batchId),
    enabled:  !!batchId,
  });
  const { data: member } = useQuery({
    queryKey: ['member', batch?.memberId],
    queryFn:  () => getMember(batch.memberId),
    enabled:  !!batch?.memberId,
  });
  const { data: chit } = useQuery({
    queryKey: ['chit', batch?.chitId],
    queryFn:  () => getChit(batch.chitId),
    enabled:  !!batch?.chitId,
  });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const nameMap = Object.fromEntries([
    ...staff.map((s) => [String(s.id), s.fullName ?? s.username]),
    ...allMembers.map((m) => [String(m.id), m.fullName ?? m.username]),
  ]);
  const resolveName = (id) => (id ? (nameMap[String(id)] ?? 'Admin') : '—');

  const statusCfg = batch ? (BATCH_STATUS_CFG[batch.status] ?? BATCH_STATUS_CFG.COMPLETED) : null;
  const ModeIcon = batch ? (PMODE_ICON[batch.paymentMode] ?? CreditCard) : CreditCard;
  const allocations = batch?.allocations ?? [];

  function DRow({ label, value, valueClass = '' }) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`text-sm font-semibold text-gray-900 text-right ${valueClass}`}>{value}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[3px] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white">✕</button>

        {/* Header */}
        <div className="pt-5 pb-4 border-b border-gray-100 flex-shrink-0" style={{ paddingLeft: 28, paddingRight: 52 }}>
          {isLoading || !batch ? (
            <div className="h-6 w-36 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-gray-900">Payment — {member?.fullName ?? '…'}</h2>
                {statusCfg && (
                  <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                    {statusCfg.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{fmtDateTime(batch.collectedAt ?? batch.createdAt)}</p>
            </>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 py-3" style={{ paddingLeft: 28, paddingRight: 28 }}>
          {isLoading ? (
            <div className="space-y-3 animate-pulse py-4">
              {[40, 40, 40, 40].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          ) : !batch ? (
            <p className="text-center text-sm text-gray-400 py-10">Transaction not found.</p>
          ) : (
            <>
              {/* Amount hero */}
              <div className="flex items-center justify-between py-3 mb-1">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Total Amount</p>
                  <p className="text-3xl font-bold text-gray-900 mt-0.5">{h(batch.totalAmount)}</p>
                </div>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">
                  <ModeIcon size={14} className="text-gray-500" />
                  {batch.paymentMode?.replace('_', ' ') ?? '—'}
                </span>
              </div>

              {/* Member & Chit */}
              <div className="border-t border-gray-100">
                <DRow label="Member" value={member?.fullName ?? resolveName(batch.memberId)} />
                <DRow label="Chit" value={chit?.name ?? '…'} />
                {allocations.length > 0 && (
                  <DRow label="Draw(s) Paid" value={allocations.map((a) => `#${a.monthNumber}`).join(', ')} />
                )}
              </div>

              {/* Draw breakdown if multiple */}
              {allocations.length > 1 && (
                <div className="mt-1 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Installment Breakdown</p>
                  {allocations.map((a) => (
                    <div key={a.monthNumber} className="flex items-center justify-between py-2 border-b border-gray-50" style={{ paddingLeft: 12 }}>
                      <div>
                        <p className="text-xs font-medium text-gray-700">Draw #{a.monthNumber}</p>
                        {chit?.startDate && <p className="text-xs text-gray-400">{drawMonthLabel(chit.startDate, a.monthNumber)}</p>}
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{h(a.allocatedAmount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Collection */}
              <div className="border-t border-gray-100 mt-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Collection</p>
                <DRow label="Recorded By" value={resolveName(batch.recordedBy ?? batch.collectedBy)} />
                <DRow label="Collected At" value={fmtDateTime(batch.collectedAt ?? batch.createdAt)} />
                {batch.status === 'COMPLETED' && batch.remittedBy && (
                  <DRow label="Remitted By" value={resolveName(batch.remittedBy)} />
                )}
              </div>

              {/* Void details */}
              {batch.status === 'VOIDED' && (
                <div className="border-t border-red-100 mt-1 bg-red-50 rounded-xl px-4 py-3 mt-2">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Void Details</p>
                  <DRow label="Voided By" value={resolveName(batch.voidedBy)} />
                  <DRow label="Voided At" value={fmtDateTime(batch.voidedAt)} />
                  {batch.voidReason && <DRow label="Reason" value={batch.voidReason} valueClass="text-red-700" />}
                </div>
              )}

              {/* Notes */}
              {batch.notes && (
                <div className="border-t border-gray-100 mt-1 pt-3 pb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{batch.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:24px}
  h1{color:#1E3A5F;border-bottom:2px solid #1E3A5F;padding-bottom:6px;font-size:17px;margin-bottom:6px}
  h2{color:#1E3A5F;font-size:13px;margin:16px 0 6px}
  h3{color:#1E3A5F;font-size:11px;margin:10px 0 4px}
  table{width:100%;border-collapse:collapse;margin:6px 0;font-size:10px}
  th{background:#1E3A5F;color:#fff;padding:5px 8px;text-align:left;font-size:10px}
  td{border:1px solid #ddd;padding:4px 8px}
  tr:nth-child(even) td{background:#f8f8f8}
  tfoot td{background:#e8eef4;font-weight:bold}
  .meta{display:flex;gap:24px;margin-bottom:12px;font-size:11px;flex-wrap:wrap}
  .meta span{color:#555}
  .meta strong{color:#222}
  .summary{background:#f0f4f8;padding:10px 14px;border-radius:6px;margin:8px 0;display:flex;gap:30px;flex-wrap:wrap}
  .summary-item p{margin:2px 0}
  .summary-item .val{font-size:14px;font-weight:bold;color:#1E3A5F}
  .summary-item .lbl{font-size:10px;color:#666}
  .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
  .badge{display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:bold}
  .green{background:#dcfce7;color:#166534} .red{background:#fee2e2;color:#991b1b}
  .yellow{background:#fef3c7;color:#92400e} .blue{background:#dbeafe;color:#1e40af}
  .gray{background:#f3f4f6;color:#374151}
`;

const escHtml = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function openPrint(title, html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  const safeTitle = escHtml(title);
  w.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title><style>${PRINT_CSS}</style></head><body>
    <h1>${safeTitle}</h1>${html}
    <div class="footer">Generated on ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; ChitWise Management System</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
  </body></html>`);
  w.document.close();
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#1E3A5F' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 font-medium leading-tight">{label}</p>
        <p className="text-lg font-bold text-gray-900 mt-0.5 break-words leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5 break-words leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function TabBar({ active, onChange, tabs = TABS }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ marginTop: 12, marginBottom: 12 }}>
      {tabs.map((t) => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="text-sm font-semibold rounded-full cursor-pointer whitespace-nowrap transition-all"
            style={{
              padding: '6px 16px',
              backgroundColor: isActive ? '#1E3A5F' : '#ffffff',
              color: isActive ? '#ffffff' : '#374151',
              border: isActive ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

// ─── Clickable entity links ───────────────────────────────────────────────────
function MemberLink({ id, name }) {
  const nav = useNavigate();
  if (!id || !name || name === id) return <span>{name ?? '—'}</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); nav(`/members/${id}`); }}
      className="hover:underline hover:text-[#1E3A5F] cursor-pointer text-left font-medium">
      {name}
    </button>
  );
}

function ChitLink({ id, name }) {
  const nav = useNavigate();
  if (!id || !name || name === id) return <span>{name ?? '—'}</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); nav(`/chits/${id}`); }}
      className="hover:underline hover:text-[#1E3A5F] cursor-pointer text-left font-medium">
      {name}
    </button>
  );
}

function DateRangeBar({ from, to, onFrom, onTo, active, onPreset, presets = PRESETS, minDate }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => {
          const isActive = active === p.label;
          return (
            <button
              key={p.label}
              onClick={() => onPreset(p.fn())}
              className="text-xs font-semibold rounded-full cursor-pointer transition-all"
              style={{
                padding: '6px 16px',
                backgroundColor: isActive ? '#1E3A5F' : '#ffffff',
                color: isActive ? '#ffffff' : '#374151',
                border: isActive ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <Filter size={13} className="text-gray-400" />
        <Input type="date" value={from} min={minDate} max={to || todayStr()} onChange={(e) => onFrom(e.target.value)} />
        <span className="text-gray-400 text-xs">to</span>
        <Input type="date" value={to} min={from || minDate} max={todayStr()} onChange={(e) => onTo(e.target.value)} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
  );
}

function SummaryBar({ items }) {
  return (
    <div className="flex flex-wrap gap-6 bg-blue-50 rounded-xl p-4">
      {items.map(({ label, value, color }) => (
        <div key={label}>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-base font-bold ${color ?? 'text-gray-800'}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Per-chit payment section (lazy, self-fetching) ───────────────────────────
function ChitPaymentSection({ memberId, chit }) {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);
  const [open, setOpen] = useState(false);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['payment-history', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: !!memberId,
  });

  // Exclude WAIVED draws from totals — they were forgiven, not owed.
  // SETTLEMENT_CLEARED / PAYOUT_DEDUCTED / SETTLED have 0 effective balance
  // regardless of the raw amountDue - amountPaid arithmetic.
  const ZERO_BAL_STATUSES = new Set(['WAIVED', 'SETTLEMENT_CLEARED', 'PAYOUT_DEDUCTED', 'SETTLED']);
  const activeHistory = history.filter((r) => r.status !== 'WAIVED');
  const totalDue  = activeHistory.reduce((s, r) => s + Number(r.amountDue ?? 0), 0);
  const totalPaid = activeHistory.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  const totalBal  = history.reduce((s, r) => s + (ZERO_BAL_STATUSES.has(r.status) ? 0 : Number(r.balance ?? 0)), 0);
  const hasPromised = history.some((r) => r.promisedPaymentDate);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <div className="text-left">
            <p className="text-sm font-semibold text-[#1E3A5F] hover:underline">{chit.name}</p>
            <p className="text-xs text-gray-400">
              {chit.status} &nbsp;·&nbsp; ₹{Number(chit.chitValue ?? 0).toLocaleString('en-IN')} &nbsp;·&nbsp; {chit.totalMembers} members
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <div className="flex gap-4 text-right text-xs">
            <div><p className="text-gray-400">Paid</p><p className="font-bold text-green-700">{h(totalPaid)}</p></div>
            <div><p className="text-gray-400">Balance</p><p className={`font-bold ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>{totalBal > 0 ? h(totalBal) : '✓'}</p></div>
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading payment records…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payment records found</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Total Due</p>
                  <p className="font-bold text-gray-800">{h(totalDue)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Total Paid</p>
                  <p className="font-bold text-green-700">{h(totalPaid)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Outstanding</p>
                  <p className={`font-bold ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {totalBal > 0 ? h(totalBal) : '✓ Clear'}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white border-b border-gray-200">
                      {['Draw', 'Due Date', 'Due', 'Paid', 'Balance', 'Status', 'Paid Date', ...(hasPromised ? ['Promised Date'] : [])].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id} className="odd:bg-white even:bg-slate-50/70">
                        <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-2 text-gray-700">{h(r.amountDue)}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{h(r.amountPaid)}</td>
                        <td className={`px-3 py-2 font-medium ${!ZERO_BAL_STATUSES.has(r.status) && Number(r.balance) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {ZERO_BAL_STATUSES.has(r.status) ? '—' : fmt(r.balance)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge color={PMT_STATUS_COLOR[r.status] ?? 'gray'} size="xs">
                            {r.status?.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{Number(r.amountPaid) > 0 ? fmtDate(r.updatedAt) : '—'}</td>
                        {hasPromised && <td className="px-3 py-2 text-gray-500">{fmtDate(r.promisedPaymentDate)}</td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-xs">
                      <td className="px-3 py-2 text-gray-700">Total</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-gray-700">{h(totalDue)}</td>
                      <td className="px-3 py-2 text-green-700">{h(totalPaid)}</td>
                      <td className={`px-3 py-2 ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>{totalBal > 0 ? h(totalBal) : '✓ Clear'}</td>
                      <td colSpan={hasPromised ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: () => getChits({ size: 200 }) });
  const { data: members = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});
  const { data: wallet } = useQuery({ queryKey: ['wallet-balance'], queryFn: getWalletBalance });
  const { data: thisMonthBatches = [] } = useQuery({
    queryKey: ['batches-this-month'],
    queryFn: () => getAllPaymentBatches({ fromDate: monthStartStr(), toDate: todayStr() }),
  });
  const { data: allPayouts = [] } = useQuery({
    queryKey: ['all-payouts-overview'],
    queryFn: () => getAllPayouts(),
  });

  const activeChits    = chits.filter((c) => c.status === 'ACTIVE').length;
  const completedChits = chits.filter((c) => c.status === 'COMPLETED').length;
  const activeMembers  = members.filter((m) => m.status === 'ACTIVE').length;
  const thisMonthTotal = thisMonthBatches.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);
  const pendingPayouts = allPayouts.filter((p) => p.status === 'PENDING');
  const pendingPayoutTotal = pendingPayouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? p.winningAmount ?? 0), 0);
  const disbursedTotal = allPayouts
    .filter((p) => p.status === 'DISBURSED')
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);

  const modeBreakdown = thisMonthBatches.reduce((acc, b) => {
    const mode = b.paymentMode ?? 'UNKNOWN';
    acc[mode] = (acc[mode] ?? 0) + Number(b.amount ?? b.totalAmount ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={BarChart2}   label="Active Chits"    value={activeChits}    sub={`${completedChits} completed`} />
        <StatCard icon={Users}       label="Active Members"  value={activeMembers}  sub={`${members.length} total`} />
        <StatCard icon={Banknote}    label="This Month"      value={h(thisMonthTotal)} sub={`${thisMonthBatches.length} transactions`} color="#16a34a" />
        <StatCard icon={AlertCircle} label="Pending Payouts" value={pendingPayouts.length} sub={fmt(pendingPayoutTotal)} color="#dc2626" />
        <StatCard icon={Wallet}      label="Wallet Balance"  value={h(wallet?.totalBalance)} sub={`Cash: ${fmt(wallet?.cashBalance)} · Bank: ${fmt(wallet?.bankBalance)}`} color="#7c3aed" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">This Month — Payment Mode Breakdown</h3>
          {Object.keys(modeBreakdown).length === 0 ? (
            <p className="text-sm text-gray-400">No payments this month</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(modeBreakdown).map(([mode, total]) => {
                const pct = thisMonthTotal > 0 ? Math.round((total / thisMonthTotal) * 100) : 0;
                return (
                  <div key={mode}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{mode.replace(/_/g, ' ')}</span>
                      <span className="font-semibold">{h(total)} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-[#1E3A5F] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Payout Summary (All Time)</h3>
          <Row label="Total Disbursed" value={h(disbursedTotal)} />
          <Row label="Pending Payouts" value={`${pendingPayouts.length} · ${fmt(pendingPayoutTotal)}`} />
          <Row label="Total Payouts" value={allPayouts.length} />
          <div className="border-t border-gray-100 pt-2 space-y-1">
            <Row label="Total Chits" value={chits.length} />
            <Row label="Active Chits" value={activeChits} />
            <Row label="Completed Chits" value={completedChits} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member Report Tab ────────────────────────────────────────────────────────
function MemberReportTab() {
  const [memberId, setMemberId] = useSessionState('rpt_mr_member', '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);
  const queryClient = useQueryClient();

  const { data: members = [], isLoading: loadingMembers } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});

  const { data: memberDetail, isLoading: loadingMember } = useQuery({
    queryKey: ['member-detail', memberId],
    queryFn: () => getMember(memberId),
    enabled: !!memberId,
  });

  const { data: memberChits = [], isLoading: loadingChits } = useQuery({
    queryKey: ['member-chits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: totalBalance } = useQuery({
    queryKey: ['member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    enabled: !!memberId,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['member-settlements', memberId],
    queryFn: () => getMemberSettlements(memberId),
    enabled: !!memberId,
  });

  const member = memberDetail ?? members.find((m) => String(m.id) === String(memberId));
  const chitNameMap  = Object.fromEntries(memberChits.map((c) => [String(c.id), c.name ?? c.chitName]));
  const chitStartMap = Object.fromEntries(memberChits.map((c) => [String(c.id), c.startDate]));
  const chitName = (p) => chitNameMap[String(p.chitId)] ?? p.chitName ?? p.chitId ?? '—';

  const disbursedPayouts = payouts.filter((p) => p.status === 'DISBURSED');
  const pendingPayouts = payouts.filter((p) => p.status !== 'DISBURSED' && p.status !== 'CANCELLED' && p.status !== 'VOIDED');

  const totalPayoutsReceived = disbursedPayouts
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);

  function handlePrint() {
    if (!member) return;

    const profileHtml = `
      <div class="meta">
        <span><strong>Name:</strong> ${member.fullName ?? '—'}</span>
        <span><strong>Phone:</strong> ${member.phone ?? '—'}</span>
        <span><strong>Email:</strong> ${member.email ?? '—'}</span>
        <span><strong>Status:</strong> ${member.status ?? '—'}</span>
        <span><strong>City:</strong> ${member.city ?? '—'}</span>
      </div>
    `;

    const summaryHtml = `
      <div class="summary">
        <div class="summary-item"><p class="lbl">Enrolled Chits</p><p class="val">${memberChits.length}</p></div>
        <div class="summary-item"><p class="lbl">Overall Outstanding</p><p class="val">${fmt(totalBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Payouts Received</p><p class="val">${fmt(totalPayoutsReceived)}</p></div>
        <div class="summary-item"><p class="lbl">Disbursed Payouts</p><p class="val">${disbursedPayouts.length}</p></div>
        ${pendingPayouts.length > 0 ? `<div class="summary-item"><p class="lbl" style="color:#d97706">Pending Disbursements</p><p class="val" style="color:#d97706">${pendingPayouts.length} pending</p></div>` : ''}
      </div>
    `;

    const pendingDisbHtml = pendingPayouts.length === 0 ? '' : `
      <h2 style="color:#92400e">Pending Disbursements</h2>
      <table>
        <thead><tr><th>Chit</th><th>Draw</th><th>Winning Amt</th><th>Net Payout</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${pendingPayouts.map((p) => { const pdl = drawMonthLabel(chitStartMap[String(p.chitId)], p.monthNumber); return `<tr>
            <td>${chitName(p)}</td>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td style="color:#d97706;font-weight:600">${fmt(p.netPayoutAmount)}</td>
            <td><span class="badge yellow">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt)}</td>
          </tr>`; }).join('')}
        </tbody>
      </table>
    `;

    const payoutsHtml = payouts.length === 0 ? '<p style="color:#888;font-size:11px">No payouts</p>' : `
      <table>
        <thead><tr><th>Chit</th><th>Draw</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${payouts.map((p) => { const pdl = drawMonthLabel(chitStartMap[String(p.chitId)], p.monthNumber); return `<tr>
            <td>${chitName(p)}</td>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
      </table>
    `;

    const settlementsHtml = settlements.length === 0 ? '' : `
      <h2>Settlements</h2>
      <table>
        <thead><tr><th>Date</th><th>Amount</th></tr></thead>
        <tbody>
          ${settlements.map((s) => `<tr>
            <td>${fmtDate(s.settledAt ?? s.createdAt)}</td>
            <td>${fmt(s.totalAmount ?? s.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    const ZERO_BAL_STATUSES_PRINT = new Set(['WAIVED', 'SETTLEMENT_CLEARED', 'PAYOUT_DEDUCTED', 'SETTLED']);
    const chitHistoriesHtml = memberChits.map((chit) => {
      const hist = queryClient.getQueryData(['payment-history', memberId, chit.id]) ?? [];
      if (hist.length === 0) return '';
      const activeHist = hist.filter((r) => r.status !== 'WAIVED');
      const hasP = activeHist.some((r) => !ZERO_BAL_STATUSES_PRINT.has(r.status) && r.balance > 0);
      const rows = hist.map((r) => {
        if (r.status === 'WAIVED') return ''; // skip waived rows in print
        const dl = drawMonthLabel(chit.startDate, r.monthNumber);
        const effectiveBal = ZERO_BAL_STATUSES_PRINT.has(r.status) ? 0 : Number(r.balance ?? 0);
        return `<tr>
        <td>#${r.monthNumber ?? '—'}${dl ? ` (${dl})` : ''}</td>
        <td>${fmtDate(r.dueDate)}</td>
        <td>${fmt(r.amountDue)}</td>
        <td>${fmt(r.amountPaid)}</td>
        <td>${effectiveBal > 0 ? fmt(effectiveBal) : '—'}</td>
        <td><span class="badge ${effectiveBal > 0 ? 'red' : 'green'}">${r.status ?? '—'}</span></td>
        <td>${Number(r.amountPaid) > 0 ? fmtDate(r.updatedAt) : '—'}</td>
        ${hasP ? `<td>${r.promisedPaymentDate ? fmtDate(r.promisedPaymentDate) : '—'}</td>` : ''}
      </tr>`;
      }).join('');
      return `<h3 style="margin:14px 0 4px;font-size:12px;color:#1E3A5F">${chit.name} <span style="font-weight:400;color:#888">(${chit.status})</span></h3>
        <table>
          <thead><tr><th>Draw</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Paid Date</th>${hasP ? '<th>Promised Date</th>' : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

    openPrint(`Member Report — ${member.fullName}`,
      `${profileHtml}${summaryHtml}
       <h2>Payouts Received</h2>${payoutsHtml}
       ${pendingDisbHtml}
       ${settlementsHtml}
       ${chitHistoriesHtml ? `<h2>Draw-wise Payment History</h2>${chitHistoriesHtml}` : ''}`
    );
  }

  if (loadingMembers) return <ListSkeleton rows={5} cols={4} />;
  const sortedMembers = [...members].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Select Member</label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-[#1E3A5F] transition-colors cursor-pointer text-left"
          >
            {memberId && member ? (
              <>
                <span className="text-lg leading-none">{countryFlag(member.phoneCountryCode ?? '+91')}</span>
                <span className="flex-1 font-medium text-gray-800 truncate">{member.fullName}</span>
                {member.city && <span className="text-xs text-gray-400 shrink-0">{member.city}</span>}
              </>
            ) : (
              <span className="text-gray-400 flex-1">— choose a member —</span>
            )}
            <Users size={13} className="text-gray-400 shrink-0" />
          </button>
        </div>
        {memberId && member && (
          <button onClick={handlePrint} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
            <Printer size={15} /> Print Report
          </button>
        )}
      </div>

      {pickerOpen && (
        <MemberPickerModal
          members={sortedMembers}
          value={memberId}
          onChange={setMemberId}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {!memberId && (
        <EmptyState icon={Users} title="Select a member" description="Choose a member to view their complete report" />
      )}

      {memberId && (loadingMember || loadingChits) && <ListSkeleton rows={5} cols={4} />}

      {memberId && member && (
        <div className="space-y-5">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{member.fullName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[member.phone, member.email].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Badge color={member.status === 'ACTIVE' ? 'green' : 'gray'}>{member.status}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {member.address && <Row label="Address" value={member.address} />}
              {member.city && <Row label="City" value={member.city} />}
              {member.referredByName && <Row label="Referred By" value={member.referredByName} />}
              {member.joinedDate && <Row label="Joined" value={fmtDate(member.joinedDate)} />}
            </div>
          </div>

          {/* Summary */}
          <SummaryBar items={[
            { label: 'Enrolled Chits', value: memberChits.length },
            { label: 'Overall Outstanding', value: fmt(totalBalance), color: Number(totalBalance) > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Payouts Received', value: fmt(totalPayoutsReceived), color: 'text-green-700' },
            { label: 'Disbursed Payouts', value: disbursedPayouts.length },
            ...(pendingPayouts.length > 0 ? [{ label: 'Pending Disbursements', value: `${pendingPayouts.length} pending`, color: 'text-amber-600' }] : []),
          ]} />

          {/* Per-Chit Payment History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History by Chit</h3>
            {memberChits.length === 0 ? (
              <p className="text-sm text-gray-400">Not enrolled in any chits</p>
            ) : (
              <div className="space-y-3">
                {memberChits.map((chit) => (
                  <ChitPaymentSection key={chit.id} memberId={memberId} chit={chit} />
                ))}
              </div>
            )}
          </div>

          {/* Payouts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Payouts Received</h3>
            {payouts.length === 0 ? (
              <p className="text-sm text-gray-400">No payouts</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Chit', 'Draw', 'Winning Amt', 'Withheld Instmt', 'Adj', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">
                          {h === 'Withheld Instmt' ? <span title="Installment deducted from payout">{h}</span>
                            : h === 'Adj' ? <span title="Additional adjustments (cross-chit, manual)" className="flex items-center gap-1 cursor-help"><Layers size={11} />Adj</span>
                            : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedPayoutId(p.id)}>
                        <td className="px-3 py-2"><ChitLink id={p.chitId} name={chitName(p)} /></td>
                        <td className="px-3 py-2">{drawLabel(chitStartMap[String(p.chitId)], p.monthNumber)}</td>
                        <td className="px-3 py-2">{h(p.winningAmount)}</td>
                        <td className="px-3 py-2">
                          {Number(p.discountAmount) > 0
                            ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold text-sm">✓</span>{h(p.discountAmount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2"><AdjCell p={p} /></td>
                        <td className="px-3 py-2 font-semibold">{h(p.netPayoutAmount)}</td>
                        <td className="px-3 py-2 text-green-700 font-semibold">{h(p.disbursedAmount)}</td>
                        <td className="px-3 py-2">
                          <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                        <td className="px-3 py-2"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 text-xs font-semibold">
                      <td colSpan={5} className="px-3 py-2 text-gray-600">Total Disbursed</td>
                      <td className="px-3 py-2">{h(payouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                      <td className="px-3 py-2 text-green-700">{h(totalPayoutsReceived)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Pending Disbursements */}
          {pendingPayouts.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-500" /> Pending Disbursements
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-50">
                      {['Chit', 'Draw', 'Winning Amt', 'Net Payout', 'Status', 'Date'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-amber-700 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayouts.map((p) => (
                      <tr key={p.id} className="odd:bg-white even:bg-amber-50/40">
                        <td className="px-3 py-2"><ChitLink id={p.chitId} name={chitName(p)} /></td>
                        <td className="px-3 py-2">{drawLabel(chitStartMap[String(p.chitId)], p.monthNumber)}</td>
                        <td className="px-3 py-2">{h(p.winningAmount)}</td>
                        <td className="px-3 py-2 font-semibold text-amber-700">{h(p.netPayoutAmount)}</td>
                        <td className="px-3 py-2">
                          <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-50 text-xs font-semibold">
                      <td colSpan={3} className="px-3 py-2 text-amber-700">Total Pending</td>
                      <td className="px-3 py-2 text-amber-700">{h(pendingPayouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Settlements */}
          {settlements.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Settlements</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Date', 'Amount', 'Notes'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.id} className="odd:bg-white even:bg-slate-50/70">
                        <td className="px-3 py-2">{fmtDate(s.settledAt ?? s.createdAt)}</td>
                        <td className="px-3 py-2 font-semibold">{h(s.totalAmount ?? s.amount)}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px]">
                          {s.notes ? <span title={s.notes} className="block truncate cursor-help">{s.notes}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {selectedPayoutId && (
        <PayoutDetailModal
          payoutId={selectedPayoutId}
          onClose={() => setSelectedPayoutId(null)}
        />
      )}
    </div>
  );
}

// ─── Chit Report Tab ──────────────────────────────────────────────────────────
function ChitReportTab() {
  const [chitId, setChitId] = useSessionState('rpt_cr_chit', '');
  const [showBreakdown, setShowBreakdown] = useSessionState('rpt_cr_breakdown', false);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  const { data: chits = [], isLoading: loadingChits } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits({ size: 200 }),
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],       queryFn: listStaff });

  const { data: chit } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    enabled: !!chitId,
  });

  const { data: draws = [], isLoading: loadingDraws } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
    enabled: !!chitId,
  });

  const { data: collectionsReport = [], isLoading: loadingCollections } = useQuery({
    queryKey: ['collections-report', chitId],
    queryFn: () => getCollectionsReport(chitId),
    enabled: !!chitId,
  });

  const { data: membersReport = [], isLoading: loadingMembersReport } = useQuery({
    queryKey: ['members-report', chitId],
    queryFn: () => getMembersReport(chitId),
    enabled: !!chitId,
  });

  const { data: payoutsReport = [], isLoading: loadingPayoutsReport } = useQuery({
    queryKey: ['payouts-report', chitId],
    queryFn: () => getPayoutsReport(chitId),
    enabled: !!chitId,
  });

  const { data: payoutsByChit = [] } = useQuery({
    queryKey: ['payouts-by-chit', chitId],
    queryFn: () => getPayoutsByChit(chitId),
    enabled: !!chitId,
  });

  const payoutsData = payoutsReport.length > 0 ? payoutsReport : payoutsByChit;
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));
  const staffMap  = Object.fromEntries(staffList.map((s) => [String(s.id), s.fullName ?? s.username]));
  const resolveMember = (p) => resolveUUID(p.memberId, memberMap, {}, staffMap) || p.memberName || '—';

  const drawMap = Object.fromEntries(draws.map((d) => [d.monthNumber, d]));
  const collectionRows = collectionsReport.length > 0
    ? collectionsReport.map((r) => {
        const mn = r.monthNumber ?? r.drawNumber ?? r.month;
        const draw = drawMap[mn] ?? {};
        return {
          monthNumber: mn,
          drawId: draw.id,
          totalDue: r.totalDue ?? r.expectedAmount ?? 0,
          totalCollected: r.totalCollected ?? r.collectedAmount ?? r.totalPaid ?? 0,
          outstanding: r.outstanding ?? r.balance ?? ((r.totalDue ?? 0) - (r.totalCollected ?? r.totalPaid ?? 0)),
          drawStatus: r.drawStatus ?? draw.status ?? '—',
          dueDate: draw.dueDate,
          closedAt: draw.closedAt,
        };
      })
    : draws.map((d) => {
        const isSkipped   = d.status === 'SKIPPED';
        const collected   = Number(d.totalCollected ?? 0);
        const outstanding = isSkipped ? 0 : Number(d.totalOutstanding ?? 0);
        const totalDue    = isSkipped ? 0 : collected + outstanding;
        return {
          monthNumber: d.monthNumber,
          drawId: d.id,
          totalDue:       totalDue > 0 ? totalDue : null,
          totalCollected: isSkipped ? null : (d.totalCollected != null ? collected : null),
          outstanding:    isSkipped ? null : (d.totalOutstanding != null ? outstanding : null),
          drawStatus: d.status,
          dueDate: d.dueDate,
          closedAt: d.closedAt,
        };
      });

  const totalExpected    = collectionRows.reduce((s, r) => s + Number(r.totalDue ?? 0), 0);
  const totalCollected   = collectionRows.reduce((s, r) => s + Number(r.totalCollected ?? 0), 0);
  const totalOutstanding = collectionRows.reduce((s, r) => s + Number(r.outstanding ?? 0), 0);
  const totalDisbursed   = payoutsData
    .filter((p) => p.status === 'DISBURSED')
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);
  const totalWithheld    = payoutsData.reduce((s, p) => s + Number(p.discountAmount ?? 0), 0);

  // Draws where admin paid additional members: grouped by monthNumber, extras beyond 1 = admin investment.
  // Exclude VOIDED and CANCELLED payouts — those draws are no longer active.
  const payoutsByDraw = payoutsData
    .filter((p) => p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED')
    .reduce((acc, p) => {
      const mn = p.monthNumber ?? 0;
      if (!acc[mn]) acc[mn] = [];
      acc[mn].push(p);
      return acc;
    }, {});
  const adminInvestment = Object.values(payoutsByDraw).reduce((s, group) => {
    if (group.length <= 1) return s;
    return s + group.slice(1).reduce((sub, p) => sub + Number(p.disbursedAmount ?? 0), 0);
  }, 0);

  const profitLoss = totalCollected - totalDisbursed + adminInvestment;

  function handlePrint() {
    if (!chit) return;

    const chitInfoHtml = `
      <div class="meta">
        <span><strong>Chit:</strong> ${chit.name}</span>
        <span><strong>Value:</strong> ${fmt(chit.chitValue)}</span>
        <span><strong>Members:</strong> ${chit.totalMembers}</span>
        <span><strong>Status:</strong> ${chit.status}</span>
        <span><strong>Started:</strong> ${fmtDate(chit.startDate)}</span>
        <span><strong>Installment:</strong> ${fmt(chit.installmentAmount)}</span>
      </div>
    `;

    const summaryHtml = `
      <div class="summary">
        <div class="summary-item"><p class="lbl">Total Draws</p><p class="val">${draws.length}</p></div>
        <div class="summary-item"><p class="lbl">Expected</p><p class="val">${fmt(totalExpected)}</p></div>
        <div class="summary-item"><p class="lbl">Collected</p><p class="val" style="color:#166534">${fmt(totalCollected)}</p></div>
        <div class="summary-item"><p class="lbl">Outstanding</p><p class="val" style="color:#991b1b">${fmt(totalOutstanding)}</p></div>
        <div class="summary-item"><p class="lbl">Disbursed Payouts</p><p class="val" style="color:#1d4ed8">${fmt(totalDisbursed)}</p></div>
        <div class="summary-item"><p class="lbl">Withheld Instmts</p><p class="val" style="color:#92400e">${fmt(totalWithheld)}</p></div>
      </div>
      <div style="margin:12px 0;padding:12px 16px;background:${profitLoss >= 0 ? '#f0fdf4' : '#fef2f2'};border:2px solid ${profitLoss >= 0 ? '#16a34a' : '#dc2626'};border-radius:8px;display:flex;align-items:center;gap:32px;flex-wrap:wrap">
        <div><p style="font-size:11px;color:#6b7280;margin:0">Total Collected</p><p style="font-size:16px;font-weight:700;color:#166534;margin:0">${fmt(totalCollected)}</p></div>
        <div style="font-size:20px;color:#9ca3af">−</div>
        <div><p style="font-size:11px;color:#6b7280;margin:0">Disbursed Payouts</p><p style="font-size:16px;font-weight:700;color:#1d4ed8;margin:0">${fmt(totalDisbursed)}</p></div>
        ${adminInvestment > 0 ? `<div style="font-size:20px;color:#9ca3af">+</div><div><p style="font-size:11px;color:#6b7280;margin:0">Admin Investment</p><p style="font-size:16px;font-weight:700;color:#7c3aed;margin:0">${fmt(adminInvestment)}</p><p style="font-size:10px;color:#9ca3af;margin:0">advance to additional members</p></div>` : ''}
        <div style="font-size:20px;color:#9ca3af">=</div>
        <div><p style="font-size:11px;color:#6b7280;margin:0">${profitLoss >= 0 ? 'Surplus (Profit)' : 'Deficit (Loss)'}</p><p style="font-size:20px;font-weight:800;color:${profitLoss >= 0 ? '#16a34a' : '#dc2626'};margin:0">${profitLoss >= 0 ? '+' : ''}${fmt(profitLoss)}</p></div>
      </div>
    `;

    const collectionsHtml = collectionRows.length === 0 ? '<p style="color:#888">No draw data</p>' : `
      <table>
        <thead><tr><th>Draw</th><th>Due Date</th><th>Total Due</th><th>Collected</th><th>Outstanding</th><th>Status</th><th>Closed Date</th></tr></thead>
        <tbody>
          ${collectionRows.map((r) => { const cdl = drawMonthLabel(chit.startDate, r.monthNumber); return `<tr>
            <td>#${r.monthNumber}${cdl ? ` (${cdl})` : ''}</td>
            <td>${fmtDate(r.dueDate)}</td>
            <td>${r.totalDue != null ? fmt(r.totalDue) : '—'}</td>
            <td>${r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
            <td>${r.outstanding != null ? fmt(r.outstanding) : '—'}</td>
            <td>${r.drawStatus}</td>
            <td>${r.closedAt ? fmtDate(r.closedAt) : '—'}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td></td><td>${fmt(totalExpected)}</td><td>${fmt(totalCollected)}</td><td>${fmt(totalOutstanding)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `;

    const membersHtml = membersReport.length === 0 ? '<p style="color:#888">No member data</p>' : `
      <table>
        <thead><tr>
          ${Object.keys(membersReport[0] ?? {}).map((k) => `<th>${k.replace(/([A-Z])/g, ' $1').trim()}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${membersReport.map((r) => `<tr>
            ${Object.values(r).map((v) => `<td>${typeof v === 'number' ? fmt(v) : (v ?? '—')}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    const payoutsHtml = payoutsData.length === 0 ? '<p style="color:#888">No payouts</p>' : `
      <table>
        <thead><tr><th>Draw</th><th>Member</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${payoutsData.map((p) => { const pdl = drawMonthLabel(chit.startDate, p.monthNumber); return `<tr>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${resolveMember(p)}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Total Disbursed</td><td>${fmt(totalDisbursed)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `;

    openPrint(`Chit Report — ${chit.name}`,
      `${chitInfoHtml}
       <h2>Draw-wise Collections</h2>${collectionsHtml}
       <h2>Member Payment Summary</h2>${membersHtml}
       <h2>Payouts</h2>${payoutsHtml}`
    );
  }

  if (loadingChits) return <ListSkeleton rows={5} cols={4} />;
  const isLoading = loadingDraws || loadingCollections || loadingMembersReport || loadingPayoutsReport;

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Select Chit</label>
          <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
            <option value="">— choose a chit —</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </Select>
        </div>
        {chitId && chit && (
          <button onClick={handlePrint} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
            <Printer size={15} /> Print Report
          </button>
        )}
      </div>

      {!chitId && <EmptyState icon={FileText} title="Select a chit" description="Choose a chit to view its complete report" />}
      {chitId && isLoading && <ListSkeleton rows={5} cols={4} />}

      {chitId && chit && !isLoading && (
        <div className="space-y-5">
          {/* Chit Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{chit.name}</h2>
                {chit.description && <p className="text-sm text-gray-500 mt-0.5">{chit.description}</p>}
              </div>
              <Badge color={chit.status === 'ACTIVE' ? 'green' : chit.status === 'COMPLETED' ? 'blue' : 'gray'}>
                {chit.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6">
              <Row label="Chit Value" value={h(chit.chitValue)} />
              <Row label="Installment" value={h(chit.installmentAmount)} />
              <Row label="Members" value={chit.totalMembers} />
              <Row label="Start Date" value={fmtDate(chit.startDate)} />
            </div>
          </div>

          {/* Summary */}
          <SummaryBar items={[
            { label: 'Total Draws', value: draws.length },
            { label: 'Expected Collections', value: totalExpected > 0 ? fmt(totalExpected) : '—' },
            { label: 'Total Collected', value: totalCollected > 0 ? fmt(totalCollected) : '—', color: 'text-green-700' },
            { label: 'Outstanding', value: totalOutstanding > 0 ? fmt(totalOutstanding) : '—', color: totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800' },
            { label: 'Disbursed Payouts', value: fmt(totalDisbursed), color: 'text-blue-700' },
            { label: 'Withheld Instmts', value: fmt(totalWithheld), color: 'text-amber-700' },
            ...(adminInvestment > 0 ? [{ label: 'Admin Investment', value: fmt(adminInvestment), color: 'text-purple-700' }] : []),
          ]} />

          {/* Profit / Loss card */}
          <div className={`rounded-xl border-2 ${profitLoss >= 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Summary</p>
              <div className="flex flex-wrap items-center gap-3 md:gap-5">
                <div className="flex-1 min-w-[120px]">
                  <p className="text-xs text-gray-500">Total Collected</p>
                  <p className="text-xl font-bold text-green-700">{h(totalCollected)}</p>
                </div>
                <span className="text-2xl text-gray-400 font-light">−</span>
                <div className="flex-1 min-w-[120px]">
                  <p className="text-xs text-gray-500">Disbursed Payouts</p>
                  <p className="text-xl font-bold text-blue-700">{h(totalDisbursed)}</p>
                </div>
                {adminInvestment > 0 && (
                  <>
                    <span className="text-2xl text-gray-400 font-light">+</span>
                    <div className="flex-1 min-w-[120px]">
                      <p className="text-xs text-gray-500">Admin Investment</p>
                      <p className="text-xl font-bold text-purple-700">{h(adminInvestment)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">advance payouts to additional members</p>
                    </div>
                  </>
                )}
                <span className="text-2xl text-gray-400 font-light">=</span>
                <div className="flex-1 min-w-[140px] bg-white rounded-lg px-4 py-3 border border-gray-200">
                  <p className="text-xs text-gray-500">{profitLoss >= 0 ? 'Surplus (Profit)' : 'Deficit (Loss)'}</p>
                  <p className={`text-2xl font-extrabold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitLoss >= 0 ? '+' : ''}{fmt(profitLoss)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="mt-4 flex items-center gap-1.5 text-xs font-medium text-[#1E3A5F] hover:underline"
              >
                {showBreakdown ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {showBreakdown ? 'Hide' : 'View'} Draw-wise Breakdown
              </button>
            </div>

            {showBreakdown && (() => {
              // Per-draw disbursed amounts
              const disbursedByDraw = payoutsData
                .filter((p) => p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED')
                .reduce((acc, p) => {
                  const mn = p.monthNumber ?? 0;
                  acc[mn] = (acc[mn] ?? 0) + Number(p.disbursedAmount ?? 0);
                  return acc;
                }, {});

              // Admin investment details: draws with >1 active payout → extras are investments
              const adminInvestDetails = [];
              Object.entries(payoutsByDraw).forEach(([mn, group]) => {
                if (group.length <= 1) return;
                group.slice(1).forEach((p) => {
                  adminInvestDetails.push({
                    monthNumber: Number(mn),
                    memberName: resolveUUID(p.memberId, memberMap, {}, staffMap),
                    amount: Number(p.disbursedAmount ?? 0),
                  });
                });
              });

              const grandCollected  = collectionRows.reduce((s, r) => s + Number(r.totalCollected ?? 0), 0);
              const grandDisbursed  = Object.values(disbursedByDraw).reduce((s, v) => s + v, 0);
              const grandNetFlow    = grandCollected - grandDisbursed;

              return (
                <div className="border-t border-white/60 px-5 pb-5">
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/70 border-b border-gray-200">
                          {['Draw', 'Collected', 'Disbursed', 'Net Retained'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {collectionRows.map((r) => {
                          const disbursed = disbursedByDraw[r.monthNumber] ?? 0;
                          const netFlow   = Number(r.totalCollected ?? 0) - disbursed;
                          return (
                            <tr key={r.monthNumber} className="border-b border-white/50 hover:bg-white/50">
                              <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                              <td className="px-3 py-2 text-green-700 font-medium">{r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
                              <td className="px-3 py-2 text-blue-700 font-medium">{disbursed > 0 ? fmt(disbursed) : '—'}</td>
                              <td className={`px-3 py-2 font-bold ${netFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {netFlow >= 0 ? '+' : ''}{fmt(netFlow)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-white/80 font-semibold text-xs border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-gray-700">Total</td>
                          <td className="px-3 py-2 text-green-700">{h(grandCollected)}</td>
                          <td className="px-3 py-2 text-blue-700">{h(grandDisbursed)}</td>
                          <td className={`px-3 py-2 ${grandNetFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {grandNetFlow >= 0 ? '+' : ''}{fmt(grandNetFlow)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {adminInvestDetails.length > 0 && (
                    <div className="mt-4 rounded-lg bg-purple-50 border border-purple-200 p-3">
                      <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                        Admin Invested Funds — {fmt(adminInvestment)}
                        <span className="font-normal text-purple-500 ml-1">(advance payouts to additional members, to be recovered)</span>
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-purple-200">
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Draw</th>
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Member</th>
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Amount Invested</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminInvestDetails.map((d, i) => (
                            <tr key={i} className="border-b border-purple-100">
                              <td className="px-2 py-1.5 font-semibold text-purple-700">{drawLabel(chit.startDate, d.monthNumber)}</td>
                              <td className="px-2 py-1.5 text-purple-700">{d.memberName}</td>
                              <td className="px-2 py-1.5 font-bold text-purple-800">{h(d.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Draw-wise Collections */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Draw-wise Collections</h3>
            {collectionRows.length === 0 ? (
              <p className="text-sm text-gray-400">No draw data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Draw', 'Due Date', 'Total Due', 'Collected', 'Outstanding', 'Status', 'Closed Date'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {collectionRows.map((r) => (
                      <tr
                        key={r.monthNumber}
                        className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedDraw(r)}
                        title="Click to see member-wise breakdown"
                      >
                        <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-2">{r.totalDue != null ? fmt(r.totalDue) : '—'}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
                        <td className={`px-3 py-2 font-medium ${Number(r.outstanding) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {r.outstanding != null ? fmt(r.outstanding) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.drawStatus}</td>
                        <td className="px-3 py-2 text-gray-500">{r.closedAt ? fmtDate(r.closedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totalExpected > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 text-xs font-semibold">
                        <td className="px-3 py-2 text-gray-700">Total</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2">{h(totalExpected)}</td>
                        <td className="px-3 py-2 text-green-700">{h(totalCollected)}</td>
                        <td className={`px-3 py-2 ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{h(totalOutstanding)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Member Payment Summary */}
          {membersReport.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Member Payment Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {Object.keys(membersReport[0] ?? {}).map((k) => (
                        <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium capitalize">
                          {k.replace(/([A-Z])/g, ' $1').trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {membersReport.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k} className="px-3 py-2 text-gray-700">
                            {typeof v === 'number' ? fmt(v) : (v ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payouts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Payouts</h3>
            {payoutsData.length === 0 ? (
              <p className="text-sm text-gray-400">No payouts for this chit</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Draw', 'Member', 'Winning Amt', 'Withheld Instmt', 'Adj', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">
                          {h === 'Adj' ? <span title="Additional adjustments (cross-chit, manual)" className="flex items-center gap-1 cursor-help"><Layers size={11} />Adj</span> : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payoutsData.map((p) => (
                      <tr key={p.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedPayoutId(p.id)}>
                        <td className="px-3 py-2 font-semibold">{drawLabel(chit.startDate, p.monthNumber)}</td>
                        <td className="px-3 py-2"><MemberLink id={p.memberId} name={resolveMember(p)} /></td>
                        <td className="px-3 py-2">{h(p.winningAmount)}</td>
                        <td className="px-3 py-2">
                          {Number(p.discountAmount) > 0
                            ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold text-sm">✓</span>{h(p.discountAmount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2"><AdjCell p={p} /></td>
                        <td className="px-3 py-2 font-semibold">{h(p.netPayoutAmount)}</td>
                        <td className="px-3 py-2 text-green-700 font-semibold">{h(p.disbursedAmount)}</td>
                        <td className="px-3 py-2">
                          <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                        <td className="px-3 py-2"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 text-xs font-semibold">
                      <td colSpan={5} className="px-3 py-2 text-gray-600">Total Disbursed</td>
                      <td className="px-3 py-2">{h(payoutsData.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                      <td className="px-3 py-2 text-green-700">{h(totalDisbursed)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedDraw && (
        <DrawDetailModal
          draw={selectedDraw}
          chit={chit}
          onClose={() => setSelectedDraw(null)}
        />
      )}
      {selectedPayoutId && (
        <PayoutDetailModal
          payoutId={selectedPayoutId}
          onClose={() => setSelectedPayoutId(null)}
        />
      )}
    </div>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────
function PaymentsTab() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';

  // Managers are restricted to the last 7 days only
  const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return localDateStr(d); })();
  const defaultFrom = isManager ? sevenDaysAgo : todayStr();
  const defaultPreset = isManager ? 'Last 7 days' : 'Today';
  const allowedPresets = isManager
    ? PRESETS.filter((p) => ['Today', 'Last 7 days'].includes(p.label))
    : PRESETS;

  const [from, setFrom]             = useSessionState('rpt_pmt_from', defaultFrom);
  const [to, setTo]                 = useSessionState('rpt_pmt_to', todayStr());
  const [activePreset, setPreset]   = useSessionState('rpt_pmt_preset', defaultPreset);
  const [filterChit, setFilterChit] = useSessionState('rpt_pmt_chit', '');
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  // Clamp manager's date range to sevenDaysAgo minimum
  const effectiveFrom = isManager && from < sevenDaysAgo ? sevenDaysAgo : from;
  const effectiveTo   = to;

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: () => getChits({ size: 200 }) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});
  const chitMap   = Object.fromEntries(chits.map((c) => [String(c.id), c.name]));
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['all-batches', effectiveFrom, effectiveTo, filterChit],
    queryFn: () => getAllPaymentBatches({ fromDate: effectiveFrom || undefined, toDate: effectiveTo || undefined, chitId: filterChit || undefined }),
  });

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(allowedPresets.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const totalCollected = batches.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);
  const modeBreakdown = batches.reduce((acc, b) => {
    const m = b.paymentMode ?? 'UNKNOWN';
    acc[m] = (acc[m] ?? 0) + Number(b.amount ?? b.totalAmount ?? 0);
    return acc;
  }, {});

  function handleCSV() {
    downloadCSV(
      batches.map((b) => ({
        Date: fmtDate(b.collectedAt ?? b.createdAt),
        Member: memberMap[String(b.memberId)] ?? b.memberName ?? b.memberId ?? '',
        Chit: chitMap[String(b.chitId)] ?? b.chitName ?? b.chitId ?? '',
        'Draw(s)': (b.allocations ?? []).map((a) => `#${a.monthNumber}`).join(', '),
        Amount: b.amount ?? b.totalAmount ?? 0,
        PaymentMode: b.paymentMode ?? '',
        Collector: b.collectorName ?? '',
        Status: b.status ?? '',
      })),
      `payments-${from || 'all'}-to-${to || 'all'}.csv`
    );
  }

  function handlePrint() {
    const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';
    const modeRows = Object.entries(modeBreakdown)
      .map(([m, v]) => `<tr><td>${m.replace(/_/g, ' ')}</td><td>${fmt(v)}</td></tr>`)
      .join('');

    openPrint(`Payments Report — ${periodLabel}`, `
      <div class="meta">
        <span><strong>Period:</strong> ${periodLabel}</span>
        <span><strong>Transactions:</strong> ${batches.length}</span>
        <span><strong>Total Collected:</strong> ${fmt(totalCollected)}</span>
      </div>
      <h2>Payment Mode Breakdown</h2>
      <table><thead><tr><th>Mode</th><th>Amount</th></tr></thead><tbody>${modeRows}</tbody></table>
      <h2>All Transactions</h2>
      <table>
        <thead><tr><th>Date</th><th>Member</th><th>Chit</th><th>Draw(s)</th><th>Amount</th><th>Mode</th><th>Collector</th><th>Status</th></tr></thead>
        <tbody>
          ${batches.map((b) => `<tr>
            <td>${fmtDate(b.collectedAt ?? b.createdAt)}</td>
            <td>${memberMap[String(b.memberId)] ?? b.memberName ?? b.memberId ?? '—'}</td>
            <td>${chitMap[String(b.chitId)] ?? b.chitName ?? b.chitId ?? '—'}</td>
            <td>${(b.allocations ?? []).map((a) => '#' + a.monthNumber).join(', ') || '—'}</td>
            <td>${fmt(b.amount ?? b.totalAmount)}</td>
            <td>${b.paymentMode ?? '—'}</td>
            <td>${b.collectorName ?? '—'}</td>
            <td>${b.status ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Total (${batches.length})</td><td>${fmt(totalCollected)}</td><td colspan="3"></td></tr></tfoot>
      </table>
    `);
  }

  return (
    <div className="space-y-5">
      <DateRangeBar
        from={from} to={to} onFrom={setFrom} onTo={setTo}
        active={activePreset} onPreset={onPreset}
        presets={allowedPresets}
        minDate={isManager ? sevenDaysAgo : undefined}
      />

      {isManager && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          Payment history is limited to the last 7 days for managers.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-52">
          <Select value={filterChit} onChange={(e) => setFilterChit(e.target.value)}>
            <option value="">All Chits</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
            <Printer size={14} /> Print
          </button>
          <button onClick={handleCSV} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {!isLoading && batches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Banknote} label="Total Collected" value={h(totalCollected)}
            sub={`${batches.length} transactions`} color="#16a34a" />
          {Object.entries(modeBreakdown).map(([mode, total]) => (
            <StatCard key={mode} icon={DollarSign} label={mode.replace(/_/g, ' ')} value={h(total)}
              sub={`${batches.filter((b) => b.paymentMode === mode).length} txns`} color="#7c3aed" />
          ))}
        </div>
      )}

      {isLoading ? <ListSkeleton rows={5} cols={4} /> : batches.length === 0 ? (
        <EmptyState icon={Banknote} title="No payments" description="No payment records for the selected period" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Member', 'Chit', 'Draw(s)', 'Amount', 'Mode', 'Collector', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setSelectedBatchId(b.id)}>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(b.collectedAt ?? b.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <MemberLink id={b.memberId} name={memberMap[String(b.memberId)] ?? b.memberName ?? b.memberId} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ChitLink id={b.chitId} name={chitMap[String(b.chitId)] ?? b.chitName ?? b.chitId} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {(b.allocations ?? []).map((a) => `#${a.monthNumber}`).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-green-700">{h(b.amount ?? b.totalAmount)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {b.paymentMode?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{b.collectorName ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={b.status === 'VOIDED' ? 'red' : 'green'} size="xs">{b.status ?? 'OK'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={4} className="px-4 py-3 text-gray-600">Total ({batches.length} transactions)</td>
                  <td className="px-4 py-3 text-green-700">{h(totalCollected)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {selectedBatchId && (
        <PaymentDetailModal batchId={selectedBatchId} onClose={() => setSelectedBatchId(null)} />
      )}
    </div>
  );
}

// ─── Payouts Tab ──────────────────────────────────────────────────────────────
function PayoutsTab() {
  const [from, setFrom]               = useSessionState('rpt_py_from', todayStr());
  const [to, setTo]                   = useSessionState('rpt_py_to', todayStr());
  const [activePreset, setPreset]     = useSessionState('rpt_py_preset', 'Today');
  const [filterChit, setFilterChit]   = useSessionState('rpt_py_chit', '');
  const [filterStatus, setFilterStatus] = useSessionState('rpt_py_status', '');
  const [selectedPayoutId, setSelectedPayoutId] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  const { data: chits = [] }      = useQuery({ queryKey: ['chits'],      queryFn: () => getChits({ size: 200 }) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],       queryFn: listStaff });
  const chitMap      = Object.fromEntries(chits.map((c) => [String(c.id), c.name]));
  const chitStartMap = Object.fromEntries(chits.map((c) => [String(c.id), c.startDate]));
  const memberMap    = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));
  const staffMap     = Object.fromEntries(staffList.map((s) => [String(s.id), s.fullName ?? s.username]));

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['all-payouts-tab', from, to, filterChit],
    queryFn: () => getAllPayouts({ chitId: filterChit || undefined, fromDate: from || undefined, toDate: to || undefined }),
  });

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(PRESETS.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const filtered = filterStatus ? payouts.filter((p) => p.status === filterStatus) : payouts;
  const disbursedTotal = payouts.filter((p) => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);
  const pendingTotal   = payouts.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);

  function handlePrint() {
    const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';
    openPrint(`Payouts Report — ${periodLabel}`, `
      <div class="meta">
        <span><strong>Period:</strong> ${periodLabel}</span>
        <span><strong>Total:</strong> ${payouts.length}</span>
        <span><strong>Disbursed:</strong> ${fmt(disbursedTotal)}</span>
        <span><strong>Pending:</strong> ${fmt(pendingTotal)}</span>
      </div>
      <table>
        <thead><tr><th>Draw</th><th>Chit</th><th>Member</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${filtered.map((p) => { const pdl = drawMonthLabel(chitStartMap[String(p.chitId)], p.monthNumber); return `<tr>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${resolveUUID(p.chitId, {}, chitMap, {})}</td>
            <td>${resolveUUID(p.memberId, memberMap, {}, staffMap)}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td colspan="6">Total Disbursed (${filtered.length})</td><td>${fmt(disbursedTotal)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `);
  }

  return (
    <div className="space-y-5">
      <DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} active={activePreset} onPreset={onPreset} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-52">
          <Select value={filterChit} onChange={(e) => setFilterChit(e.target.value)}>
            <option value="">All Chits</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['PENDING', 'DISBURSED', 'CANCELLED', 'VOIDED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <button onClick={handlePrint} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
          <Printer size={14} /> Print
        </button>
      </div>

      {!isLoading && payouts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={TrendingUp}   label="Total Disbursed"  value={h(disbursedTotal)} sub={`${payouts.filter((p) => p.status === 'DISBURSED').length} payouts`} color="#16a34a" />
          <StatCard icon={AlertCircle}  label="Pending Amount"   value={h(pendingTotal)}   sub={`${payouts.filter((p) => p.status === 'PENDING').length} payouts`}  color="#d97706" />
          <StatCard icon={BarChart2}    label="Total Payouts"    value={payouts.length}       sub={`${payouts.filter((p) => p.status === 'CANCELLED').length} cancelled`} />
        </div>
      )}

      {isLoading ? <ListSkeleton rows={5} cols={4} /> : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No payouts" description="No payout records for the selected filters" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Draw', 'Chit', 'Member', 'Winning Amt', 'Withheld Instmt', 'Adj', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs text-gray-500 font-medium">
                      {h === 'Adj' ? <span title="Additional adjustments (cross-chit, manual)" className="flex items-center gap-1 cursor-help"><Layers size={11} />Adj</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedPayoutId(p.id)}>
                    <td className="px-3 py-2.5 font-semibold text-gray-700">{drawLabel(chitStartMap[String(p.chitId)], p.monthNumber)}</td>
                    <td className="px-3 py-2.5">
                      <ChitLink id={p.chitId} name={resolveUUID(p.chitId, {}, chitMap, {})} />
                    </td>
                    <td className="px-3 py-2.5">
                      <MemberLink id={p.memberId} name={resolveUUID(p.memberId, memberMap, {}, staffMap)} />
                    </td>
                    <td className="px-3 py-2.5">{h(p.winningAmount)}</td>
                    <td className="px-3 py-2.5">
                      {Number(p.discountAmount) > 0
                        ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold">✓</span>{h(p.discountAmount)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><AdjCell p={p} /></td>
                    <td className="px-3 py-2.5 font-semibold">{h(p.netPayoutAmount)}</td>
                    <td className="px-3 py-2.5 text-green-700 font-bold">{h(p.disbursedAmount)}</td>
                    <td className="px-3 py-2.5">
                      <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                    <td className="px-3 py-2.5"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={6} className="px-3 py-3 text-gray-600">Total ({filtered.length})</td>
                  <td className="px-3 py-3">{h(filtered.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                  <td className="px-3 py-3 text-green-700">{h(disbursedTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {selectedPayoutId && (
        <PayoutDetailModal
          payoutId={selectedPayoutId}
          onClose={() => setSelectedPayoutId(null)}
        />
      )}
    </div>
  );
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function resolveDescription(text, memberMap, chitMap, staffMap = {}) {
  if (!text) return '—';
  return text.replace(UUID_RE, (uuid) => {
    const key = uuid.toLowerCase();
    if (memberMap[key]) return memberMap[key];
    if (chitMap[key])   return chitMap[key];
    if (staffMap[key])  return `⚙ ${staffMap[key]}`;
    return uuid;
  });
}

function resolveDescriptionJsx(text, memberMap, chitMap, staffMap = {}) {
  if (!text) return <span className="text-gray-400">—</span>;
  const parts = text.split(UUID_RE);
  const matches = text.match(new RegExp(UUID_RE.source, 'gi')) ?? [];
  return (
    <span>
      {parts.map((part, i) => {
        const uuid = matches[i - 1];
        const resolved = uuid
          ? (memberMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-gray-900">{memberMap[uuid.toLowerCase()]}</strong>
              : chitMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-[#1E3A5F]">{chitMap[uuid.toLowerCase()]}</strong>
              : staffMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-purple-700">⚙ {staffMap[uuid.toLowerCase()]}</strong>
              : <span key={i} className="text-gray-400 text-xs">{uuid}</span>)
          : null;
        return <span key={`p${i}`}>{i > 0 ? resolved : null}{part}</span>;
      })}
    </span>
  );
}

function resolveUUID(uuid, memberMap, chitMap, staffMap = {}) {
  if (!uuid) return '—';
  const key = String(uuid).toLowerCase();
  if (memberMap[key]) return memberMap[key];
  if (chitMap[key])   return chitMap[key];
  if (staffMap[key])  return `⚙ ${staffMap[key]}`;
  return String(uuid);
}

// ─── Treasury Detail Modal ────────────────────────────────────────────────────
function TreasuryDetailModal({ tx, memberMap, chitMap, staffMap, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isTransfer = tx.category === 'TRANSFER';
  const isIn = tx.entryType === 'IN';

  function DRow({ label, value, valueClass = '' }) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`text-sm font-semibold text-gray-900 text-right ${valueClass}`}>{value}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[3px] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white"
        >✕</button>

        {/* Header */}
        <div className="pt-5 pb-4 border-b border-gray-100 flex-shrink-0" style={{ paddingLeft: 28, paddingRight: 52 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">
              Treasury — {isTransfer ? 'Transfer' : isIn ? 'Money In' : 'Money Out'}
            </h2>
            {isTransfer ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">TRANSFER</span>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {tx.entryType}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">{fmtDateTime(tx.createdAt ?? tx.transactionDate)}</p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 py-3" style={{ paddingLeft: 28, paddingRight: 28 }}>
          {/* Amount hero */}
          <div className="flex items-center justify-between py-3 mb-1">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Amount</p>
              <p className={`text-3xl font-bold mt-0.5 ${isTransfer ? 'text-purple-700' : isIn ? 'text-green-700' : 'text-red-600'}`}>
                {isIn ? '+' : '−'}{fmt(tx.amount)}
              </p>
            </div>
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
              tx.accountType === 'CASH'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {tx.accountType ?? '—'}
            </span>
          </div>

          {/* Core details */}
          <div className="border-t border-gray-100">
            {tx.category && <DRow label="Category" value={tx.category} />}
            {(tx.description ?? tx.notes) && (
              <div className="py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {resolveDescriptionJsx(tx.description ?? tx.notes, memberMap, chitMap, staffMap)}
                </p>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="border-t border-gray-100 mt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Details</p>
            <DRow label="Date & Time" value={fmtDateTime(tx.createdAt ?? tx.transactionDate)} />
            {tx.createdBy && (
              <DRow label="Recorded By" value={staffMap[String(tx.createdBy).toLowerCase()] ?? 'Admin'} />
            )}
            {tx.id && (
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Reference ID</span>
                <span className="text-xs font-mono text-gray-400">{String(tx.id).slice(0, 8)}…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Treasury Tab ─────────────────────────────────────────────────────────────
function TreasuryTab() {
  const [from, setFrom]           = useSessionState('rpt_tr_from', todayStr());
  const [to, setTo]               = useSessionState('rpt_tr_to', todayStr());
  const [activePreset, setPreset] = useSessionState('rpt_tr_preset', 'Today');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (n) => hidden ? '••••' : fmt(n);

  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
  });
  const { data: _txData = [], isLoading: loadingTxns } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: getWalletTransactions,
  });
  const transactions = Array.isArray(_txData) ? _txData : (_txData?.content ?? []);
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: chits = [] }      = useQuery({ queryKey: ['chits'],   queryFn: () => getChits({ size: 200 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],   queryFn: listStaff });

  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id).toLowerCase(), m.fullName ?? m.username]));
  const chitMap   = Object.fromEntries(chits.map((c) => [String(c.id).toLowerCase(), c.name]));
  const staffMap  = Object.fromEntries(staffList.map((s) => [String(s.id).toLowerCase(), s.fullName ?? s.username]));

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(PRESETS.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const filtered = transactions.filter((t) => {
    const d = t.createdAt ?? t.transactionDate;
    if (!d) return true;
    const str = String(d);
    const dt = new Date(str.endsWith('Z') || str.includes('+') ? str : str + 'Z');
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (from && date < from) return false;
    if (to   && date > to)   return false;
    return true;
  });

  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const cashBalance  = Number(wallet?.cashBalance ?? 0);
  const bankBalance  = Number(wallet?.bankBalance ?? 0);
  const inflows  = filtered.filter((t) => Number(t.amount ?? 0) > 0).reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const outflows = filtered.filter((t) => Number(t.amount ?? 0) < 0).reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);

  const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';

  function handlePrint() {
    openPrint(`Treasury Report — ${periodLabel}`, `
      <div class="meta"><span><strong>Period:</strong> ${periodLabel}</span></div>
      <div class="summary">
        <div class="summary-item"><p class="lbl">Total Balance</p><p class="val">${fmt(totalBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Cash</p><p class="val">${fmt(cashBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Bank</p><p class="val">${fmt(bankBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Inflows</p><p class="val" style="color:#166534">${fmt(inflows)}</p></div>
        <div class="summary-item"><p class="lbl">Outflows</p><p class="val" style="color:#991b1b">${fmt(outflows)}</p></div>
        <div class="summary-item"><p class="lbl">Transactions</p><p class="val">${filtered.length}</p></div>
      </div>
      <h2>Transaction History</h2>
      <table>
        <thead><tr><th>Date</th><th>Account</th><th>Direction</th><th>Category</th><th>Amount</th><th>Description</th></tr></thead>
        <tbody>
          ${filtered.map((t) => `<tr>
            <td>${fmtDate(t.createdAt ?? t.transactionDate)}</td>
            <td>${t.accountType ?? '—'}</td>
            <td style="color:${t.entryType === 'IN' ? '#166534' : '#991b1b'};font-weight:bold">${t.entryType ?? '—'}</td>
            <td>${t.category ?? '—'}</td>
            <td style="color:${t.entryType === 'IN' ? '#166534' : '#991b1b'};font-weight:bold">
              ${t.entryType === 'IN' ? '+' : '-'}${fmt(t.amount)}
            </td>
            <td>${resolveDescription(t.description ?? t.notes, memberMap, chitMap, staffMap)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Total (${filtered.length})</td><td style="color:#166534;font-weight:bold">+${fmt(inflows)} / <span style="color:#991b1b">-${fmt(outflows)}</span></td><td></td></tr></tfoot>
      </table>
    `);
  }

  if (loadingWallet || loadingTxns) return <ListSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-5">
      <DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} active={activePreset} onPreset={onPreset} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet}     label="Total Balance"  value={h(totalBalance)} color="#7c3aed" />
        <StatCard icon={Banknote}   label="Cash Balance"   value={h(cashBalance)}  color="#1E3A5F" />
        <StatCard icon={TrendingUp} label="Bank Balance"   value={h(bankBalance)}  color="#0891b2" />
        <StatCard icon={BarChart2}  label={`Inflows (${periodLabel})`} value={h(inflows)} sub={`Outflows: ${fmt(outflows)}`} color="#16a34a" />
      </div>

      <div className="flex justify-end">
        <button onClick={handlePrint} className="inline-flex items-center gap-2 text-white text-sm font-medium rounded-lg shadow transition-all active:scale-95" style={{ backgroundColor: '#1E3A5F', paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#162d4a'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#1E3A5F'}>
          <Printer size={14} /> Print Report
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No transactions" description={transactions.length > 0 ? 'No transactions in the selected period' : 'No wallet transactions recorded yet'} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Transaction History</h3>
            <span className="text-xs text-gray-400">{filtered.length} of {transactions.length} transactions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Account', 'Direction', 'Category', 'Amount', 'Description'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id ?? i} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setSelectedTxn(t)}>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(t.createdAt ?? t.transactionDate)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.accountType ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${t.entryType === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.entryType ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.category ?? '—'}</td>
                    <td className={`px-4 py-2.5 font-bold ${t.entryType === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                      {t.entryType === 'IN' ? '+' : '-'}{fmt(t.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[220px]">
                      <span title={t.description ?? t.notes ?? ''} className="block truncate cursor-help">
                        {resolveDescriptionJsx(t.description ?? t.notes, memberMap, chitMap, staffMap)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 text-xs font-semibold">
                  <td colSpan={4} className="px-4 py-2.5 text-gray-600">Total ({filtered.length} transactions)</td>
                  <td className="px-4 py-2.5">
                    <span className="text-green-700">+{fmt(inflows)}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-red-600">-{fmt(outflows)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {selectedTxn && (
        <TreasuryDetailModal
          tx={selectedTxn}
          memberMap={memberMap}
          chitMap={chitMap}
          staffMap={staffMap}
          onClose={() => setSelectedTxn(null)}
        />
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const MANAGER_TABS = ['Overview', 'Member Report', 'Payments', 'Payouts'];

export default function ReportsPage() {
  const { user, planExpiresAt, analyticsEnabled } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'MANAGER';
  const visibleTabs = isManager ? MANAGER_TABS : TABS;

  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'Overview';
  const tab = visibleTabs.includes(rawTab) ? rawTab : 'Overview';
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true });

  // Analytics plans that expired: show "no active subscription" instead of reports
  if (isExpired && analyticsEnabled) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Full visibility into members, payments and payouts</p>
        </div>
        <div className="mt-10 flex flex-col items-center justify-center text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-5">
            <AlertCircle size={28} className="text-orange-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">No Active Subscription</h2>
          <p className="text-sm text-gray-500 mb-1 max-w-sm">
            Your plan has expired. Reports are only available on an active subscription.
          </p>
          <p className="text-xs text-gray-400 mb-6 max-w-xs">
            Renew your plan to restore access to all reports and analytics.
          </p>
          <button
            onClick={() => navigate('/billing')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-colors"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            Renew Plan →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Full visibility into members, payments and payouts</p>
      </div>

      <TabBar active={tab} onChange={setTab} tabs={visibleTabs} />

      <div>
        {tab === 'Overview'      && <OverviewTab />}
        {tab === 'Member Report' && <MemberReportTab />}
        {!isManager && tab === 'Chit Report'   && <ChitReportTab />}
        {tab === 'Payments'      && <PaymentsTab />}
        {tab === 'Payouts'       && <PayoutsTab />}
        {!isManager && tab === 'Treasury'      && <TreasuryTab />}
      </div>
    </div>
  );
}
