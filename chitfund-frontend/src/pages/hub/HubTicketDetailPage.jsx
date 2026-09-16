import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  hubGetTicket, hubGetTicketMessages, hubSendTicketMessage,
  hubDeleteTicketMessage, hubUpdateTicketStatus, hubMarkTicketRead,
  hubListEmployees, hubAssignTicket,
  hubGetIdentityCaseByTicket, hubPrepareIdentityCase, hubApproveIdentityCase, hubRejectIdentityCase, hubExecuteIdentityCase,
} from '../../services/api';
import { ArrowLeft, Send, Trash2, ChevronUp, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';

const STATUS_STYLES = {
  OPEN:        'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  ON_HOLD:     'bg-gray-100 text-gray-600',
  RESOLVED:    'bg-green-50 text-green-700',
  CLOSED:      'bg-red-50 text-red-500',
};

const VALID_TRANSITIONS = {
  OPEN:        ['IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD:     ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED:    ['CLOSED'],
  CLOSED:      [],
};

const TYPE_LABELS = {
  INQUIRY: 'Inquiry',
  BILLING: 'Billing', CHIT: 'Chit', DRAW: 'Draw', PAYMENT: 'Payment',
  PAYOUT: 'Payout', MEMBER_MGMT: 'Members', ACCOUNT: 'Account',
  TECHNICAL: 'Technical', FEATURE_REQUEST: 'Feature Request', GENERAL: 'General',
};

const DELETE_WINDOW_MS = 5 * 60 * 1000;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}


function formatFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function IdentityCasePanel({ ticket, hubUser }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [oldUserId, setOldUserId] = useState(ticket.subjectUserId ?? '');
  const [phone, setPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [approvedLinks, setApprovedLinks] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const canRead = hubUser.canManageIdentityCases || hubUser.platformOwner;
  const { data: identityCase, isLoading } = useQuery({
    queryKey: ['hub-identity-case', ticket.id],
    queryFn: () => hubGetIdentityCaseByTicket(ticket.id),
    enabled: ticket.type === 'ACCOUNT' && canRead,
  });
  useEffect(() => {
    if (ticket.tenantId && ticket.subjectMemberId && !approvedLinks) {
      setApprovedLinks(`${ticket.tenantId}:${ticket.subjectMemberId}`);
    }
  }, [ticket.tenantId, ticket.subjectMemberId, approvedLinks]);
  const parsedLinks = approvedLinks.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [tenantId, memberId] = line.split(':').map(value => value.trim());
    return { tenantId, memberId };
  }).filter(link => link.tenantId && link.memberId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['hub-identity-case', ticket.id] });
  const prepare = useMutation({
    mutationFn: () => hubPrepareIdentityCase(identityCase.id, {
      reason: reason.trim(), oldUserId: oldUserId.trim() || undefined,
      phoneCountryCode: '+91', phone: phone.replace(/\D/g, '') || undefined,
      email: newEmail.trim().toLowerCase() || undefined,
      approvedMemberLinks: parsedLinks,
    }),
    onSuccess: () => { setReason(''); refresh(); },
  });
  const approve = useMutation({ mutationFn: () => hubApproveIdentityCase(identityCase.id, decisionReason.trim()), onSuccess: refresh });
  const reject = useMutation({ mutationFn: () => hubRejectIdentityCase(identityCase.id, decisionReason.trim()), onSuccess: refresh });
  const execute = useMutation({ mutationFn: () => hubExecuteIdentityCase(identityCase.id), onSuccess: refresh });
  if (ticket.type !== 'ACCOUNT') return null;
  if (!canRead) return <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This Account ticket has a protected identity case. Only selected identity investigators and the platform owner can open it.</div>;
  if (isLoading) return <div className="mb-4 text-sm text-gray-400">Loading protected identity case…</div>;
  if (!identityCase) return <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The structured identity case is missing. Do not resolve this ticket until it is repaired.</div>;
  let approvedProposal = null;
  try { approvedProposal = identityCase.proposalJson ? JSON.parse(identityCase.proposalJson) : null; } catch { /* malformed proposals are not rendered */ }
  const canPrepare = hubUser.canManageIdentityCases || hubUser.platformOwner;
  return <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#1E3A5F]">Protected Identity Case</p><p className="text-xs text-gray-500 mt-1">{identityCase.subtype?.replaceAll('_', ' ')} · immutable ticket link</p></div><span className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-xs font-bold text-blue-700">{identityCase.status?.replaceAll('_', ' ')}</span></div>
    {identityCase.proposalReason && <div className="rounded-xl bg-white border border-blue-100 p-3"><p className="text-xs font-semibold text-gray-500">Investigator proposal</p><p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{identityCase.proposalReason}</p></div>}
    {approvedProposal && <div className="rounded-xl bg-white border border-blue-100 p-3 text-xs text-gray-700"><p className="font-semibold text-gray-500 mb-2">Exact operation awaiting review</p><p>Old user: <span className="font-mono">{approvedProposal.oldUserId}</span></p><p>Phone: {approvedProposal.phoneCountryCode} {approvedProposal.phone}</p><p>New email: {approvedProposal.email}</p><p className="mt-1">Fresh-access profiles:</p><ul className="list-disc pl-5 font-mono">{(approvedProposal.approvedMemberLinks ?? []).map((link, index) => <li key={`${link.tenantId}:${link.memberId}:${index}`}>{link.tenantId} : {link.memberId}</li>)}</ul></div>}
    {canPrepare && ['OPEN','INVESTIGATING','REJECTED','EXECUTION_FAILED'].includes(identityCase.status) && <div className="space-y-3">
      {identityCase.subtype === 'PHONE_REASSIGNMENT' && <div className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><input value={oldUserId} onChange={e => setOldUserId(e.target.value)} placeholder="Old global user ID" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New identity email" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/></div><div><label className="text-xs font-semibold text-gray-600">Profiles approved for fresh app access</label><textarea value={approvedLinks} onChange={e => setApprovedLinks(e.target.value)} rows={3} placeholder="tenant UUID:member UUID (one per line)" className="mt-1 w-full px-3 py-2 rounded-lg border border-blue-200 text-sm font-mono"/><p className="text-xs text-gray-500 mt-1">Only these profiles receive requests. The new person verifies this email during setup; existing history is never transferred.</p></div></div>}
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Investigation findings and exact proposed resolution" className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm"/>
      <Button onClick={() => prepare.mutate()} disabled={!reason.trim() || (identityCase.subtype === 'PHONE_REASSIGNMENT' && (!oldUserId.trim() || !phone.trim() || !newEmail.trim() || parsedLinks.length === 0))} loading={prepare.isPending}>Submit for owner approval</Button>
    </div>}
    {hubUser.platformOwner && identityCase.status === 'PROPOSED' && <div className="space-y-3 border-t border-blue-200 pt-4"><textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} rows={2} placeholder="Mandatory approval or rejection reason" className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm"/><div className="flex gap-2"><Button onClick={() => approve.mutate()} disabled={!decisionReason.trim()} loading={approve.isPending}>Approve</Button><Button variant="secondary" onClick={() => reject.mutate()} disabled={!decisionReason.trim()} loading={reject.isPending}>Reject</Button></div><p className="text-xs text-gray-500">Approval does not delete, transfer, or rewrite financial history.</p></div>}
    {hubUser.platformOwner && ['APPROVED','EXECUTION_FAILED'].includes(identityCase.status) && identityCase.subtype === 'PHONE_REASSIGNMENT' && <Button onClick={() => execute.mutate()} loading={execute.isPending}>{identityCase.status === 'EXECUTION_FAILED' ? 'Retry Approved Operation' : 'Execute Approved Operation'}</Button>}
    {identityCase.status === 'EXECUTED' && <p className="text-sm font-semibold text-green-700">Completed. The old history stayed with the old identity; approved profiles now have fresh access requests.</p>}
    {prepare.error || approve.error || reject.error || execute.error ? <p className="text-sm text-red-700">{(prepare.error || approve.error || reject.error || execute.error)?.response?.data?.message ?? 'Identity case action failed'}</p> : null}
  </div>;
}

