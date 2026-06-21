import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getEnrollments, getMembers,
  createPayout, getPayoutsByChit, getPendingPayouts,
  disbursePayout, cancelPayout, addWalletTransaction,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
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
    PENDING:             { label: 'Pending',              cls: 'bg-amber-100 text-amber-700' },
    PARTIALLY_DISBURSED: { label: 'Partial',              cls: 'bg-blue-100 text-blue-700' },
    DISBURSED:           { label: 'Disbursed',            cls: 'bg-green-100 text-green-700' },
    CANCELLED:           { label: 'Cancelled',            cls: 'bg-gray-100 text-gray-500' },
  }[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function TabBar({ active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 gap-1">
      {TABS.map((t) => (
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
          {t === 'Pending' && <Clock size={14} />}
          {t === 'All Payouts' && <List size={14} />}
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Create Payout Tab ─────────────────────────────────────────────────────
function CreatePayoutTab() {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [chitId, setChitId] = useState('');
  const [form, setForm] = useState({
    memberId: '', monthNumber: '', winningAmount: '', discountAmount: '', notes: '',
  });

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
    enabled: !!chitId,
  });

  const mutation = useMutation({
    mutationFn: () => createPayout({
      chitId,
      memberId: form.memberId,
      monthNumber: Number(form.monthNumber),
      winningAmount: Number(form.winningAmount),
      discountAmount: form.discountAmount ? Number(form.discountAmount) : 0,
      notes: form.notes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      toast.success('Payout created successfully');
      setForm({ memberId: '', monthNumber: '', winningAmount: '', discountAmount: '', notes: '' });
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to create payout'),
  });

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-5">Create Payout</h3>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <FormField label="Select Chit Fund" required>
            <Select value={chitId} onChange={(e) => { setChitId(e.target.value); set('memberId', ''); }} required>
              <option value="">— Choose a chit —</option>
              {chits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>

          <FormField label="Winner (Member)" required>
            <Select value={form.memberId} onChange={(e) => set('memberId', e.target.value)} disabled={!chitId} required>
              <option value="">— Choose a member —</option>
              {enrollments.map((e) => (
                <option key={e.memberId ?? e.id} value={e.memberId ?? e.id}>
                  {e.memberName ?? e.fullName ?? `Member #${e.memberId ?? e.id}`}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Month Number" required>
              <Input type="number" min="1" placeholder="1" value={form.monthNumber}
                onChange={(e) => set('monthNumber', e.target.value)} required />
            </FormField>
            <FormField label="Winning Amount (₹)" required>
              <Input type="number" min="1" placeholder="100000" value={form.winningAmount}
                onChange={(e) => set('winningAmount', e.target.value)} required />
            </FormField>
          </div>

          <FormField label="Adjusted Amount (₹)">
            <Input type="number" min="0" placeholder="0" value={form.discountAmount}
              onChange={(e) => set('discountAmount', e.target.value)} />
          </FormField>

          <FormField label="Notes">
            <Textarea placeholder="Optional notes…" value={form.notes}
              onChange={(e) => set('notes', e.target.value)} />
          </FormField>

          <Button type="submit" loading={mutation.isPending}
            disabled={!chitId || !form.memberId || !form.monthNumber || !form.winningAmount}
            className="w-full">
            <Banknote size={15} /> Create Payout
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Disburse Modal ────────────────────────────────────────────────────────
function DisburseModal({ payout, memberName, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();

  // For partially disbursed payouts, remaining = what's still owed
  const alreadyDisbursed = Number(payout.disbursedAmount ?? 0);
  const netAmount = Number(payout.netPayoutAmount ?? payout.winningAmount ?? 0);
  const remainingAmount = Number(payout.remainingAmount ?? (netAmount - alreadyDisbursed));

  const [form, setForm] = useState({
    disbursementMode: 'BANK_TRANSFER',
    amount: remainingAmount.toString(),
    referenceNumber: '',
    notes: '',
  });

  const amountNum = Number(form.amount) || 0;
  const isPartial = amountNum > 0 && amountNum < remainingAmount;
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

      // Sync to treasury: record OUT for this disbursement amount
      const accountType = form.disbursementMode === 'CASH' ? 'CASH' : 'BANK';
      await addWalletTransaction({
        accountType,
        entryType: 'OUT',
        amount: amountNum,
        category: 'Chit Disbursement',
        description: `Payout to ${memberName ?? payout.memberId} — Month #${payout.monthNumber}${isPartial ? ' (partial)' : ''}${form.referenceNumber ? ` · Ref: ${form.referenceNumber}` : ''}`,
      }).catch(() => {}); // non-fatal

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

        {/* Summary card */}
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
          <Input
            type="number"
            min="1"
            max={remainingAmount}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
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
          <Select
            value={form.disbursementMode}
            onChange={(e) => setForm((f) => ({ ...f, disbursementMode: e.target.value }))}
          >
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
          </Select>
        </FormField>

        <FormField label="Reference Number (optional)">
          <Input
            placeholder="UTR / transaction ID / cheque number"
            value={form.referenceNumber}
            onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
          />
        </FormField>

        <FormField label="Notes">
          <Textarea
            placeholder="Optional notes…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Close</Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            variant="success"
            className="flex-1"
            disabled={!amountNum || amountNum <= 0 || amountNum > remainingAmount}
          >
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
          <Textarea
            placeholder="Reason for cancellation…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
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
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: getPendingPayouts,
  });

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 120_000 });

  const chitMap = Object.fromEntries(chits.map((c) => [c.id, c]));
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m.fullName ?? m.name ?? m.id]));

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
              const mName = memberMap[p.memberId] ?? p.memberId;
              const isPartial = p.status === 'PARTIALLY_DISBURSED';
              return (
                <Tr key={p.id}>
                  <Td className="font-medium text-gray-900">{chitInfo?.name ?? p.chitId?.toString().slice(0, 8)}</Td>
                  <Td className="font-medium text-gray-900">{mName}</Td>
                  <Td className="font-semibold">#{p.monthNumber}</Td>
                  <Td className="font-bold text-green-700">{fmtAmt(p.netPayoutAmount ?? p.winningAmount)}</Td>
                  <Td className="text-blue-700 font-medium">
                    {isPartial ? fmtAmt(p.disbursedAmount) : '—'}
                  </Td>
                  <Td className="text-amber-700 font-medium">
                    {isPartial ? fmtAmt(p.remainingAmount) : fmtAmt(p.netPayoutAmount ?? p.winningAmount)}
                  </Td>
                  <Td>
                    <PayoutStatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button variant="success" size="sm"
                        onClick={() => setDisburseTarget({ ...p, _memberName: mName })}>
                        <CheckCircle size={13} />
                        {isPartial ? 'Continue' : 'Disburse'}
                      </Button>
                      {/* Cancel only allowed on PENDING — not on PARTIALLY_DISBURSED */}
                      {!isPartial && (
                        <Button variant="danger" size="sm"
                          onClick={() => setCancelTarget({ ...p, _memberName: mName })}>
                          <XCircle size={13} /> Cancel
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {disburseTarget && (
        <DisburseModal
          payout={disburseTarget}
          memberName={disburseTarget._memberName}
          onClose={() => setDisburseTarget(null)}
        />
      )}
      {cancelTarget && (
        <CancelPayoutModal
          payout={cancelTarget}
          memberName={cancelTarget._memberName}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

// ─── All Payouts Tab ───────────────────────────────────────────────────────
function AllPayoutsTab() {
  const [chitId, setChitId] = useState('');
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 120_000 });
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m.fullName ?? m.name ?? m.id]));

  const { data: singleChitPayouts = [], isLoading: singleLoading } = useQuery({
    queryKey: ['payouts', 'chit', chitId],
    queryFn: () => getPayoutsByChit(chitId),
    enabled: !!chitId,
  });

  const { data: allChitPayoutsRaw = [], isLoading: allLoading } = useQuery({
    queryKey: ['payouts', 'all-chits', chits.map((c) => c.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(chits.map((c) => getPayoutsByChit(c.id)));
      return results.flat();
    },
    enabled: !chitId && chits.length > 0,
    staleTime: 30_000,
  });

  const payouts = chitId ? singleChitPayouts : allChitPayoutsRaw;
  const isLoading = chitId ? singleLoading : allLoading;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <FormField label="Filter by Chit Fund">
          <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
            <option value="">— All Chits —</option>
            {chits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              return (
                <Tr key={p.id}>
                  <Td className="text-gray-600 text-xs">{p.chitName ?? chits.find((c) => c.id === p.chitId)?.name ?? '—'}</Td>
                  <Td className="font-semibold">#{p.monthNumber}</Td>
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
  const [activeTab, setActiveTab] = useState('Create Payout');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Payouts
        </h2>
        <p className="text-sm text-gray-500 mt-1">Create, disburse, and track winner payouts.</p>
      </div>
      <div className="space-y-5">
        <TabBar active={activeTab} onChange={setActiveTab} />
        {activeTab === 'Create Payout' && <CreatePayoutTab />}
        {activeTab === 'Pending' && <PendingTab />}
        {activeTab === 'All Payouts' && <AllPayoutsTab />}
      </div>
    </div>
  );
}
