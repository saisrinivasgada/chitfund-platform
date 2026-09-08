import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import {
  getMyConversation, getChatMessages, sendChatMessage, deleteChatMessage,
  markConversationRead, listGroups, getGroupMessages, sendGroupMessage, deleteGroupMessage,
} from '../../../services/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function canDelete(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 300_000;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Shared message bubble ──────────────────────────────────────────────────────

function MessageBubble({
  item, mine, accentColor, onLongPress,
}: {
  item: any; mine: boolean; accentColor: string; onLongPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      activeOpacity={0.9}
      style={{ flexDirection: mine ? 'row-reverse' : 'row', marginVertical: 3, paddingHorizontal: 12 }}
    >
      <View style={{
        maxWidth: '75%',
        backgroundColor: item.deleted ? '#F3F4F6' : mine ? accentColor : '#F3F4F6',
        borderRadius: 16,
        borderBottomRightRadius: mine ? 4 : 16,
        borderBottomLeftRadius: mine ? 16 : 4,
        paddingHorizontal: 12, paddingVertical: 8,
      }}>
        {!mine && item.senderName && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, marginBottom: 2 }}>
            {item.senderName}
          </Text>
        )}
        <Text style={{
          fontSize: 14, lineHeight: 20,
          color: item.deleted ? C.gray400 : mine ? '#fff' : C.gray900,
          fontStyle: item.deleted ? 'italic' : 'normal',
        }}>
          {item.content}
        </Text>
        <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.7)' : C.gray400, marginTop: 2, textAlign: 'right' }}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Chat input bar ─────────────────────────────────────────────────────────────

function ChatInput({
  onSend, isPending, accentColor, placeholder = 'Type a message...',
}: {
  onSend: (text: string) => void;
  isPending: boolean;
  accentColor: string;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: C.gray100 }}>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        multiline
        style={{
          flex: 1, maxHeight: 100, fontSize: 14, color: C.gray900,
          borderWidth: 1, borderColor: C.gray200, borderRadius: 16,
          paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB',
        }}
      />
      <TouchableOpacity
        onPress={() => { const t = input.trim(); if (t && !isPending) { onSend(t); setInput(''); } }}
        disabled={!input.trim() || isPending}
        style={{
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: !input.trim() || isPending ? C.gray200 : accentColor,
        }}
      >
        {isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 16 }}>↑</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Admin DM view ──────────────────────────────────────────────────────────────

function AdminChatView({ conversation, userId, onBack }: { conversation: any; userId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-chatMessages', conversation.id],
    queryFn: ({ pageParam }: any) => getChatMessages(conversation.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  useEffect(() => {
    markConversationRead(conversation.id).catch(() => {});
    qc.invalidateQueries({ queryKey: ['m-myConversation'] });
    qc.invalidateQueries({ queryKey: ['memberConvUnread'] });
  }, [conversation.id]);

  const sendMut = useMutation({
    mutationFn: ({ content, clientMessageId }: any) => sendChatMessage(conversation.id, content, clientMessageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m-chatMessages', conversation.id] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChatMessage(conversation.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m-chatMessages', conversation.id] }),
  });

  function handleDelete(msg: any) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(msg.id) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>🏢</Text>
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Your Admin</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>ChitFund Organisation</Text>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            item={item}
            mine={item.senderId === userId}
            accentColor={C.navy}
            onLongPress={() => item.senderId === userId && !item.deleted && canDelete(item.createdAt) && handleDelete(item)}
          />
        )}
        inverted
        contentContainerStyle={{ paddingVertical: 8 }}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.2}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 8 }} /> : null}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 48 }}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>💬</Text>
            <Text style={{ fontSize: 14, color: C.gray400, textAlign: 'center' }}>No messages yet.{'\n'}Say hello to your admin!</Text>
          </View>
        }
      />

      <ChatInput onSend={(t) => sendMut.mutate({ content: t, clientMessageId: genId() })} isPending={sendMut.isPending} accentColor={C.navy} placeholder="Message your admin..." />
    </KeyboardAvoidingView>
  );
}

