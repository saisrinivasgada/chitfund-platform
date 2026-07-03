import { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  getAuditLogs, getAllPaymentBatches, getActiveCashRequests,
  getAllPayouts, getMembers, getChits, getRecentDraws,
} from '../../../services/api';
import { C, T, Card, EmptyState, fmtDateTime, fmtDate } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';


const PAGE_SIZE = 20;

const TYPE_FILTERS = [
  { key: 'ALL',           label: 'All' },
  { key: 'PAYMENT_BATCH', label: 'Payments' },
  { key: 'CASH_REQUEST',  label: 'Pickups' },
  { key: 'PAYOUT',        label: 'Payouts' },
  { key: 'DRAW',          label: 'Draws' },
  { key: 'CHIT',          label: 'Chits' },
  { key: 'SETTLEMENT',    label: 'Settlements' },
  { key: 'MEMBER',        label: 'Members' },
];

const HIDDEN_ENTITY_TYPES = new Set(['WALLET_TRANSACTION']);

const DATE_PRESETS = [
  { key: 'all',    label: 'All Time' },
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: '7 Days' },
  { key: 'month',  label: '30 Days' },
  { key: 'custom', label: 'Custom' },
];

const ACTION_TITLE: Record<string, { title: string; color: string; subtitle?: string }> = {
  'PAYMENT_BATCH.CREATED':              { title: 'Payment Collected',              color: '#16A34A' },
  'PAYMENT_BATCH.AWAITING_REMITTANCE':  { title: 'Cash with Worker',               color: C.amber,   subtitle: 'Picked up — worker has not remitted yet' },
  'PAYMENT_BATCH.REMITTED':             { title: 'Remittance Complete',            color: '#16A34A', subtitle: 'Worker returned cash to admin' },
  'PAYMENT_BATCH.VOIDED':               { title: 'Payment Voided',                 color: C.red },
  'CASH_REQUEST.CREATED':               { title: 'Cash Pickup Created',            color: C.amber },
  'CASH_REQUEST.ASSIGNED':              { title: 'Worker Assigned',                color: '#7C3AED' },
  'CASH_REQUEST.PICKED_UP':             { title: 'Cash Picked Up by Worker',       color: C.amber,   subtitle: 'Worker has cash — pending remittance to admin' },
  'CASH_REQUEST.COLLECTED':             { title: 'Cash Collected',                 color: '#16A34A' },
  'CASH_REQUEST.VOIDED':                { title: 'Pickup Voided',                  color: C.red },
  'CASH_REQUEST.CANCELLED':             { title: 'Pickup Cancelled',               color: C.red },
  'CASH_REQUEST.EDITED':                { title: 'Pickup Edited',                  color: C.navy },
  'PAYOUT.CREATED':                { title: 'Payout Created',       color: '#7C3AED' },
  'PAYOUT.DISBURSED':              { title: 'Payout Disbursed',     color: '#16A34A' },
  'PAYOUT.CANCELLED':              { title: 'Payout Cancelled',     color: C.red },
  'PAYOUT.VOIDED':                 { title: 'Payout Voided',        color: C.red },
  'DRAW.OPENED':                   { title: 'Draw Opened',          color: C.navy },
  'DRAW.CLOSED':                   { title: 'Draw Closed',          color: '#16A34A' },
  'DRAW.SKIPPED':                  { title: 'Draw Skipped',         color: C.gray500 },
  'DRAW.DELETED':                  { title: 'Draw Deleted',         color: C.red },
  'CHIT.CREATED':                  { title: 'Chit Created',         color: C.navy },
  'CHIT.STATUS_CHANGED':           { title: 'Chit Status Changed',  color: C.amber },
  'SETTLEMENT.CONFIRMED':          { title: 'Settlement Confirmed', color: '#16A34A' },
  'MEMBER.CREATED':                { title: 'Member Added',         color: C.navy },
  'MEMBER.STATUS_CHANGED':         { title: 'Member Status Changed',color: C.amber },
  'MEMBER.PROFILE_UPDATED':        { title: 'Profile Updated',      color: C.navy },
};

