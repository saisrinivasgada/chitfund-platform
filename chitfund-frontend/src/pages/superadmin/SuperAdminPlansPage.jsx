import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  superAdminListPlans,
  superAdminCreatePlanDef,
  superAdminUpdatePlanDef,
  superAdminDeletePlanDef,
  superAdminListCapabilities,
  superAdminAddCapability,
  superAdminDeleteCapability,
} from '../../services/api';
import {
  Plus, Edit2, Trash2, X, RefreshCw, Tag,
  Users, BarChart2, HeadphonesIcon, Zap, Radio,
  GripVertical, Eye, Check, ChevronRight, ChevronLeft,
} from 'lucide-react';

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10 bg-white';

function fmtRupees(paise) {
  if (!paise || paise === 0) return '₹0';
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

function StaffLabel({ max }) {
  if (max === -1) return <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">∞ staff</span>;
  if (max === 0) return <span className="text-xs text-gray-400">No staff</span>;
  return <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{max} staff</span>;
}

function CapBadge({ on, label, icon: Icon }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <Icon size={10} />{label}
    </span>
  );
}

/* ── Plan card as shown on register/landing page ─────────────────────── */
function PlanCard({ plan }) {
  const price = plan.effectivePriceInr ?? plan.priceMonthlyInr;
  const hasDiscount = plan.globalDiscountPct && plan.globalDiscountPct > 0;
  const features = Array.isArray(plan.features) ? plan.features : [];

  return (
    <div
      className="relative flex flex-col rounded-2xl border border-gray-200 bg-white text-gray-900"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <div className="p-6 flex-1">
        <p className="text-xs font-bold uppercase tracking-widest mb-1 text-gray-400">
          {plan.displayName ?? plan.plan}
        </p>
        {plan.tagline && (
          <p className="text-xs mb-4 text-gray-500">{plan.tagline}</p>
        )}
        {price === 0 ? (
          <p className="text-2xl font-bold mb-1 text-gray-800">Contact us</p>
        ) : (
          <div className="mb-4">
            <p className="text-3xl font-bold text-gray-900">
              {fmtRupees(price)}
              <span className="text-sm font-normal ml-1 text-gray-400">/mo</span>
            </p>
            {hasDiscount && (
              <p className="text-xs mt-0.5 text-gray-400">
                <span className="line-through">{fmtRupees(plan.priceMonthlyInr)}</span>
                <span className="ml-1 text-emerald-600 font-semibold">{plan.globalDiscountPct}% off</span>
              </p>
            )}
          </div>
        )}
        <ul className="space-y-2 mt-4">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check size={13} className="flex-shrink-0 mt-0.5 text-emerald-500" />
              <span className="text-gray-600">{f}</span>
            </li>
          ))}
          {features.length === 0 && (
            <li className="text-xs italic text-gray-400">No features listed</li>
          )}
        </ul>
      </div>
      <div className="px-6 pb-6">
        <button
          type="button"
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-colors"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          Get started
          <ChevronRight size={14} className="inline ml-1" />
        </button>
      </div>
    </div>
  );
}

