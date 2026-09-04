import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import {
  getMyConversation, getChatMessages, sendChatMessage,
  deleteChatMessage, markConversationRead,
} from '../../../services/api';

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffMs < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function canDelete(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 300_000;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function MemberMessagesScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');

  const { data: conversation, isLoading: convLoading } = useQuery({
    queryKey: ['m-myConversation'],
    queryFn: getMyConversation,
    staleTime: 60_000,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['m-chatMessages', conversation?.id],
    queryFn: ({ pageParam }: any) => getChatMessages(conversation!.id, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (last: any) => last?.nextCursor ?? undefined,
    initialPageParam: undefined,
    enabled: !!conversation?.id,
    staleTime: 10_000,
  });

  const messages: any[] = (data?.pages ?? []).flatMap((p: any) => p?.items ?? []);

  useEffect(() => {
    if (conversation?.id) {
      markConversationRead(conversation.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['memberConvUnread'] });
    }
  }, [conversation?.id]);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }: any) =>
      sendChatMessage(conversation!.id, content, clientMessageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m-chatMessages', conversation?.id] });
      setInput('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => deleteChatMessage(conversation!.id, msgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['m-chatMessages', conversation?.id] }),
  });

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !conversation?.id || sendMutation.isPending) return;
    sendMutation.mutate({ content, clientMessageId: genId() });
  }, [input, conversation, sendMutation]);

  const handleDelete = (msg: any) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(msg.id) },
    ]);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const mine = item.senderId === user?.id;
    return (
      <TouchableOpacity
        onLongPress={() => mine && !item.deleted && canDelete(item.createdAt) && handleDelete(item)}
        activeOpacity={0.9}
        style={{ flexDirection: mine ? 'row-reverse' : 'row', marginVertical: 3, paddingHorizontal: 12 }}
      >
        <View style={{
          maxWidth: '75%',
          backgroundColor: item.deleted ? '#F3F4F6' : mine ? '#D4A017' : '#F3F4F6',
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
          <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.65)' : C.gray400, marginTop: 2, textAlign: 'right' }}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (convLoading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.navy} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: C.gray100 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: '#EFF4FA', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>🏢</Text>
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Your Org Admin</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>Messages from your chitfund admin</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={{ paddingVertical: 8 }}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.2}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 8 }} /> : null}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>💬</Text>
              <Text style={{ fontSize: 14, color: C.gray400, textAlign: 'center', lineHeight: 21 }}>
                No messages yet.{'\n'}Your admin can message you here.
              </Text>
            </View>
          }
        />

        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          padding: 12, borderTopWidth: 1, borderColor: C.gray100,
        }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Reply to your admin..."
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
              backgroundColor: !input.trim() || sendMutation.isPending ? C.gray200 : '#D4A017',
            }}
          >
            {sendMutation.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontSize: 16 }}>↑</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
