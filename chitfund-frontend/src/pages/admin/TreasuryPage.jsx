import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWalletBalance, getWalletTransactions, addWalletTransaction, transferWallet,
  getMembers, getChits, getChitsForMember, getMemberTotalBalance, listStaff,
  getMemberCredit, redeemMemberCredit,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { Wallet, TrendingUp, TrendingDown, Plus, Banknote, CreditCard, Info, Phone, Mail, MapPin, X, Filter, ArrowLeftRight } from 'lucide-react';

function utc(s) { return s ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null; }
function parseTs(val) {
  if (!val) return null;
  if (Array.isArray(val)) { const [y, mo, d, h = 0, mi = 0, s = 0] = val; return new Date(Date.UTC(y, mo - 1, d, h, mi, s)); }
  const str = String(val);
  if (!str.endsWith('Z') && !str.includes('+')) return new Date(str + 'Z');
  return new Date(str);
}
function isToday(date) {
  if (!date || isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

// UUID regex used to detect and replace UUIDs in auto-generated descriptions
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;


// JSX version — renders member/chit UUIDs as clickable links, unknown UUIDs as short mono text
function ResolvedDescription({ desc, memberMap, chitMap, navigate }) {
  if (!desc) return <span className="text-gray-400">—</span>;

  const parts = [];
  let lastIndex = 0;
  const re = new RegExp(UUID_RE.source, 'gi');
  let match;

  while ((match = re.exec(desc)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex}>{desc.slice(lastIndex, match.index)}</span>);
    }
    const uuid = match[0];
    const lower = uuid.toLowerCase();
    const memberName = memberMap[lower] ?? memberMap[uuid];
    const chitName   = chitMap[lower]  ?? chitMap[uuid];
    if (memberName) {
      parts.push(
        <button
          key={uuid}
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/members/${lower}`); }}
          className="text-[#1E3A5F] font-semibold hover:underline cursor-pointer"
        >
          {memberName}
        </button>
      );
    } else if (chitName) {
      parts.push(
        <button
          key={uuid}
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/chits/${lower}`); }}
          className="text-[#1E3A5F] font-semibold hover:underline cursor-pointer"
        >
          {chitName}
        </button>
      );
    } else {
      // Unknown UUID (draw/batch ID etc.) — suppress it entirely
    }
    lastIndex = match.index + uuid.length;
  }

  if (lastIndex < desc.length) {
    parts.push(<span key="tail">{desc.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}


function TransactionDetailModal({ tx, memberMap, chitMap, staffMap, onClose }) {
  const navigate = useNavigate();
  const isTransfer = tx.category === 'TRANSFER';
  const isIn = tx.entryType === 'IN';

  // Parse memberId and settlementId from settlement payment description
  const settlementMemberId = tx.category === 'SETTLEMENT_PAYMENT'
    ? (tx.description?.match(/member\s+([0-9a-f-]{36})/i)?.[1] ?? null)
    : null;
  const settlementId = tx.category === 'SETTLEMENT_PAYMENT'
    ? (tx.description?.match(/settlement\s+([0-9a-f-]{36})/i)?.[1] ?? null)
    : null;
  // referenceId holds the payment transaction ID for SETTLEMENT_PAYMENT entries
  const paymentTxId = tx.category === 'SETTLEMENT_PAYMENT' ? tx.referenceId : null;

  // Credit withdrawal: extract memberId from description
  const creditWithdrawalMemberId = tx.category === 'CREDIT_WITHDRAWAL'
    ? (tx.description?.match(/member\s+([0-9a-f-]{36})/i)?.[1] ?? null)
    : null;

  function fmtCategory(cat) {
    const LABELS = {
      TRANSFER: 'Transfer',
      SETTLEMENT_PAYMENT: 'Settlement Payment',
      PAYOUT_DISBURSEMENT: 'Payout Disbursement',
      PAYOUT_VOID_REVERSAL: 'Payout Void Reversal',
      CREDIT_WITHDRAWAL: 'Credit Balance Return',
    };
    return LABELS[cat] ?? (cat ? cat.replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()) : '—');
  }

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
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EEF2F8] text-[#1E3A5F]">TRANSFER</span>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {tx.entryType}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(utc(tx.createdAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 py-3" style={{ paddingLeft: 28, paddingRight: 28 }}>
          {/* Amount hero */}
          <div className="flex items-center justify-between py-3 mb-1">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Amount</p>
              <p className={`text-3xl font-bold mt-0.5 ${isTransfer ? 'text-[#1E3A5F]' : isIn ? 'text-green-700' : 'text-red-600'}`}>
                {isIn ? '+' : '−'}₹{Number(tx.amount).toLocaleString('en-IN')}
              </p>
            </div>
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
              tx.accountType === 'CASH'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-[#EEF2F8] text-[#1E3A5F] border-[#C7D5E8]'
            }`}>
              {tx.accountType}
            </span>
          </div>

          {/* Core details */}
          <div className="border-t border-gray-100">
            {tx.category && <DRow label="Category" value={fmtCategory(tx.category)} />}
            {tx.description && (
              <div className="py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  <ResolvedDescription desc={tx.description} memberMap={memberMap} chitMap={chitMap} navigate={navigate} />
                </p>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="border-t border-gray-100 mt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Details</p>
            <DRow label="Date & Time" value={new Date(utc(tx.createdAt)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} />
            {tx.createdBy && <DRow label="Recorded By" value={staffMap[tx.createdBy] ?? 'Admin'} />}
            {tx.id && (
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Entry ID</span>
                <span className="text-xs font-mono text-gray-400">{String(tx.id).slice(0, 8)}…</span>
              </div>
            )}
            {settlementId && (
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Settlement ID</span>
                <span className="text-xs font-mono text-gray-400">{String(settlementId).slice(0, 8)}…</span>
              </div>
            )}
            {paymentTxId && (
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Payment ID</span>
                <span className="text-xs font-mono text-gray-400">{String(paymentTxId).slice(0, 8)}…</span>
              </div>
            )}
          </div>

          {/* Credit Withdrawal member link */}
          {creditWithdrawalMemberId && (
            <div className="border-t border-gray-100 pt-4 pb-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                <p className="text-xs font-semibold text-emerald-700">Credit Balance Return</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Member's credit balance was returned as cash — credits deducted from their wallet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/members/${creditWithdrawalMemberId}`); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-600 hover:text-white transition-all"
              >
                {memberMap[creditWithdrawalMemberId?.toLowerCase()] ?? 'View Member'} →
              </button>
            </div>
          )}

          {/* Settlement / Payment action buttons */}
          {settlementMemberId && (
            <div className="border-t border-gray-100 pt-4 pb-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  const params = new URLSearchParams({ memberId: settlementMemberId });
                  if (settlementId) params.set('settlementId', settlementId);
                  navigate(`/settlement?${params.toString()}`);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-[#1E3A5F] text-[#1E3A5F] text-sm font-semibold hover:bg-[#1E3A5F] hover:text-white transition-all"
              >
                View Settlement Details →
              </button>
              {paymentTxId && settlementId && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    const params = new URLSearchParams({ memberId: settlementMemberId });
                    params.set('settlementId', settlementId);
                    params.set('paymentId', paymentTxId);
                    navigate(`/settlement?${params.toString()}`);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-green-600 text-green-700 text-sm font-semibold hover:bg-green-600 hover:text-white transition-all"
                >
                  Open Payment Receipt →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CATEGORIES_IN = ['Member Payment', 'Multiple Payments Collection', 'Multi-Slot Installment Collection', 'Chit Payout Return', 'Investment', 'Other Income'];
const CATEGORIES_OUT = ['Payout Disbursement', 'Multi-Slot Payout Disbursement', 'Credit Balance Return', 'Salary', 'Expense', 'Personal Withdrawal', 'Other Expense'];

// ─── Mini member contact card (hover popover) ─────────────────────────────
function MemberContactCard({ member }) {
  const [coords, setCoords] = useState(null);

  const { data: totalOutstanding } = useQuery({
    queryKey: ['member-total-balance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!coords && !!member?.id,
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
  const isCreditReturn = form.category === 'Credit Balance Return';
  const categories = form.entryType === 'IN' ? CATEGORIES_IN : CATEGORIES_OUT;

  // All members (needed for Member Payment or Credit Balance Return)
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    enabled: isMemberPayment || isCreditReturn,
  });
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);
  const selectedMember = activeMembers.find((m) => m.id === form.memberId) ?? null;

  // Credit balance for selected member (only for Credit Balance Return)
  const { data: selectedMemberCredit, isLoading: creditLoading } = useQuery({
    queryKey: ['memberCredit', form.memberId],
    queryFn: () => getMemberCredit(form.memberId),
    enabled: isCreditReturn && !!form.memberId,
  });
  const availableCredit = selectedMemberCredit ? Number(selectedMemberCredit.balance ?? 0) : null;

  // Chits enrolled by this member
  const { data: memberChits = [] } = useQuery({
    queryKey: ['member-chits', form.memberId],
    queryFn: () => getChitsForMember(form.memberId),
    enabled: isMemberPayment && !!form.memberId,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (isCreditReturn) {
        return redeemMemberCredit({
          memberId: form.memberId,
          amount: Number(form.amount),
          accountType: form.accountType,
          notes: form.description || null,
        });
      }

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
      qc.invalidateQueries({ queryKey: ['wallet-transactions', 'paged'] });
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
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

          {/* ── Credit Balance Return sub-fields ── */}
          {isCreditReturn && (
            <>
              <FormField label="Member" required>
                <Select
                  value={form.memberId}
                  onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value, amount: '' }))}
                >
                  <option value="">— Select member —</option>
                  {activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.fullName}</option>
                  ))}
                </Select>
              </FormField>
              {form.memberId && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  {creditLoading ? (
                    <p className="text-xs text-emerald-600">Loading credit balance…</p>
                  ) : availableCredit !== null ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-emerald-700">Available Credit Balance</p>
                        <p className="text-lg font-bold text-emerald-700">₹{availableCredit.toLocaleString('en-IN')}</p>
                      </div>
                      {availableCredit > 0 && (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, amount: String(availableCredit) }))}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer"
                        >
                          Withdraw All
                        </button>
                      )}
                    </div>
                  ) : null}
                  {availableCredit === 0 && (
                    <p className="text-xs text-emerald-600 mt-1">No credit balance to return.</p>
                  )}
                </div>
              )}
            </>
          )}

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
                            c.status === 'COMPLETED' ? 'bg-[#1E3A5F]'  :
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
                (isMemberPayment && !form.memberId) ||
                (isCreditReturn && (!form.memberId || !form.amount || availableCredit === 0 || Number(form.amount) > (availableCredit ?? 0)))
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

