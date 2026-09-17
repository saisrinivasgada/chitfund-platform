import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  hubListTickets, hubGetTicket, hubGetTicketMessages, hubSendTicketMessage,
  hubDeleteTicketMessage, hubUpdateTicketStatus, hubMarkTicketRead,
  hubListEmployees, hubAssignTicket,
  hubGetIdentityCaseByTicket, hubPrepareIdentityCase, hubApproveIdentityCase,
  hubRejectIdentityCase, hubExecuteIdentityCase,
  hubCreateTicket, hubListTenants,
} from '../../services/api';
import { Inbox, Send, Trash2, ChevronUp, AlertCircle, Search, Flag, Building2, Plus, X } from 'lucide-react';
import Button from '../../components/ui/Button';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPES = ['INQUIRY','BILLING','CHIT','DRAW','PAYMENT','PAYOUT','MEMBER_MGMT','ACCOUNT','TECHNICAL','FEATURE_REQUEST','GENERAL'];
const STATUSES = ['OPEN','IN_PROGRESS','ON_HOLD','RESOLVED','CLOSED'];
const TYPE_LABELS = {
  INQUIRY:'Inquiry', BILLING:'Billing', CHIT:'Chit', DRAW:'Draw', PAYMENT:'Payment',
  PAYOUT:'Payout', MEMBER_MGMT:'Members', ACCOUNT:'Account',
  TECHNICAL:'Technical', FEATURE_REQUEST:'Feature Request', GENERAL:'General',
};
const STATUS_STYLES = {
  OPEN:'bg-blue-50 text-blue-700', IN_PROGRESS:'bg-amber-50 text-amber-700',
  ON_HOLD:'bg-gray-100 text-gray-600', RESOLVED:'bg-green-50 text-green-700',
  CLOSED:'bg-red-50 text-red-500',
};
const VALID_TRANSITIONS = {
  OPEN:['IN_PROGRESS','ON_HOLD','RESOLVED','CLOSED'],
  IN_PROGRESS:['ON_HOLD','RESOLVED','CLOSED'],
  ON_HOLD:['IN_PROGRESS','RESOLVED','CLOSED'],
  RESOLVED:['CLOSED'],
  CLOSED:[],
};
const ACTIVE_STATUSES = new Set(['OPEN','IN_PROGRESS','ON_HOLD']);
const DELETE_WINDOW_MS = 5 * 60 * 1000;

// ─── SLA ──────────────────────────────────────────────────────────────────────

const SLA_MS = {
  URGENT: { response: 60 * 60_000,    resolve: 4 * 3600_000 },
  HIGH:   { response: 2 * 3600_000,   resolve: 8 * 3600_000 },
  NORMAL: { response: 8 * 3600_000,   resolve: 24 * 3600_000 },
  LOW:    { response: 24 * 3600_000,  resolve: 72 * 3600_000 },
};

