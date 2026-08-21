import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  superAdminListTenants,
  superAdminListRenewalRequests,
  superAdminListUpgradeRequests,
  superAdminActivateTenant,
  superAdminGetAllLimitsBulk,
  superAdminChitUsageSummary,
  superAdminMemberUsageSummary,
  superAdminResumeTenant,
} from '../../services/api';
import {
  RotateCw, TrendingUp, ArrowRight, CheckCircle, Clock,
  RefreshCw, ExternalLink, XCircle, Bell, ShieldAlert, CalendarX,
} from 'lucide-react';
import RecordOrgPaymentModal from '../../components/superadmin/RecordOrgPaymentModal';

const PRIORITY = { OVER_LIMIT: 0, EXPIRED: 1, PENDING: 2, CANCELLATION: 3, RENEWAL: 4, UPGRADE: 5, EXPIRING: 6 };

const TYPE_META = {
  OVER_LIMIT:   { label: 'Over Limit',     dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-100',          icon: ShieldAlert },
  EXPIRED:      { label: 'Expired',        dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-100',          icon: XCircle },
  PENDING:      { label: 'Pending',        dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-100',    icon: Bell },
  CANCELLATION: { label: 'Cancel Pending', dot: 'bg-rose-400',   badge: 'bg-rose-50 text-rose-700 border-rose-100',       icon: CalendarX },
  RENEWAL:      { label: 'Renewal Req',    dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-100', icon: RotateCw },
  UPGRADE:      { label: 'Upgrade Req',    dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-100',       icon: TrendingUp },
  EXPIRING:     { label: 'Expiring Soon',  dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-100',    icon: Clock },
};

function OrgAvatar({ name }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
      style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

function TypeBadge({ type }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${m.badge}`}>
      <Icon size={11} />
      {m.label}
    </span>
  );
}

export default function SuperAdminAlertsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [upgradeRequests, setUpgradeRequests] = useState([]);
  const [overLimitOrgs, setOverLimitOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [billingTarget, setBillingTarget] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, renewals, upgrades, limitsBulk, chitUsage, memberUsage] = await Promise.all([
        superAdminListTenants({}),
        superAdminListRenewalRequests(),
        superAdminListUpgradeRequests(),
        superAdminGetAllLimitsBulk().catch(() => []),
        superAdminChitUsageSummary().catch(() => []),
        superAdminMemberUsageSummary().catch(() => []),
      ]);
      setTenants(Array.isArray(all) ? all : []);
      setRenewalRequests(Array.isArray(renewals) ? renewals : []);
      setUpgradeRequests(Array.isArray(upgrades) ? upgrades : []);

      const limitsMap = Object.fromEntries((limitsBulk ?? []).map(l => [l.tenantId, l]));
      const chitMap = Object.fromEntries((chitUsage ?? []).map(u => [u.tenantId, Number(u.activeCount ?? 0)]));
      const memberMap = Object.fromEntries((memberUsage ?? []).map(u => [u.tenantId, Number(u.memberCount ?? 0)]));

      const violations = (Array.isArray(all) ? all : [])
        .filter(t => t.status === 'ACTIVE')
        .flatMap(t => {
          const lim = limitsMap[t.id];
          if (!lim) return [];
          const v = [];
          if (lim.maxActiveChits > 0 && (chitMap[t.id] ?? 0) > lim.maxActiveChits)
            v.push({ type: 'Chits', current: chitMap[t.id], limit: lim.maxActiveChits });
          if (lim.maxMembers > 0 && (memberMap[t.id] ?? 0) > lim.maxMembers)
            v.push({ type: 'Members', current: memberMap[t.id], limit: lim.maxMembers });
          if (v.length === 0) return [];
          return [{ tenant: t, violations: v }];
        });
      setOverLimitOrgs(violations);
    } catch {
      showToast('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openBilling(tenant, type, toPlan, afterSave) {
    setBillingTarget({ tenant, type, toPlan, afterSave });
  }

  async function handleBillingSuccess() {
    try {
      if (billingTarget?.afterSave) await billingTarget.afterSave();
    } catch (err) {
      showToast(err?.response?.data?.message ?? 'Post-payment action failed');
    }
    setBillingTarget(null);
    load();
  }

  const now = new Date();
  const renewalIds = new Set(renewalRequests.map(r => r.id));

  const pendingActivations = tenants.filter(t => t.status === 'PENDING');
  const cancellationPending = tenants.filter(t => t.cancellationRequestedAt);
  const expiredOrgs = tenants.filter(t => {
    if (!t.planExpiresAt || t.status !== 'ACTIVE') return false;
    return new Date(t.planExpiresAt) < now && !renewalIds.has(t.id);
  });
  const expiringSoon = tenants.filter(t => {
    if (!t.planExpiresAt || t.status !== 'ACTIVE') return false;
    const daysLeft = (new Date(t.planExpiresAt) - now) / 86400000;
    return daysLeft >= 0 && daysLeft <= 14 && !renewalIds.has(t.id);
  });

  // Build a flat priority-sorted alert list
  const alertItems = [
    ...overLimitOrgs.map(({ tenant: t, violations }) => ({
      id: `ol-${t.id}`, type: 'OVER_LIMIT', priority: PRIORITY.OVER_LIMIT, tenant: t,
      detail: violations.map(v => `${v.type}: ${v.current}/${v.limit} (+${v.current - v.limit})`).join('  ·  '),
      actions: (
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <Link to={`/superadmin/tenants/${t.id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E3A5F] text-white text-xs font-semibold hover:bg-[#162d4a] transition-colors">
            <ExternalLink size={11} />Set Limits
          </Link>
          <button type="button"
            onClick={() => openBilling(t, 'RENEWAL', t.plan ?? 'BASIC', () => showToast(`Plan renewed for ${t.name}`))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer transition-colors">
            <ArrowRight size={11} />Upgrade
          </button>
        </div>
      ),
    })),
    ...expiredOrgs.map(t => ({
      id: `ex-${t.id}`, type: 'EXPIRED', priority: PRIORITY.EXPIRED, tenant: t,
      detail: `Expired ${new Date(t.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}  ·  ${t.plan} plan`,
      actions: (
        <button type="button"
          onClick={e => { e.stopPropagation(); openBilling(t, 'RENEWAL', t.plan ?? 'BASIC', () => showToast(`${t.name} plan renewed`)); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer transition-colors flex-shrink-0">
          <RotateCw size={11} />Renew
        </button>
      ),
    })),
    ...pendingActivations.map(t => ({
      id: `pa-${t.id}`, type: 'PENDING', priority: PRIORITY.PENDING, tenant: t,
      detail: `Registered ${t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}${t.contactEmail ? `  ·  ${t.contactEmail}` : ''}`,
      actions: (
        <button type="button"
          onClick={e => { e.stopPropagation(); openBilling(t, 'PURCHASE', t.plan ?? 'BASIC', async () => {
            await superAdminActivateTenant(t.id);
            showToast(`${t.name} activated`);
          }); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer transition-colors flex-shrink-0">
          <CheckCircle size={11} />Activate
        </button>
      ),
    })),
    ...cancellationPending.map(t => ({
      id: `cp-${t.id}`, type: 'CANCELLATION', priority: PRIORITY.CANCELLATION, tenant: t,
      detail: [
        t.plan && `${t.plan} plan`,
        t.planExpiresAt && `Access until ${new Date(t.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        t.cancellationRequestedAt && `Requested ${new Date(t.cancellationRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      ].filter(Boolean).join('  ·  '),
      actions: (
        <button type="button"
          onClick={async e => {
            e.stopPropagation();
            try {
              await superAdminResumeTenant(t.id);
              showToast(`${t.name} cancellation reversed`);
              load();
            } catch (err) {
              showToast(err?.response?.data?.message ?? 'Failed to resume');
            }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer transition-colors flex-shrink-0">
          <RotateCw size={11} />Resume
        </button>
      ),
    })),
    ...renewalRequests.map(t => ({
      id: `rr-${t.id}`, type: 'RENEWAL', priority: PRIORITY.RENEWAL, tenant: t,
      detail: [
        t.plan && `${t.plan} plan`,
        t.planExpiresAt && `Expires ${new Date(t.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        t.renewalRequestedAt && `Requested ${new Date(t.renewalRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      ].filter(Boolean).join('  ·  '),
      actions: (
        <button type="button"
          onClick={e => { e.stopPropagation(); openBilling(t, 'RENEWAL', t.plan ?? 'BASIC', () => showToast(`${t.name} plan renewed`)); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 cursor-pointer transition-colors flex-shrink-0">
          <CheckCircle size={11} />Collect &amp; Renew
        </button>
      ),
    })),
    ...upgradeRequests.map(t => ({
      id: `ur-${t.id}`, type: 'UPGRADE', priority: PRIORITY.UPGRADE, tenant: t,
      detail: [
        `${t.plan} → ${t.requestedPlan}`,
        t.upgradeRequestedAt && `Requested ${new Date(t.upgradeRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      ].filter(Boolean).join('  ·  '),
      actions: (
        <button type="button"
          onClick={e => { e.stopPropagation(); openBilling(t, 'UPGRADE', t.requestedPlan, () => showToast(`${t.name} upgraded to ${t.requestedPlan}`)); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer transition-colors flex-shrink-0">
          <CheckCircle size={11} />Collect &amp; Upgrade
        </button>
      ),
    })),
    ...expiringSoon.map(t => {
      const daysLeft = Math.ceil((new Date(t.planExpiresAt) - now) / 86400000);
      return {
        id: `es-${t.id}`, type: 'EXPIRING', priority: PRIORITY.EXPIRING, tenant: t,
        detail: `${daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}  ·  ${new Date(t.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}  ·  ${t.plan} plan`,
        actions: (
          <button type="button"
            onClick={e => { e.stopPropagation(); openBilling(t, 'RENEWAL', t.plan ?? 'BASIC', () => showToast(`${t.name} plan renewed`)); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 cursor-pointer transition-colors flex-shrink-0">
            <RotateCw size={11} />Renew
          </button>
        ),
      };
    }),
  ].sort((a, b) => a.priority - b.priority);

  const pillDefs = [
    { label: 'Over Limit',    type: 'OVER_LIMIT',   count: overLimitOrgs.length },
    { label: 'Expired',       type: 'EXPIRED',       count: expiredOrgs.length },
    { label: 'Pending',       type: 'PENDING',       count: pendingActivations.length },
    { label: 'Cancellations', type: 'CANCELLATION',  count: cancellationPending.length },
    { label: 'Renewals',      type: 'RENEWAL',       count: renewalRequests.length },
    { label: 'Upgrades',      type: 'UPGRADE',       count: upgradeRequests.length },
    { label: 'Expiring',      type: 'EXPIRING',      count: expiringSoon.length },
  ].filter(p => p.count > 0);

  const visibleAlerts = activeFilter ? alertItems.filter(i => i.type === activeFilter) : alertItems;
  const totalAlerts = alertItems.length;

  return (
    <>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Alerts</h1>
            <p className="text-sm text-gray-500 mt-1">
              {!loading && (totalAlerts > 0
                ? <><span className="text-red-600 font-medium">{visibleAlerts.length}{activeFilter ? ` of ${totalAlerts}` : ''} item{visibleAlerts.length !== 1 ? 's' : ''}</span> need your attention</>
                : 'All orgs are up to date — no alerts')}
            </p>
          </div>
          <button type="button" onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1E3A5F]/20 border-t-[#1E3A5F] rounded-full animate-spin" />
          </div>
        ) : totalAlerts === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-500" />
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">All clear</p>
            <p className="text-sm text-gray-400">No alerts — all orgs are up to date.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Category summary pills — click to filter, click again to clear */}
            <div className="px-6 py-4 border-b border-gray-50 flex flex-wrap gap-2">
              {pillDefs.map(({ label, type, count }) => {
                const active = activeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveFilter(active ? null : type)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors cursor-pointer
                      ${active
                        ? 'bg-[#1E3A5F] text-white ring-2 ring-[#1E3A5F]/30'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {label}
                    <span className={`rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center text-[10px] font-bold px-1
                      ${active ? 'bg-white/20 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
              {activeFilter && (
                <button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 cursor-pointer">
                  ✕ Clear filter
                </button>
              )}
            </div>

            {/* Alert rows */}
            <div className="divide-y divide-gray-50">
              {visibleAlerts.map(item => (
                <div key={item.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/superadmin/tenants/${item.tenant.id}`)}>
                  {/* Priority dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_META[item.type].dot}`} />

                  {/* Org avatar */}
                  <OrgAvatar name={item.tenant.name} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {item.tenant.name}
                      </span>
                      <TypeBadge type={item.type} />
                    </div>
                    <p className="text-xs text-gray-400 truncate">{item.detail}</p>
                  </div>

                  {/* Action(s) */}
                  {item.actions}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {billingTarget && (
        <RecordOrgPaymentModal
          tenant={billingTarget.tenant}
          type={billingTarget.type}
          toPlan={billingTarget.toPlan}
          onClose={() => setBillingTarget(null)}
          onSuccess={handleBillingSuccess}
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
