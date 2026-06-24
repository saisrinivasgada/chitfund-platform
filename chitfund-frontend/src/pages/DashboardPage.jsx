import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getChits, getMembers, getPendingPayouts, getWalletBalance,
  getActiveCashRequests, getPendingRemittance, listStaff,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useHiddenAmounts } from '../hooks/useHiddenAmounts';
import Badge, { statusBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import WorkerHomePage from './worker/WorkerHomePage';
import ManagerHomePage from './manager/ManagerHomePage';
import TodaysActivityFeed from '../components/TodaysActivityFeed';
import {
  BookOpen, Users, CreditCard, Banknote, Plus, UserPlus,
  ArrowRight, Eye, EyeOff, Wallet, Truck, Clock, Calendar,
} from 'lucide-react';

const HIDDEN_PLACEHOLDER = '••••••';

// ── Reusable section separator ──────────────────────────────────────────────
function SectionHeader({ icon: Icon, color, title, linkLabel, onLink }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Icon size={14} style={{ color }} />
        <span className="text-sm font-semibold text-gray-700">{title}</span>
      </div>
      <div className="flex-1 h-px bg-gray-100" />
      {onLink && (
        <button
          type="button"
          onClick={onLink}
          className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium flex-shrink-0"
        >
          {linkLabel} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

// ── Standard stat card ───────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">
          {hidden ? HIDDEN_PLACEHOLDER : (value ?? '—')}
        </p>
        {sub && !hidden && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Remittance card — shows amount + collector breakdown ─────────────────────
function RemittanceCard({ batches, staffMap, hidden }) {
  const total = batches.length;
  const totalAmt = batches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
  const uniqueIds = [...new Set(batches.map((b) => String(b.collectedBy)))];
  const workers  = uniqueIds.filter((id) => staffMap[id]?.role === 'WORKER').length;
  const managers = uniqueIds.filter((id) => staffMap[id]?.role === 'MANAGER').length;

  const parts = [];
  if (workers  > 0) parts.push(`${workers} worker${workers  !== 1 ? 's' : ''}`);
  if (managers > 0) parts.push(`${managers} manager${managers !== 1 ? 's' : ''}`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#D9770618' }}
      >
        <Clock size={20} style={{ color: '#D97706' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">Remittance Awaiting</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{total}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {parts.length > 0 && (
            <span className="text-xs text-gray-400">{parts.join(' · ')}</span>
          )}
          {!hidden && totalAmt > 0 && (
            <span className="text-xs font-semibold text-amber-600">
              ₹{totalAmt.toLocaleString('en-IN')}
            </span>
          )}
          {hidden && total > 0 && (
            <span className="text-xs text-gray-400">{HIDDEN_PLACEHOLDER}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Treasury balance card ────────────────────────────────────────────────────
function TreasuryCard({ label, amount, icon: Icon, color, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">
          {hidden ? HIDDEN_PLACEHOLDER : `₹${Number(amount ?? 0).toLocaleString('en-IN')}`}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role === 'WORKER')  return <WorkerHomePage />;
  if (user?.role === 'MANAGER') return <ManagerHomePage />;

  const { hidden, toggle: toggleHidden } = useHiddenAmounts();
  const isAdmin = user?.role === 'ADMIN';

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
    staleTime: 5 * 60_000,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    staleTime: 5 * 60_000,
  });

  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: getPendingPayouts,
    staleTime: 2 * 60_000,
  });

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
    enabled: isAdmin,
    staleTime: 2 * 60_000,
  });

  const { data: cashRequests = [] } = useQuery({
    queryKey: ['cashRequests', 'active'],
    queryFn: getActiveCashRequests,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: remittanceBatches = [] } = useQuery({
    queryKey: ['remittance', 'pending'],
    queryFn: getPendingRemittance,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  const staffMap = Object.fromEntries(staff.map((s) => [String(s.id), s]));

  const today = new Date().toISOString().split('T')[0];
  const todaysPickups = cashRequests.filter((r) => r.requestedAt?.startsWith(today));
  const activeChits   = chits.filter((c) => c.status === 'ACTIVE');

  const showCashSection = isAdmin;

  if (chitsLoading || membersLoading) return <PageSpinner />;

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Welcome back, {user?.name ?? 'Admin'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Here's what's happening with your chit funds today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHidden}
            title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <Button onClick={() => navigate('/chits')} size="md">
            <Plus size={15} /> New Chit
          </Button>
          <Button variant="secondary" onClick={() => navigate('/members')} size="md">
            <UserPlus size={15} /> Add Member
          </Button>
        </div>
      </div>

      {/* ── At a Glance ─────────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={BookOpen} color="#1E3A5F" title="At a Glance" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={BookOpen}
            label="Total Chits"
            value={chits.length}
            color="#1E3A5F"
            sub={`${activeChits.length} active`}
            hidden={false}
          />
          <StatCard
            icon={CreditCard}
            label="Active Chits"
            value={activeChits.length}
            color="#16A34A"
            hidden={false}
          />
          <StatCard
            icon={Users}
            label="Total Members"
            value={members.length}
            color="#D4A017"
            hidden={false}
          />
          <StatCard
            icon={Banknote}
            label="Pending Payouts"
            value={pendingPayouts.length}
            color="#DC2626"
            hidden={false}
          />
        </div>
      </div>

      {/* ── Cash Collections ────────────────────────────────────────────── */}
      {showCashSection && (
        <div>
          <SectionHeader
            icon={Truck}
            color="#7C3AED"
            title="Cash Collections"
            linkLabel="View requests"
            onLink={() => navigate('/payments/cash-requests')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Truck}
              label="Active Cash Pickups"
              value={cashRequests.length}
              color="#7C3AED"
              sub="scheduled, pending collection"
              hidden={false}
            />
            <StatCard
              icon={Calendar}
              label="Today's Requests"
              value={todaysPickups.length}
              color="#0891B2"
              sub="raised today"
              hidden={false}
            />
            <RemittanceCard
              batches={remittanceBatches}
              staffMap={staffMap}
              hidden={hidden}
            />
          </div>
        </div>
      )}

      {/* ── Treasury ────────────────────────────────────────────────────── */}
      {isAdmin && walletBalance && (
        <div>
          <SectionHeader
            icon={Wallet}
            color="#D4A017"
            title="Treasury Balance"
            linkLabel="Manage"
            onLink={() => navigate('/treasury')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TreasuryCard
              label="Cash on Hand"
              amount={walletBalance.cashBalance}
              icon={Banknote}
              color="bg-[#1E3A5F]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Bank Balance"
              amount={walletBalance.bankBalance}
              icon={CreditCard}
              color="bg-[#16A34A]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Total Balance"
              amount={walletBalance.totalBalance}
              icon={Wallet}
              color="bg-[#D4A017]"
              hidden={hidden}
            />
          </div>
        </div>
      )}

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={BookOpen} color="#1E3A5F" title="Recent Activity" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent Chits */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <span className="text-sm font-semibold text-gray-800">Recent Chit Funds</span>
              <button
                type="button"
                onClick={() => navigate('/chits')}
                className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {chits.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">No chit funds yet</p>
              ) : (
                chits.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/chits/${c.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {hidden
                          ? `${HIDDEN_PLACEHOLDER} / month · ${c.totalMembers} members`
                          : `₹${c.installmentAmount?.toLocaleString()} / month · ${c.totalMembers} members`}
                      </p>
                    </div>
                    <Badge variant={statusBadge(c.status)}>{c.status}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Members */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <span className="text-sm font-semibold text-gray-800">Recent Members</span>
              <button
                type="button"
                onClick={() => navigate('/members')}
                className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {members.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">No members yet</p>
              ) : (
                members.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/members/${m.id}`)}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1E3A5F' }}
                    >
                      {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.fullName ?? m.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{m.phone}</p>
                    </div>
                    <Badge variant={statusBadge(m.status ?? 'ACTIVE')}>
                      {m.status ?? 'ACTIVE'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's Activity Feed ────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={Clock} color="#0891B2" title="Today's Activity" />
        <TodaysActivityFeed />
      </div>

    </div>
  );
}
