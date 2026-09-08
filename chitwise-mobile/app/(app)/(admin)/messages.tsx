import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { C } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import {
  listConversations, startConversation,
  getChatMessages, sendChatMessage, deleteChatMessage, markConversationRead,
  listGroups, createGroup, getGroupMessages, sendGroupMessage, deleteGroupMessage,
  getMembers, listStaff,
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

// ── ChatView (DM) ──────────────────────────────────────────────────────────────

function ChatView({ conversation: initialConv, userId, isMember, orgLabel, onBack }: { conversation: any; userId: string; isMember?: boolean; orgLabel?: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  // conv may start without an id (draft mode) — conversation created on first send
  const [conv, setConv] = useState(initialConv);
  const hasId = !!conv.id;
  const [input, setInput] = useState('');
  const flatRef = useRef<FlatList>(null);

  // Promote from draft to real conv if conversations list loads and finds a match
  const { data: convList } = useQuery({
    queryKey: ['m-conversations'],
    queryFn: () => listConversations({ size: 50 }),
    staleTime: 30_000,
    enabled: !hasId && !!conv.memberId,
  });
  useEffect(() => {
    if (hasId || !convList) return;
    const found = (convList.items ?? []).find((c: any) => c.memberId === conv.memberId);
    if (found) setConv(found);
  }, [convList, hasId, conv.memberId]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-chatMessages', conv.id],
    queryFn: ({ pageParam }: any) => getChatMessages(conv.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    staleTime: 10_000,
    enabled: hasId,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  useEffect(() => {
    if (!hasId) return;
    markConversationRead(conv.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
    queryClient.invalidateQueries({ queryKey: ['m-convUnread'] });
  }, [conv.id, hasId]);

  const sendMutation = useMutation({
    mutationFn: async ({ content, clientMessageId }: any) => {
      let convId = conv.id;
      let createdConv: any = null;
      if (!convId) {
        // First message — create conversation now
        createdConv = await startConversation({ memberId: conv.memberId, memberName: conv.memberName });
        convId = createdConv.id;
      }
      const msg = await sendChatMessage(convId, content, clientMessageId);
      return { msg, createdConv, convId };
    },
    onSuccess: ({ msg, createdConv, convId }: any) => {
      if (createdConv) {
        setConv(createdConv);
        queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
      }
      queryClient.setQueryData(['m-chatMessages', convId], (old: any) => {
        if (!old) return { pages: [{ items: [msg], nextCursor: null }], pageParams: [undefined] };
        const exists = old.pages.some((p: any) => (p.items ?? []).some((m: any) => m.id === msg.id));
        if (exists) return old;
        const firstPage = old.pages[0] ?? { items: [] };
        return {
          ...old,
          pages: [{ ...firstPage, items: [msg, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
        };
      });
      queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
      setInput('');
    },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Failed to send message'),
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => deleteChatMessage(conv.id, msgId),
    onSuccess: (_: any, msgId: string) => {
      queryClient.setQueryData(['m-chatMessages', conv.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            items: (p.items ?? []).map((m: any) =>
              m.id === msgId ? { ...m, content: 'This message was deleted', deleted: true } : m
            ),
          })),
        };
      });
    },
  });

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate({ content, clientMessageId: genId() });
  }, [input, sendMutation]);

  const handleDelete = (msg: any) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(msg.id) },
    ]);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const mine = item.senderId === userId;
    return (
      <TouchableOpacity
        onLongPress={() => mine && !item.deleted && canDelete(item.createdAt) && handleDelete(item)}
        activeOpacity={0.9}
        style={{ flexDirection: mine ? 'row-reverse' : 'row', marginVertical: 3, paddingHorizontal: 12 }}
      >
        <View style={{
          maxWidth: '75%',
          backgroundColor: item.deleted ? '#F3F4F6' : mine ? C.navy : '#F3F4F6',
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          paddingHorizontal: 12, paddingVertical: 8,
        }}>
          {!mine && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy, marginBottom: 2 }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2, gap: 3 }}>
            <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.7)' : C.gray400 }}>
              {formatTime(item.createdAt)}
            </Text>
            {mine && !item.deleted && (
              <Text style={{ fontSize: 11, lineHeight: 13, color: item.readAt ? '#93C5FD' : 'rgba(255,255,255,0.6)' }}>
                {item.readAt ? '✓✓' : '✓'}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '700', color: C.navy }}>
            {isMember ? (orgLabel?.[0]?.toUpperCase() ?? 'O') : (conv.memberName?.[0]?.toUpperCase() ?? '?')}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
            {isMember ? orgLabel : conv.memberName}
          </Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>{isMember ? 'Admin' : 'Member'}</Text>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={{ paddingVertical: 8 }}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.2}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 8 }} /> : null}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: C.gray100 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={C.gray400}
          multiline
          style={{
            flex: 1, maxHeight: 100, fontSize: 14, color: C.gray900,
            borderWidth: 1, borderColor: C.gray200, borderRadius: 16,
            paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB',
          }}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          style={{
            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            backgroundColor: !input.trim() || sendMutation.isPending ? C.gray200 : C.navy,
          }}
        >
          {sendMutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontSize: 16 }}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── GroupChatView ──────────────────────────────────────────────────────────────