function useSlaTimer(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function computeSla(ticket, now) {
  if (!ticket?.createdAt) return null;
  const targets = SLA_MS[ticket.priority] ?? SLA_MS.NORMAL;
  const elapsed = now - new Date(ticket.createdAt).getTime();
  const responsePercent = Math.min(100, (elapsed / targets.response) * 100);
  const resolvePercent  = Math.min(100, (elapsed / targets.resolve) * 100);
  const level = resolvePercent >= 100 ? 'breach' : resolvePercent >= 75 ? 'warn' : 'ok';
  return {
    elapsed, responsePercent, resolvePercent, level,
    responseBreach: responsePercent >= 100, resolveBreach: resolvePercent >= 100,
    responseRemaining: targets.response - elapsed,
    resolveRemaining:  targets.resolve  - elapsed,
  };
}

function formatDuration(ms) {
  if (ms <= 0) return 'Breached';
  const totalMins = Math.floor(ms / 60_000);
  const d = Math.floor(totalMins / 1440);
  const h = Math.floor((totalMins % 1440) / 60);
  const m = totalMins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function slaBarColor(pct) {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 75)  return 'bg-amber-400';
  return 'bg-green-500';
}

function slaEdgeColor(level) {
  if (level === 'breach') return 'bg-red-500';
  if (level === 'warn')   return 'bg-amber-400';
  return 'bg-green-500';
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Identity Case Panel (unchanged from HubTicketDetailPage) ─────────────────

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
  const parsedLinks = approvedLinks.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [tenantId, memberId] = l.split(':').map(v => v.trim());
    return { tenantId, memberId };
  }).filter(l => l.tenantId && l.memberId);
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
  const reject  = useMutation({ mutationFn: () => hubRejectIdentityCase(identityCase.id, decisionReason.trim()), onSuccess: refresh });
  const execute = useMutation({ mutationFn: () => hubExecuteIdentityCase(identityCase.id), onSuccess: refresh });
  if (ticket.type !== 'ACCOUNT') return null;
  if (!canRead) return <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex-shrink-0">This Account ticket has a protected identity case. Only selected identity investigators and the platform owner can open it.</div>;
  if (isLoading) return <div className="mx-4 mt-3 text-sm text-gray-400 flex-shrink-0">Loading protected identity case…</div>;
  if (!identityCase) return <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex-shrink-0">The structured identity case is missing. Do not resolve this ticket until it is repaired.</div>;
  let approvedProposal = null;
  try { approvedProposal = identityCase.proposalJson ? JSON.parse(identityCase.proposalJson) : null; } catch { /* malformed */ }
  const canPrepare = hubUser.canManageIdentityCases || hubUser.platformOwner;
  return (
    <div className="mx-4 mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-bold text-[#1E3A5F]">Protected Identity Case</p><p className="text-xs text-gray-500 mt-0.5">{identityCase.subtype?.replaceAll('_',' ')} · immutable ticket link</p></div>
        <span className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-xs font-bold text-blue-700">{identityCase.status?.replaceAll('_',' ')}</span>
      </div>
      {identityCase.proposalReason && <div className="rounded-xl bg-white border border-blue-100 p-3"><p className="text-xs font-semibold text-gray-500">Investigator proposal</p><p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{identityCase.proposalReason}</p></div>}
      {approvedProposal && <div className="rounded-xl bg-white border border-blue-100 p-3 text-xs text-gray-700"><p className="font-semibold text-gray-500 mb-2">Exact operation awaiting review</p><p>Old user: <span className="font-mono">{approvedProposal.oldUserId}</span></p><p>Phone: {approvedProposal.phoneCountryCode} {approvedProposal.phone}</p><p>New email: {approvedProposal.email}</p><p className="mt-1">Fresh-access profiles:</p><ul className="list-disc pl-5 font-mono">{(approvedProposal.approvedMemberLinks ?? []).map((link, i) => <li key={`${link.tenantId}:${link.memberId}:${i}`}>{link.tenantId} : {link.memberId}</li>)}</ul></div>}
      {canPrepare && ['OPEN','INVESTIGATING','REJECTED','EXECUTION_FAILED'].includes(identityCase.status) && (
        <div className="space-y-3">
          {identityCase.subtype === 'PHONE_REASSIGNMENT' && <div className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><input value={oldUserId} onChange={e => setOldUserId(e.target.value)} placeholder="Old global user ID" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New identity email" className="px-3 py-2 rounded-lg border border-blue-200 text-sm"/></div><div><label className="text-xs font-semibold text-gray-600">Profiles approved for fresh app access</label><textarea value={approvedLinks} onChange={e => setApprovedLinks(e.target.value)} rows={2} placeholder="tenant UUID:member UUID (one per line)" className="mt-1 w-full px-3 py-2 rounded-lg border border-blue-200 text-sm font-mono"/></div></div>}
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Investigation findings and proposed resolution" className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm"/>
          <Button onClick={() => prepare.mutate()} disabled={!reason.trim() || (identityCase.subtype === 'PHONE_REASSIGNMENT' && (!oldUserId.trim() || !phone.trim() || !newEmail.trim() || parsedLinks.length === 0))} loading={prepare.isPending}>Submit for owner approval</Button>
        </div>
      )}
      {hubUser.platformOwner && identityCase.status === 'PROPOSED' && (
        <div className="space-y-3 border-t border-blue-200 pt-3">
          <textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} rows={2} placeholder="Mandatory approval or rejection reason" className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm"/>
          <div className="flex gap-2"><Button onClick={() => approve.mutate()} disabled={!decisionReason.trim()} loading={approve.isPending}>Approve</Button><Button variant="secondary" onClick={() => reject.mutate()} disabled={!decisionReason.trim()} loading={reject.isPending}>Reject</Button></div>
        </div>
      )}
      {hubUser.platformOwner && ['APPROVED','EXECUTION_FAILED'].includes(identityCase.status) && identityCase.subtype === 'PHONE_REASSIGNMENT' && <Button onClick={() => execute.mutate()} loading={execute.isPending}>{identityCase.status === 'EXECUTION_FAILED' ? 'Retry Approved Operation' : 'Execute Approved Operation'}</Button>}
      {identityCase.status === 'EXECUTED' && <p className="text-sm font-semibold text-green-700">Completed. The old history stayed with the old identity; approved profiles now have fresh access requests.</p>}
      {(prepare.error || approve.error || reject.error || execute.error) && <p className="text-sm text-red-700">{(prepare.error || approve.error || reject.error || execute.error)?.response?.data?.message ?? 'Identity case action failed'}</p>}
    </div>
  );
}

