import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSupportTicket, listMyTickets, getTicketMessages,
  sendTicketMessage, deleteTicketMessage, markTicketRead,
} from '../../services/api';
import { X, HeadphonesIcon, Send, ChevronLeft, CheckCircle, Loader2, Trash2 } from 'lucide-react';
import Button from '../ui/Button';

const TICKET_TYPES = [
  { value: 'BILLING', label: 'Billing' },
  { value: 'CHIT', label: 'Chit Issue' },
  { value: 'DRAW', label: 'Draw Issue' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'PAYOUT', label: 'Payout' },
  { value: 'MEMBER_MGMT', label: 'Member Management' },
  { value: 'ACCOUNT', label: 'Account' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'GENERAL', label: 'General' },
];

const STATUS_COLORS = {
  OPEN: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  ON_HOLD: 'bg-gray-100 text-gray-600',
  RESOLVED: 'bg-green-50 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-400',
};

const DELETE_WINDOW_MS = 5 * 60 * 1000;

function NewTicketForm({ onSuccess, onCancel }) {
  const [type, setType] = useState('GENERAL');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: (ticket) => { setDone(true); setTimeout(() => onSuccess(ticket), 1500); },
  });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle size={36} className="text-green-500" />
        <p className="font-semibold text-gray-900">Ticket submitted!</p>
        <p className="text-sm text-gray-400">Our team will respond shortly. Opening your ticket…</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate({ type, subject: subject.trim(), description: description.trim() || undefined }); }}
          className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Issue type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
        >
          {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Briefly describe your issue"
          maxLength={255}
          required
          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Description <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any additional details…"
          maxLength={5000}
          rows={4}
          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white resize-none"
        />
      </div>
      {mut.isError && (
        <p className="text-xs text-red-500">{mut.error?.response?.data?.message ?? 'Failed to submit. Please try again.'}</p>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <Button variant="muted" size="md" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="md" type="submit" loading={mut.isPending}
                disabled={!subject.trim() || mut.isPending}>
          <Send size={14} /> Submit
        </Button>
      </div>
    </form>
  );
}

function TicketList({ onOpen, onNewTicket }) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => listMyTickets({ page: 0, size: 20 }),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  const tickets = data?.items ?? [];

  if (tickets.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-gray-400 mb-4">No tickets yet</p>
        <Button variant="primary" size="sm" onClick={onNewTicket}>Open a ticket</Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {tickets.map(ticket => (
        <button key={ticket.id} onClick={() => onOpen(ticket)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
              <p className="text-xs text-gray-400 mt-0.5">#{ticket.ticketNumber}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {ticket.status.replace('_', ' ')}
              </span>
              {ticket.unreadCount > 0 && (
                <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {ticket.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function TicketChat({ ticket, onBack, currentUserId }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const bottomRef = useRef(null);
  const qc = useQueryClient();

  useEffect(() => {
    markTicketRead(ticket.id).catch(() => {});
    getTicketMessages(ticket.id, { limit: 50 }).then(data => {
      const msgs = [...(data.items ?? [])].reverse();
      setMessages(msgs);
      setCursor(data.nextCursor ?? null);
      setHasMore(data.hasNext ?? false);
      setLoading(false);
    });
    const ticker = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(ticker);
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMut = useMutation({
    mutationFn: (content) => sendTicketMessage(ticket.id, content),
    onSuccess: (msg) => {
      setMessages(prev => [...prev, msg]);
      setInput('');
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    },
  });

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sendMut.isPending) return;
    sendMut.mutate(input.trim());
  }

  async function loadMore() {
    if (!cursor || !hasMore) return;
    const data = await getTicketMessages(ticket.id, { cursor, limit: 50 });
    const older = [...(data.items ?? [])].reverse();
    setMessages(prev => [...older, ...prev]);
    setCursor(data.nextCursor ?? null);
    setHasMore(data.hasNext ?? false);
  }

  async function handleDelete(msg) {
    await deleteTicketMessage(ticket.id, msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, deleted: true, content: 'This message was deleted' } : m));
  }

  const canDelete = (msg) =>
    msg.senderId === currentUserId &&
    !msg.deleted &&
    (now - new Date(msg.createdAt).getTime()) < DELETE_WINDOW_MS;

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="flex flex-col h-full">
      {/* Back + ticket header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={onBack} className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 cursor-pointer">
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{ticket.subject}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">#{ticket.ticketNumber}</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[ticket.status] ?? ''}`}>
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {hasMore && (
          <button onClick={loadMore} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 cursor-pointer">
            Load older messages
          </button>
        )}
        {messages.map(msg => {
          const isMe = msg.senderType === 'ORG_ADMIN';
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`group max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMe && <p className="text-xs text-gray-400 mb-1">{msg.senderName}</p>}
                <div className="flex items-end gap-1">
                  {isMe && canDelete(msg) && (
                    <button onClick={() => handleDelete(msg)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-red-400 hover:text-red-600 cursor-pointer">
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-sm ${
                    isMe ? 'bg-[#1E3A5F] text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  } ${msg.deleted ? 'italic opacity-60' : ''}`}>
                    {msg.content}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send box */}
      {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' ? (
        <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 border-t border-gray-100">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
          />
          <button type="submit" disabled={!input.trim() || sendMut.isPending}
                  className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#1E3A5F' }}>
            {sendMut.isPending ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} className="text-white" />}
          </button>
        </form>
      ) : (
        <p className="text-xs text-center text-gray-400 py-3 border-t border-gray-100">
          This ticket is {ticket.status.toLowerCase()}. Open a new ticket if you need further help.
        </p>
      )}
    </div>
  );
}

export default function ContactChitWiseModal({ onClose, currentUserId }) {
  const [tab, setTab] = useState('new');
  const [openTicket, setOpenTicket] = useState(null);

  function handleNewTicketSuccess(ticket) {
    setOpenTicket(ticket);
  }

  const tabClass = (t) => `flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
    tab === t ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-gray-400 hover:text-gray-600'
  }`;

  const title = openTicket ? openTicket.subject : 'Contact ChitWise';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full border border-gray-100 flex flex-col"
           style={{ maxWidth: 480, height: openTicket ? 560 : 'auto', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2F8' }}>
              <HeadphonesIcon size={17} style={{ color: '#1E3A5F' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
                {title}
              </h2>
              {!openTicket && <p className="text-xs text-gray-400 mt-0.5">ChitWise support team</p>}
            </div>
          </div>
          <button onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        {openTicket ? (
          <div className="flex-1 overflow-hidden min-h-0">
            <TicketChat
              ticket={openTicket}
              onBack={() => { setOpenTicket(null); setTab('tickets'); }}
              currentUserId={currentUserId}
            />
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              <button className={tabClass('new')} onClick={() => setTab('new')}>New Ticket</button>
              <button className={tabClass('tickets')} onClick={() => setTab('tickets')}>My Tickets</button>
            </div>

            {/* Tab content */}
            <div className="px-6 py-5 overflow-y-auto">
              {tab === 'new' ? (
                <NewTicketForm
                  onSuccess={handleNewTicketSuccess}
                  onCancel={onClose}
                />
              ) : (
                <TicketList
                  onOpen={setOpenTicket}
                  onNewTicket={() => setTab('new')}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
