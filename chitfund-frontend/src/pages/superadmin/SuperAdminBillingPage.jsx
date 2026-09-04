import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Receipt, Search, ArrowUpCircle, RefreshCw, ShoppingCart,
  Banknote, X, Info, ChevronRight, Filter,
} from 'lucide-react';
import {
  billingListPayments, billingRecordPayment, billingRecordUpgrade,
  billingUpgradePreview, superAdminListTenants,
} from '../../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPaise(paise) {
  if (paise == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TYPE_CONFIG = {
  PURCHASE: { label: 'Purchase',  cls: 'bg-blue-50 text-blue-700',   icon: ShoppingCart },
  RENEWAL:  { label: 'Renewal',   cls: 'bg-green-50 text-green-700', icon: RefreshCw },
  UPGRADE:  { label: 'Upgrade',   cls: 'bg-purple-50 text-purple-700', icon: ArrowUpCircle },
  REFUND:   { label: 'Refund',    cls: 'bg-red-50 text-red-700',     icon: Banknote },
};

const METHOD_LABELS = { UPI: 'UPI', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer' };

const PLANS = ['BASIC', 'GROWTH', 'ENTERPRISE', 'CUSTOM'];

// ── Proration Breakdown ───────────────────────────────────────────────────────

function ProrationBreakdown({ preview }) {
  if (!preview) return null;
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-2.5 text-sm">
      <p className="font-semibold text-purple-900 flex items-center gap-1.5">
        <Info size={14} /> Proration Breakdown
      </p>
      <div className="space-y-1.5 text-xs text-purple-800">
        <div className="flex justify-between">
          <span>Current plan ({preview.currentPlanName})</span>
          <span>{fmtPaise(preview.currentPlanPricePaise)} / mo</span>
        </div>
        <div className="flex justify-between">
          <span>Days remaining ({preview.daysRemaining} of {preview.daysInPeriod})</span>
          <span className="text-green-700 font-medium">- {fmtPaise(preview.creditPaise)} credit</span>
        </div>
        <div className="border-t border-purple-200 pt-1.5 flex justify-between font-semibold text-purple-900">
          <span>Amount to collect</span>
          <span>{fmtPaise(preview.chargePaise)}</span>
        </div>
        <div className="flex justify-between text-purple-700">
          <span>New period</span>
          <span>{fmtDate(preview.newPeriodStart)} → {fmtDate(preview.newPeriodEnd)}</span>
        </div>
      </div>
      {preview.planExpired && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Plan is expired — no credit applied. Full price collected.
        </p>
      )}
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────

function RecordPaymentModal({ initialTenantId, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [tenantId, setTenantId]           = useState(initialTenantId ?? '');
  const [type, setType]                   = useState('RENEWAL');
  const [toPlan, setToPlan]               = useState('BASIC');
  const [amountPaise, setAmountPaise]     = useState('');
  const [method, setMethod]               = useState('UPI');
  const [reference, setReference]         = useState('');
  const [paymentDate, setPaymentDate]     = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]                 = useState('');
  const [preview, setPreview]             = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [fe, setFe]                       = useState({});
  const [error, setError]                 = useState('');

  const { data: tenants = [] } = useQuery({
    queryKey: ['superadmin-tenants-all'],
    queryFn: () => superAdminListTenants({}).then(r => Array.isArray(r) ? r : []),
  });

  const mutation = useMutation({
    mutationFn: (payload) => type === 'UPGRADE'
      ? billingRecordUpgrade(payload)
      : billingRecordPayment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-payments'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const fieldErrors = err.response?.data?.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        setFe(fieldErrors);
        return;
      }
      setError(err.response?.data?.message ?? 'Failed to record payment');
    },
  });

  useEffect(() => {
    if (type !== 'UPGRADE' || !tenantId || !toPlan) { setPreview(null); return; }
    setLoadingPreview(true);
    billingUpgradePreview(tenantId, toPlan)
      .then(p => { setPreview(p); setAmountPaise(String(Math.round(p.chargePaise))); })
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [type, tenantId, toPlan]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!tenantId) { setError('Please select an organisation'); return; }

    const payload = type === 'UPGRADE'
      ? { tenantId, newPlan: toPlan, paymentMethod: method, paymentReference: reference || null, paymentDate, notes: notes || null }
      : { tenantId, type, toPlan, amountPaise: Math.round(Number(amountPaise) * 100), paymentMethod: method, paymentReference: reference || null, paymentDate, notes: notes || null };

    mutation.mutate(payload);
  }

  const selectedTenant = tenants.find(t => t.id === tenantId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Record Payment</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Org selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Organisation *</label>
            <select
              value={tenantId}
              onChange={e => { setTenantId(e.target.value); setFe(f => ({ ...f, tenantId: undefined })); }}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${fe.tenantId ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:ring-[#1E3A5F]/20'}`}
              required
            >
              <option value="">— Select org —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.plan ?? 'BASIC'})</option>
              ))}
            </select>
            {selectedTenant && (
              <p className="text-xs text-gray-400 mt-1">
                Current plan: <span className="font-medium text-gray-600">{selectedTenant.plan ?? 'BASIC'}</span>
                {selectedTenant.planExpiresAt && ` · Expires ${fmtDate(selectedTenant.planExpiresAt)}`}
              </p>
            )}
            {fe.tenantId && <p className="text-xs text-red-500 mt-1">{fe.tenantId}</p>}
          </div>

          {/* Payment type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {['PURCHASE', 'RENEWAL', 'UPGRADE'].map(t => {
                const cfg = TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all ${
                      type === t ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {type === 'UPGRADE' ? 'Upgrade To *' : 'Plan *'}
            </label>
            <select
              value={toPlan}
              onChange={e => setToPlan(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
            >
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Proration preview for upgrade */}
          {type === 'UPGRADE' && (
            loadingPreview
              ? <div className="text-xs text-gray-400 animate-pulse">Calculating proration…</div>
              : <ProrationBreakdown preview={preview} />
          )}

          {/* Amount (not shown for upgrade — auto-calculated) */}
          {type !== 'UPGRADE' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountPaise}
                onChange={e => { setAmountPaise(e.target.value); setFe(f => ({ ...f, amountPaise: undefined })); }}
                placeholder="e.g. 500"
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${fe.amountPaise ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:ring-[#1E3A5F]/20'}`}
                required
              />
              {fe.amountPaise
                ? <p className="text-xs text-red-500 mt-1">{fe.amountPaise}</p>
                : <p className="text-xs text-gray-400 mt-1">Enter amount in Rupees (₹)</p>
              }
            </div>
          )}

          {type === 'UPGRADE' && preview && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount to Collect</label>
              <div className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 font-semibold text-gray-800">
                {fmtPaise(preview.chargePaise)}
              </div>
            </div>
          )}

          {/* Payment method */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Method *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(METHOD_LABELS).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMethod(val)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all ${
                    method === val ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          {method !== 'CASH' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {method === 'UPI' ? 'UPI Transaction ID' : 'Bank Reference / NEFT Ref'}
              </label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder={method === 'UPI' ? 'e.g. 4567891234567' : 'e.g. NEFT12345'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              />
            </div>
          )}

          {/* Payment date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Date *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {mutation.isPending ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Payment Row ───────────────────────────────────────────────────────────────

function PaymentRow({ payment, onClick }) {
  const cfg  = TYPE_CONFIG[payment.type] ?? TYPE_CONFIG.PURCHASE;
  const Icon = cfg.icon;
  const isRefunded = payment.status === 'REFUNDED';

  return (
    <tr
      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
            <Icon size={11} />
            {cfg.label}
          </span>
          {isRefunded && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">Refunded</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-800 font-medium">{payment.tenantName ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {payment.fromPlan ? `${payment.fromPlan} → ${payment.toPlan}` : payment.toPlan}
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtPaise(payment.amountPaise)}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(payment.paymentDate)}</td>
      <td className="px-4 py-3">
        <ChevronRight size={15} className="text-gray-300" />
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminBillingPage() {
  const navigate = useNavigate();
  const [showModal, setShowModal]     = useState(false);
  const [search, setSearch]           = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [page, setPage]               = useState(0);

  const { data: tenants = [] } = useQuery({
    queryKey: ['superadmin-tenants-all'],
    queryFn: () => superAdminListTenants({}).then(r => Array.isArray(r) ? r : []),
  });

  const { data: paymentsPage, isLoading } = useQuery({
    queryKey: ['billing-payments', tenantFilter, page],
    queryFn: () => billingListPayments({ tenantId: tenantFilter || undefined, page, size: 15 }),
  });

  const payments   = paymentsPage?.content ?? [];
  const totalPages = paymentsPage?.totalPages ?? 1;

  const filtered = search
    ? payments.filter(p =>
        (p.tenantName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        p.type.toLowerCase().includes(search.toLowerCase()) ||
        (p.toPlan ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.paymentReference ?? '').includes(search)
      )
    : payments;

  // Summary stats
  const totalCollected = payments
    .filter(p => p.status !== 'REFUNDED')
    .reduce((sum, p) => sum + (p.amountPaise ?? 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Billing
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and track plan payments across all orgs</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Total Collected</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtPaise(totalCollected)}</p>
          <p className="text-xs text-gray-400 mt-0.5">this view</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Transactions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{paymentsPage?.totalElements ?? 0}</p>
          <p className="text-xs text-gray-400 mt-0.5">all time</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Refunded</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {fmtPaise(payments.filter(p => p.status === 'REFUNDED').reduce((s, p) => s + (p.refundAmountPaise ?? 0), 0))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">this view</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search payments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={tenantFilter}
            onChange={e => { setTenantFilter(e.target.value); setPage(0); }}
            className="pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 bg-white"
          >
            <option value="">All orgs</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading payments…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">No payments recorded yet</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm font-medium underline cursor-pointer"
              style={{ color: '#1E3A5F' }}
            >
              Record first payment
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Type', 'Organisation', 'Plan', 'Amount', 'Method', 'Date', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  onClick={() => navigate(`/superadmin/billing/payments/${p.id}`)}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer disabled:cursor-default transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {Math.max(1, totalPages)}
            {paymentsPage?.totalElements != null && (
              <span className="text-gray-400 ml-1">· {paymentsPage.totalElements} total</span>
            )}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer disabled:cursor-default transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {showModal && (
        <RecordPaymentModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
