import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminSearchContactRequests,
  superAdminGetContactRequest,
  superAdminListContactMessages,
  superAdminSendContactMessage,
  superAdminUpdateContactStatus,
} from '../../../services/api';
import { C, T } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const TYPE_META: Record<string, { label: string; bg: string; text: string }> = {
  PROSPECT:    { label: 'Prospect',    bg: '#EFF4FA', text: '#1E3A5F' },
  ORG_SUPPORT: { label: 'Org Support', bg: '#FEF3C7', text: '#92400E' },
};

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  NEW:      { label: 'New',      bg: '#FEE2E2', text: '#991B1B' },
  OPEN:     { label: 'Open',     bg: '#DBEAFE', text: '#1E40AF' },
  ON_HOLD:  { label: 'On Hold',  bg: '#FEF9C3', text: '#854D0E' },
  RESOLVED: { label: 'Resolved', bg: '#D1FAE5', text: '#065F46' },
  CLOSED:   { label: 'Closed',   bg: C.gray100,  text: C.gray500 },
};

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? TYPE_META.PROSPECT;
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: m.text }}>{m.label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.NEW;
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: m.text }}>{m.label}</Text>
    </View>
  );
}

function fmtDateTime(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Thread view ───────────────────────────────────────────────────────────────
function ThreadView({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const flatRef = useRef<FlatList>(null);

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ['sa-contact-item', itemId],
    queryFn: () => superAdminGetContactRequest(itemId),
    staleTime: 15_000,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['sa-contact-msgs', itemId],
    queryFn: () => superAdminListContactMessages(itemId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const sendMut = useMutation({
    mutationFn: (content: string) => superAdminSendContactMessage(itemId, content),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['sa-contact-msgs', itemId] });
    },
    onError: () => toast.cancelled('Failed to send'),
  });

  const statusMut = useMutation({
    mutationFn: ({ status, holdUntil }: { status: string; holdUntil?: string }) =>
      superAdminUpdateContactStatus(itemId, status, holdUntil),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-contact-item', itemId] });
      qc.invalidateQueries({ queryKey: ['sa-contacts'] });
      toast.saved('Status updated');
    },
    onError: () => toast.cancelled('Failed to update status'),
  });

  if (itemLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.navy} />
      </SafeAreaView>
    );
  }

  const s = item?.status ?? 'NEW';

  const statusActions: { label: string; status: string; bg: string; text: string }[] = [
    ...(s !== 'OPEN' ? [{ label: 'Open', status: 'OPEN', bg: '#DBEAFE', text: '#1E40AF' }] : []),
    ...(s !== 'ON_HOLD' && (s === 'NEW' || s === 'OPEN') ? [{ label: 'On Hold', status: 'ON_HOLD', bg: '#FEF9C3', text: '#854D0E' }] : []),
    ...(s !== 'RESOLVED' && s !== 'CLOSED' ? [{ label: 'Resolved', status: 'RESOLVED', bg: '#D1FAE5', text: '#065F46' }] : []),
    ...(s !== 'CLOSED' ? [{ label: 'Close', status: 'CLOSED', bg: C.gray100, text: C.gray600 }] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack} style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{item?.name ?? '—'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
            <TypeBadge type={item?.type ?? 'PROSPECT'} />
            <StatusBadge status={s} />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          {/* Info card */}
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.gray100 }}>
            {item?.subject && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray400, letterSpacing: 0.8 }}>SUBJECT</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900, marginTop: 2 }}>{item.subject}</Text>
              </View>
            )}
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray400, letterSpacing: 0.8 }}>MESSAGE</Text>
              <Text style={{ fontSize: 13, color: C.gray700, marginTop: 2, lineHeight: 20 }}>{item?.message ?? '—'}</Text>
            </View>
            {[
              item?.email && { label: 'Email', value: item.email },
              item?.phone && { label: 'Phone', value: item.phone },
              item?.tenantName && { label: 'Org', value: item.tenantName },
              item?.createdAt && { label: 'Received', value: fmtDateTime(item.createdAt) },
            ].filter(Boolean).map((f: any) => (
              <View key={f.label} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: C.gray400, width: 60 }}>{f.label}:</Text>
                <Text style={{ fontSize: 12, color: C.gray700, flex: 1 }}>{f.value}</Text>
              </View>
            ))}
          </View>

          {/* Status actions */}
          {statusActions.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 8 }}>CHANGE STATUS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {statusActions.map((a) => (
                  <TouchableOpacity
                    key={a.status}
                    onPress={() => statusMut.mutate({ status: a.status })}
                    disabled={statusMut.isPending}
                    style={{ backgroundColor: a.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: a.text }}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Thread */}
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray100 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray600, marginBottom: 10 }}>Conversation</Text>
            {msgsLoading ? (
              <ActivityIndicator color={C.navy} style={{ marginVertical: 20 }} />
            ) : (messages as any[]).length === 0 ? (
              <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', paddingVertical: 16 }}>No replies yet</Text>
            ) : (
              (messages as any[]).map((m: any, i: number) => (
                <View key={m.id ?? i} style={{ alignItems: 'flex-end', marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>{m.senderName ?? 'ChitWise'}</Text>
                  <View style={{ backgroundColor: C.navy, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '85%' }}>
                    <Text style={{ fontSize: 14, color: C.white }}>{m.content}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>{fmtDateTime(m.createdAt)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Send bar */}
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a reply…"
            placeholderTextColor={C.gray400}
            multiline
            style={{ flex: 1, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.gray900, maxHeight: 100 }}
          />
          <TouchableOpacity
            onPress={() => { if (draft.trim()) sendMut.mutate(draft.trim()); }}
            disabled={!draft.trim() || sendMut.isPending}
            style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: draft.trim() ? C.navy : C.gray200, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }}
          >
            {sendMut.isPending ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={{ fontSize: 18, color: C.white }}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
export default function HelpdeskScreen() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const size = 20;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sa-contacts', typeFilter, statusFilter, page],
    queryFn: () => superAdminSearchContactRequests({ type: typeFilter || undefined, status: statusFilter || undefined, page, size }),
    staleTime: 30_000,
  });

  const items: any[] = (data as any)?.content ?? [];
  const totalPages: number = (data as any)?.totalPages ?? 0;
  const totalElements: number = (data as any)?.totalElements ?? 0;

  if (selectedId) {
    return <ThreadView itemId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={T.h2}>Helpdesk</Text>
          <Text style={{ fontSize: 12, color: C.gray400 }}>{totalElements} requests</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={{ backgroundColor: C.white, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginTop: 10, marginBottom: 6 }}>TYPE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {[{ label: 'All', val: '' }, { label: 'Prospect', val: 'PROSPECT' }, { label: 'Org Support', val: 'ORG_SUPPORT' }].map((f) => (
            <TouchableOpacity
              key={f.val}
              onPress={() => { setTypeFilter(f.val); setPage(0); }}
              style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: typeFilter === f.val ? C.navy : C.white, borderWidth: 1.5, borderColor: typeFilter === f.val ? C.navy : C.gray200 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: typeFilter === f.val ? C.white : C.gray600 }}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 6 }}>STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { label: 'All', val: '' },
            { label: 'New', val: 'NEW' },
            { label: 'Open', val: 'OPEN' },
            { label: 'On Hold', val: 'ON_HOLD' },
            { label: 'Resolved', val: 'RESOLVED' },
            { label: 'Closed', val: 'CLOSED' },
          ].map((f) => (
            <TouchableOpacity
              key={f.val}
              onPress={() => { setStatusFilter(f.val); setPage(0); }}
              style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: statusFilter === f.val ? C.navy : C.white, borderWidth: 1.5, borderColor: statusFilter === f.val ? C.navy : C.gray200 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: statusFilter === f.val ? C.white : C.gray600 }}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={C.navy} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🎧</Text>
            <Text style={{ fontSize: 15, color: C.gray500 }}>No requests found</Text>
          </View>
        ) : (
          items.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setSelectedId(item.id)}
              activeOpacity={0.8}
              style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.gray100, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: C.white }}>
                    {(item.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{item.name ?? '—'}</Text>
                    <TypeBadge type={item.type} />
                    <StatusBadge status={item.status} />
                  </View>
                  {item.subject && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 2 }} numberOfLines={1}>{item.subject}</Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                    {item.email && <Text style={{ fontSize: 11, color: C.gray400 }}>{item.email}</Text>}
                    {item.tenantName && <Text style={{ fontSize: 11, color: C.gray400 }}>🏢 {item.tenantName}</Text>}
                    <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDateTime(item.createdAt)}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 18, color: C.gray300, marginTop: 4 }}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white, opacity: page === 0 ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>← Prev</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: C.gray400 }}>Page {page + 1} of {totalPages}</Text>
            <TouchableOpacity
              onPress={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white, opacity: page + 1 >= totalPages ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
