import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMembers, getSettlementPreview, confirmSettlement, getMemberSettlements,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import FormField, { Select, Textarea } from '../../components/ui/FormField';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  HandCoins, Info, ChevronDown, ChevronUp, CheckSquare, Square,
  TrendingUp, TrendingDown, CheckCircle, History,
} from 'lucide-react';

// ─── Case badge styling ────────────────────────────────────────────────────
const CASE_COLORS = {
  CASE_A:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'A' },
  CASE_B1: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_B2: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_C:  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'C' },
};

function CaseBadge({ settlementCase }) {
  const cfg = CASE_COLORS[settlementCase] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: '?' };
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Payout status pill ────────────────────────────────────────────────────
function PayoutStatusPill({ status }) {
  const cfg = {
    DISBURSED:           { bg: 'bg-green-100',  text: 'text-green-700'  },
    PARTIALLY_DISBURSED: { bg: 'bg-purple-100', text: 'text-purple-700' },
    PENDING:             { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    CANCELLED:           { bg: 'bg-gray-100',   text: 'text-gray-500'   },
    VOIDED:              { bg: 'bg-gray-100',   text: 'text-gray-500'   },
    NONE:                { bg: 'bg-gray-100',   text: 'text-gray-400'   },
  }[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500' };

  const label = {
    DISBURSED: 'Disbursed', PARTIALLY_DISBURSED: 'Partial',
    PENDING: 'Pending', CANCELLED: 'Cancelled', VOIDED: 'Voided', NONE: 'None',
  }[status] ?? status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {label}
    </span>
  );
}

// ─── Amount display ────────────────────────────────────────────────────────
function Amt({ value, hidden, showSign = false, className = '' }) {
  if (hidden) return <span className="font-medium text-gray-400 tracking-widest">••••••</span>;
  const n = Number(value ?? 0);
  const formatted = `₹${Math.abs(n).toLocaleString('en-IN')}`;
  const sign = showSign ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
  return <span className={className}>{sign}{formatted}</span>;
}

// ─── Tooltip (Info icon hover) ─────────────────────────────────────────────
function TooltipInfo({ text }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState(null);

  return (
    <>
      <span
        className="inline-flex cursor-help"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
          setShow(true);
        }}
        onMouseLeave={() => setShow(false)}
      >
        <Info size={14} className="text-gray-400 hover:text-[#1E3A5F] transition-colors" />
      </span>
      {show && coords && (
        <div
          className="fixed z-[9999] w-80 bg-gray-900 text-gray-100 rounded-xl shadow-2xl p-4 pointer-events-none"
          style={{ left: coords.x, top: coords.y - 12, transform: 'translate(-50%, -100%)' }}
        >
          <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono">{text}</pre>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-[6px] border-r-[6px] border-t-[6px]
            border-l-transparent border-r-transparent border-t-gray-900" />
        </div>
      )}
    </>
  );
}

