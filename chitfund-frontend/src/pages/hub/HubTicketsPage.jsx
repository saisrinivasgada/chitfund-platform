import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { hubListTickets } from '../../services/api';
import { Ticket, ChevronRight, AlertCircle, Search, Flag, Building2, CalendarDays } from 'lucide-react';

const TYPES = ['INQUIRY', 'BILLING', 'CHIT', 'DRAW', 'PAYMENT', 'PAYOUT', 'MEMBER_MGMT', 'ACCOUNT', 'TECHNICAL', 'FEATURE_REQUEST', 'GENERAL'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
const TYPE_LABELS = {
  INQUIRY: 'Inquiry', BILLING: 'Billing', CHIT: 'Chit', DRAW: 'Draw', PAYMENT: 'Payment', PAYOUT: 'Payout',
  MEMBER_MGMT: 'Members', ACCOUNT: 'Account', TECHNICAL: 'Technical', FEATURE_REQUEST: 'Feature Request', GENERAL: 'General',
};
const STATUS_STYLES = {
  OPEN: 'bg-blue-50 text-blue-700', IN_PROGRESS: 'bg-amber-50 text-amber-700', ON_HOLD: 'bg-gray-100 text-gray-600',
  RESOLVED: 'bg-green-50 text-green-700', CLOSED: 'bg-red-50 text-red-500',
};

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function Select({ value, onChange, placeholder, children }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
    <option value="">{placeholder}</option>{children}
  </select>;
}

export default function HubTicketsPage() {
  const navigate = useNavigate();
  const empty = { status: '', type: '', priority: '', fromDate: '', toDate: '', q: '' };
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(0);
  const update = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(0); };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hub-tickets', filters, page],
    queryFn: () => hubListTickets({ page, size: 20, ...filters }),
    staleTime: 30000,
    refetchInterval: 30000,
  });
  const tickets = data?.items ?? [];

  return <div className="max-w-5xl mx-auto space-y-5">
    <div>
      <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Tickets</h1>
      <p className="text-sm text-gray-400 mt-1">Organization support and public inquiries in one place</p>
    </div>

    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={filters.q} onChange={e => update('q', e.target.value)} placeholder="Search ticket, subject, requester or organization"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filters.type} onChange={v => update('type', v)} placeholder="All types">
          {TYPES.map(v => <option key={v} value={v}>{TYPE_LABELS[v]}</option>)}
        </Select>
        <Select value={filters.status} onChange={v => update('status', v)} placeholder="All statuses">
          {STATUSES.map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
        </Select>
        <Select value={filters.priority} onChange={v => update('priority', v)} placeholder="All priorities">
          <option value="HIGH">Priority</option><option value="NORMAL">Normal</option>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">From
          <input type="date" value={filters.fromDate} onChange={e => update('fromDate', e.target.value)} className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">To
          <input type="date" value={filters.toDate} onChange={e => update('toDate', e.target.value)} className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg" />
        </label>
        {Object.values(filters).some(Boolean) && <button onClick={() => { setFilters(empty); setPage(0); }} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear filters</button>}
      </div>
    </div>

    {isLoading ? <div className="py-16 text-center text-gray-400 text-sm">Loading tickets…</div>
      : isError ? <div className="flex items-center justify-center gap-2 py-16 text-red-500 text-sm"><AlertCircle size={16} /> Failed to load tickets</div>
      : tickets.length === 0 ? <div className="flex flex-col items-center gap-3 py-16 text-gray-400"><Ticket size={32} className="opacity-30" /><p className="text-sm">No tickets found</p></div>
      : <div className="space-y-3">{tickets.map(item => {
        const priority = item.priority === 'HIGH' || item.priority === 'URGENT';
        return <button key={item.id} onClick={() => navigate(`/hub/tickets/${item.id}`)}
          className={`w-full flex items-center gap-3 p-4 bg-white rounded-2xl border shadow-sm hover:shadow-md text-left transition-all ${priority ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-100 hover:border-blue-200'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${priority ? 'bg-amber-100 text-amber-700' : 'bg-[#1E3A5F] text-white'}`}>
            {priority ? <Flag size={17} fill="currentColor" /> : <Ticket size={17} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs font-semibold text-gray-500">{item.ticketNumber}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{TYPE_LABELS[item.type] ?? item.type}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? 'bg-gray-100 text-gray-600'}`}>{item.status?.replace('_', ' ')}</span>
              {priority && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"><Flag size={10} fill="currentColor" /> PRIORITY</span>}
              {item.unreadCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">{item.unreadCount} new</span>}
            </div>
            <p className="text-sm font-semibold text-gray-800 truncate">{item.subject}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
              <span>{item.createdByName ?? 'Unknown requester'}</span>
              <span className="flex items-center gap-1"><Building2 size={11} />{item.tenantName ?? (item.source === 'PUBLIC' ? 'Public inquiry' : item.tenantId)}</span>
              <span className="flex items-center gap-1"><CalendarDays size={11} />{formatDate(item.createdAt)}</span>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>;
      })}</div>}

    <div className="flex items-center justify-between">
      <p className="text-xs text-gray-400">{data?.totalElements ?? 0} total · page {page + 1} of {Math.max(data?.totalPages ?? 1, 1)}</p>
      <div className="flex gap-2">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">Previous</button>
        <button disabled={!data?.hasNext} onClick={() => setPage(p => p + 1)} className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">Next</button>
      </div>
    </div>
  </div>;
}
