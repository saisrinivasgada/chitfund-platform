import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hubCreateGroup, hubEmployeeDirectory, hubGetDmMessages, hubGetGroupMessages, hubListDms, hubListGroups, hubMarkDmRead, hubSendDmMessage, hubSendGroupMessage, hubStartDm } from '../../services/api';
import { C, T } from '../ui';
import { toast } from '../Toast';
import { useAuthStore } from '../../store/authStore';

type Selection = { id: string; name: string; kind: 'dm' | 'group' };

function Thread({ selected, onBack }: { selected: Selection; onBack: () => void }) {
  const qc = useQueryClient();
  const currentUserId = useAuthStore(s => s.user?.id);
  const [draft, setDraft] = useState('');
  const query = useQuery({
    queryKey: ['hub-chat-messages', selected.kind, selected.id],
    queryFn: () => selected.kind === 'dm' ? hubGetDmMessages(selected.id) : hubGetGroupMessages(selected.id),
    refetchInterval: 15000,
  });
  useEffect(() => { if (selected.kind === 'dm') hubMarkDmRead(selected.id).catch(() => {}); }, [selected]);
  const send = useMutation({
    mutationFn: () => selected.kind === 'dm' ? hubSendDmMessage(selected.id, draft.trim()) : hubSendGroupMessage(selected.id, draft.trim()),
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['hub-chat-messages', selected.kind, selected.id] }); },
    onError: (e: any) => toast.cancelled(e?.response?.data?.message ?? 'Message was not sent'),
  });
  const items: any[] = (query.data as any)?.items ?? [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 8 }}><Text style={{ fontSize: 22, color: C.navy }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>{selected.name}</Text>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {query.isLoading ? <ActivityIndicator color={C.navy} /> : items.length === 0 ? <Text style={{ color: C.gray400, textAlign: 'center', marginTop: 30 }}>No messages yet</Text> : items.slice().reverse().map((message: any) => <View key={message.id} style={{ marginBottom: 10, alignItems: message.senderId === currentUserId ? 'flex-end' : 'flex-start' }}>
          <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>{message.senderId === currentUserId ? 'You' : message.senderName}</Text>
          <View style={{ maxWidth: '86%', backgroundColor: message.senderId === currentUserId ? C.navy : C.white, borderWidth: message.senderId === currentUserId ? 0 : 1, borderColor: C.gray100, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9 }}><Text style={{ color: message.senderId === currentUserId ? C.white : C.gray900 }}>{message.deleted ? 'This message was deleted' : message.content}</Text></View>
        </View>)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.gray100 }}>
        <TextInput value={draft} onChangeText={setDraft} multiline placeholder="Message your team…" style={{ flex: 1, maxHeight: 90, borderWidth: 1, borderColor: C.gray200, borderRadius: 12, padding: 10 }} />
        <TouchableOpacity onPress={() => send.mutate()} disabled={!draft.trim() || send.isPending} style={{ width: 43, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.trim() ? C.navy : C.gray200 }}><Text style={{ color: C.white, fontSize: 18 }}>↑</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function HubChatScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'messages' | 'directory'>('messages');
  const [selected, setSelected] = useState<Selection | null>(null);
  const [showGroup, setShowGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const dms = useQuery({ queryKey: ['hub-dms'], queryFn: hubListDms, refetchInterval: 30000 });
  const groups = useQuery({ queryKey: ['hub-groups'], queryFn: hubListGroups, refetchInterval: 30000 });
  const directory = useQuery({ queryKey: ['hub-directory'], queryFn: hubEmployeeDirectory });
  const start = useMutation({ mutationFn: hubStartDm, onSuccess: (conversation: any) => { qc.invalidateQueries({ queryKey: ['hub-dms'] }); setSelected({ id: conversation.id, name: conversation.otherEmployeeName ?? 'Employee', kind: 'dm' }); }, onError: (e: any) => toast.cancelled(e?.response?.data?.message ?? 'Unable to start conversation') });
  const createGroup = useMutation({
    mutationFn: () => hubCreateGroup({ name: groupName.trim(), description: groupDescription.trim() || undefined, memberIds: groupMembers }),
    onSuccess: (group: any) => {
      setShowGroup(false); setGroupName(''); setGroupDescription(''); setGroupMembers([]);
      qc.invalidateQueries({ queryKey: ['hub-groups'] });
      toast.created('Group created');
      setSelected({ id: group.id, name: group.name, kind: 'group' });
    },
    onError: (e: any) => toast.cancelled(e?.response?.data?.message ?? 'Unable to create group'),
  });
  if (selected) return <Thread selected={selected} onBack={() => setSelected(null)} />;
  const conversations = [...((dms.data ?? []) as any[]).map(item => ({ ...item, kind: 'dm' })), ...((groups.data ?? []) as any[]).map(item => ({ ...item, kind: 'group', otherEmployeeName: item.name }))]
    .sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={T.h2}>Team Chat</Text><TouchableOpacity onPress={() => setShowGroup(true)} style={{ backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text style={{ color: C.white, fontWeight: '700', fontSize: 12 }}>+ Group</Text></TouchableOpacity></View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {(['messages', 'directory'] as const).map(value => <TouchableOpacity key={value} onPress={() => setTab(value)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, backgroundColor: tab === value ? C.navy : C.gray100 }}><Text style={{ color: tab === value ? C.white : C.gray600, fontWeight: '700', fontSize: 12 }}>{value === 'messages' ? 'Messages' : 'Employees'}</Text></TouchableOpacity>)}
      </View>
    </View>
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      {tab === 'messages' ? (dms.isLoading || groups.isLoading ? <ActivityIndicator color={C.navy} /> : conversations.length === 0 ? <Text style={{ color: C.gray400, textAlign: 'center', marginTop: 35 }}>Start a conversation from Employees</Text> : conversations.map((item: any) => <TouchableOpacity key={`${item.kind}-${item.id}`} onPress={() => setSelected({ id: item.id, name: item.otherEmployeeName, kind: item.kind })} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.gray100 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.white, fontWeight: '800' }}>{item.otherEmployeeName?.[0] ?? '?'}</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontWeight: '700', color: C.gray900 }}>{item.otherEmployeeName}</Text><Text style={{ color: C.gray400, fontSize: 12 }} numberOfLines={1}>{item.lastMessagePreview ?? (item.kind === 'group' ? 'Group conversation' : 'No messages yet')}</Text></View>
        {item.unreadCount > 0 && <Text style={{ color: C.white, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10 }}>{item.unreadCount}</Text>}
      </TouchableOpacity>)) : (directory.isLoading ? <ActivityIndicator color={C.navy} /> : ((directory.data ?? []) as any[]).map(employee => <TouchableOpacity key={employee.id} onPress={() => start.mutate(employee.id)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.gray100 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.navy, fontWeight: '800' }}>{employee.fullName?.[0] ?? '?'}</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontWeight: '700', color: C.gray900 }}>{employee.fullName}</Text><Text style={{ color: C.gray400, fontSize: 11 }}>{employee.employeeId} · {employee.role?.replace('_', ' ')}</Text></View><Text style={{ color: C.navy, fontSize: 18 }}>›</Text>
      </TouchableOpacity>))}
    </ScrollView>
    <Modal visible={showGroup} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ maxHeight: '82%', backgroundColor: C.surface, padding: 22, paddingBottom: 36, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <Text style={T.h2}>Create group</Text>
        <TextInput value={groupName} onChangeText={setGroupName} maxLength={100} placeholder="Group name" style={{ marginTop: 16, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, padding: 11 }} />
        <TextInput value={groupDescription} onChangeText={setGroupDescription} maxLength={500} placeholder="Description (optional)" style={{ marginTop: 10, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, padding: 11 }} />
        <Text style={{ marginTop: 16, marginBottom: 8, color: C.gray500, fontSize: 11, fontWeight: '800' }}>ADD EMPLOYEES</Text>
        <ScrollView style={{ maxHeight: 260 }}>{((directory.data ?? []) as any[]).map(employee => {
          const chosen = groupMembers.includes(employee.id);
          return <TouchableOpacity key={employee.id} onPress={() => setGroupMembers(ids => chosen ? ids.filter(id => id !== employee.id) : [...ids, employee.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}><View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: chosen ? C.navy : C.gray200, backgroundColor: chosen ? C.navy : C.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.white, fontWeight: '800' }}>{chosen ? '✓' : ''}</Text></View><View style={{ marginLeft: 10 }}><Text style={{ color: C.gray900, fontWeight: '600' }}>{employee.fullName}</Text><Text style={{ color: C.gray400, fontSize: 11 }}>{employee.role?.replace('_', ' ')}</Text></View></TouchableOpacity>;
        })}</ScrollView>
        <TouchableOpacity disabled={!groupName.trim() || createGroup.isPending} onPress={() => createGroup.mutate()} style={{ marginTop: 16, alignItems: 'center', padding: 13, borderRadius: 11, backgroundColor: groupName.trim() ? C.navy : C.gray200 }}><Text style={{ color: C.white, fontWeight: '800' }}>{createGroup.isPending ? 'Creating…' : 'Create group'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowGroup(false)} style={{ alignItems: 'center', padding: 13 }}><Text style={{ color: C.gray400 }}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
