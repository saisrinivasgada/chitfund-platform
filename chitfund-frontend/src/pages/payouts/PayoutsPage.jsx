import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getMembers, getWinners,
  createPayout, getAllPayouts, getPendingPayouts,
  disbursePayout, cancelPayout, addWalletTransaction,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { Banknote, Clock, List, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const TABS = ['Create Payout', 'Pending', 'All Payouts'];

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
  return (
    <div className="flex border-b border-gray-200 gap-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px flex items-center gap-2 ${
            active === t
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t === 'Create Payout' && <Banknote size={14} />}
          {t === 'Pending'       && <Clock size={14} />}
          {t === 'All Payouts'   && <List size={14} />}
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Create Payout Tab ─────────────────────────────────────────────────────
// Mirrors the Winners tab flow in ChitDetailPage: select chit → pick an unpaid winner
// (auto-populated from recorded winner data) → confirm payout creation.
// Dropdown only shows ACTIVE chits that have at least one winner without an existing payout.
function CreatePayoutTab() {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [chitId, setChitId] = useState('');
  const [selectedWinnerKey, setSelectedWinnerKey] = useState('');
  const [discountAmt, setDiscountAmt] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 120_000 });
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m]));

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
    staleTime: 60_000,
  });

  // Fetch all existing payouts once (avoids per-chit queries)
  const { data: allPayouts = [] } = useQuery({
    queryKey: ['payouts', 'all-for-create'],
    queryFn: () => getAllPayouts({}),
    staleTime: 30_000,
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

  const winningAmt  = selectedWinner ? Number(selectedWinner.winningAmount ?? 0) : 0;
  const discountNum = Number(discountAmt) || 0;
  const net         = Math.max(0, winningAmt - discountNum);

  function resetWinner() {
    setSelectedWinnerKey('');
    setDiscountAmt('0');
    setNotes('');
  }

  const mutation = useMutation({
    mutationFn: () => {
      const mid = selectedWinner.memberId ?? selectedWinner.winnerId;
      return createPayout({
        chitId,
        memberId: mid,
        monthNumber: selectedWinner.monthNumber,
        winningAmount: winningAmt,
        discountAmount: discountNum,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      qc.invalidateQueries({ queryKey: ['winners-batch'] });
      toast.success('Payout created');
      resetWinner();
      setChitId('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to create payout'),
  });

  const dropdownLoading = loadingAllWinners && activeChits.length > 0;

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-5">Create Payout</h3>
        <div className="space-y-4">

          {/* Step 1: Select chit — only chits with unpaid winners */}
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
                  const w = unpaidWinners.find((w) => `${w.monthNumber}:${w.memberId ?? w.winnerId}` === key);
                  setDiscountAmt(String(w?.discountAmount ?? 0));
                }}>
                  <option value="">— Select winner —</option>
                  {unpaidWinners.map((w) => {
                    const mid = w.memberId ?? w.winnerId;
                    const member = memberMap[String(mid)];
                    const key = `${w.monthNumber}:${mid}`;
                    return (
                      <option key={key} value={key}>
                        Month {w.monthNumber} — {member?.fullName ?? `Member #${String(mid).slice(0, 8)}`} · ₹{Number(w.winningAmount ?? 0).toLocaleString('en-IN')}
                      </option>
                    );
                  })}
                </Select>
              )}
            </FormField>
          )}

          {/* Step 3: Review and confirm */}
          {selectedWinner && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                <p className="font-semibold text-amber-800">
                  Month {selectedWinner.monthNumber} — {memberMap[String(selectedWinner.memberId ?? selectedWinner.winnerId)]?.fullName ?? 'Winner'}
                </p>
                <p className="text-amber-700 mt-0.5">
                  Winning amount: <strong>₹{winningAmt.toLocaleString('en-IN')}</strong>
                </p>
              </div>

              <FormField label="Adjusted Amount (₹)">
                <Input type="number" min="0" value={discountAmt}
                  onChange={(e) => setDiscountAmt(e.target.value)} />
              </FormField>

              <div className="flex justify-between text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <span className="text-gray-600">Net payout</span>
                <span className="font-semibold text-green-700">₹{net.toLocaleString('en-IN')}</span>
              </div>

              <FormField label="Notes (optional)">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes…" rows={2} />
              </FormField>

              <Button className="w-full" loading={mutation.isPending}
                disabled={!selectedWinner || winningAmt <= 0 || discountNum >= winningAmt}
                onClick={() => mutation.mutate()}>
                <Banknote size={15} /> Create Payout
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Disburse Modal ────────────────────────────────────────────────────────
function DisburseModal({ payout, memberName, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();

  const alreadyDisbursed  = Number(payout.disbursedAmount ?? 0);
  const netAmount         = Number(payout.netPayoutAmount ?? payout.winningAmount ?? 0);
  const remainingAmount   = Number(payout.remainingAmount ?? (netAmount - alreadyDisbursed));

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
      const result = await disbursePayout(payload);

      const accountType = form.disbursementMode === 'CASH' ? 'CASH' : 'BANK';
      await addWalletTransaction({
        accountType,
        entryType: 'OUT',
        amount: amountNum,
        category: 'Chit Disbursement',
        description: `Payout to ${memberName ?? payout.memberId} — Month #${payout.monthNumber}${isPartial ? ' (partial)' : ''}${form.referenceNumber ? ` · Ref: ${form.referenceNumber}` : ''}`,
      }).catch(() => {});

      return result;
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
        <div className="bg-green-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-800">{memberName ?? payout.memberId}</p>
          <p className="text-xs text-green-700">
            Total payout: <strong>{fmtAmt(netAmount)}</strong>
            {payout.discountAmount > 0 ? ` (Win ${fmtAmt(payout.winningAmount)} − Adj ${fmtAmt(payout.discountAmount)})` : ''}
          </p>
          {alreadyDisbursed > 0 && (
            <p className="text-xs text-blue-700">
              Already disbursed: <strong>{fmtAmt(alreadyDisbursed)}</strong> · Remaining: <strong>{fmtAmt(remainingAmount)}</strong>
            </p>
          )}
        </div>

        <FormField label="Amount to Disburse (₹)" required>
          <Input type="number" min="1" max={remainingAmount} step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required />
          {isPartial && amountNum > 0 && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={11} />
              Partial — {fmtAmt(remainingAmount - amountNum)} will remain outstanding
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
          Cancel payout of <strong>{fmtAmt(payout.netPayoutAmount ?? payout.winningAmount)}</strong> to{' '}
          <strong>{memberName ?? payout.memberId}</strong>?
        </p>
        <FormField label="Reason" required>
          <Textarea placeholder="Reason for cancellation…"
            value={reason} onChange={(e) => setReason(e.target.value)} required />
        </FormField>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">No, Keep</Button>
          <Button type="submit" loading={mutation.isPending} variant="danger" className="flex-1">
            <XCircle size={14} /> Cancel Payout
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Pending Tab ───────────────────────────────────────────────────────────
function PendingTab() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [cancelTarget, setCancelTarget]     = useState(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: getPendingPayouts,
  });

  const { data: chits = [] }      = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 120_000 });

  const chitMap   = Object.fromEntries(chits.map((c) => [c.id, c]));
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m.fullName ?? m.name ?? m.id]));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <PageSpinner />
        ) : pending.length === 0 ? (
          <EmptyState icon={Clock} title="No pending payouts" message="All payouts have been processed." />
        ) : (
          <Table columns={['Chit', 'Member', 'Month', 'Net Payout', 'Disbursed', 'Remaining', 'Status', 'Actions']}>
            {pending.map((p) => {
              const chitInfo = chitMap[p.chitId];
              const mName   = memberMap[p.memberId] ?? p.memberId;
              const isPartial = p.status === 'PARTIALLY_DISBURSED';
              return (
                <Tr key={p.id}>
                  <Td className="font-medium text-gray-900">{chitInfo?.name ?? p.chitId?.toString().slice(0, 8)}</Td>
                  <Td className="font-medium text-gray-900">{mName}</Td>
                  <Td className="font-semibold">M{p.monthNumber}</Td>
                  <Td className="font-bold text-green-700">{fmtAmt(p.netPayoutAmount ?? p.winningAmount)}</Td>
                  <Td className="text-blue-700 font-medium">
                    {isPartial ? fmtAmt(p.disbursedAmount) : '—'}
                  </Td>
                  <Td className="text-amber-700 font-medium">
                    {isPartial ? fmtAmt(p.remainingAmount) : fmtAmt(p.netPayoutAmount ?? p.winningAmount)}
                  </Td>
                  <Td><PayoutStatusBadge status={p.status} /></Td>
                  <Td>
                    {!isManager ? (
                      <div className="flex gap-2">
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
    </div>
  );
}

// ─── All Payouts Tab ───────────────────────────────────────────────────────
function AllPayoutsTab() {
  const [chitId, setChitId] = useState('');
  const { data: chits = [] }      = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 120_000 });
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m.fullName ?? m.name ?? m.id]));

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['payouts', 'all', chitId],
    queryFn: () => getAllPayouts(chitId ? { chitId } : {}),
    staleTime: 30_000,
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
          <Table columns={['Chit', 'Month', 'Member', 'Net Payout', 'Disbursed', 'Remaining', 'Mode', 'Status', 'Date']}>
            {payouts.map((p) => {
              const alreadyDisbursed = Number(p.disbursedAmount ?? 0);
              const remaining = Number(p.remainingAmount ?? (Number(p.netPayoutAmount ?? 0) - alreadyDisbursed));
              return (
                <Tr key={p.id}>
                  <Td className="text-gray-600 text-xs">{p.chitName ?? chits.find((c) => c.id === p.chitId)?.name ?? '—'}</Td>
                  <Td className="font-semibold">M{p.monthNumber}</Td>
                  <Td className="font-medium text-gray-900">{memberMap[p.memberId] ?? p.memberName ?? p.memberId}</Td>
                  <Td className="font-semibold text-green-700">{fmtAmt(p.netPayoutAmount ?? p.winningAmount)}</Td>
                  <Td className="text-blue-700">
                    {alreadyDisbursed > 0 ? fmtAmt(alreadyDisbursed) : '—'}
                  </Td>
                  <Td className="text-amber-700">
                    {p.status === 'PARTIALLY_DISBURSED' ? fmtAmt(remaining) : '—'}
                  </Td>
                  <Td>{p.disbursementMode ?? '—'}</Td>
                  <Td><PayoutStatusBadge status={p.status} /></Td>
                  <Td>{p.disbursedAt ? new Date(p.disbursedAt).toLocaleDateString('en-IN') : '—'}</Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PayoutsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const tabs = isManager ? ['Pending', 'All Payouts'] : TABS;
  const [activeTab, setActiveTab] = useState(isManager ? 'Pending' : 'Create Payout');

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
        {activeTab === 'Create Payout' && <CreatePayoutTab />}
        {activeTab === 'Pending'       && <PendingTab />}
        {activeTab === 'All Payouts'   && <AllPayoutsTab />}
      </div>
    </div>
  );
}
