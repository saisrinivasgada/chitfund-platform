import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import {
  listConversations, getChatMessages, sendChatMessage,
  deleteChatMessage, markConversationRead,
} from '../../../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string) {
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

// ── ConversationList ──────────────────────────────────────────────────────────

function ConversationList({ onSelect }: { onSelect: (c: any) => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['m-conversations'],
    queryFn: () => listConversations({ size: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items: any[] = data?.items ?? [];

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.navy} />
    </View>
  );

  if (items.length === 0) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 32, marginBottom: 12 }}>💬</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, textAlign: 'center', marginBottom: 6 }}>
        No conversations yet
      </Text>
      <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', lineHeight: 20 }}>
        Open a member's profile and tap "Message" to start a chat.
      </Text>
    </View>
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      onRefresh={refetch}
      refreshing={isLoading}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.gray100 }} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>
              {item.memberName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{item.memberName}</Text>
              <Text style={{ fontSize: 11, color: C.gray400 }}>{formatTime(item.lastMessageAt ?? item.createdAt)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }} numberOfLines={1}>
              {item.lastMessagePreview
                ? (item.lastMessageIsAdmin ? 'You: ' : '') + item.lastMessagePreview
                : 'No messages yet'}
            </Text>
          </View>
          {item.adminUnread > 0 && (
            <View style={{
              backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20,
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
            }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                {item.adminUnread > 9 ? '9+' : item.adminUnread}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────

function ChatView({ conversation, userId, onBack }: { conversation: any; userId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const flatRef = useRef<FlatList>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-chatMessages', conversation.id],
    queryFn: ({ pageParam }: any) => getChatMessages(conversation.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    staleTime: 10_000,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  useEffect(() => {
    markConversationRead(conversation.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
    queryClient.invalidateQueries({ queryKey: ['m-convUnread'] });
  }, [conversation.id]);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }: any) =>
      sendChatMessage(conversation.id, content, clientMessageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m-chatMessages', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['m-conversations'] });
      setInput('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => deleteChatMessage(conversation.id, msgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['m-chatMessages', conversation.id] }),
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
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.navy, marginBottom: 2 }}>
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
      {/* Chat header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 20, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontWeight: '700', color: C.navy }}>
            {conversation.memberName?.[0]?.toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{conversation.memberName}</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>Member</Text>
        </View>
      </View>

      {/* Messages */}
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

      {/* Input */}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        padding: 12, borderTopWidth: 1, borderColor: C.gray100,
      }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={C.gray400}
          multiline
          style={{
            flex: 1, maxHeight: 100, fontSize: 14, color: C.gray900,
            borderWidth: 1, borderColor: C.gray200, borderRadius: 16,
            paddingHorizontal: 14, paddingVertical: 10,
            backgroundColor: '#F9FAFB',
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminMessagesScreen() {
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<any>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      {/* Header */}
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Member Messages</Text>
      </View>

      {selected ? (
        <ChatView
          conversation={selected}
          userId={user?.id ?? ''}
          onBack={() => setSelected(null)}
        />
      ) : (
        <ConversationList onSelect={setSelected} />
      )}
    </SafeAreaView>
  );
}
