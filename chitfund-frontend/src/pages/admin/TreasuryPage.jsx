import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWalletBalance, getWalletTransactions, addWalletTransaction,
  getMembers, getChits, getChitsForMember, getMemberTotalBalance, listStaff,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { Wallet, TrendingUp, TrendingDown, Plus, Banknote, CreditCard, Info, Phone, Mail, MapPin, Eye, EyeOff, X } from 'lucide-react';

// UUID regex used to detect and replace UUIDs in auto-generated descriptions
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function resolveDescription(desc, memberMap, chitMap) {
  if (!desc) return '—';
  return desc.replace(UUID_RE, (uuid) => {
    if (memberMap[uuid]) return memberMap[uuid];
    if (chitMap[uuid]) return chitMap[uuid];
    return uuid;
  });
}

function TransactionDetailModal({ tx, memberMap, chitMap, staffMap, onClose }) {
  const resolvedDesc = resolveDescription(tx.description, memberMap, chitMap);
  const isIn = tx.entryType === 'IN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Transaction Details
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Amount</span>
            <span className={`text-xl font-bold ${isIn ? 'text-green-700' : 'text-red-600'}`}>
              {isIn ? '+' : '−'}₹{Number(tx.amount).toLocaleString('en-IN')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Type</p>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                {isIn ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isIn ? 'Money In' : 'Money Out'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Account</p>
              <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                tx.accountType === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {tx.accountType}
              </span>
            </div>
          </div>

          {tx.category && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Category</p>
              <p className="text-sm text-gray-800 font-medium">{tx.category}</p>
            </div>
          )}

          {resolvedDesc && resolvedDesc !== '—' && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Description</p>
              <p className="text-sm text-gray-800 leading-snug">{resolvedDesc}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-0.5">Date & Time</p>
            <p className="text-sm text-gray-800">
              {new Date(tx.createdAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
              })}
            </p>
          </div>

          {tx.createdBy && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Recorded by</p>
              <p className="text-sm text-gray-800">{staffMap[tx.createdBy] ?? 'Admin'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CATEGORIES_IN = ['Member Payment', 'Chit Payout Return', 'Investment', 'Other Income'];
const CATEGORIES_OUT = ['Salary', 'Expense', 'Personal Withdrawal', 'Chit Disbursement', 'Other Expense'];

// ─── Mini member contact card (hover popover) ─────────────────────────────
function MemberContactCard({ member }) {
  const [coords, setCoords] = useState(null);

  const { data: totalOutstanding } = useQuery({
    queryKey: ['member-total-balance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!coords && !!member?.id,
    staleTime: 30_000,
  });

  if (!member) return null;
  const isClear = totalOutstanding !== undefined && Number(totalOutstanding) <= 0;

  return (
    <>
      <span
        className="inline-flex cursor-help flex-shrink-0"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
        }}
        onMouseLeave={() => setCoords(null)}
      >
        <Info size={14} className="text-gray-400 hover:text-[#1E3A5F] transition-colors" />
      </span>
      {coords && (
        <div
          className="fixed w-60 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-[9999] pointer-events-none"
          style={{ left: coords.x, top: coords.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-semibold text-gray-900 text-sm">{member.fullName}</p>
          {member.phone && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <Phone size={11} className="flex-shrink-0" /> {member.phone}
            </div>
          )}
          {member.email && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <Mail size={11} className="flex-shrink-0" /> {member.email}
            </div>
          )}
          {member.city && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <MapPin size={11} className="flex-shrink-0" /> {member.city}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {totalOutstanding === undefined ? (
              <span className="text-xs text-gray-400">Loading balance…</span>
            ) : isClear ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-xs font-medium text-green-700">Clear — no dues</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-xs font-medium text-red-600">
                  Outstanding: ₹{Number(totalOutstanding).toLocaleString('en-IN')}
                </span>
              </>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-[5px] border-r-[5px] border-t-[5px]
            border-l-transparent border-r-transparent border-t-gray-200" />
        </div>
      )}
    </>
  );
}

function BalanceCard({ label, amount, icon: Icon, color, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {hidden ? '••••••' : `₹${Number(amount ?? 0).toLocaleString('en-IN')}`}
      </p>
    </div>
  );
}

function AddTransactionModal({ onClose }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    accountType: 'CASH',
    entryType: 'IN',
    amount: '',
    category: '',
    memberId: '',
    chitId: '',
    description: '',
  });

  const isMemberPayment = form.category === 'Member Payment';
  const categories = form.entryType === 'IN' ? CATEGORIES_IN : CATEGORIES_OUT;

  // All members (only needed when Member Payment is selected)
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    enabled: isMemberPayment,
  });
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);
  const selectedMember = activeMembers.find((m) => m.id === form.memberId) ?? null;

  // Chits enrolled by this member
  const { data: memberChits = [] } = useQuery({
    queryKey: ['member-chits', form.memberId],
    queryFn: () => getChitsForMember(form.memberId),
    enabled: isMemberPayment && !!form.memberId,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: () => {
      // Build description that includes member + chit context when it's a member payment
      const autoDesc = isMemberPayment && selectedMember
        ? [
            selectedMember.fullName,
            memberChits.find((c) => c.id === form.chitId)?.name,
            form.description,
          ].filter(Boolean).join(' — ')
        : form.description || null;

      return addWalletTransaction({
        accountType: form.accountType,
        entryType: form.entryType,
        amount: Number(form.amount),
        category: form.category || null,
        description: autoDesc || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      toast.success('Transaction recorded');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record transaction'),
  });

  function handleCategoryChange(cat) {
    setForm((f) => ({ ...f, category: cat, memberId: '', chitId: '' }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 mb-5" style={{ fontFamily: 'Merriweather, serif' }}>
          Record Transaction
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Account" required>
              <Select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </Select>
            </FormField>
            <FormField label="Type" required>
              <Select value={form.entryType} onChange={(e) => setForm((f) => ({ ...f, entryType: e.target.value, category: '', memberId: '', chitId: '' }))}>
                <option value="IN">Money In</option>
                <option value="OUT">Money Out</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Category">
            <Select value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
              <option value="">— Select category —</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </FormField>

          {/* ── Member Payment sub-fields ── */}
          {isMemberPayment && (
            <>
              <FormField label="Member" required>
                <div className="flex items-center gap-2">
                  <Select
                    value={form.memberId}
                    onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value, chitId: '' }))}
                    className="flex-1"
                  >
                    <option value="">— Select member —</option>
                    {activeMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </Select>
                  {selectedMember && <MemberContactCard member={selectedMember} />}
                </div>
              </FormField>

              {form.memberId && (
                <FormField label="Chit Fund">
                  {memberChits.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">No enrolled chits found for this member.</p>
                  ) : (
                    <Select value={form.chitId} onChange={(e) => setForm((f) => ({ ...f, chitId: e.target.value }))}>
                      <option value="">— Select chit (optional) —</option>
                      {memberChits.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}  [{c.status}]
                        </option>
                      ))}
                    </Select>
                  )}
                  {/* Status badges below the dropdown for visual clarity */}
                  {memberChits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {memberChits.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, chitId: c.id }))}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                            form.chitId === c.id
                              ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F]'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            c.status === 'ACTIVE'    ? 'bg-green-500' :
                            c.status === 'COMPLETED' ? 'bg-blue-500'  :
                            c.status === 'PAUSED'    ? 'bg-amber-500' :
                                                       'bg-gray-400'
                          }`} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </FormField>
              )}
            </>
          )}

          <FormField label="Amount (₹)" required>
            <Input
              type="number"
              min="1"
              placeholder="Enter amount"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </FormField>

          <FormField label="Notes">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes…"
              rows={2}
            />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={
                !form.amount || Number(form.amount) <= 0 ||
                (isMemberPayment && !form.memberId)
              }
              className="flex-1"
            >
              Record
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TreasuryPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: getWalletTransactions,
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 300_000 });
  const { data: allChits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits, staleTime: 300_000 });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => listStaff(), staleTime: 300_000 });

  const memberMap = Object.fromEntries((allMembers ?? []).map((m) => [m.id, m.fullName ?? m.name ?? m.id]));
  const chitMap = Object.fromEntries((allChits ?? []).map((c) => [c.id, c.name ?? c.id]));
  const staffMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.fullName ?? s.username ?? 'Admin']));

  const ENTRY_TYPE_STYLE = {
    IN:  'bg-green-100 text-green-700',
    OUT: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Treasury
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track cash and bank balances</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHidden}
            title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Record Transaction
          </Button>
        </div>
      </div>

      {balanceLoading ? (
        <PageSpinner />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BalanceCard label="Cash Balance" amount={balance?.cashBalance} icon={Banknote} color="bg-[#1E3A5F]" hidden={hidden} />
          <BalanceCard label="Bank Balance" amount={balance?.bankBalance} icon={CreditCard} color="bg-[#16A34A]" hidden={hidden} />
          <BalanceCard label="Total Balance" amount={balance?.totalBalance} icon={Wallet} color="bg-[#D4A017]" hidden={hidden} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Transaction History</h2>
        </div>
        {txLoading ? (
          <PageSpinner />
        ) : transactions.length === 0 ? (
          <EmptyState icon={Wallet} title="No transactions" message="Record your first transaction above." />
        ) : (
          <Table columns={['Date', 'Account', 'Type', 'Category', 'Description', 'Amount']}>
            {transactions.map((t) => (
              <Tr
                key={t.id}
                className="cursor-pointer hover:bg-blue-50/40 transition-colors"
                onClick={() => setSelectedTx(t)}
              >
                <Td className="text-gray-500 text-xs">
                  {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.accountType === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {t.accountType}
                  </span>
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ENTRY_TYPE_STYLE[t.entryType] ?? ''}`}>
                    {t.entryType === 'IN' ? (
                      <span className="flex items-center gap-1"><TrendingUp size={10} /> IN</span>
                    ) : (
                      <span className="flex items-center gap-1"><TrendingDown size={10} /> OUT</span>
                    )}
                  </span>
                </Td>
                <Td className="text-gray-600 text-sm">{t.category ?? '—'}</Td>
                <Td className="text-gray-700 text-sm max-w-xs truncate">
                  {resolveDescription(t.description, memberMap, chitMap)}
                </Td>
                <Td className={`font-semibold ${t.entryType === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                  {hidden ? '••••••' : `${t.entryType === 'IN' ? '+' : '−'}₹${Number(t.amount).toLocaleString('en-IN')}`}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} />}

      {selectedTx && (
        <TransactionDetailModal
          tx={selectedTx}
          memberMap={memberMap}
          chitMap={chitMap}
          staffMap={staffMap}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}
