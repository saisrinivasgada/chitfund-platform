import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListContactRequests,
  superAdminUpdateContactStatus,
  superAdminUpdateContactMode,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  MessageSquare, Building2, Mail, Phone, Clock, ChevronDown, ChevronUp,
  Check, FolderOpen, PauseCircle, XCircle, RotateCcw, CalendarClock,
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
const MODE_META = {
  EMAIL: { label: 'Email',  color: '#1E40AF', bg: '#DBEAFE' },
  SMS:   { label: 'SMS',    color: '#065F46', bg: '#D1FAE5' },
  BOTH:  { label: 'Both',   color: '#6B21A8', bg: '#EDE9FE' },
};

function ContactModeToggle({ itemId, current, onModeChange, disabled }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 mr-0.5">Respond via:</span>
      {['EMAIL', 'SMS', 'BOTH'].map((mode) => {
        const meta = MODE_META[mode];
        const active = current === mode;
        return (
          <button
            key={mode}
            onClick={() => !active && onModeChange(itemId, mode)}
            disabled={disabled || active}
            className="px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer disabled:cursor-default"
            style={
              active
                ? { backgroundColor: meta.bg, color: meta.color, borderColor: meta.bg }
                : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }
            }
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function HoldPicker({ onConfirm, onCancel }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');

  function handleConfirm() {
    if (!date) return;
    onConfirm(`${date}T${time}:00`);
  }

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
      <CalendarClock size={14} className="text-amber-600 flex-shrink-0" />
      <span className="text-xs font-medium text-amber-800">Follow up on:</span>
      <input
        type="date"
        value={date}
        min={minDate}
        onChange={(e) => setDate(e.target.value)}
        className="text-xs border border-amber-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="text-xs border border-amber-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      <button
        onClick={handleConfirm}
        disabled={!date}
        className="px-3 py-1 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        Confirm Hold
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}

function StatusActions({ item, onStatusChange, onModeChange, isUpdating }) {
  const [showHoldPicker, setShowHoldPicker] = useState(false);
  const s = item.status;

  function doStatus(status, holdUntil) {
    onStatusChange(item.id, status, holdUntil);
    setShowHoldPicker(false);
  }

  function handleHoldConfirm(isoDateTime) {
    doStatus('ON_HOLD', isoDateTime);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Open */}
        {(s === 'NEW' || s === 'ON_HOLD' || s === 'RESOLVED' || s === 'CLOSED') && (
          <button
            onClick={() => doStatus('OPEN')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <FolderOpen size={12} /> Open
          </button>
        )}

        {/* On Hold */}
        {(s === 'NEW' || s === 'OPEN') && (
          <button
            onClick={() => setShowHoldPicker((v) => !v)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <PauseCircle size={12} /> On Hold
          </button>
        )}

        {/* Resolved */}
        {(s === 'NEW' || s === 'OPEN' || s === 'ON_HOLD') && (
          <button
            onClick={() => doStatus('RESOLVED')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Check size={12} /> Resolved
          </button>
        )}

        {/* Close */}
        {s !== 'CLOSED' && (
          <button
            onClick={() => doStatus('CLOSED')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <XCircle size={12} /> Close
          </button>
        )}

        {/* Reply via Email */}
        {item.email && (
          <a
            href={`mailto:${item.email}?subject=Re: ${encodeURIComponent(item.subject ?? 'Your enquiry')}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Mail size={12} /> Reply via Email
          </a>
        )}

        {/* Reply via SMS / WhatsApp */}
        {item.phone && (
          <a
            href={`sms:${item.phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <MessageSquare size={12} /> Reply via SMS
          </a>
        )}
      </div>

      {/* Hold date picker — inline */}
      {showHoldPicker && (
        <HoldPicker
          onConfirm={handleHoldConfirm}
          onCancel={() => setShowHoldPicker(false)}
        />
      )}

      {/* Contact mode switcher */}
      <ContactModeToggle
        itemId={item.id}
        current={item.preferredContact ?? 'EMAIL'}
        onModeChange={onModeChange}
        disabled={isUpdating}
      />
    </div>
  );
}

function ContactCard({ item, onStatusChange, onModeChange, isUpdating }) {
  const [expanded, setExpanded] = useState(item.status === 'NEW' || item.status === 'OPEN');
  const tc = TYPE_COLOR[item.type] ?? TYPE_COLOR.PROSPECT;
  const sm = STATUS_META[item.status] ?? STATUS_META.NEW;

  const holdDate = item.holdUntil
    ? new Date(item.holdUntil).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
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
              {item.status === 'ON_HOLD' && holdDate && (
                <span className="flex items-center gap-1 text-xs text-amber-700">
                  <CalendarClock size={11} /> Until {holdDate}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
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
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3">
            {item.subject && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
                <p className="text-sm font-medium text-gray-800">{item.subject}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.message}</p>
            </div>
            <div className="pt-2">
              <StatusActions
                item={item}
                onStatusChange={onStatusChange}
                onModeChange={onModeChange}
                isUpdating={isUpdating}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SuperAdminContactsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ALL');

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['superadmin-contacts'],
    queryFn: superAdminListContactRequests,
    staleTime: 30_000,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, holdUntil }) => superAdminUpdateContactStatus(id, status, holdUntil),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-contacts'] }),
  });

  const modeMut = useMutation({
    mutationFn: ({ id, mode }) => superAdminUpdateContactMode(id, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-contacts'] }),
  });

  const filtered = contacts.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'PROSPECT' || filter === 'ORG_SUPPORT') return c.type === filter;
    return c.status === filter;
  });

  const newCount  = contacts.filter((c) => c.status === 'NEW').length;
  const openCount = contacts.filter((c) => c.status === 'OPEN').length;
  const holdCount = contacts.filter((c) => c.status === 'ON_HOLD').length;

  const FILTERS = [
    { key: 'ALL',        label: 'All' },
    { key: 'NEW',        label: 'New',     badge: newCount },
    { key: 'OPEN',       label: 'Open',    badge: openCount },
    { key: 'ON_HOLD',    label: 'On Hold', badge: holdCount },
    { key: 'RESOLVED',   label: 'Resolved' },
    { key: 'CLOSED',     label: 'Closed' },
    { key: 'PROSPECT',   label: 'Prospects' },
    { key: 'ORG_SUPPORT',label: 'Org Support' },
  ];

  const isUpdating = statusMut.isPending || modeMut.isPending;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF2F8' }}>
          <MessageSquare size={18} style={{ color: '#1E3A5F' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Contact Requests
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Inquiries from prospects and support tickets from registered orgs
          </p>
        </div>
        {newCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center min-w-6 h-6 px-2 text-xs font-bold rounded-full bg-red-500 text-white">
            {newCount}
          </span>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              filter === key
                ? 'text-white'
                : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
            style={filter === key ? { backgroundColor: '#1E3A5F' } : {}}
          >
            {label}
            {badge > 0 && (
              <span className={`inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full ${
                filter === key ? 'bg-white text-[#1E3A5F]' : 'bg-red-500 text-white'
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <ContactCard
              key={item.id}
              item={item}
              onStatusChange={(id, status, holdUntil) => statusMut.mutate({ id, status, holdUntil })}
              onModeChange={(id, mode) => modeMut.mutate({ id, mode })}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
    </div>
  );
}
