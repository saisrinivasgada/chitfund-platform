import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getChits, getMembers,
  getAllPaymentBatches, getAllPayouts,
} from '../../services/api';
import Button from '../../components/ui/Button';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { Input, Select } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  BarChart2, TrendingUp, AlertTriangle, DollarSign,
  Users, Banknote, Download, Filter, ExternalLink, Printer,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmt     = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today      = () => new Date().toISOString().slice(0, 10);
const daysAgo    = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const lastMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};

const PRESETS = [
  { label: 'Today',      get: () => ({ from: today(),      to: today() }) },
  { label: 'Last 7 days',get: () => ({ from: daysAgo(6),   to: today() }) },
  { label: 'This Month', get: () => ({ from: monthStart(), to: today() }) },
  { label: 'Last Month', get: () => lastMonthRange() },
  { label: 'All Time',   get: () => ({ from: '', to: '' }) },
];

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

// ─── Date Range Bar ─────────────────────────────────────────────────────────
function DateRangeBar({ from, to, onFromChange, onToChange, activePreset, onPreset }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => onPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activePreset === p.label
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Filter size={14} className="text-gray-400" />
          <Input type="date" value={from} max={to || today()}
            onChange={(e) => onFromChange(e.target.value)} />
          <span className="text-gray-400 text-sm">to</span>
          <Input type="date" value={to} min={from} max={today()}
            onChange={(e) => onToChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Payments', 'Payouts', 'Members', 'Chit-wise'];

function Tabs({ active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 gap-1 overflow-x-auto">
      {TABS.map((t) => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
            active === t
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────
function OverviewTab({ batches, payouts, chits, members }) {
  const totalCollected = batches.filter((b) => b.status === 'COMPLETED').reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const totalVoided    = batches.filter((b) => b.status === 'VOIDED').reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const cashAwaiting   = batches.filter((b) => b.status === 'AWAITING_REMITTANCE').reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const totalDisbursed = payouts.filter((p) => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);
  const pendingPayouts = payouts.filter((p) => ['PENDING', 'PARTIALLY_DISBURSED'].includes(p.status)).reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);
  const activeChits    = chits.filter((c) => c.status === 'ACTIVE').length;

  const modeBreakdown = batches.filter((b) => b.status === 'COMPLETED').reduce((acc, b) => {
    acc[b.paymentMode] = (acc[b.paymentMode] ?? 0) + Number(b.totalAmount ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={TrendingUp}    label="Total Collected"  value={fmt(totalCollected)} sub={`${batches.filter(b => b.status === 'COMPLETED').length} transactions`}  color="#16A34A" />
        <StatCard icon={Banknote}      label="Total Disbursed"  value={fmt(totalDisbursed)} sub={`${payouts.filter(p => p.status === 'DISBURSED').length} payouts`}          color="#1E3A5F" />
        <StatCard icon={AlertTriangle} label="Pending Payouts"  value={fmt(pendingPayouts)} sub={`${payouts.filter(p => ['PENDING','PARTIALLY_DISBURSED'].includes(p.status)).length} payouts`} color="#D97706" />
        <StatCard icon={DollarSign}    label="Cash in Transit"  value={fmt(cashAwaiting)}   sub="awaiting remittance"                                                        color="#7C3AED" />
        <StatCard icon={BarChart2}     label="Voided"           value={fmt(totalVoided)}    sub={`${batches.filter(b => b.status === 'VOIDED').length} transactions`}         color="#DC2626" />
        <StatCard icon={Users}         label="Members"          value={members.length}      sub={`${activeChits} active chits`} />
      </div>

      {Object.keys(modeBreakdown).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Collections by Payment Mode</h3>
          <div className="space-y-3">
            {Object.entries(modeBreakdown).sort(([, a], [, b]) => b - a).map(([mode, amount]) => {
              const pct = totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0;
              return (
                <div key={mode}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{mode}</span>
                    <span className="text-gray-500">{fmt(amount)} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-[#1E3A5F]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {batches.length === 0 && payouts.length === 0 && (
        <EmptyState icon={BarChart2} title="No data in range" message="Try adjusting your date range or selecting All Time." />
      )}
    </div>
  );
}

// ─── Payments Tab ──────────────────────────────────────────────────────────
function PaymentsTab({ batches, members, chits, filterChitId, onFilterChit, filterMemberId, onFilterMember }) {
  const navigate = useNavigate();
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const chitMap   = Object.fromEntries(chits.map((c) => [c.id, c]));

  // Client-side member filter on top of API-side date+chit filter
  const displayBatches = useMemo(() => (
    filterMemberId
      ? batches.filter((b) => String(b.memberId) === String(filterMemberId))
      : batches
  ), [batches, filterMemberId]);

  const totalCollected = displayBatches.filter(b => b.status === 'COMPLETED').reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const txCount        = displayBatches.filter(b => b.status === 'COMPLETED').length;

  function exportCSV() {
    const rows = [
      ['Date', 'Member', 'Chit', 'Amount', 'Mode', 'Status'],
      ...displayBatches.map((b) => [
        fmtDate(b.createdAt),
        memberMap[b.memberId]?.fullName ?? b.memberId,
        chitMap[b.chitId]?.name ?? b.chitId,
        b.totalAmount,
        b.paymentMode,
        b.status,
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `payments-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp}    label="Collected"           value={fmt(totalCollected)} color="#16A34A" />
        <StatCard icon={BarChart2}     label="Transactions"        value={txCount} />
        <StatCard icon={AlertTriangle} label="Awaiting Remittance" value={displayBatches.filter(b => b.status === 'AWAITING_REMITTANCE').length} color="#D97706" />
        <StatCard icon={DollarSign}    label="Voided"              value={displayBatches.filter(b => b.status === 'VOIDED').length} color="#DC2626" />
      </div>

      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterChitId} onChange={(e) => onFilterChit(e.target.value)}>
          <option value="">All Chits</option>
          {chits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>

        <Select value={filterMemberId} onChange={(e) => onFilterMember(e.target.value)}>
          <option value="">All Members</option>
          {[...members].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '')).map((m) => (
            <option key={m.id} value={m.id}>{m.fullName}</option>
          ))}
        </Select>

        <span className="text-sm text-gray-400">{displayBatches.length} records</span>

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      {displayBatches.length === 0
        ? <EmptyState icon={TrendingUp} title="No payments" message="No payments found for the selected filters." />
        : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <Table columns={['Date', 'Member', 'Chit', 'Amount', 'Mode', 'Status', '']}>
              {displayBatches.map((b) => {
                const member = memberMap[b.memberId] ?? {};
                const chit   = chitMap[b.chitId]   ?? {};
                return (
                  <Tr key={b.id} onClick={() => navigate(`/transactions/${b.id}`)}
                    className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                    <Td className="text-gray-500 text-xs">{fmtDate(b.createdAt)}</Td>
                    <Td className="font-medium">{member.fullName ?? `#${String(b.memberId).slice(0, 8)}`}</Td>
                    <Td className="text-gray-600 text-sm">{chit.name ?? '—'}</Td>
                    <Td className="font-semibold">{fmt(b.totalAmount)}</Td>
                    <Td><span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b.paymentMode}</span></Td>
                    <Td><Badge variant={statusBadge(b.status)}>{b.status}</Badge></Td>
                    <Td><ExternalLink size={14} className="text-gray-300" /></Td>
                  </Tr>
                );
              })}
            </Table>
          </div>
        )}
    </div>
  );
}

// ─── Payouts Tab ──────────────────────────────────────────────────────────
// Fetches payouts independently (no date restriction) so records created in
// prior months still show. Has its own chit filter separate from Payments.
function PayoutsTab({ members, chits }) {
  const [filterChitId, setFilterChitId] = useState('');
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const chitMap   = Object.fromEntries(chits.map((c) => [c.id, c]));

  const { data: singleChitPayouts = [], isLoading: singleLoading } = useQuery({
    queryKey: ['report-payouts-chit', filterChitId],
    queryFn: () => getAllPayouts({ chitId: filterChitId }),
    enabled: !!filterChitId,
  });

  const { data: allPayoutsRaw = [], isLoading: allLoading } = useQuery({
    queryKey: ['report-payouts-all'],
    queryFn: () => getAllPayouts({}),
    enabled: !filterChitId,
  });

  const payouts   = filterChitId ? singleChitPayouts : allPayoutsRaw;
  const isLoading = filterChitId ? singleLoading     : allLoading;

  const totalDisbursed = payouts.filter(p => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);
  const totalPending   = payouts.filter(p => ['PENDING', 'PARTIALLY_DISBURSED'].includes(p.status)).reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);

  function exportCSV() {
    const rows = [
      ['Date', 'Winner', 'Chit', 'Month', 'Winning Amt', 'Adjusted', 'Net Payout', 'Disbursed', 'Status'],
      ...payouts.map((p) => [
        fmtDate(p.createdAt),
        memberMap[p.memberId]?.fullName ?? p.memberId,
        chitMap[p.chitId]?.name ?? p.chitId,
        `M${p.monthNumber}`,
        p.winningAmount,
        p.discountAmount ?? 0,
        p.netPayoutAmount,
        p.disbursedAmount ?? 0,
        p.status,
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'payouts-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Banknote}  label="Disbursed"       value={fmt(totalDisbursed)} color="#16A34A" />
        <StatCard icon={DollarSign}label="Pending"         value={fmt(totalPending)}   color="#D97706" />
        <StatCard icon={BarChart2} label="Total Payouts"   value={payouts.length} />
        <StatCard icon={TrendingUp}label="Disbursed Count" value={payouts.filter(p => p.status === 'DISBURSED').length} color="#1E3A5F" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterChitId} onChange={(e) => setFilterChitId(e.target.value)}>
          <option value="">All Chits</option>
          {chits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <span className="text-sm text-gray-400">{payouts.length} records</span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      {isLoading ? <PageSpinner /> : payouts.length === 0
        ? <EmptyState icon={Banknote} title="No payouts found" message="No payouts recorded." />
        : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <Table columns={['Date', 'Winner', 'Chit', 'Month', 'Winning Amt', 'Adjusted', 'Net Payout', 'Disbursed', 'Status']}>
              {payouts.map((p) => {
                const member = memberMap[p.memberId] ?? {};
                const chit   = chitMap[p.chitId]   ?? {};
                return (
                  <Tr key={p.id}>
                    <Td className="text-gray-500 text-xs">{fmtDate(p.createdAt)}</Td>
                    <Td className="font-medium">{member.fullName ?? `#${String(p.memberId).slice(0, 8)}`}</Td>
                    <Td className="text-gray-600 text-sm">{chit.name ?? '—'}</Td>
                    <Td className="font-semibold text-center">M{p.monthNumber}</Td>
                    <Td>{fmt(p.winningAmount)}</Td>
                    <Td className="text-red-600">{Number(p.discountAmount ?? 0) > 0 ? `-${fmt(p.discountAmount)}` : '—'}</Td>
                    <Td className="font-semibold text-green-700">{fmt(p.netPayoutAmount)}</Td>
                    <Td>{Number(p.disbursedAmount ?? 0) > 0 ? fmt(p.disbursedAmount) : '—'}</Td>
                    <Td><Badge variant={statusBadge(p.status)}>{p.status}</Badge></Td>
                  </Tr>
                );
              })}
            </Table>
          </div>
        )}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────
function MembersTab({ members, batches }) {
  const [sortBy, setSortBy] = useState('name');

  const memberStats = useMemo(() => {
    const stats = {};
    members.forEach((m) => { stats[m.id] = { member: m, paid: 0, txCount: 0, voided: 0 }; });
    batches.forEach((b) => {
      if (!stats[b.memberId]) return;
      if (b.status === 'COMPLETED') { stats[b.memberId].paid += Number(b.totalAmount ?? 0); stats[b.memberId].txCount++; }
      if (b.status === 'VOIDED')    { stats[b.memberId].voided += Number(b.totalAmount ?? 0); }
    });
    return Object.values(stats);
  }, [members, batches]);

  const sorted = [...memberStats].sort((a, b) => {
    if (sortBy === 'paid') return b.paid - a.paid;
    if (sortBy === 'tx')   return b.txCount - a.txCount;
    return (a.member.fullName ?? '').localeCompare(b.member.fullName ?? '');
  });

  const totalPaid     = memberStats.reduce((s, m) => s + m.paid, 0);
  const activeMembers = memberStats.filter((m) => m.txCount > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users}     label="Total Members"   value={members.length} />
        <StatCard icon={TrendingUp}label="Paid in Range"   value={activeMembers} sub="members with payments" color="#16A34A" />
        <StatCard icon={DollarSign}label="Total Collected" value={fmt(totalPaid)} color="#1E3A5F" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Sort by:</span>
        {[['name', 'Name'], ['paid', 'Amount Paid'], ['tx', 'Transactions']].map(([val, label]) => (
          <button key={val} onClick={() => setSortBy(val)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              sortBy === val ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <Table columns={['Member', 'Phone', 'Paid (Range)', 'Transactions', 'Voided']}>
          {sorted.map(({ member, paid, txCount, voided }) => (
            <Tr key={member.id}>
              <Td className="font-medium">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: '#1E3A5F' }}>
                    {(member.fullName ?? '?')[0].toUpperCase()}
                  </div>
                  {member.fullName}
                </div>
              </Td>
              <Td className="text-gray-500">{member.phone ?? '—'}</Td>
              <Td>
                <span className={`font-semibold ${paid > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                  {paid > 0 ? fmt(paid) : '—'}
                </span>
              </Td>
              <Td>{txCount > 0 ? <span className="text-[#1E3A5F] font-medium">{txCount}</span> : <span className="text-gray-300">0</span>}</Td>
              <Td>{voided > 0 ? <span className="text-red-500 text-sm">{fmt(voided)}</span> : <span className="text-gray-300">—</span>}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

// ─── Chit-wise Tab ─────────────────────────────────────────────────────────
// Shows chits filtered by status. COMPLETED and PAUSED chits are now visible.
function ChitwiseTab({ chits, batches, payouts }) {
  const [showStatus, setShowStatus] = useState('ACTIVE');

  const STATUS_FILTERS = [
    { key: 'ACTIVE',    label: 'Active' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'PAUSED',    label: 'Paused' },
    { key: 'ALL',       label: 'All' },
  ];

  const chitStats = useMemo(() => {
    const filtered = showStatus === 'ALL'
      ? chits
      : chits.filter((c) => c.status === showStatus);

    return filtered.map((chit) => {
      const chitBatches = batches.filter((b) => b.chitId === chit.id);
      const chitPayouts = payouts.filter((p) => p.chitId === chit.id);

      const collected    = chitBatches.filter(b => b.status === 'COMPLETED').reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
      const disbursed    = chitPayouts.filter(p => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);
      const pendingPayout= chitPayouts.filter(p => ['PENDING', 'PARTIALLY_DISBURSED'].includes(p.status)).reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);
      const txCount      = chitBatches.filter(b => b.status === 'COMPLETED').length;
      const payoutCount  = chitPayouts.filter(p => p.status === 'DISBURSED').length;

      return { chit, collected, disbursed, pendingPayout, txCount, payoutCount };
    });
  }, [chits, batches, payouts, showStatus]);

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setShowStatus(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showStatus === key ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
        <span className="text-sm text-gray-400 self-center ml-2">{chitStats.length} chit{chitStats.length !== 1 ? 's' : ''}</span>
      </div>

      {chitStats.length === 0 ? (
        <EmptyState icon={BarChart2} title={`No ${showStatus.toLowerCase()} chits`}
          message="Try a different status filter." />
      ) : (
        chitStats.map(({ chit, collected, disbursed, pendingPayout, txCount, payoutCount }) => (
          <div key={chit.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{chit.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {chit.totalMembers} members · {fmt(chit.installmentAmount)}/month
                  {txCount > 0 ? ` · ${txCount} transactions in range` : ' · no transactions in range'}
                </p>
              </div>
              <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Collected',     fmt(collected),    '#16A34A'],
                ['Disbursed',     fmt(disbursed),    '#1E3A5F'],
                ['Pending Payout',fmt(pendingPayout),'#D97706'],
                ['Payouts Done',  payoutCount,       '#6B7280'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-base font-bold mt-0.5" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'Overview';
  const setActiveTab = (tab) => { const p = new URLSearchParams(searchParams); p.set('tab', tab); setSearchParams(p, { replace: true }); };
  const [from,           setFrom]           = useState(monthStart());
  const [to,             setTo]             = useState(today());
  const [activePreset,   setActivePreset]   = useState('This Month');
  const [filterChitId,   setFilterChitId]   = useState('');
  const [filterMemberId, setFilterMemberId] = useState('');

  const handlePreset = (preset) => {
    const range = preset.get();
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(preset.label);
  };

  const dateParams = useMemo(() => ({
    fromDate: from  || undefined,
    toDate:   to    || undefined,
    chitId:   filterChitId || undefined,
  }), [from, to, filterChitId]);

  const { data: chits   = [] } = useQuery({ queryKey: ['chits'],   queryFn: getChits });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const { data: batches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ['report-batches', dateParams],
    queryFn:  () => getAllPaymentBatches(dateParams),
  });

  // Overview needs date-filtered payouts for period stats.
  // PayoutsTab fetches independently without date constraint.
  const { data: payouts = [], isLoading: loadingPayouts } = useQuery({
    queryKey: ['report-payouts-overview', dateParams],
    queryFn:  () => getAllPayouts(dateParams),
  });

  const isLoading = loadingBatches || loadingPayouts;

  const rangeLabel = from && to
    ? `${fmtDate(from)} – ${fmtDate(to)}`
    : from ? `From ${fmtDate(from)}` : to ? `Until ${fmtDate(to)}` : 'All Time';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Reports
        </h2>
        <p className="text-sm text-gray-500 mt-1">{rangeLabel}</p>
      </div>

      {/* Date range bar */}
      <DateRangeBar
        from={from} to={to}
        onFromChange={(v) => { setFrom(v); setActivePreset(''); }}
        onToChange={(v)   => { setTo(v);   setActivePreset(''); }}
        activePreset={activePreset}
        onPreset={handlePreset}
      />

      {/* Tabs */}
      <div className="space-y-5">
        <Tabs active={activeTab} onChange={setActiveTab} />

        {isLoading ? <PageSpinner /> : (
          <>
            {activeTab === 'Overview' && (
              <OverviewTab batches={batches} payouts={payouts} chits={chits} members={members} />
            )}
            {activeTab === 'Payments' && (
              <PaymentsTab
                batches={batches} members={members} chits={chits}
                filterChitId={filterChitId} onFilterChit={setFilterChitId}
                filterMemberId={filterMemberId} onFilterMember={setFilterMemberId}
              />
            )}
            {activeTab === 'Payouts' && (
              <PayoutsTab members={members} chits={chits} />
            )}
            {activeTab === 'Members' && (
              <MembersTab members={members} batches={batches} />
            )}
            {activeTab === 'Chit-wise' && (
              <ChitwiseTab chits={chits} batches={batches} payouts={payouts} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
