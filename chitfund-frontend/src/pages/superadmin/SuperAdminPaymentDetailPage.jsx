import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Printer, Receipt, AlertCircle, ArrowUpCircle,
  RefreshCw, ShoppingCart, Banknote, X, CheckCircle,
} from 'lucide-react';
import { billingGetPayment, billingRecordRefund } from '../../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPaise(paise) {
  if (paise == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const TYPE_CONFIG = {
  PURCHASE: { label: 'Purchase',  icon: ShoppingCart,  cls: 'bg-blue-50 text-blue-700' },
  RENEWAL:  { label: 'Renewal',   icon: RefreshCw,     cls: 'bg-green-50 text-green-700' },
  UPGRADE:  { label: 'Upgrade',   icon: ArrowUpCircle, cls: 'bg-purple-50 text-purple-700' },
  REFUND:   { label: 'Refund',    icon: Banknote,      cls: 'bg-red-50 text-red-700' },
};

const METHOD_LABELS = { UPI: 'UPI', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer' };

// ── Refund Modal ──────────────────────────────────────────────────────────────

function RefundModal({ payment, onClose, onSuccess }) {
  const [amount, setAmount]       = useState(String(payment.amountPaise / 100));
  const [reason, setReason]       = useState('');
  const [method, setMethod]       = useState('UPI');
  const [reference, setReference] = useState('');
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [error, setError]         = useState('');

  const mutation = useMutation({
    mutationFn: () => billingRecordRefund(payment.id, {
      refundAmountPaise: Math.round(Number(amount) * 100),
      refundReason: reason,
      refundMethod: method,
      refundReference: reference || null,
      refundDate: date,
    }),
    onSuccess: () => { onSuccess?.(); onClose(); },
    onError: (err) => setError(err.response?.data?.message ?? 'Failed to record refund'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Record Refund</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
            Original payment: <span className="font-semibold">{fmtPaise(payment.amountPaise)}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Refund Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={payment.amountPaise / 100}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason *</label>
            <textarea
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for refund…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Refund Method *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(METHOD_LABELS).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMethod(val)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all ${
                    method === val ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {method !== 'CASH' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reference</label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Transaction reference"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Refund Date *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !reason.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 disabled:opacity-50 cursor-pointer"
            >
              {mutation.isPending ? 'Recording…' : 'Record Refund'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Print View ────────────────────────────────────────────────────────

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminPaymentDetailPage() {
  const { paymentId } = useParams();
  const navigate      = useNavigate();
  const qc            = useQueryClient();
  const [showRefund, setShowRefund]       = useState(false);
  const [printReceipt, setPrintReceipt]   = useState(null);

  const { data: payment, isLoading, error } = useQuery({
    queryKey: ['billing-payment', paymentId],
    queryFn: () => billingGetPayment(paymentId),
  });

  function handlePrint(receipt) {
    setPrintReceipt(receipt);
    setTimeout(() => window.print(), 200);
  }

  if (isLoading) return (
    <div className="p-8 text-sm text-gray-400 text-center">Loading payment…</div>
  );
  if (error || !payment) return (
    <div className="p-8 text-center">
      <AlertCircle className="mx-auto text-red-300 mb-2" size={32} />
      <p className="text-sm text-gray-500">Payment not found</p>
      <button onClick={() => navigate(-1)} className="mt-2 text-sm underline cursor-pointer" style={{ color: '#1E3A5F' }}>
        Go back
      </button>
    </div>
  );

  const cfg = TYPE_CONFIG[payment.type] ?? TYPE_CONFIG.PURCHASE;
  const Icon = cfg.icon;
  const isRefunded = payment.status === 'REFUNDED';
  const paymentReceipt = payment.receipts?.find(r => r.type === 'PAYMENT');
  const refundReceipt  = payment.receipts?.find(r => r.type === 'REFUND');

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/superadmin/billing')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${cfg.cls}`}>
              <Icon size={14} />
              {cfg.label}
            </span>
            {isRefunded && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-600">Refunded</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono">{payment.id}</p>
        </div>
        {!isRefunded && (
          <button
            onClick={() => setShowRefund(true)}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
          >
            Record Refund
          </button>
        )}
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">

        {/* Amount */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
              {payment.amountPaise === 0 && payment.accountCreditAppliedPaise > 0
                ? 'Amount Collected'
                : 'Amount Collected'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-3xl font-bold text-gray-900">
                {payment.amountPaise === 0 && payment.accountCreditAppliedPaise > 0
                  ? '₹0'
                  : fmtPaise(payment.amountPaise)}
              </p>
              {payment.amountPaise === 0 && payment.accountCreditAppliedPaise > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  Credits Covered
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Organisation</p>
            <p className="font-semibold text-gray-800 mt-0.5">{payment.tenantName ?? '—'}</p>
          </div>
        </div>

        {/* Credit breakdown — shown whenever account credit was applied */}
        {payment.accountCreditAppliedPaise > 0 && (
          <>
            <div className="border-t border-gray-100" />
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
              <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Credit Applied</p>
              <div className="space-y-1.5 text-sm">
                <Row label="Plan / Gross amount" value={fmtPaise(payment.grossAmountPaise || payment.amountPaise + payment.accountCreditAppliedPaise)} />
                <Row
                  label="Account credit applied"
                  value={`- ${fmtPaise(payment.accountCreditAppliedPaise)}`}
                  valueClass="text-emerald-700"
                />
                <div className="border-t border-emerald-200 pt-1.5">
                  <Row
                    label={payment.amountPaise === 0 ? 'Net collected (fully covered)' : 'Net collected'}
                    value={payment.amountPaise === 0 ? '₹0 — Credits Covered' : fmtPaise(payment.amountPaise)}
                    bold
                    valueClass={payment.amountPaise === 0 ? 'text-emerald-700' : ''}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-gray-100" />

        {/* Plan details */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan">
            {payment.fromPlan
              ? <span>{payment.fromPlanName} <span className="text-gray-400">→</span> {payment.toPlanName}</span>
              : payment.toPlanName}
          </Field>
          <Field label="Period">
            {fmtDate(payment.planPeriodStart)} – {fmtDate(payment.planPeriodEnd)}
          </Field>
          <Field label="Payment Method">{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</Field>
          <Field label="Payment Date">{fmtDate(payment.paymentDate)}</Field>
          {payment.paymentReference && (
            <Field label="Reference" className="col-span-2">
              <span className="font-mono text-sm">{payment.paymentReference}</span>
            </Field>
          )}
          <Field label="Recorded By">{payment.createdBy ?? '—'}</Field>
          <Field label="Recorded At">{fmtDateTime(payment.createdAt)}</Field>
          {payment.notes && (
            <Field label="Notes" className="col-span-2">{payment.notes}</Field>
          )}
        </div>

        {/* Proration breakdown for upgrades */}
        {payment.type === 'UPGRADE' && payment.prorationCreditPaise != null && (
          <>
            <div className="border-t border-gray-100" />
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-2">
              <p className="text-xs font-bold text-purple-900 uppercase tracking-wide">Proration Breakdown</p>
              <div className="space-y-1.5 text-sm">
                <Row label="Full plan price" value={fmtPaise(payment.fullPlanPricePaise)} />
                <Row
                  label={`Unused days credit (${payment.daysRemaining} of ${payment.daysInPeriod} days)`}
                  value={`- ${fmtPaise(payment.prorationCreditPaise)}`}
                  valueClass="text-green-700"
                />
                <div className="border-t border-purple-200 pt-1.5">
                  <Row label="Collected" value={fmtPaise(payment.amountPaise)} bold />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Refund details */}
        {isRefunded && (
          <>
            <div className="border-t border-gray-100" />
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 space-y-2">
              <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Refund Details</p>
              <div className="space-y-1.5 text-sm">
                <Row label="Refund Amount" value={fmtPaise(payment.refundAmountPaise)} bold />
                <Row label="Refund Method" value={METHOD_LABELS[payment.refundMethod] ?? payment.refundMethod} />
                {payment.refundReference && <Row label="Refund Reference" value={payment.refundReference} />}
                <Row label="Refunded On" value={fmtDateTime(payment.refundedAt)} />
                <Row label="Reason" value={payment.refundReason} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Receipts */}
      {(paymentReceipt || refundReceipt) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm font-semibold text-gray-800 mb-4">Receipts</p>
          <div className="space-y-3">
            {paymentReceipt && (
              <ReceiptRow
                receipt={paymentReceipt}
                label="Payment Receipt"
                onPrint={() => handlePrint(paymentReceipt)}
              />
            )}
            {refundReceipt && (
              <ReceiptRow
                receipt={refundReceipt}
                label="Refund Receipt"
                onPrint={() => handlePrint(refundReceipt)}
              />
            )}
          </div>
        </div>
      )}

      {/* Hidden print area */}
      {printReceipt && (
        <div className="hidden print:block">
          <ReceiptPrintView receipt={printReceipt} payment={payment} tenantName={payment.tenantName} />
        </div>
      )}

      {showRefund && (
        <RefundModal
          payment={payment}
          onClose={() => setShowRefund(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['billing-payment', paymentId] })}
        />
      )}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800">{children}</p>
    </div>
  );
}

function Row({ label, value, bold = false, valueClass = '' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${valueClass}`}>{value}</span>
    </div>
  );
}

function ReceiptRow({ receipt, label, onPrint }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-3">
        <Receipt size={16} className="text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-800">{receipt.receiptNumber}</p>
          <p className="text-xs text-gray-400">{label} · {fmtPaise(receipt.amountPaise)}</p>
        </div>
      </div>
      <button
        onClick={onPrint}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-white cursor-pointer transition-colors text-gray-600"
      >
        <Printer size={13} />
        Print
      </button>
    </div>
  );
}
