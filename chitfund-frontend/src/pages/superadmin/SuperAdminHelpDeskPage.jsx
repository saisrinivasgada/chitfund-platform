import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { superAdminSearchContactRequests } from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  MessageSquare, Building2, Mail, Phone, Clock, ChevronRight,
} from 'lucide-react';

const TYPE_LABEL = { PROSPECT: 'Prospect', ORG_SUPPORT: 'Org Support' };
const TYPE_COLOR = {
  PROSPECT:    { bg: '#EFF4FA', text: '#1E3A5F', border: '#B8CCE4' },
  ORG_SUPPORT: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
};
const STATUS_META = {
  NEW:      { bg: '#FEE2E2', text: '#991B1B',  label: 'New' },
  OPEN:     { bg: '#DBEAFE', text: '#1E40AF',  label: 'Open' },
  ON_HOLD:  { bg: '#FEF9C3', text: '#854D0E',  label: 'On Hold' },
  RESOLVED: { bg: '#D1FAE5', text: '#065F46',  label: 'Resolved' },
  CLOSED:   { bg: '#F3F4F6', text: '#6B7280',  label: 'Closed' },
};

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function ContactRow({ item, onClick }) {
  const tc = TYPE_COLOR[item.type] ?? TYPE_COLOR.PROSPECT;
  const sm = STATUS_META[item.status] ?? STATUS_META.NEW;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all cursor-pointer text-left"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
        style={{ backgroundColor: '#1E3A5F' }}>
        {(item.name ?? '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900">{item.name ?? '—'}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
            style={{ backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }}>
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: sm.bg, color: sm.text }}>
            {sm.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {item.subject && <span className="font-medium text-gray-700">{item.subject}</span>}
          {item.email && (
            <span className="flex items-center gap-1"><Mail size={11} />{item.email}</span>
          )}
          {item.phone && (
            <span className="flex items-center gap-1"><Phone size={11} />{item.phone}</span>
          )}
          {item.tenantName && (
            <span className="flex items-center gap-1"><Building2 size={11} />{item.tenantName}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {new Date(item.createdAt).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      </div>
      <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}

export default function SuperAdminHelpDeskPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);
  const size = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-helpdesk-search', type, status, fromDate, toDate, page],
    queryFn: () => superAdminSearchContactRequests({ type, status, fromDate, toDate, page, size }),
    staleTime: 30_000,
  });

  const items = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  function resetToFirstPage(setter) {
    return (val) => { setter(val); setPage(0); };
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF2F8' }}>
          <MessageSquare size={18} style={{ color: '#1E3A5F' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Helpdesk
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Support requests, inquiries from prospects and issues from registered orgs
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={type}
          onChange={resetToFirstPage(setType)}
          placeholder="All types"
          options={[
            { value: 'PROSPECT', label: 'Prospect' },
            { value: 'ORG_SUPPORT', label: 'Org Support' },
          ]}
        />
        <Select
          value={status}
          onChange={resetToFirstPage(setStatus)}
          placeholder="All statuses"
          options={[
            { value: 'NEW', label: 'New' },
            { value: 'OPEN', label: 'Open' },
            { value: 'ON_HOLD', label: 'On Hold' },
            { value: 'RESOLVED', label: 'Resolved' },
            { value: 'CLOSED', label: 'Closed' },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => resetToFirstPage(setFromDate)(e.target.value)}
            className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => resetToFirstPage(setToDate)(e.target.value)}
            className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {(type || status || fromDate || toDate) && (
          <button
            onClick={() => { setType(''); setStatus(''); setFromDate(''); setToDate(''); setPage(0); }}
            className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No requests found</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <ContactRow
                key={item.id}
                item={item}
                onClick={() => navigate(`/superadmin/helpdesk/${item.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-400">
              {totalElements} total &middot; page {page + 1} of {Math.max(totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