function GroupChatView({ group, userId, onBack }: { group: any; userId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const flatRef = useRef<FlatList>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-groupMessages', group.id],
    queryFn: ({ pageParam }: any) => getGroupMessages(group.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }: any) => sendGroupMessage(group.id, content, clientMessageId),
    onSuccess: (newMsg: any) => {
      queryClient.setQueryData(['m-groupMessages', group.id], (old: any) => {
        if (!old) return { pages: [{ items: [newMsg], nextCursor: null }], pageParams: [undefined] };
        const exists = old.pages.some((p: any) => (p.items ?? []).some((m: any) => m.id === newMsg.id));
        if (exists) return old;
        const firstPage = old.pages[0] ?? { items: [] };
        return {
          ...old,
          pages: [{ ...firstPage, items: [newMsg, ...(firstPage.items ?? [])] }, ...old.pages.slice(1)],
        };
      });
      queryClient.invalidateQueries({ queryKey: ['m-groups'] });
      setInput('');
    },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Failed to send message'),
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => deleteGroupMessage(group.id, msgId),
    onSuccess: (_: any, msgId: string) => {
      queryClient.setQueryData(['m-groupMessages', group.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            items: (p.items ?? []).map((m: any) =>
              m.id === msgId ? { ...m, content: 'This message was deleted', deleted: true } : m
            ),
          })),
        };
      });
    },
  });

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate({ content, clientMessageId: genId() });
  }, [input, sendMutation]);

  const handleDelete = (msg: any) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(msg.id) },
    ]);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const mine = item.senderId === userId;
    return (
      <TouchableOpacity
        onLongPress={() => mine && !item.deleted && canDelete(item.createdAt) && handleDelete(item)}
        activeOpacity={0.9}
        style={{ flexDirection: mine ? 'row-reverse' : 'row', marginVertical: 3, paddingHorizontal: 12 }}
      >
        <View style={{
          maxWidth: '75%',
          backgroundColor: item.deleted ? '#F3F4F6' : mine ? '#16a34a' : '#F3F4F6',
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          paddingHorizontal: 12, paddingVertical: 8,
        }}>
          {!mine && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a', marginBottom: 2 }}>
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
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '700', color: '#16a34a' }}>{group.name?.[0]?.toUpperCase() ?? 'G'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{group.name}</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>{group.memberCount ?? 0} members</Text>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={{ paddingVertical: 8 }}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.2}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 8 }} /> : null}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: C.gray100 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={C.gray400}
          multiline
          style={{
            flex: 1, maxHeight: 100, fontSize: 14, color: C.gray900,
            borderWidth: 1, borderColor: C.gray200, borderRadius: 16,
            paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB',
          }}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          style={{
            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            backgroundColor: !input.trim() || sendMutation.isPending ? C.gray200 : '#16a34a',
          }}
        >
          {sendMutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontSize: 16 }}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── PersonRow ──────────────────────────────────────────────────────────────────

