import { useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  getChits, getChit,
  getDraws,
  getMembers, getEnrollments,
  getMemberBalance,
  getPayoutsByChit,
} from '../../services/api';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { BarChart2, TrendingUp, AlertTriangle, DollarSign, Users, Banknote, Calendar } from 'lucide-react';

// ─── Tabs ──────────────────────────────────────────────────────────────────
const TABS = ['Collections', 'Members', 'Payouts'];

function Tabs({ active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 gap-1">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px ${
            active === t
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#1E3A5F' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Collections Tab ───────────────────────────────────────────────────────
function CollectionsTab({ chitId }) {
  const { data: draws = [], isLoading } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
    enabled: !!chitId,
  });

  if (!chitId) return <EmptyState icon={BarChart2} title="Select a chit" message="Choose a chit fund above to view the collections report." />;
  if (isLoading) return <PageSpinner />;
  if (draws.length === 0) return <EmptyState icon={Calendar} title="No months opened" message="No collection data yet for this chit." />;

  const totalCollected = draws.reduce((s, c) => s + Number(c.totalCollected ?? 0), 0);
  const totalOutstanding = draws.reduce((s, c) => s + Number(c.totalOutstanding ?? 0), 0);
  const totalExpected = totalCollected + totalOutstanding;
  const overallPct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
  const overdueMonths = draws.filter(
    (c) => c.status === 'OPEN' && c.outstandingCount > 0 && c.dueDate && new Date(c.dueDate) < new Date()
  ).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Collected" value={`₹${totalCollected.toLocaleString()}`} color="#16A34A" />
        <StatCard icon={AlertTriangle} label="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} color="#DC2626" />
        <StatCard icon={BarChart2} label="Collection Rate" value={`${overallPct}%`} sub={`${draws.length} months total`} />
        <StatCard icon={Calendar} label="Overdue Months" value={overdueMonths} sub="past due date" color={overdueMonths > 0 ? '#DC2626' : '#16A34A'} />
      </div>

      {/* Per-month breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Monthly Breakdown</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {draws.map((c) => {
            const collected = Number(c.totalCollected ?? 0);
            const outstanding = Number(c.totalOutstanding ?? 0);
            const due = collected + outstanding;
            const pct = due > 0 ? Math.round((collected / due) * 100) : 0;
            const isOverdue = c.status === 'OPEN' && c.outstandingCount > 0 && c.dueDate && new Date(c.dueDate) < new Date();

            return (
              <div key={c.id} className="px-6 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 w-20">Month {c.monthNumber}</span>
                    <Badge variant={statusBadge(c.status)}>{c.status}</Badge>
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={10} /> Overdue
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Due {c.dueDate ? new Date(c.dueDate).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">₹{collected.toLocaleString()}</span>
                    <span className="text-xs text-gray-400"> / ₹{due.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{
                      width: `${pct}%`,
                      backgroundColor: pct === 100 ? '#16A34A' : isOverdue ? '#DC2626' : '#1E3A5F',
                    }} />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                </div>
                <div className="flex gap-6 mt-2 text-xs text-gray-400">
                  <span><span className="font-medium text-green-700">{c.settledCount}</span> settled</span>
                  <span><span className="font-medium text-amber-600">{c.partiallyPaidCount}</span> partial</span>
                  <span><span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>{c.outstandingCount}</span> outstanding</span>
                  {c.waivedCount > 0 && <span><span className="font-medium text-gray-400">{c.waivedCount}</span> waived</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Members Tab ───────────────────────────────────────────────────────────
function MembersTab({ chitId }) {
  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
    enabled: !!chitId,
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m]));

  const balanceQueries = useQueries({
    queries: enrollments.map((e) => ({
      queryKey: ['balance', e.memberId, chitId],
      queryFn: () => getMemberBalance({ memberId: e.memberId, chitId }),
      enabled: !!chitId && !!e.memberId,
    })),
  });

  if (!chitId) return <EmptyState icon={Users} title="Select a chit" message="Choose a chit fund above to view member balances." />;
  if (loadingEnrollments) return <PageSpinner />;
  if (enrollments.length === 0) return <EmptyState icon={Users} title="No members enrolled" message="Enroll members to this chit first." />;

  const rows = enrollments.map((e, i) => {
    const member = memberMap[e.memberId] ?? {};
    const balance = balanceQueries[i]?.data;
    return { member, balance, memberId: e.memberId };
  });

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.balance?.totalOutstanding ?? 0), 0);
  const defaulters = rows.filter((r) => Number(r.balance?.totalOutstanding ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Members" value={enrollments.length} />
        <StatCard icon={AlertTriangle} label="With Outstanding" value={defaulters} color={defaulters > 0 ? '#DC2626' : '#16A34A'} />
        <StatCard icon={DollarSign} label="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} color="#DC2626" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <Table columns={['Member', 'Phone', 'Outstanding Balance', 'Months Unpaid', 'Status']}>
          {rows.map(({ member, balance, memberId }) => {
            const outstanding = Number(balance?.totalOutstanding ?? 0);
            const unpaidMonths = balance?.months?.length ?? 0;
            return (
              <Tr key={memberId}>
                <Td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1E3A5F' }}>
                      {(member.fullName ?? '?')[0].toUpperCase()}
                    </div>
                    {member.fullName ?? `Member #${memberId?.slice(0, 8)}`}
                  </div>
                </Td>
                <Td>{member.phone ?? '—'}</Td>
                <Td>
                  <span className={`font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {outstanding > 0 ? `₹${outstanding.toLocaleString()}` : '✓ Clear'}
                  </span>
                </Td>
                <Td>{unpaidMonths > 0 ? <span className="text-red-600 font-medium">{unpaidMonths}</span> : <span className="text-green-700">0</span>}</Td>
                <Td>
                  <Badge variant={outstanding > 0 ? 'danger' : 'success'}>
                    {outstanding > 0 ? 'Outstanding' : 'Settled'}
                  </Badge>
                </Td>
              </Tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

// ─── Payouts Tab ───────────────────────────────────────────────────────────
function PayoutsTab({ chitId }) {
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['payouts-chit', chitId],
    queryFn: () => getPayoutsByChit(chitId),
    enabled: !!chitId,
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m]));

  if (!chitId) return <EmptyState icon={Banknote} title="Select a chit" message="Choose a chit fund above to view payouts." />;
  if (isLoading) return <PageSpinner />;
  if (payouts.length === 0) return <EmptyState icon={Banknote} title="No payouts yet" message="No payouts have been created for this chit." />;

  const totalDisbursed = payouts.filter((p) => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);
  const totalPending = payouts.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Banknote} label="Total Disbursed" value={`₹${totalDisbursed.toLocaleString()}`} color="#16A34A" />
        <StatCard icon={DollarSign} label="Pending Payouts" value={`₹${totalPending.toLocaleString()}`} color="#D4A017" />
        <StatCard icon={TrendingUp} label="Total Payouts" value={payouts.length} sub={`${payouts.filter(p => p.status === 'DISBURSED').length} disbursed`} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <Table columns={['Month', 'Winner', 'Winning Amt', 'Discount', 'Net Payout', 'Mode', 'Reference', 'Status']}>
          {payouts.map((p) => {
            const member = memberMap[p.memberId] ?? {};
            return (
              <Tr key={p.id}>
                <Td className="font-semibold">Month {p.monthNumber}</Td>
                <Td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1E3A5F' }}>
                      {(member.fullName ?? '?')[0].toUpperCase()}
                    </div>
                    {member.fullName ?? `#${p.memberId?.slice(0, 8)}`}
                  </div>
                </Td>
                <Td>₹{Number(p.winningAmount ?? 0).toLocaleString()}</Td>
                <Td>{p.discountAmount ? `₹${Number(p.discountAmount).toLocaleString()}` : '—'}</Td>
                <Td className="font-semibold text-green-700">₹{Number(p.netPayoutAmount ?? 0).toLocaleString()}</Td>
                <Td>{p.disbursementMode ?? '—'}</Td>
                <Td className="text-xs text-gray-500 font-mono">{p.referenceNumber ?? '—'}</Td>
                <Td><Badge variant={statusBadge(p.status)}>{p.status}</Badge></Td>
              </Tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('Collections');
  const [chitId, setChitId] = useState('');

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: chit } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    enabled: !!chitId,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Reports
          </h2>
          <p className="text-sm text-gray-500 mt-1">Collections, member balances, and payout summaries.</p>
        </div>

        {/* Chit selector */}
        <Select
          value={chitId}
          onChange={(e) => setChitId(e.target.value)}
          className="min-w-[220px] shadow-sm"
        >
          <option value="">— Select a chit fund —</option>
          {chits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.status})
            </option>
          ))}
        </Select>
      </div>

      {/* Chit summary strip */}
      {chit && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Installment', `₹${chit.installmentAmount?.toLocaleString()}`],
            ['Total Value', `₹${((chit.totalAmount ?? (chit.installmentAmount * chit.totalMembers)) || 0).toLocaleString()}`],
            ['Members', chit.totalMembers],
            ['Status', <Badge key="s" variant={statusBadge(chit.status)}>{chit.status}</Badge>],
          ].map(([label, val]) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + content */}
      <div className="space-y-5">
        <Tabs active={activeTab} onChange={setActiveTab} />
        {activeTab === 'Collections' && <CollectionsTab chitId={chitId} />}
        {activeTab === 'Members' && <MembersTab chitId={chitId} />}
        {activeTab === 'Payouts' && <PayoutsTab chitId={chitId} />}
      </div>
    </div>
  );
}