function entityTypeLabel(t: string) {
  const m: Record<string, string> = {
    PAYMENT_BATCH: 'Payment', CASH_REQUEST: 'Pickup', PAYOUT: 'Payout',
    DRAW: 'Draw', CHIT: 'Chit', SETTLEMENT: 'Settlement', MEMBER: 'Member',
  };
  return m[t] ?? (t ?? '').replace(/_/g, ' ');
}

// ── Activity icon map ──────────────────────────────────────────────────────────
type ActivityIcon = { emoji: string; bg: string };

function activityIconFor(entityType?: string, action?: string): ActivityIcon {
  const et = (entityType ?? '').toUpperCase();
  const ac = (action ?? '').toUpperCase();
  if (et === 'PAYMENT_BATCH') {
    if (ac.includes('VOID'))                return { emoji: '💸', bg: '#FEE2E2' };
    if (ac.includes('AWAIT') || ac === 'AWAITING_REMITTANCE') return { emoji: '🧳', bg: '#FEF3C7' };
    if (ac.includes('REMIT'))               return { emoji: '✅', bg: '#DCFCE7' };
    return { emoji: '💰', bg: '#DCFCE7' };
  }
  if (et === 'CASH_REQUEST') {
    if (ac.includes('CANCEL') || ac.includes('VOID')) return { emoji: '❌', bg: '#FEE2E2' };
    if (ac.includes('COLLECT'))  return { emoji: '💰', bg: '#DCFCE7' };
    if (ac.includes('PICKED'))   return { emoji: '🧳', bg: '#FEF3C7' };
    if (ac.includes('ASSIGN'))   return { emoji: '📦', bg: '#F5F3FF' };
    if (ac.includes('EDIT'))     return { emoji: '✏️',  bg: C.navy50 };
    return { emoji: '💵', bg: '#FEF3C7' };
  }
  if (et === 'PAYOUT') {
    if (ac.includes('CANCEL') || ac.includes('VOID')) return { emoji: '🏆', bg: '#FEE2E2' };
    if (ac.includes('DISBURS')) return { emoji: '🏆', bg: '#DCFCE7' };
    return { emoji: '🏆', bg: '#F5F3FF' };
  }
  if (et === 'DRAW') {
    if (ac.includes('DELETE'))  return { emoji: '🎯', bg: '#FEE2E2' };
    if (ac.includes('CLOSE'))   return { emoji: '🎯', bg: '#DCFCE7' };
    if (ac.includes('SKIP'))    return { emoji: '🎯', bg: C.gray100 };
    return { emoji: '🎯', bg: C.navy50 };
  }
  if (et === 'CHIT') {
    if (ac.includes('STATUS'))  return { emoji: '📋', bg: '#FEF3C7' };
    return { emoji: '📋', bg: C.navy50 };
  }
  if (et === 'SETTLEMENT')      return { emoji: '✅', bg: '#DCFCE7' };
  if (et === 'MEMBER') {
    if (ac.includes('STATUS'))  return { emoji: '👤', bg: '#FEF3C7' };
    return { emoji: '👤', bg: C.navy50 };
  }
  return { emoji: '🔔', bg: C.gray100 };
}

// ── Payment mode icon + label ─────────────────────────────────────────────────
function paymentModeChip(mode?: string | null): { icon: string; label: string } | null {
  if (!mode) return null;
  const m = mode.toUpperCase().replace('_', ' ');
  if (mode === 'CASH')          return { icon: '💵', label: 'Cash' };
  if (mode === 'UPI')           return { icon: '📱', label: 'UPI' };
  if (mode === 'CHEQUE')        return { icon: '🧾', label: 'Cheque' };
  if (mode === 'BANK_TRANSFER') return { icon: '🏦', label: 'Bank' };
  if (mode === 'NEFT')          return { icon: '🏦', label: 'NEFT' };
  if (mode === 'RTGS')          return { icon: '🏦', label: 'RTGS' };
  if (mode === 'IMPS')          return { icon: '🏦', label: 'IMPS' };
  if (mode === 'ONLINE')        return { icon: '💻', label: 'Online' };
  return { icon: '💳', label: m };
}