// ─── Main SettlementTab ────────────────────────────────────────────────────
export default function SettlementTab({ initialMemberId = '' }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const { hidden } = useHiddenAmounts();

  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId);
  const [toggledChits, setToggledChits] = useState({}); // chitId → true/false
  const [modes, setModes] = useState({});               // chitId → 'FAIR' | 'ADMIN_WIN'
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Data queries ───────────────────────────────────────────────────────
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    staleTime: 300_000,
  });
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);
  const selectedMember = allMembers.find((m) => m.id === selectedMemberId) ?? null;

  // Preview: triggered whenever member selection changes
  const {
    data: preview,
    isLoading: previewLoading,
    isError: previewError,
  } = useQuery({
    queryKey: ['settlement-preview', selectedMemberId],
    queryFn: () => getSettlementPreview({
      memberId: selectedMemberId,
      chitIds: null, // fetch all chits
    }),
    enabled: !!selectedMemberId,
    staleTime: 0, // always fresh
  });

  // Auto-toggle all chits on when preview data arrives (React Query v5: no onSuccess in useQuery)
  useEffect(() => {
    if (!preview?.chitItems) return;
    const allOn = {};
    const defaultModes = {};
    preview.chitItems.forEach((item) => {
      allOn[item.chitId] = true;
      defaultModes[item.chitId] = 'FAIR';
    });
    setToggledChits(allOn);
    setModes(defaultModes);
  }, [preview]);

  // Settlement history for selected member
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['settlement-history', selectedMemberId],
    queryFn: () => getMemberSettlements(selectedMemberId),
    enabled: !!selectedMemberId && historyOpen,
    staleTime: 60_000,
  });

  // ── Derived calculation (respecting toggles + mode overrides) ─────────
  const chitItems = preview?.chitItems ?? [];

  // Re-compute net amounts client-side when admin toggles mode (for CASE_C)
  // The backend already returns both mode amounts; we just pick the right one.
  const computedItems = useMemo(() => {
    return chitItems.map((item) => {
      const currentMode = modes[item.chitId] ?? 'FAIR';
      let netAmount = item.netAmount;
      // For CASE_C, if mode differs from what backend returned, swap to alternative
      if (item.settlementCase === 'CASE_C') {
        const backendMode = item.currentMode ?? 'FAIR';
        if (currentMode !== backendMode && item.alternativeModeAmount !== null) {
          netAmount = item.alternativeModeAmount;
        }
      }
      return { ...item, displayNetAmount: netAmount, displayMode: currentMode };
    });
  }, [chitItems, modes]);

  const includedItems = computedItems.filter((i) => toggledChits[i.chitId]);

  const totalOwed = includedItems
    .filter((i) => Number(i.displayNetAmount) > 0)
    .reduce((s, i) => s + Number(i.displayNetAmount), 0);

  const totalRefunded = includedItems
    .filter((i) => Number(i.displayNetAmount) < 0)
    .reduce((s, i) => s + Math.abs(Number(i.displayNetAmount)), 0);

  const grandTotal = totalOwed - totalRefunded;

  // ── Confirm mutation ───────────────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: () => {
      const chitItemsPayload = includedItems.map((item) => ({
        chitId: item.chitId,
        mode: item.settlementCase === 'CASE_C' ? (modes[item.chitId] ?? 'FAIR') : null,
      }));
      return confirmSettlement({
        memberId: selectedMemberId,
        chitItems: chitItemsPayload,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast.success('Settlement confirmed successfully');
      qc.invalidateQueries({ queryKey: ['settlement-preview', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['settlement-history', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setShowConfirm(false);
      setSelectedMemberId('');
      setToggledChits({});
      setModes({});
      setNotes('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Settlement failed'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const toggleChit = useCallback((chitId) => {
    setToggledChits((prev) => ({ ...prev, [chitId]: !prev[chitId] }));
  }, []);

  const toggleMode = useCallback((chitId) => {
    setModes((prev) => ({
      ...prev,
      [chitId]: prev[chitId] === 'ADMIN_WIN' ? 'FAIR' : 'ADMIN_WIN',
    }));
  }, []);

  const fmtAmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF4FA' }}>
          <HandCoins size={20} style={{ color: '#1E3A5F' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Member Settlement
          </h2>
          <p className="text-sm text-gray-500">Calculate and finalize a member's exit settlement across all chits</p>
        </div>
      </div>

      {/* Step 1: Member selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Member</h3>
        <div className="max-w-sm">
          <FormField label="Member">
            <Select
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setToggledChits({});
                setModes({});
              }}
            >
              <option value="">— Choose a member —</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </Select>
          </FormField>
        </div>
        {selectedMember && (
          <p className="text-xs text-gray-400 mt-2">
            Member ID: <span className="font-mono">{selectedMemberId.slice(0, 8)}…</span>
          </p>
        )}
      </div>

      {/* Step 2: Settlement table */}
      {selectedMemberId && (
        <>
          {previewLoading ? (
            <PageSpinner />
          ) : previewError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Failed to load settlement preview. Please try again.
            </div>
          ) : chitItems.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No chit enrollments found"
              message="This member has no chit enrollment records to settle."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Settlement Breakdown</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Toggle chits to include/exclude. For partial payouts (Case C), choose Fair or Admin Win mode.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Chit</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Case</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payout</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unpaid Dues</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Future Installs</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Amount</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {computedItems.map((item) => {
                      const included = !!toggledChits[item.chitId];
                      const net = Number(item.displayNetAmount ?? 0);
                      const isOwes = net > 0;
                      const isRefund = net < 0;
                      const isZero = net === 0;

                      return (
                        <tr
                          key={item.chitId}
                          className={`transition-colors ${included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                        >
                          {/* Toggle */}
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleChit(item.chitId)}
                              className="p-1 rounded cursor-pointer text-gray-400 hover:text-[#1E3A5F] transition-colors"
                              title={included ? 'Exclude this chit' : 'Include this chit'}
                            >
                              {included ? (
                                <CheckSquare size={18} style={{ color: '#1E3A5F' }} />
                              ) : (
                                <Square size={18} />
                              )}
                            </button>
                          </td>

                          {/* Chit name */}
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-800">{item.chitName}</p>
                              <p className="text-xs text-gray-400">{item.chitStatus}</p>
                            </div>
                          </td>

                          {/* Case badge */}
                          <td className="px-4 py-3 text-center">
                            <CaseBadge settlementCase={item.settlementCase} />
                          </td>

                          {/* Payout status */}
                          <td className="px-4 py-3">
                            <PayoutStatusPill status={item.payoutStatus} />
                          </td>

                          {/* Unpaid dues */}
                          <td className="px-4 py-3 text-right">
                            {hidden ? (
                              <span className="text-gray-400 tracking-widest">••••••</span>
                            ) : (
                              <span className={Number(item.unpaidDues) > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                                {fmtAmt(item.unpaidDues)}
                              </span>
                            )}
                          </td>

                          {/* Future installments */}
                          <td className="px-4 py-3 text-right">
                            {hidden ? (
                              <span className="text-gray-400 tracking-widest">••••••</span>
                            ) : (
                              <span className="text-gray-700">{fmtAmt(item.futureInstallments)}</span>
                            )}
                          </td>

                          {/* Mode toggle (CASE_C only) */}
                          <td className="px-4 py-3 text-center">
                            {item.settlementCase === 'CASE_C' ? (
                              <button
                                type="button"
                                onClick={() => toggleMode(item.chitId)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                  item.displayMode === 'FAIR'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                                }`}
                              >
                                {item.displayMode === 'FAIR' ? 'Fair' : 'Admin Win'}
                              </button>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Net amount */}
                          <td className="px-4 py-3 text-right">
                            {hidden ? (
                              <span className="text-gray-400 tracking-widest">••••••</span>
                            ) : isZero ? (
                              <span className="text-gray-500 text-xs">Balanced</span>
                            ) : isOwes ? (
                              <span className="font-semibold text-red-600 flex items-center justify-end gap-1">
                                <TrendingUp size={13} /> {fmtAmt(net)}
                              </span>
                            ) : (
                              <span className="font-semibold text-green-700 flex items-center justify-end gap-1">
                                <TrendingDown size={13} /> {fmtAmt(net)}
                              </span>
                            )}
                          </td>

                          {/* Info tooltip */}
                          <td className="px-4 py-3 text-center">
                            {item.tooltipDetail && <TooltipInfo text={item.tooltipDetail} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Summary panel */}
          {chitItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Settlement Summary</h3>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Chits included</p>
                  <p className="text-2xl font-bold text-gray-800">{includedItems.length}</p>
                  <p className="text-xs text-gray-400">of {chitItems.length} total</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Member owes</p>
                  <p className="text-2xl font-bold text-red-600">
                    {hidden ? '••••••' : `₹${totalOwed.toLocaleString('en-IN')}`}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Fund refunds</p>
                  <p className="text-2xl font-bold text-green-700">
                    {hidden ? '••••••' : `₹${totalRefunded.toLocaleString('en-IN')}`}
                  </p>
                </div>
              </div>

              {/* Grand total */}
              <div className={`rounded-xl p-5 mb-5 border-2 ${
                grandTotal > 0
                  ? 'bg-red-50 border-red-200'
                  : grandTotal < 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                {grandTotal === 0 ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle size={24} className="text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-gray-700">Accounts balance out — no payment needed.</p>
                    </div>
                  </div>
                ) : grandTotal > 0 ? (
                  <div className="flex items-center gap-3">
                    <TrendingUp size={24} className="text-red-500" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-red-700">
                        Member pays {hidden ? '••••••' : `₹${grandTotal.toLocaleString('en-IN')}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <TrendingDown size={24} className="text-green-600" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-green-700">
                        Fund refunds {hidden ? '••••••' : `₹${Math.abs(grandTotal).toLocaleString('en-IN')}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mb-4">
                <FormField label="Settlement Notes">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional admin notes for this settlement…"
                    rows={2}
                  />
                </FormField>
              </div>

              {/* Confirm button */}
              <Button
                size="lg"
                className="w-full"
                disabled={includedItems.length === 0}
                onClick={() => setShowConfirm(true)}
              >
                <HandCoins size={18} />
                Confirm Settlement
              </Button>
            </div>
          )}

          {/* Settlement History */}
          {chitItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History size={16} className="text-gray-400" />
                  <span className="font-semibold text-gray-700">Past Settlements</span>
                </div>
                {historyOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {historyOpen && (
                <div className="border-t border-gray-100">
                  {historyLoading ? (
                    <div className="p-6"><PageSpinner /></div>
                  ) : history.length === 0 ? (
                    <EmptyState icon={History} title="No past settlements" message="No previous settlement records for this member." />
                  ) : (
                    <Table columns={['Date', 'Settled By', 'Owes', 'Refunded', 'Net', 'Notes']}>
                      {history.map((s) => {
                        const net = Number(s.netAmount);
                        return (
                          <Tr key={s.id}>
                            <Td className="text-gray-500 text-xs whitespace-nowrap">
                              {new Date(s.settledAt).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </Td>
                            <Td className="text-gray-600 text-sm font-mono text-xs">
                              {String(s.settledBy).slice(0, 8)}…
                            </Td>
                            <Td className="text-red-600 font-medium">
                              {hidden ? '••••••' : `₹${Number(s.totalOwed).toLocaleString('en-IN')}`}
                            </Td>
                            <Td className="text-green-700 font-medium">
                              {hidden ? '••••••' : `₹${Number(s.totalRefunded).toLocaleString('en-IN')}`}
                            </Td>
                            <Td className={`font-semibold ${net > 0 ? 'text-red-600' : net < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                              {hidden ? '••••••' : (
                                net === 0 ? 'Balanced'
                                : net > 0 ? `+₹${net.toLocaleString('en-IN')}`
                                : `−₹${Math.abs(net).toLocaleString('en-IN')}`
                              )}
                            </Td>
                            <Td className="text-gray-500 text-xs max-w-xs truncate">
                              {s.notes ?? '—'}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Table>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Confirm Dialog */}
      {showConfirm && (
        <ConfirmDialog
          variant="warning"
          title="Confirm Settlement"
          description={`Settle ${selectedMember?.fullName} across ${includedItems.length} chit${includedItems.length !== 1 ? 's' : ''}. This action cannot be undone.`}
          actionLabel="Yes, Confirm Settlement"
          onConfirm={() => confirmMutation.mutate()}
          onClose={() => setShowConfirm(false)}
          loading={confirmMutation.isPending}
        >
          <div className="space-y-3 pb-2">
            <div className={`rounded-lg p-3 text-sm font-semibold ${
              grandTotal > 0 ? 'bg-red-50 text-red-700'
              : grandTotal < 0 ? 'bg-green-50 text-green-700'
              : 'bg-gray-50 text-gray-600'
            }`}>
              {grandTotal === 0
                ? 'Accounts balance out — no payment needed.'
                : grandTotal > 0
                ? `Member pays ₹${grandTotal.toLocaleString('en-IN')}`
                : `Fund refunds ₹${Math.abs(grandTotal).toLocaleString('en-IN')}`}
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              {includedItems.map((i) => (
                <div key={i.chitId} className="flex justify-between">
                  <span>{i.chitName}</span>
                  <span className={Number(i.displayNetAmount) >= 0 ? 'text-red-600' : 'text-green-600'}>
                    {Number(i.displayNetAmount) >= 0
                      ? `owes ₹${Number(i.displayNetAmount).toLocaleString('en-IN')}`
                      : `refund ₹${Math.abs(Number(i.displayNetAmount)).toLocaleString('en-IN')}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
