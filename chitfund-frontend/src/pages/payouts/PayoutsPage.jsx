import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getMembers, getWinners,
  getAllPayouts, getPendingPayouts,
  disbursePayout, cancelPayout,
  getWalletBalance,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import PayoutCreationForm from '../../components/payout/PayoutCreationForm';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { Banknote, Clock, List, CheckCircle, XCircle, AlertCircle, ArrowRight, Vault, CreditCard, Trophy } from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

function utc(s) { return s ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null; }

const TABS = ['Create Payout', 'Pending Payouts', 'Pending Disbursement', 'All Payouts'];

function fmtAmt(v) { return '₹' + Number(v ?? 0).toLocaleString('en-IN'); }

function PayoutStatusBadge({ status }) {
  const cfg = {
    PENDING:             { label: 'Pending',   cls: 'bg-amber-100 text-amber-700' },
    PARTIALLY_DISBURSED: { label: 'Partial',   cls: 'bg-blue-100 text-blue-700' },
    DISBURSED:           { label: 'Disbursed', cls: 'bg-green-100 text-green-700' },
    CANCELLED:           { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  }[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function TabBar({ active, onChange, tabs = TABS }) {
  const ICON = { 'Create Payout': Banknote, 'Pending Payouts': Trophy, 'Pending Disbursement': Clock, 'Pending': Clock, 'All Payouts': List };
  return (
    <div className="flex gap-2 flex-wrap" style={{ marginTop: 12, marginBottom: 12 }}>
      {tabs.map((t) => {
        const Icon = ICON[t];
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full cursor-pointer whitespace-nowrap transition-all"
            style={{
              padding: '6px 16px',
              backgroundColor: isActive ? '#1E3A5F' : '#ffffff',
              color: isActive ? '#ffffff' : '#374151',
              border: isActive ? '1.5px solid #1E3A5F' : '1.5px solid #D1D5DB',
            }}
          >
            {Icon && <Icon size={14} />}
            {t}
          </button>
        );
      })}
    </div>
  );
}

// ─── Create Payout Tab ─────────────────────────────────────────────────────
function CreatePayoutTab() {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [chitId, setChitId] = useState('');
  const [selectedWinnerKey, setSelectedWinnerKey] = useState('');
  const { hidden } = useHiddenAmounts();

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});
  const memberMap = Object.fromEntries(
    allMembers.flatMap((m) => {
      const entries = [[String(m.id), m]];
      if (m.userId) entries.push([String(m.userId), m]);
      return entries;
    })
  );

  // Pre-fetch winners for all active chits in parallel so we can filter the dropdown
  const activeChitIdStr = activeChits.map((c) => c.id).join(',');
  const { data: chitWinnersMap = {}, isLoading: loadingAllWinners } = useQuery({
    queryKey: ['winners-batch', activeChitIdStr],
    queryFn: async () => {
      const entries = await Promise.all(
        activeChits.map((c) =>
          getWinners(c.id).then((ws) => [c.id, ws]).catch(() => [c.id, []])
        )
      );
      return Object.fromEntries(entries);
    },
    enabled: activeChits.length > 0,
  });

  // Fetch all existing payouts once (avoids per-chit queries)
  const { data: allPayouts = [] } = useQuery({
    queryKey: ['payouts', 'all-for-create'],
    queryFn: () => getAllPayouts({}),
  });

  // Global paid-key set: "chitId:monthNumber:memberId"
  const globalPaidKeys = new Set(
    allPayouts
      .filter((p) => p.status !== 'CANCELLED')
      .map((p) => `${p.chitId}:${p.monthNumber}:${String(p.memberId)}`)
  );

  // Only show chits where at least one winner doesn't yet have a payout
  const chitsWithPending = activeChits.filter((c) => {
    const ws = chitWinnersMap[c.id] ?? [];
    return ws.some((w) =>
      !globalPaidKeys.has(`${c.id}:${w.monthNumber}:${String(w.memberId ?? w.winnerId)}`)
    );
  });

  // Derive winners and unpaid list from pre-fetched data
  const winners = chitId ? (chitWinnersMap[chitId] ?? []) : [];
  const paidKeys = new Set(
    allPayouts
      .filter((p) => String(p.chitId) === String(chitId) && p.status !== 'CANCELLED')
      .map((p) => `${p.monthNumber}:${String(p.memberId)}`)
  );
  const unpaidWinners = winners.filter((w) => {
    const mid = w.memberId ?? w.winnerId;
    return !paidKeys.has(`${w.monthNumber}:${mid}`);
  });

  const [selMonth, selMid] = selectedWinnerKey ? selectedWinnerKey.split(':') : [];
  const selectedWinner = unpaidWinners.find((w) => {
    const mid = String(w.memberId ?? w.winnerId);
    return String(w.monthNumber) === selMonth && mid === selMid;
  });

  const selectedMemberId = selectedWinner ? String(selectedWinner.memberId ?? selectedWinner.winnerId) : null;
  const selectedChit = chits.find((c) => String(c.id) === String(chitId));

  function resetWinner() {
    setSelectedWinnerKey('');
  }

  const winningAmt = selectedWinner ? Number(selectedWinner.winningAmount ?? 0) : 0;

  const dropdownLoading = loadingAllWinners && activeChits.length > 0;

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-gray-900">Create Payout</h3>

        {/* Step 1: Select chit */}
        <FormField label="Select Active Chit" required>
          {dropdownLoading ? (
            <Select disabled><option>Checking for pending payouts…</option></Select>
          ) : (
            <Select value={chitId} onChange={(e) => { setChitId(e.target.value); resetWinner(); }}>
              <option value="">
                {chitsWithPending.length === 0 ? '— No chits with pending payouts —' : '— Choose a chit —'}
              </option>
              {chitsWithPending.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          {!dropdownLoading && chitsWithPending.length === 0 && activeChits.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 italic">All winners in active chits already have payouts created.</p>
          )}
        </FormField>

        {/* Step 2: Pick winner */}
        {chitId && (
          <FormField label="Select Winner" required>
            {unpaidWinners.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-2">
                {winners.length === 0
                  ? 'No winners recorded for this chit yet. Open the chit → Winners tab to record them.'
                  : 'All recorded winners already have payouts created.'}
              </p>
            ) : (
              <Select value={selectedWinnerKey} onChange={(e) => {
                const key = e.target.value;
                setSelectedWinnerKey(key);
              }}>
                <option value="">— Select winner —</option>
                {unpaidWinners.map((w) => {
                  const mid = w.memberId ?? w.winnerId;
                  const member = memberMap[String(mid)];
                  const key = `${w.monthNumber}:${mid}`;
                  return (
                    <option key={key} value={key}>
                      Draw {w.monthNumber} — {member?.fullName ?? `Member #${String(mid).slice(0, 8)}`} · ₹{Number(w.winningAmount ?? 0).toLocaleString('en-IN')}
                    </option>
                  );
                })}
              </Select>
            )}
          </FormField>
        )}

        {/* Step 3: Winner summary + settlement */}
        {selectedWinner && (() => {
          const memberName = memberMap[String(selectedWinner.memberId ?? selectedWinner.winnerId)]?.fullName ?? 'Winner';
          return (
            <>
              {/* Winner banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="font-semibold text-amber-800 text-sm">
                  Draw {selectedWinner.monthNumber} — {memberName}
                </p>
                <p className="text-amber-700 text-sm mt-0.5">
                  Winning amount: <strong>{hidden ? '••••••' : `₹${winningAmt.toLocaleString('en-IN')}`}</strong>
                  {selectedChit?.installmentAmount > 0 && (
                    <span className="text-amber-600 ml-2 text-xs">
                      (monthly installment: {hidden ? '••••••' : `₹${Number(selectedChit.installmentAmount).toLocaleString('en-IN')}`})
                    </span>
                  )}
                </p>
              </div>

              {/* Settlement + submission — shared component */}
              <PayoutCreationForm
                key={`${chitId}:${selectedWinnerKey}`}
                chitId={chitId}
                chit={selectedChit}
                memberId={selectedMemberId}
                monthNumber={selectedWinner.monthNumber}
                defaultWinningAmount={selectedWinner.winningAmount}
                defaultAdjustment={selectedWinner.discountAmount ?? 0}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ['payouts'] });
                  qc.invalidateQueries({ queryKey: ['winners-batch'] });
                  qc.invalidateQueries({ queryKey: ['memberBalance'] });
                  qc.invalidateQueries({ queryKey: ['memberBalancesBulk'] });
                  resetWinner();
                  setChitId('');
                }}
              />
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Payout Detail Modal ───────────────────────────────────────────────────
function PayoutDetailModal({ payout, memberName, chitName, onClose }) {
  const net         = Number(payout.netPayoutAmount ?? payout.winningAmount ?? 0);
  const winning     = Number(payout.winningAmount ?? 0);
  const installment = Number(payout.installmentSettlement ?? 0);
  const crossChit   = Number(payout.crossChitSettlement ?? 0);
  const manual      = Number(payout.manualAdjustment ?? 0);
  const disbursed   = Number(payout.disbursedAmount ?? 0);
  const remaining   = Number(payout.remainingAmount ?? (net - disbursed));
  const hasBreakdown = installment > 0 || crossChit > 0 || manual > 0;
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);

  function fmtDT(dt) {
    if (!dt) return '—';
    return new Date(utc(dt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return (
    <Modal title="Payout Details" onClose={onClose} size="sm">
      <div className="space-y-4">

        {/* Winner summary */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">{memberName}</p>
          <p className="text-xs text-amber-700 mt-0.5">{chitName} · Draw {payout.monthNumber}</p>
        </div>

        {/* Amount breakdown */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount Breakdown</p>
          </div>
          <div className="px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Winning amount</span>
              <span className="font-medium text-gray-900">{h(winning)}</span>
            </div>

            {hasBreakdown ? (
              <>
                {installment > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      Draw {payout.monthNumber} installment collected
                    </span>
                    <span>−{h(installment)}</span>
                  </div>
                )}
                {crossChit > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      Other chit dues collected
                    </span>
                    <span>−{h(crossChit)}</span>
                  </div>
                )}
                {manual > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      Manual adjustment
                    </span>
                    <span>−{h(manual)}</span>
                  </div>
                )}
              </>
            ) : (
              Number(payout.discountAmount ?? 0) > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Deduction</span>
                  <span>−{h(payout.discountAmount)}</span>
                </div>
              )
            )}

            <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
              <span className="text-gray-700">Net promised to member</span>
              <span className="text-green-700">{h(net)}</span>
            </div>
          </div>
        </div>

        {/* Disbursement status */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Disbursement Status</p>
          </div>
          <div className="px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <PayoutStatusBadge status={payout.status} />
            </div>
            {disbursed > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Disbursed so far</span>
                <span className="font-medium text-blue-700">{h(disbursed)}</span>
              </div>
            )}
            {remaining > 0 && payout.status !== 'DISBURSED' && (
              <div className="flex justify-between">
                <span className="text-gray-600">Remaining</span>
                <span className="font-medium text-amber-700">{h(remaining)}</span>
              </div>
            )}
            {payout.disbursementMode && (
              <div className="flex justify-between">
                <span className="text-gray-600">Mode</span>
                <span className="font-medium text-gray-800">{payout.disbursementMode.replace('_', ' ')}</span>
              </div>
            )}
            {payout.disbursedAt && (
              <div className="flex justify-between">
                <span className="text-gray-600">Disbursed at</span>
                <span className="text-gray-800">{fmtDT(payout.disbursedAt)}</span>
              </div>
            )}
            {payout.cancellationReason && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-600 flex-shrink-0">Cancel reason</span>
                <span className="text-red-700 text-right">{payout.cancellationReason}</span>
              </div>
            )}
          </div>
        </div>

        {(payout.status === 'DISBURSED' || payout.status === 'PARTIALLY_DISBURSED') && payout.disbursements?.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Disbursement{payout.disbursements.length > 1 ? ` transactions (${payout.disbursements.length})` : ''}
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {payout.disbursements.map((d, i) => (
                <div key={d.id} className="text-xs bg-white border border-gray-100 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">
                      #{i + 1} · {hidden ? '••••••' : `₹${Number(d.amount).toLocaleString('en-IN')}`}
                    </span>
                    <span className="text-gray-500">{d.mode?.replace('_', ' ')}</span>
                  </div>
                  {d.referenceNumber && (
                    <div className="text-gray-400 font-mono">{d.referenceNumber}</div>
                  )}
                  <div className="text-gray-400">
                    {new Date(utc(d.disbursedAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {d.notes && <div className="text-gray-400 italic">{d.notes}</div>}
                </div>
              ))}
              {payout.status === 'PARTIALLY_DISBURSED' && (
                <p className="text-xs text-blue-600 font-medium pt-1">
                  {hidden ? '••••••' : `₹${Number(payout.disbursedAmount).toLocaleString('en-IN')}`} disbursed · {hidden ? '••••••' : `₹${Number(payout.remainingAmount).toLocaleString('en-IN')}`} remaining
                </p>
              )}
            </div>
          </div>
        )}

        {payout.notes && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{payout.notes}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Disburse Modal ────────────────────────────────────────────────────────
function TreasuryBadge() {
  const [show, setShow] = useState(false);
  const { data: bal } = useQuery({ queryKey: ['wallet-balance'], queryFn: getWalletBalance});
  const total = Number(bal?.totalBalance ?? 0);
  const cash  = Number(bal?.cashBalance ?? 0);
  const bank  = Number(bal?.bankBalance ?? 0);
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button type="button" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#B8CCE4] bg-[#EEF2F8] text-[#1E3A5F] hover:bg-[#dce6f0] transition-colors cursor-default">
        <Vault size={14} />
      </button>
      {show && (
        <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#1E3A5F] text-white text-xs rounded-xl shadow-xl p-4 z-50 pointer-events-none">
          <p className="font-semibold text-[#D4A017] mb-2">Treasury Balance</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white/70"><Banknote size={11} /> Cash</span>
              <span className="font-semibold">{h(cash)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white/70"><CreditCard size={11} /> Bank</span>
              <span className="font-semibold">{h(bank)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/20 pt-1.5 mt-1">
              <span className="text-white/70">Total</span>
              <span className="font-bold text-[#D4A017]">{h(total)}</span>
            </div>
          </div>
          <div className="absolute bottom-[-5px] right-4 w-2.5 h-2.5 bg-[#1E3A5F] rotate-45" />
        </div>
      )}
    </div>
  );
}

function DisburseModal({ payout, memberName, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();

  const alreadyDisbursed  = Number(payout.disbursedAmount ?? 0);
  const netAmount         = Number(payout.netPayoutAmount ?? payout.winningAmount ?? 0);
  const remainingAmount   = Number(payout.remainingAmount ?? (netAmount - alreadyDisbursed));
  const installment       = Number(payout.installmentSettlement ?? 0);
  const crossChit         = Number(payout.crossChitSettlement ?? 0);
  const manual            = Number(payout.manualAdjustment ?? 0);
  const hasBreakdown      = installment > 0 || crossChit > 0 || manual > 0;
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);

  const [form, setForm] = useState({
    disbursementMode: 'BANK_TRANSFER',
    amount: remainingAmount.toString(),
    referenceNumber: '',
    notes: '',
  });

  const amountNum      = Number(form.amount) || 0;
  const isPartial      = amountNum > 0 && amountNum < remainingAmount;
  const isFullRemaining = amountNum >= remainingAmount;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: payout.id,
        disbursementMode: form.disbursementMode,
        amount: amountNum,
        referenceNumber: form.referenceNumber || undefined,
        notes: form.notes || undefined,
      };
      return disbursePayout(payload);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      if (result?.status === 'PARTIALLY_DISBURSED') {
        toast.success(`Partial disbursement of ${fmtAmt(amountNum)} recorded — remaining: ${fmtAmt(remainingAmount - amountNum)}`);
      } else {
        toast.success('Payout fully disbursed and treasury updated');
      }
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to disburse payout'),
  });

  return (
    <Modal title="Disburse Payout" onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <div className="bg-green-50 rounded-lg px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-green-800">{memberName ?? payout.memberId}</p>

          {/* Settlement breakdown — show when deductions were collected at payout creation */}
          {hasBreakdown ? (
            <div className="text-xs space-y-1">
              <div className="flex justify-between text-green-700">
                <span>Winning amount</span>
                <span className="font-medium">{h(payout.winningAmount)}</span>
              </div>
              {installment > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <ArrowRight size={10} /> Installment collected at disbursement
                  </span>
                  <span>−{h(installment)}</span>
                </div>
              )}
              {crossChit > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <ArrowRight size={10} /> Cross-chit dues collected
                  </span>
                  <span>−{h(crossChit)}</span>
                </div>
              )}
              {manual > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <ArrowRight size={10} /> Manual adjustment
                  </span>
                  <span>−{h(manual)}</span>
                </div>
              )}
              <div className="flex justify-between text-green-800 font-semibold border-t border-green-200 pt-1">
                <span>Net cash to member</span>
                <span>{h(netAmount)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-green-700">
              Net payout: <strong>{h(netAmount)}</strong>
              {Number(payout.discountAmount ?? 0) > 0 && (
                <span className="text-amber-700 ml-1">(Win {h(payout.winningAmount)} − {h(payout.discountAmount)})</span>
              )}
            </p>
          )}

          {alreadyDisbursed > 0 && (
            <div className="text-xs text-blue-700 border-t border-green-200 pt-1.5 flex justify-between">
              <span>Already disbursed</span>
              <span><strong>{h(alreadyDisbursed)}</strong> · Remaining: <strong>{h(remainingAmount)}</strong></span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Amount to Disburse (₹) <span className="text-red-500">*</span></span>
          <TreasuryBadge />
        </div>
        <FormField>
          <Input type="number" min="1" max={remainingAmount} step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required />
          {isPartial && amountNum > 0 && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={11} />
              Partial — {h(remainingAmount - amountNum)} will remain outstanding
            </p>
          )}
          {isFullRemaining && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle size={11} />
              Full remaining amount — payout will be marked Disbursed
            </p>
          )}
        </FormField>

        <FormField label="Disbursement Mode" required>
          <Select value={form.disbursementMode}
            onChange={(e) => setForm((f) => ({ ...f, disbursementMode: e.target.value }))}>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
          </Select>
        </FormField>

        <FormField label="Reference Number (optional)">
          <Input placeholder="UTR / transaction ID / cheque number"
            value={form.referenceNumber}
            onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} />
        </FormField>

        <FormField label="Notes">
          <Textarea placeholder="Optional notes…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Close</Button>
          <Button type="submit" loading={mutation.isPending} variant="success" className="flex-1"
            disabled={!amountNum || amountNum <= 0 || amountNum > remainingAmount}>
            <CheckCircle size={14} />
            {isPartial ? 'Disburse Partial' : 'Disburse'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Cancel Modal ──────────────────────────────────────────────────────────
function CancelPayoutModal({ payout, memberName, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [reason, setReason] = useState('');
  const { hidden } = useHiddenAmounts();

  const mutation = useMutation({
    mutationFn: () => cancelPayout({ id: payout.id, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      toast.success('Payout cancelled');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to cancel payout'),
  });

  return (
    <Modal title="Cancel Payout" onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <p className="text-sm text-gray-600">
          Cancel payout of <strong>{hidden ? '••••••' : fmtAmt(payout.netPayoutAmount ?? payout.winningAmount)}</strong> to{' '}
          <strong>{memberName ?? payout.memberId}</strong>?
        </p>
        <FormField label="Reason" required>
          <Textarea placeholder="Reason for cancellation…"
            value={reason} onChange={(e) => setReason(e.target.value)} required />
          <div className="flex justify-between mt-1">
            {reason.trim().length > 0 && reason.trim().length < 5
              ? <span className="text-xs text-red-500">Minimum 5 characters</span>
              : <span />}
            <span className="text-xs text-gray-400 ml-auto">{reason.length}/500</span>
          </div>
        </FormField>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">No, Keep</Button>
          <Button type="submit" loading={mutation.isPending} variant="danger" className="flex-1"
            disabled={reason.trim().length < 5 || mutation.isPending}>
            <XCircle size={14} /> Cancel Payout
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Pending Payouts Tab (winner selected, no payout created) ─────────────
function PendingPayoutsTab() {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [createTarget, setCreateTarget] = useState(null);
  const { hidden } = useHiddenAmounts();

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const eligibleChits = chits.filter((c) => c.status !== 'DRAFT');
  const eligibleChitStr = eligibleChits.map((c) => c.id).join(',');

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const memberMap = Object.fromEntries(
    allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name ?? String(m.id).slice(0, 8);
      const entries = [[String(m.id), name]];
      if (m.userId) entries.push([String(m.userId), name]);
      return entries;
    })
  );

  const { data: chitWinnersMap = {}, isLoading: loadingWinners } = useQuery({
    queryKey: ['winners-batch', eligibleChitStr],
    queryFn: async () => {
      const entries = await Promise.all(
        eligibleChits.map((c) =>
          getWinners(c.id).then((ws) => [c.id, ws]).catch(() => [c.id, []])
        )
      );
      return Object.fromEntries(entries);
    },
    enabled: eligibleChits.length > 0,
    staleTime: 120_000,
  });

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['payouts', 'all-for-create'],
    queryFn: () => getAllPayouts({}),
    staleTime: 60_000,
  });

  const paidKeys = new Set(
    allPayouts
      .filter((p) => p.status !== 'CANCELLED')
      .map((p) => `${p.chitId}:${p.monthNumber}:${String(p.memberId)}`)
  );

  // Build flat list of unpaid winners
  const chitMap = Object.fromEntries(chits.map((c) => [String(c.id), c]));
  const pendingPayoutRows = [];
  for (const [chitId, winners] of Object.entries(chitWinnersMap)) {
    for (const w of winners) {
      const mid = w.memberId ?? w.winnerId;
      if (!paidKeys.has(`${chitId}:${w.monthNumber}:${String(mid)}`)) {
        pendingPayoutRows.push({ chitId, winner: w, chit: chitMap[chitId] });
      }
    }
  }

  if (loadingWinners) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {pendingPayoutRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <EmptyState icon={Trophy} title="No pending payouts" message="All winners have payouts created." />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <Table columns={['Chit', 'Member', 'Draw', 'Winning Amount', 'Chit Status', 'Action']}>
            {pendingPayoutRows.map(({ chitId, winner, chit }) => {
              const mid = winner.memberId ?? winner.winnerId;
              const memberName = memberMap[String(mid)] ?? String(mid).slice(0, 8);
              return (
                <Tr key={`${chitId}:${winner.monthNumber}:${mid}`}>
                  <Td className="font-medium text-gray-900">{chit?.name ?? chitId?.slice(0, 8)}</Td>
                  <Td className="font-medium text-gray-900">{memberName}</Td>
                  <Td className="font-semibold">D{winner.monthNumber}</Td>
                  <Td className="font-bold text-green-700">
                    {hidden ? '••••••' : `₹${Number(winner.winningAmount ?? 0).toLocaleString('en-IN')}`}
                  </Td>
                  <Td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      chit?.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                      : chit?.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700'
                      : chit?.status === 'PAUSED' ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}>
                      {chit?.status ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setCreateTarget({ chitId, winner, chit, memberId: String(mid), memberName })}
                    >
                      <Banknote size={13} /> Create Payout
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </div>
      )}

      {createTarget && (
        <Modal title="Create Payout" onClose={() => setCreateTarget(null)} size="sm">
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="font-semibold text-amber-800 text-sm">
                Draw {createTarget.winner.monthNumber} — {createTarget.memberName}
              </p>
              <p className="text-amber-700 text-sm mt-0.5">
                {createTarget.chit?.name} · Winning amount:{' '}
                <strong>{hidden ? '••••••' : `₹${Number(createTarget.winner.winningAmount ?? 0).toLocaleString('en-IN')}`}</strong>
              </p>
            </div>
            <PayoutCreationForm
              key={`${createTarget.chitId}:${createTarget.winner.monthNumber}:${createTarget.memberId}`}
              chitId={createTarget.chitId}
              chit={createTarget.chit}
              memberId={createTarget.memberId}
              monthNumber={createTarget.winner.monthNumber}
              defaultWinningAmount={createTarget.winner.winningAmount}
              defaultAdjustment={createTarget.winner.discountAmount ?? 0}
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ['payouts'] });
                qc.invalidateQueries({ queryKey: ['winners-batch'] });
                qc.invalidateQueries({ queryKey: ['winners-batch-dash'] });
                setCreateTarget(null);
                toast.success('Payout created successfully');
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Pending Disbursement Tab (payouts created, not yet disbursed) ─────────
// (alias for existing PendingTab, keeping the same logic)

// ─── Pending Tab ───────────────────────────────────────────────────────────
function PendingTab() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [cancelTarget, setCancelTarget]     = useState(null);
  const [detailTarget, setDetailTarget]     = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: getPendingPayouts,
  });

  const { data: chits = [] }      = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});

  const chitMap   = Object.fromEntries(chits.map((c) => [c.id, c]));
  const memberMap = Object.fromEntries(
    allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name ?? String(m.id).slice(0, 8);
      const entries = [[String(m.id), name]];
      if (m.userId) entries.push([String(m.userId), name]);
      return entries;
    })
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <PageSpinner />
        ) : pending.length === 0 ? (
          <EmptyState icon={Clock} title="No pending payouts" message="All payouts have been processed." />
        ) : (
          <Table columns={['Chit', 'Member', 'Draw', 'Net Payout', 'Disbursed', 'Remaining', 'Status', 'Actions']}>
            {pending.map((p) => {
              const chitInfo = chitMap[p.chitId];
              const mName   = memberMap[p.memberId] ?? p.memberId;
              const isPartial = p.status === 'PARTIALLY_DISBURSED';
              return (
                <Tr key={p.id} onClick={() => setDetailTarget({ ...p, _memberName: mName, _chitName: chitInfo?.name })}>
                  <Td className="font-medium text-gray-900">{chitInfo?.name ?? p.chitId?.toString().slice(0, 8)}</Td>
                  <Td className="font-medium text-gray-900">{mName}</Td>
                  <Td className="font-semibold">D{p.monthNumber}</Td>
                  <Td className="font-bold text-green-700">{h(p.netPayoutAmount ?? p.winningAmount)}</Td>
                  <Td className="text-blue-700 font-medium">
                    {isPartial ? h(p.disbursedAmount) : '—'}
                  </Td>
                  <Td className="text-amber-700 font-medium">
                    {isPartial ? h(p.remainingAmount) : h(p.netPayoutAmount ?? p.winningAmount)}
                  </Td>
                  <Td><PayoutStatusBadge status={p.status} /></Td>
                  <Td>
                    {!isManager ? (
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="success" size="sm"
                          onClick={() => setDisburseTarget({ ...p, _memberName: mName })}>
                          <CheckCircle size={13} />
                          {isPartial ? 'Continue' : 'Disburse'}
                        </Button>
                        {!isPartial && (
                          <Button variant="danger" size="sm"
                            onClick={() => setCancelTarget({ ...p, _memberName: mName })}>
                            <XCircle size={13} /> Cancel
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Admin only</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {disburseTarget && (
        <DisburseModal payout={disburseTarget} memberName={disburseTarget._memberName}
          onClose={() => setDisburseTarget(null)} />
      )}
      {cancelTarget && (
        <CancelPayoutModal payout={cancelTarget} memberName={cancelTarget._memberName}
          onClose={() => setCancelTarget(null)} />
      )}
      {detailTarget && (
        <PayoutDetailModal
          payout={detailTarget}
          memberName={detailTarget._memberName}
          chitName={detailTarget._chitName}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

// ─── All Payouts Tab ───────────────────────────────────────────────────────
function AllPayoutsTab() {
  const [chitId, setChitId] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);
  const { data: chits = [] }      = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers});
  const memberMap = Object.fromEntries(
    allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name ?? String(m.id).slice(0, 8);
      const entries = [[String(m.id), name]];
      if (m.userId) entries.push([String(m.userId), name]);
      return entries;
    })
  );
  const chitMap   = Object.fromEntries(chits.map((c) => [String(c.id), c]));

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['payouts', 'all', chitId],
    queryFn: () => getAllPayouts(chitId ? { chitId } : {}),
  });

  const STATUS_LABEL = { ACTIVE: 'Active', PAUSED: 'Paused', COMPLETED: 'Done', DRAFT: 'Draft', CANCELLED: 'Cancelled' };

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <FormField label="Filter by Chit Fund">
          <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
            <option value="">— All Chits —</option>
            {chits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.status ? ` [${STATUS_LABEL[c.status] ?? c.status}]` : ''}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <PageSpinner />
        ) : payouts.length === 0 ? (
          <EmptyState icon={Banknote} title="No payouts found" message="No payouts recorded." />
        ) : (
          <Table columns={['Chit', 'Draw', 'Member', 'Net Payout', 'Disbursed', 'Remaining', 'Mode', 'Status', 'Date']}>
            {payouts.map((p) => {
              const alreadyDisbursed = Number(p.disbursedAmount ?? 0);
              const remaining = Number(p.remainingAmount ?? (Number(p.netPayoutAmount ?? 0) - alreadyDisbursed));
              const chitName = p.chitName ?? chitMap[String(p.chitId)]?.name ?? '—';
              const mName    = memberMap[p.memberId] ?? p.memberName ?? p.memberId;
              return (
                <Tr key={p.id} onClick={() => setDetailTarget({ ...p, _memberName: mName, _chitName: chitName })}>
                  <Td className="text-gray-600 text-xs">{chitName}</Td>
                  <Td className="font-semibold">D{p.monthNumber}</Td>
                  <Td className="font-medium text-gray-900">{mName}</Td>
                  <Td className="font-semibold text-green-700">{h(p.netPayoutAmount ?? p.winningAmount)}</Td>
                  <Td className="text-blue-700">
                    {alreadyDisbursed > 0 ? h(alreadyDisbursed) : '—'}
                  </Td>
                  <Td className="text-amber-700">
                    {p.status === 'PARTIALLY_DISBURSED' ? h(remaining) : '—'}
                  </Td>
                  <Td>{p.disbursementMode ?? '—'}</Td>
                  <Td><PayoutStatusBadge status={p.status} /></Td>
                  <Td>{p.disbursedAt ? new Date(utc(p.disbursedAt)).toLocaleDateString('en-IN') : '—'}</Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {detailTarget && (
        <PayoutDetailModal
          payout={detailTarget}
          memberName={detailTarget._memberName}
          chitName={detailTarget._chitName}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PayoutsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const tabs = isManager
    ? ['Pending Disbursement', 'All Payouts']
    : TABS;
  const defaultTab = isManager ? 'Pending Disbursement' : 'Create Payout';
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab && tabs.includes(rawTab)) ? rawTab : defaultTab;
  const setActiveTab = (tab) => { const p = new URLSearchParams(searchParams); p.set('tab', tab); setSearchParams(p, { replace: true }); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Payouts
        </h2>
        <p className="text-sm text-gray-500 mt-1">Create, disburse, and track winner payouts.</p>
      </div>
      <div className="space-y-5">
        <TabBar active={activeTab} onChange={setActiveTab} tabs={tabs} />
        {activeTab === 'Create Payout'       && <CreatePayoutTab />}
        {activeTab === 'Pending Payouts'      && <PendingPayoutsTab />}
        {activeTab === 'Pending Disbursement' && <PendingTab />}
        {activeTab === 'All Payouts'          && <AllPayoutsTab />}
      </div>
    </div>
  );
}
