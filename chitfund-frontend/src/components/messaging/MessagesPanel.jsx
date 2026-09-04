import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  listConversations, startConversation, getMyConversation,
  getChatMessages, sendChatMessage, deleteChatMessage, markConversationRead,
  getAuthToken,
} from '../../services/api';
import { X, ChevronLeft, Send, Trash2, MessageSquare, Search, Loader2 } from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
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

// ── ConversationList (admin/manager view) ─────────────────────────────────────

function ConversationList({ onSelect, search, setSearch }) {
  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items = (data?.items ?? []).filter(c =>
    !search || c.memberName.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  );

  if (items.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 px-6 text-center">
      <MessageSquare size={36} className="opacity-40" />
      <p className="text-sm font-medium">No conversations yet</p>
      <p className="text-xs">Go to a member's profile and tap "Message" to start a chat.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {items.map(conv => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv)}
          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
            {conv.memberName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 truncate">{conv.memberName}</span>
              <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {conv.lastMessagePreview
                ? (conv.lastMessageIsAdmin ? 'You: ' : '') + conv.lastMessagePreview
                : 'No messages yet'}
            </p>
          </div>
          {conv.adminUnread > 0 && (
            <span className="ml-1 flex-shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {conv.adminUnread > 9 ? '9+' : conv.adminUnread}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── ChatView (shared between admin and member) ────────────────────────────────

function ChatView({ conversation, userId, isMember, onBack }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [pendingIds, setPendingIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const stompClientRef = useRef(null);

  const { data: msgData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['chatMessages', conversation.id],
    queryFn: ({ pageParam }) => getChatMessages(conversation.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
    staleTime: 10_000,
  });

  const messages = (msgData?.pages ?? []).flatMap(p => p?.items ?? []).reverse();

  // Mark read on open
  useEffect(() => {
    markConversationRead(conversation.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['convUnread'] });
  }, [conversation.id, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // WebSocket connection
  useEffect(() => {
    const token = getAuthToken();
    const client = new Client({
      webSocketFactory: () => new SockJS('/api/ws/support'),
      connectHeaders: { Authorization: token ? `Bearer ${token}` : '' },
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/conversation.${conversation.id}`, (frame) => {
          try {
            const payload = JSON.parse(frame.body);
            if (payload.type === 'MESSAGE_DELETED') {
              queryClient.setQueryData(['chatMessages', conversation.id], (old) => {
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
              // New message — add to cache if not already present
              queryClient.setQueryData(['chatMessages', conversation.id], (old) => {
                if (!old) return old;
                const exists = old.pages.some(p => (p.items ?? []).some(m => m.id === payload.id));
                if (exists) return old;
                const firstPage = old.pages[0] ?? { items: [] };
                return {
                  ...old,
                  pages: [{ ...firstPage, items: [payload, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
                };
              });
              markConversationRead(conversation.id).catch(() => {});
            }
          } catch { /* ignore parse errors */ }
        });
      },
    });
    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, [conversation.id, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }) =>
      sendChatMessage(conversation.id, content, clientMessageId),
    onMutate: ({ content, clientMessageId }) => {
      setPendingIds(s => new Set(s).add(clientMessageId));
    },
    onSuccess: (msg, { clientMessageId }) => {
      setPendingIds(s => { const n = new Set(s); n.delete(clientMessageId); return n; });
    },
    onError: (_, { clientMessageId }) => {
      setPendingIds(s => { const n = new Set(s); n.delete(clientMessageId); return n; });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId) => deleteChatMessage(conversation.id, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['chatMessages', conversation.id], (old) => {
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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 cursor-pointer">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
          {conversation.memberName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{conversation.memberName}</p>
          <p className="text-[10px] text-gray-400">Member</p>
        </div>
      </div>

      {/* Load more */}
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

      {/* Messages */}
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
                  <p className="text-[10px] text-gray-400 mb-0.5 ml-1">{msg.senderName}</p>
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

      {/* Input */}
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

// ── MessagesPanel (entry point) ───────────────────────────────────────────────

export default function MessagesPanel({ onClose }) {
  const { user } = useAuth();
  const role = user?.role ?? 'MEMBER';
  const userId = user?.id;
  const isMember = role === 'MEMBER';

  const [selectedConv, setSelectedConv] = useState(null);
  const [search, setSearch] = useState('');

  // Member: auto-load their single conversation
  const { data: memberConv } = useQuery({
    queryKey: ['myConversation'],
    queryFn: getMyConversation,
    enabled: isMember,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isMember && memberConv) setSelectedConv(memberConv);
  }, [isMember, memberConv]);

  const showChat = isMember ? !!selectedConv : !!selectedConv;
  const showList = !isMember && !selectedConv;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="ml-auto w-full max-w-sm h-full bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">
            {isMember ? 'Chat with your Org' : 'Member Messages'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Search (admin/manager list view only) */}
        {!isMember && !selectedConv && (
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>
        )}

        {/* Body */}
        {showList && (
          <ConversationList
            onSelect={setSelectedConv}
            search={search}
            setSearch={setSearch}
          />
        )}
        {showChat && selectedConv && (
          <ChatView
            conversation={selectedConv}
            userId={userId}
            isMember={isMember}
            onBack={!isMember ? () => setSelectedConv(null) : undefined}
          />
        )}
        {isMember && !selectedConv && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
