import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyBillingInfo, requestRenewal, requestPlanUpgrade, getPublicPlans, getMembers, getChits, listStaff, getMyTenantLimits, myBillingPayments, myBillingUpgradePreview } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Receipt, CheckCircle, RefreshCw, Copy, Clock, Percent, ArrowUpCircle, X, Check, ShoppingCart, Banknote, Info, ChevronRight, Printer } from 'lucide-react';

const PLAN_ORDER = ['BASIC', 'GROWTH', 'ENTERPRISE', 'CUSTOM'];
const PLAN_LABELS = { BASIC: 'Basic', GROWTH: 'Growth', ENTERPRISE: 'Enterprise', CUSTOM: 'Custom' };
const PLAN_COLORS = {
  BASIC:      'bg-gray-100 text-gray-700',
  GROWTH:     'bg-blue-50 text-blue-700',
  ENTERPRISE: 'bg-purple-50 text-purple-700',
  CUSTOM:     'bg-amber-50 text-amber-700',
};
function fmt(paise) {
  if (paise == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}


function UsageBar({ label, used, limit }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const danger = !unlimited && pct >= 90;
  const warn   = !unlimited && pct >= 70 && pct < 90;
  const barColor = danger ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-[#1E3A5F]';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className={`font-semibold ${danger ? 'text-red-600' : 'text-gray-700'}`}>
          {used} / {unlimited ? '∞' : limit}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {unlimited
          ? <div className="h-full bg-gray-200 rounded-full" />
          : <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        }
      </div>
    </div>
  );
}

function PlanCard({ planData, selected, onSelect }) {
  const isCustom = planData.plan === 'CUSTOM';
  const hasDiscount = planData.globalDiscountPct > 0;
  const effective = fmt(planData.effectivePriceInr);
  const original  = hasDiscount ? fmt(planData.priceMonthlyInr) : null;

  return (
    <button
      onClick={() => onSelect(planData.plan)}
      className={`relative text-left w-full rounded-2xl border-2 p-4 sm:p-6 transition-all cursor-pointer focus:outline-none flex flex-col ${
        selected
          ? 'border-[#1E3A5F] bg-[#f0f5fb] shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {hasDiscount && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap bg-emerald-600">
          {planData.globalDiscountPct}% off
        </span>
      )}

      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#1E3A5F] flex items-center justify-center">
          <Check size={11} className="text-white" strokeWidth={3} />
        </span>
      )}

      <p className={`text-base font-bold mb-0.5 ${selected ? 'text-[#1E3A5F]' : 'text-gray-800'}`}>
        {planData.displayName ?? PLAN_LABELS[planData.plan] ?? planData.plan}
      </p>
      <p className="text-xs text-gray-400 mb-5">{planData.tagline}</p>

      <ul className="space-y-3 flex-1">
        {(planData.features ?? []).map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={13} className="flex-shrink-0 mt-0.5" style={{ color: selected ? '#1E3A5F' : '#9ca3af' }} />
            <span className="text-xs text-gray-500 leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCustom ? (
          <>
            <span className={`text-sm font-bold ${selected ? 'text-[#1E3A5F]' : 'text-gray-600'}`}>Custom pricing</span>
            <p className="text-xs text-gray-400 mt-1">Our team will reach out to discuss pricing</p>
          </>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-bold ${selected ? 'text-[#1E3A5F]' : 'text-gray-600'}`}>{effective}</span>
            {original && <span className="text-xs text-gray-400 line-through">{original}</span>}
            <span className="text-xs text-gray-400">/mo</span>
          </div>
        )}
      </div>
    </button>
  );
}

