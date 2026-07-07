import { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, getMembers, getChits } from '../services/api';
import { C, T, fmtDate } from './ui';

// ── Relative time ──────────────────────────────────────────────────────────────
function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return fmtDate(dateStr);
}

// ── Type → icon/colour mapping ─────────────────────────────────────────────────
type IconDef = { emoji: string; color: string; bg: string };

function iconFor(type?: string): IconDef {
  const t = (type ?? '').toUpperCase();
  if (t.includes('CANCEL'))    return { emoji: '✕',  color: C.red,    bg: '#FEE2E2' };
  if (t.includes('COLLECT') || t.includes('PAYMENT'))
                               return { emoji: '💰', color: C.green,  bg: '#DCFCE7' };
  if (t.includes('PICKUP') || t.includes('PICKED'))
                               return { emoji: '✓',  color: C.green,  bg: '#DCFCE7' };
  if (t.includes('ASSIGN'))    return { emoji: '📦', color: C.amber,  bg: '#FEF3C7' };
  if (t.includes('CASH') || t.includes('REQUEST'))
                               return { emoji: '💵', color: C.navy,   bg: C.navy50  };
  if (t.includes('DRAW'))      return { emoji: '🎯', color: '#7C3AED', bg: '#F5F3FF' };
  if (t.includes('PAYOUT'))    return { emoji: '🏆', color: C.amber,  bg: '#FEF3C7' };
  if (t.includes('MEMBER'))    return { emoji: '👤', color: C.navy,   bg: C.navy50  };
  if (t.includes('SETTLE'))    return { emoji: '✓',  color: C.green,  bg: '#DCFCE7' };
  return                              { emoji: '🔔', color: C.navy,   bg: C.navy50  };
}

