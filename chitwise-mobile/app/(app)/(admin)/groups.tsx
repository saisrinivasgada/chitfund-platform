import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import {
  listGroups, createGroup, getGroupMessages, sendGroupMessage,
  deleteGroupMessage, getGroupMembers, addGroupMember, removeGroupMember,
} from '../../../services/api';

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

// ── CreateGroupModal ──────────────────────────────────────────────────────────

function CreateGroupModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (g: any) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => createGroup({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (group) => { onCreated(group); onClose(); setName(''); setDescription(''); setError(''); },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to create group'),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.gray900, marginBottom: 20 }}>New Group</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Group Name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Chit Group A Members"
                placeholderTextColor={C.gray400}
                maxLength={100}
                style={{
                  borderWidth: 1, borderColor: C.gray200, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.gray900,
                  backgroundColor: '#F9FAFB', marginBottom: 14,
                }}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this group for?"
                placeholderTextColor={C.gray400}
                maxLength={255}
                style={{
                  borderWidth: 1, borderColor: C.gray200, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.gray900,
                  backgroundColor: '#F9FAFB', marginBottom: 14,
                }}
              />
              {!!error && <Text style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</Text>}
              <TouchableOpacity
                onPress={() => mutation.mutate()}
                disabled={name.trim().length < 2 || mutation.isPending}
                style={{
                  backgroundColor: name.trim().length < 2 || mutation.isPending ? C.gray200 : '#16a34a',
                  borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                }}
              >
                {mutation.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Group</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ── GroupChatView ─────────────────────────────────────────────────────────────

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m-groupMessages', group.id] });
      queryClient.invalidateQueries({ queryKey: ['m-groups'] });
      setInput('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => deleteGroupMessage(group.id, msgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['m-groupMessages', group.id] }),
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
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a', marginBottom: 2 }}>
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

// ── GroupList ─────────────────────────────────────────────────────────────────

function GroupList({ onSelect, onNew }: { onSelect: (g: any) => void; onNew: () => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['m-groups'],
    queryFn: () => listGroups({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items: any[] = data?.items ?? data ?? [];

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.navy} />
    </View>
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      onRefresh={refetch}
      refreshing={isLoading}
      ListHeaderComponent={() => (
        <TouchableOpacity
          onPress={onNew}
          style={{
            margin: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1.5,
            borderColor: '#16a34a', borderStyle: 'dashed',
            paddingVertical: 12, alignItems: 'center',
          }}
        >
          <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 14 }}>＋ New Group</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={() => (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>👥</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, textAlign: 'center', marginBottom: 6 }}>No groups yet</Text>
          <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>Create a group to chat with multiple members at once.</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.gray100 }} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#16a34a' }}>{item.name?.[0]?.toUpperCase() ?? 'G'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{item.name}</Text>
              <Text style={{ fontSize: 11, color: C.gray400 }}>{formatTime(item.lastMessageAt ?? item.createdAt)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }} numberOfLines={1}>
              {item.lastMessagePreview ?? `${item.memberCount ?? 0} members`}
            </Text>
          </View>
          {item.unreadCount > 0 && (
            <View style={{ backgroundColor: '#16a34a', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminGroupsScreen() {
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Group Chats</Text>
      </View>

      {selected ? (
        <GroupChatView group={selected} userId={user?.id ?? ''} onBack={() => setSelected(null)} />
      ) : (
        <GroupList onSelect={setSelected} onNew={() => setShowCreate(true)} />
      )}

      <CreateGroupModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(g) => { setSelected(g); }}
      />
    </SafeAreaView>
  );
}
