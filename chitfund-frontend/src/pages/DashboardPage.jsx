import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getChits, getMembers, getPendingPayouts, getWalletBalance } from '../services/api';
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
  ArrowRight, Eye, EyeOff, Wallet,
} from 'lucide-react';

const HIDDEN_PLACEHOLDER = '••••••';

function StatCard({ icon: Icon, label, value, color, sub, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-4">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">
          {hidden ? HIDDEN_PLACEHOLDER : (value ?? '—')}
        </p>
        {sub && !hidden && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function TreasuryCard({ label, amount, icon: Icon, color, hidden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">
          {hidden ? HIDDEN_PLACEHOLDER : `₹${Number(amount ?? 0).toLocaleString('en-IN')}`}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role === 'WORKER') return <WorkerHomePage />;
  if (user?.role === 'MANAGER') return <ManagerHomePage />;

  const { hidden, toggle: toggleHidden } = useHiddenAmounts();

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers(),
  });

  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: () => getPendingPayouts(),
  });

  const isAdmin = user?.role === 'ADMIN';

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
    enabled: isAdmin,
  });

  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  if (chitsLoading || membersLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Welcome back, {user?.name ?? (user?.role === 'MANAGER' ? 'Manager' : 'Admin')}
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Treasury Balance (admin only) */}
      {isAdmin && walletBalance && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Treasury Balance</h3>
            <button
              onClick={() => navigate('/treasury')}
              className="flex items-center gap-1 text-sm text-[#1E3A5F] hover:underline cursor-pointer font-medium"
            >
              Manage <ArrowRight size={13} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TreasuryCard
              label="Cash"
              amount={walletBalance.cashBalance}
              icon={Banknote}
              color="bg-[#1E3A5F]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Bank"
              amount={walletBalance.bankBalance}
              icon={CreditCard}
              color="bg-[#16A34A]"
              hidden={hidden}
            />
            <TreasuryCard
              label="Total"
              amount={walletBalance.totalBalance}
              icon={Wallet}
              color="bg-[#D4A017]"
              hidden={hidden}
            />
          </div>
        </div>
      )}

      {/* Recent Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Chits */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3
              className="text-base font-semibold text-gray-900"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Recent Chit Funds
            </h3>
            <button
              onClick={() => navigate('/chits')}
              className="flex items-center gap-1 text-sm text-[#1E3A5F] hover:underline cursor-pointer font-medium"
            >
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {chits.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No chit funds yet</p>
            ) : (
              chits.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/chits/${c.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {hidden
                        ? `${HIDDEN_PLACEHOLDER} / month • ${c.totalMembers} members`
                        : `₹${c.installmentAmount?.toLocaleString()} / month • ${c.totalMembers} members`}
                    </p>
                  </div>
                  <Badge variant={statusBadge(c.status)}>{c.status}</Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Members */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3
              className="text-base font-semibold text-gray-900"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Recent Members
            </h3>
            <button
              onClick={() => navigate('/members')}
              className="flex items-center gap-1 text-sm text-[#1E3A5F] hover:underline cursor-pointer font-medium"
            >
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {members.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No members yet</p>
            ) : (
              members.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
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

      {/* Today's Activity feed — admin and manager */}
      <TodaysActivityFeed />
    </div>
  );
}
