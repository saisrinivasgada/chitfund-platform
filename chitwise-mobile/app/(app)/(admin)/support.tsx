import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import {
  listMyTickets, createSupportTicket, getTicketMessages,
  sendTicketMessage, markTicketRead,
} from '../../../services/api';

// ── Types ───────────────────────────────────────────────────────────────────
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
type TicketType =
  | 'BILLING' | 'CHIT' | 'DRAW' | 'PAYMENT' | 'PAYOUT'
  | 'MEMBER_MGMT' | 'ACCOUNT' | 'TECHNICAL' | 'FEATURE_REQUEST' | 'GENERAL';

const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: '#3B82F6',
  IN_PROGRESS: '#F59E0B',
  ON_HOLD: '#6B7280',
  RESOLVED: '#16A34A',
  CLOSED: '#9CA3AF',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const TICKET_TYPES: { value: TicketType; label: string }[] = [
  { value: 'BILLING',         label: 'Billing' },
  { value: 'CHIT',            label: 'Chit Group' },
  { value: 'DRAW',            label: 'Draw / Auction' },
  { value: 'PAYMENT',         label: 'Payment' },
  { value: 'PAYOUT',          label: 'Payout' },
  { value: 'MEMBER_MGMT',     label: 'Member Management' },
  { value: 'ACCOUNT',         label: 'Account' },
  { value: 'TECHNICAL',       label: 'Technical Issue' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'GENERAL',         label: 'General' },
];

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TicketStatus }) {
  const color = STATUS_COLOR[status] ?? '#6B7280';
  return (
    <View style={{ backgroundColor: color + '18', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

// ── New Ticket Modal ─────────────────────────────────────────────────────────
function NewTicketModal({ visible, onClose, onCreate }: {
  visible: boolean; onClose: () => void;
  onCreate: (ticket: any) => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<TicketType>('GENERAL');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const mut = useMutation({
    mutationFn: () => createSupportTicket({ type, subject: subject.trim(), description: description.trim() }),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      setType('GENERAL'); setSubject(''); setDescription('');
      onClose();
      onCreate(ticket);
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to create ticket'),
  });

  const typeLabel = TICKET_TYPES.find(t => t.value === type)?.label ?? type;
  const canSubmit = subject.trim().length > 2 && description.trim().length > 5;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>New Support Ticket</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400, lineHeight: 32 }}>×</Text></TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">

            {/* Type picker */}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Category</Text>
            <TouchableOpacity
              onPress={() => setShowTypePicker(true)}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: 14, color: C.gray900 }}>{typeLabel}</Text>
              <Text style={{ fontSize: 16, color: C.gray400 }}>▾</Text>
            </TouchableOpacity>

            {/* Subject */}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Brief summary of the issue"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 14 }}
            />

            {/* Description */}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your issue in detail…"
              placeholderTextColor={C.gray400}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 120, marginBottom: 20 }}
            />

            <TouchableOpacity
              onPress={() => mut.mutate()}
              disabled={!canSubmit || mut.isPending}
              style={{ backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center', opacity: (!canSubmit || mut.isPending) ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {mut.isPending ? 'Submitting…' : 'Submit Ticket'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Type picker modal */}
        <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={() => setShowTypePicker(false)} />
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
            <View style={{ alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>Select Category</Text>
            </View>
            {TICKET_TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                onPress={() => { setType(t.value); setShowTypePicker(false); }}
                style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ fontSize: 14, fontWeight: type === t.value ? '700' : '400', color: type === t.value ? C.navy : C.gray900 }}>{t.label}</Text>
                {type === t.value && <Text style={{ fontSize: 16, color: C.navy }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

// ── Ticket Chat View ─────────────────────────────────────────────────────────
function TicketChat({ ticket, onBack }: { ticket: any; onBack: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const flatRef = useRef<FlatList>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['ticket-messages', ticket.id],
    queryFn: () => getTicketMessages(ticket.id),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    markTicketRead(ticket.id).catch(() => {});
  }, [ticket.id]);

  const sendMut = useMutation({
    mutationFn: () => sendTicketMessage(ticket.id, text.trim()),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['ticket-messages', ticket.id] });
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to send'),
  });

  const msgs: any[] = Array.isArray(messages)
    ? messages
    : (messages as any)?.content ?? [];

  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, padding: 14 }}>
        <TouchableOpacity onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 18, color: C.gray500 }}>‹</Text>
          <Text style={{ fontSize: 13, color: C.gray500 }}>All Tickets</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }} numberOfLines={1}>{ticket.subject}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <StatusBadge status={ticket.status} />
          <Text style={{ fontSize: 11, color: C.gray400 }}>#{ticket.ticketNumber}</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>·</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>{TICKET_TYPES.find(t => t.value === ticket.type)?.label ?? ticket.type}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 16, gap: 8 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🎧</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray700 }}>No messages yet</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4, textAlign: 'center' }}>
                Our support team will respond here.
              </Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const fromAgent = msg.senderRole === 'SUPER_ADMIN';
            return (
              <View style={{ alignItems: fromAgent ? 'flex-start' : 'flex-end' }}>
                {fromAgent && (
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, marginLeft: 4 }}>ChitWise Support</Text>
                )}
                <View style={{
                  maxWidth: '80%',
                  backgroundColor: fromAgent ? C.white : C.navy,
                  borderRadius: 14,
                  borderBottomLeftRadius: fromAgent ? 4 : 14,
                  borderBottomRightRadius: fromAgent ? 14 : 4,
                  padding: 12,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
                }}>
                  <Text style={{ fontSize: 14, color: fromAgent ? C.gray900 : '#fff', lineHeight: 20 }}>{msg.content}</Text>
                  <Text style={{ fontSize: 10, color: fromAgent ? C.gray400 : 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'right' }}>
                    {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Input */}
      {!isClosed && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message…"
              placeholderTextColor={C.gray400}
              multiline
              style={{ flex: 1, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: C.gray900, maxHeight: 100 }}
            />
            <TouchableOpacity
              onPress={() => sendMut.mutate()}
              disabled={!text.trim() || sendMut.isPending}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? C.navy : C.gray200, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, color: '#fff' }}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
      {isClosed && (
        <View style={{ padding: 12, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: C.gray200, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>This ticket is {ticket.status.toLowerCase()}. No further replies.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function SupportScreen() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [activeTicket, setActiveTicket] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => listMyTickets({ page: 0, size: 50 }),
    staleTime: 60_000,
  });

  const tickets: any[] = Array.isArray(data) ? data : (data as any)?.content ?? [];

  if (activeTicket) {
    return (
      <TicketChat
        ticket={activeTicket}
        onBack={() => setActiveTicket(null)}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Support</Text>
            <Text style={{ fontSize: 11, color: C.gray400 }}>ChitWise Help Desk</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowNew(true)}
          style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ New Ticket</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🎧</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 6 }}>No tickets yet</Text>
          <Text style={{ fontSize: 13, color: C.gray500, textAlign: 'center', marginBottom: 24 }}>
            Have a question or issue? Raise a support ticket and we'll get back to you.
          </Text>
          <TouchableOpacity
            onPress={() => setShowNew(true)}
            style={{ backgroundColor: C.navy, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Raise a Ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            {tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                onPress={() => setActiveTicket(ticket)}
                activeOpacity={0.75}
                style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: C.gray100 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.gray900, marginRight: 8 }} numberOfLines={1}>{ticket.subject}</Text>
                  <StatusBadge status={ticket.status} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>#{ticket.ticketNumber}</Text>
                  <Text style={{ fontSize: 11, color: C.gray300 }}>·</Text>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>
                    {TICKET_TYPES.find(t => t.value === ticket.type)?.label ?? ticket.type}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.gray300 }}>·</Text>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>
                    {new Date(ticket.updatedAt ?? ticket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                {ticket.lastMessagePreview && (
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 6 }} numberOfLines={1}>
                    {ticket.lastMessagePreview}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      <NewTicketModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreate={(ticket) => setActiveTicket(ticket)}
      />
    </SafeAreaView>
  );
}