function TransferModal({ onClose }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [fromAccount, setFromAccount] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const toAccount = fromAccount === 'CASH' ? 'BANK' : 'CASH';

  const mutation = useMutation({
    mutationFn: () => transferWallet({
      fromAccount,
      amount: Number(amount),
      description: description || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions', 'paged'] });
      toast.success(`Transferred ₹${Number(amount).toLocaleString('en-IN')} from ${fromAccount} to ${toAccount}`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Transfer failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF4FA' }}>
              <ArrowLeftRight size={16} style={{ color: '#1E3A5F' }} />
            </div>
            <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
              Transfer Funds
            </h3>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* From / To selector */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Transfer direction</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'CASH', label: 'Cash → Bank', icon: Banknote },
                { value: 'BANK', label: 'Bank → Cash', icon: CreditCard },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFromAccount(value)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all cursor-pointer text-sm font-medium ${
                    fromAccount === value
                      ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Visual flow indicator */}
          <div className="flex items-center justify-center gap-3 py-2">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              fromAccount === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-[#EEF2F8] text-[#1E3A5F]'
            }`}>
              {fromAccount}
            </span>
            <ArrowLeftRight size={14} className="text-gray-400" />
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              toAccount === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-[#EEF2F8] text-[#1E3A5F]'
            }`}>
              {toAccount}
            </span>
          </div>

          <FormField label="Amount (₹)" required>
            <Input
              type="number"
              min="1"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>

          <FormField label="Notes">
            <Input
              type="text"
              placeholder="Optional notes…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!amount || Number(amount) <= 0}
              className="flex-1"
            >
              Transfer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DATE_PRESETS = [
  { label: 'Today',        days: 0  },
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'All time',     days: null },
];


export default function TreasuryPage() {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [activePreset, setActivePreset] = useState('Today');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const { hidden } = useHiddenAmounts();

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
  });

  const [transactions, setTransactions] = useState([]);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txPage, setTxPage] = useState(0);
  const [txLoadingMore, setTxLoadingMore] = useState(false);

  const { isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions', 'paged'],
    queryFn: async () => {
      const result = await getWalletTransactions({ page: 0, size: 50 });
      setTransactions(result.content ?? []);
      setTxHasMore(result.hasMore ?? false);
      setTxPage(0);
      return result;
    },
  });

  async function loadMoreTx() {
    setTxLoadingMore(true);
    try {
      const nextPage = txPage + 1;
      const result = await getWalletTransactions({ page: nextPage, size: 50 });
      setTransactions(prev => [...prev, ...(result.content ?? [])]);
      setTxHasMore(result.hasMore ?? false);
      setTxPage(nextPage);
    } finally {
      setTxLoadingMore(false);
    }
  }

  const { data: allMembers = [] } = useQuery({ queryKey: ['members', 'all'], queryFn: () => getMembers({ size: 500 }), staleTime: 60_000 });
  const { data: allChits = [] } = useQuery({ queryKey: ['chits', 'all'], queryFn: () => getChits({ size: 500 }), staleTime: 60_000 });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => listStaff()});

  const memberMap = Object.fromEntries(
    (allMembers ?? []).flatMap((m) => {
      const name = m.fullName ?? m.name ?? m.id;
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    })
  );
  const chitMap = Object.fromEntries((allChits ?? []).map((c) => [c.id, c.name ?? c.id]));
  const staffMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.fullName ?? s.username ?? 'Admin']));

  const ENTRY_TYPE_STYLE = {
    IN:  'bg-green-100 text-green-700',
    OUT: 'bg-red-100 text-red-700',
  };

  function EntryTypeBadge({ t }) {
    if (t.category === 'TRANSFER') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#EEF2F8] text-[#1E3A5F]">
          <ArrowLeftRight size={10} /> Transfer
        </span>
      );
    }
    const isIn = t.entryType === 'IN';
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ENTRY_TYPE_STYLE[t.entryType] ?? ''}`}>
        {isIn ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        {isIn ? 'In' : 'Out'}
      </span>
    );
  }

  // ── Filter transactions client-side ───────────────────────────────────────
  const filteredTx = useMemo(() => {
    const cutoff = activePreset === 'Today' ? null
      : DATE_PRESETS.find((p) => p.label === activePreset)?.days != null
        ? new Date(Date.now() - DATE_PRESETS.find((p) => p.label === activePreset).days * 86_400_000)
        : null;
    const filtered = transactions.filter((t) => {
      const tDate = parseTs(t.createdAt);
      if (activePreset === 'Today' && !isToday(tDate)) return false;
      if (cutoff && tDate && tDate < cutoff) return false;
      if (filterAccount !== 'ALL' && t.accountType !== filterAccount) return false;
      if (filterType !== 'ALL' && t.entryType !== filterType) return false;
      return true;
    });
    return sortAsc ? [...filtered].reverse() : filtered;
  }, [transactions, activePreset, filterAccount, filterType, sortAsc]);

  // ── Running balance (oldest → newest, then reverse for display) ───────────
  const txWithRunning = useMemo(() => {
    const asc = [...filteredTx].reverse();
    let running = 0;
    const result = asc.map((t) => {
      running += t.entryType === 'IN' ? Number(t.amount) : -Number(t.amount);
      return { ...t, runningBalance: running };
    });
    return result.reverse();
  }, [filteredTx]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Treasury
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track cash and bank balances · settle member accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={() => setShowTransfer(true)}>
            <ArrowLeftRight size={15} /> Transfer
          </Button>
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
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-gray-900">Transaction History</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Filter size={13} />
              <span>{filteredTx.length} of {transactions.length} entries</span>
            </div>
          </div>

          {/* Date preset chips */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => {
              const isActive = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => setActivePreset(p.label)}
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
            <div className="flex gap-2 ml-auto">
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
              >
                <option value="ALL">All accounts</option>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
              >
                <option value="ALL">IN + OUT</option>
                <option value="IN">Money In</option>
                <option value="OUT">Money Out</option>
              </select>
            </div>
          </div>
        </div>

        {txLoading ? (
          <PageSpinner />
        ) : filteredTx.length === 0 ? (
          <EmptyState icon={Wallet} title="No transactions" message="No transactions match the selected filters." />
        ) : (
          <Table columns={[
            <button type="button" onClick={() => setSortAsc((v) => !v)} className="flex items-center gap-1 cursor-pointer hover:text-gray-900 transition-colors">
              Date {sortAsc ? '↑' : '↓'}
            </button>,
            'Account', 'Type', 'Category', 'Description', 'Amount', 'Balance'
          ]}>
            {txWithRunning.map((t) => (
              <Tr
                key={t.id}
                className="cursor-pointer hover:bg-[#EEF2F8]/40 transition-colors"
                onClick={() => setSelectedTx(t)}
              >
                <Td className="text-gray-500 text-xs whitespace-nowrap">
                  {new Date(utc(t.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.accountType === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-[#EEF2F8] text-[#1E3A5F]'
                  }`}>
                    {t.accountType}
                  </span>
                </Td>
                <Td><EntryTypeBadge t={t} /></Td>
                <Td className="text-gray-600 text-sm">
                  {t.category === 'TRANSFER' ? (
                    <span className="font-medium" style={{ color: '#1E3A5F' }}>Transfer</span>
                  ) : (t.category ?? '—')}
                </Td>
                <Td className="text-gray-700 text-sm max-w-xs">
                  <div className="truncate">
                    <ResolvedDescription desc={t.description} memberMap={memberMap} chitMap={chitMap} navigate={navigate} />
                  </div>
                </Td>
                <Td className={`font-semibold whitespace-nowrap ${
                  t.category === 'TRANSFER'
                    ? 'text-[#1E3A5F]'
                    : t.entryType === 'IN' ? 'text-green-700' : 'text-red-600'
                }`}>
                  {hidden ? '••••••' : `${
                    t.category === 'TRANSFER'
                      ? (t.entryType === 'IN' ? '+' : '−')
                      : (t.entryType === 'IN' ? '+' : '−')
                  }₹${Number(t.amount).toLocaleString('en-IN')}`}
                </Td>
                <Td className={`text-sm font-semibold whitespace-nowrap ${t.runningBalance >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                  {hidden ? '••••••' : `₹${t.runningBalance.toLocaleString('en-IN')}`}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
        {txHasMore && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button
              type="button"
              onClick={loadMoreTx}
              disabled={txLoadingMore}
              className="px-5 py-2 text-sm font-semibold rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              {txLoadingMore ? 'Loading…' : `Load more (${transactions.length} loaded)`}
            </button>
          </div>
        )}
      </div>


      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} />}
      {showTransfer && <TransferModal onClose={() => setShowTransfer(false)} />}

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
