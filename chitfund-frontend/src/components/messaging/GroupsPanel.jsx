import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  listGroups, createGroup, getGroupMessages, sendGroupMessage,
  deleteGroupMessage, getGroupMembers, addGroupMember, removeGroupMember,
  getAuthToken,
} from '../../services/api';
import { X, ChevronLeft, Send, Trash2, Users, Search, Loader2, Plus, UserMinus, UserPlus } from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

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
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── CreateGroupModal ───────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => createGroup({ name: name.trim(), description: description.trim() || undefined, memberIds: [] }),
    onSuccess: (group) => { onCreated(group); onClose(); },
    onError: (err) => setError(err?.response?.data?.message ?? 'Failed to create group'),
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">New Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Group Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chit Group A Members"
              maxLength={100}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              maxLength={255}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={() => mutation.mutate()}
            disabled={name.trim().length < 2 || mutation.isPending}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {mutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── MembersDrawer ──────────────────────────────────────────────────────────────

function MembersDrawer({ groupId, isAdmin, onClose }) {
  const queryClient = useQueryClient();
  const [addUserId, setAddUserId] = useState('');
  const [addUserName, setAddUserName] = useState('');
  const [addError, setAddError] = useState('');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['groupMembers', groupId],
    queryFn: () => getGroupMembers(groupId),
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: () => addGroupMember(groupId, { userId: addUserId.trim(), userName: addUserName.trim(), role: 'MEMBER' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setAddUserId(''); setAddUserName(''); setAddError('');
    },
    onError: (err) => setAddError(err?.response?.data?.message ?? 'Failed to add member'),
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

      {isAdmin && (
        <div className="border-t border-gray-100 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Add Member</p>
          <input
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            placeholder="Member ID"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          <input
            value={addUserName}
            onChange={(e) => setAddUserName(e.target.value)}
            placeholder="Display name"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          {addError && <p className="text-[10px] text-red-500">{addError}</p>}
          <button
            onClick={() => addMutation.mutate()}
            disabled={!addUserId.trim() || !addUserName.trim() || addMutation.isPending}
            className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <UserPlus size={11} /> Add
          </button>
        </div>
      )}
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
    onError: () => {},
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
      {/* Header */}
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

      {/* Messages */}
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
                  <p className="text-[10px] text-gray-400 mb-0.5 ml-1">{msg.senderName}</p>
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

      {/* Input */}
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

// ── GroupList ──────────────────────────────────────────────────────────────────

function GroupList({ onSelect, search, role, onNewGroup }) {
  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const canCreate = role === 'ADMIN' || role === 'MANAGER';
  const items = ((data?.items ?? data) ?? []).filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {canCreate && (
        <div className="px-4 py-2 border-b border-gray-100">
          <button
            onClick={onNewGroup}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Group
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 px-6 text-center">
          <Users size={36} className="opacity-40" />
          <p className="text-sm font-medium">No groups yet</p>
          {canCreate && <p className="text-xs">Create a group to start chatting with multiple members at once.</p>}
          {!canCreate && <p className="text-xs">You haven't been added to any group yet.</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {items.map((group) => (
            <button
              key={group.id}
              onClick={() => onSelect(group)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
            >
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {group.name?.[0]?.toUpperCase() ?? 'G'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900 truncate">{group.name}</span>
                  <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{formatTime(group.lastMessageAt)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {group.lastMessagePreview ?? `${group.memberCount ?? 0} members`}
                </p>
              </div>
              {group.unreadCount > 0 && (
                <span className="ml-1 flex-shrink-0 bg-green-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {group.unreadCount > 9 ? '9+' : group.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── GroupsPanel ────────────────────────────────────────────────────────────────

export default function GroupsPanel({ onClose }) {
  const { user } = useAuth();
  const role = user?.role ?? 'MEMBER';
  const userId = user?.id;

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="ml-auto w-full max-w-sm h-full bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Group Chats</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Search (list view only) */}
        {!selectedGroup && (
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          </div>
        )}

        {/* Body */}
        {!selectedGroup ? (
          <GroupList
            onSelect={setSelectedGroup}
            search={search}
            role={role}
            onNewGroup={() => setShowCreate(true)}
          />
        ) : (
          <GroupChatView
            group={selectedGroup}
            userId={userId}
            role={role}
            onBack={() => setSelectedGroup(null)}
          />
        )}
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(group) => setSelectedGroup(group)}
        />
      )}
    </div>,
    document.body
  );
}
