import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { searchAuditLogs } from '../services/api';

const TYPES = [
  ['ALL', 'All activity'], ['PAYMENT_BATCH', 'Payments'], ['CASH_REQUEST', 'Cash pickups'],
  ['CHIT_DRAW', 'Draws'], ['PAYOUT', 'Payouts'], ['CHIT', 'Chits'], ['MEMBER', 'Members'],
  ['SETTLEMENT', 'Settlements'], ['AUCTION_SESSION', 'Auctions'], ['TICKET', 'Tickets'],
];
const SOURCES = ['ALL', 'WEB', 'MOBILE', 'OFFLINE_SYNC', 'INTERNAL_API', 'WORKER', 'SYSTEM', 'UNKNOWN'];
const OUTCOMES = ['ALL', 'SUCCESS', 'FAILURE', 'DENIED'];

function label(value) {
  return String(value ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function dateBoundaryIso(value, endOfDay = false) {
  if (!value) return undefined;
  const local = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('ALL');
  const [outcome, setOutcome] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
    setExpanded(null);
  }, [type, outcome, source, from, to, debouncedSearch]);

  const { data: auditPage, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['organization-activity', type, outcome, source, from, to, debouncedSearch, page],
    queryFn: () => searchAuditLogs({
      entityType: type, outcome, source,
      from: dateBoundaryIso(from) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      to: dateBoundaryIso(to, true),
      q: debouncedSearch,
      page,
      size: 50,
    }),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const filtered = useMemo(() => {
    const events = auditPage?.content ?? [];
    const q = debouncedSearch.toLowerCase();
    if (!q) return events;
    return events.filter((event) => [event.action, event.entityType, event.entityId,
      event.chitId, event.actorId, event.actorRole, event.reason, event.source,
      event.outcome, event.metadata].some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [auditPage, debouncedSearch]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer" aria-label="Back to dashboard">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-[#EEF2F8] flex items-center justify-center">
            <Activity size={20} className="text-[#1E3A5F]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Organization Activity</h1>
            <p className="text-sm text-gray-500">A complete, read-only history across every chit and team member</p>
          </div>
        </div>
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPES.map(([value, text]) => (
            <button key={value} type="button" onClick={() => setType(value)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${type === value ? 'bg-[#1E3A5F] border-[#1E3A5F] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>{text}</button>
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, actor, chit, record or reason" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]" />
          </div>
          <label className="text-xs text-gray-500 flex items-center gap-2">From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="px-2 py-2 text-sm border border-gray-200 rounded-lg" /></label>
          <label className="text-xs text-gray-500 flex items-center gap-2">To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="px-2 py-2 text-sm border border-gray-200 rounded-lg" /></label>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"><option value="ALL">All outcomes</option>{OUTCOMES.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
          <select value={source} onChange={(event) => setSource(event.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"><option value="ALL">All sources</option>{SOURCES.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
        </div>
      </div>

      {isError ? (
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-sm text-red-700">Activity could not be loaded. Refresh and try again.</div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">Loading audited activity…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">No activity matches these filters.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {filtered.map((event) => {
            const failed = event.outcome === 'FAILURE' || event.outcome === 'DENIED';
            const when = event.occurredAt ?? event.createdAt;
            const isOpen = expanded === event.id;
            return (
              <button key={event.id} type="button" onClick={() => setExpanded(isOpen ? null : event.id)} className="w-full text-left px-5 py-4 hover:bg-gray-50 cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${failed ? 'bg-red-50' : 'bg-[#EEF2F8]'}`}>
                    {failed ? <ShieldAlert size={15} className="text-red-600" /> : <Activity size={15} className="text-[#1E3A5F]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${failed ? 'text-red-700' : 'text-gray-900'}`}>{label(event.action)}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{label(event.entityType)}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${failed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{label(event.outcome ?? 'SUCCESS')}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{event.actorRole ?? event.source ?? 'SYSTEM'} · {formatTime(when)}{event.reason ? ` · ${event.reason}` : ''}</p>
                    {isOpen && (
                      <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                        <div><span className="text-gray-400">Record</span><p className="font-mono text-gray-700 break-all">{event.entityId}</p></div>
                        {event.chitId && <div><span className="text-gray-400">Chit</span><p className="font-mono text-gray-700 break-all">{event.chitId}</p></div>}
                        <div><span className="text-gray-400">Source / correlation</span><p className="text-gray-700">{label(event.source)}{event.correlationId ? ` · ${event.correlationId}` : ''}</p></div>
                        {(event.beforeState || event.afterState) && <div><span className="text-gray-400">State change</span><p className="text-gray-700 break-all">{event.beforeState ?? '—'} → {event.afterState ?? '—'}</p></div>}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(when)}</span>
                </div>
              </button>
            );
          })}
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {(auditPage?.number ?? page) + 1} of {Math.max(auditPage?.totalPages ?? 1, 1)}
              {' · '}{auditPage?.totalElements ?? filtered.length} matching events
            </p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={auditPage?.first ?? page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Previous</button>
              <button type="button" disabled={auditPage?.last ?? true}
                onClick={() => setPage((value) => value + 1)}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