function PlanPreviewModal({ plans, onClose }) {
  const live = plans.filter(p => p.isPublic && p.isActive);
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => { setCanLeft(el.scrollLeft > 4); setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4); };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [live.length]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Plan preview</h3>
            <p className="text-xs text-gray-400 mt-0.5">How live plans appear on the registration &amp; landing page</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-8 bg-gray-50 rounded-b-2xl">
          {live.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No live plans to preview — mark some plans as Live first</p>
            </div>
          ) : (
            <div className="relative">
              {canLeft && (
                <button type="button" onClick={() => scrollRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                  className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    backgroundColor: 'rgba(255,255,255,0.65)',
                    border: '1px solid rgba(255,255,255,0.85)',
                    boxShadow: '0 4px 16px rgba(30,58,95,0.12), inset 0 1px 0 rgba(255,255,255,1)',
                  }}>
                  <ChevronLeft size={18} style={{ color: '#1E3A5F', filter: 'drop-shadow(0 1px 1px rgba(30,58,95,0.2))' }} />
                </button>
              )}
              {canRight && (
                <button type="button" onClick={() => scrollRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                  className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    backgroundColor: 'rgba(255,255,255,0.65)',
                    border: '1px solid rgba(255,255,255,0.85)',
                    boxShadow: '0 4px 16px rgba(30,58,95,0.12), inset 0 1px 0 rgba(255,255,255,1)',
                  }}>
                  <ChevronRight size={18} style={{ color: '#1E3A5F', filter: 'drop-shadow(0 1px 1px rgba(30,58,95,0.2))' }} />
                </button>
              )}
              <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 items-stretch" style={{ scrollbarWidth: 'none' }}>
              {live.map((plan) => (
                <PlanCard key={plan.plan} plan={plan} />
              ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Capability keys that are also enforced by the backend (shown as "(enforced)" hint)
const ENFORCED_KEYS = new Set(['full_analytics', 'priority_support']);

function PlanModal({ plan, onSave, onClose }) {
  const isEdit = !!plan;
  const [form, setForm] = useState({
    plan:                   plan?.plan ?? '',
    displayName:            plan?.displayName ?? '',
    tagline:                plan?.tagline ?? '',
    featuresText:           (plan?.features ?? []).join('\n'),
    enabledCapabilityKeys:  plan?.enabledCapabilities ?? [],
    priceRupees:            plan?.priceMonthlyInr != null ? String(plan.priceMonthlyInr / 100) : '0',
    globalDiscountPct:      plan?.globalDiscountPct != null ? String(plan.globalDiscountPct) : '',
    maxActiveChits:         plan?.maxActiveChits != null ? String(plan.maxActiveChits) : '1',
    maxMembers:             plan?.maxMembers != null ? String(plan.maxMembers) : '20',
    maxStaff:               plan?.maxStaff != null ? String(plan.maxStaff) : '0',
    displayOrder:           plan?.displayOrder != null ? String(plan.displayOrder) : '99',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [capDefs, setCapDefs] = useState([]);
  const [newCapLabel, setNewCapLabel] = useState('');
  const [addingCap, setAddingCap] = useState(false);
  const [showAddCap, setShowAddCap] = useState(false);

  const isLive = isEdit && plan.isPublic && plan.isActive;
  const enabledSet = new Set(form.featuresText.split('\n').map(s => s.trim()).filter(Boolean));

  useEffect(() => {
    superAdminListCapabilities().then(setCapDefs).catch(() => {});
  }, []);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function toggleCapability(label, checked, key) {
    setForm(p => {
      const lines = p.featuresText.split('\n').map(s => s.trim()).filter(Boolean);
      const capLabelSet = new Set(capDefs.map(c => c.label));
      const nonCapFeatures = lines.filter(l => !capLabelSet.has(l));
      const checkedCapLabels = lines.filter(l => capLabelSet.has(l));
      const newCheckedCapLabels = checked
        ? [...new Set([...checkedCapLabels, label])]
        : checkedCapLabels.filter(l => l !== label);
      // Keep caps in sort_order defined by capDefs
      const sortedCaps = capDefs.filter(c => newCheckedCapLabels.includes(c.label)).map(c => c.label);

      // Update enforcement keys (the capability key, not the display label)
      const newKeys = key
        ? checked
          ? [...new Set([...p.enabledCapabilityKeys, key])]
          : p.enabledCapabilityKeys.filter(k => k !== key)
        : p.enabledCapabilityKeys;

      return {
        ...p,
        featuresText: [...nonCapFeatures, ...sortedCaps].join('\n'),
        enabledCapabilityKeys: newKeys,
      };
    });
  }

  async function handleAddCapability() {
    const label = newCapLabel.trim();
    if (!label) return;
    setAddingCap(true);
    try {
      const created = await superAdminAddCapability(label);
      setCapDefs(prev => [...prev, created]);
      toggleCapability(label, true, created.key);
      setNewCapLabel('');
      setShowAddCap(false);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to add capability');
    } finally {
      setAddingCap(false);
    }
  }

  async function handleDeleteCapability(key, label) {
    if (!window.confirm(`Remove capability "${label}" from the master list? It will disappear from all plan edit pages (existing features text is not changed).`)) return;
    try {
      await superAdminDeleteCapability(key);
      setCapDefs(prev => prev.filter(c => c.key !== key));
    } catch { setError('Failed to remove capability'); }
  }

  async function handleSave() {
    if (!isEdit && !form.plan.trim()) { setError('Plan code is required'); return; }
    if (!form.displayName.trim()) { setError('Display name is required'); return; }
    if (isLive && !confirming) { setConfirming(true); return; }
    setSaving(true);
    setError('');
    setConfirming(false);
    try {
      const features = form.featuresText.split('\n').map(s => s.trim()).filter(Boolean);
      const priceInPaise = Math.round(parseFloat(form.priceRupees || '0') * 100);
      const body = {
        displayName:         form.displayName,
        tagline:             form.tagline || null,
        features,
        enabledCapabilities: form.enabledCapabilityKeys,
        priceMonthlyInr:     priceInPaise,
        globalDiscountPct:   form.globalDiscountPct ? parseFloat(form.globalDiscountPct) : null,
        maxActiveChits:      parseInt(form.maxActiveChits) || 1,
        maxMembers:          parseInt(form.maxMembers) || 20,
        maxStaff:            parseInt(form.maxStaff) || 0,
        displayOrder:        parseInt(form.displayOrder) || 99,
      };
      if (!isEdit) {
        body.plan = form.plan.toUpperCase().replace(/\s+/g, '_');
        body.isActive = true;
      }
      if (isEdit) {
        await superAdminUpdatePlanDef(plan.plan, body);
      } else {
        await superAdminCreatePlanDef(body);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const effPrice = form.priceRupees && form.globalDiscountPct
    ? (parseFloat(form.priceRupees) * (1 - parseFloat(form.globalDiscountPct) / 100)).toFixed(2)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{isEdit ? `Edit — ${plan.displayName}` : 'Create plan'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Plan code <span className="text-red-400">*</span></label>
              <input className={INPUT} value={form.plan} onChange={e => set('plan', e.target.value)} placeholder="GROWTH" />
              <p className="text-xs text-gray-400 mt-1">Uppercase, no spaces (e.g. BASIC, GROWTH, ENTERPRISE)</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display name <span className="text-red-400">*</span></label>
            <input className={INPUT} value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Growth" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tagline</label>
            <input className={INPUT} value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="For growing chit businesses" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Features <span className="text-gray-400 font-normal">(one per line — shown on registration page)</span></label>
            <textarea
              className={`${INPUT} resize-none`}
              rows={5}
              value={form.featuresText}
              onChange={e => set('featuresText', e.target.value)}
              placeholder={"2 active chit groups\nUp to 30 members\nAutomated reminders\nPriority support"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Price (₹/month)</label>
              <input type="number" min="0" className={INPUT} value={form.priceRupees} onChange={e => set('priceRupees', e.target.value)} placeholder="249" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Discount %
                {effPrice && <span className="text-emerald-600 font-normal ml-1">→ ₹{effPrice}/mo</span>}
              </label>
              <input type="number" min="0" max="100" step="0.01" className={INPUT} value={form.globalDiscountPct} onChange={e => set('globalDiscountPct', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max chits <span className="text-gray-400 font-normal">(-1=∞)</span></label>
              <input type="number" className={INPUT} value={form.maxActiveChits} onChange={e => set('maxActiveChits', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max members <span className="text-gray-400 font-normal">(-1=∞)</span></label>
              <input type="number" className={INPUT} value={form.maxMembers} onChange={e => set('maxMembers', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max staff <span className="text-gray-400 font-normal">(0=none)</span></label>
              <input type="number" className={INPUT} value={form.maxStaff} onChange={e => set('maxStaff', e.target.value)} />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600">Capabilities</p>
              <button type="button" onClick={() => setShowAddCap(v => !v)}
                className="text-xs text-[#1E3A5F] font-semibold hover:underline cursor-pointer">
                + Add capability
              </button>
            </div>
            {showAddCap && (
              <div className="flex gap-2 mb-2">
                <input
                  className={`${INPUT} flex-1`}
                  placeholder="e.g. SMS notifications"
                  value={newCapLabel}
                  onChange={e => setNewCapLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCapability()}
                  autoFocus
                />
                <button type="button" onClick={handleAddCapability} disabled={addingCap || !newCapLabel.trim()}
                  className="px-3 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: '#1E3A5F' }}>
                  {addingCap ? '…' : 'Add'}
                </button>
              </div>
            )}
            {capDefs.length === 0 && <p className="text-xs text-gray-400 italic">No capabilities defined yet — click "+ Add capability"</p>}
            {capDefs.map(cap => (
              <div key={cap.key} className="flex items-center justify-between group">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input type="checkbox"
                    checked={enabledSet.has(cap.label)}
                    onChange={e => toggleCapability(cap.label, e.target.checked, cap.key)}
                    className="rounded accent-[#1E3A5F]" />
                  <span className="text-sm text-gray-700">{cap.label}</span>
                  {ENFORCED_KEYS.has(cap.key) && (
                    <span className="text-xs text-blue-500">(enforced)</span>
                  )}
                </label>
                <button type="button" onClick={() => handleDeleteCapability(cap.key, cap.label)}
                  title="Remove from master list"
                  className="text-gray-300 hover:text-red-500 cursor-pointer transition-colors flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display order</label>
            <input type="number" min="0" className={INPUT} value={form.displayOrder} onChange={e => set('displayOrder', e.target.value)} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        {confirming && (
          <div className="px-6 py-4 bg-amber-50 border-t border-amber-200">
            <p className="text-sm font-semibold text-amber-900 mb-1">This plan is currently live</p>
            <p className="text-xs text-amber-700">Changes will reflect immediately on the landing page, registration, and all user-facing views. Are you sure?</p>
          </div>
        )}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={confirming ? () => setConfirming(false) : onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
            {confirming ? 'Go back' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: confirming ? '#B45309' : '#1E3A5F' }}
          >
            {saving ? 'Saving…' : confirming ? 'Yes, save live plan' : isLive ? 'Save changes' : isEdit ? 'Save changes' : 'Create plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminPlansPage() {
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [editPlan, setEditPlan] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingPlan, setTogglingPlan] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Drag-to-reorder state
  const dragIdx = useRef(null);
  const [dropIdx, setDropIdx] = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const load = useCallback(async () => {
    setLoading(true);
    try { setPlans(await superAdminListPlans()); }
    catch { showToast('Failed to load plans'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleMakeLive(plan) {
    setTogglingPlan(plan.plan);
    try {
      await superAdminUpdatePlanDef(plan.plan, { isPublic: true, isActive: true });
      showToast(`${plan.displayName} is now live!`);
      load();
    } catch { showToast('Failed to publish'); }
    finally { setTogglingPlan(null); }
  }

  async function handleTakeOffline(plan) {
    setTogglingPlan(plan.plan);
    try {
      await superAdminUpdatePlanDef(plan.plan, { isPublic: false });
      showToast(`${plan.displayName} taken offline`);
      load();
    } catch { showToast('Failed to update'); }
    finally { setTogglingPlan(null); }
  }

  async function handleDeactivate(plan) {
    if (!window.confirm(`Deactivate "${plan.displayName}"? Existing tenants keep it, but it won't appear anywhere.`)) return;
    try {
      await superAdminDeletePlanDef(plan.plan);
      showToast('Plan deactivated');
      load();
    } catch { showToast('Failed to deactivate'); }
  }

  function handleDragStart(idx) {
    dragIdx.current = idx;
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    setDropIdx(idx);
  }

  async function handleDrop(idx) {
    const from = dragIdx.current;
    dragIdx.current = null;
    setDropIdx(null);
    if (from === null || from === idx) return;

    const reordered = [...plans];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);

    // Assign new display orders (0, 1, 2, …) and update each plan
    const updated = reordered.map((p, i) => ({ ...p, displayOrder: i }));
    setPlans(updated);

    setSavingOrder(true);
    try {
      await Promise.all(updated.map(p => superAdminUpdatePlanDef(p.plan, { displayOrder: p.displayOrder })));
      showToast('Order saved');
    } catch {
      showToast('Failed to save order');
      load(); // reload to get server state
    } finally {
      setSavingOrder(false);
    }
  }

  const livePlans = plans.filter(p => p.isPublic && p.isActive).length;

  return (
    <>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Plans</h1>
            <p className="text-sm text-gray-500 mt-1">
              {livePlans > 0
                ? <><span className="text-emerald-600 font-medium">{livePlans} live</span> — visible on registration &amp; landing page</>
                : 'Create plans and click "Make Live" to show them to users'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              <Eye size={14} />
              Preview
            </button>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              <RefreshCw size={14} className={loading || savingOrder ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold cursor-pointer hover:opacity-90"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              <Plus size={15} />
              New Plan
            </button>
          </div>
        </div>

        {/* Plans table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#1E3A5F]/20 border-t-[#1E3A5F] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-3 w-8"></th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Plan</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Price</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Limits</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Capabilities</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-52">Actions</th>
                  </tr>
                </thead>
                <tbody onDragLeave={() => setDropIdx(null)}>
                  {plans.map((plan, idx) => {
                    const isToggling = togglingPlan === plan.plan;
                    const isDragTarget = dropIdx === idx && dragIdx.current !== null && dragIdx.current !== idx;
                    return (
                      <tr
                        key={plan.plan}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        className={`border-b border-gray-50 transition-colors ${isDragTarget ? 'bg-blue-50/70 border-blue-200' : 'hover:bg-gray-50/50'}`}
                      >
                        {/* Drag handle */}
                        <td className="px-3 py-4">
                          <GripVertical size={16} className="text-gray-300 cursor-grab active:cursor-grabbing" />
                        </td>
                        {/* Plan name */}
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900 text-sm">{plan.displayName}</p>
                          <p className="text-xs text-gray-400 mt-0.5 italic">{plan.tagline}</p>
                          <span className="font-mono text-xs text-gray-400">{plan.plan}</span>
                        </td>
                        {/* Price */}
                        <td className="px-5 py-4">
                          {plan.priceMonthlyInr === 0 ? (
                            <span className="text-sm font-semibold text-gray-500">Contact us</span>
                          ) : (
                            <div>
                              <span className="text-sm font-bold text-gray-800">
                                {fmtRupees(plan.effectivePriceInr ?? plan.priceMonthlyInr)}/mo
                              </span>
                              {plan.globalDiscountPct && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    {plan.globalDiscountPct}% off
                                  </span>
                                  <span className="text-xs text-gray-400 line-through">{fmtRupees(plan.priceMonthlyInr)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        {/* Limits */}
                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Zap size={11} className="text-gray-400" />
                              {plan.maxActiveChits === -1 ? 'Unlimited chits' : `${plan.maxActiveChits} chit${plan.maxActiveChits !== 1 ? 's' : ''}`}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users size={11} className="text-gray-400" />
                              {plan.maxMembers === -1 ? 'Unlimited members' : `${plan.maxMembers} members`}
                            </div>
                          </div>
                        </td>
                        {/* Capabilities */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1.5">
                            <StaffLabel max={plan.maxStaff} />
                            <CapBadge on={plan.analyticsEnabled} label="Analytics" icon={BarChart2} />
                            <CapBadge on={plan.prioritySupport} label="Priority support" icon={HeadphonesIcon} />
                          </div>
                        </td>
                        {/* Status — fixed: isActive === false (not falsy) means inactive */}
                        <td className="px-5 py-4">
                          {plan.isPublic && plan.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                              <Radio size={10} className="animate-pulse" />
                              Live
                            </span>
                          ) : plan.isActive === false ? (
                            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Inactive</span>
                          ) : (
                            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Draft</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {/* Edit */}
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => setEditPlan(plan)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>

                            {/* Make Live / Stop Live */}
                            {plan.isActive !== false && (
                              plan.isPublic ? (
                                <button
                                  type="button"
                                  onClick={() => handleTakeOffline(plan)}
                                  disabled={isToggling}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 font-semibold cursor-pointer transition-colors disabled:opacity-50"
                                >
                                  {isToggling ? '…' : 'Stop Live'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleMakeLive(plan)}
                                  disabled={isToggling}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold cursor-pointer transition-colors disabled:opacity-50"
                                >
                                  {isToggling ? '…' : '→ Make Live'}
                                </button>
                              )
                            )}

                            {/* Deactivate */}
                            {plan.isActive !== false && (
                              <button
                                type="button"
                                title="Deactivate plan"
                                onClick={() => handleDeactivate(plan)}
                                className="p-1.5 rounded-lg hover:bg-red-50 cursor-pointer text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {plans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-gray-400 text-sm">
                        No plans yet — create your first plan and click "Make Live" to publish it.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          <Tag size={11} className="inline mr-1" />
          Drag rows to reorder · Plans reflect immediately on the registration form and landing page once live.
        </p>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      {showPreview && (
        <PlanPreviewModal plans={plans} onClose={() => setShowPreview(false)} />
      )}

      {showCreate && (
        <PlanModal
          onSave={() => { setShowCreate(false); load(); queryClient.invalidateQueries({ queryKey: ['public-plans'] }); showToast('Plan created — click "Make Live" to publish it'); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editPlan && (
        <PlanModal
          plan={editPlan}
          onSave={() => { setEditPlan(null); load(); queryClient.invalidateQueries({ queryKey: ['public-plans'] }); showToast('Plan updated'); }}
          onClose={() => setEditPlan(null)}
        />
      )}
    </>
  );
}