// ── Group chat view ────────────────────────────────────────────────────────────

function GroupChatView({ group, userId, onBack }: { group: any; userId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-groupMessages-member', group.id],
    queryFn: ({ pageParam }: any) => getGroupMessages(group.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  const sendMut = useMutation({
    mutationFn: ({ content, clientMessageId }: any) => sendGroupMessage(group.id, content, clientMessageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-groupMessages-member', group.id] });
      qc.invalidateQueries({ queryKey: ['m-groups-member'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteGroupMessage(group.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m-groupMessages-member', group.id] }),
  });

  function handleDelete(msg: any) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(msg.id) },
    ]);
  }

  const ACCENT = '#16a34a';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '700', color: ACCENT }}>{group.name?.[0]?.toUpperCase() ?? 'G'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{group.name}</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>{group.memberCount ?? 0} members</Text>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            item={item}
            mine={item.senderId === userId}
            accentColor={ACCENT}
            onLongPress={() => item.senderId === userId && !item.deleted && canDelete(item.createdAt) && handleDelete(item)}
          />
        )}
        inverted
        contentContainerStyle={{ paddingVertical: 8 }}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.2}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 8 }} /> : null}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 48 }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>👥</Text>
            <Text style={{ fontSize: 14, color: C.gray400, textAlign: 'center' }}>No messages yet.{'\n'}Be the first to say something!</Text>
          </View>
        }
      />

      <ChatInput onSend={(t) => sendMut.mutate({ content: t, clientMessageId: genId() })} isPending={sendMut.isPending} accentColor={ACCENT} />
    </KeyboardAvoidingView>
  );
}

// ── Unified conversation list ───────────────────────────────────────────────────

