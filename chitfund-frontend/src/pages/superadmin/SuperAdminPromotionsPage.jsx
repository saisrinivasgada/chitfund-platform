import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListPromotions,
  superAdminCreatePromotion,
  superAdminUpdatePromotion,
  superAdminSetPromotionVisibility,
  superAdminDeactivatePromotion,
  superAdminListReferralCredits,
  superAdminListPlans,
} from '../../services/api';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  Plus, Tag, Gift, Edit, XCircle, Eye, EyeOff, Users, Clock, CheckCircle2,
} from 'lucide-react';

const TYPE_CONFIG = {
  STANDARD: { label: 'Standard', icon: Tag,   color: '#2563EB', bg: '#EFF6FF' },
  REFERRAL: { label: 'Referral', icon: Users, color: '#7C3AED', bg: '#F5F3FF' },
};

const EMPTY_FORM = {
  code: '', label: '', description: '',
  promoType: 'STANDARD', discountPct: '', appliesToPlans: [],
  referrerCreditInr: '', validFrom: '', validUntil: '',
  maxUses: '', isPublic: false,
  discountDurationType: 'FOREVER', discountDurationMonths: '',
};

function PromoModal({ initial, onClose, showToast }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const { data: availablePlans = [] } = useQuery({
    queryKey: ['superAdminPlansForPromo'],
    queryFn: superAdminListPlans,
    staleTime: 60_000,
  });

  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      ...initial,
      discountPct: initial.discountPct?.toString() ?? '',
      referrerCreditInr: initial.referrerCreditInr?.toString() ?? '',
      maxUses: initial.maxUses?.toString() ?? '',
      discountDurationMonths: initial.discountDurationMonths?.toString() ?? '',
      appliesToPlans: initial.appliesToPlans
        ? initial.appliesToPlans.split(',').filter(Boolean)
        : [],
    };
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function togglePlan(plan) {
    set('appliesToPlans', form.appliesToPlans.includes(plan)
      ? form.appliesToPlans.filter(x => x !== plan)
      : [...form.appliesToPlans, plan]);
  }

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? superAdminUpdatePromotion(initial.id, data)
      : superAdminCreatePromotion(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdminPromotions'] });
      showToast(isEdit ? 'Promotion updated' : 'Promotion created');
      onClose();
    },
    onError: (err) => showToast(err.response?.data?.message ?? 'Failed'),
  });

  function submit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      discountPct: parseFloat(form.discountPct) || 0,
      referrerCreditInr: form.promoType === 'REFERRAL' && form.referrerCreditInr
        ? parseFloat(form.referrerCreditInr) : null,
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
      appliesToPlans: form.appliesToPlans.length ? form.appliesToPlans.join(',') : null,
      discountDurationType: form.discountDurationType || 'FOREVER',
      discountDurationMonths: form.discountDurationType === 'MONTHS' && form.discountDurationMonths
        ? parseInt(form.discountDurationMonths) : null,
    };
    mutation.mutate(payload);
  }

  const activePlans = availablePlans.filter(p => p.isActive);

  return (
    <Modal title={isEdit ? 'Edit Promotion' : 'Create Promotion'} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">

        {/* Type selector */}
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(TYPE_CONFIG).map(([k, cfg]) => {
                const Icon = cfg.icon;
                const active = form.promoType === k;
                return (
                  <button key={k} type="button" onClick={() => set('promoType', k)}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: active ? cfg.color : '#E5E7EB', backgroundColor: active ? cfg.bg : '#FAFAFA' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: active ? cfg.color : '#F3F4F6' }}>
                      <Icon size={15} style={{ color: active ? '#fff' : '#9CA3AF' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: active ? cfg.color : '#374151' }}>{cfg.label}</p>
                      <p className="text-xs text-gray-400">
                        {k === 'STANDARD' ? 'One-time promo code' : 'Tenant referral program'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Referral note */}
        {form.promoType === 'REFERRAL' && (
          <div className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
            Each org has a unique referral code (e.g., REF-KETHAKI). When someone registers using it, they get the discount below and the referrer earns the credit below.
            Changing these values instantly applies to all future uses.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code <span className="text-red-500">*</span></label>
              <input required value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="SUMMER25"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div className={isEdit ? 'col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label <span className="text-red-500">*</span></label>
            <input required value={form.label} onChange={e => set('label', e.target.value)}
              placeholder="Summer 2025 Discount"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Shown to new orgs on the registration page"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discount % (registrant)</label>
            <input type="number" min="0" max="100" step="0.5" value={form.discountPct}
              onChange={e => set('discountPct', e.target.value)}
              placeholder="10"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {form.promoType === 'REFERRAL' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Referrer Credit (₹)</label>
              <input type="number" min="0" step="1" value={form.referrerCreditInr}
                onChange={e => set('referrerCreditInr', e.target.value)}
                placeholder="500"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Applies to Plans
                <span className="text-gray-400 font-normal ml-1">(blank = all)</span>
              </label>
              {activePlans.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {activePlans.map(p => {
                    const checked = form.appliesToPlans.includes(p.plan);
                    return (
                      <button
                        key={p.plan}
                        type="button"
                        onClick={() => togglePlan(p.plan)}
                        className={`px-2.5 py-1 rounded-lg border-2 text-xs font-medium transition-all cursor-pointer ${
                          checked
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {p.displayName ?? p.plan}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">No plans available</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
            <input type="datetime-local" value={form.validFrom} onChange={e => set('validFrom', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valid Until</label>
            <input type="datetime-local" value={form.validUntil} onChange={e => set('validUntil', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Discount duration */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Discount Duration</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'ONCE',    label: 'Next cycle only', desc: '1 billing cycle' },
              { value: 'MONTHS',  label: 'N months',        desc: 'Specify below' },
              { value: 'FOREVER', label: 'Forever',         desc: 'Never expires' },
            ].map(opt => (
              <button key={opt.value} type="button"
                onClick={() => set('discountDurationType', opt.value)}
                className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                  form.discountDurationType === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}>
                <p className={`text-xs font-semibold ${form.discountDurationType === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>{opt.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
          {form.discountDurationType === 'MONTHS' && (
            <input type="number" min="1" max="60" value={form.discountDurationMonths}
              onChange={e => set('discountDurationMonths', e.target.value)}
              placeholder="Number of months (e.g. 3)"
              className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
        </div>

        {form.promoType === 'STANDARD' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses (blank = unlimited)</label>
            <input type="number" min="1" value={form.maxUses} onChange={e => set('maxUses', e.target.value)}
              placeholder="100"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.isPublic} onChange={e => set('isPublic', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-600" />
          <span className="text-sm text-gray-700">Make live immediately (show on registration &amp; landing page)</span>
        </label>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" onClick={onClose} size="md">Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} size="md">
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuperAdminPromotionsPage() {
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editPromo, setEditPromo] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['superAdminPromotions'],
    queryFn: superAdminListPromotions,
  });

  const { data: referralCredits = [] } = useQuery({
    queryKey: ['superAdminReferralCredits'],
    queryFn: () => superAdminListReferralCredits(),
    staleTime: 60_000,
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }) => superAdminSetPromotionVisibility(id, isPublic),
    onSuccess: (_, { isPublic }) => {
      qc.invalidateQueries({ queryKey: ['superAdminPromotions'] });
      showToast(isPublic ? 'Promotion is now live' : 'Promotion taken offline');
    },
    onError: (err) => showToast(err.response?.data?.message ?? 'Failed'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => superAdminDeactivatePromotion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdminPromotions'] });
      showToast('Promotion deactivated');
      setConfirmDeactivate(null);
    },
    onError: (err) => showToast(err.response?.data?.message ?? 'Failed'),
  });

  const referralProgram = promos.find(p => p.promoType === 'REFERRAL');
  const standardPromos = promos.filter(p => p.promoType === 'STANDARD');

  return (
    <>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Promotions</h1>
            <p className="text-sm text-gray-500 mt-1">Manage discount codes and the referral program</p>
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1.5" /> New Promotion
          </Button>
        </div>

        {/* Referral Program card */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Gift size={20} className="text-purple-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Referral Program</h2>
                <p className="text-sm text-gray-500">Each org gets a unique referral code. Settings apply instantly to all codes.</p>
              </div>
            </div>
            {referralProgram && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditPromo({ ...referralProgram, discountPct: referralProgram.discountPct?.toString(), referrerCreditInr: referralProgram.referrerCreditInr?.toString() })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  <Edit size={13} /> Edit
                </button>
                <button
                  onClick={() => visibilityMutation.mutate({ id: referralProgram.id, isPublic: !referralProgram.isPublic })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    referralProgram.isActive
                      ? referralProgram.isPublic
                        ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      : 'border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={!referralProgram.isActive || visibilityMutation.isPending}
                >
                  {referralProgram.isPublic ? (
                    <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" /> Active</>
                  ) : (
                    <><EyeOff size={13} /> Enable</>
                  )}
                </button>
              </div>
            )}
          </div>

          {referralProgram ? (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-gray-500 mb-1">Registrant Discount</p>
                <p className="text-2xl font-bold text-purple-700">{referralProgram.discountPct}%</p>
                <p className="text-xs text-gray-400">off first month</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-gray-500 mb-1">Referrer Credit</p>
                <p className="text-2xl font-bold text-purple-700">₹{referralProgram.referrerCreditInr ?? 0}</p>
                <p className="text-xs text-gray-400">per successful referral</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-gray-500 mb-1">Total Referrals</p>
                <p className="text-2xl font-bold text-purple-700">{referralProgram.usesCount}</p>
                <p className="text-xs text-gray-400">all time</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-center py-4 text-sm text-gray-400">
              No referral program created yet. Click "New Promotion" and choose "Referral" type.
            </div>
          )}
        </div>

        {/* Referral Credit Pipeline */}
        {referralCredits.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Referral Credit Pipeline</h2>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {referralCredits.map(rc => {
                const isPending = rc.status === 'PENDING';
                const isCredited = rc.status === 'CREDITED';
                const hasEligible = !!rc.creditEligibleAt;
                const daysLeft = hasEligible
                  ? Math.max(0, Math.ceil((new Date(rc.creditEligibleAt) - Date.now()) / 86400000))
                  : null;
                return (
                  <div key={rc.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCredited ? 'bg-green-100' : isPending && hasEligible ? 'bg-amber-100' : 'bg-gray-100'
                    }`}>
                      {isCredited
                        ? <CheckCircle2 size={16} className="text-green-600" />
                        : <Clock size={16} className={isPending && hasEligible ? 'text-amber-600' : 'text-gray-400'} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        <span className="text-purple-700">{rc.referrerName}</span>
                        <span className="text-gray-400 mx-2">referred</span>
                        <span className="text-[#1E3A5F]">{rc.referredName}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isCredited && `₹${rc.creditInr} credited on ${new Date(rc.creditedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
                        {isPending && !hasEligible && 'Waiting for org activation by super-admin'}
                        {isPending && hasEligible && daysLeft > 0 && `₹${rc.creditInr} releases in ${daysLeft} day${daysLeft === 1 ? '' : 's'} · eligible ${new Date(rc.creditEligibleAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
                        {isPending && hasEligible && daysLeft === 0 && `₹${rc.creditInr} releases tonight (daily job)`}
                      </p>
                    </div>
                    <div className="text-sm font-semibold flex-shrink-0" style={{
                      color: isCredited ? '#16A34A' : '#6B7280'
                    }}>
                      ₹{rc.creditInr}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Standard promo codes table */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Promo Codes</h2>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : standardPromos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
              <Tag size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-400">No promo codes yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {standardPromos.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm font-bold text-gray-900">{p.code}</span>
                      {p.isPublic && p.isActive && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                        </span>
                      )}
                      {!p.isActive && (
                        <Badge variant="danger">Deactivated</Badge>
                      )}
                      {p.isActive && !p.isPublic && (
                        <Badge variant="default">Draft</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{p.label}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{p.discountPct}% off</span>
                      {p.appliesToPlans && <span>· {p.appliesToPlans}</span>}
                      <span>· {p.usesCount}{p.maxUses ? `/${p.maxUses}` : ''} uses</span>
                      {p.validUntil && (
                        <span>· Expires {new Date(p.validUntil).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.isActive && (
                      <>
                        <button
                          onClick={() => setEditPromo({ ...p, discountPct: p.discountPct?.toString(), maxUses: p.maxUses?.toString() ?? '' })}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => visibilityMutation.mutate({ id: p.id, isPublic: !p.isPublic })}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title={p.isPublic ? 'Take offline' : 'Make live'}
                        >
                          {p.isPublic ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          onClick={() => setConfirmDeactivate(p)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Deactivate"
                        >
                          <XCircle size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreate && <PromoModal onClose={() => setShowCreate(false)} showToast={showToast} />}
      {editPromo && <PromoModal initial={editPromo} onClose={() => setEditPromo(null)} showToast={showToast} />}

      {confirmDeactivate && (
        <ConfirmDialog
          variant="danger"
          title="Deactivate Promotion"
          description={`"${confirmDeactivate.label}" (${confirmDeactivate.code}) will be deactivated and removed from public pages. This cannot be undone — you'd need to create a new one.`}
          actionLabel="Deactivate"
          loading={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(confirmDeactivate.id)}
          onClose={() => setConfirmDeactivate(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-xl z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

    </>
  );
}