function PersonRow({ person, onPress, selected }: { person: any; onPress: () => void; selected?: boolean }) {
  const displayName = person.fullName ?? person.memberName ?? person.name ?? '—';
  const role = person.role ?? 'MEMBER';
  const phone = person.phone ?? person.mobileNumber ?? '';
  const city = person.city ?? '';
  const sub = [phone, city].filter(Boolean).join('  ·  ');
  const initial = displayName[0]?.toUpperCase() ?? '?';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: selected ? '#EFF4FA' : '#fff',
      }}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: role === 'MEMBER' ? '#DBEAFE' : '#DCFCE7',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontWeight: '700', color: role === 'MEMBER' ? C.navy : '#16a34a', fontSize: 14 }}>
          {initial}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{displayName}</Text>
        {!!sub && (
          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{sub}</Text>
        )}
      </View>
      {selected !== undefined && (
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          borderWidth: 2, borderColor: selected ? C.navy : C.gray300,
          backgroundColor: selected ? C.navy : '#fff',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── NewChatModal ───────────────────────────────────────────────────────────────

type Step = 'choose' | 'member' | 'group-details' | 'group-members';

function NewChatModal({
  visible, onClose, onConversationStarted, onGroupCreated, canCreateGroup, userId,
}: {
  visible: boolean;
  onClose: () => void;
  onConversationStarted: (conv: any) => void;
  onGroupCreated: (group: any) => void;
  canCreateGroup: boolean;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('choose');
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selected, setSelected] = useState<Map<string, any>>(new Map());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  function resetAndClose() {
    setStep('choose');
    setGroupName('');
    setGroupDesc('');
    setSelected(new Map());
    setSearch('');
    setError('');
    onClose();
  }

  const { data: membersRaw = [], isLoading: membersLoading } = useQuery({
    queryKey: ['m-members-for-chat'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 200 }),
    enabled: visible && (step === 'member' || step === 'group-members'),
    staleTime: 60_000,
  });

  const { data: staffRaw = [], isLoading: staffLoading } = useQuery({
    queryKey: ['m-staff-for-group'],
    queryFn: listStaff,
    enabled: visible && step === 'group-members',
    staleTime: 60_000,
  });

  const dmMembers = useMemo(() => {
    return (membersRaw as any[])
      .filter((m: any) => m.userId && m.hasAppAccess)
      .sort((a: any, b: any) => (a.fullName ?? a.name ?? '').localeCompare(b.fullName ?? b.name ?? ''));
  }, [membersRaw]);

  const groupPeople = useMemo(() => {
    const all: any[] = [
      ...(membersRaw as any[])
        .filter((m: any) => m.userId && m.userId !== userId)
        .map((m: any) => ({
          id: m.userId,
          fullName: m.fullName ?? m.name,
          role: 'MEMBER',
          phone: m.mobileNumber ?? m.phone ?? '',
          city: m.city ?? '',
        })),
      ...(staffRaw as any[])
        .filter((s: any) => s.id !== userId)
        .map((s: any) => ({
          id: s.id,
          fullName: s.fullName ?? s.username,
          role: s.role ?? 'STAFF',
          phone: s.mobileNumber ?? '',
          city: '',
        })),
    ];
    return all.sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
  }, [membersRaw, staffRaw, userId]);

  const filteredDmMembers = useMemo(() => {
    if (!search) return dmMembers;
    const q = search.toLowerCase();
    return dmMembers.filter((m: any) =>
      (m.fullName ?? m.name ?? '').toLowerCase().includes(q) ||
      (m.mobileNumber ?? '').includes(q) ||
      (m.city ?? '').toLowerCase().includes(q)
    );
  }, [dmMembers, search]);

  const filteredGroupPeople = useMemo(() => {
    if (!search) return groupPeople;
    const q = search.toLowerCase();
    return groupPeople.filter((p: any) =>
      (p.fullName ?? '').toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q)
    );
  }, [groupPeople, search]);

  const startDmMutation = useMutation({
    mutationFn: (member: any) =>
      startConversation({ memberId: member.userId ?? member.id, memberName: member.fullName ?? member.name }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
      onConversationStarted(conv);
      resetAndClose();
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to start conversation'),
  });

  const createGroupMutation = useMutation({
    mutationFn: () => {
      const memberIds = [...selected.keys()];
      const members = [...selected.values()].map((p) => ({
        userId: p.id,
        userName: p.fullName ?? '',
        role: p.role ?? 'MEMBER',
      }));
      return createGroup({ name: groupName.trim(), description: groupDesc.trim() || undefined, memberIds, members });
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ['m-groups'] });
      onGroupCreated(group);
      resetAndClose();
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to create group'),
  });

  function togglePerson(p: any) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  }

  const isLoading = membersLoading || staffLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={resetAndClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.gray200 }} />
              </View>

              {/* Choose */}
              {step === 'choose' && (
                <View style={{ padding: 24, paddingBottom: 40, gap: 12 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.gray900, marginBottom: 8 }}>New Chat</Text>
                  <TouchableOpacity
                    onPress={() => { setSearch(''); setStep('member'); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.gray200, backgroundColor: '#F9FAFB' }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20 }}>💬</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Message a Member</Text>
                      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Start a 1-on-1 chat</Text>
                    </View>
                    <Text style={{ color: C.gray400, fontSize: 18 }}>›</Text>
                  </TouchableOpacity>
                  {canCreateGroup && (
                    <TouchableOpacity
                      onPress={() => { setSearch(''); setStep('group-details'); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.gray200, backgroundColor: '#F9FAFB' }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>👥</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Create Group</Text>
                        <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Broadcast to multiple people</Text>
                      </View>
                      <Text style={{ color: C.gray400, fontSize: 18 }}>›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Member DM pick */}
              {step === 'member' && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
                    <TouchableOpacity onPress={() => setStep('choose')}>
                      <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900, flex: 1 }}>Message a Member</Text>
                  </View>
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search by name or phone..."
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, backgroundColor: '#F9FAFB' }}
                    />
                  </View>
                  {!!error && <Text style={{ color: C.red, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 }}>{error}</Text>}
                  {isLoading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={C.navy} /></View>
                  ) : filteredDmMembers.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Text style={{ color: C.gray400, fontSize: 13 }}>
                        {search ? 'No members match your search' : 'No members with app access yet'}
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                      {filteredDmMembers.map((m: any) => (
                        <PersonRow
                          key={m.userId ?? m.id}
                          person={{ ...m, fullName: m.fullName ?? m.name, phone: m.mobileNumber, id: m.userId }}
                          onPress={() => { setError(''); startDmMutation.mutate(m); }}
                        />
                      ))}
                    </ScrollView>
                  )}
                  <View style={{ height: 24 }} />
                </View>
              )}

              {/* Group details */}
              {step === 'group-details' && (
                <View style={{ padding: 24, paddingBottom: 40 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <TouchableOpacity onPress={() => setStep('choose')}>
                      <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900 }}>New Group</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Group Name *</Text>
                  <TextInput
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder="e.g. Chit Group A Members"
                    placeholderTextColor={C.gray400}
                    maxLength={100}
                    style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.gray900, backgroundColor: '#F9FAFB', marginBottom: 14 }}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Description (optional)</Text>
                  <TextInput
                    value={groupDesc}
                    onChangeText={setGroupDesc}
                    placeholder="What is this group for?"
                    placeholderTextColor={C.gray400}
                    maxLength={255}
                    style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.gray900, backgroundColor: '#F9FAFB', marginBottom: 20 }}
                  />
                  <TouchableOpacity
                    onPress={() => { setSearch(''); setStep('group-members'); }}
                    disabled={groupName.trim().length < 2}
                    style={{ backgroundColor: groupName.trim().length < 2 ? C.gray200 : C.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Next: Add Members</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Group members pick */}
              {step === 'group-members' && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
                    <TouchableOpacity onPress={() => setStep('group-details')}>
                      <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900, flex: 1 }}>
                      Add Members ({selected.size})
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search..."
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, backgroundColor: '#F9FAFB' }}
                    />
                  </View>
                  {!!error && <Text style={{ color: C.red, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 }}>{error}</Text>}
                  {isLoading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={C.navy} /></View>
                  ) : (
                    <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                      {filteredGroupPeople.map((p) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          selected={selected.has(p.id)}
                          onPress={() => togglePerson(p)}
                        />
                      ))}
                    </ScrollView>
                  )}
                  <View style={{ padding: 16 }}>
                    <TouchableOpacity
                      onPress={() => createGroupMutation.mutate()}
                      disabled={selected.size === 0 || createGroupMutation.isPending}
                      style={{ backgroundColor: selected.size === 0 || createGroupMutation.isPending ? C.gray200 : '#16a34a', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                    >
                      {createGroupMutation.isPending
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                            Create Group with {selected.size} member{selected.size !== 1 ? 's' : ''}
                          </Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ── UnifiedList ────────────────────────────────────────────────────────────────

function UnifiedList({
  onSelectConversation, onSelectGroup, onNew, userId,
}: {
  onSelectConversation: (c: any) => void;
  onSelectGroup: (g: any) => void;
  onNew: () => void;
  userId: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const qc = useQueryClient();

  const { data: convData, isLoading: convLoading, refetch: refetchConvs } = useQuery({
    queryKey: ['m-conversations'],
    queryFn: () => listConversations({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: groupData, isLoading: groupLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['m-groups'],
    queryFn: () => listGroups({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Members with app access — only loaded when search has text
  const { data: membersRaw = [] } = useQuery({
    queryKey: ['m-members-for-chat'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 200 }),
    enabled: search.length >= 2,
    staleTime: 60_000,
  });

  const conversations: any[] = convData?.items ?? [];
  const groups: any[] = groupData?.items ?? groupData ?? [];

  const q = search.toLowerCase().trim();

  const merged = useMemo(() => {
    const convItems = conversations.map((c: any) => ({ ...c, _type: 'conv', _sortAt: c.lastMessageAt ?? c.createdAt }));
    const groupItems = groups.map((g: any) => ({ ...g, _type: 'group', _sortAt: g.lastMessageAt ?? g.createdAt }));
    return [...convItems, ...groupItems].sort(
      (a, b) => new Date(b._sortAt ?? 0).getTime() - new Date(a._sortAt ?? 0).getTime()
    );
  }, [conversations, groups]);

  const filtered = useMemo(() => {
    let list = merged;
    // Tab filter
    if (filter === 'unread') {
      list = list.filter((item) => {
        const unread = item._type === 'group' ? (item.unreadCount ?? 0) : (item.adminUnread ?? 0);
        return unread > 0;
      });
    } else if (filter === 'groups') {
      list = list.filter((item) => item._type === 'group');
    }
    // Search filter
    if (!q) return list;
    return list.filter((item) => {
      const name = item._type === 'group' ? item.name : item.memberName;
      return name?.toLowerCase().includes(q);
    });
  }, [merged, q, filter]);

  // Members not yet in a conversation (shown when search has no match in existing convos)
  const existingMemberIds = useMemo(
    () => new Set(conversations.map((c: any) => c.memberId).filter(Boolean)),
    [conversations]
  );

  const contactSuggestions = useMemo(() => {
    if (q.length < 2) return [];
    const hasConvMatch = filtered.some((i) => i._type === 'conv');
    if (hasConvMatch) return []; // existing convos already shown
    return (membersRaw as any[])
      .filter((m: any) => m.userId && m.hasAppAccess && !existingMemberIds.has(m.memberId ?? m.id))
      .filter((m: any) => (m.fullName ?? m.name ?? '').toLowerCase().includes(q))
      .slice(0, 5);
  }, [membersRaw, q, filtered, existingMemberIds]);

  const isLoading = convLoading && groupLoading;

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.navy} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Text style={{ fontSize: 14, color: C.gray400 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search or start new chat..."
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

      <FlatList
        data={filtered}
        keyExtractor={(i) => i._type + '-' + i.id}
        onRefresh={() => { refetchConvs(); refetchGroups(); }}
        refreshing={false}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.gray100 }} />}
        ListHeaderComponent={
          contactSuggestions.length > 0 ? (
            <View>
              <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Start new chat
                </Text>
              </View>
              {contactSuggestions.map((m: any) => (
                <TouchableOpacity
                  key={m.userId ?? m.id}
                  onPress={() => {
                    setSearch('');
                    startConversation({ memberId: m.userId ?? m.id, memberName: m.fullName ?? m.name })
                      .then((conv) => {
                        qc.invalidateQueries({ queryKey: ['m-conversations'] });
                        onSelectConversation(conv);
                      })
                      .catch(() => {});
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#F0F4FF' }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>
                      {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{m.fullName ?? m.name}</Text>
                    <Text style={{ fontSize: 12, color: C.navy }}>Tap to start a conversation</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filtered.length > 0 && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Existing chats
                  </Text>
                </View>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          contactSuggestions.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48, marginTop: 20 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, textAlign: 'center', marginBottom: 6 }}>
                {q ? 'No results' : 'No conversations yet'}
              </Text>
              <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>
                {q ? 'No members or groups match your search' : 'Tap + to message a member or create a group chat.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isGroup = item._type === 'group';
          const name = isGroup ? item.name : item.memberName;
          const unread = isGroup ? (item.unreadCount ?? 0) : (item.adminUnread ?? 0);
          const preview = isGroup
            ? (item.lastMessagePreview ?? `${item.memberCount ?? 0} members`)
            : (item.lastMessagePreview
                ? (item.lastMessageIsAdmin ? 'You: ' : '') + item.lastMessagePreview
                : 'No messages yet');

          return (
            <TouchableOpacity
              onPress={() => isGroup ? onSelectGroup(item) : onSelectConversation(item)}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: isGroup ? '#DCFCE7' : '#DBEAFE',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {isGroup
                  ? <Text style={{ fontSize: 18 }}>👥</Text>
                  : <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{name?.[0]?.toUpperCase() ?? '?'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: unread > 0 ? '700' : '600', color: C.gray900 }} numberOfLines={1}>{name}</Text>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{formatTime(item._sortAt)}</Text>
                </View>
                <Text style={{ fontSize: 12, color: unread > 0 ? C.gray700 : C.gray500, fontWeight: unread > 0 ? '600' : '400', marginTop: 2 }} numberOfLines={1}>{preview}</Text>
              </View>
              {unread > 0 && (
                <View style={{
                  backgroundColor: isGroup ? '#16a34a' : '#EF4444',
                  borderRadius: 10, minWidth: 20, height: 20,
                  alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Floating + */}
      <TouchableOpacity
        onPress={onNew}
        style={{
          position: 'absolute', bottom: 24, right: 20,
          width: 52, height: 52, borderRadius: 26,
          backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25, shadowRadius: 6, elevation: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 26, lineHeight: 28 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AdminMessagesScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ conversationId?: string; draftMemberId?: string; memberName?: string }>();

  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  // Open conversation from deep-link (member profile Message button)
  useEffect(() => {
    if (params.conversationId) {
      const cached = (queryClient.getQueryData<any>(['m-conversations'])?.items ?? [])
        .find((c: any) => c.id === params.conversationId);
      setActiveConversation(cached ?? { id: params.conversationId, memberName: params.memberName ?? 'Member' });
    } else if (params.draftMemberId) {
      // Draft mode: no conversation created yet, opens blank chat
      setActiveConversation({ memberId: params.draftMemberId, memberName: params.memberName ?? 'Member' });
    }
  }, [params.conversationId, params.draftMemberId]);

  const canCreateGroup = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isMember = user?.role === 'MEMBER';
  const userId = user?.id ?? '';
  const orgLabel = user?.tenantName ?? 'your Org';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      {!activeConversation && !activeGroup && (
        <View style={{ padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.gray100 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Messages</Text>
        </View>
      )}

      {activeConversation ? (
        <ChatView conversation={activeConversation} userId={userId} isMember={isMember} orgLabel={orgLabel} onBack={() => setActiveConversation(null)} />
      ) : activeGroup ? (
        <GroupChatView group={activeGroup} userId={userId} onBack={() => setActiveGroup(null)} />
      ) : (
        <UnifiedList
          onSelectConversation={setActiveConversation}
          onSelectGroup={setActiveGroup}
          onNew={() => setShowNewChat(true)}
          userId={userId}
        />
      )}

      <NewChatModal
        visible={showNewChat}
        onClose={() => setShowNewChat(false)}
        onConversationStarted={(conv) => setActiveConversation(conv)}
        onGroupCreated={(group) => setActiveGroup(group)}
        canCreateGroup={canCreateGroup}
        userId={userId}
      />
    </SafeAreaView>
  );
}