// ─── SLA Panel (detail pane header) ──────────────────────────────────────────

function SlaPanel({ ticket, now }) {
  if (!ACTIVE_STATUSES.has(ticket?.status)) return null;
  const sla = computeSla(ticket, now);
  if (!sla) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {[
        { label: 'First Response SLA', pct: sla.responsePercent, remaining: sla.responseRemaining },
        { label: 'Resolution SLA',     pct: sla.resolvePercent,  remaining: sla.resolveRemaining  },
      ].map(({ label, pct, remaining }) => (
        <div key={label} className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-500">{label}</span>
            <span className={`text-[10px] font-bold ${pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatDuration(remaining)}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${slaBarColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Ticket detail (right pane) ───────────────────────────────────────────────

function TicketDetail({ id, hubUser, now }) {
  const qc = useQueryClient();

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['hub-ticket', id],
    queryFn: () => hubGetTicket(id),
    onSuccess: () => hubMarkTicketRead(id).catch(() => {}),
    enabled: !!id,
  });

  const { data: msgPages, isLoading: msgsLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['hub-ticket-messages', id],
    queryFn: ({ pageParam }) => hubGetTicketMessages(id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.nextCursor : undefined,
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: !!id,
  });

  const messages = (msgPages?.pages ?? []).flatMap(p => p.items ?? []).reverse();
  const [content, setContent] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

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

  function canDelete(msg) {
    if (msg.deleted) return false;
    if (msg.senderType !== 'SUPER_ADMIN' && msg.senderType !== 'SUPPORT_AGENT') return false;
    if (msg.senderId !== hubUser.id && msg.senderUsername !== hubUser.username) return false;
    return Date.now() - new Date(msg.createdAt).getTime() < DELETE_WINDOW_MS;
  }

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading ticket…</div>;
  if (isError || !ticket) return <div className="flex-1 flex items-center justify-center gap-2 text-red-500 text-sm"><AlertCircle size={16} /> Ticket not found</div>;

  const currentStatus = ticket.status;
  const nextStatuses  = VALID_TRANSITIONS[currentStatus] ?? [];
  const isPriority    = ticket.priority === 'HIGH' || ticket.priority === 'URGENT';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400 font-medium">{ticket.ticketNumber}</span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">{TYPE_LABELS[ticket.type] ?? ticket.type}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[currentStatus] ?? 'bg-gray-100 text-gray-500'}`}>{currentStatus?.replace('_',' ')}</span>
              {isPriority && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"><Flag size={10} fill="currentColor" /> PRIORITY</span>}
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-1 truncate" style={{ fontFamily: 'Merriweather, serif' }}>{ticket.subject}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <Building2 size={10} className="inline mr-1" />{ticket.tenantName ?? (ticket.source === 'PUBLIC' ? 'Public inquiry' : ticket.tenantId)}
              {' · '}{ticket.createdByName ?? ticket.createdBy}
              {' · '}{formatFull(ticket.createdAt)}
            </p>
            {ticket.source === 'PUBLIC' && (
              <p className="text-xs text-gray-500 mt-0.5">{ticket.requesterEmail}{ticket.requesterPhone ? ` · ${ticket.requesterPhone}` : ''}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400">Assigned:</span>
              {hubUser.role === 'SUPER_ADMIN' ? (
                <select value={ticket.assignedTo ?? ''} onChange={e => e.target.value && assignMut.mutate(e.target.value)} disabled={assignMut.isPending}
                  className="text-xs px-2 py-0.5 rounded-lg border border-gray-200 bg-white focus:outline-none cursor-pointer disabled:opacity-50">
                  <option value="">Unassigned</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.username}</option>)}
                </select>
              ) : (
                <span className="text-xs font-medium text-gray-700">{ticket.assignedToName ?? ticket.assigneeName ?? 'Unassigned'}</span>
              )}
            </div>
            {/* SLA */}
            <SlaPanel ticket={ticket} now={now} />
          </div>

          {/* Status update */}
          {nextStatuses.length > 0 && (
            <select disabled={statusMut.isPending} onChange={e => { if (e.target.value) statusMut.mutate(e.target.value); e.target.value = ''; }} defaultValue=""
              className="flex-shrink-0 px-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none cursor-pointer disabled:opacity-50">
              <option value="" disabled>Update status…</option>
              {nextStatuses.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Identity Case */}
      <IdentityCasePanel ticket={ticket} hubUser={hubUser} />

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {hasNextPage && (
          <div className="flex justify-center">
            <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronUp size={13} />{isFetchingNextPage ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {msgsLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">No messages yet. Start the conversation.</div>
        ) : messages.map(msg => {
          const isHub = msg.senderType === 'SUPER_ADMIN' || msg.senderType === 'SUPPORT_AGENT';
          const isDeleted = msg.deleted || msg.deletedAt;
          return (
            <div key={msg.id} className={`flex ${isHub ? 'justify-end' : 'justify-start'}`}
              onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => setHoveredMsg(null)}>
              <div className="relative max-w-[72%]">
                <p className={`text-[11px] text-gray-400 mb-0.5 ${isHub ? 'text-right' : 'text-left'}`}>
                  {isHub ? (msg.senderName ?? 'Hub Staff') : (msg.senderName ?? 'Org Admin')}
                </p>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isDeleted ? 'bg-gray-50 text-gray-400 italic border border-gray-100'
                  : isHub ? 'bg-[#1E3A5F] text-white' : 'bg-white text-gray-900 border border-gray-200'
                } ${isHub ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  {isDeleted ? 'This message was deleted' : msg.content}
                </div>
                <div className={`flex items-center gap-2 mt-0.5 ${isHub ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[11px] text-gray-400">{formatTime(msg.createdAt)}</span>
                  {!isDeleted && canDelete(msg) && hoveredMsg === msg.id && (
                    <button onClick={() => deleteMut.mutate(msg.id)} disabled={deleteMut.isPending} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {currentStatus !== 'CLOSED' ? (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 flex gap-2 items-end">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && content.trim()) { e.preventDefault(); sendMut.mutate(); } }}
            rows={2} placeholder="Reply to this ticket…"
            className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white" />
          <button onClick={() => sendMut.mutate()} disabled={!content.trim() || sendMut.isPending}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}>
            <Send size={16} />
          </button>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 text-center text-xs text-gray-400">
          This ticket is closed. No further replies allowed.
        </div>
      )}
    </div>
  );
}

// ─── Create Ticket Modal ──────────────────────────────────────────────────────

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

function CreateTicketModal({ onClose, onCreated }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tenantId: '', tenantName: '',
    type: 'INQUIRY', priority: 'NORMAL',
    subject: '', description: '',
    callerName: '', callerPhone: '', callerEmail: '',
  });
  const [tenantSearch, setTenantSearch] = useState('');
  const [showTenantList, setShowTenantList] = useState(false);
  const [error, setError] = useState('');
  const tenantRef = useRef(null);

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['hub-tenants', tenantSearch],
    queryFn: () => hubListTenants(tenantSearch || undefined),
    staleTime: 30_000,
    enabled: showTenantList,
  });

  useEffect(() => {
    function onClickOutside(e) {
      if (tenantRef.current && !tenantRef.current.contains(e.target)) setShowTenantList(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const createMut = useMutation({
    mutationFn: () => hubCreateTicket(form),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['hub-tickets'] });
      onCreated(ticket);
      onClose();
    },
    onError: (err) => setError(err?.response?.data?.message ?? 'Failed to create ticket'),
  });

  const isValid = form.tenantId && form.tenantName && form.subject.trim().length >= 5;

  function selectTenant(t) {
    setForm(f => ({ ...f, tenantId: t.id, tenantName: t.name }));
    setTenantSearch(t.name);
    setShowTenantList(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Create Ticket on Behalf
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Org selector */}
          <div ref={tenantRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={tenantSearch}
              onChange={e => { setTenantSearch(e.target.value); setShowTenantList(true); setForm(f => ({ ...f, tenantId: '', tenantName: '' })); }}
              onFocus={() => setShowTenantList(true)}
              placeholder="Search organizations…"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
            />
            {showTenantList && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {tenantsLoading ? (
                  <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
                ) : tenants.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-400">No organizations found</p>
                ) : tenants.map(t => (
                  <button key={t.id} onMouseDown={() => selectTenant(t)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 cursor-pointer">
                    <span className="font-medium text-gray-800">{t.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${t.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                  </button>
                ))}
              </div>
            )}
            {form.tenantId && <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{form.tenantId}</p>}
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type <span className="text-red-400">*</span></label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 cursor-pointer">
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority <span className="text-red-400">*</span></label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 cursor-pointer">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject <span className="text-red-400">*</span></label>
            <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief description of the issue"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Detailed description of the issue…"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] resize-none" />
          </div>

          {/* Caller info */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Caller Information (optional)</p>
            <div className="grid grid-cols-1 gap-3">
              <input type="text" value={form.callerName} onChange={e => setForm(f => ({ ...f, callerName: e.target.value }))}
                placeholder="Caller name"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              <div className="grid grid-cols-2 gap-3">
                <input type="tel" value={form.callerPhone} onChange={e => setForm(f => ({ ...f, callerPhone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
                <input type="email" value={form.callerEmail} onChange={e => setForm(f => ({ ...f, callerEmail: e.target.value }))}
                  placeholder="Email"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 flex items-center gap-1.5 mt-3"><AlertCircle size={13} />{error}</p>}

        <div className="flex gap-3 justify-end pt-4">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={() => createMut.mutate()} disabled={!isValid || createMut.isPending}
            className="px-4 py-2 text-sm rounded-xl text-white font-medium disabled:opacity-40 cursor-pointer transition-opacity"
            style={{ backgroundColor: '#1E3A5F' }}>
            {createMut.isPending ? 'Creating…' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export default function HubTicketWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useSlaTimer(true);

  const hubUser = (() => {
    try { return JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { return {}; }
  })();

  const [showCreate, setShowCreate] = useState(false);
  const empty = { status: '', type: '', priority: '', q: '' };
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(0);
  const update = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };

  const { data, isLoading } = useQuery({
    queryKey: ['hub-tickets', filters, page],
    queryFn: () => hubListTickets({ page, size: 25, ...filters }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const tickets = data?.items ?? [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane ──────────────────────────────────────────────────────── */}
      <div className="w-[380px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Filter bar */}
        <div className="flex-shrink-0 p-3 border-b border-gray-100 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={filters.q} onChange={e => update('q', e.target.value)}
                placeholder="Search tickets…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}
              title="Create ticket on behalf">
              <Plus size={15} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {[
              { key: 'status',   ph: 'Status',   opts: STATUSES.map(v => ({ v, l: v.replace('_',' ') })) },
              { key: 'type',     ph: 'Type',     opts: TYPES.map(v => ({ v, l: TYPE_LABELS[v] })) },
              { key: 'priority', ph: 'Priority', opts: [{ v: 'URGENT', l: 'Urgent' }, { v: 'HIGH', l: 'High' }, { v: 'NORMAL', l: 'Normal' }, { v: 'LOW', l: 'Low' }] },
            ].map(({ key, ph, opts }) => (
              <select key={key} value={filters[key]} onChange={e => update(key, e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200">
                <option value="">{ph}</option>
                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ))}
            {Object.values(filters).some(Boolean) && (
              <button onClick={() => { setFilters(empty); setPage(0); }} className="text-[10px] text-gray-400 hover:text-gray-700 whitespace-nowrap px-1">Clear</button>
            )}
          </div>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
              <Inbox size={28} className="opacity-30" />
              <p className="text-xs">No tickets found</p>
            </div>
          ) : tickets.map(ticket => {
            const isActive = ACTIVE_STATUSES.has(ticket.status);
            const sla = isActive ? computeSla(ticket, now) : null;
            const isSelected = ticket.id === id;
            const isPriority = ticket.priority === 'HIGH' || ticket.priority === 'URGENT';
            const edgeColor = isActive && sla ? slaEdgeColor(sla.level) : 'bg-gray-200';
            return (
              <button key={ticket.id} onClick={() => navigate(`/hub/tickets/${ticket.id}`)}
                className={`relative w-full text-left flex items-stretch border-b border-gray-100 transition-colors ${
                  isSelected ? 'bg-[#EEF2F8]' : 'hover:bg-gray-50'
                }`}>
                {/* SLA edge bar */}
                <div className={`w-[3px] flex-shrink-0 self-stretch ${isSelected ? 'bg-[#1E3A5F]' : edgeColor}`} />

                <div className="flex-1 px-3 py-3 min-w-0">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <p className={`text-sm font-medium text-gray-900 truncate flex-1 ${isSelected ? 'text-[#1E3A5F]' : ''}`}>{ticket.subject}</p>
                    {ticket.unreadCount > 0 && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">{ticket.unreadCount}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="font-mono text-[10px] text-gray-400">{ticket.ticketNumber}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{TYPE_LABELS[ticket.type] ?? ticket.type}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[ticket.status] ?? 'bg-gray-100 text-gray-600'}`}>{ticket.status?.replace('_',' ')}</span>
                    {isPriority && <Flag size={9} className="text-amber-500 fill-amber-500" />}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-gray-400 truncate flex-1">
                      {ticket.tenantName ?? (ticket.source === 'PUBLIC' ? 'Public' : '')}
                      {ticket.createdByName ? ` · ${ticket.createdByName}` : ''}
                    </p>
                    {isActive && sla && (
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        sla.level === 'breach' ? 'bg-red-50 text-red-600'
                        : sla.level === 'warn'  ? 'bg-amber-50 text-amber-600'
                        : 'bg-green-50 text-green-700'
                      }`}>
                        {sla.level === 'breach' ? 'Breach' : formatDuration(sla.resolveRemaining)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-white">
          <span className="text-[10px] text-gray-400">{data?.totalElements ?? 0} tickets · p{page + 1}/{Math.max(data?.totalPages ?? 1, 1)}</span>
          <div className="flex gap-1.5">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40">Prev</button>
            <button disabled={!data?.hasNext} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* ── Right pane ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {id ? (
          <TicketDetail key={id} id={id} hubUser={hubUser} now={now} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Inbox size={40} className="opacity-20" />
            <p className="text-sm">Select a ticket to get started</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}>
              <Plus size={15} /> New Ticket
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(ticket) => navigate(`/hub/tickets/${ticket.id}`)}
        />
      )}
    </div>
  );
}
