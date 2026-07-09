import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  getMe,
  getChitsForMember, getMemberTotalBalance, getMemberBalance,
  getPayoutsForMember, getPaymentHistory, getWinners,
} from '../../services/api';
import Badge, { statusBadge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import Button from '../../components/ui/Button';
import {
  ArrowLeft, BookOpen, Trophy, History, AlertTriangle, ExternalLink, Pencil,
} from 'lucide-react';

function InfoChip({ label, value, highlight }) {
  return (
    <div className={`flex flex-col px-4 py-3 rounded-xl border ${highlight ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
      <span className="text-xs text-gray-500 mb-0.5">{label}</span>
      <span className={`text-base font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

// ─── Per-chit payment history accordion ──────────────────────────────────────
function ChitPaymentHistory({ memberId, chit }) {
  const [open, setOpen] = useState(false);

  const { data: balance = 0 } = useQuery({
    queryKey: ['adminBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
  });

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['adminPaymentHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: open,
  });

  const outstanding = Number(balance ?? 0);
  const hasBalance = outstanding > 0;

  const statusColor = {
    SETTLED: 'text-green-700 bg-green-50',
    PARTIALLY_PAID: 'text-amber-700 bg-amber-50',
    OUTSTANDING: 'text-gray-600 bg-gray-50',
    WAIVED: 'text-gray-400 bg-gray-50',
  };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}>
            <BookOpen size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{chit.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 ml-3">
          {hasBalance ? (
            <span className="text-sm font-semibold text-red-600">₹{outstanding.toLocaleString('en-IN')} owed</span>
          ) : (
            <span className="text-sm text-green-600 font-medium">Clear</span>
          )}
          <span className="text-gray-300">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50/40">
          {isLoading ? (
            <div className="py-4 flex justify-center"><PageSpinner /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payment records yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${r.overdue ? 'bg-red-50 border border-red-100' : 'bg-white border border-gray-100'}`}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1E3A5F' }}>
                      M{r.monthNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">Month {r.monthNumber}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[r.status] ?? 'text-gray-500 bg-gray-50'}`}>
                          {r.status}
                        </span>
                        {r.overdue && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle size={10} /> Overdue
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{
                          width: `${pct}%`,
                          backgroundColor: pct === 100 ? '#16A34A' : r.overdue ? '#DC2626' : '#1E3A5F',
                        }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">₹{Number(r.amountPaid).toLocaleString()}</p>
                      <p className="text-xs text-gray-400">of ₹{Number(r.amountDue).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Won cycles section — fetches all chit winners in parallel ────────────────
const PAYOUT_STATUS_STYLE = {
  PENDING:   'bg-amber-100 text-amber-700',
  DISBURSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function WonDrawsSection({ memberId, chits }) {
  const navigate = useNavigate();

  // Fetch winners for all enrolled chits in parallel
  const winnerQueries = useQueries({
    queries: chits.map((c) => ({
      queryKey: ['winners', c.id],
      queryFn: () => getWinners(c.id),
      enabled: chits.length > 0,
    })),
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['adminPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  // Key: `${chitId}:${monthNumber}` for O(1) payout lookup per won cycle
  const payoutByKey = Object.fromEntries(
    payouts.map((p) => [`${p.chitId}:${p.monthNumber}`, p])
  );

  // Flatten all won cycles across chits, keeping chitName for display
  const anyLoading = winnerQueries.some((q) => q.isLoading);
  const wonCycles = chits.flatMap((chit, i) => {
    const allWinners = winnerQueries[i]?.data ?? [];
    return allWinners
      .filter((w) => String(w.memberId ?? w.winnerId) === String(memberId))
      .map((w) => ({ ...w, chitName: chit.name, chitId: chit.id }));
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-[#1E3A5F]" />
        <h3 className="font-semibold text-gray-900">Won Draws & Disbursements</h3>
      </div>

      {anyLoading ? (
        <PageSpinner />
      ) : wonCycles.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No won draws yet.</p>
      ) : (
        <div className="space-y-2">
          {wonCycles.map((w) => {
            const payout = payoutByKey[`${w.chitId}:${w.monthNumber}`] ?? null;
            return (
              <div key={`${w.chitId}-${w.monthNumber}-${w.id}`}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#D4A017' }}>
                  C{w.monthNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {w.chitName} — Draw {w.monthNumber}
                    </span>
                    {payout ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYOUT_STATUS_STYLE[payout.status] ?? ''}`}>
                        {payout.status}
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        No payout yet
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Won ₹{Number(w.winningAmount ?? 0).toLocaleString('en-IN')}
                    {payout?.netPayoutAmount && ` · Net ₹${Number(payout.netPayoutAmount).toLocaleString('en-IN')}`}
                    {payout?.disbursedAt && ` · Disbursed ${new Date(payout.disbursedAt).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/chits/${w.chitId}`)}
                  className="text-gray-400 hover:text-[#1E3A5F] transition-colors flex-shrink-0"
                  title="Go to chit"
                >
                  <ExternalLink size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MyAccountPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['adminChits', me?.id],
    queryFn: () => getChitsForMember(me.id),
    enabled: !!me?.id,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['adminTotalBalance', me?.id],
    queryFn: () => getMemberTotalBalance(me.id),
    enabled: !!me?.id,
  });

  if (meLoading) return <PageSpinner />;
  if (!me) return <p className="text-center py-20 text-gray-400">Could not load account information.</p>;

  const outstanding = Number(totalOutstanding);
  const initials = (me.name ?? me.username ?? 'A').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: '#D4A017' }}
          >
            {initials}
          </div>
          <div>
            <h2
              className="text-2xl font-bold"
              style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
            >
              {me.fullName ?? me.name ?? me.username}
            </h2>
            {me.username && (
              <p className="text-sm text-gray-400 mb-1">@{me.username}{me.phone ? ` · ${me.phone}` : ''}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                ★ Admin
              </span>
              {outstanding > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  ₹{outstanding.toLocaleString('en-IN')} outstanding
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  No outstanding dues
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowEditProfile(true)} className="flex-shrink-0">
          <Pencil size={14} /> Edit Profile
        </Button>
      </div>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => { setShowEditProfile(false); setHistoryVersion((v) => v + 1); }}
          role={authUser?.role ?? 'ADMIN'}
          currentUser={{ fullName: me.fullName, username: me.username, email: me.email, phone: me.phone }}
          userId={me.id}
        />
      )}

      <ProfileChangeHistory key={historyVersion} userId={me.id} />

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoChip label="Enrolled Chits" value={chits.length} />
        <InfoChip label="Active Chits" value={chits.filter((c) => c.status === 'ACTIVE').length} />
        <InfoChip
          label="Total Outstanding"
          value={outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'}
          highlight={outstanding > 0}
        />
        <InfoChip label="Completed Chits" value={chits.filter((c) => c.status === 'COMPLETED').length} />
      </div>

      {/* Enrolled Chits with inline payment history */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Enrolled Chits & Payments</h3>
        </div>

        {chitsLoading ? (
          <PageSpinner />
        ) : chits.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">You are not enrolled in any chit funds yet.</p>
            <button
              onClick={() => navigate('/chits')}
              className="mt-3 text-sm text-[#1E3A5F] font-medium hover:underline"
            >
              Go to Chit Funds →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {chits.map((c) => (
              <ChitPaymentHistory key={c.id} memberId={me.id} chit={c} />
            ))}
          </div>
        )}
      </div>

      {/* Won Cycles & Payouts — pulls from MonthlyWinner (not just payout-service) */}
      {!chitsLoading && <WonDrawsSection memberId={me.id} chits={chits} />}
    </div>
  );
}