// ── Single notification card ───────────────────────────────────────────────────
function NotifCard({
  n, onRead, onDismiss, memberMap, chitMap,
}: {
  n: any;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  memberMap: Record<string, string>;
  chitMap: Record<string, string>;
}) {
  const isUnread = !n.read;
  const { emoji, bg } = iconFor(n.type);
  const time = timeAgo(n.createdAt ?? n.timestamp);
  const meta = n.metadata ?? {};

  // Resolve names from the maps (backend stores IDs, frontend resolves)
  const memberId = meta.memberId ?? meta.member_id;
  const chitId   = meta.chitId ?? meta.chit_id;
  const workerId = meta.workerId ?? meta.worker_id;

  const mName = meta.memberName ?? meta.member_name ?? (memberId ? memberMap[memberId?.toLowerCase()] : null);
  const cName = meta.chitName   ?? meta.chit_name   ?? (chitId   ? chitMap[chitId?.toLowerCase()]     : null);
  // Worker name: stored directly, or look up in memberMap if worker is also a member, else show ID truncated
  const wName = meta.workerName ?? meta.worker_name ??
                (workerId ? (memberMap[workerId?.toLowerCase()] ?? null) : null);
  const amt   = meta.amount ?? meta.requestedAmount ?? n.amount;

  // Build detail chips
  const chips: { label: string; color: string; bg: string }[] = [];
  if (mName) chips.push({ label: mName,                                       color: C.gray700, bg: C.gray100 });
  if (amt)   chips.push({ label: `₹${Number(amt).toLocaleString('en-IN')}`, color: '#166534', bg: '#DCFCE7' });
  if (cName) chips.push({ label: cName,                                       color: C.navy,    bg: C.navy50  });
  if (wName) chips.push({ label: `👷 ${wName}`,                              color: '#92400E', bg: '#FEF3C7' });

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => { if (isUnread) onRead(n.id); }}
      style={{
        marginBottom: 8, borderRadius: 14, padding: 14,
        flexDirection: 'row', gap: 12,
        backgroundColor: isUnread ? '#EFF6FF' : C.white,
        borderWidth: 1.5,
        borderColor: isUnread ? '#BFDBFE' : C.gray200,
      }}
    >
      {/* Icon circle */}
      <View style={{
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <Text style={{ fontSize: isUnread ? 20 : 18 }}>{emoji}</Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        {/* Title row + dismiss */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
          <Text
            style={{ fontSize: 14, fontWeight: isUnread ? '700' : '500', color: C.gray900, flex: 1, marginRight: 6, lineHeight: 20 }}
            numberOfLines={3}
          >
            {n.title ?? n.message}
          </Text>
          <TouchableOpacity
            onPress={() => onDismiss(n.id)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{ paddingTop: 1 }}
          >
            <Text style={{ fontSize: 20, color: C.gray300, lineHeight: 20, fontWeight: '300' }}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Separate message body if title and message differ */}
        {n.title && n.message && n.title !== n.message && (
          <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 8, lineHeight: 18 }}>
            {n.message}
          </Text>
        )}

        {/* Detail chips */}
        {chips.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6, marginBottom: 6 }}>
            {chips.map((chip, i) => (
              <View key={i} style={{
                backgroundColor: chip.bg, borderRadius: 6,
                paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: chip.color }}>{chip.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Time + unread dot */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
          {isUnread && (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />
          )}
          <Text style={{
            fontSize: 11, fontWeight: isUnread ? '600' : '400',
            color: isUnread ? '#3B82F6' : C.gray400,
          }}>
            {time}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: notifs = [], refetch } = useQuery({
    queryKey: ['m-notifs'],
    queryFn: getMyNotifications,
    enabled: visible,
    refetchInterval: visible ? 30_000 : false,
  });

  // Name resolution — use existing cached queries so no extra network calls
  const { data: members = [] } = useQuery({
    queryKey: ['m-members'],
    queryFn: getMembers,
    staleTime: 120_000,
    enabled: visible,
  });
  const { data: chits = [] } = useQuery({
    queryKey: ['m-chits'],
    queryFn: getChits,
    staleTime: 120_000,
    enabled: visible,
  });
  const memberMap = Object.fromEntries((members as any[]).map((m: any) => [m.id?.toLowerCase(), m.fullName ?? m.name]));
  const chitMap   = Object.fromEntries((chits   as any[]).map((c: any) => [c.id?.toLowerCase(), c.name]));

  const readMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    // Optimistic — flip read flag in cache immediately
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['m-notifs'] });
      const prev = qc.getQueryData<any[]>(['m-notifs']);
      qc.setQueryData<any[]>(['m-notifs'],
        (old = []) => old.map(n => n.id === id ? { ...n, read: true } : n)
      );
      return { prev };
    },
    onError: (_, __, ctx) => qc.setQueryData(['m-notifs'], ctx?.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['m-notifs'] });
      qc.invalidateQueries({ queryKey: ['m-unread'] });
    },
  });

  const readAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-notifs'] });
      qc.invalidateQueries({ queryKey: ['m-unread'] });
    },
  });

  function handleRead(id: string) {
    readMut.mutate(id);
  }

  function handleDismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    readMut.mutate(id);
  }

  function handleClearAll() {
    const unreadIds = (notifs as any[]).filter((n: any) => !n.read).map((n: any) => n.id);
    setDismissed(prev => new Set([...prev, ...unreadIds]));
    readAllMut.mutate();
  }

  // Reset dismissed set when modal reopens
  const prevVisible = dismissed.size > 0 && !visible;
  if (prevVisible) setDismissed(new Set());

  const all = (notifs as any[]).filter((n: any) => !dismissed.has(n.id));
  const unreadCount = all.filter((n: any) => !n.read).length;
  const displayed = filter === 'unread' ? all.filter((n: any) => !n.read) : all;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200,
        }}>
          <View>
            <Text style={T.h2}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600', marginTop: 2 }}>
                {unreadCount} unread
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleClearAll}
                style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.navy50, borderRadius: 9 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Clear all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Filter pills ── */}
        <View style={{
          flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
          borderBottomWidth: 1, borderBottomColor: C.gray100,
        }}>
          {([
            { key: 'all',    label: `All (${all.length})` },
            { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key)}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10,
                backgroundColor: filter === key ? C.navy : C.gray100,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: filter === key ? C.white : C.gray500 }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => refetch()}
            style={{ marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.gray100, borderRadius: 10 }}
          >
            <Text style={{ fontSize: 13, color: C.gray500 }}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* ── List ── */}
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {displayed.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 52 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🔔</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900 }}>
                {filter === 'unread' ? 'All caught up!' : 'No notifications'}
              </Text>
              <Text style={{ fontSize: 13, color: C.gray500, marginTop: 4 }}>
                {filter === 'unread'
                  ? 'No unread notifications right now'
                  : 'Activity alerts will appear here'}
              </Text>
            </View>
          ) : (
            displayed.map((n: any) => (
              <NotifCard key={n.id} n={n} onRead={handleRead} onDismiss={handleDismiss}
                memberMap={memberMap} chitMap={chitMap} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
