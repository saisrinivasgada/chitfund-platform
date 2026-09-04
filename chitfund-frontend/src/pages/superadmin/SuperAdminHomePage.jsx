import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  superAdminListTenants,
  superAdminListRenewalRequests,
  superAdminListUpgradeRequests,
  superAdminGetAllLimitsBulk,
  superAdminChitUsageSummary,
  superAdminMemberUsageSummary,
} from '../../services/api';
import {
  Building2, CheckCircle, Clock, XCircle, Bell, ArrowRight,
  RefreshCw, TrendingUp, Users, BarChart3, ShieldAlert,
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value ?? '—'}</p>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function SuperAdminHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tenants, renewals, upgrades, limitsBulk, chitUsage, memberUsage] = await Promise.all([
        superAdminListTenants({}).catch(() => []),
        superAdminListRenewalRequests().catch(() => []),
        superAdminListUpgradeRequests().catch(() => []),
        superAdminGetAllLimitsBulk().catch(() => []),
        superAdminChitUsageSummary().catch(() => []),
        superAdminMemberUsageSummary().catch(() => []),
      ]);

      const now = new Date();
      const renewalIds = new Set((renewals ?? []).map(r => r.id));

      const limitsMap = Object.fromEntries((limitsBulk ?? []).map(l => [l.tenantId, l]));
      const chitMap = Object.fromEntries((chitUsage ?? []).map(u => [u.tenantId, Number(u.activeCount ?? 0)]));
      const memberMap = Object.fromEntries((memberUsage ?? []).map(u => [u.tenantId, Number(u.memberCount ?? 0)]));

      const overLimit = (tenants ?? []).filter(t => {
        if (t.status !== 'ACTIVE') return false;
        const lim = limitsMap[t.id];
        if (!lim) return false;
        return (lim.maxActiveChits > 0 && (chitMap[t.id] ?? 0) > lim.maxActiveChits)
          || (lim.maxMembers > 0 && (memberMap[t.id] ?? 0) > lim.maxMembers);
      });

      const pending = (tenants ?? []).filter(t => t.status === 'PENDING');
      const expired = (tenants ?? []).filter(t =>
        t.planExpiresAt && new Date(t.planExpiresAt) < now && t.status === 'ACTIVE' && !renewalIds.has(t.id)
      );
      const expiring = (tenants ?? []).filter(t => {
        if (!t.planExpiresAt || t.status !== 'ACTIVE' || renewalIds.has(t.id)) return false;
        const d = (new Date(t.planExpiresAt) - now) / 86400000;
        return d >= 0 && d <= 14;
      });

      const totalAlerts = overLimit.length + pending.length + expired.length + expiring.length + (renewals?.length ?? 0) + (upgrades?.length ?? 0);
      const totalChits = (chitUsage ?? []).reduce((s, u) => s + Number(u.activeCount ?? 0), 0);
      const totalMembers = (memberUsage ?? []).reduce((s, u) => s + Number(u.memberCount ?? 0), 0);

      const recent = [...(tenants ?? [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setData({
        tenants: tenants ?? [],
        alerts: { total: totalAlerts, overLimit: overLimit.length, pending: pending.length, expired: expired.length, expiring: expiring.length, renewals: renewals?.length ?? 0, upgrades: upgrades?.length ?? 0 },
        totalChits,
        totalMembers,
        recent,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = data ? {
    total: data.tenants.length,
    active: data.tenants.filter(t => t.status === 'ACTIVE').length,
    pending: data.tenants.filter(t => t.status === 'PENDING').length,
    suspended: data.tenants.filter(t => t.status === 'SUSPENDED').length,
  } : {};

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Platform summary and key metrics</p>
        </div>
        <button type="button" onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#1E3A5F]/20 border-t-[#1E3A5F] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* Alert card — shown when alerts exist */}
          {data?.alerts.total > 0 && (
            <Link to="/superadmin/alerts"
              className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-2xl px-6 py-5 hover:bg-red-100/70 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Bell size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-800">
                    {data.alerts.total} alert{data.alerts.total !== 1 ? 's' : ''} need your attention
                  </p>
                  <p className="text-xs text-red-500 mt-1">
                    {[
                      data.alerts.overLimit > 0 && `${data.alerts.overLimit} over limit`,
                      data.alerts.expired > 0 && `${data.alerts.expired} expired`,
                      data.alerts.pending > 0 && `${data.alerts.pending} pending activation`,
                      data.alerts.renewals > 0 && `${data.alerts.renewals} renewal request${data.alerts.renewals !== 1 ? 's' : ''}`,
                      data.alerts.upgrades > 0 && `${data.alerts.upgrades} upgrade request${data.alerts.upgrades !== 1 ? 's' : ''}`,
                      data.alerts.expiring > 0 && `${data.alerts.expiring} expiring soon`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold group-hover:bg-red-700 transition-colors flex-shrink-0">
                View Alerts
                <ArrowRight size={14} />
              </div>
            </Link>
          )}

          {/* Org stats */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Organizations</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Building2} label="Total Orgs" value={stats.total} color="#1E3A5F" />
              <StatCard icon={CheckCircle} label="Active" value={stats.active} color="#16A34A" />
              <StatCard icon={Clock} label="Pending Activation" value={stats.pending} color="#D97706" />
              <StatCard icon={XCircle} label="Suspended" value={stats.suspended} color="#DC2626" />
            </div>
          </div>

          {/* Platform usage */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Platform Usage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={BarChart3} label="Active Chit Groups" value={data?.totalChits} color="#7C3AED" sub="Across all active orgs" />
              <StatCard icon={Users} label="Total Members" value={data?.capacity} color="#0891B2" sub="Across all active orgs" />
              <StatCard icon={TrendingUp} label="Upgrade Requests" value={data?.alerts.upgrades} color="#EA580C" sub="Pending review" />
            </div>
          </div>

          {/* Alert breakdown */}
          {data?.alerts.total > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Alert Breakdown</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {[
                  { label: 'Over Plan Limits', count: data.alerts.overLimit, color: 'text-red-600', bg: 'bg-red-50', icon: ShieldAlert },
                  { label: 'Expired Plans', count: data.alerts.expired, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
                  { label: 'Pending Activations', count: data.alerts.pending, color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
                  { label: 'Renewal Requests', count: data.alerts.renewals, color: 'text-orange-600', bg: 'bg-orange-50', icon: RefreshCw },
                  { label: 'Upgrade Requests', count: data.alerts.upgrades, color: 'text-blue-600', bg: 'bg-blue-50', icon: TrendingUp },
                  { label: 'Expiring Soon (14 days)', count: data.alerts.expiring, color: 'text-amber-600', bg: 'bg-amber-50', icon: Bell },
                ].filter(row => row.count > 0).map(({ label, count, color, bg, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-4 px-6 py-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                      <Icon size={15} className={color} />
                    </div>
                    <p className="flex-1 text-sm text-gray-700 font-medium">{label}</p>
                    <span className={`text-sm font-bold ${color}`}>{count}</span>
                  </div>
                ))}
                <div className="px-6 py-4">
                  <Link to="/superadmin/alerts"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] hover:underline">
                    Manage all alerts
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Recent orgs */}
          {data?.recent.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Recently Registered</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {data.recent.map(t => (
                  <Link key={t.id} to={`/superadmin/tenants/${t.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}>
                      {t.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1E3A5F]">{t.name}</p>
                      <p className="text-xs text-gray-400 font-mono">@{t.slug}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                        t.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                        t.status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>{t.status}</span>
                      <p className="text-xs text-gray-400 mt-1">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </Link>
                ))}
                <div className="px-6 py-4">
                  <Link to="/superadmin/tenants"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] hover:underline">
                    View all organizations
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </main>
  );
}
