import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { hubListTickets } from '../../services/api';
import { Ticket, ChevronRight, AlertCircle } from 'lucide-react';

const TABS = [
  { label: 'All',         value: undefined },
  { label: 'Open',        value: 'OPEN' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'On Hold',     value: 'ON_HOLD' },
  { label: 'Resolved',    value: 'RESOLVED' },
  { label: 'Closed',      value: 'CLOSED' },
];

const TYPE_LABELS = {
  BILLING: 'Billing', CHIT: 'Chit', DRAW: 'Draw', PAYMENT: 'Payment',
  PAYOUT: 'Payout', MEMBER_MGMT: 'Members', ACCOUNT: 'Account',
  TECHNICAL: 'Technical', FEATURE_REQUEST: 'Feature Req', GENERAL: 'General',
};

const STATUS_STYLES = {
  OPEN:        'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  ON_HOLD:     'bg-gray-100 text-gray-600',
  RESOLVED:    'bg-green-50 text-green-700',
  CLOSED:      'bg-red-50 text-red-500',
};

function statusLabel(s) {
  return s?.replace('_', ' ') ?? s;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HubTicketsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(undefined);
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['hub-tickets', activeTab, page],
    queryFn: () => hubListTickets({ page, size: 20, status: activeTab }),
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const tickets = data?.items ?? data?.content ?? [];
  const hasNext = data?.hasNext ?? false;

  function handleTabChange(val) {
    setActiveTab(val);
    setPage(0);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
          Support Tickets
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit shadow-sm">
        {TABS.map(tab => (
          <button
            key={tab.label}
            onClick={() => handleTabChange(tab.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? 'bg-[#1E3A5F] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading tickets…</div>
        ) : isError ? (
          <div className="flex items-center justify-center gap-2 py-16 text-red-500 text-sm">
            <AlertCircle size={16} /> Failed to load tickets
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <Ticket size={32} className="opacity-30" />
            <p className="text-sm">No tickets here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ticket</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Subject</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Org</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr
                  key={ticket.id}
                  onClick={() => navigate(`/hub/tickets/${ticket.id}`)}
                  className={`border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer transition-colors ${
                    ticket.hubUnread > 0 ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500 font-medium whitespace-nowrap">
                    {ticket.ticketNumber ?? '—'}
                    {ticket.hubUnread > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full">
                        {ticket.hubUnread}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                      {TYPE_LABELS[ticket.type] ?? ticket.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-700 max-w-xs truncate">
                    {ticket.subject ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs truncate max-w-[120px]">
                    {ticket.tenantId ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {statusLabel(ticket.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                    {formatDate(ticket.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <ChevronRight size={15} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(page > 0 || hasNext) && (
        <div className="flex items-center gap-2 justify-end">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">Page {page + 1}</span>
          <button
            disabled={!hasNext}
            onClick={() => setPage(p => p + 1)}
            className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
