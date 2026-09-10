import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  listConversations, getMyConversation,
  getChatMessages, sendChatMessage, deleteChatMessage, markConversationRead,
  listGroups, getGroupMessages, sendGroupMessage, deleteGroupMessage,
  getGroupMembers, removeGroupMember,
  getAuthToken, getMembers, startConversation,
} from '../../services/api';
import { X, ChevronLeft, Send, Trash2, MessageSquare, Search, Loader2, Plus, Users, UserMinus, Minus, Maximize2 } from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import NewChatModal from './NewChatModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function canDelete(createdAt) {
  return Date.now() - new Date(createdAt).getTime() < 300_000;
}

function generateClientId() {
  return crypto.randomUUID ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── UnifiedConversationList (admin/manager/staff view) ─────────────────────────

function UnifiedConversationList({ onSelectMember, onSelectGroup, onNewChat, search, filter, canDm, canCreateGroup, isMember, memberConv, tenantName }) {
  const queryClient = useQueryClient();

  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations({ size: 50 }),
    enabled: canDm,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: groupData, isLoading: groupLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Members fetched only when there's a search query (for contact suggestions)
  const { data: membersRaw = [] } = useQuery({
    queryKey: ['members-for-chat'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 200 }),
    enabled: canDm && search.length >= 2,
    staleTime: 60_000,
  });

  const isLoading = (canDm && convLoading) || groupLoading;

  const conversations = useMemo(() => convData?.items ?? [], [convData]);

  const items = useMemo(() => {
    const convItems = canDm
      ? conversations.map((c) => ({
          kind: 'MEMBER',
          id: c.id,
          title: c.memberName,
          preview: c.lastMessagePreview
            ? (c.lastMessageIsAdmin ? 'You: ' : '') + c.lastMessagePreview
            : 'No messages yet',
          lastMessageAt: c.lastMessageAt,
          unread: c.adminUnread ?? 0,
          raw: c,
        }))
      : [];
    const myOrgItem = isMember && memberConv
      ? [{
          kind: 'MEMBER',
          id: memberConv.id,
          title: tenantName ?? 'your Org',
          preview: memberConv.lastMessagePreview
            ? (memberConv.lastMessageIsAdmin ? '' : 'You: ') + memberConv.lastMessagePreview
            : 'No messages yet',
          lastMessageAt: memberConv.lastMessageAt,
          unread: memberConv.myUnread ?? 0,
          raw: memberConv,
        }]
      : [];
    const groupItems = ((groupData?.items ?? groupData) ?? []).map((g) => ({
      kind: 'GROUP',
      id: g.id,
      title: g.name,
      preview: g.lastMessagePreview ?? `${g.memberCount ?? 0} members`,
      lastMessageAt: g.lastMessageAt,
      unread: g.unreadCount ?? 0,
      raw: g,
    }));

    let merged = [...myOrgItem, ...convItems, ...groupItems];

    // Tab filter
    if (filter === 'unread') merged = merged.filter((i) => i.unread > 0);
    else if (filter === 'groups') merged = merged.filter((i) => i.kind === 'GROUP');

    // Search filter
    if (search) merged = merged.filter((i) => i.title?.toLowerCase().includes(search.toLowerCase()));

    merged.sort((a, b) => new Date(b.lastMessageAt ?? 0) - new Date(a.lastMessageAt ?? 0));
    return merged;
  }, [conversations, groupData, canDm, search, filter, isMember, memberConv, tenantName]);

  // Contact suggestions: members without an existing conversation, shown when search returns no DM match
  const existingMemberIds = useMemo(
    () => new Set(conversations.map((c) => c.memberId).filter(Boolean)),
    [conversations]
  );

  const contactSuggestions = useMemo(() => {
    if (!canDm || search.length < 2) return [];
    const hasConvMatch = items.some((i) => i.kind === 'MEMBER');
    if (hasConvMatch) return [];
    return (Array.isArray(membersRaw) ? membersRaw : membersRaw?.items ?? [])
      .filter((m) => !existingMemberIds.has(m.memberId ?? m.id))
      .filter((m) => (m.fullName ?? m.name ?? '').toLowerCase().includes(search.toLowerCase()))
      .slice(0, 5);
  }, [membersRaw, search, items, canDm, existingMemberIds]);

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Contact suggestions (WhatsApp-style: show member to start new chat) */}
        {contactSuggestions.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Start new chat</span>
            </div>
            {contactSuggestions.map((m) => (
              <button
                key={m.memberId ?? m.id}
                onClick={() => {
                  startConversation({ memberId: m.userId ?? m.memberId ?? m.id, memberName: m.fullName ?? m.name })
                    .then((conv) => {
                      queryClient.invalidateQueries({ queryKey: ['conversations'] });
                      onSelectMember(conv);
                    })
                    .catch(() => {});
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-sm text-blue-700 flex-shrink-0">
                  {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 block truncate">{m.fullName ?? m.name}</span>
                  <span className="text-xs text-blue-600">Tap to start a conversation</span>
                </div>
              </button>
            ))}
            {items.length > 0 && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Existing chats</span>
              </div>
            )}
          </div>
        )}

        {items.length === 0 && contactSuggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-400 px-6 text-center py-16">
            <MessageSquare size={36} className="opacity-40" />
            <p className="text-sm font-medium">{search ? 'No results' : 'No conversations yet'}</p>
            <p className="text-xs">
              {search
                ? 'No members or groups match your search'
                : (canDm || canCreateGroup)
                  ? 'Tap the + button to message a member or start a group.'
                  : "You haven't been added to any group yet."}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => item.kind === 'MEMBER' ? onSelectMember(item.raw) : onSelectGroup(item.raw)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
                item.kind === 'GROUP' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {item.kind === 'GROUP' ? <Users size={16} /> : (item.title?.[0]?.toUpperCase() ?? '?')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm truncate ${item.unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}`}>{item.title}</span>
                  <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{formatTime(item.lastMessageAt)}</span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${item.unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>{item.preview}</p>
              </div>
              {item.unread > 0 && (
                <span className={`ml-1 flex-shrink-0 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                  item.kind === 'GROUP' ? 'bg-green-600' : 'bg-blue-600'
                }`}>
                  {item.unread > 9 ? '9+' : item.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Floating "+" new chat button */}
      {(canDm || canCreateGroup) && (
        <button
          onClick={onNewChat}
          title="New chat"
          className="absolute bottom-5 right-5 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center cursor-pointer transition-all hover:scale-105 hover:shadow-xl"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          <Plus size={22} />
        </button>
      )}
    </div>
  );
}

// ── MembersDrawer (group members) ───────────────────────────────────────────────

function MembersDrawer({ groupId, isAdmin, onClose }) {
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['groupMembers', groupId],
    queryFn: () => getGroupMembers(groupId),
    staleTime: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: (userId) => removeGroupMember(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  return (
    <div className="absolute inset-y-0 right-0 w-64 bg-white border-l border-gray-200 flex flex-col shadow-xl z-10">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Members ({members.length})</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
            <Users size={28} className="opacity-40" />
            <p className="text-xs">No members yet</p>
          </div>
        ) : (
          members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {m.userName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{m.userName}</p>
                <p className="text-[10px] text-gray-400">{m.role}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeMutation.mutate(m.userId)}
                  disabled={removeMutation.isPending}
                  className="text-gray-300 hover:text-red-500 cursor-pointer"
                  title="Remove member"
                >
                  <UserMinus size={13} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── ChatView (member DM) ────────────────────────────────────────────────────────

function ChatView({ conversation: initialConv, userId, isMember, orgLabel, onBack }) {
  const queryClient = useQueryClient();
  // conv may start without an id (draft mode) when opened from member profile before any message
  const [conv, setConv] = useState(initialConv);
  const hasId = !!conv.id;
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const stompClientRef = useRef(null);

  // If we opened in draft mode but the conversations list has already loaded with a real conv for
  // this member (cache miss at click time), promote to real conv so history loads immediately.
  const { data: convList } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations({ size: 50 }),
    staleTime: 30_000,
    enabled: !hasId && !!conv.memberId,
  });
  useEffect(() => {
    if (hasId || !convList) return;
    const found = (convList.items ?? []).find(c => c.memberId === conv.memberId);
    if (found) setConv(found);
  }, [convList, hasId, conv.memberId]);

  const { data: msgData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['chatMessages', conv.id],
    queryFn: ({ pageParam }) => getChatMessages(conv.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
    staleTime: 10_000,
    enabled: hasId,
  });

  const messages = (msgData?.pages ?? []).flatMap(p => p?.items ?? []).reverse();

  useEffect(() => {
    if (!hasId) return;
    markConversationRead(conv.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['convUnread'] });
  }, [conv.id, hasId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // WebSocket only connects once a real conversation id exists
  useEffect(() => {
    if (!hasId) return;
    const token = getAuthToken();
    const client = new Client({
      webSocketFactory: () => new SockJS('/api/ws/support'),
      connectHeaders: { Authorization: token ? `Bearer ${token}` : '' },
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/conversation.${conv.id}`, (frame) => {
          try {
            const payload = JSON.parse(frame.body);
            if (payload.type === 'MESSAGE_DELETED') {
              queryClient.setQueryData(['chatMessages', conv.id], (old) => {
                if (!old) return old;
                return {
                  ...old,
                  pages: old.pages.map(p => ({
                    ...p,
                    items: (p.items ?? []).map(m =>
                      m.id === payload.messageId
                        ? { ...m, content: 'This message was deleted', deleted: true }
                        : m
                    ),
                  })),
                };
              });
            } else if (payload.type === 'UNREAD_UPDATE') {
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              queryClient.invalidateQueries({ queryKey: ['convUnread'] });
            } else if (payload.id) {
              queryClient.setQueryData(['chatMessages', conv.id], (old) => {
                if (!old) return old;
                const exists = old.pages.some(p => (p.items ?? []).some(m => m.id === payload.id));
                if (exists) return old;
                const firstPage = old.pages[0] ?? { items: [] };
                return {
                  ...old,
                  pages: [{ ...firstPage, items: [payload, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
                };
              });
              markConversationRead(conv.id).catch(() => {});
            }
          } catch { /* ignore parse errors */ }
        });
      },
    });
    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, [conv.id, hasId, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: async ({ content, clientMessageId }) => {
      let convId = conv.id;
      let createdConv = null;
      if (!convId) {
        // First message — create the conversation now
        createdConv = await startConversation({ memberId: conv.memberId, memberName: conv.memberName });
        convId = createdConv.id;
      }
      const msg = await sendChatMessage(convId, content, clientMessageId);
      return { msg, createdConv, convId };
    },
    onSuccess: ({ msg, createdConv, convId }) => {
      if (createdConv) {
        setConv(createdConv);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
      queryClient.setQueryData(['chatMessages', convId], (old) => {
        if (!old) return { pages: [{ items: [msg], nextCursor: null }], pageParams: [undefined] };
        const exists = old.pages.some(p => (p.items ?? []).some(m => m.id === msg.id));
        if (exists) return old;
        const firstPage = old.pages[0] ?? { items: [] };
        return {
          ...old,
          pages: [{ ...firstPage, items: [msg, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
        };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId) => deleteChatMessage(conv.id, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['chatMessages', conv.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(p => ({
            ...p,
            items: (p.items ?? []).map(m =>
              m.id === messageId ? { ...m, content: 'This message was deleted', deleted: true } : m
            ),
          })),
        };
      });
    },
  });

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    const clientMessageId = generateClientId();
    setInput('');
    sendMutation.mutate({ content, clientMessageId });
    inputRef.current?.focus();
  }, [input, sendMutation]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 cursor-pointer">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
          {isMember ? (orgLabel?.[0]?.toUpperCase() ?? 'O') : (conv.memberName?.[0]?.toUpperCase() ?? '?')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {isMember ? orgLabel : conv.memberName}
          </p>
          <p className="text-[10px] text-gray-400">{isMember ? 'Admin' : 'Member'}</p>
        </div>
      </div>

      {hasNextPage && (
        <div className="flex justify-center py-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50 cursor-pointer"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-xs">No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map(msg => {
          const mine = msg.senderId === userId;
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
              <div className={`relative max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!mine && (
                  <p className="text-[11px] font-semibold text-gray-700 mb-0.5 ml-1">{msg.senderName}</p>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm break-words ${
                  msg.deleted
                    ? 'bg-gray-100 text-gray-400 italic'
                    : mine
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                }`}>
                  {msg.content}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                  {mine && !msg.deleted && (
                    <span className={`text-[11px] leading-none ${msg.readAt ? 'text-blue-400' : 'text-gray-400'}`}>
                      {msg.readAt ? '✓✓' : '✓'}
                    </span>
                  )}
                  {mine && !msg.deleted && canDelete(msg.createdAt) && (
                    <button
                      onClick={() => deleteMutation.mutate(msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 max-h-28 overflow-y-auto"
          style={{ lineHeight: '1.5' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors cursor-pointer flex-shrink-0"
        >
          {sendMutation.isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── GroupChatView ──────────────────────────────────────────────────────────────

function GroupChatView({ group, userId, role, onBack }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const stompClientRef = useRef(null);

  const isAdmin = role === 'ADMIN' || role === 'MANAGER';

  const { data: msgData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['groupMessages', group.id],
    queryFn: ({ pageParam }) => getGroupMessages(group.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
    staleTime: 10_000,
  });

  const messages = (msgData?.pages ?? []).flatMap((p) => p?.items ?? []).reverse();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const token = getAuthToken();
    const client = new Client({
      webSocketFactory: () => new SockJS('/api/ws/support'),
      connectHeaders: { Authorization: token ? `Bearer ${token}` : '' },
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/group.${group.id}`, (frame) => {
          try {
            const payload = JSON.parse(frame.body);
            if (payload.type === 'MESSAGE_DELETED') {
              queryClient.setQueryData(['groupMessages', group.id], (old) => {
                if (!old) return old;
                return {
                  ...old,
                  pages: old.pages.map((p) => ({
                    ...p,
                    items: (p.items ?? []).map((m) =>
                      m.id === payload.messageId ? { ...m, content: 'This message was deleted', deleted: true } : m
                    ),
                  })),
                };
              });
            } else if (payload.id) {
              queryClient.setQueryData(['groupMessages', group.id], (old) => {
                if (!old) return old;
                const exists = old.pages.some((p) => (p.items ?? []).some((m) => m.id === payload.id));
                if (exists) return old;
                const firstPage = old.pages[0] ?? { items: [] };
                return {
                  ...old,
                  pages: [{ ...firstPage, items: [payload, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
                };
              });
            }
          } catch { /* ignore */ }
        });
      },
    });
    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, [group.id, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }) => sendGroupMessage(group.id, content, clientMessageId),
    onSuccess: (newMsg) => {
      queryClient.setQueryData(['groupMessages', group.id], (old) => {
        if (!old) return { pages: [{ items: [newMsg], nextCursor: null }], pageParams: [undefined] };
        const exists = old.pages.some((p) => (p.items ?? []).some((m) => m.id === newMsg.id));
        if (exists) return old;
        const firstPage = old.pages[0] ?? { items: [] };
        return {
          ...old,
          pages: [{ ...firstPage, items: [newMsg, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
        };
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId) => deleteGroupMessage(group.id, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['groupMessages', group.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: (p.items ?? []).map((m) =>
              m.id === messageId ? { ...m, content: 'This message was deleted', deleted: true } : m
            ),
          })),
        };
      });
    },
  });

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    const clientMessageId = generateClientId();
    setInput('');
    sendMutation.mutate({ content, clientMessageId });
    inputRef.current?.focus();
  }, [input, sendMutation]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 cursor-pointer">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
          {group.name?.[0]?.toUpperCase() ?? 'G'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{group.name}</p>
          <p className="text-[10px] text-gray-400">{group.memberCount ?? 0} members</p>
        </div>
        <button
          onClick={() => setShowMembers((v) => !v)}
          className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
          title="Members"
        >
          <Users size={16} />
        </button>
      </div>

      {hasNextPage && (
        <div className="flex justify-center py-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50 cursor-pointer"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <Users size={32} className="opacity-30" />
            <p className="text-xs">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const mine = msg.senderId === userId;
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
              <div className={`relative max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!mine && (
                  <p className="text-[11px] font-semibold text-gray-700 mb-0.5 ml-1">{msg.senderName}</p>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm break-words ${
                  msg.deleted
                    ? 'bg-gray-100 text-gray-400 italic'
                    : mine
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                }`}>
                  {msg.content}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                  {mine && !msg.deleted && canDelete(msg.createdAt) && (
                    <button
                      onClick={() => deleteMutation.mutate(msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 max-h-28 overflow-y-auto"
          style={{ lineHeight: '1.5' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          className="w-9 h-9 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors cursor-pointer flex-shrink-0"
        >
          {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {showMembers && (
        <MembersDrawer groupId={group.id} isAdmin={isAdmin} onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}

// ── UnifiedMessagesPanel (entry point) ──────────────────────────────────────────

export default function UnifiedMessagesPanel({ onClose, initialConversation, initialGroup }) {
  const { user, tenantName } = useAuth();
  const role = user?.role ?? 'MEMBER';
  const userId = user?.id;
  const isMember = role === 'MEMBER';
  const canDm = role === 'ADMIN' || role === 'MANAGER';
  const canCreateGroup = role === 'ADMIN' || role === 'MANAGER';
  const orgLabel = tenantName ?? 'your Org';

  const [selectedConv, setSelectedConv] = useState(initialConversation ?? null);
  const [selectedGroup, setSelectedGroup] = useState(initialGroup ?? null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // When the panel is already open and a new initialConversation is pushed in
  // (e.g. admin clicks "Message" on a member detail page), jump to that conversation.
  useEffect(() => {
    if (initialConversation) {
      setSelectedConv(initialConversation);
      setSelectedGroup(null);
      setIsMinimized(false);
    }
  }, [initialConversation]);

  // Member: fetch their single org conversation (shown as a list item alongside groups)
  const { data: memberConv } = useQuery({
    queryKey: ['myConversation'],
    queryFn: getMyConversation,
    enabled: isMember,
    staleTime: 60_000,
  });

  const showingChat = !!selectedConv || !!selectedGroup;
  const showingList = !showingChat;

  function handleBack() {
    setSelectedConv(null);
    setSelectedGroup(null);
  }

  const title = selectedGroup
    ? selectedGroup.name
    : selectedConv
      ? (isMember ? (tenantName ?? 'your Org') : selectedConv.memberName)
      : 'Messages';

  if (isMinimized) {
    return createPortal(
      <div
        className="fixed bottom-0 right-6 z-[60] flex items-center gap-3 px-4 py-3 bg-[#1E3A5F] text-white rounded-t-xl shadow-2xl cursor-pointer select-none"
        style={{ minWidth: 220 }}
        onClick={() => setIsMinimized(false)}
      >
        <MessageSquare size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold truncate flex-1">{title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
          className="text-white/70 hover:text-white cursor-pointer"
          title="Maximize"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-white/70 hover:text-white cursor-pointer"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="ml-auto w-full max-w-sm h-full bg-white shadow-2xl flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900 truncate">{title}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsMinimized(true)}
              className="text-gray-400 hover:text-gray-700 cursor-pointer"
              title="Minimize"
            >
              <Minus size={16} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search (list view only) */}
        {showingList && (
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or start new chat..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter capsules (hidden when searching) */}
        {showingList && !search && (
          <div className="flex gap-2 px-4 py-2 border-b border-gray-100">
            {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']].map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  filter === f
                    ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        {showingList && (
          <UnifiedConversationList
            onSelectMember={setSelectedConv}
            onSelectGroup={setSelectedGroup}
            onNewChat={() => setShowNewChat(true)}
            search={search}
            filter={filter}
            canDm={canDm}
            canCreateGroup={canCreateGroup}
            isMember={isMember}
            memberConv={memberConv}
            tenantName={tenantName}
          />
        )}
        {selectedConv && (
          <ChatView
            conversation={selectedConv}
            userId={userId}
            isMember={isMember}
            orgLabel={orgLabel}
            onBack={handleBack}
          />
        )}
        {selectedGroup && (
          <GroupChatView
            group={selectedGroup}
            userId={userId}
            role={role}
            onBack={handleBack}
          />
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          canDm={canDm}
          canCreateGroup={canCreateGroup}
          onClose={() => setShowNewChat(false)}
          onConversationStarted={(conv) => { setSelectedConv(conv); setShowNewChat(false); }}
          onGroupCreated={(group) => { setSelectedGroup(group); setShowNewChat(false); }}
        />
      )}
    </div>,
    document.body
  );
}
