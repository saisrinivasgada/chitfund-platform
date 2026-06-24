import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getUserById, getChitsForMember, getPaymentHistory,
  getMemberTotalBalance, getPayoutsForMember,
} from '../../services/api';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import { PageSpinner } from '../../components/ui/Spinner';
import Badge, { statusBadge } from '../../components/ui/Badge';
import {
  ArrowLeft, User, BookOpen, CreditCard, Banknote,
  CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';

function PaymentStatusBadge({ status, overdue }) {
  const cfg = {
    SETTLED:          { bg: 'bg-green-100',  text: 'text-green-700'  },
    PARTIALLY_PAID:   { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    OUTSTANDING:      { bg: overdue ? 'bg-red-100'  : 'bg-gray-100', text: overdue ? 'text-red-700' : 'text-gray-600' },
    WAIVED:           { bg: 'bg-gray-100',   text: 'text-gray-400'   },
    PAYOUT_DEDUCTED:  { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    SETTLEMENT_CLEARED: { bg: 'bg-purple-100', text: 'text-purple-700' },
  }[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function ChitRow({ chit, adminId, hidden }) {
  const [open, setOpen] = useState(false);
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['paymentHistory', adminId, chit.id],
    queryFn: () => getPaymentHistory({ memberId: adminId, chitId: chit.id }),
    enabled: open,
    staleTime: 60_000,
  });

  const totalDue = history.reduce((s, p) => s + Number(p.amountDue ?? 0), 0);
  const totalPaid = history.reduce((s, p) => s + Number(p.amountPaid ?? 0), 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#EFF4FA' }}>
          <BookOpen size={16} style={{ color: '#1E3A5F' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{chit.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
            <span className="text-xs text-gray-400">
              ₹{Number(chit.installmentAmount ?? 0).toLocaleString('en-IN')}/month
            </span>
          </div>
        </div>
        {!hidden && balance > 0 && (
          <span className="text-sm font-semibold text-red-600 flex-shrink-0">
            ₹{balance.toLocaleString('en-IN')} owed
          </span>
        )}
        {!hidden && balance <= 0 && totalPaid > 0 && (
          <span className="text-xs text-green-600 flex-shrink-0 flex items-center gap-1">
            <CheckCircle size={12} /> Up to date
          </span>
        )}
        {open ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 overflow-auto max-h-72" style={{ WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <div className="px-5 py-4 text-xs text-gray-400 animate-pulse">Loading payment records…</div>
          ) : history.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400 italic">No payment records found.</div>
          ) : (
            <table className="w-full text-sm min-w-[440px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50">Draw</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50">Due</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50">Paid</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50">Balance</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((p) => {
                  const bal = Number(p.balance ?? 0);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-700 text-xs">Draw {p.drawMonthNumber ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {hidden ? '••••••' : `₹${Number(p.amountDue).toLocaleString('en-IN')}`}
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-700">
                        {hidden ? '••••••' : Number(p.amountPaid) > 0 ? `₹${Number(p.amountPaid).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {hidden ? '••••••' : bal > 0
                          ? <span className="text-red-600">₹{bal.toLocaleString('en-IN')}</span>
                          : <span className="text-green-600">✓</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <PaymentStatusBadge status={p.status} overdue={p.overdue} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminParticipationPage() {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();

  const { data: adminUser, isLoading: userLoading } = useQuery({
    queryKey: ['user', adminId],
    queryFn: () => getUserById(adminId),
    enabled: !!adminId,
    staleTime: 10 * 60_000,
  });

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['memberChits', adminId],
    queryFn: () => getChitsForMember(adminId),
    enabled: !!adminId,
    staleTime: 60_000,
  });

  const { data: totalBalance } = useQuery({
    queryKey: ['adminBalance', adminId],
    queryFn: () => getMemberTotalBalance(adminId),
    enabled: !!adminId,
    staleTime: 60_000,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['adminPayouts', adminId],
    queryFn: () => getPayoutsForMember(adminId),
    enabled: !!adminId,
    staleTime: 60_000,
  });

  if (userLoading || chitsLoading) return <PageSpinner />;

  const name = adminUser?.fullName ?? adminUser?.username ?? 'Admin';
  const initials = name.slice(0, 2).toUpperCase();

  const disbursed = payouts.filter((p) => p.status === 'DISBURSED');
  const pending = payouts.filter((p) => p.status === 'PENDING' || p.status === 'PARTIALLY_DISBURSED');

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1E3A5F] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Admin profile card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: '#B45309' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                {name}
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                ★ {adminUser?.role ?? 'Admin'}
              </span>
            </div>
            {adminUser?.username && adminUser.username !== adminUser.fullName && (
              <p className="text-sm text-gray-500 mt-0.5">@{adminUser.username}</p>
            )}
            {adminUser?.email && (
              <p className="text-xs text-gray-400 mt-0.5">{adminUser.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{chits.length}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <BookOpen size={11} /> Enrolled Chits
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">
            {hidden ? '••' : `₹${Number(totalBalance ?? 0).toLocaleString('en-IN')}`}
          </p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <CreditCard size={11} /> Total Outstanding
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{disbursed.length}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <CheckCircle size={11} /> Disbursements Done
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <Clock size={11} /> Pending Payouts
          </p>
        </div>
      </div>

      {/* Payout records */}
      {payouts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Banknote size={15} style={{ color: '#1E3A5F' }} /> Payout Records
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Chit</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-700 font-medium text-sm">
                        {chits.find((c) => c.id === p.chitId)?.name ?? `Chit #${String(p.chitId).slice(0, 8)}`}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                        {hidden ? '••••••' : `₹${Number(p.netPayoutAmount ?? p.payoutAmount ?? 0).toLocaleString('en-IN')}`}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.status === 'DISBURSED' ? 'bg-green-100 text-green-700'
                          : p.status === 'PENDING' ? 'bg-amber-100 text-amber-700'
                          : p.status === 'PARTIALLY_DISBURSED' ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {p.status === 'DISBURSED' && <CheckCircle size={10} />}
                          {(p.status === 'PENDING' || p.status === 'PARTIALLY_DISBURSED') && <Clock size={10} />}
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Chit-by-chit payment breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CreditCard size={15} style={{ color: '#1E3A5F' }} /> Payment Details by Chit
        </h3>
        {chits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
            Not enrolled in any chit funds.
          </div>
        ) : (
          <div className="space-y-3">
            {chits.map((chit) => (
              <ChitRow key={chit.id} chit={chit} adminId={adminId} hidden={hidden} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
