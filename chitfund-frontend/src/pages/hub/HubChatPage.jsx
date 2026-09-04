import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  hubListEmployees, hubStartDm, hubListDms, hubGetDmMessages, hubSendDm,
  hubDeleteDmMessage, hubMarkDmRead, hubCreateChatGroup, hubListChatGroups,
  hubGetGroupMessages, hubSendGroupMessage, hubDeleteGroupMessage,
  getHubToken,
} from '../../services/api';
import { MessageSquare, Users, Plus, Send, Trash2, ChevronUp, X, Search } from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const DELETE_WINDOW_MS = 5 * 60 * 1000;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── New DM Modal ─────────────────────────────────────────────────────────────
function NewDmModal({ employees, myId, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const filtered = employees.filter(e =>
    e.id !== myId && e.username !== myId &&
    e.username?.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">New Direct Message</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search employees…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No employees found</p>}
          {filtered.map(emp => (
            <button
              key={emp.id}
              onClick={() => { onSelect(emp); onClose(); }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: '#1E3A5F' }}>
                {emp.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{emp.username}</p>
                <p className="text-xs text-gray-400">{emp.role?.replace('_', ' ')}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── New Group Modal ───────────────────────────────────────────────────────────
function NewGroupModal({ employees, myId, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const filtered = employees.filter(e =>
    e.id !== myId && e.username !== myId &&
    !selected.find(s => s.id === e.id) &&
    e.username?.toLowerCase().includes(q.toLowerCase())
  );

  function toggle(emp) {
    setSelected(prev =>
      prev.find(s => s.id === emp.id) ? prev.filter(s => s.id !== emp.id) : [...prev, emp]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">New Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name *"
          className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
        />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(emp => (
              <span key={emp.id} className="flex items-center gap-1 px-2 py-0.5 bg-[#1E3A5F]/10 text-[#1E3A5F] text-xs rounded-full">
                {emp.username}
                <button onClick={() => toggle(emp)}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Add members…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
        </div>
        <div className="max-h-36 overflow-y-auto space-y-0.5">
          {filtered.map(emp => (
            <button key={emp.id} onClick={() => toggle(emp)} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 text-sm">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                {emp.username?.[0]?.toUpperCase()}
              </div>
              {emp.username}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!name.trim()}
            onClick={() => {
              if (!name.trim()) { setError('Name is required'); return; }
              onCreate({ name: name.trim(), description: description.trim(), memberIds: selected.map(s => s.id) });
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm rounded-xl text-white font-medium disabled:opacity-40"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chat View (DM or Group) ───────────────────────────────────────────────────
function ChatView({ type, item, myId, myUsername }) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const bottomRef = useRef(null);
  const stompRef = useRef(null);

  const isDm = type === 'dm';
  const queryKey = isDm ? ['hub-dm-messages', item.id] : ['hub-group-messages', item.id];

  const { data: pages, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      isDm
        ? hubGetDmMessages(item.id, { cursor: pageParam, limit: 50 })
        : hubGetGroupMessages(item.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last?.hasNext ? last.nextCursor : undefined,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const messages = (pages?.pages ?? []).flatMap(p => p?.items ?? []).reverse();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark read on open
  useEffect(() => {
    if (isDm) hubMarkDmRead(item.id).catch(() => {});
  }, [isDm, item.id]);

  // WebSocket real-time
  useEffect(() => {
    const token = getHubToken();
    if (!token) return;
    const topic = isDm ? `/topic/hub.dm.${item.id}` : `/topic/hub.group.${item.id}`;

    const client = new Client({
      webSocketFactory: () => new SockJS('/api/ws/support'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 4000,
      onConnect: () => {
        client.subscribe(topic, (frame) => {
          try {
            const payload = JSON.parse(frame.body);
            if (payload.type === 'MESSAGE_DELETED') {
              qc.setQueryData(queryKey, (old) => {
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
            } else if (payload.id) {
              qc.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const firstPage = old.pages[0] ?? { items: [] };
                const alreadyExists = firstPage.items?.some(m => m.id === payload.id);
                if (alreadyExists) return old;
                return {
                  ...old,
                  pages: [{ ...firstPage, items: [payload, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
                };
              });
              if (isDm) hubMarkDmRead(item.id).catch(() => {});
            }
          } catch { /* ignore WebSocket message parse errors */ }
        });
      },
    });
    client.activate();
    stompRef.current = client;
    return () => { client.deactivate(); };
  }, [isDm, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMut = useMutation({
    mutationFn: () => {
      const cid = genId();
      return isDm
        ? hubSendDm(item.id, content.trim(), cid)
        : hubSendGroupMessage(item.id, content.trim(), cid);
    },
    onSuccess: () => {
      setContent('');
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: isDm ? ['hub-dms'] : ['hub-chat-groups'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (msgId) =>
      isDm ? hubDeleteDmMessage(item.id, msgId) : hubDeleteGroupMessage(item.id, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  function canDelete(msg) {
    if (msg.deleted || msg.deletedAt) return false;
    const isMe = msg.senderId === myId || msg.senderName === myUsername || msg.senderUsername === myUsername;
    if (!isMe) return false;
    return Date.now() - new Date(msg.createdAt).getTime() < DELETE_WINDOW_MS;
  }

  const title = isDm
    ? (item.otherUsername ?? item.otherEmployeeName ?? item.name ?? 'Direct Message')
    : (item.name ?? 'Group');

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5 flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${isDm ? 'bg-[#1E3A5F]' : 'bg-emerald-600'}`}>
          {isDm ? title[0]?.toUpperCase() : <Users size={14} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {isDm && <p className="text-xs text-green-500">● Online</p>}
          {!isDm && item.memberCount != null && (
            <p className="text-xs text-gray-400">{item.memberCount} members</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasNextPage && (
          <div className="flex justify-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <ChevronUp size={13} />
              {isFetchingNextPage ? 'Loading…' : 'Load older'}
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">No messages yet. Say hello!</p>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === myId || msg.senderName === myUsername || msg.senderUsername === myUsername;
            const isDeleted = msg.deleted || msg.deletedAt;
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                onMouseEnter={() => setHoveredMsg(msg.id)}
                onMouseLeave={() => setHoveredMsg(null)}
              >
                <div className="relative max-w-[70%]">
                  {!isDm && !isMe && (
                    <p className="text-[11px] text-gray-400 mb-0.5">
                      {msg.senderName ?? msg.senderUsername ?? 'Hub Staff'}
                    </p>
                  )}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isDeleted
                      ? 'bg-gray-50 text-gray-400 italic border border-gray-100'
                      : isMe
                      ? 'bg-[#1E3A5F] text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                  }`}>
                    {isDeleted ? 'This message was deleted' : msg.content}
                  </div>
                  <div className={`flex items-center gap-2 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
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

      {/* Input */}
      <div className="border-t border-gray-100 p-3 flex gap-2 items-end flex-shrink-0">
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
          placeholder="Type a message…"
          className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
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
    </div>
  );
}

// ── Main HubChatPage ──────────────────────────────────────────────────────────
export default function HubChatPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null); // { type: 'dm'|'group', item }
  const [showNewDm, setShowNewDm] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const hubUser = (() => {
    try { return JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { return {}; }
  })();

  const { data: employees = [] } = useQuery({
    queryKey: ['hub-employees'],
    queryFn: hubListEmployees,
    staleTime: 60000,
  });

  const { data: dms = [] } = useQuery({
    queryKey: ['hub-dms'],
    queryFn: hubListDms,
    staleTime: 20000,
    refetchInterval: 30000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['hub-chat-groups'],
    queryFn: hubListChatGroups,
    staleTime: 20000,
    refetchInterval: 30000,
  });

  const startDmMut = useMutation({
    mutationFn: (emp) => hubStartDm(emp.id),
    onSuccess: (dm) => {
      qc.invalidateQueries({ queryKey: ['hub-dms'] });
      setSelected({ type: 'dm', item: dm });
    },
  });

  const createGroupMut = useMutation({
    mutationFn: (body) => hubCreateChatGroup(body),
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: ['hub-chat-groups'] });
      setSelected({ type: 'group', item: group });
    },
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Left panel */}
      <div className="w-72 flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Team Chat</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Direct Messages */}
          <div className="px-3 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Direct Messages</span>
              <button
                onClick={() => setShowNewDm(true)}
                className="text-gray-400 hover:text-[#1E3A5F] transition-colors"
                title="New DM"
              >
                <Plus size={14} />
              </button>
            </div>
            {dms.length === 0 ? (
              <p className="text-xs text-gray-400 px-1 py-2">No DMs yet</p>
            ) : (
              dms.map(dm => {
                const name = dm.otherUsername ?? dm.otherEmployeeName ?? dm.name ?? 'Unknown';
                const isActive = selected?.type === 'dm' && selected?.item?.id === dm.id;
                return (
                  <button
                    key={dm.id}
                    onClick={() => setSelected({ type: 'dm', item: dm })}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl mb-0.5 transition-colors ${isActive ? 'bg-[#1E3A5F] text-white' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-[#1E3A5F] text-white'}`}>
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-900'}`}>{name}</p>
                      {dm.lastMessagePreview && (
                        <p className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{dm.lastMessagePreview}</p>
                      )}
                    </div>
                    {dm.unread > 0 && (
                      <span className="w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                        {dm.unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Groups */}
          <div className="px-3 pt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Groups</span>
              <button
                onClick={() => setShowNewGroup(true)}
                className="text-gray-400 hover:text-[#1E3A5F] transition-colors"
                title="New Group"
              >
                <Plus size={14} />
              </button>
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-gray-400 px-1 py-2">No groups yet</p>
            ) : (
              groups.map(group => {
                const isActive = selected?.type === 'group' && selected?.item?.id === group.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelected({ type: 'group', item: group })}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl mb-0.5 transition-colors ${isActive ? 'bg-[#1E3A5F] text-white' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-emerald-100'}`}>
                      <Users size={13} className={isActive ? 'text-white' : 'text-emerald-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-900'}`}>{group.name}</p>
                      {group.lastMessagePreview && (
                        <p className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{group.lastMessagePreview}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right panel — chat view */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <ChatView
            key={`${selected.type}-${selected.item.id}`}
            type={selected.type}
            item={selected.item}
            myId={hubUser.id}
            myUsername={hubUser.username}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <MessageSquare size={40} className="opacity-20" />
            <p className="text-sm">Select a conversation or start a new one</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setShowNewDm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Plus size={14} /> New DM
              </button>
              <button
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Plus size={14} /> New Group
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewDm && (
        <NewDmModal
          employees={employees}
          myId={hubUser.id ?? hubUser.username}
          onSelect={(emp) => startDmMut.mutate(emp)}
          onClose={() => setShowNewDm(false)}
        />
      )}
      {showNewGroup && (
        <NewGroupModal
          employees={employees}
          myId={hubUser.id ?? hubUser.username}
          onCreate={(body) => createGroupMut.mutate(body)}
          onClose={() => setShowNewGroup(false)}
        />
      )}
    </div>
  );
}
