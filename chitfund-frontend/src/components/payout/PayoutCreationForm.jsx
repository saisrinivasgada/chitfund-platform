import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getChitsForMember, getMemberBalance, createPayout } from '../../services/api';
import { useToastContext } from '../layout/AppLayout';
import Button from '../ui/Button';
import FormField, { Input, Textarea } from '../ui/FormField';
import { AlertCircle, ArrowRight, Banknote, Wallet } from 'lucide-react';

function ToggleSwitch({ on, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        on ? 'bg-[#1E3A5F]' : 'bg-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

/**
 * Reusable payout creation form.
 *
 * Props:
 *   chitId              — UUID of the chit being paid out
 *   chit                — chit object (needs installmentAmount)
 *   memberId            — UUID of the winning member
 *   monthNumber         — draw month number
 *   defaultWinningAmount — pre-filled winning amount
 *   defaultAdjustment   — pre-filled manual adjustment (e.g. from winner.discountAmount)
 *   editableAmount      — if true, winning amount shown as editable input (default false)
 *   onSuccess(payout)   — called after successful creation; parent handles cache cleanup
 */
export default function PayoutCreationForm({
  chitId,
  chit,
  memberId,
  monthNumber,
  defaultWinningAmount,
  defaultAdjustment = 0,
  editableAmount = false,
  onSuccess,
}) {
  const qc    = useQueryClient();
  const toast = useToastContext();

  const installmentAmount = Number(chit?.installmentAmount ?? 0);

  const [winningAmt,          setWinningAmt]          = useState(String(defaultWinningAmount ?? ''));
  const [manualAdjustment,    setManualAdjustment]    = useState(String(defaultAdjustment));
  const [notes,               setNotes]               = useState('');
  const [collectCurrentMonth, setCollectCurrentMonth] = useState(false);
  const [installmentOverride, setInstallmentOverride] = useState('');
  const [crossChitCollect,    setCrossChitCollect]    = useState({});
  const [sameChitOtherCollect, setSameChitOtherCollect] = useState({});

  // All chits this member is enrolled in
  const { data: memberChits = [] } = useQuery({
    queryKey: ['memberChits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  // Full per-chit balances with month breakdown — used for cross-chit settlement
  // and to determine whether the winning month has already been paid.
  const chitIdStr = memberChits.map((c) => c.id).join(',');
  const { data: perChitBalances, isLoading: balancesLoading } = useQuery({
    queryKey: ['memberBalancesAllChits', memberId, chitIdStr],
    queryFn: async () => {
      const results = await Promise.all(
        memberChits.map((c) => getMemberBalance({ memberId, chitId: c.id }))
      );
      return results.map((b, i) => ({
        ...b,
        chitName: memberChits[i].name,
        chitId:   memberChits[i].id,
      }));
    },
    enabled: memberChits.length > 0 && !!memberId,
  });

  // Derived settlement values
  const otherActiveChits = memberChits.filter(
    (c) => String(c.id) !== String(chitId) && c.status === 'ACTIVE'
  );
  const crossBalances = Object.fromEntries(
    (perChitBalances ?? [])
      .filter((b) => String(b.chitId) !== String(chitId))
      .map((b) => [String(b.chitId), Number(b.totalOutstanding ?? 0)])
  );
  const otherChitsWithBalance = otherActiveChits.filter(
    (c) => (crossBalances[String(c.id)] ?? 0) > 0
  );
  const currentChitBalance = (perChitBalances ?? []).find(
    (b) => String(b.chitId) === String(chitId)
  );

  // Other outstanding months in THIS chit (excluding the winning draw month)
  const sameChitOtherMonths = (currentChitBalance?.months ?? [])
    .filter((m) => m.monthNumber !== monthNumber && Number(m.balance ?? 0) > 0);

  // Default to installmentAmount while loading so toggle is enabled;
  // 0 means "already paid" → toggle disabled.
  const winningMonthRemaining = (() => {
    if (!perChitBalances) return installmentAmount;
    const month = currentChitBalance?.months?.find((m) => m.monthNumber === monthNumber);
    return month ? Number(month.balance ?? 0) : 0;
  })();

  // Calculations
  const currentMonthDed  = collectCurrentMonth ? (Number(installmentOverride) || 0) : 0;
  const crossDed         = Object.entries(crossChitCollect)
    .filter(([, v]) => v.enabled)
    .reduce((sum, [, v]) => sum + Math.max(0, Number(v.amount) || 0), 0);
  const sameChitDed      = Object.entries(sameChitOtherCollect)
    .filter(([, v]) => v.enabled)
    .reduce((sum, [, v]) => sum + Math.max(0, Number(v.amount) || 0), 0);
  const manualNum        = Number(manualAdjustment) || 0;
  const totalDiscount    = manualNum + currentMonthDed + crossDed + sameChitDed;
  const winNum           = Number(winningAmt) || 0;
  const net              = Math.max(0, winNum - totalDiscount);
  const isOverDeducted   = totalDiscount > winNum && winNum > 0;

  function toggleCrossChit(cId) {
    const balance = crossBalances[String(cId)] ?? 0;
    setCrossChitCollect((prev) => {
      const cur = prev[String(cId)];
      if (cur?.enabled) return { ...prev, [String(cId)]: { enabled: false, amount: cur.amount } };
      return { ...prev, [String(cId)]: { enabled: true, amount: String(balance) } };
    });
  }

  function setCrossAmt(cId, val) {
    setCrossChitCollect((prev) => ({
      ...prev,
      [String(cId)]: { ...prev[String(cId)], amount: val },
    }));
  }

  function toggleSameChitMonth(mNum) {
    const monthData = sameChitOtherMonths.find((m) => m.monthNumber === mNum);
    const balance = Number(monthData?.balance ?? 0);
    setSameChitOtherCollect((prev) => {
      const key = String(mNum);
      const cur = prev[key];
      if (cur?.enabled) return { ...prev, [key]: { enabled: false, amount: cur.amount } };
      return { ...prev, [key]: { enabled: true, amount: String(balance) } };
    });
  }

  function setSameChitAmt(mNum, val) {
    setSameChitOtherCollect((prev) => ({
      ...prev,
      [String(mNum)]: { ...prev[String(mNum)], amount: val },
    }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Same-chit other-month deductions (FIFO-cleared by backend per chitId)
      const sameChitDeduction = sameChitDed > 0
        ? [{ chitId: String(chitId), amount: sameChitDed }]
        : [];
      // Other-chit deductions
      const otherChitDeductions = Object.entries(crossChitCollect)
        .filter(([, v]) => v.enabled && Number(v.amount) > 0)
        .map(([xChitId, v]) => ({ chitId: xChitId, amount: Number(v.amount) }));
      const allDeductions = [...sameChitDeduction, ...otherChitDeductions];

      // Per-draw breakdown of installmentSettlement (month + amount)
      const instBreakdown = [
        ...(collectCurrentMonth && currentMonthDed > 0
          ? [{ month: monthNumber, amount: currentMonthDed }]
          : []),
        ...Object.entries(sameChitOtherCollect)
          .filter(([, v]) => v.enabled && Number(v.amount) > 0)
          .map(([mNum, v]) => ({ month: Number(mNum), amount: Number(v.amount) })),
      ].sort((a, b) => a.month - b.month);

      return createPayout({
        chitId,
        memberId,
        monthNumber,
        winningAmount:                  winNum,
        discountAmount:                 totalDiscount,
        installmentSettlement:          (currentMonthDed + sameChitDed) || undefined,
        installmentMonthBreakdown:      instBreakdown.length > 0 ? instBreakdown : undefined,
        crossChitSettlement:            crossDed || undefined,
        manualAdjustment:               manualNum || undefined,
        notes:                          notes || undefined,
        collectCurrentMonthInstallment: collectCurrentMonth && installmentAmount > 0,
        crossChitDeductions:            allDeductions.length > 0 ? allDeductions : undefined,
      });
    },
    onSuccess: (payout) => {
      qc.invalidateQueries({ queryKey: ['memberBalancesAllChits', memberId] });
      const anySettlement = currentMonthDed > 0 || crossDed > 0 || sameChitDed > 0;
      const msg = anySettlement
        ? `Payout created · ₹${totalDiscount.toLocaleString('en-IN')} collected as settlement`
        : 'Payout record created — ready to disburse';
      toast.success(msg);
      onSuccess?.(payout);
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to create payout'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {editableAmount && (
        <FormField label="Winning Amount (₹)" required>
          <Input type="number" min="0" value={winningAmt}
            onChange={(e) => setWinningAmt(e.target.value)} />
        </FormField>
      )}

      {/* ── Settlement Section ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 flex items-center gap-2" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10 }}>
          <Wallet size={14} className="text-[#1E3A5F]" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Collect at Disbursement
          </span>
        </div>
        <div className="divide-y divide-gray-100">

          {/* Current month installment */}
          {installmentAmount > 0 && (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12 }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Draw {monthNumber} installment</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ₹{installmentAmount.toLocaleString('en-IN')}/slot
                    {winningMonthRemaining === 0
                      ? <span className="text-green-600 font-medium ml-1">· already paid</span>
                      : <span className="ml-1">· ₹{winningMonthRemaining.toLocaleString('en-IN')} outstanding</span>
                    }
                  </p>
                </div>
                <ToggleSwitch
                  on={collectCurrentMonth}
                  disabled={winningMonthRemaining === 0}
                  onToggle={() => {
                    const next = !collectCurrentMonth;
                    setCollectCurrentMonth(next);
                    if (next) setInstallmentOverride(String(winningMonthRemaining || installmentAmount));
                    else setInstallmentOverride('');
                  }}
                />
              </div>
              {collectCurrentMonth && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="number"
                    min="0"
                    value={installmentOverride}
                    onChange={(e) => setInstallmentOverride(e.target.value)}
                    className="w-full border border-[#1E3A5F] rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Quick set (slots):</span>
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallmentOverride(String(installmentAmount * n))}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors ${
                          Number(installmentOverride) === installmentAmount * n
                            ? 'border-[#1E3A5F] bg-[#EEF2F8] text-[#1E3A5F]'
                            : 'border-gray-300 text-gray-500 hover:border-[#1E3A5F] hover:text-[#1E3A5F]'
                        }`}
                      >
                        ×{n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Same-chit other outstanding months */}
          {!balancesLoading && sameChitOtherMonths.length > 0 && (
            <>
              <div className="bg-gray-50" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}>
                <p className="text-xs font-medium text-gray-500">Other outstanding months in this chit</p>
              </div>
              {sameChitOtherMonths.map((m) => {
                const key     = String(m.monthNumber);
                const balance = Number(m.balance ?? 0);
                const state   = sameChitOtherCollect[key];
                const isOn    = state?.enabled ?? false;
                const amt     = state?.amount ?? String(balance);
                const amtNum  = Math.max(0, Number(amt) || 0);
                const exceeds = amtNum > balance;
                return (
                  <div key={m.monthNumber} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Draw {m.monthNumber} installment</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Outstanding: <span className="text-red-600 font-medium">₹{balance.toLocaleString('en-IN')}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">Collect now</span>
                        <ToggleSwitch on={isOn} onToggle={() => toggleSameChitMonth(m.monthNumber)} />
                      </div>
                    </div>
                    {isOn && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 flex-shrink-0">Amount (₹)</span>
                        <Input type="number" min="1" max={balance} value={amt}
                          onChange={(e) => setSameChitAmt(m.monthNumber, e.target.value)} className="w-40" />
                        {amtNum > 0 && !exceeds && (
                          <span className="text-xs font-semibold text-[#1E3A5F]">
                            −₹{amtNum.toLocaleString('en-IN')}
                          </span>
                        )}
                        {exceeds && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> Max ₹{balance.toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Cross-chit outstanding dues */}
          {balancesLoading && memberChits.length > 0 && (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12 }} className="text-xs text-gray-400 italic">
              Checking other chit balances…
            </div>
          )}
          {!balancesLoading && otherChitsWithBalance.length > 0 && (
            <>
              <div className="bg-gray-50" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}>
                <p className="text-xs font-medium text-gray-500">Outstanding dues in other chits</p>
              </div>
              {otherChitsWithBalance.map((c) => {
                const balance = crossBalances[String(c.id)] ?? 0;
                const state   = crossChitCollect[String(c.id)];
                const isOn    = state?.enabled ?? false;
                const amt     = state?.amount ?? String(balance);
                const amtNum  = Math.max(0, Number(amt) || 0);
                const exceeds = amtNum > balance;
                return (
                  <div key={c.id} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Outstanding: <span className="text-red-600 font-medium">₹{balance.toLocaleString('en-IN')}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">Collect now</span>
                        <ToggleSwitch on={isOn} onToggle={() => toggleCrossChit(c.id)} />
                      </div>
                    </div>
                    {isOn && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 flex-shrink-0">Amount (₹)</span>
                        <Input type="number" min="1" max={balance} value={amt}
                          onChange={(e) => setCrossAmt(c.id, e.target.value)} className="w-40" />
                        {amtNum > 0 && !exceeds && (
                          <span className="text-xs font-semibold text-[#1E3A5F]">
                            −₹{amtNum.toLocaleString('en-IN')}
                          </span>
                        )}
                        {exceeds && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> Max ₹{balance.toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {!balancesLoading && otherChitsWithBalance.length === 0 && sameChitOtherMonths.length === 0 && installmentAmount === 0 && (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12 }} className="text-xs text-gray-400 italic">
              No outstanding dues or installment to collect.
            </div>
          )}
        </div>
      </div>

      {/* ── Manual Adjustment ── */}
      <FormField label="Additional Adjustment (₹)">
        <Input type="number" min="0" value={manualAdjustment}
          onChange={(e) => setManualAdjustment(e.target.value)} placeholder="0" />
        <p className="text-xs text-gray-400 mt-1">Any extra deduction e.g. security deposit, commission</p>
      </FormField>

      {/* ── Payout Breakdown ── */}
      {winNum > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
          <div className="border-b border-gray-200" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10 }}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payout Breakdown</p>
          </div>
          <div className="text-sm" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex justify-between">
              <span className="text-gray-600">Winning amount</span>
              <span className="font-medium text-gray-900">₹{winNum.toLocaleString('en-IN')}</span>
            </div>
            {currentMonthDed > 0 && (
              <div className="flex justify-between text-amber-700">
                <span className="flex items-center gap-1">
                  <ArrowRight size={12} /> Draw {monthNumber} installment
                </span>
                <span>−₹{currentMonthDed.toLocaleString('en-IN')}</span>
              </div>
            )}
            {Object.entries(sameChitOtherCollect)
              .filter(([, v]) => v.enabled && Number(v.amount) > 0)
              .map(([mNum, v]) => (
                <div key={mNum} className="flex justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <ArrowRight size={12} /> Draw {mNum} installment
                  </span>
                  <span>−₹{Number(v.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            {Object.entries(crossChitCollect)
              .filter(([, v]) => v.enabled && Number(v.amount) > 0)
              .map(([cId, v]) => {
                const cName = otherActiveChits.find((c) => String(c.id) === cId)?.name ?? cId;
                return (
                  <div key={cId} className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1 truncate max-w-[200px]">
                      <ArrowRight size={12} /> {cName}
                    </span>
                    <span>−₹{Number(v.amount).toLocaleString('en-IN')}</span>
                  </div>
                );
              })}
            {manualNum > 0 && (
              <div className="flex justify-between text-amber-700">
                <span className="flex items-center gap-1"><ArrowRight size={12} /> Adjustment</span>
                <span>−₹{manualNum.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
              <span className="text-gray-700">Net cash to member</span>
              <span className={net === 0 ? 'text-red-600' : 'text-green-700'}>
                ₹{net.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      )}

      {isOverDeducted && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} /> Total deductions exceed winning amount. Reduce collection amounts.
        </div>
      )}

      {/* ── Notes + Submit ── */}
      <FormField label="Notes (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes for this payout…" rows={2} />
      </FormField>

      <Button
        className="w-full"
        loading={mutation.isPending}
        disabled={
          !winningAmt || winNum <= 0 || isOverDeducted || net <= 0 ||
          Object.entries(crossChitCollect).some(([cId, v]) => {
            if (!v.enabled) return false;
            return Number(v.amount) > (crossBalances[String(cId)] ?? 0);
          }) ||
          Object.entries(sameChitOtherCollect).some(([mNum, v]) => {
            if (!v.enabled) return false;
            const m = sameChitOtherMonths.find((mo) => String(mo.monthNumber) === mNum);
            return Number(v.amount) > Number(m?.balance ?? 0);
          })
        }
        onClick={() => mutation.mutate()}
      >
        <Banknote size={15} />
        Create Payout · Net ₹{net.toLocaleString('en-IN')}
      </Button>
    </div>
  );
}
