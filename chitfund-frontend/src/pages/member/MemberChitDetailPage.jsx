import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getChit, getPaymentHistory, getMemberBalance, getDraws, getWinners, getMyMemberProfile,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  ArrowLeft, BookOpen, CalendarDays, Users, IndianRupee, CheckCircle,
  AlertTriangle, Trophy, Clock, TrendingUp,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  SETTLED:            { dot: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', label: 'Settled' },
  PARTIALLY_PAID:     { dot: '#D97706', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', label: 'Partial' },
  OUTSTANDING:        { dot: '#DC2626', bg: '#FFF5F5', border: '#FECACA', text: '#DC2626', label: 'Outstanding' },
  WAIVED:             { dot: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280', label: 'Waived' },
  PAYOUT_DEDUCTED:    { dot: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9', label: 'Payout Deducted' },
  SETTLEMENT_CLEARED: { dot: '#0F766E', bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E', label: 'Settlement Cleared' },
};

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
    staleTime: 60_000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['memberPortalHistory', member?.id, chitId],
    queryFn: () => getPaymentHistory({ memberId: member.id, chitId }),
    enabled: !!member?.id && !!chitId,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
    enabled: !!chitId,
    staleTime: 60_000,
  });

  const { data: winners = [] } = useQuery({
    queryKey: ['winners', chitId],
    queryFn: () => getWinners(chitId),
    enabled: !!chitId,
    staleTime: 60_000,
  });

  if (memberLoading || chitLoading) return <PageSpinner />;
  if (!chit) return (
    <div className="text-center py-20 text-gray-400">Chit not found.</div>
  );

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

  return (
    <div className="space-y-5 pb-8">
      {/* Back */}
      <button
        onClick={() => navigate('/member')}
        className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1E3A5F] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to My Account
      </button>

      {/* Header card */}
      <div
        className="rounded-2xl p-5 shadow-sm"
        style={{ backgroundColor: '#1E3A5F' }}
      >
        <div className="flex items-start justify-between gap-3">
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
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0"
            style={{ color: ss.text, backgroundColor: ss.bg, borderColor: ss.border }}
          >
            {ss.label}
          </span>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { label: 'Chit Value',    value: fmtAmount(chit.chitValue) },
            { label: 'Monthly',       value: fmtAmount(chit.installmentAmount) },
            { label: 'Duration',      value: chit.durationMonths ? `${chit.durationMonths} months` : '—' },
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
        </div>
      </div>

      {/* Meta pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <InfoPill icon={Users}       label="Members"    value={chit.totalMembers ?? '—'} />
        <InfoPill icon={CalendarDays} label="Start Date" value={fmt(chit.startDate)} />
        <InfoPill icon={CalendarDays} label="End Date"   value={fmt(chit.endDate)} />
        <InfoPill icon={TrendingUp}  label="Draws Done" value={`${draws.filter(d => d.status === 'CLOSED').length} / ${chit.durationMonths ?? draws.length}`} />
      </div>

      {/* My payment summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">My Payment Summary</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
            <p className="text-xs text-gray-400 mb-1">Months Paid</p>
            <p className="text-xl font-bold text-gray-800">{settledCount}<span className="text-sm text-gray-400 font-normal">/{history.length}</span></p>
          </div>
          <div className="text-center rounded-xl px-3 py-3" style={{ backgroundColor: outstanding > 0 ? '#FFF5F5' : '#F0FDF4', border: `1px solid ${outstanding > 0 ? '#FECACA' : '#BBF7D0'}` }}>
            <p className="text-xs mb-1" style={{ color: outstanding > 0 ? '#DC2626' : '#16A34A' }}>Outstanding</p>
            <p className="text-xl font-bold" style={{ color: outstanding > 0 ? '#DC2626' : '#16A34A' }}>
              {outstanding > 0 ? fmtAmount(outstanding) : '₹0'}
            </p>
          </div>
          <div className="text-center rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
            <p className="text-xs text-gray-400 mb-1">Total Paid</p>
            <p className="text-xl font-bold text-gray-800">{fmtAmount(totalPaid)}</p>
          </div>
        </div>

        {/* Progress bar */}
        {history.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{settledCount} of {history.length} months settled</span>
              <span>{Math.round((settledCount / history.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${(settledCount / history.length) * 100}%`,
                  backgroundColor: outstanding > 0 ? '#DC2626' : '#16A34A',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Month-by-month breakdown */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Month-by-Month</h3>
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
                      {/* Month number */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: ms.dot }}
                      >
                        {r.monthNumber}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">Month {r.monthNumber}</span>
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
                              style={{ width: `${pct}%`, backgroundColor: ms.dot }}
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
                          {fmtAmount(r.amountPaid)}
                          <span className="text-xs text-gray-400 font-normal"> / {fmtAmount(r.amountDue)}</span>
                        </p>
                        {cycleOutstanding > 0 && (r.status === 'OUTSTANDING' || r.status === 'PARTIALLY_PAID') && (
                          <p className="text-xs text-red-500">{fmtAmount(cycleOutstanding)} due</p>
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
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: iMeWon ? '#D4A017' : '#1E3A5F' }}
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
                        {draw.totalCollected > 0 && ` · Collected ${fmtAmount(draw.totalCollected)}`}
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