// ── Smart time — relative for today, full datetime for older ──────────────────
function smartTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const isToday = date.toDateString() === new Date().toDateString();
  if (!isToday) return fmtDateTime(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function inDateRange(iso: string | undefined, preset: string, from: string, to: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now); start.setHours(0,0,0,0);
    const end   = new Date(now); end.setHours(23,59,59,999);
    return t >= start.getTime() && t <= end.getTime();
  }
  if (preset === 'week')  { const w = new Date(now); w.setDate(w.getDate()-7); return t >= w.getTime(); }
  if (preset === 'month') { const m = new Date(now); m.setDate(m.getDate()-30); return t >= m.getTime(); }
  if (preset === 'custom' && from) {
    const s = new Date(from + 'T00:00:00').getTime();
    const e = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
    return t >= s && t <= e;
  }
  return true;
}

// ── Normalise real-data entities to audit-like shape ─────────────────────────

function batchToItem(b: any) {
  const action =
    b.status === 'REMITTED'             ? 'REMITTED' :
    b.status === 'AWAITING_REMITTANCE'  ? 'AWAITING_REMITTANCE' :
    b.status === 'VOIDED'               ? 'VOIDED' : 'CREATED';
  return {
    id: 'batch-' + b.id, entityType: 'PAYMENT_BATCH', _source: 'live',
    action,
    memberId: b.memberId, chitId: b.chitId, reason: b.voidReason ?? b.notes,
    newValue: `₹${Number(b.amount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}`,
    paymentMode: b.paymentMode ?? null,
    actorRole: b.collectedBy ? 'WORKER' : 'ADMIN',
    createdAt: b.remittedAt ?? b.collectedAt ?? b.createdAt,
  };
}
function requestToItem(r: any) {
  const actionMap: Record<string,string> = {
    PENDING:'CREATED', ASSIGNED:'ASSIGNED', PICKED_UP:'PICKED_UP',
    COLLECTED:'COLLECTED', CANCELLED:'CANCELLED', VOIDED:'VOIDED',
  };
  return {
    id: 'req-' + r.id, entityType: 'CASH_REQUEST', _source: 'live',
    action: actionMap[r.status] ?? r.status,
    memberId: r.memberId, chitId: r.chitId,
    newValue: `₹${Number(r.requestedAmount ?? 0).toLocaleString('en-IN')}`,
    actorRole: 'ADMIN', createdAt: r.requestedAt ?? r.createdAt,
  };
}
function drawToItem(d: any) {
  const action = d.skippedAt ? 'SKIPPED' : d.closedAt ? 'CLOSED' : 'OPENED';
  return {
    id: 'draw-' + d.id, entityType: 'DRAW', entityId: d.id, _source: 'live',
    action,
    chitId: d.chitId,
    newValue: `Month ${d.monthNumber}`,
    actorRole: 'ADMIN',
    reason: d.skipReason ?? null,
    createdAt: d.skippedAt ?? d.openedAt ?? d.closedAt,
  };
}
function payoutToItem(p: any) {
  const actionMap: Record<string,string> = {
    PENDING:'CREATED', DISBURSED:'DISBURSED', CANCELLED:'CANCELLED', VOIDED:'VOIDED',
  };
  return {
    id: 'po-' + p.id, entityType: 'PAYOUT', _source: 'live',
    action: actionMap[p.status] ?? p.status,
    memberId: p.memberId, chitId: p.chitId,
    newValue: p.amount ? `₹${Number(p.amount).toLocaleString('en-IN')}` : undefined,
    actorRole: 'ADMIN', createdAt: p.disbursedAt ?? p.createdAt,
  };
}
// ── Smart deduplication ───────────────────────────────────────────────────────
// For CASH_REQUEST and PAYMENT_BATCH, show only the most advanced state per entity.
// e.g. if a cash request reached COLLECTED, suppress the earlier PICKED_UP card.
const DEDUP_ENTITY_TYPES = new Set(['CASH_REQUEST', 'PAYMENT_BATCH']);
const ACTION_PRIORITY: Record<string, number> = {
  CREATED: 1, ASSIGNED: 2, EDITED: 2,
  AWAITING_REMITTANCE: 3, PICKED_UP: 3,
  REMITTED: 10, COLLECTED: 10, VOIDED: 10, CANCELLED: 10,
};
// Actions that are never useful to surface
const HIDDEN_ACTIONS = new Set(['DRAW.CLOSED']);