function UnifiedList({
  onSelectConversation, onSelectGroup,
}: {
  onSelectConversation: (c: any) => void;
  onSelectGroup: (g: any) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const qc = useQueryClient();

  const { data: conv, isLoading: convLoading, refetch: refetchConv } = useQuery({
    queryKey: ['m-myConversation'],
    queryFn: getMyConversation,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: groupData, isLoading: groupLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['m-groups-member'],
    queryFn: () => listGroups({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const groups: any[] = groupData?.items ?? groupData ?? [];

  // Build unified item list sorted by last message
  const allItems = useMemo(() => {
    const items: any[] = [];
    if (conv) items.push({ ...conv, _type: 'conv', _name: 'Your Admin', _sortAt: conv.lastMessageAt ?? conv.createdAt });
    groups.forEach((g: any) => items.push({ ...g, _type: 'group', _name: g.name, _sortAt: g.lastMessageAt ?? g.createdAt }));
    return items.sort((a, b) => new Date(b._sortAt ?? 0).getTime() - new Date(a._sortAt ?? 0).getTime());
  }, [conv, groups]);

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    let list = allItems;
    if (filter === 'unread') {
      list = list.filter((item) => {
        const unread = item._type === 'group' ? (item.unreadCount ?? 0) : (item.memberUnread ?? item.unreadCount ?? 0);
        return unread > 0;
      });
    } else if (filter === 'groups') {
      list = list.filter((item) => item._type === 'group');
    }
    if (!q) return list;
    return list.filter((item) => item._name?.toLowerCase().includes(q));
  }, [allItems, q, filter]);

  // When searching and no match — show "Admin" as a contact to start chat
  const showAdminContact = q && !conv && 'your admin'.includes(q);

  const isLoading = convLoading && groupLoading;

  function renderItem({ item }: { item: any }) {
    const isGroup = item._type === 'group';
    const unread = isGroup ? (item.unreadCount ?? 0) : (item.memberUnread ?? item.unreadCount ?? 0);
    const preview = isGroup
      ? (item.lastMessagePreview ?? `${item.memberCount ?? 0} members`)
      : (item.lastMessagePreview ?? 'No messages yet');

    return (
      <TouchableOpacity
        onPress={() => isGroup ? onSelectGroup(item) : onSelectConversation(item)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
      >
        <View style={{
          width: 46, height: 46, borderRadius: 23,
          backgroundColor: isGroup ? '#DCFCE7' : '#DBEAFE',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {isGroup
            ? <Text style={{ fontSize: 18 }}>👥</Text>
            : <Text style={{ fontSize: 18 }}>🏢</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: unread > 0 ? '700' : '600', color: C.gray900 }} numberOfLines={1}>
              {item._name}
            </Text>
            <Text style={{ fontSize: 11, color: C.gray400 }}>{formatTime(item._sortAt)}</Text>
          </View>
          <Text style={{ fontSize: 12, color: unread > 0 ? C.gray700 : C.gray400, marginTop: 2, fontWeight: unread > 0 ? '600' : '400' }} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        {unread > 0 && (
          <View style={{
            backgroundColor: isGroup ? '#16a34a' : C.navy,
            borderRadius: 10, minWidth: 20, height: 20,
            alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Text style={{ fontSize: 14, color: C.gray400 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search messages..."
            placeholderTextColor={C.gray400}
            style={{ flex: 1, fontSize: 14, color: C.gray900, paddingVertical: 10 }}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter capsules */}
      {!search && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: C.gray100 }}>
          {(['all', 'unread', 'groups'] as const).map((f) => {
            const label = f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Groups';
            const active = filter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6,
                  borderRadius: 20, borderWidth: 1,
                  borderColor: active ? C.navy : C.gray200,
                  backgroundColor: active ? C.navy : '#fff',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : C.gray500 }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i._type + '-' + i.id}
          renderItem={renderItem}
          onRefresh={() => { refetchConv(); refetchGroups(); }}
          refreshing={false}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.gray100 }} />}
          ListHeaderComponent={
            showAdminContact ? (
              <TouchableOpacity
                onPress={() => onSelectConversation({ id: null, _name: 'Your Admin' })}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#F0F4FF' }}
              >
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>🏢</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Your Admin</Text>
                  <Text style={{ fontSize: 12, color: C.navy }}>Tap to start a conversation</Text>
                </View>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            !showAdminContact ? (
              <View style={{ alignItems: 'center', paddingVertical: 52 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, textAlign: 'center', marginBottom: 6 }}>
                  {q ? 'No results' : 'No conversations yet'}
                </Text>
                <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>
                  {q ? 'Try a different search term' : 'Your admin can message you here, and you can join groups.'}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function MemberMessagesScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [activeConv, setActiveConv] = useState<any>(null);
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const userId = user?.id ?? '';

  async function openConversation(conv: any) {
    if (conv?.id) { setActiveConv(conv); return; }
    // No conversation yet — fetch/create it
    try {
      const fetched = await getMyConversation();
      setActiveConv(fetched);
      qc.invalidateQueries({ queryKey: ['m-myConversation'] });
    } catch {
      // Still open with placeholder so user can send first message
      setActiveConv({ id: null });
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      {!activeConv && !activeGroup && (
        <View style={{ padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.gray100 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Messages</Text>
        </View>
      )}

      {activeConv ? (
        activeConv.id ? (
          <AdminChatView conversation={activeConv} userId={userId} onBack={() => setActiveConv(null)} />
        ) : (
          // No conversation ID — show empty chat, admin will initiate
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <TouchableOpacity onPress={() => setActiveConv(null)} style={{ position: 'absolute', top: 16, left: 16 }}>
              <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 36, marginBottom: 16 }}>💬</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900, textAlign: 'center', marginBottom: 8 }}>No conversation yet</Text>
            <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>Your admin will message you here once they start a conversation with you.</Text>
          </View>
        )
      ) : activeGroup ? (
        <GroupChatView group={activeGroup} userId={userId} onBack={() => setActiveGroup(null)} />
      ) : (
        <UnifiedList
          onSelectConversation={openConversation}
          onSelectGroup={setActiveGroup}
        />
      )}
    </SafeAreaView>
  );
}