function UpgradeModal({ plans, currentPlan, onSelect, onClose }) {
  const [selected, setSelected] = useState(null);
  const upgradable = plans.filter(p => p.plan !== currentPlan);

  function handleSelect(plan) {
    setSelected(plan);
    setTimeout(() => onSelect(plan), 180);
  }

  const gridCols = upgradable.length === 1
    ? 'grid-cols-1 max-w-xs'
    : upgradable.length === 2
    ? 'sm:grid-cols-2'
    : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Bottom sheet on mobile, centered dialog on sm+ */}
      <div className="relative bg-gray-50 w-full sm:max-w-4xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl">
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-900">Change Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select the plan you'd like to switch to</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
            {upgradable.map(p => (
              <PlanCard key={p.plan} planData={p} selected={selected === p.plan} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Payment type helpers ───────────────────────────────────────────────────────

const PAYMENT_TYPE_CFG = {
  PURCHASE: { label: 'Purchase',  cls: 'bg-blue-50 text-blue-700' },
  RENEWAL:  { label: 'Renewal',   cls: 'bg-green-50 text-green-700' },
  UPGRADE:  { label: 'Upgrade',   cls: 'bg-purple-50 text-purple-700' },
  REFUND:   { label: 'Refund',    cls: 'bg-red-50 text-red-700' },
};
const METHOD_LABELS = { UPI: 'UPI', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer' };

function fmtPaise(paise) {
  if (paise == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Proration info shown when admin selects an upgrade plan ───────────────────

function UpgradeProrationRows({ newPlan }) {
  const { data: preview, isLoading } = useQuery({
    queryKey: ['my-upgrade-preview', newPlan],
    queryFn: () => myBillingUpgradePreview(newPlan),
    enabled: !!newPlan,
    staleTime: 30_000,
  });

  if (!newPlan) return null;
  if (isLoading) return (
    <p className="text-xs text-gray-400 animate-pulse py-1">Calculating estimate…</p>
  );
  if (!preview) return null;

  return (
    <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs text-gray-600">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Info size={11} /> Estimated charge
      </p>
      <div className="flex justify-between">
        <span>{preview.newPlanName} price</span>
        <span className="font-medium text-gray-700">{fmtPaise(preview.newPlanPricePaise)}</span>
      </div>
      {!preview.planExpired && (
        <div className="flex justify-between">
          <span>Unused days credit ({preview.daysRemaining} of {preview.daysInPeriod} days)</span>
          <span className="text-green-600 font-medium">- {fmtPaise(preview.creditPaise)}</span>
        </div>
      )}
      <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-100 pt-1.5">
        <span>You'd pay</span>
        <span>{fmtPaise(preview.chargePaise)}</span>
      </div>
      <p className="text-gray-400 italic">Estimate only — confirmed when our team processes your request.</p>
      {preview.planExpired && (
        <p className="text-amber-600">Plan expired — no unused-days credit applies.</p>
      )}
    </div>
  );
}

// ── Receipt print template (same as SuperAdminPaymentDetailPage) ───────────────

function ReceiptPrintView({ receipt, payment, tenantName }) {
  return (
    <div id="receipt-print-area" className="font-mono text-xs">
      <div className="text-center mb-4">
        <p className="font-bold text-base">ChitWise</p>
        <p className="text-gray-500">Platform Subscription Receipt</p>
        <p className="text-gray-400 mt-1">{receipt.receiptNumber}</p>
      </div>
      <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-500">Receipt No</span>
          <span className="font-medium">{receipt.receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Date</span>
          <span>{fmtDate(receipt.issuedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Organisation</span>
          <span>{tenantName ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Plan</span>
          <span>{payment.toPlanName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Period</span>
          <span>{fmtDate(payment.planPeriodStart)} – {fmtDate(payment.planPeriodEnd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Payment Method</span>
          <span>{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
        </div>
        {payment.paymentReference && (
          <div className="flex justify-between">
            <span className="text-gray-500">Reference</span>
            <span>{payment.paymentReference}</span>
          </div>
        )}
        {receipt.type === 'REFUND' && (
          <div className="flex justify-between text-red-600">
            <span>Refund Reason</span>
            <span className="text-right max-w-[60%]">{payment.refundReason}</span>
          </div>
        )}
      </div>
      <div className="border-t border-dashed border-gray-300 mt-3 pt-3 flex justify-between font-bold text-sm">
        <span>{receipt.type === 'REFUND' ? 'REFUND AMOUNT' : 'AMOUNT PAID'}</span>
        <span>{fmtPaise(receipt.amountPaise)}</span>
      </div>
      <div className="text-center mt-4 text-gray-400 text-[10px]">
        <p>Thank you for using ChitWise</p>
        <p>This is a computer-generated receipt</p>
      </div>
    </div>
  );
}

// ── Row / Field helpers ────────────────────────────────────────────────────────

function FieldDetail({ label, children }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800">{children}</p>
    </div>
  );
}

function RowDetail({ label, value, bold = false, valueClass = '' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Payment detail modal (admin view) ─────────────────────────────────────────

const PAYMENT_TYPE_ICONS = {
  PURCHASE: ShoppingCart,
  RENEWAL: RefreshCw,
  UPGRADE: ArrowUpCircle,
  REFUND: Banknote,
};

function PaymentDetailModal({ payment, tenantName, onClose }) {
  const [printReceipt, setPrintReceipt] = useState(null);
  const cfg = PAYMENT_TYPE_CFG[payment.type] ?? { label: payment.type, cls: 'bg-gray-100 text-gray-600' };
  const Icon = PAYMENT_TYPE_ICONS[payment.type] ?? Receipt;
  const isRefunded = payment.status === 'REFUNDED';
  const paymentReceipt = payment.receipts?.find(r => r.type === 'PAYMENT');
  const refundReceipt  = payment.receipts?.find(r => r.type === 'REFUND');

  function handlePrint(receipt) {
    setPrintReceipt(receipt);
    setTimeout(() => window.print(), 200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${cfg.cls}`}>
              <Icon size={13} />
              {cfg.label}
            </span>
            {isRefunded && <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-600">Refunded</span>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Amount */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Amount Collected</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-3xl font-bold text-gray-900">
                  {payment.amountPaise === 0 && (payment.accountCreditAppliedPaise ?? 0) > 0 ? '₹0' : fmtPaise(payment.amountPaise)}
                </p>
                {payment.amountPaise === 0 && (payment.accountCreditAppliedPaise ?? 0) > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Credits Covered</span>
                )}
              </div>
            </div>
            {tenantName && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Organisation</p>
                <p className="font-semibold text-gray-800 mt-0.5">{tenantName}</p>
              </div>
            )}
          </div>

          {/* Credit breakdown */}
          {(payment.accountCreditAppliedPaise ?? 0) > 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
              <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Credit Applied</p>
              <div className="space-y-1.5 text-sm">
                <RowDetail label="Plan / Gross amount" value={fmtPaise(payment.grossAmountPaise || payment.amountPaise + payment.accountCreditAppliedPaise)} />
                <RowDetail label="Account credit applied" value={`- ${fmtPaise(payment.accountCreditAppliedPaise)}`} valueClass="text-emerald-700" />
                <div className="border-t border-emerald-200 pt-1.5">
                  <RowDetail
                    label={payment.amountPaise === 0 ? 'Net collected (fully covered)' : 'Net collected'}
                    value={payment.amountPaise === 0 ? '₹0 — Credits Covered' : fmtPaise(payment.amountPaise)}
                    bold valueClass={payment.amountPaise === 0 ? 'text-emerald-700' : ''}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Plan details grid */}
          <div className="grid grid-cols-2 gap-4">
            <FieldDetail label="Plan">
              {payment.fromPlan
                ? <span>{payment.fromPlanName} <span className="text-gray-400">→</span> {payment.toPlanName}</span>
                : payment.toPlanName}
            </FieldDetail>
            <FieldDetail label="Period">
              {fmtDate(payment.planPeriodStart)} – {fmtDate(payment.planPeriodEnd)}
            </FieldDetail>
            <FieldDetail label="Payment Method">{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</FieldDetail>
            <FieldDetail label="Payment Date">{fmtDate(payment.paymentDate)}</FieldDetail>
            {payment.paymentReference && (
              <FieldDetail label="Reference" className="col-span-2">
                <span className="font-mono text-sm">{payment.paymentReference}</span>
              </FieldDetail>
            )}
            {payment.notes && (
              <div className="col-span-2">
                <FieldDetail label="Notes">{payment.notes}</FieldDetail>
              </div>
            )}
          </div>

          {/* Proration breakdown for upgrades */}
          {payment.type === 'UPGRADE' && payment.prorationCreditPaise != null && (
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-2">
              <p className="text-xs font-bold text-purple-900 uppercase tracking-wide">Proration Breakdown</p>
              <div className="space-y-1.5 text-sm">
                <RowDetail label="Full plan price" value={fmtPaise(payment.fullPlanPricePaise)} />
                <RowDetail label={`Unused days credit (${payment.daysRemaining} of ${payment.daysInPeriod} days)`} value={`- ${fmtPaise(payment.prorationCreditPaise)}`} valueClass="text-green-700" />
                <div className="border-t border-purple-200 pt-1.5">
                  <RowDetail label="Collected" value={fmtPaise(payment.amountPaise)} bold />
                </div>
              </div>
            </div>
          )}

          {/* Refund details */}
          {isRefunded && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 space-y-2">
              <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Refund Details</p>
              <div className="space-y-1.5 text-sm">
                <RowDetail label="Refund Amount" value={fmtPaise(payment.refundAmountPaise)} bold />
                <RowDetail label="Refund Method" value={METHOD_LABELS[payment.refundMethod] ?? payment.refundMethod} />
                {payment.refundReference && <RowDetail label="Refund Reference" value={payment.refundReference} />}
                <RowDetail label="Reason" value={payment.refundReason} />
              </div>
            </div>
          )}

          {/* Receipts */}
          {(paymentReceipt || refundReceipt) && (
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-3">Receipts</p>
              <div className="space-y-2">
                {paymentReceipt && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <Receipt size={15} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{paymentReceipt.receiptNumber}</p>
                        <p className="text-xs text-gray-400">Payment Receipt · {fmtPaise(paymentReceipt.amountPaise)}</p>
                      </div>
                    </div>
                    <button onClick={() => handlePrint(paymentReceipt)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-white cursor-pointer text-gray-600">
                      <Printer size={12} />
                      Print
                    </button>
                  </div>
                )}
                {refundReceipt && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <Receipt size={15} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{refundReceipt.receiptNumber}</p>
                        <p className="text-xs text-gray-400">Refund Receipt · {fmtPaise(refundReceipt.amountPaise)}</p>
                      </div>
                    </div>
                    <button onClick={() => handlePrint(refundReceipt)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-white cursor-pointer text-gray-600">
                      <Printer size={12} />
                      Print
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden print area */}
      {printReceipt && (
        <div className="hidden print:block">
          <ReceiptPrintView receipt={printReceipt} payment={payment} tenantName={tenantName} />
        </div>
      )}
    </div>
  );
}

// ── Payment history row ────────────────────────────────────────────────────────

function PaymentHistoryRow({ payment, onClick }) {
  const cfg = PAYMENT_TYPE_CFG[payment.type] ?? { label: payment.type, cls: 'bg-gray-100 text-gray-600' };
  const isRefunded = payment.status === 'REFUNDED';
  const creditCovered = payment.amountPaise === 0 && (payment.accountCreditAppliedPaise ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
            {isRefunded && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Refunded</span>}
            {creditCovered && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Credits Covered</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {payment.toPlanName} · {METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
            {payment.receipts?.[0] && <span className="ml-1 font-mono">· {payment.receipts[0].receiptNumber}</span>}
          </p>
          {(payment.accountCreditAppliedPaise ?? 0) > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              Credit applied: {fmtPaise(payment.accountCreditAppliedPaise)}
              {payment.grossAmountPaise > 0 && payment.grossAmountPaise !== payment.amountPaise && (
                <span className="text-gray-400"> (plan: {fmtPaise(payment.grossAmountPaise)})</span>
              )}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 flex items-center gap-2">
          <div>
            <p className={`text-sm font-semibold ${creditCovered ? 'text-emerald-700' : 'text-gray-900'}`}>
              {creditCovered ? 'Covered' : fmtPaise(payment.amountPaise)}
            </p>
            <p className="text-xs text-gray-400">{fmtDate(payment.paymentDate)}</p>
          </div>
          <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
        </div>
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { tenantName, tenantPlan, tenantId } = useAuth();
  const [renewed, setRenewed] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState('');
  const [copied, setCopied] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [paymentPage, setPaymentPage] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const PAYMENT_PAGE_SIZE = 8;

  const { data: billing, isLoading } = useQuery({ queryKey: ['billing-info'], queryFn: getMyBillingInfo });
  const { data: plans = [] } = useQuery({ queryKey: ['public-plans'], queryFn: getPublicPlans });
  const { data: myPayments = [] } = useQuery({ queryKey: ['my-billing-payments'], queryFn: myBillingPayments, staleTime: 60_000 });
  const { data: effectiveLimits } = useQuery({ queryKey: ['myTenantLimits'], queryFn: getMyTenantLimits, staleTime: 60_000 });
  const { data: membersList = [] } = useQuery({ queryKey: ['members-count'], queryFn: () => getMembers({ page: 0, size: 500 }) });
  const { data: chitsList = [] }   = useQuery({ queryKey: ['chits-active'], queryFn: () => getChits({ status: 'ACTIVE', page: 0, size: 500 }) });
  const { data: staffList = [] } = useQuery({ queryKey: ['staff-list'], queryFn: listStaff });

  const plan = billing?.plan ?? tenantPlan ?? 'BASIC';
  const memberCount  = membersList.length;
  const activeChits  = chitsList.length;
  const staffCount   = staffList.filter(s => s.role === 'MANAGER' || s.role === 'STAFF').length;

  // Use org's effective limits (accounts for per-org custom overrides by super admin)
  // Fall back to public plan limits only if effective limits haven't loaded yet
  const publicPlanLimits = plans.find(p => p.plan === plan) ?? {};
  const maxActiveChits = effectiveLimits?.maxActiveChits ?? publicPlanLimits.maxActiveChits ?? -1;
  const maxMembers     = effectiveLimits?.maxMembers     ?? publicPlanLimits.maxMembers     ?? -1;
  const maxStaff       = effectiveLimits?.maxStaff       ?? publicPlanLimits.maxStaff       ?? 0;

  const expiresAt = billing?.planExpiresAt ? new Date(billing.planExpiresAt) : null;
  const now = new Date();
  const isExpired = expiresAt && expiresAt < now;
  const daysLeft = expiresAt && !isExpired ? Math.ceil((expiresAt - now) / 86400000) : null;

  const hasUpgradablePlans = plans.some(p => p.plan !== plan);
  const selectedPlanData = plans.find(p => p.plan === upgradeTarget);

  async function handleRequestRenewal() {
    setRenewing(true); setRenewError('');
    try { await requestRenewal(); setRenewed(true); }
    catch { setRenewError('Could not send request. Try again or contact support.'); }
    finally { setRenewing(false); }
  }

  async function handleUpgrade() {
    if (!upgradeTarget) return;
    setUpgrading(true);
    try { await requestPlanUpgrade(upgradeTarget); setUpgraded(true); }
    catch { /* show nothing */ }
    finally { setUpgrading(false); }
  }

  function copyReferral() {
    if (billing?.referralCode) {
      navigator.clipboard.writeText(billing.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          tenantName={tenantName}
          onClose={() => setSelectedPayment(null)}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal
          plans={plans}
          currentPlan={plan}
          onSelect={selected => { setUpgradeTarget(selected); setShowUpgradeModal(false); }}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900">Billing & Plan</h1>
        <p className="text-sm text-gray-500 mt-0.5">{tenantName}</p>
        {tenantId && (
          <p className="text-xs text-gray-300 mt-0.5 font-mono break-all">{tenantId}</p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Loading billing info…
        </div>
      )}

      {billing && (
        <>
          {/* ── Top row: Plan + Usage side by side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Plan overview card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PLAN_COLORS[plan] ?? PLAN_COLORS.BASIC}`}>
                    {PLAN_LABELS[plan] ?? plan}
                  </span>
                  {billing.promoLabel && (
                    <span className="text-xs bg-green-50 text-green-700 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Percent size={10} />
                      {billing.promoLabel}
                    </span>
                  )}
                  {isExpired && (
                    <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">Expired</span>
                  )}
                </div>
                <p className="text-3xl font-bold text-gray-900 leading-none">
                  {fmt(billing.effectivePriceInr)}
                  <span className="text-sm font-normal text-gray-400 ml-1">/ month</span>
                </p>
                {billing.appliedDiscountPct > 0 && (
                  <p className="text-xs text-gray-400 mt-1 line-through">{fmt(billing.priceMonthlyInr)}</p>
                )}
              </div>
              {/* Credit badge — shown here if org has credit */}
              {(billing.creditBalanceInr ?? 0) > 0 && (
                <div className="flex-shrink-0 text-right bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <p className="text-xs text-emerald-600 font-medium">Credit</p>
                  <p className="text-base font-bold text-emerald-700">{fmt(billing.creditBalanceInr)}</p>
                  <p className="text-[10px] text-emerald-500">applied at renewal</p>
                </div>
              )}
            </div>

            {expiresAt && (
              <div className={`mt-4 flex items-center gap-2 text-xs rounded-xl px-4 py-2.5 ${
                isExpired ? 'bg-red-50 text-red-700' :
                daysLeft <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'
              }`}>
                <Clock size={13} className="flex-shrink-0" />
                {isExpired
                  ? 'Plan expired — request renewal to restore access'
                  : daysLeft === 0 ? 'Expires today'
                  : daysLeft === 1 ? 'Expires tomorrow'
                  : `Expires in ${daysLeft} days — ${expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                }
              </div>
            )}

            {billing.nextBillingEstimate != null && (
              <div className="mt-3 flex items-center justify-between text-xs text-gray-400 border-t border-gray-50 pt-3">
                <span>Estimated next payment</span>
                <span className="font-medium text-gray-600">{fmt(billing.nextBillingEstimate)}</span>
              </div>
            )}
          </div>

          {/* Usage card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <p className="text-sm font-semibold text-gray-800 mb-4">Plan Usage</p>
            <div className="space-y-4">
              <UsageBar label="Active Chits" used={activeChits} limit={maxActiveChits} />
              <UsageBar label="Members"      used={memberCount}  limit={maxMembers} />
              {maxStaff !== 0 && (
                <UsageBar label="Staff Accounts" used={staffCount} limit={maxStaff} />
              )}
            </div>
          </div>

          </div>{/* end top grid */}

          {/* ── Renewal card — only in last 7 days or expired ── */}
          {(isExpired || (daysLeft !== null && daysLeft <= 7)) && (
            <div className={`bg-white rounded-2xl border shadow-sm p-5 sm:p-6 ${isExpired ? 'border-red-200' : 'border-amber-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl ${isExpired ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <RefreshCw size={16} className={isExpired ? 'text-red-600' : 'text-amber-600'} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {isExpired ? 'Plan Expired' : 'Plan Expiring Soon'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Send a renewal request — our team will contact you to extend your plan.</p>
                  {renewed ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 font-medium mt-3">
                      <CheckCircle size={15} />
                      Request sent! Our team will contact you shortly.
                    </div>
                  ) : (
                    <div className="mt-3">
                      {renewError && <p className="text-xs text-red-500 mb-2">{renewError}</p>}
                      <button
                        onClick={handleRequestRenewal}
                        disabled={renewing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60 cursor-pointer transition-colors"
                        style={{ backgroundColor: '#1E3A5F' }}
                      >
                        <RefreshCw size={13} className={renewing ? 'animate-spin' : ''} />
                        {renewing ? 'Sending…' : 'Request Renewal'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Upgrade card ── */}
          {hasUpgradablePlans && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-purple-50">
                  <ArrowUpCircle size={16} className="text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Upgrade Plan</p>
                  <p className="text-xs text-gray-400 mt-0.5">Request an upgrade — our team will contact you to switch your plan.</p>

                  {upgraded ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 font-medium mt-3">
                      <CheckCircle size={15} />
                      Upgrade request sent! Our team will contact you shortly.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {upgradeTarget && selectedPlanData ? (
                        <div className="flex items-center gap-3 bg-[#1E3A5F]/5 border border-[#1E3A5F]/15 rounded-xl px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_COLORS[selectedPlanData.plan] ?? PLAN_COLORS.BASIC}`}>
                            {PLAN_LABELS[selectedPlanData.plan] ?? selectedPlanData.plan}
                          </span>
                          <span className="text-sm font-medium text-gray-700 flex-1">
                            {selectedPlanData.plan === 'CUSTOM' ? 'Custom pricing' : `${fmt(selectedPlanData.priceMonthlyInr)} / month`}
                          </span>
                          <button onClick={() => setShowUpgradeModal(true)} className="text-xs text-[#1E3A5F] underline cursor-pointer">Change</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowUpgradeModal(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-[#1E3A5F]/40 hover:text-[#1E3A5F] cursor-pointer transition-colors"
                        >
                          <ArrowUpCircle size={15} />
                          Select a plan
                        </button>
                      )}

                      {upgradeTarget && selectedPlanData?.plan !== 'CUSTOM' && (
                        <UpgradeProrationRows newPlan={upgradeTarget} />
                      )}

                      {upgradeTarget && (
                        <button
                          onClick={handleUpgrade}
                          disabled={upgrading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 cursor-pointer transition-colors"
                          style={{ backgroundColor: '#1E3A5F' }}
                        >
                          <ArrowUpCircle size={13} />
                          {upgrading ? 'Sending…' : 'Request Upgrade'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Referral card ── */}
          {billing.referralCode && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <p className="text-sm font-semibold text-gray-800 mb-1">Referral Code</p>
              <p className="text-xs text-gray-400 mb-3">Share with other orgs — they get a first-month discount.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 tracking-wide truncate">
                  {billing.referralCode}
                </code>
                <button
                  onClick={copyReferral}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 cursor-pointer transition-colors"
                  title="Copy referral code"
                >
                  {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* ── Payment history card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-gray-800">Payment History</p>
              {myPayments.length > 0 && (
                <span className="text-xs text-gray-400">{myPayments.length} record{myPayments.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">All payments recorded by ChitWise admin for your account.</p>
            {myPayments.length === 0 ? (
              <div className="text-center py-6">
                <Receipt size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No payments recorded yet</p>
              </div>
            ) : (
              <div>
                {myPayments.slice(paymentPage * PAYMENT_PAGE_SIZE, (paymentPage + 1) * PAYMENT_PAGE_SIZE).map(p => (
                  <PaymentHistoryRow key={p.id} payment={p} onClick={() => setSelectedPayment(p)} />
                ))}
                {myPayments.length > PAYMENT_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
                    <button
                      onClick={() => setPaymentPage(p => Math.max(0, p - 1))}
                      disabled={paymentPage === 0}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer disabled:cursor-default transition-colors"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-gray-400">
                      Page {paymentPage + 1} of {Math.ceil(myPayments.length / PAYMENT_PAGE_SIZE)}
                    </span>
                    <button
                      onClick={() => setPaymentPage(p => Math.min(Math.ceil(myPayments.length / PAYMENT_PAGE_SIZE) - 1, p + 1))}
                      disabled={paymentPage >= Math.ceil(myPayments.length / PAYMENT_PAGE_SIZE) - 1}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer disabled:cursor-default transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
