import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChits, getChit, getMembers, getMember,
  getChitsForMember, getMemberTotalBalance,
  getPaymentHistory, getPayoutsForMember, getMemberSettlements,
  getAllPaymentBatches, getAllPayouts,
  getPayoutsByChit, getDraws,
  getCollectionsReport, getMembersReport, getPayoutsReport,
  getWalletBalance, getWalletTransactions,
  listStaff,
} from '../../services/api';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { Select, Input } from '../../components/ui/FormField';
import { ListSkeleton } from '../../components/ui/Spinner';
import {
  BarChart2, DollarSign, Users, Banknote,
  Download, Filter, Printer, ChevronDown, ChevronRight,
  Wallet, AlertCircle, TrendingUp, FileText, ExternalLink,
} from 'lucide-react';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Computes "MMM YYYY" for draw #N given chit start date
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function drawMonthLabel(startDate, monthNumber) {
  if (!startDate || !monthNumber) return '';
  const d = new Date(startDate + (startDate.length === 10 ? 'T00:00:00' : ''));
  d.setDate(1);
  d.setMonth(d.getMonth() + (Number(monthNumber) - 1));
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function drawLabel(startDate, monthNumber) {
  const ml = drawMonthLabel(startDate, monthNumber);
  return `#${monthNumber}${ml ? ` (${ml})` : ''}`;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const PRESETS = [
  { label: 'Today',       fn: () => ({ from: todayStr(), to: todayStr() }) },
  { label: 'Last 7 days', fn: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: d.toISOString().slice(0, 10), to: todayStr() }; } },
  { label: 'This Month',  fn: () => ({ from: monthStartStr(), to: todayStr() }) },
  { label: 'Last Month',  fn: () => {
    const n = new Date();
    const s = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const e = new Date(n.getFullYear(), n.getMonth(), 0);
    return { from: s.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) };
  }},
  { label: 'All Time', fn: () => ({ from: '', to: '' }) },
];

const PMT_STATUS_COLOR = {
  SETTLED: 'green', PAYOUT_DEDUCTED: 'green', WAIVED: 'blue', SETTLEMENT_CLEARED: 'green',
  PARTIALLY_PAID: 'yellow', OUTSTANDING: 'red',
};
const PY_STATUS_COLOR = { DISBURSED: 'green', PENDING: 'yellow', CANCELLED: 'red', VOIDED: 'gray' };

