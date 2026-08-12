import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getChit, getPaymentHistory, getMemberBalance, getDraws, getWinners, getMyMemberProfile,
  getPayoutsForMember, getPayoutById,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import {
  ArrowLeft, BookOpen, CalendarDays, Users, CheckCircle,
  AlertTriangle, Trophy, Clock, TrendingUp, ChevronRight, Banknote, CreditCard, Building2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utc(s) { return s ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null; }
function fmt(d) {
  if (!d) return '—';
  return new Date(utc(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmount(v) {
  return '₹' + Number(v ?? 0).toLocaleString('en-IN');
}

const CHIT_STATUS_STYLE = {
  ACTIVE:    { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Active' },
  COMPLETED: { text: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', label: 'Completed' },
  PAUSED:    { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Paused' },
  PENDING:   { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Pending' },
  DRAFT:     { text: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', label: 'Draft' },
};

const MONTH_STATUS = {
  SETTLED:            { dot: '#16A34A', circleBg: '#DCFCE7', circleText: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', label: 'Settled' },
  PARTIALLY_PAID:     { dot: '#D97706', circleBg: '#FEF3C7', circleText: '#92400E', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', label: 'Partial' },
  OUTSTANDING:        { dot: '#B91C1C', circleBg: '#FEE2E2', circleText: '#991B1B', bg: '#FFF9F9', border: '#FECACA', text: '#B91C1C', label: 'Outstanding' },
  WAIVED:             { dot: '#9CA3AF', circleBg: '#F3F4F6', circleText: '#4B5563', bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280', label: 'Waived' },
  PAYOUT_DEDUCTED:    { dot: '#7C3AED', circleBg: '#EDE9FE', circleText: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9', label: 'Payout Deducted' },
  SETTLEMENT_CLEARED: { dot: '#0F766E', circleBg: '#CCFBF1', circleText: '#065F46', bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E', label: 'Settlement Cleared' },
};

// ─── Payout detail modal (full admin-style breakdown) ─────────────────────────

const MODE_ICON = { CASH: Banknote, UPI: CreditCard, BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2, BANK_TRANSFER: Building2 };

function PayoutDetailModal({ payoutSummary, onClose, hidden, chitName }) {
  const { data: payout, isLoading } = useQuery({
    queryKey: ['payout', payoutSummary.id],
    queryFn: () => getPayoutById(payoutSummary.id),
    enabled: !!payoutSummary.id,
    initialData: payoutSummary,
  });

  const p = payout ?? payoutSummary;
  const isDisbursed = p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED';
  const disbursements = p.disbursements ?? [];
  const totalWithheld = Number(p.discountAmount ?? 0);

  const fmtA = (v) => hidden ? '••••••' : `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
  const fmtD = (d) => d ? new Date(utc(d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <Modal title={`Payout — Draw #${p.monthNumber}`} onClose={onClose} size="lg">
      <div className="space-y-5 pb-2">
        {chitName && (
          <p className="text-xs text-gray-500 -mt-4 mb-1">{chitName}</p>
        )}
        {isLoading && <div className="py-6 text-center text-sm text-gray-400">Loading details…</div>}

        {/* Payout breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Payout Breakdown</p>
          </div>
          <div className="px-4 divide-y divide-gray-100">
            <div className="flex justify-between py-3.5">
              <p className="text-sm font-semibold text-gray-900">Winning Amount</p>
              <p className="text-sm font-bold text-gray-900">{fmtA(p.winningAmount)}</p>
            </div>
            {Number(p.installmentSettlement ?? 0) > 0 && (
              <div className="flex justify-between items-start py-3.5">
                <div>
                  <p className="text-sm text-gray-600">Installment Withheld</p>
                  <p className="text-xs text-gray-400 mt-0.5">Draw #{p.monthNumber} installment</p>
                </div>
                <p className="text-sm text-red-600 tabular-nums">− {fmtA(p.installmentSettlement)}</p>
              </div>
            )}
            {Number(p.crossChitSettlement ?? 0) > 0 && (
              <div className="flex justify-between items-start py-3.5">
                <div>
                  <p className="text-sm text-gray-600">Cross-Chit Settlement</p>
                  <p className="text-xs text-gray-400 mt-0.5">Outstanding dues from other chits</p>
                </div>
                <p className="text-sm text-red-600 tabular-nums">− {fmtA(p.crossChitSettlement)}</p>
              </div>
            )}
            {Number(p.manualAdjustment ?? 0) > 0 && (
              <div className="flex justify-between py-3.5">
                <p className="text-sm text-gray-600">Manual Adjustment</p>
                <p className="text-sm text-red-600 tabular-nums">− {fmtA(p.manualAdjustment)}</p>
              </div>
            )}
            {totalWithheld > 0 && (
              <div className="flex justify-between py-3 bg-red-50 -mx-4 px-4">
                <p className="text-sm text-red-600 font-semibold">Total Withheld</p>
                <p className="text-sm font-bold text-red-600">− {fmtA(totalWithheld)}</p>
              </div>
            )}
            <div className="flex justify-between py-3.5 bg-gray-50 -mx-4 px-4">
              <p className="text-sm font-bold text-gray-900">Net Payout</p>
              <p className="text-base font-bold" style={{ color: '#1E3A5F' }}>{fmtA(p.netPayoutAmount)}</p>
            </div>
          </div>
        </div>

        {/* Disbursements */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Disbursements</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Paid:</span>
              <span className="font-semibold text-green-700">{fmtA(p.disbursedAmount)}</span>
              {Number(p.remainingAmount ?? 0) > 0 && (
                <span className="text-amber-600">· {fmtA(p.remainingAmount)} pending</span>
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
                const ModeIcon = MODE_ICON[d.mode] ?? Banknote;
                return (
                  <div key={d.id ?? i} className="flex items-center gap-3.5 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                      <ModeIcon size={14} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{fmtA(d.amount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}
                      </p>
                      {d.notes && <p className="text-xs text-gray-500 italic mt-0.5">{d.notes}</p>}
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">{fmtD(d.disbursedAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        {p.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm text-amber-900">{p.notes}</p>
          </div>
        )}

        {/* Cancellation/void reason */}
        {(p.cancellationReason || p.voidReason) && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">
              {p.cancellationReason ? 'Cancellation Reason' : 'Void Reason'}
            </p>
            <p className="text-sm text-red-900">{p.cancellationReason ?? p.voidReason}</p>
          </div>
        )}

        {/* Created date */}
        {p.createdAt && (
          <p className="text-xs text-gray-400 px-1">
            Created {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── Info pill ────────────────────────────────────────────────────────────────

function InfoPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
      <Icon size={14} className="text-[#1E3A5F] flex-shrink-0" />
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MemberChitDetailPage() {
  const { chitId } = useParams();
  const navigate = useNavigate();

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
    retry: false,
  });

  const { data: chit, isLoading: chitLoading } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    enabled: !!chitId,
  });

  const { data: balance } = useQuery({
    queryKey: ['memberPortalBalance', member?.id, chitId],
    queryFn: () => getMemberBalance({ memberId: member.id, chitId }),
    enabled: !!member?.id && !!chitId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['memberPortalHistory', member?.id, chitId],
    queryFn: () => getPaymentHistory({ memberId: member.id, chitId }),
    enabled: !!member?.id && !!chitId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
    enabled: !!chitId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: winners = [] } = useQuery({
    queryKey: ['winners', chitId],
    queryFn: () => getWinners(chitId),
    enabled: !!chitId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['memberPortalPayouts', member?.id],
    queryFn: () => getPayoutsForMember(member.id),
    enabled: !!member?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const [showPayoutDetail, setShowPayoutDetail] = useState(null);

  const { hidden } = useHiddenAmounts();

  if (memberLoading || chitLoading) return <PageSpinner />;
  if (!chit) return (
    <div className="text-center py-20 text-gray-400">Chit not found.</div>
  );
  const ha = (v) => hidden ? '••••••' : fmtAmount(v);
  const ss = CHIT_STATUS_STYLE[chit.status] ?? CHIT_STATUS_STYLE.ACTIVE;
  const outstanding = Number(balance?.totalOutstanding ?? 0);
  const totalPaid = history.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  const totalDue  = history.reduce((s, r) => s + Number(r.amountDue ?? 0), 0);
  const settledCount = history.filter((r) => ['SETTLED', 'WAIVED', 'PAYOUT_DEDUCTED', 'SETTLEMENT_CLEARED'].includes(r.status)).length;

  // Build a draw-info lookup: monthNumber → draw
  const drawByMonth = Object.fromEntries(draws.map((d) => [d.monthNumber, d]));
  // Build a winner-info lookup: monthNumber → winner
  const winnerByMonth = Object.fromEntries(winners.map((w) => [w.monthNumber, w]));

  const iWon = (monthNumber) => {
    const w = winnerByMonth[monthNumber];
    return w && member && w.memberId === member.id;
  };

  // My payout for this chit (if I won a draw)
  const myPayout = allPayouts.find((p) => p.chitId === chitId);

  return (
    <div className="space-y-5 pb-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1E3A5F] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to Chits
      </button>

      {/* Header card */}
      <div
        className="rounded-2xl p-5 shadow-sm"
        style={{ background: 'linear-gradient(90deg, #1E3A5F 0%, #2563EB 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: 'Merriweather, serif' }}>
              {chit.name}
            </h2>
            {chit.description && (
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{chit.description}</p>
            )}
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {[
            { label: 'Chit Value', value: ha(chit.chitValue) },
            { label: 'Monthly',    value: ha(chit.installmentAmount) },
            { label: 'Duration',   value: chit.durationMonths ? `${chit.durationMonths} months` : '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{value}</p>
            </div>
          ))}
          <div
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ backgroundColor: `${ss.text}30`, border: `1px solid ${ss.text}60` }}
          >
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Status</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: ss.text === '#6B7280' || ss.text === '#9CA3AF' ? '#E5E7EB' : ss.text }}>
              {ss.label}
            </p>
          </div>
        </div>
      </div>

      {/* Meta pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <InfoPill icon={Users}       label="Members"    value={chit.totalMembers ?? '—'} />
        <InfoPill icon={CalendarDays} label="Start Date" value={fmt(chit.startDate)} />
        <InfoPill icon={CalendarDays} label="End Date"   value={fmt(chit.endDate)} />
        <InfoPill icon={TrendingUp}  label="Draws Done" value={`${history.length} / ${chit.durationMonths ?? '—'}`} />
      </div>

      {/* My payment summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">My Payment Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
            <p className="text-xs text-gray-400 mb-1">Draws Paid</p>
            <p className="text-xl font-bold text-gray-800">{settledCount}<span className="text-sm text-gray-400 font-normal">/{chit.durationMonths ?? '—'}</span></p>
          </div>
          <div className="text-center rounded-xl px-3 py-3" style={{ backgroundColor: outstanding > 0 ? '#FFF9F9' : '#F0FDF4', border: `1px solid ${outstanding > 0 ? '#FECACA' : '#BBF7D0'}` }}>
            <p className="text-xs mb-1" style={{ color: outstanding > 0 ? '#B91C1C' : '#16A34A' }}>Outstanding</p>
            <p className="text-xl font-bold" style={{ color: outstanding > 0 ? '#B91C1C' : '#16A34A' }}>
              {hidden ? '••••••' : (outstanding > 0 ? fmtAmount(outstanding) : '₹0')}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {chit.durationMonths > 0 && (
          <div className="mt-4">
            {(() => {
              const total = chit.durationMonths;
              const pct = Math.round((settledCount / total) * 100);
              return (
                <>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{settledCount} of {total} draws settled</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: outstanding > 0 ? '#B91C1C' : '#16A34A',
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Month-by-month breakdown */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Draw-by-Draw</h3>
          {histLoading ? (
            <div className="py-6 flex justify-center"><PageSpinner /></div>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const ms = MONTH_STATUS[r.status] ?? MONTH_STATUS.OUTSTANDING;
                const draw = drawByMonth[r.monthNumber];
                const won = iWon(r.monthNumber);
                const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
                const cycleOutstanding = Number(r.amountDue) - Number(r.amountPaid);

                return (
                  <div
                    key={r.id}
                    className="rounded-xl border px-4 py-3"
                    style={{ borderColor: ms.border, backgroundColor: ms.bg }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Draw number badge */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: ms.circleBg, color: ms.circleText, border: `1.5px solid ${ms.border}` }}
                      >
                        {r.monthNumber}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">Draw {r.monthNumber}</span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ color: ms.text, backgroundColor: 'rgba(255,255,255,0.7)' }}
                          >
                            {ms.label}
                          </span>
                          {won && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Trophy size={10} /> You won!
                            </span>
                          )}
                          {r.overdue && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle size={10} /> Overdue
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex-1 bg-white/60 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: ms.circleText }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {draw?.dueDate ? fmt(draw.dueDate) : ''}
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-800">
                          {ha(r.amountPaid)}
                          <span className="text-xs text-gray-400 font-normal"> / {ha(r.amountDue)}</span>
                        </p>
                        {cycleOutstanding > 0 && (r.status === 'OUTSTANDING' || r.status === 'PARTIALLY_PAID') && (
                          <p className="text-xs text-red-500">{ha(cycleOutstanding)} due</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Payout */}
      {myPayout && (() => {
        const isDisbursed = myPayout.status === 'DISBURSED' || myPayout.status === 'PARTIALLY_DISBURSED';
        const isPartial   = myPayout.status === 'PARTIALLY_DISBURSED';
        const isCancelled = myPayout.status === 'CANCELLED' || myPayout.status === 'VOIDED';
        const statusStyle = isDisbursed
          ? { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: isPartial ? 'Partially Disbursed' : 'Disbursed' }
          : isCancelled
          ? { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', label: myPayout.status === 'VOIDED' ? 'Voided' : 'Cancelled' }
          : { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Payout Created' };
        const totalWithheld = Number(myPayout.discountAmount ?? 0);
        return (
          <button
            type="button"
            onClick={() => setShowPayoutDetail(myPayout)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-200 transition-all duration-150 active:scale-[0.99] cursor-pointer focus:outline-none"
          >
            <div className="h-0.5 w-full" style={{ backgroundColor: statusStyle.color }} />
            <div className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${statusStyle.color}18` }}>
                    <Trophy size={18} style={{ color: statusStyle.color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">My Payout — Draw #{myPayout.monthNumber}</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: statusStyle.color, backgroundColor: statusStyle.bg, border: `1px solid ${statusStyle.border}` }}>
                      {statusStyle.label}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <p className="text-xs text-gray-400">Won</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{hidden ? '••••••' : `₹${Number(myPayout.winningAmount ?? 0).toLocaleString('en-IN')}`}</p>
                </div>
                <div className="text-center rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <p className="text-xs text-gray-400">Withheld</p>
                  <p className="text-sm font-semibold text-red-500 mt-0.5">{totalWithheld > 0 ? (hidden ? '••••••' : `− ₹${totalWithheld.toLocaleString('en-IN')}`) : '—'}</p>
                </div>
                <div className="text-center rounded-xl px-3 py-2.5" style={{ backgroundColor: isDisbursed ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${isDisbursed ? '#BBF7D0' : '#FDE68A'}` }}>
                  <p className="text-xs" style={{ color: isDisbursed ? '#16A34A' : '#B45309' }}>Net</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: isDisbursed ? '#16A34A' : '#B45309' }}>{hidden ? '••••••' : `₹${Number(myPayout.netPayoutAmount ?? 0).toLocaleString('en-IN')}`}</p>
                </div>
              </div>
              {isDisbursed && myPayout.disbursedAt && (
                <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                  <Banknote size={12} /> Paid on {new Date(myPayout.disbursedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              {!isDisbursed && !isCancelled && (
                <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <Clock size={13} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Pending Disbursement</p>
                    {myPayout.allocatedMonth && (
                      <p className="text-xs text-amber-600">Draw #{myPayout.allocatedMonth}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </button>
        );
      })()}

      {/* Full payout detail modal */}
      {showPayoutDetail && <PayoutDetailModal payoutSummary={showPayoutDetail} onClose={() => setShowPayoutDetail(null)} hidden={hidden} chitName={chit?.name} />}

      {/* Draw results */}
      {draws.filter(d => d.status === 'CLOSED').length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Draw Results</h3>
          <div className="space-y-2">
            {draws
              .filter(d => d.status === 'CLOSED')
              .sort((a, b) => a.monthNumber - b.monthNumber)
              .map((draw) => {
                const winner = winnerByMonth[draw.monthNumber];
                const iMeWon = winner && member && winner.memberId === member.id;
                return (
                  <div
                    key={draw.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${iMeWon ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={iMeWon
                        ? { backgroundColor: '#FEF9C3', color: '#92400E', border: '1.5px solid #FDE68A' }
                        : { backgroundColor: '#EEF2F8', color: '#1E3A5F', border: '1.5px solid #CBD5E1' }
                      }
                    >
                      {draw.monthNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">Draw {draw.monthNumber}</span>
                        {iMeWon && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <Trophy size={10} /> You won
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {draw.closedAt ? fmt(draw.closedAt) : ''}
                        {draw.totalCollected > 0 && ` · Collected ${ha(draw.totalCollected)}`}
                      </p>
                    </div>
                    {draw.totalMembers > 0 && (
                      <div className="text-right flex-shrink-0 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <CheckCircle size={11} className="text-green-500" />
                          {draw.settledCount}/{draw.totalMembers}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