export default function HubTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const hubUser = (() => {
    try { return JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { return {}; }
  })();

  const { data: ticket, isLoading: ticketLoading, isError: ticketError } = useQuery({
    queryKey: ['hub-ticket', id],
    queryFn: () => hubGetTicket(id),
    onSuccess: () => hubMarkTicketRead(id).catch(() => {}),
  });

  const {
    data: msgPages,
    isLoading: msgsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['hub-ticket-messages', id],
    queryFn: ({ pageParam }) => hubGetTicketMessages(id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.nextCursor : undefined,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const messages = (msgPages?.pages ?? []).flatMap(p => p.items ?? []).reverse();

  const [content, setContent] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: () => hubSendTicketMessage(id, content.trim()),
    onSuccess: () => {
      setContent('');
      qc.invalidateQueries({ queryKey: ['hub-ticket-messages', id] });
      qc.invalidateQueries({ queryKey: ['hub-ticket', id] });
      qc.invalidateQueries({ queryKey: ['hub-tickets'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (msgId) => hubDeleteTicketMessage(id, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-ticket-messages', id] }),
  });

  const statusMut = useMutation({
    mutationFn: (status) => hubUpdateTicketStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub-ticket', id] });
      qc.invalidateQueries({ queryKey: ['hub-tickets'] });
    },
  });

  function canDelete(msg) {
    if (msg.deleted) return false;
    if (msg.senderType !== 'SUPER_ADMIN' && msg.senderType !== 'SUPPORT_AGENT') return false;
    if (msg.senderId !== hubUser.id && msg.senderUsername !== hubUser.username) return false;
    return Date.now() - new Date(msg.createdAt).getTime() < DELETE_WINDOW_MS;
  }

  const { data: employees = [] } = useQuery({
    queryKey: ['hub-employees'],
    queryFn: hubListEmployees,
    staleTime: 60000,
    enabled: hubUser.role === 'SUPER_ADMIN',
  });

  const assignMut = useMutation({
    mutationFn: (assigneeId) => hubAssignTicket(id, assigneeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub-ticket', id] }),
  });

  const currentStatus = ticket?.status;
  const nextStatuses = VALID_TRANSITIONS[currentStatus] ?? [];

  if (ticketLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Loading ticket…</div>
    );
  }

  if (ticketError || !ticket) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-red-500 text-sm">
        <AlertCircle size={16} /> Ticket not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <button
          onClick={() => navigate('/hub/tickets')}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors flex-shrink-0 mt-0.5"
        >
          <ArrowLeft size={15} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400 font-medium">{ticket.ticketNumber}</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
              {TYPE_LABELS[ticket.type] ?? ticket.type}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[currentStatus] ?? 'bg-gray-100 text-gray-500'}`}>
              {currentStatus?.replace('_', ' ')}
            </span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mt-1 truncate" style={{ fontFamily: 'Merriweather, serif' }}>
            {ticket.subject}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Org: <span>{ticket.tenantName ?? (ticket.source === 'PUBLIC' ? 'Public inquiry' : ticket.tenantId)}</span>
            {' · '}By: {ticket.createdByName ?? ticket.createdBy}
            {' · '}{formatFull(ticket.createdAt)}
          </p>
          {ticket.source === 'PUBLIC' && (
            <p className="text-xs text-gray-500 mt-1">
              {ticket.requesterEmail}
              {ticket.requesterPhone ? ` · ${ticket.requesterPhone}` : ''}
              {ticket.preferredContact ? ` · Prefers ${ticket.preferredContact.toLowerCase()}` : ''}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-gray-400">Assigned to:</span>
            {hubUser.role === 'SUPER_ADMIN' ? (
              <select
                value={ticket.assignedTo ?? ''}
                onChange={e => e.target.value && assignMut.mutate(e.target.value)}
                disabled={assignMut.isPending}
                className="text-xs px-2 py-0.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]/30 cursor-pointer disabled:opacity-50"
              >
                <option value="">Unassigned</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.username}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium text-gray-700">
                {ticket.assignedToName ?? ticket.assigneeName ?? 'Unassigned'}
              </span>
            )}
          </div>
        </div>

        {/* Status update */}
        {nextStatuses.length > 0 && (
          <div className="flex-shrink-0">
            <select
              disabled={statusMut.isPending}
              onChange={e => { if (e.target.value) statusMut.mutate(e.target.value); e.target.value = ''; }}
              defaultValue=""
              className="px-3 py-1.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 cursor-pointer disabled:opacity-50"
            >
              <option value="" disabled>Update status…</option>
              {nextStatuses.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <IdentityCasePanel ticket={ticket} hubUser={hubUser} />

      {/* Message thread */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Load more */}
          {hasNextPage && (
            <div className="flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronUp size={14} />
                {isFetchingNextPage ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}

          {msgsLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm">No messages yet. Start the conversation.</div>
          ) : (
            messages.map(msg => {
              const isHub = msg.senderType === 'SUPER_ADMIN' || msg.senderType === 'SUPPORT_AGENT';
              const isDeleted = msg.deleted || msg.deletedAt;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isHub ? 'justify-end' : 'justify-start'}`}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => setHoveredMsg(null)}
                >
                  <div className="relative max-w-[72%]">
                    {/* Sender label */}
                    <p className={`text-[11px] text-gray-400 mb-0.5 ${isHub ? 'text-right' : 'text-left'}`}>
                      {isHub ? (msg.senderName ?? 'Hub Staff') : (msg.senderName ?? 'Org Admin')}
                    </p>

                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isDeleted
                          ? 'bg-gray-50 text-gray-400 italic border border-gray-100'
                          : isHub
                          ? 'bg-[#1E3A5F] text-white'
                          : 'bg-gray-100 text-gray-900'
                      } ${isHub ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                    >
                      {isDeleted ? 'This message was deleted' : msg.content}
                    </div>

                    <div className={`flex items-center gap-2 mt-0.5 ${isHub ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[11px] text-gray-400">{formatTime(msg.createdAt)}</span>
                      {!isDeleted && canDelete(msg) && hoveredMsg === msg.id && (
                        <button
                          onClick={() => deleteMut.mutate(msg.id)}
                          disabled={deleteMut.isPending}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        {currentStatus !== 'CLOSED' ? (
          <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && content.trim()) {
                  e.preventDefault();
                  sendMut.mutate();
                }
              }}
              rows={2}
              placeholder="Reply to this ticket…"
              className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
            />
            <button
              onClick={() => sendMut.mutate()}
              disabled={!content.trim() || sendMut.isPending}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-opacity disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className="border-t border-gray-100 p-3 text-center text-xs text-gray-400">
            This ticket is closed. No further replies allowed.
          </div>
        )}
      </div>
    </div>
  );
}