const TABS = ['Overview', 'Member Report', 'Chit Report', 'Payments', 'Payouts', 'Treasury'];

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:24px}
  h1{color:#1E3A5F;border-bottom:2px solid #1E3A5F;padding-bottom:6px;font-size:17px;margin-bottom:6px}
  h2{color:#1E3A5F;font-size:13px;margin:16px 0 6px}
  h3{color:#1E3A5F;font-size:11px;margin:10px 0 4px}
  table{width:100%;border-collapse:collapse;margin:6px 0;font-size:10px}
  th{background:#1E3A5F;color:#fff;padding:5px 8px;text-align:left;font-size:10px}
  td{border:1px solid #ddd;padding:4px 8px}
  tr:nth-child(even) td{background:#f8f8f8}
  tfoot td{background:#e8eef4;font-weight:bold}
  .meta{display:flex;gap:24px;margin-bottom:12px;font-size:11px;flex-wrap:wrap}
  .meta span{color:#555}
  .meta strong{color:#222}
  .summary{background:#f0f4f8;padding:10px 14px;border-radius:6px;margin:8px 0;display:flex;gap:30px;flex-wrap:wrap}
  .summary-item p{margin:2px 0}
  .summary-item .val{font-size:14px;font-weight:bold;color:#1E3A5F}
  .summary-item .lbl{font-size:10px;color:#666}
  .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
  .badge{display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:bold}
  .green{background:#dcfce7;color:#166534} .red{background:#fee2e2;color:#991b1b}
  .yellow{background:#fef3c7;color:#92400e} .blue{background:#dbeafe;color:#1e40af}
  .gray{background:#f3f4f6;color:#374151}
`;

function openPrint(title, html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_CSS}</style></head><body>
    <h1>${title}</h1>${html}
    <div class="footer">Generated on ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; ChitWise Management System</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
  </body></html>`);
  w.document.close();
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#1E3A5F' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function TabBar({ active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {TABS.map((t) => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-5 py-2 text-sm font-semibold rounded-lg border-2 transition-colors cursor-pointer whitespace-nowrap ${
            active === t
              ? 'bg-[#1E3A5F] border-[#1E3A5F] text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:border-[#1E3A5F] hover:text-[#1E3A5F]'
          }`}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Clickable entity links ───────────────────────────────────────────────────
function MemberLink({ id, name }) {
  const nav = useNavigate();
  if (!id || !name || name === id) return <span>{name ?? '—'}</span>;
  return (
    <button type="button" onClick={() => nav(`/members/${id}`)}
      className="hover:underline hover:text-[#1E3A5F] cursor-pointer text-left font-medium">
      {name}
    </button>
  );
}

function ChitLink({ id, name }) {
  const nav = useNavigate();
  if (!id || !name || name === id) return <span>{name ?? '—'}</span>;
  return (
    <button type="button" onClick={() => nav(`/chits/${id}`)}
      className="hover:underline hover:text-[#1E3A5F] cursor-pointer text-left font-medium">
      {name}
    </button>
  );
}

function DateRangeBar({ from, to, onFrom, onTo, active, onPreset }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => onPreset(p.fn())}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              active === p.label ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{p.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <Filter size={13} className="text-gray-400" />
        <Input type="date" value={from} max={to || todayStr()} onChange={(e) => onFrom(e.target.value)} />
        <span className="text-gray-400 text-xs">to</span>
        <Input type="date" value={to} min={from} max={todayStr()} onChange={(e) => onTo(e.target.value)} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
  );
}

function SummaryBar({ items }) {
  return (
    <div className="flex flex-wrap gap-6 bg-blue-50 rounded-xl p-4">
      {items.map(({ label, value, color }) => (
        <div key={label}>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-base font-bold ${color ?? 'text-gray-800'}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Per-chit payment section (lazy, self-fetching) ───────────────────────────
function ChitPaymentSection({ memberId, chit }) {
  const [open, setOpen] = useState(false);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['payment-history', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: !!memberId,
  });

  const totalDue  = history.reduce((s, r) => s + Number(r.amountDue ?? 0), 0);
  const totalPaid = history.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  const totalBal  = history.reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const hasPromised = history.some((r) => r.promisedPaymentDate);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <div className="text-left">
            <p className="text-sm font-semibold text-[#1E3A5F] hover:underline">{chit.name}</p>
            <p className="text-xs text-gray-400">
              {chit.status} &nbsp;·&nbsp; ₹{Number(chit.chitValue ?? 0).toLocaleString('en-IN')} &nbsp;·&nbsp; {chit.totalMembers} members
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <div className="flex gap-4 text-right text-xs">
            <div><p className="text-gray-400">Paid</p><p className="font-bold text-green-700">{fmt(totalPaid)}</p></div>
            <div><p className="text-gray-400">Balance</p><p className={`font-bold ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalBal)}</p></div>
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading payment records…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payment records found</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Total Due</p>
                  <p className="font-bold text-gray-800">{fmt(totalDue)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Total Paid</p>
                  <p className="font-bold text-green-700">{fmt(totalPaid)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-400">Outstanding</p>
                  <p className={`font-bold ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalBal)}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white border-b border-gray-200">
                      {['Draw', 'Due Date', 'Due', 'Paid', 'Balance', 'Status', 'Paid Date', ...(hasPromised ? ['Promised Date'] : [])].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-white">
                        <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-2 text-gray-700">{fmt(r.amountDue)}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{fmt(r.amountPaid)}</td>
                        <td className={`px-3 py-2 font-medium ${Number(r.balance) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {fmt(r.balance)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge color={PMT_STATUS_COLOR[r.status] ?? 'gray'} size="xs">
                            {r.status?.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{Number(r.amountPaid) > 0 ? fmtDate(r.updatedAt) : '—'}</td>
                        {hasPromised && <td className="px-3 py-2 text-gray-500">{fmtDate(r.promisedPaymentDate)}</td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-xs">
                      <td className="px-3 py-2 text-gray-700">Total</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-gray-700">{fmt(totalDue)}</td>
                      <td className="px-3 py-2 text-green-700">{fmt(totalPaid)}</td>
                      <td className={`px-3 py-2 ${totalBal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalBal)}</td>
                      <td colSpan={hasPromised ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: () => getChits({ size: 200 }) });
  const { data: members = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});
  const { data: wallet } = useQuery({ queryKey: ['wallet-balance'], queryFn: getWalletBalance });
  const { data: thisMonthBatches = [] } = useQuery({
    queryKey: ['batches-this-month'],
    queryFn: () => getAllPaymentBatches({ fromDate: monthStartStr(), toDate: todayStr() }),
  });
  const { data: allPayouts = [] } = useQuery({
    queryKey: ['all-payouts-overview'],
    queryFn: () => getAllPayouts(),
  });

  const activeChits    = chits.filter((c) => c.status === 'ACTIVE').length;
  const completedChits = chits.filter((c) => c.status === 'COMPLETED').length;
  const activeMembers  = members.filter((m) => m.status === 'ACTIVE').length;
  const thisMonthTotal = thisMonthBatches.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);
  const pendingPayouts = allPayouts.filter((p) => p.status === 'PENDING');
  const pendingPayoutTotal = pendingPayouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? p.winningAmount ?? 0), 0);
  const disbursedTotal = allPayouts
    .filter((p) => p.status === 'DISBURSED')
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);

  const modeBreakdown = thisMonthBatches.reduce((acc, b) => {
    const mode = b.paymentMode ?? 'UNKNOWN';
    acc[mode] = (acc[mode] ?? 0) + Number(b.amount ?? b.totalAmount ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={BarChart2}   label="Active Chits"    value={activeChits}    sub={`${completedChits} completed`} />
        <StatCard icon={Users}       label="Active Members"  value={activeMembers}  sub={`${members.length} total`} />
        <StatCard icon={Banknote}    label="This Month"      value={fmt(thisMonthTotal)} sub={`${thisMonthBatches.length} transactions`} color="#16a34a" />
        <StatCard icon={AlertCircle} label="Pending Payouts" value={pendingPayouts.length} sub={fmt(pendingPayoutTotal)} color="#dc2626" />
        <StatCard icon={Wallet}      label="Wallet Balance"  value={fmt(wallet?.totalBalance)} sub={`Cash: ${fmt(wallet?.cashBalance)} · Bank: ${fmt(wallet?.bankBalance)}`} color="#7c3aed" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">This Month — Payment Mode Breakdown</h3>
          {Object.keys(modeBreakdown).length === 0 ? (
            <p className="text-sm text-gray-400">No payments this month</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(modeBreakdown).map(([mode, total]) => {
                const pct = thisMonthTotal > 0 ? Math.round((total / thisMonthTotal) * 100) : 0;
                return (
                  <div key={mode}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{mode.replace(/_/g, ' ')}</span>
                      <span className="font-semibold">{fmt(total)} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-[#1E3A5F] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Payout Summary (All Time)</h3>
          <Row label="Total Disbursed" value={fmt(disbursedTotal)} />
          <Row label="Pending Payouts" value={`${pendingPayouts.length} · ${fmt(pendingPayoutTotal)}`} />
          <Row label="Total Payouts" value={allPayouts.length} />
          <div className="border-t border-gray-100 pt-2 space-y-1">
            <Row label="Total Chits" value={chits.length} />
            <Row label="Active Chits" value={activeChits} />
            <Row label="Completed Chits" value={completedChits} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member Report Tab ────────────────────────────────────────────────────────
function MemberReportTab() {
  const [memberId, setMemberId] = useState('');
  const queryClient = useQueryClient();
  const nav = useNavigate();

  const { data: members = [], isLoading: loadingMembers } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});

  const { data: memberDetail, isLoading: loadingMember } = useQuery({
    queryKey: ['member-detail', memberId],
    queryFn: () => getMember(memberId),
    enabled: !!memberId,
  });

  const { data: memberChits = [], isLoading: loadingChits } = useQuery({
    queryKey: ['member-chits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: totalBalance } = useQuery({
    queryKey: ['member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    enabled: !!memberId,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['member-settlements', memberId],
    queryFn: () => getMemberSettlements(memberId),
    enabled: !!memberId,
  });

  const member = memberDetail ?? members.find((m) => String(m.id) === String(memberId));
  const chitNameMap  = Object.fromEntries(memberChits.map((c) => [String(c.id), c.name ?? c.chitName]));
  const chitStartMap = Object.fromEntries(memberChits.map((c) => [String(c.id), c.startDate]));
  const chitName = (p) => chitNameMap[String(p.chitId)] ?? p.chitName ?? p.chitId ?? '—';

  const totalPayoutsReceived = payouts
    .filter((p) => p.status === 'DISBURSED')
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);

  function handlePrint() {
    if (!member) return;

    const profileHtml = `
      <div class="meta">
        <span><strong>Name:</strong> ${member.fullName ?? '—'}</span>
        <span><strong>Phone:</strong> ${member.phone ?? '—'}</span>
        <span><strong>Email:</strong> ${member.email ?? '—'}</span>
        <span><strong>Status:</strong> ${member.status ?? '—'}</span>
        <span><strong>City:</strong> ${member.city ?? '—'}</span>
      </div>
    `;

    const summaryHtml = `
      <div class="summary">
        <div class="summary-item"><p class="lbl">Enrolled Chits</p><p class="val">${memberChits.length}</p></div>
        <div class="summary-item"><p class="lbl">Overall Outstanding</p><p class="val">${fmt(totalBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Payouts Received</p><p class="val">${fmt(totalPayoutsReceived)}</p></div>
        <div class="summary-item"><p class="lbl">Total Payouts</p><p class="val">${payouts.filter((p) => p.status === 'DISBURSED').length}</p></div>
      </div>
    `;

    const payoutsHtml = payouts.length === 0 ? '<p style="color:#888;font-size:11px">No payouts</p>' : `
      <table>
        <thead><tr><th>Chit</th><th>Draw</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${payouts.map((p) => { const pdl = drawMonthLabel(chitStartMap[String(p.chitId)], p.monthNumber); return `<tr>
            <td>${chitName(p)}</td>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
      </table>
    `;

    const settlementsHtml = settlements.length === 0 ? '' : `
      <h2>Settlements</h2>
      <table>
        <thead><tr><th>Date</th><th>Amount</th></tr></thead>
        <tbody>
          ${settlements.map((s) => `<tr>
            <td>${fmtDate(s.settledAt ?? s.createdAt)}</td>
            <td>${fmt(s.totalAmount ?? s.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    const chitHistoriesHtml = memberChits.map((chit) => {
      const hist = queryClient.getQueryData(['payment-history', memberId, chit.id]) ?? [];
      if (hist.length === 0) return '';
      const hasP = hist.some((r) => r.balance > 0);
      const rows = hist.map((r) => {
        const dl = drawMonthLabel(chit.startDate, r.monthNumber);
        return `<tr>
        <td>#${r.monthNumber ?? '—'}${dl ? ` (${dl})` : ''}</td>
        <td>${fmtDate(r.dueDate)}</td>
        <td>${fmt(r.amountDue)}</td>
        <td>${fmt(r.amountPaid)}</td>
        <td>${fmt(r.balance)}</td>
        <td><span class="badge ${r.balance > 0 ? 'red' : 'green'}">${r.status ?? '—'}</span></td>
        <td>${Number(r.amountPaid) > 0 ? fmtDate(r.updatedAt) : '—'}</td>
        ${hasP ? `<td>${r.promisedPaymentDate ? fmtDate(r.promisedPaymentDate) : '—'}</td>` : ''}
      </tr>`;
      }).join('');
      return `<h3 style="margin:14px 0 4px;font-size:12px;color:#1E3A5F">${chit.name} <span style="font-weight:400;color:#888">(${chit.status})</span></h3>
        <table>
          <thead><tr><th>Draw</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Paid Date</th>${hasP ? '<th>Promised Date</th>' : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

    openPrint(`Member Report — ${member.fullName}`,
      `${profileHtml}${summaryHtml}
       <h2>Payouts Received</h2>${payoutsHtml}
       ${settlementsHtml}
       ${chitHistoriesHtml ? `<h2>Draw-wise Payment History</h2>${chitHistoriesHtml}` : ''}`
    );
  }

  if (loadingMembers) return <ListSkeleton rows={5} cols={4} />;
  const sortedMembers = [...members].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Select Member</label>
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">— choose a member —</option>
            {sortedMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName}{m.phone ? ` · ${m.phone}` : ''}</option>
            ))}
          </Select>
        </div>
        {memberId && member && (
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg shadow hover:bg-[#162d4a] active:scale-95 transition-all">
            <Printer size={15} /> Print Report
          </button>
        )}
      </div>

      {!memberId && (
        <EmptyState icon={Users} title="Select a member" description="Choose a member to view their complete report" />
      )}

      {memberId && (loadingMember || loadingChits) && <ListSkeleton rows={5} cols={4} />}

      {memberId && member && (
        <div className="space-y-5">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{member.fullName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[member.phone, member.email].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Badge color={member.status === 'ACTIVE' ? 'green' : 'gray'}>{member.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              {member.address && <Row label="Address" value={member.address} />}
              {member.city && <Row label="City" value={member.city} />}
              {member.referredByName && <Row label="Referred By" value={member.referredByName} />}
              {member.joinedDate && <Row label="Joined" value={fmtDate(member.joinedDate)} />}
            </div>
          </div>

          {/* Summary */}
          <SummaryBar items={[
            { label: 'Enrolled Chits', value: memberChits.length },
            { label: 'Overall Outstanding', value: fmt(totalBalance), color: Number(totalBalance) > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Payouts Received', value: fmt(totalPayoutsReceived), color: 'text-green-700' },
            { label: 'Disbursed Payouts', value: payouts.filter((p) => p.status === 'DISBURSED').length },
          ]} />

          {/* Per-Chit Payment History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History by Chit</h3>
            {memberChits.length === 0 ? (
              <p className="text-sm text-gray-400">Not enrolled in any chits</p>
            ) : (
              <div className="space-y-3">
                {memberChits.map((chit) => (
                  <ChitPaymentSection key={chit.id} memberId={memberId} chit={chit} />
                ))}
              </div>
            )}
          </div>

          {/* Payouts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Payouts Received</h3>
            {payouts.length === 0 ? (
              <p className="text-sm text-gray-400">No payouts</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Chit', 'Draw', 'Winning Amt', 'Withheld Instmt', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">
                          {h === 'Withheld Instmt' ? <span title="Installment deducted from payout">{h}</span> : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => nav(`/payouts/${p.id}`)}>
                        <td className="px-3 py-2"><ChitLink id={p.chitId} name={chitName(p)} /></td>
                        <td className="px-3 py-2">{drawLabel(chitStartMap[String(p.chitId)], p.monthNumber)}</td>
                        <td className="px-3 py-2">{fmt(p.winningAmount)}</td>
                        <td className="px-3 py-2">
                          {Number(p.discountAmount) > 0
                            ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold text-sm">✓</span>{fmt(p.discountAmount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 font-semibold">{fmt(p.netPayoutAmount)}</td>
                        <td className="px-3 py-2 text-green-700 font-semibold">{fmt(p.disbursedAmount)}</td>
                        <td className="px-3 py-2">
                          <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                        <td className="px-3 py-2"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 text-xs font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-gray-600">Total Disbursed</td>
                      <td className="px-3 py-2">{fmt(payouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                      <td className="px-3 py-2 text-green-700">{fmt(totalPayoutsReceived)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Settlements */}
          {settlements.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Settlements</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Date', 'Amount', 'Notes'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{fmtDate(s.settledAt ?? s.createdAt)}</td>
                        <td className="px-3 py-2 font-semibold">{fmt(s.totalAmount ?? s.amount)}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px]">
                          {s.notes ? <span title={s.notes} className="block truncate cursor-help">{s.notes}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chit Report Tab ──────────────────────────────────────────────────────────
function ChitReportTab() {
  const [chitId, setChitId] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const nav = useNavigate();

  const { data: chits = [], isLoading: loadingChits } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits({ size: 200 }),
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],       queryFn: listStaff });

  const { data: chit } = useQuery({
    queryKey: ['chit', chitId],
    queryFn: () => getChit(chitId),
    enabled: !!chitId,
  });

  const { data: draws = [], isLoading: loadingDraws } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
    enabled: !!chitId,
  });

  const { data: collectionsReport = [], isLoading: loadingCollections } = useQuery({
    queryKey: ['collections-report', chitId],
    queryFn: () => getCollectionsReport(chitId),
    enabled: !!chitId,
  });

  const { data: membersReport = [], isLoading: loadingMembersReport } = useQuery({
    queryKey: ['members-report', chitId],
    queryFn: () => getMembersReport(chitId),
    enabled: !!chitId,
  });

  const { data: payoutsReport = [], isLoading: loadingPayoutsReport } = useQuery({
    queryKey: ['payouts-report', chitId],
    queryFn: () => getPayoutsReport(chitId),
    enabled: !!chitId,
  });

  const { data: payoutsByChit = [] } = useQuery({
    queryKey: ['payouts-by-chit', chitId],
    queryFn: () => getPayoutsByChit(chitId),
    enabled: !!chitId,
  });

  const payoutsData = payoutsReport.length > 0 ? payoutsReport : payoutsByChit;
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));
  const staffMap  = Object.fromEntries(staffList.map((s) => [String(s.id), s.fullName ?? s.username]));
  const resolveMember = (p) => resolveUUID(p.memberId, memberMap, {}, staffMap) || p.memberName || '—';

  const drawMap = Object.fromEntries(draws.map((d) => [d.monthNumber, d]));
  const collectionRows = collectionsReport.length > 0
    ? collectionsReport.map((r) => {
        const mn = r.monthNumber ?? r.drawNumber ?? r.month;
        const draw = drawMap[mn] ?? {};
        return {
          monthNumber: mn,
          totalDue: r.totalDue ?? r.expectedAmount ?? 0,
          totalCollected: r.totalCollected ?? r.collectedAmount ?? r.totalPaid ?? 0,
          outstanding: r.outstanding ?? r.balance ?? ((r.totalDue ?? 0) - (r.totalCollected ?? r.totalPaid ?? 0)),
          drawStatus: r.drawStatus ?? draw.status ?? '—',
          dueDate: draw.dueDate,
          closedAt: draw.closedAt,
        };
      })
    : draws.map((d) => {
        const collected   = Number(d.totalCollected ?? 0);
        const outstanding = Number(d.totalOutstanding ?? 0);
        const totalDue    = collected + outstanding;
        return {
          monthNumber: d.monthNumber,
          totalDue:       totalDue > 0 ? totalDue : null,
          totalCollected: d.totalCollected != null ? collected : null,
          outstanding:    d.totalOutstanding != null ? outstanding : null,
          drawStatus: d.status,
          dueDate: d.dueDate,
          closedAt: d.closedAt,
        };
      });

  const totalExpected    = collectionRows.reduce((s, r) => s + Number(r.totalDue ?? 0), 0);
  const totalCollected   = collectionRows.reduce((s, r) => s + Number(r.totalCollected ?? 0), 0);
  const totalOutstanding = collectionRows.reduce((s, r) => s + Number(r.outstanding ?? 0), 0);
  const totalDisbursed   = payoutsData
    .filter((p) => p.status === 'DISBURSED')
    .reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);
  const totalWithheld    = payoutsData.reduce((s, p) => s + Number(p.discountAmount ?? 0), 0);

  // Draws where admin paid additional members: grouped by monthNumber, extras beyond 1 = admin investment.
  // Exclude VOIDED and CANCELLED payouts — those draws are no longer active.
  const payoutsByDraw = payoutsData
    .filter((p) => p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED')
    .reduce((acc, p) => {
      const mn = p.monthNumber ?? 0;
      if (!acc[mn]) acc[mn] = [];
      acc[mn].push(p);
      return acc;
    }, {});
  const adminInvestment = Object.values(payoutsByDraw).reduce((s, group) => {
    if (group.length <= 1) return s;
    return s + group.slice(1).reduce((sub, p) => sub + Number(p.disbursedAmount ?? 0), 0);
  }, 0);

  const profitLoss = totalCollected - totalDisbursed + adminInvestment;

  function handlePrint() {
    if (!chit) return;

    const chitInfoHtml = `
      <div class="meta">
        <span><strong>Chit:</strong> ${chit.name}</span>
        <span><strong>Value:</strong> ${fmt(chit.chitValue)}</span>
        <span><strong>Members:</strong> ${chit.totalMembers}</span>
        <span><strong>Status:</strong> ${chit.status}</span>
        <span><strong>Started:</strong> ${fmtDate(chit.startDate)}</span>
        <span><strong>Installment:</strong> ${fmt(chit.installmentAmount)}</span>
      </div>
    `;

    const summaryHtml = `
      <div class="summary">
        <div class="summary-item"><p class="lbl">Total Draws</p><p class="val">${draws.length}</p></div>
        <div class="summary-item"><p class="lbl">Expected</p><p class="val">${fmt(totalExpected)}</p></div>
        <div class="summary-item"><p class="lbl">Collected</p><p class="val" style="color:#166534">${fmt(totalCollected)}</p></div>
        <div class="summary-item"><p class="lbl">Outstanding</p><p class="val" style="color:#991b1b">${fmt(totalOutstanding)}</p></div>
        <div class="summary-item"><p class="lbl">Disbursed Payouts</p><p class="val" style="color:#1d4ed8">${fmt(totalDisbursed)}</p></div>
        <div class="summary-item"><p class="lbl">Withheld Instmts</p><p class="val" style="color:#92400e">${fmt(totalWithheld)}</p></div>
      </div>
      <div style="margin:12px 0;padding:12px 16px;background:${profitLoss >= 0 ? '#f0fdf4' : '#fef2f2'};border:2px solid ${profitLoss >= 0 ? '#16a34a' : '#dc2626'};border-radius:8px;display:flex;align-items:center;gap:32px;flex-wrap:wrap">
        <div><p style="font-size:11px;color:#6b7280;margin:0">Total Collected</p><p style="font-size:16px;font-weight:700;color:#166534;margin:0">${fmt(totalCollected)}</p></div>
        <div style="font-size:20px;color:#9ca3af">−</div>
        <div><p style="font-size:11px;color:#6b7280;margin:0">Disbursed Payouts</p><p style="font-size:16px;font-weight:700;color:#1d4ed8;margin:0">${fmt(totalDisbursed)}</p></div>
        ${adminInvestment > 0 ? `<div style="font-size:20px;color:#9ca3af">+</div><div><p style="font-size:11px;color:#6b7280;margin:0">Admin Investment</p><p style="font-size:16px;font-weight:700;color:#7c3aed;margin:0">${fmt(adminInvestment)}</p><p style="font-size:10px;color:#9ca3af;margin:0">advance to additional members</p></div>` : ''}
        <div style="font-size:20px;color:#9ca3af">=</div>
        <div><p style="font-size:11px;color:#6b7280;margin:0">${profitLoss >= 0 ? 'Surplus (Profit)' : 'Deficit (Loss)'}</p><p style="font-size:20px;font-weight:800;color:${profitLoss >= 0 ? '#16a34a' : '#dc2626'};margin:0">${profitLoss >= 0 ? '+' : ''}${fmt(profitLoss)}</p></div>
      </div>
    `;

    const collectionsHtml = collectionRows.length === 0 ? '<p style="color:#888">No draw data</p>' : `
      <table>
        <thead><tr><th>Draw</th><th>Due Date</th><th>Total Due</th><th>Collected</th><th>Outstanding</th><th>Status</th><th>Closed Date</th></tr></thead>
        <tbody>
          ${collectionRows.map((r) => { const cdl = drawMonthLabel(chit.startDate, r.monthNumber); return `<tr>
            <td>#${r.monthNumber}${cdl ? ` (${cdl})` : ''}</td>
            <td>${fmtDate(r.dueDate)}</td>
            <td>${r.totalDue != null ? fmt(r.totalDue) : '—'}</td>
            <td>${r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
            <td>${r.outstanding != null ? fmt(r.outstanding) : '—'}</td>
            <td>${r.drawStatus}</td>
            <td>${r.closedAt ? fmtDate(r.closedAt) : '—'}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td></td><td>${fmt(totalExpected)}</td><td>${fmt(totalCollected)}</td><td>${fmt(totalOutstanding)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `;

    const membersHtml = membersReport.length === 0 ? '<p style="color:#888">No member data</p>' : `
      <table>
        <thead><tr>
          ${Object.keys(membersReport[0] ?? {}).map((k) => `<th>${k.replace(/([A-Z])/g, ' $1').trim()}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${membersReport.map((r) => `<tr>
            ${Object.values(r).map((v) => `<td>${typeof v === 'number' ? fmt(v) : (v ?? '—')}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    const payoutsHtml = payoutsData.length === 0 ? '<p style="color:#888">No payouts</p>' : `
      <table>
        <thead><tr><th>Draw</th><th>Member</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${payoutsData.map((p) => { const pdl = drawMonthLabel(chit.startDate, p.monthNumber); return `<tr>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${resolveMember(p)}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Total Disbursed</td><td>${fmt(totalDisbursed)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `;

    openPrint(`Chit Report — ${chit.name}`,
      `${chitInfoHtml}
       <h2>Draw-wise Collections</h2>${collectionsHtml}
       <h2>Member Payment Summary</h2>${membersHtml}
       <h2>Payouts</h2>${payoutsHtml}`
    );
  }

  if (loadingChits) return <ListSkeleton rows={5} cols={4} />;
  const isLoading = loadingDraws || loadingCollections || loadingMembersReport || loadingPayoutsReport;

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Select Chit</label>
          <Select value={chitId} onChange={(e) => setChitId(e.target.value)}>
            <option value="">— choose a chit —</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </Select>
        </div>
        {chitId && chit && (
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg shadow hover:bg-[#162d4a] active:scale-95 transition-all">
            <Printer size={15} /> Print Report
          </button>
        )}
      </div>

      {!chitId && <EmptyState icon={FileText} title="Select a chit" description="Choose a chit to view its complete report" />}
      {chitId && isLoading && <ListSkeleton rows={5} cols={4} />}

      {chitId && chit && !isLoading && (
        <div className="space-y-5">
          {/* Chit Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{chit.name}</h2>
                {chit.description && <p className="text-sm text-gray-500 mt-0.5">{chit.description}</p>}
              </div>
              <Badge color={chit.status === 'ACTIVE' ? 'green' : chit.status === 'COMPLETED' ? 'blue' : 'gray'}>
                {chit.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6">
              <Row label="Chit Value" value={fmt(chit.chitValue)} />
              <Row label="Installment" value={fmt(chit.installmentAmount)} />
              <Row label="Members" value={chit.totalMembers} />
              <Row label="Start Date" value={fmtDate(chit.startDate)} />
            </div>
          </div>

          {/* Summary */}
          <SummaryBar items={[
            { label: 'Total Draws', value: draws.length },
            { label: 'Expected Collections', value: totalExpected > 0 ? fmt(totalExpected) : '—' },
            { label: 'Total Collected', value: totalCollected > 0 ? fmt(totalCollected) : '—', color: 'text-green-700' },
            { label: 'Outstanding', value: totalOutstanding > 0 ? fmt(totalOutstanding) : '—', color: totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800' },
            { label: 'Disbursed Payouts', value: fmt(totalDisbursed), color: 'text-blue-700' },
            { label: 'Withheld Instmts', value: fmt(totalWithheld), color: 'text-amber-700' },
            ...(adminInvestment > 0 ? [{ label: 'Admin Investment', value: fmt(adminInvestment), color: 'text-purple-700' }] : []),
          ]} />

          {/* Profit / Loss card */}
          <div className={`rounded-xl border-2 ${profitLoss >= 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Summary</p>
              <div className="flex flex-wrap items-center gap-3 md:gap-5">
                <div className="flex-1 min-w-[120px]">
                  <p className="text-xs text-gray-500">Total Collected</p>
                  <p className="text-xl font-bold text-green-700">{fmt(totalCollected)}</p>
                </div>
                <span className="text-2xl text-gray-400 font-light">−</span>
                <div className="flex-1 min-w-[120px]">
                  <p className="text-xs text-gray-500">Disbursed Payouts</p>
                  <p className="text-xl font-bold text-blue-700">{fmt(totalDisbursed)}</p>
                </div>
                {adminInvestment > 0 && (
                  <>
                    <span className="text-2xl text-gray-400 font-light">+</span>
                    <div className="flex-1 min-w-[120px]">
                      <p className="text-xs text-gray-500">Admin Investment</p>
                      <p className="text-xl font-bold text-purple-700">{fmt(adminInvestment)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">advance payouts to additional members</p>
                    </div>
                  </>
                )}
                <span className="text-2xl text-gray-400 font-light">=</span>
                <div className="flex-1 min-w-[140px] bg-white rounded-lg px-4 py-3 border border-gray-200">
                  <p className="text-xs text-gray-500">{profitLoss >= 0 ? 'Surplus (Profit)' : 'Deficit (Loss)'}</p>
                  <p className={`text-2xl font-extrabold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitLoss >= 0 ? '+' : ''}{fmt(profitLoss)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="mt-4 flex items-center gap-1.5 text-xs font-medium text-[#1E3A5F] hover:underline"
              >
                {showBreakdown ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {showBreakdown ? 'Hide' : 'View'} Draw-wise Breakdown
              </button>
            </div>

            {showBreakdown && (() => {
              // Per-draw disbursed amounts
              const disbursedByDraw = payoutsData
                .filter((p) => p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED')
                .reduce((acc, p) => {
                  const mn = p.monthNumber ?? 0;
                  acc[mn] = (acc[mn] ?? 0) + Number(p.disbursedAmount ?? 0);
                  return acc;
                }, {});

              // Admin investment details: draws with >1 active payout → extras are investments
              const adminInvestDetails = [];
              Object.entries(payoutsByDraw).forEach(([mn, group]) => {
                if (group.length <= 1) return;
                group.slice(1).forEach((p) => {
                  adminInvestDetails.push({
                    monthNumber: Number(mn),
                    memberName: resolveUUID(p.memberId, memberMap, {}, staffMap),
                    amount: Number(p.disbursedAmount ?? 0),
                  });
                });
              });

              const grandCollected  = collectionRows.reduce((s, r) => s + Number(r.totalCollected ?? 0), 0);
              const grandDisbursed  = Object.values(disbursedByDraw).reduce((s, v) => s + v, 0);
              const grandNetFlow    = grandCollected - grandDisbursed;

              return (
                <div className="border-t border-white/60 px-5 pb-5">
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/70 border-b border-gray-200">
                          {['Draw', 'Collected', 'Disbursed', 'Net Retained'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {collectionRows.map((r) => {
                          const disbursed = disbursedByDraw[r.monthNumber] ?? 0;
                          const netFlow   = Number(r.totalCollected ?? 0) - disbursed;
                          return (
                            <tr key={r.monthNumber} className="border-b border-white/50 hover:bg-white/50">
                              <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                              <td className="px-3 py-2 text-green-700 font-medium">{r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
                              <td className="px-3 py-2 text-blue-700 font-medium">{disbursed > 0 ? fmt(disbursed) : '—'}</td>
                              <td className={`px-3 py-2 font-bold ${netFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {netFlow >= 0 ? '+' : ''}{fmt(netFlow)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-white/80 font-semibold text-xs border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-gray-700">Total</td>
                          <td className="px-3 py-2 text-green-700">{fmt(grandCollected)}</td>
                          <td className="px-3 py-2 text-blue-700">{fmt(grandDisbursed)}</td>
                          <td className={`px-3 py-2 ${grandNetFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {grandNetFlow >= 0 ? '+' : ''}{fmt(grandNetFlow)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {adminInvestDetails.length > 0 && (
                    <div className="mt-4 rounded-lg bg-purple-50 border border-purple-200 p-3">
                      <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                        Admin Invested Funds — {fmt(adminInvestment)}
                        <span className="font-normal text-purple-500 ml-1">(advance payouts to additional members, to be recovered)</span>
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-purple-200">
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Draw</th>
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Member</th>
                            <th className="px-2 py-1.5 text-left text-purple-600 font-medium">Amount Invested</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminInvestDetails.map((d, i) => (
                            <tr key={i} className="border-b border-purple-100">
                              <td className="px-2 py-1.5 font-semibold text-purple-700">{drawLabel(chit.startDate, d.monthNumber)}</td>
                              <td className="px-2 py-1.5 text-purple-700">{d.memberName}</td>
                              <td className="px-2 py-1.5 font-bold text-purple-800">{fmt(d.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Draw-wise Collections */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Draw-wise Collections</h3>
            {collectionRows.length === 0 ? (
              <p className="text-sm text-gray-400">No draw data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Draw', 'Due Date', 'Total Due', 'Collected', 'Outstanding', 'Status', 'Closed Date'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {collectionRows.map((r) => (
                      <tr key={r.monthNumber} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-700">{drawLabel(chit.startDate, r.monthNumber)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-2">{r.totalDue != null ? fmt(r.totalDue) : '—'}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{r.totalCollected != null ? fmt(r.totalCollected) : '—'}</td>
                        <td className={`px-3 py-2 font-medium ${Number(r.outstanding) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {r.outstanding != null ? fmt(r.outstanding) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.drawStatus}</td>
                        <td className="px-3 py-2 text-gray-500">{r.closedAt ? fmtDate(r.closedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totalExpected > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 text-xs font-semibold">
                        <td className="px-3 py-2 text-gray-700">Total</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2">{fmt(totalExpected)}</td>
                        <td className="px-3 py-2 text-green-700">{fmt(totalCollected)}</td>
                        <td className={`px-3 py-2 ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalOutstanding)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Member Payment Summary */}
          {membersReport.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Member Payment Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {Object.keys(membersReport[0] ?? {}).map((k) => (
                        <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium capitalize">
                          {k.replace(/([A-Z])/g, ' $1').trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {membersReport.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k} className="px-3 py-2 text-gray-700">
                            {typeof v === 'number' ? fmt(v) : (v ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payouts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Payouts</h3>
            {payoutsData.length === 0 ? (
              <p className="text-sm text-gray-400">No payouts for this chit</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Draw', 'Member', 'Winning Amt', 'Withheld Instmt', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payoutsData.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => nav(`/payouts/${p.id}`)}>
                        <td className="px-3 py-2 font-semibold">{drawLabel(chit.startDate, p.monthNumber)}</td>
                        <td className="px-3 py-2"><MemberLink id={p.memberId} name={resolveMember(p)} /></td>
                        <td className="px-3 py-2">{fmt(p.winningAmount)}</td>
                        <td className="px-3 py-2">
                          {Number(p.discountAmount) > 0
                            ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold text-sm">✓</span>{fmt(p.discountAmount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 font-semibold">{fmt(p.netPayoutAmount)}</td>
                        <td className="px-3 py-2 text-green-700 font-semibold">{fmt(p.disbursedAmount)}</td>
                        <td className="px-3 py-2">
                          <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                        <td className="px-3 py-2"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 text-xs font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-gray-600">Total Disbursed</td>
                      <td className="px-3 py-2">{fmt(payoutsData.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                      <td className="px-3 py-2 text-green-700">{fmt(totalDisbursed)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────
function PaymentsTab() {
  const [from, setFrom]             = useState(monthStartStr());
  const [to, setTo]                 = useState(todayStr());
  const [activePreset, setPreset]   = useState('This Month');
  const [filterChit, setFilterChit] = useState('');
  const nav = useNavigate();

  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: () => getChits({ size: 200 }) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 })});
  const chitMap   = Object.fromEntries(chits.map((c) => [String(c.id), c.name]));
  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['all-batches', from, to, filterChit],
    queryFn: () => getAllPaymentBatches({ fromDate: from || undefined, toDate: to || undefined, chitId: filterChit || undefined }),
  });

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(PRESETS.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const totalCollected = batches.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);
  const modeBreakdown = batches.reduce((acc, b) => {
    const m = b.paymentMode ?? 'UNKNOWN';
    acc[m] = (acc[m] ?? 0) + Number(b.amount ?? b.totalAmount ?? 0);
    return acc;
  }, {});

  function handleCSV() {
    downloadCSV(
      batches.map((b) => ({
        Date: fmtDate(b.collectedAt ?? b.createdAt),
        Member: b.memberName ?? b.memberId ?? '',
        Chit: b.chitName ?? b.chitId ?? '',
        Amount: b.amount ?? b.totalAmount ?? 0,
        PaymentMode: b.paymentMode ?? '',
        Collector: b.collectorName ?? '',
        Status: b.status ?? '',
      })),
      `payments-${from || 'all'}-to-${to || 'all'}.csv`
    );
  }

  function handlePrint() {
    const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';
    const modeRows = Object.entries(modeBreakdown)
      .map(([m, v]) => `<tr><td>${m.replace(/_/g, ' ')}</td><td>${fmt(v)}</td></tr>`)
      .join('');

    openPrint(`Payments Report — ${periodLabel}`, `
      <div class="meta">
        <span><strong>Period:</strong> ${periodLabel}</span>
        <span><strong>Transactions:</strong> ${batches.length}</span>
        <span><strong>Total Collected:</strong> ${fmt(totalCollected)}</span>
      </div>
      <h2>Payment Mode Breakdown</h2>
      <table><thead><tr><th>Mode</th><th>Amount</th></tr></thead><tbody>${modeRows}</tbody></table>
      <h2>All Transactions</h2>
      <table>
        <thead><tr><th>Date</th><th>Member</th><th>Chit</th><th>Amount</th><th>Mode</th><th>Collector</th><th>Status</th></tr></thead>
        <tbody>
          ${batches.map((b) => `<tr>
            <td>${fmtDate(b.collectedAt ?? b.createdAt)}</td>
            <td>${memberMap[String(b.memberId)] ?? b.memberName ?? b.memberId ?? '—'}</td>
            <td>${chitMap[String(b.chitId)] ?? b.chitName ?? b.chitId ?? '—'}</td>
            <td>${fmt(b.amount ?? b.totalAmount)}</td>
            <td>${b.paymentMode ?? '—'}</td>
            <td>${b.collectorName ?? '—'}</td>
            <td>${b.status ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="3">Total (${batches.length})</td><td>${fmt(totalCollected)}</td><td colspan="3"></td></tr></tfoot>
      </table>
    `);
  }

  return (
    <div className="space-y-5">
      <DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} active={activePreset} onPreset={onPreset} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-52">
          <Select value={filterChit} onChange={(e) => setFilterChit(e.target.value)}>
            <option value="">All Chits</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg shadow hover:bg-[#162d4a] active:scale-95 transition-all">
            <Printer size={14} /> Print
          </button>
          <Button variant="outline" onClick={handleCSV} className="flex items-center gap-2 text-sm">
            <Download size={14} /> CSV
          </Button>
        </div>
      </div>

      {!isLoading && batches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Banknote} label="Total Collected" value={fmt(totalCollected)}
            sub={`${batches.length} transactions`} color="#16a34a" />
          {Object.entries(modeBreakdown).map(([mode, total]) => (
            <StatCard key={mode} icon={DollarSign} label={mode.replace(/_/g, ' ')} value={fmt(total)}
              sub={`${batches.filter((b) => b.paymentMode === mode).length} txns`} color="#7c3aed" />
          ))}
        </div>
      )}

      {isLoading ? <ListSkeleton rows={5} cols={4} /> : batches.length === 0 ? (
        <EmptyState icon={Banknote} title="No payments" description="No payment records for the selected period" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Member', 'Chit', 'Amount', 'Mode', 'Collector', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(b.collectedAt ?? b.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <MemberLink id={b.memberId} name={memberMap[String(b.memberId)] ?? b.memberName ?? b.memberId} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ChitLink id={b.chitId} name={chitMap[String(b.chitId)] ?? b.chitName ?? b.chitId} />
                    </td>
                    <td className="px-4 py-2.5 font-bold text-green-700">{fmt(b.amount ?? b.totalAmount)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {b.paymentMode?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{b.collectorName ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={b.status === 'VOIDED' ? 'red' : 'green'} size="xs">{b.status ?? 'OK'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={3} className="px-4 py-3 text-gray-600">Total ({batches.length} transactions)</td>
                  <td className="px-4 py-3 text-green-700">{fmt(totalCollected)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payouts Tab ──────────────────────────────────────────────────────────────
function PayoutsTab() {
  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');
  const [activePreset, setPreset]     = useState('All Time');
  const [filterChit, setFilterChit]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const nav = useNavigate();

  const { data: chits = [] }      = useQuery({ queryKey: ['chits'],      queryFn: () => getChits({ size: 200 }) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],       queryFn: listStaff });
  const chitMap      = Object.fromEntries(chits.map((c) => [String(c.id), c.name]));
  const chitStartMap = Object.fromEntries(chits.map((c) => [String(c.id), c.startDate]));
  const memberMap    = Object.fromEntries(allMembers.map((m) => [String(m.id), m.fullName ?? m.username]));
  const staffMap     = Object.fromEntries(staffList.map((s) => [String(s.id), s.fullName ?? s.username]));

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['all-payouts-tab', from, to, filterChit],
    queryFn: () => getAllPayouts({ chitId: filterChit || undefined, fromDate: from || undefined, toDate: to || undefined }),
  });

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(PRESETS.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const filtered = filterStatus ? payouts.filter((p) => p.status === filterStatus) : payouts;
  const disbursedTotal = payouts.filter((p) => p.status === 'DISBURSED').reduce((s, p) => s + Number(p.disbursedAmount ?? p.netPayoutAmount ?? 0), 0);
  const pendingTotal   = payouts.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0);

  function handlePrint() {
    const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';
    openPrint(`Payouts Report — ${periodLabel}`, `
      <div class="meta">
        <span><strong>Period:</strong> ${periodLabel}</span>
        <span><strong>Total:</strong> ${payouts.length}</span>
        <span><strong>Disbursed:</strong> ${fmt(disbursedTotal)}</span>
        <span><strong>Pending:</strong> ${fmt(pendingTotal)}</span>
      </div>
      <table>
        <thead><tr><th>Draw</th><th>Chit</th><th>Member</th><th>Winning Amt</th><th>Withheld Instmt</th><th>Net Payout</th><th>Disbursed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${filtered.map((p) => { const pdl = drawMonthLabel(chitStartMap[String(p.chitId)], p.monthNumber); return `<tr>
            <td>#${p.monthNumber ?? '—'}${pdl ? ` (${pdl})` : ''}</td>
            <td>${resolveUUID(p.chitId, {}, chitMap, {})}</td>
            <td>${resolveUUID(p.memberId, memberMap, {}, staffMap)}</td>
            <td>${fmt(p.winningAmount)}</td>
            <td>${Number(p.discountAmount) > 0 ? `✓ ${fmt(p.discountAmount)}` : '—'}</td>
            <td>${fmt(p.netPayoutAmount)}</td>
            <td>${fmt(p.disbursedAmount)}</td>
            <td><span class="badge ${PY_STATUS_COLOR[p.status] ?? 'gray'}">${p.status ?? '—'}</span></td>
            <td>${fmtDate(p.createdAt ?? p.disbursedAt)}</td>
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td colspan="6">Total Disbursed (${filtered.length})</td><td>${fmt(disbursedTotal)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    `);
  }

  return (
    <div className="space-y-5">
      <DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} active={activePreset} onPreset={onPreset} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-52">
          <Select value={filterChit} onChange={(e) => setFilterChit(e.target.value)}>
            <option value="">All Chits</option>
            {[...chits].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['PENDING', 'DISBURSED', 'CANCELLED', 'VOIDED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg shadow hover:bg-[#162d4a] active:scale-95 transition-all">
          <Printer size={14} /> Print
        </button>
      </div>

      {!isLoading && payouts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={TrendingUp}   label="Total Disbursed"  value={fmt(disbursedTotal)} sub={`${payouts.filter((p) => p.status === 'DISBURSED').length} payouts`} color="#16a34a" />
          <StatCard icon={AlertCircle}  label="Pending Amount"   value={fmt(pendingTotal)}   sub={`${payouts.filter((p) => p.status === 'PENDING').length} payouts`}  color="#d97706" />
          <StatCard icon={BarChart2}    label="Total Payouts"    value={payouts.length}       sub={`${payouts.filter((p) => p.status === 'CANCELLED').length} cancelled`} />
        </div>
      )}

      {isLoading ? <ListSkeleton rows={5} cols={4} /> : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No payouts" description="No payout records for the selected filters" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Draw', 'Chit', 'Member', 'Winning Amt', 'Withheld Instmt', 'Net Payout', 'Disbursed', 'Status', 'Date', ''].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => nav(`/payouts/${p.id}`)}>
                    <td className="px-3 py-2.5 font-semibold text-gray-700">{drawLabel(chitStartMap[String(p.chitId)], p.monthNumber)}</td>
                    <td className="px-3 py-2.5">
                      <ChitLink id={p.chitId} name={resolveUUID(p.chitId, {}, chitMap, {})} />
                    </td>
                    <td className="px-3 py-2.5">
                      <MemberLink id={p.memberId} name={resolveUUID(p.memberId, memberMap, {}, staffMap)} />
                    </td>
                    <td className="px-3 py-2.5">{fmt(p.winningAmount)}</td>
                    <td className="px-3 py-2.5">
                      {Number(p.discountAmount) > 0
                        ? <span className="flex items-center gap-1 text-amber-700"><span className="text-green-600 font-bold">✓</span>{fmt(p.discountAmount)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{fmt(p.netPayoutAmount)}</td>
                    <td className="px-3 py-2.5 text-green-700 font-bold">{fmt(p.disbursedAmount)}</td>
                    <td className="px-3 py-2.5">
                      <Badge color={PY_STATUS_COLOR[p.status] ?? 'gray'} size="xs">{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtDate(p.createdAt ?? p.disbursedAt)}</td>
                    <td className="px-3 py-2.5"><ExternalLink size={12} className="text-gray-300 hover:text-[#1E3A5F]" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={5} className="px-3 py-3 text-gray-600">Total ({filtered.length})</td>
                  <td className="px-3 py-3">{fmt(filtered.reduce((s, p) => s + Number(p.netPayoutAmount ?? 0), 0))}</td>
                  <td className="px-3 py-3 text-green-700">{fmt(disbursedTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function resolveDescription(text, memberMap, chitMap, staffMap = {}) {
  if (!text) return '—';
  return text.replace(UUID_RE, (uuid) => {
    const key = uuid.toLowerCase();
    if (memberMap[key]) return memberMap[key];
    if (chitMap[key])   return chitMap[key];
    if (staffMap[key])  return `⚙ ${staffMap[key]}`;
    return uuid;
  });
}

function resolveDescriptionJsx(text, memberMap, chitMap, staffMap = {}) {
  if (!text) return <span className="text-gray-400">—</span>;
  const parts = text.split(UUID_RE);
  const matches = text.match(new RegExp(UUID_RE.source, 'gi')) ?? [];
  return (
    <span>
      {parts.map((part, i) => {
        const uuid = matches[i - 1];
        const resolved = uuid
          ? (memberMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-gray-900">{memberMap[uuid.toLowerCase()]}</strong>
              : chitMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-[#1E3A5F]">{chitMap[uuid.toLowerCase()]}</strong>
              : staffMap[uuid?.toLowerCase()]
              ? <strong key={i} className="font-semibold text-purple-700">⚙ {staffMap[uuid.toLowerCase()]}</strong>
              : <span key={i} className="text-gray-400 text-xs">{uuid}</span>)
          : null;
        return <span key={`p${i}`}>{i > 0 ? resolved : null}{part}</span>;
      })}
    </span>
  );
}

function resolveUUID(uuid, memberMap, chitMap, staffMap = {}) {
  if (!uuid) return '—';
  const key = String(uuid).toLowerCase();
  if (memberMap[key]) return memberMap[key];
  if (chitMap[key])   return chitMap[key];
  if (staffMap[key])  return `⚙ ${staffMap[key]}`;
  return String(uuid);
}

// ─── Treasury Tab ─────────────────────────────────────────────────────────────
function TreasuryTab() {
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [activePreset, setPreset] = useState('All Time');

  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
  });
  const { data: transactions = [], isLoading: loadingTxns } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: getWalletTransactions,
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members-all'], queryFn: () => getMembers({ size: 1000 }) });
  const { data: chits = [] }      = useQuery({ queryKey: ['chits'],   queryFn: () => getChits({ size: 200 }) });
  const { data: staffList = [] }  = useQuery({ queryKey: ['staff'],   queryFn: listStaff });

  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id).toLowerCase(), m.fullName ?? m.username]));
  const chitMap   = Object.fromEntries(chits.map((c) => [String(c.id).toLowerCase(), c.name]));
  const staffMap  = Object.fromEntries(staffList.map((s) => [String(s.id).toLowerCase(), s.fullName ?? s.username]));

  function onPreset(range) {
    setFrom(range.from);
    setTo(range.to);
    setPreset(PRESETS.find((p) => { const v = p.fn(); return v.from === range.from && v.to === range.to; })?.label ?? '');
  }

  const filtered = transactions.filter((t) => {
    const d = t.createdAt ?? t.transactionDate;
    if (!d) return true;
    const date = d.slice(0, 10);
    if (from && date < from) return false;
    if (to   && date > to)   return false;
    return true;
  });

  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const cashBalance  = Number(wallet?.cashBalance ?? 0);
  const bankBalance  = Number(wallet?.bankBalance ?? 0);
  const inflows  = filtered.filter((t) => Number(t.amount ?? 0) > 0).reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const outflows = filtered.filter((t) => Number(t.amount ?? 0) < 0).reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);

  const periodLabel = from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All Time';

  function handlePrint() {
    openPrint(`Treasury Report — ${periodLabel}`, `
      <div class="meta"><span><strong>Period:</strong> ${periodLabel}</span></div>
      <div class="summary">
        <div class="summary-item"><p class="lbl">Total Balance</p><p class="val">${fmt(totalBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Cash</p><p class="val">${fmt(cashBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Bank</p><p class="val">${fmt(bankBalance)}</p></div>
        <div class="summary-item"><p class="lbl">Inflows</p><p class="val" style="color:#166534">${fmt(inflows)}</p></div>
        <div class="summary-item"><p class="lbl">Outflows</p><p class="val" style="color:#991b1b">${fmt(outflows)}</p></div>
        <div class="summary-item"><p class="lbl">Transactions</p><p class="val">${filtered.length}</p></div>
      </div>
      <h2>Transaction History</h2>
      <table>
        <thead><tr><th>Date</th><th>Account</th><th>Direction</th><th>Category</th><th>Amount</th><th>Description</th></tr></thead>
        <tbody>
          ${filtered.map((t) => `<tr>
            <td>${fmtDate(t.createdAt ?? t.transactionDate)}</td>
            <td>${t.accountType ?? '—'}</td>
            <td style="color:${t.entryType === 'IN' ? '#166534' : '#991b1b'};font-weight:bold">${t.entryType ?? '—'}</td>
            <td>${t.category ?? '—'}</td>
            <td style="color:${t.entryType === 'IN' ? '#166534' : '#991b1b'};font-weight:bold">
              ${t.entryType === 'IN' ? '+' : '-'}${fmt(t.amount)}
            </td>
            <td>${resolveDescription(t.description ?? t.notes, memberMap, chitMap, staffMap)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Total (${filtered.length})</td><td style="color:#166534;font-weight:bold">+${fmt(inflows)} / <span style="color:#991b1b">-${fmt(outflows)}</span></td><td></td></tr></tfoot>
      </table>
    `);
  }

  if (loadingWallet || loadingTxns) return <ListSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-5">
      <DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} active={activePreset} onPreset={onPreset} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet}     label="Total Balance"  value={fmt(totalBalance)} color="#7c3aed" />
        <StatCard icon={Banknote}   label="Cash Balance"   value={fmt(cashBalance)}  color="#1E3A5F" />
        <StatCard icon={TrendingUp} label="Bank Balance"   value={fmt(bankBalance)}  color="#0891b2" />
        <StatCard icon={BarChart2}  label={`Inflows (${periodLabel})`} value={fmt(inflows)} sub={`Outflows: ${fmt(outflows)}`} color="#16a34a" />
      </div>

      <div className="flex justify-end">
        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg shadow hover:bg-[#162d4a] active:scale-95 transition-all">
          <Printer size={14} /> Print Report
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No transactions" description={transactions.length > 0 ? 'No transactions in the selected period' : 'No wallet transactions recorded yet'} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Transaction History</h3>
            <span className="text-xs text-gray-400">{filtered.length} of {transactions.length} transactions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Account', 'Direction', 'Category', 'Amount', 'Description'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id ?? i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(t.createdAt ?? t.transactionDate)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.accountType ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${t.entryType === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.entryType ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.category ?? '—'}</td>
                    <td className={`px-4 py-2.5 font-bold ${t.entryType === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                      {t.entryType === 'IN' ? '+' : '-'}{fmt(t.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[220px]">
                      <span title={t.description ?? t.notes ?? ''} className="block truncate cursor-help">
                        {resolveDescriptionJsx(t.description ?? t.notes, memberMap, chitMap, staffMap)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 text-xs font-semibold">
                  <td colSpan={4} className="px-4 py-2.5 text-gray-600">Total ({filtered.length} transactions)</td>
                  <td className="px-4 py-2.5">
                    <span className="text-green-700">+{fmt(inflows)}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-red-600">-{fmt(outflows)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState('Overview');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Full visibility into members, chits, payments and treasury</p>
      </div>

      <TabBar active={tab} onChange={setTab} />

      <div>
        {tab === 'Overview'      && <OverviewTab />}
        {tab === 'Member Report' && <MemberReportTab />}
        {tab === 'Chit Report'   && <ChitReportTab />}
        {tab === 'Payments'      && <PaymentsTab />}
        {tab === 'Payouts'       && <PayoutsTab />}
        {tab === 'Treasury'      && <TreasuryTab />}
      </div>
    </div>
  );
}
