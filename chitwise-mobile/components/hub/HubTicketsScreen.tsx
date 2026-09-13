import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hubGetTicket, hubGetTicketMessages, hubListTickets, hubMarkTicketRead, hubSendTicketMessage, hubUpdateTicketStatus } from '../../services/api';
import { C, T } from '../ui';

const TYPES = ['INQUIRY', 'BILLING', 'CHIT', 'DRAW', 'PAYMENT', 'PAYOUT', 'MEMBER_MGMT', 'ACCOUNT', 'TECHNICAL', 'FEATURE_REQUEST', 'GENERAL'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};
const label = (value?: string) => value?.replaceAll('_', ' ') ?? '—';
const date = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function Chip({ text, selected, onPress }: { text: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={{ marginRight: 7, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, backgroundColor: selected ? C.navy : C.white, borderWidth: 1, borderColor: selected ? C.navy : C.gray200 }}>
    <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? C.white : C.gray600 }}>{text}</Text>
  </TouchableOpacity>;
}

function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const ticketQuery = useQuery({ queryKey: ['hub-ticket', id], queryFn: () => hubGetTicket(id) });
  const messagesQuery = useQuery({ queryKey: ['hub-ticket-messages', id], queryFn: () => hubGetTicketMessages(id), refetchInterval: 30000 });
  useEffect(() => { hubMarkTicketRead(id).catch(() => {}); }, [id]);
  const send = useMutation({ mutationFn: () => hubSendTicketMessage(id, draft.trim()), onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['hub-ticket-messages', id] }); } });
  const status = useMutation({ mutationFn: (next: string) => hubUpdateTicketStatus(id, next), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hub-ticket', id] }); qc.invalidateQueries({ queryKey: ['hub-tickets-mobile'] }); } });
  const ticket: any = ticketQuery.data;
  const messages: any[] = (messagesQuery.data as any)?.items ?? [];

  if (ticketQuery.isLoading) return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.navy} /></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 8 }}><Text style={{ fontSize: 22, color: C.navy }}>‹</Text></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: C.gray400 }}>{ticket?.ticketNumber}</Text><Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{ticket?.subject}</Text></View>
      {(ticket?.priority === 'HIGH' || ticket?.priority === 'URGENT') && <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', padding: 7, borderRadius: 8 }}>⚑ PRIORITY</Text>}
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <View style={{ backgroundColor: C.white, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.gray100, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>{label(ticket?.type)} · {label(ticket?.status)}</Text>
          <Text style={{ fontSize: 13, color: C.gray700, lineHeight: 20, marginTop: 8 }}>{ticket?.description}</Text>
          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 10 }}>{ticket?.createdByName} · {ticket?.tenantName ?? (ticket?.source === 'PUBLIC' ? 'Public inquiry' : ticket?.tenantId)} · {date(ticket?.createdAt)}</Text>
          {ticket?.source === 'PUBLIC' && <Text style={{ fontSize: 11, color: C.gray500, marginTop: 5 }}>{ticket.requesterEmail}{ticket.requesterPhone ? ` · ${ticket.requesterPhone}` : ''}{ticket.preferredContact ? ` · ${ticket.preferredContact}` : ''}</Text>}
        </View>
        <Text style={{ fontSize: 10, fontWeight: '800', color: C.gray400, marginBottom: 7 }}>CHANGE STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {(VALID_TRANSITIONS[ticket?.status] ?? []).map(s => <Chip key={s} text={label(s)} selected={false} onPress={() => status.mutate(s)} />)}
        </ScrollView>
        <Text style={{ fontSize: 10, fontWeight: '800', color: C.gray400, marginBottom: 7 }}>CONVERSATION</Text>
        {messagesQuery.isLoading ? <ActivityIndicator color={C.navy} /> : messages.length === 0 ? <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No replies yet</Text> : messages.slice().reverse().map((message: any) => {
          const hub = message.senderType === 'SUPER_ADMIN' || message.senderType === 'SUPPORT_AGENT';
          return <View key={message.id} style={{ alignItems: hub ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>{message.senderName}</Text>
            <View style={{ maxWidth: '84%', backgroundColor: hub ? C.navy : C.white, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8, borderWidth: hub ? 0 : 1, borderColor: C.gray200 }}><Text style={{ color: hub ? C.white : C.gray900, fontSize: 13 }}>{message.content}</Text></View>
          </View>;
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: C.white, padding: 12, borderTopWidth: 1, borderTopColor: C.gray100 }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Write a reply…" multiline style={{ flex: 1, maxHeight: 90, borderWidth: 1, borderColor: C.gray200, borderRadius: 12, padding: 10 }} />
        <TouchableOpacity disabled={!draft.trim() || send.isPending} onPress={() => send.mutate()} style={{ width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: draft.trim() ? C.navy : C.gray200 }}><Text style={{ color: C.white, fontSize: 18 }}>↑</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function HubTicketsScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: ['hub-tickets-mobile', type, status, priority, fromDate, toDate, q, page], queryFn: () => hubListTickets({ type, status, priority, fromDate, toDate, q, page, size: 20 }), staleTime: 30000 });
  if (selected) return <TicketDetail id={selected} onBack={() => setSelected(null)} />;
  const data: any = query.data;
  const items: any[] = data?.items ?? [];
  const resetPage = (setter: (v: string) => void, value: string) => { setter(value); setPage(0); };

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <Text style={T.h2}>Tickets</Text><Text style={{ fontSize: 12, color: C.gray400 }}>{data?.totalElements ?? 0} organization requests and inquiries</Text>
      <TextInput value={q} onChangeText={v => resetPage(setQ, v)} placeholder="Search tickets" style={{ marginTop: 12, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 9 }}><Chip text="All types" selected={!type} onPress={() => resetPage(setType, '')} />{TYPES.map(v => <Chip key={v} text={label(v)} selected={type === v} onPress={() => resetPage(setType, v)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 7 }}><Chip text="All statuses" selected={!status} onPress={() => resetPage(setStatus, '')} />{STATUSES.map(v => <Chip key={v} text={label(v)} selected={status === v} onPress={() => resetPage(setStatus, v)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 7 }}><Chip text="All priority" selected={!priority} onPress={() => resetPage(setPriority, '')} /><Chip text="⚑ Priority" selected={priority === 'HIGH'} onPress={() => resetPage(setPriority, 'HIGH')} /><Chip text="Normal" selected={priority === 'NORMAL'} onPress={() => resetPage(setPriority, 'NORMAL')} /></ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}><TextInput value={fromDate} onChangeText={v => resetPage(setFromDate, v)} placeholder="From YYYY-MM-DD" style={{ flex: 1, borderWidth: 1, borderColor: C.gray200, borderRadius: 9, padding: 8, fontSize: 12 }} /><TextInput value={toDate} onChangeText={v => resetPage(setToDate, v)} placeholder="To YYYY-MM-DD" style={{ flex: 1, borderWidth: 1, borderColor: C.gray200, borderRadius: 9, padding: 8, fontSize: 12 }} /></View>
    </View>
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {query.isLoading ? <ActivityIndicator color={C.navy} style={{ marginTop: 40 }} /> : items.length === 0 ? <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 40 }}>No tickets found</Text> : items.map(item => {
        const high = item.priority === 'HIGH' || item.priority === 'URGENT';
        return <TouchableOpacity key={item.id} onPress={() => setSelected(item.id)} style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 9, borderWidth: high ? 2 : 1, borderColor: high ? '#F59E0B' : C.gray100 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500 }}>{item.ticketNumber}</Text><Text style={{ fontSize: 10, fontWeight: '800', color: C.navy, backgroundColor: C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>{label(item.type)}</Text>{high && <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E' }}>⚑ PRIORITY</Text>}</View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900, marginTop: 6 }} numberOfLines={1}>{item.subject}</Text>
          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{label(item.status)} · {item.tenantName ?? (item.source === 'PUBLIC' ? 'Public inquiry' : item.tenantId)} · {date(item.createdAt)}</Text>
        </TouchableOpacity>;
      })}
      {(page > 0 || data?.hasNext) && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><TouchableOpacity disabled={page === 0} onPress={() => setPage(p => p - 1)}><Text style={{ color: page === 0 ? C.gray300 : C.navy }}>← Previous</Text></TouchableOpacity><Text style={{ color: C.gray400 }}>Page {page + 1}</Text><TouchableOpacity disabled={!data?.hasNext} onPress={() => setPage(p => p + 1)}><Text style={{ color: data?.hasNext ? C.navy : C.gray300 }}>Next →</Text></TouchableOpacity></View>}
    </ScrollView>
  </SafeAreaView>;
}