function smartDedup(items: any[]): any[] {
  const best = new Map<string, any>();
  const keep: any[] = [];
  for (const item of items) {
    const key = `${item.entityType}.${item.action}`;
    if (HIDDEN_ACTIONS.has(key)) continue;
    if (!DEDUP_ENTITY_TYPES.has(item.entityType) || !item.entityId) {
      keep.push(item);
      continue;
    }
    const dedupKey = `${item.entityType}:${item.entityId}`;
    const existing = best.get(dedupKey);
    const itemPri = ACTION_PRIORITY[item.action] ?? 0;
    const existingPri = existing ? (ACTION_PRIORITY[existing.action] ?? -1) : -1;
    if (!existing || itemPri >= existingPri) best.set(dedupKey, item);
  }
  return [...keep, ...best.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const { markActivitySeen } = useUIStore();
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [showCount,  setShowCount]  = useState(PAGE_SIZE);

  useEffect(() => { markActivitySeen(); }, []);
  useEffect(() => { setShowCount(PAGE_SIZE); }, [typeFilter, datePreset, customFrom, customTo]);

  // Blinking LIVE dot
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Audit logs — silently returns [] on error (try/catch inside getAuditLogs)
  const { data: auditData = [], isLoading: auditLoading, refetch: ra } = useQuery({
    queryKey: ['act-audit', typeFilter],
    queryFn: () => getAuditLogs({
      page: 0, size: 500, sort: 'createdAt,desc',
      ...(typeFilter !== 'ALL' ? { entityType: typeFilter } : {}),
    }),
    staleTime: 30_000,
  });

  // Real data — always fetched, used as fallback/supplement. Silent try/catch so they never retry on failure.
  const { data: batches  = [], isLoading: l2, refetch: rb } = useQuery({ queryKey: ['act-batches'],  staleTime: 60_000, retry: 0, queryFn: async () => { try { return await getAllPaymentBatches({ size: 300 }); } catch { return []; } } });
  const { data: requests = [], isLoading: l3, refetch: rr } = useQuery({ queryKey: ['act-requests'], staleTime: 60_000, retry: 0, queryFn: async () => { try { return await getActiveCashRequests();          } catch { return []; } } });
  const { data: payouts  = [], isLoading: l4, refetch: rp } = useQuery({ queryKey: ['act-payouts'],  staleTime: 60_000, retry: 0, queryFn: async () => { try { return await getAllPayouts();                  } catch { return []; } } });
  const { data: draws    = [], isLoading: l5, refetch: rd } = useQuery({ queryKey: ['act-draws'],    staleTime: 60_000, retry: 0, queryFn: () => getRecentDraws(60) });

  // Name maps
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers, staleTime: 120_000 });
  const { data: chits   = [] } = useQuery({ queryKey: ['m-chits'],   queryFn: getChits,   staleTime: 120_000 });
  const memberMap = Object.fromEntries((members as any[]).map((m: any) => [m.id?.toLowerCase(), m.fullName ?? m.name]));
  const chitMap   = Object.fromEntries((chits   as any[]).map((c: any) => [c.id?.toLowerCase(), c.name]));

  const isLoading = auditLoading || l2 || l3 || l4 || l5;

  // Build feed: audit logs (if available) + draws always from live data (not in audit)
  const auditItems = (auditData as any[]).filter((i: any) => !HIDDEN_ENTITY_TYPES.has(i.entityType));
  const hasAudit = auditItems.length > 0;
  const drawItems = (draws as any[])
    .map(drawToItem)
    .filter((d) => !!d.createdAt);

  let feed: any[] = [];
  if (hasAudit) {
    // Audit logs + draw live data (draws not in audit service)
    const combined = [...auditItems, ...drawItems]
      .filter((i) => !!i.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    feed = typeFilter === 'ALL' ? combined : combined.filter((i) => i.entityType === typeFilter);
  } else {
    // Full fallback to live data
    const items = [
      ...(batches  as any[]).map(batchToItem),
      ...(requests as any[]).map(requestToItem),
      ...(payouts  as any[]).map(payoutToItem),
      ...drawItems,
    ].filter((i) => !!i.createdAt)
     .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    feed = typeFilter === 'ALL' ? items : items.filter((i) => i.entityType === typeFilter);
  }

  // Smart deduplication: collapse intermediate states, hide DRAW.CLOSED
  feed = smartDedup(feed);

  // Date filter
  if (datePreset !== 'all') {
    feed = feed.filter((i) => inDateRange(i.createdAt, datePreset, customFrom, customTo));
  }

  const displayed = feed.slice(0, showCount);
  const hasMore   = feed.length > showCount;

  function onRefresh() { ra(); rb(); rr(); rp(); rd(); }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={T.h1}>Activity</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Animated.View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: '#16A34A',
                opacity: blink,
              }} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>LIVE</Text>
              {!isLoading && feed.length > 0 && (
                <Text style={{ fontSize: 12, color: C.gray400 }}>· {Math.min(showCount, feed.length)}/{feed.length}</Text>
              )}
            </View>
            <ProfileAvatarButton size={34} />
          </View>
        </View>
      </View>

      {/* Type filter pills */}
      <View style={{ height: 56, marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.key;
            return (
              <TouchableOpacity key={f.key} onPress={() => setTypeFilter(f.key)}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? C.navy : C.white,
                  borderWidth: 1.5, borderColor: active ? C.navy : C.gray300 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? C.white : C.gray900 }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Date preset chips */}
      <View style={{ height: 48, marginBottom: 6 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          {DATE_PRESETS.map((p) => {
            const active = datePreset === p.key;
            return (
              <TouchableOpacity key={p.key} onPress={() => setDatePreset(p.key)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
                  backgroundColor: active ? C.navy : C.white,
                  borderWidth: 1.5, borderColor: active ? C.navy : C.gray300 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? C.white : C.gray900 }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Custom date inputs */}
      {datePreset === 'custom' && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 4, fontWeight: '600' }}>FROM</Text>
            <TextInput value={customFrom} onChangeText={setCustomFrom} placeholder="YYYY-MM-DD"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, backgroundColor: C.white }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 4, fontWeight: '600' }}>TO</Text>
            <TextInput value={customTo} onChangeText={setCustomTo} placeholder="YYYY-MM-DD"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, backgroundColor: C.white }} />
          </View>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: C.gray200 }} />

      <FlatList
          data={displayed}
          keyExtractor={(item: any, i) => String(item.id ?? i)}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={C.navy} />}
          contentContainerStyle={{ padding: 16, paddingTop: 14, paddingBottom: 40 }}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
                <ActivityIndicator color={C.navy} size="large" />
                <Text style={{ color: C.gray500, fontSize: 14 }}>Loading activity…</Text>
              </View>
            ) : (
              <EmptyState
                title="No activity found"
                message={typeFilter === 'ALL'
                  ? 'No events recorded yet. Try a different date range.'
                  : `No ${entityTypeLabel(typeFilter)} events found.`}
              />
            )
          }
          renderItem={({ item: log, index }) => {
            const key    = `${log.entityType}.${log.action}`;
            const meta   = ACTION_TITLE[key];
            const title  = meta?.title ?? (log.action ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            const subtitle = meta?.subtitle ?? null;
            const accentColor = meta?.color ?? C.gray400;
            const isLast = index === displayed.length - 1;
            const isNeg  = /VOID|CANCEL|DELETE/.test(log.action ?? '');
            const { emoji, bg: iconBg } = activityIconFor(log.entityType, log.action);

            const memberName = log.memberId ? memberMap[log.memberId?.toLowerCase()] : undefined;
            const chitName   = log.chitId   ? chitMap[log.chitId?.toLowerCase()]     : undefined;

            // Extract ₹ amount chip from newValue (strip embedded mode text if any)
            const rawValue = log.newValue ?? '';
            const amountChip = rawValue.startsWith('₹') ? rawValue.split('·')[0].trim() : null;

            // Payment mode — prefer explicit field, fall back to parsing newValue after ·
            const parsedMode = log.paymentMode
              ?? (rawValue.includes(' · ') ? rawValue.split(' · ')[1]?.trim() : null);
            const modeInfo = log.entityType === 'PAYMENT_BATCH' ? paymentModeChip(parsedMode) : null;

            // Show prev→new change only if it's not a ₹ amount (already in chip)
            const showValueChange = !amountChip && (log.previousValue || log.newValue);

            // Detail chips: member · amount · mode · chit · actor role
            const chips: { label: string; color: string; bg: string }[] = [
              memberName  ? { label: memberName,                         color: C.gray700, bg: C.gray100 }    : null,
              amountChip  ? { label: amountChip,                         color: '#166534', bg: '#DCFCE7' }    : null,
              modeInfo    ? { label: `${modeInfo.icon} ${modeInfo.label}`, color: '#374151', bg: '#F3F4F6' }  : null,
              chitName    ? { label: chitName,                           color: C.navy,    bg: C.navy50 }     : null,
              log.actorRole ? {
                label: log.actorRole,
                color: log.actorRole === 'WORKER' ? '#92400E' : log.actorRole === 'MANAGER' ? '#5B21B6' : C.navy,
                bg:    log.actorRole === 'WORKER' ? '#FEF3C7' : log.actorRole === 'MANAGER' ? '#F5F3FF' : C.navy50,
              } : null,
            ].filter(Boolean) as { label: string; color: string; bg: string }[];

            return (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* Timeline icon + vertical connector */}
                <View style={{ alignItems: 'center', paddingTop: 3 }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Text style={{ fontSize: 17 }}>{emoji}</Text>
                  </View>
                  {!isLast && (
                    <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 4, minHeight: 20 }} />
                  )}
                </View>

                {/* Card */}
                <Card style={{ flex: 1, marginBottom: isLast ? 0 : 12, padding: 12 }}>
                  {/* Title + entity badge */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: chips.length ? 6 : 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isNeg ? C.red : C.gray900, flex: 1 }}>
                      {title}
                    </Text>
                    <View style={{
                      backgroundColor: iconBg,
                      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor }}>
                        {entityTypeLabel(log.entityType)}
                      </Text>
                    </View>
                  </View>

                  {/* Detail chips */}
                  {chips.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
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

                  {/* Subtitle (status context) */}
                  {subtitle && (
                    <Text style={{ fontSize: 11, color: accentColor, fontWeight: '600', marginBottom: 4 }}>
                      {subtitle}
                    </Text>
                  )}

                  {/* Reason */}
                  {log.reason ? (
                    <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginBottom: 4 }}>
                      "{log.reason}"
                    </Text>
                  ) : null}

                  {/* Value change (status transitions, non-₹) */}
                  {showValueChange ? (
                    <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 4 }}>
                      {log.previousValue && log.newValue
                        ? `${log.previousValue} → ${log.newValue}`
                        : log.newValue ?? log.previousValue}
                    </Text>
                  ) : null}

                  {/* Smart time */}
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{smartTime(log.createdAt)}</Text>
                </Card>
              </View>
            );
          }}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity onPress={() => setShowCount((c) => c + PAGE_SIZE)}
                style={{ marginTop: 12, padding: 14, borderRadius: 12,
                  backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>
                  Load More ({feed.length - showCount} remaining)
                </Text>
              </TouchableOpacity>
            ) : feed.length > PAGE_SIZE ? (
              <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 16, fontSize: 12 }}>
                All {feed.length} entries loaded
              </Text>
            ) : null
          }
        />
    </SafeAreaView>
  );
}
