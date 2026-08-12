import { useState, useEffect } from 'react';
import { X, AlertCircle, Info } from 'lucide-react';
import {
  billingRecordPayment,
  billingRecordUpgrade,
  billingUpgradePreview,
  superAdminListPlans,
  superAdminGetEffectiveLimits,
  superAdminGetDiscount,
} from '../../services/api';
import Button from '../ui/Button';

const TYPE_LABELS = { PURCHASE: 'Purchase', RENEWAL: 'Renewal', UPGRADE: 'Upgrade' };

function fmtPaise(p) {
  if (p == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(p / 100);
}

function BreakdownRow({ label, value, sub, bold, green, dimmed }) {
  return (
    <div className={`flex justify-between items-baseline gap-4 ${dimmed ? 'opacity-50' : ''}`}>
      <span className={`text-xs ${bold ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
        {label}
        {sub && <span className="text-gray-400 font-normal"> {sub}</span>}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${green ? 'text-emerald-700' : bold ? 'text-gray-900' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Shared billing recording modal.
 * Props:
 *  tenant  : { id, name, plan, creditBalanceInr }
 *  type    : 'PURCHASE' | 'RENEWAL' | 'UPGRADE'
 *  toPlan  : target plan code
 *  onClose / onSuccess
 */
export default function RecordOrgPaymentModal({ tenant, type, toPlan, onClose, onSuccess }) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const creditBalanceInr   = Number(tenant?.creditBalanceInr ?? 0);
  const creditBalancePaise = Math.round(creditBalanceInr * 100);

  // Plan price for PURCHASE/RENEWAL (paise)
  const [planPricePaise, setPlanPricePaise]   = useState(null);
  const [planName, setPlanName]               = useState(toPlan);
  const [loadingPlan, setLoadingPlan]         = useState(false);

  // Manual gross amount field — pre-filled once plan price loads (editable)
  const [grossAmount, setGrossAmount]         = useState('');

  // UPGRADE proration preview
  const [preview, setPreview]                 = useState(null);
  const [loadingPreview, setLoadingPreview]   = useState(false);

  const [method, setMethod]       = useState('CASH');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Fetch plan price for PURCHASE / RENEWAL — uses org-specific price if set
  useEffect(() => {
    if (type === 'UPGRADE' || !toPlan || !tenant?.id) return;
    setLoadingPlan(true);
    Promise.all([
      superAdminListPlans(),
      superAdminGetEffectiveLimits(tenant.id).catch(() => null),
      superAdminGetDiscount(tenant.id).catch(() => null),
    ])
      .then(([plans, effectiveLimits, discount]) => {
        const found = plans.find(p => (p.plan ?? p.code) === toPlan);
        if (!found) return;
        let pricePaise;
        // Custom org-specific price takes priority
        if (effectiveLimits?.priceMonthlyInr > 0) {
          pricePaise = effectiveLimits.priceMonthlyInr;
        } else {
          pricePaise = found.priceMonthlyInr;
          // Apply per-org discount if present
          if (discount) {
            if (discount.discountType === 'PERCENTAGE') {
              pricePaise = Math.round(pricePaise * (1 - parseFloat(discount.discountValue) / 100));
            } else if (discount.discountType === 'FIXED_PAISE') {
              pricePaise = Math.max(0, pricePaise - parseFloat(discount.discountValue));
            }
          }
        }
        setPlanPricePaise(pricePaise);
        setPlanName(found.displayName ?? found.plan ?? toPlan);
        setGrossAmount(String((pricePaise / 100).toFixed(2)));
      })
      .catch(() => {})
      .finally(() => setLoadingPlan(false));
  }, [type, toPlan, tenant?.id]);

  // Fetch upgrade proration preview
  useEffect(() => {
    if (type !== 'UPGRADE' || !tenant?.id || !toPlan) return;
    setLoadingPreview(true);
    billingUpgradePreview(tenant.id, toPlan)
      .then(p => setPreview(p))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [type, tenant?.id, toPlan]);

  // ── Compute breakdown ──────────────────────────────────────────────────────

  // Gross paise = what admin is charging before account credit
  const grossPaise = type === 'UPGRADE'
    ? (preview?.chargePaise ?? 0)
    : Math.round(Number(grossAmount || 0) * 100);

  const creditAppliedPaise = Math.min(creditBalancePaise, grossPaise);
  const netPaise           = Math.max(0, grossPaise - creditAppliedPaise);
  const creditCoversAll    = creditBalancePaise > 0 && creditAppliedPaise >= grossPaise && grossPaise > 0;

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (type === 'UPGRADE') {
        if (!preview) { setError('Proration preview not loaded yet'); setLoading(false); return; }
        await billingRecordUpgrade({
          tenantId: tenant.id,
          newPlan: toPlan,
          paymentMethod: creditCoversAll ? 'CASH' : method,
          paymentReference: reference || null,
          paymentDate,
          notes: notes || null,
          creditAppliedPaise: creditAppliedPaise > 0 ? creditAppliedPaise : undefined,
        });
      } else {
        if (!grossAmount || Number(grossAmount) <= 0) { setError('Plan amount is required'); setLoading(false); return; }
        await billingRecordPayment({
          tenantId: tenant.id,
          type,
          toPlan: toPlan ?? tenant.plan ?? 'BASIC',
          amountPaise: netPaise,
          grossAmountPaise: grossPaise,
          paymentMethod: creditCoversAll ? 'CASH' : method,
          paymentReference: reference || null,
          paymentDate,
          notes: notes || null,
          creditAppliedPaise: creditAppliedPaise > 0 ? creditAppliedPaise : undefined,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Record Payment — {TYPE_LABELS[type]}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{tenant?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* ── UPGRADE: full proration breakdown ── */}
          {type === 'UPGRADE' && (
            loadingPreview
              ? <div className="text-xs text-gray-400 animate-pulse py-4 text-center">Calculating proration…</div>
              : preview && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-white">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Info size={11} /> Charge Breakdown
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <BreakdownRow
                      label={`${preview.newPlanName ?? toPlan} plan price`}
                      value={fmtPaise(preview.newPlanPricePaise)}
                    />
                    <BreakdownRow
                      label="Unused days credit"
                      sub={`(${preview.daysRemaining} of ${preview.daysInPeriod} days remaining)`}
                      value={preview.creditPaise > 0 ? `- ${fmtPaise(preview.creditPaise)}` : '₹0'}
                      green={preview.creditPaise > 0}
                      dimmed={preview.creditPaise === 0}
                    />
                    {preview.planExpired && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        Plan expired — no unused-days credit applies
                      </p>
                    )}
                    <div className="border-t border-gray-200 pt-2">
                      <BreakdownRow
                        label="Upgrade charge"
                        value={fmtPaise(preview.chargePaise)}
                        bold
                      />
                    </div>
                    {creditAppliedPaise > 0 && (
                      <>
                        <BreakdownRow
                          label="Account credit"
                          value={`- ${fmtPaise(creditAppliedPaise)}`}
                          green
                        />
                        <div className="border-t border-gray-200 pt-2">
                          <BreakdownRow
                            label="Net payable"
                            value={netPaise === 0 ? 'Covered by credit ✓' : fmtPaise(netPaise)}
                            bold
                            green={netPaise === 0}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
          )}

          {/* ── PURCHASE / RENEWAL: plan amount + breakdown ── */}
          {type !== 'UPGRADE' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Plan Amount (₹)
                {loadingPlan && <span className="text-gray-400 font-normal ml-1">loading…</span>}
                {planPricePaise != null && !loadingPlan && (
                  <span className="text-gray-400 font-normal ml-1">— {planName} plan (org rate)</span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={grossAmount}
                  onChange={e => setGrossAmount(e.target.value)}
                  placeholder={loadingPlan ? 'Loading plan price…' : 'e.g. 499'}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Breakdown table */}
              {grossPaise > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-white">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Info size={11} /> Charge Breakdown
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <BreakdownRow
                      label={`${planName} plan`}
                      value={fmtPaise(grossPaise)}
                    />
                    {creditBalancePaise > 0 && (
                      <>
                        <BreakdownRow
                          label="Account credit"
                          sub={`(available: ${fmtPaise(creditBalancePaise)})`}
                          value={`- ${fmtPaise(creditAppliedPaise)}`}
                          green
                        />
                        <div className="border-t border-gray-200 pt-2">
                          <BreakdownRow
                            label="Net payable"
                            value={netPaise === 0 ? 'Covered by credit ✓' : fmtPaise(netPaise)}
                            bold
                            green={netPaise === 0}
                          />
                        </div>
                      </>
                    )}
                    {creditBalancePaise === 0 && (
                      <div className="border-t border-gray-200 pt-2">
                        <BreakdownRow label="Net payable" value={fmtPaise(grossPaise)} bold />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Credit-covered badge */}
          {creditCoversAll && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <span className="text-emerald-600 font-bold text-lg">✓</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Fully covered by credit</p>
                <p className="text-xs text-emerald-600">No cash collection needed.</p>
              </div>
            </div>
          )}

          {/* Payment method */}
          {!creditCoversAll && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method *</label>
              <div className="grid grid-cols-3 gap-2">
                {[['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK_TRANSFER', 'Bank Transfer']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMethod(val)}
                    className={`py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all ${
                      method === val ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reference */}
          {!creditCoversAll && method !== 'CASH' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reference / UTR (optional)</label>
              <input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. UTR12345678"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date *</label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              max={todayStr}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Paid via Google Pay"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading} disabled={type === 'UPGRADE' && !preview}>
              {loading
                ? 'Saving…'
                : creditCoversAll
                ? 'Apply Credit & Confirm'
                : `Record ${TYPE_LABELS[type]}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
