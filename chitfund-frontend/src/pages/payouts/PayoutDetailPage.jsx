import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Building2, Hash, Calendar, IndianRupee, CheckCircle,
  Clock, XCircle, AlertCircle, CreditCard, Banknote, Minus, ChevronRight,
} from 'lucide-react';
import { getPayoutById, getMember, getChit, listStaff, getMembers } from '../../services/api';

function utc(s) { return s ? (s.endsWith('Z') ? s : s + 'Z') : null; }
function fmtAmt(v) { return '₹' + Number(v ?? 0).toLocaleString('en-IN'); }
function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(utc(dt)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(utc(dt));
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const STATUS_CONFIG = {
  PENDING:             { label: 'Pending',             icon: Clock,        bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  PARTIALLY_DISBURSED: { label: 'Partially Disbursed', icon: AlertCircle,  bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  DISBURSED:           { label: 'Disbursed',           icon: CheckCircle,  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  CANCELLED:           { label: 'Cancelled',           icon: XCircle,      bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  VOIDED:              { label: 'Voided',              icon: XCircle,      bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
};

const MODE_ICON = {
  CASH: Banknote, UPI: CreditCard,
  BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2, BANK_TRANSFER: Building2,
};

function DeductionRow({ label, amount, sub, highlight }) {
  if (!amount || Number(amount) === 0) return null;
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 ${highlight ? 'font-semibold' : ''}`}>
      <div>
        <p className={`text-sm ${highlight ? 'text-gray-900' : 'text-gray-600'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm tabular-nums ${highlight ? 'text-gray-900' : 'text-red-600'}`}>
        {highlight ? fmtAmt(amount) : `− ${fmtAmt(amount)}`}
      </p>
    </div>
  );
}

export default function PayoutDetailPage() {
  const { payoutId } = useParams();
  const navigate = useNavigate();

  const { data: payout, isLoading, isError } = useQuery({
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
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const nameMap = Object.fromEntries([
    ...staff.map((s) => [String(s.id), s.fullName ?? s.username]),
    ...allMembers.map((m) => [String(m.id), m.fullName ?? m.username]),
  ]);

  if (isLoading) return (
    <div className="max-w-xl mx-auto p-4 space-y-3 animate-pulse">
      {[80, 160, 200, 120].map((h, i) => (
        <div key={i} className="bg-gray-100 rounded-xl" style={{ height: h }} />
      ))}
    </div>
  );

  if (isError || !payout) return (
    <div className="max-w-xl mx-auto p-4 text-center text-gray-500 text-sm py-16">
      Payout not found.
    </div>
  );

  const status   = STATUS_CONFIG[payout.status] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = status.icon;
  const hasDeductions = Number(payout.discountAmount ?? 0) > 0;
  const disbursements = payout.disbursements ?? [];

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Payout — Draw #{payout.monthNumber}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(payout.createdAt)}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${status.bg} ${status.text} ${status.border}`}>
          <StatusIcon size={11} />
          {status.label}
        </div>
      </div>

      {/* Member + Chit */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-[#1E3A5F]" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Winner</p>
            <p className="text-sm font-semibold text-gray-900">{member?.fullName ?? '…'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-[#1E3A5F]" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Chit</p>
            <p className="text-sm font-semibold text-gray-900">{chit?.name ?? '…'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
            <Hash size={14} className="text-[#1E3A5F]" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Draw</p>
            <p className="text-sm font-semibold text-gray-900">#{payout.monthNumber}</p>
          </div>
        </div>
      </div>

      {/* Payout breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <IndianRupee size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Payout Breakdown</h3>
        </div>
        <div className="px-4">
          <DeductionRow label="Winning Amount" amount={payout.winningAmount} highlight />
          {hasDeductions && (
            <>
              {Number(payout.installmentSettlement ?? 0) > 0 && (
                <DeductionRow
                  label="Installment Withheld"
                  amount={payout.installmentSettlement}
                  sub={`Draw #${payout.monthNumber} · ${chit?.name ?? ''}`}
                />
              )}
              {Number(payout.crossChitSettlement ?? 0) > 0 && (
                <DeductionRow
                  label="Cross-Chit Settlement"
                  amount={payout.crossChitSettlement}
                  sub="Outstanding dues from other chits"
                />
              )}
              {Number(payout.manualAdjustment ?? 0) > 0 && (
                <DeductionRow
                  label="Manual Adjustment"
                  amount={payout.manualAdjustment}
                />
              )}
              <div className="flex items-center justify-between py-3 border-t border-gray-200 mt-1">
                <p className="text-xs text-gray-400">Total Deductions</p>
                <p className="text-xs font-semibold text-red-600">− {fmtAmt(payout.discountAmount)}</p>
              </div>
            </>
          )}
          <div className="flex items-center justify-between py-3 border-t border-gray-200 bg-gray-50 -mx-4 px-4">
            <p className="text-sm font-bold text-gray-900">Net Payout</p>
            <p className="text-base font-bold text-[#1E3A5F]">{fmtAmt(payout.netPayoutAmount)}</p>
          </div>
        </div>
      </div>

      {/* Disbursements */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Disbursements</h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Disbursed:</span>
            <span className="font-semibold text-green-700">{fmtAmt(payout.disbursedAmount)}</span>
            {Number(payout.remainingAmount ?? 0) > 0 && (
              <span className="text-amber-600">· ₹{Number(payout.remainingAmount).toLocaleString('en-IN')} pending</span>
            )}
          </div>
        </div>
        {disbursements.length === 0 ? (
          <p className="px-4 py-4 text-xs text-gray-400 text-center">No disbursements yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {disbursements.map((d, i) => {
              const ModeIcon = MODE_ICON[d.mode] ?? Banknote;
              return (
                <div key={d.id ?? i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                    <ModeIcon size={14} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtAmt(d.amount)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}
                      {d.disbursedBy ? ` · by ${nameMap[String(d.disbursedBy)] ?? 'Admin'}` : ''}
                    </p>
                    {d.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{d.notes}</p>}
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{fmtDate(d.disbursedAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      {payout.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-700 font-semibold mb-0.5">Notes</p>
          <p className="text-sm text-amber-900">{payout.notes}</p>
        </div>
      )}

      {/* Cancellation / void */}
      {(payout.cancellationReason || payout.voidReason) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700 font-semibold mb-0.5">
            {payout.cancellationReason ? 'Cancellation Reason' : 'Void Reason'}
          </p>
          <p className="text-sm text-red-900">{payout.cancellationReason ?? payout.voidReason}</p>
          <p className="text-xs text-red-400 mt-1">
            {fmtDateTime(payout.cancelledAt ?? payout.voidedAt)}
            {(payout.cancelledBy ?? payout.voidedBy)
              ? ` · by ${nameMap[String(payout.cancelledBy ?? payout.voidedBy)] ?? 'Admin'}`
              : ''}
          </p>
        </div>
      )}

      {/* Created by */}
      <div className="flex items-center gap-2 px-1 pb-4">
        <Calendar size={12} className="text-gray-300" />
        <p className="text-xs text-gray-400">
          Created {fmtDateTime(payout.createdAt)}
          {payout.createdBy ? ` · by ${nameMap[String(payout.createdBy)] ?? 'Admin'}` : ''}
        </p>
      </div>

    </div>
  );
}
