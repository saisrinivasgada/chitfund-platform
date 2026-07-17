import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMyAssignedRequests, getMyRequestHistory, getMembers, getChits } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  ClipboardList, IndianRupee, ArrowRight, Clock, HandCoins, CheckCircle,
} from 'lucide-react';

function fmt(n) {
  if (n == null) return '0';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ icon: Icon, label, value, color, sub }) {
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
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function StaffHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['staff-tasks'],
    queryFn: getMyAssignedRequests,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['staff-history'],
    queryFn: getMyRequestHistory,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers(),
  });

  const { data: chits = [] } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
  });

  const memberMap = Object.fromEntries(
    members.flatMap((m) => {
      const name = m.fullName ?? m.name ?? '—';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    })
  );
  const chitMap = Object.fromEntries(chits.map((c) => [c.id, c.name ?? c.chitName ?? '—']));

  // Amount in Hand = PICKED_UP + PARTIALLY_COLLECTED requests (worker has physical cash)
  const inHandRequests = tasks.filter((r) => r.status === 'PICKED_UP' || r.status === 'PARTIALLY_COLLECTED');
  const amountInHand = inHandRequests.reduce((sum, r) => {
    // For partial pickups, use collected amount; for full pickups, use requested amount
    const amt = r.status === 'PARTIALLY_COLLECTED' ? (r.collectedAmount ?? r.requestedAmount ?? 0) : (r.requestedAmount ?? 0);
    return sum + Number(amt);
  }, 0);

  // Remitted Today = COLLECTED requests updated today
  const todayStr = new Date().toDateString();
  const collectedHistory = history.filter((r) => r.status === 'COLLECTED');
  const remittedToday = collectedHistory.filter((r) => new Date(r.updatedAt).toDateString() === todayStr);
  const remittedTodayAmount = remittedToday.reduce((sum, r) => {
    const amt = r.collectedAmount ?? r.requestedAmount ?? 0;
    return sum + Number(amt);
  }, 0);

  // Active tasks = ASSIGNED status only (not yet picked up)
  const assignedTasks = tasks.filter((r) => r.status === 'ASSIGNED');

  if (tasksLoading || histLoading) return <PageSpinner />;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            {greeting()}, {user?.name ?? user?.username ?? 'Staff'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">Here's your collection overview for today.</p>
        </div>
        <Button onClick={() => navigate('/tasks')} size="md">
          <ClipboardList size={15} /> View All Tasks
        </Button>
      </div>

      {/* 3 Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={ClipboardList}
          label="Assigned Pickups"
          value={assignedTasks.length}
          color="#1E3A5F"
          sub={assignedTasks.length === 0 ? 'All clear' : 'Pending collection'}
        />
        <StatCard
          icon={HandCoins}
          label="Amount in Hand"
          value={amountInHand > 0 ? `₹${fmt(amountInHand)}` : '—'}
          color="#7C3AED"
          sub={inHandRequests.length > 0 ? `${inHandRequests.length} pickup${inHandRequests.length !== 1 ? 's' : ''} collected` : 'Nothing collected yet'}
        />
        <StatCard
          icon={CheckCircle}
          label="Remitted Today"
          value={remittedTodayAmount > 0 ? `₹${fmt(remittedTodayAmount)}` : '—'}
          color="#16A34A"
          sub={remittedToday.length > 0 ? `${remittedToday.length} handed to admin` : 'None today'}
        />
      </div>

      {/* Active Tasks Quick View */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} style={{ color: '#1E3A5F' }} />
            <h3 className="text-base font-semibold text-gray-900">Active Tasks</h3>
            {tasks.length > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                {tasks.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer"
            style={{ color: '#1E3A5F' }}
          >
            Go to tasks <ArrowRight size={13} />
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No active tasks right now</p>
          ) : (
            tasks.slice(0, 4).map((task) => {
              const isPartial = task.status === 'PARTIALLY_COLLECTED';
              const isPickedUp = task.status === 'PICKED_UP';
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate('/tasks')}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: '#1E3A5F' }}
                  >
                    {(memberMap[task.memberId] ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {memberMap[task.memberId] ?? task.memberId?.slice(0, 8) + '…'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {chitMap[task.chitId] ?? '—'} · Assigned {fmtDate(task.assignedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-gray-900 flex items-center gap-0.5">
                      <IndianRupee size={13} />
                      {fmt(isPartial ? (task.collectedAmount ?? task.requestedAmount) : task.requestedAmount)}
                    </span>
                    {isPartial && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        Partial
                      </span>
                    )}
                    {isPickedUp && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Picked Up
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {tasks.length > 4 && (
            <div className="px-6 py-3 text-center">
              <button
                onClick={() => navigate('/tasks')}
                className="text-sm font-medium cursor-pointer hover:underline"
                style={{ color: '#1E3A5F' }}
              >
                +{tasks.length - 4} more tasks → View all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock size={16} style={{ color: '#1E3A5F' }} />
              <h3 className="text-base font-semibold text-gray-900">Recent History</h3>
            </div>
            <button
              onClick={() => navigate('/tasks?tab=history')}
              className="flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer"
              style={{ color: '#1E3A5F' }}
            >
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {history.slice(0, 5).map((r) => {
              const amt = r.collectedAmount ?? r.requestedAmount;
              return (
                <div key={r.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {memberMap[r.memberId] ?? r.memberId?.slice(0, 8) + '…'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {chitMap[r.chitId] ?? '—'} · {fmtDate(r.updatedAt)}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-700 flex items-center gap-0.5 flex-shrink-0 text-sm">
                    <IndianRupee size={12} />
                    {fmt(amt)}
                  </span>
                  <Badge variant={r.status === 'COLLECTED' ? 'success' : 'danger'}>
                    {r.status === 'COLLECTED' ? 'Collected' : 'Cancelled'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
