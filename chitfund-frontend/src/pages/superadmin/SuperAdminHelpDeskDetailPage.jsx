import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminGetContactRequest,
  superAdminUpdateContactStatus,
  superAdminUpdateContactMode,
  superAdminListContactMessages,
  superAdminSendContactMessage,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  ArrowLeft, Building2, Mail, Phone, Clock, Send, Loader2,
  Check, FolderOpen, PauseCircle, XCircle, CalendarClock, MessageCircle,
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

function ContactModeToggle({ current, onModeChange, disabled }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 mr-0.5">Form of communication:</span>
      {['EMAIL', 'SMS', 'BOTH'].map((mode) => {
        const meta = MODE_META[mode];
        const active = current === mode;
        return (
          <button
            key={mode}
            onClick={() => !active && onModeChange(mode)}
            disabled={disabled || active}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer disabled:cursor-default"
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
      <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
        Cancel
      </button>
    </div>
  );
}

function StatusActions({ item, onStatusChange, isUpdating }) {
  const [showHoldPicker, setShowHoldPicker] = useState(false);
  const s = item.status;

  function doStatus(status, holdUntil) {
    onStatusChange(status, holdUntil);
    setShowHoldPicker(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(s === 'NEW' || s === 'ON_HOLD' || s === 'RESOLVED' || s === 'CLOSED') && (
          <button
            onClick={() => doStatus('OPEN')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <FolderOpen size={12} /> Open
          </button>
        )}
        {(s === 'NEW' || s === 'OPEN') && (
          <button
            onClick={() => setShowHoldPicker((v) => !v)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <PauseCircle size={12} /> On Hold
          </button>
        )}
        {(s === 'NEW' || s === 'OPEN' || s === 'ON_HOLD') && (
          <button
            onClick={() => doStatus('RESOLVED')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Check size={12} /> Resolved
          </button>
        )}
        {s !== 'CLOSED' && (
          <button
            onClick={() => doStatus('CLOSED')}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <XCircle size={12} /> Close
          </button>
        )}
        {item.email && (
          <a
            href={`mailto:${item.email}?subject=Re: ${encodeURIComponent(item.subject ?? 'Your enquiry')}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Mail size={12} /> Reply via Email
          </a>
        )}
        {item.phone && (
          <a
            href={`sms:${item.phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <MessageCircle size={12} /> Reply via SMS
          </a>
        )}
      </div>
      {showHoldPicker && (
        <HoldPicker onConfirm={(iso) => doStatus('ON_HOLD', iso)} onCancel={() => setShowHoldPicker(false)} />
      )}
    </div>
  );
}

function ConversationThread({ contactId }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['helpdesk-messages', contactId],
    queryFn: () => superAdminListContactMessages(contactId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const sendMutation = useMutation({
    mutationFn: (content) => superAdminSendContactMessage(contactId, content),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['helpdesk-messages', contactId] });
    },
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Conversation</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Internal reply log — visible to ChitWise staff. The requester is notified via their preferred contact mode above.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No replies yet. Send the first one below.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] flex flex-col items-end">
                <p className="text-[10px] text-gray-400 mb-0.5">{m.senderName}</p>
                <div className="px-3 py-2 rounded-2xl text-sm bg-blue-600 text-white break-words">
                  {m.content}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) sendMutation.mutate(draft.trim());
            }
          }}
          placeholder="Write a reply..."
          rows={1}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 max-h-28 overflow-y-auto"
        />
        <button
          onClick={() => draft.trim() && sendMutation.mutate(draft.trim())}
          disabled={!draft.trim() || sendMutation.isPending}
          className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors cursor-pointer flex-shrink-0"
        >
          {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function SuperAdminHelpDeskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ['helpdesk-item', id],
    queryFn: () => superAdminGetContactRequest(id),
    staleTime: 15_000,
  });

  const statusMut = useMutation({
    mutationFn: ({ status, holdUntil }) => superAdminUpdateContactStatus(id, status, holdUntil),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helpdesk-item', id] });
      qc.invalidateQueries({ queryKey: ['superadmin-helpdesk-search'] });
    },
  });

  const modeMut = useMutation({
    mutationFn: (mode) => superAdminUpdateContactMode(id, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['helpdesk-item', id] }),
  });

  if (isLoading) return <PageSpinner />;
  if (!item) return null;

  const tc = TYPE_COLOR[item.type] ?? TYPE_COLOR.PROSPECT;
  const sm = STATUS_META[item.status] ?? STATUS_META.NEW;
  const holdDate = item.holdUntil
    ? new Date(item.holdUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const isUpdating = statusMut.isPending || modeMut.isPending;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-5">
      <button
        onClick={() => navigate('/superadmin/helpdesk')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <ArrowLeft size={15} /> Back to Helpdesk
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}>
            {(item.name ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-lg font-bold text-gray-900">{item.name ?? '—'}</span>
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
              {item.email && <span className="flex items-center gap-1"><Mail size={11} />{item.email}</span>}
              {item.phone && <span className="flex items-center gap-1"><Phone size={11} />{item.phone}</span>}
              {item.tenantName && <span className="flex items-center gap-1"><Building2 size={11} />{item.tenantName}</span>}
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

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

        <div className="pt-2 border-t border-gray-100 space-y-3">
          <StatusActions
            item={item}
            onStatusChange={(status, holdUntil) => statusMut.mutate({ status, holdUntil })}
            isUpdating={isUpdating}
          />
          <ContactModeToggle
            current={item.preferredContact ?? 'EMAIL'}
            onModeChange={(mode) => modeMut.mutate(mode)}
            disabled={isUpdating}
          />
        </div>
      </div>

      <ConversationThread contactId={id} />
    </div>
  );
}
