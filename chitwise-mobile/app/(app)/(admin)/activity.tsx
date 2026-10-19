import { useState, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getAuditLogPage, getMembers, getChits } from '../../../services/api';
import { C, T, Card, EmptyState, fmtDateTime } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';


const PAGE_SIZE = 50;

const TYPE_FILTERS = [
  { key: 'ALL',           label: 'All' },
  { key: 'PAYMENT_BATCH', label: 'Payments' },
  { key: 'CASH_REQUEST',  label: 'Pickups' },
  { key: 'PAYOUT',        label: 'Payouts' },
  { key: 'CHIT_DRAW',     label: 'Draws' },
  { key: 'CHIT',          label: 'Chits' },
  { key: 'SETTLEMENT',    label: 'Settlements' },
  { key: 'MEMBER',        label: 'Members' },
  { key: 'AUCTION_SESSION', label: 'Auctions' },
  { key: 'RESERVATION_SLOT', label: 'Reservations' },
  { key: 'INVITATION',     label: 'Invitations' },
  { key: 'TICKET',         label: 'Tickets' },
  { key: 'RESERVATION_SCHEDULE', label: 'Scheduling' },
  { key: 'INVITATION_RESPONSE', label: 'Invitation responses' },
  { key: 'ENROLLMENT', label: 'Enrolments' },
  { key: 'TREASURY_ENTRY', label: 'Treasury' },
  { key: 'MEMBER_CREDIT', label: 'Member credit' },
  { key: 'USER', label: 'Accounts' },
];

const DATE_PRESETS = [
  { key: 'all',    label: 'All Time' },
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: '7 Days' },
  { key: 'month',  label: '30 Days' },
  { key: 'custom', label: 'Custom' },
];

const ACTION_TITLE: Record<string, { title: string; color: string; subtitle?: string }> = {
  'PAYMENT_BATCH.CREATED':              { title: 'Payment Collected',              color: '#16A34A' },
  'PAYMENT_BATCH.AWAITING_REMITTANCE':  { title: 'Cash with Staff',                color: C.amber,   subtitle: 'Picked up — staff has not remitted yet' },
  'PAYMENT_BATCH.REMITTED':             { title: 'Remittance Complete',            color: '#16A34A', subtitle: 'Staff returned cash to admin' },
  'PAYMENT_BATCH.VOIDED':               { title: 'Payment Voided',                 color: C.red },
  'CASH_REQUEST.CREATED':               { title: 'Cash Pickup Created',            color: C.amber },
  'CASH_REQUEST.ASSIGNED':              { title: 'Staff Assigned',                 color: C.navy },
  'CASH_REQUEST.PICKED_UP':             { title: 'Cash Picked Up by Staff',        color: C.amber,   subtitle: 'Staff has cash — pending remittance to admin' },
  'CASH_REQUEST.COLLECTED':             { title: 'Cash Collected',                 color: '#16A34A' },
  'CASH_REQUEST.VOIDED':                { title: 'Pickup Voided',                  color: C.red },
  'CASH_REQUEST.CANCELLED':             { title: 'Pickup Cancelled',               color: C.red },
  'CASH_REQUEST.EDITED':                { title: 'Pickup Edited',                  color: C.navy },
  'PAYOUT.CREATED':                { title: 'Payout Created',       color: C.gold },
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
    CHIT_DRAW: 'Draw', DRAW: 'Draw', CHIT: 'Chit', SETTLEMENT: 'Settlement', MEMBER: 'Member',
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
    if (ac.includes('ASSIGN'))   return { emoji: '📦', bg: C.navy50 };
    if (ac.includes('EDIT'))     return { emoji: '✏️',  bg: C.navy50 };
    return { emoji: '💵', bg: '#FEF3C7' };
  }
  if (et === 'PAYOUT') {
    if (ac.includes('CANCEL') || ac.includes('VOID')) return { emoji: '🏆', bg: '#FEE2E2' };
    if (ac.includes('DISBURS')) return { emoji: '🏆', bg: '#DCFCE7' };
    return { emoji: '🏆', bg: C.navy50 };
  }
  if (et === 'DRAW' || et === 'CHIT_DRAW') {
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

function auditDateRange(preset: string, from: string, to: string) {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (preset === 'week' || preset === 'month') {
    const start = new Date(now);
    start.setDate(start.getDate() - (preset === 'week' ? 7 : 30));
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const start = new Date(`${from}T00:00:00`);
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? new Date(`${to}T23:59:59.999`)
      : now;
    return { from: start.toISOString(), to: end.toISOString() };
  }
  return {};
}

function jsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function auditRecordRoute(log: any): { pathname: string; params?: Record<string, string> } | null {
  if (log.entityType === 'MEMBER') {
    return {
      pathname: '/(app)/(admin)/members',
      params: { openMemberId: String(log.entityId), openHistory: '1' },
    };
  }
  if (log.chitId) {
    return {
      pathname: '/(app)/(admin)/chits',
      params: { openChitId: String(log.chitId), openTab: 'audit' },
    };
  }
  if (log.entityType === 'CHIT') {
    return {
      pathname: '/(app)/(admin)/chits',
      params: { openChitId: String(log.entityId), openTab: 'audit' },
    };
  }
  if (log.entityType === 'PAYMENT_BATCH' || log.entityType === 'CASH_REQUEST') {
    return { pathname: '/(app)/(admin)/payments' };
  }
  return null;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter();
  const { markActivitySeen } = useUIStore();
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [recordedBefore, setRecordedBefore] = useState(() => new Date().toISOString());
  const [detailLog,  setDetailLog]  = useState<any>(null);

  useEffect(() => { markActivitySeen(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    setRecordedBefore(new Date().toISOString());
  }, [typeFilter, outcomeFilter, sourceFilter, datePreset, customFrom, customTo, debouncedSearch]);

  // This screen is an audit timeline. It must not synthesize or hide events from
  // current entity state: a void, retry, denial, or intermediate state is itself
  // important evidence for an administrator.
  const dateRange = auditDateRange(datePreset, customFrom, customTo);
  const {
    data: auditPages,
    isLoading: auditLoading,
    isError: auditError,
    isRefetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch: ra,
  } = useInfiniteQuery({
    queryKey: ['act-audit', typeFilter, outcomeFilter, sourceFilter,
      datePreset, customFrom, customTo, debouncedSearch, recordedBefore],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getAuditLogPage({
      page: pageParam, size: 50, sort: 'occurredAt,desc',
      ...(typeFilter !== 'ALL' ? { entityType: typeFilter } : {}),
      ...(outcomeFilter !== 'ALL' ? { outcome: outcomeFilter } : {}),
      ...(sourceFilter !== 'ALL' ? { source: sourceFilter } : {}),
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      recordedBefore,
      ...dateRange,
    }),
    getNextPageParam: (lastPage: any) => lastPage?.last
      ? undefined
      : Number(lastPage?.number ?? 0) + 1,
    staleTime: 30_000,
  });
  const auditData = auditPages?.pages.flatMap((page: any) => page?.content ?? []) ?? [];
  const totalEvents = Number(auditPages?.pages[0]?.totalElements ?? auditData.length);

  // Name maps
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers, staleTime: 120_000 });
  const { data: chits   = [] } = useQuery({ queryKey: ['m-chits'],   queryFn: getChits,   staleTime: 120_000 });
  const memberMap = Object.fromEntries((members as any[]).map((m: any) => [m.id?.toLowerCase(), m.fullName ?? m.name]));
  const chitMap   = Object.fromEntries((chits   as any[]).map((c: any) => [c.id?.toLowerCase(), c.name]));

  const isLoading = auditLoading;

  let feed: any[] = (auditData as any[])
    .filter((i: any) => !!(i.occurredAt ?? i.createdAt))
    .map((i: any) => {
      const before = jsonObject(i.beforeState);
      const after = jsonObject(i.afterState);
      return {
        ...i,
        createdAt: i.occurredAt ?? i.createdAt,
        memberId: i.memberId ?? after.memberId ?? before.memberId,
        paymentMode: i.paymentMode ?? after.mode ?? before.mode,
      };
    });
  if (typeFilter !== 'ALL') feed = feed.filter((i) => i.entityType === typeFilter);
  if (outcomeFilter !== 'ALL') feed = feed.filter((i) => i.outcome === outcomeFilter);
  if (sourceFilter !== 'ALL') feed = feed.filter((i) => i.source === sourceFilter);
  const needle = debouncedSearch.toLowerCase();
  if (needle) {
    feed = feed.filter((i) => [i.action, i.entityType, i.entityId, i.chitId,
      i.actorId, i.actorRole, i.reason, i.source, i.outcome, i.metadata,
      i.beforeState, i.afterState].some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }
  feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Date filter
  if (datePreset !== 'all') {
    feed = feed.filter((i) => inDateRange(i.createdAt, datePreset, customFrom, customTo));
  }

  const displayed = feed;
  const hasMore = hasNextPage === true;

  function onRefresh() { setRecordedBefore(new Date().toISOString()); }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
              <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
            </TouchableOpacity>
            <Text style={T.h1}>Activity</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>AUDITED</Text>
              {!isLoading && totalEvents > 0 && (
                <Text style={{ fontSize: 12, color: C.gray400 }}>· {feed.length}/{totalEvents}</Text>
              )}
              </View>
              <Text style={{ fontSize: 10, color: C.gray400 }}>Snapshot {smartTime(recordedBefore)}</Text>
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
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, backgroundColor: C.surface }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 4, fontWeight: '600' }}>TO</Text>
            <TextInput value={customTo} onChangeText={setCustomTo} placeholder="YYYY-MM-DD"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, backgroundColor: C.surface }} />
          </View>
        </View>
      )}

      {/* Audit dimensions: outcome/source/search are intentionally explicit so an
          admin can find failures and offline/system activity without reading raw rows. */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8, gap: 8 }}>
        <TextInput value={searchText} onChangeText={setSearchText}
          placeholder="Search action, actor, chit or record…" placeholderTextColor={C.gray400}
          style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: C.gray900, backgroundColor: C.surface }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['ALL', 'SUCCESS', 'FAILURE', 'DENIED'].map((value) => (
            <TouchableOpacity key={value} onPress={() => setOutcomeFilter(value)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: outcomeFilter === value ? C.navy : C.white, borderWidth: 1.5, borderColor: outcomeFilter === value ? C.navy : C.gray300 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: outcomeFilter === value ? C.white : C.gray700 }}>{value === 'ALL' ? 'All outcomes' : value}</Text>
            </TouchableOpacity>
          ))}
          {['ALL', 'WEB', 'MOBILE', 'HUB', 'OFFLINE_SYNC', 'INTERNAL_API', 'WORKER', 'SYSTEM', 'UNKNOWN'].map((value) => (
            <TouchableOpacity key={value} onPress={() => setSourceFilter(value)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sourceFilter === value ? C.navy : C.white, borderWidth: 1.5, borderColor: sourceFilter === value ? C.navy : C.gray300 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: sourceFilter === value ? C.white : C.gray700 }}>{value === 'ALL' ? 'All sources' : value.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {auditError && displayed.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>Could not refresh audited activity</Text>
          <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 3 }}>Showing the last successfully loaded snapshot.</Text>
          <TouchableOpacity onPress={() => ra()} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: C.gray200 }} />

      <FlatList
          data={displayed}
          keyExtractor={(item: any, i) => String(item.id ?? i)}
          refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={onRefresh} tintColor={C.navy} />}
          contentContainerStyle={{ padding: 16, paddingTop: 14, paddingBottom: 40 }}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
                <ActivityIndicator color={C.navy} size="large" />
                <Text style={{ color: C.gray500, fontSize: 14 }}>Loading activity…</Text>
              </View>
            ) : auditError ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.red }}>Activity could not be loaded</Text>
                <Text style={{ color: C.gray500, fontSize: 13, textAlign: 'center' }}>
                  This does not mean that no audit events were recorded.
                </Text>
                <TouchableOpacity onPress={() => ra()}
                  style={{ marginTop: 6, borderWidth: 1.5, borderColor: C.red, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>Try again</Text>
                </TouchableOpacity>
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
            const normalizedAction = String(log.action ?? '').replace(
              new RegExp(`^${String(log.entityType ?? '')}_`), '');
            const key    = `${log.entityType}.${normalizedAction}`;
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
                color: (log.actorRole === 'WORKER' || log.actorRole === 'STAFF') ? '#92400E' : C.navy,
                bg:    (log.actorRole === 'WORKER' || log.actorRole === 'STAFF') ? '#FEF3C7' : C.navy50,
              } : null,
            ].filter(Boolean) as { label: string; color: string; bg: string }[];

            return (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailLog({ log, title, chips, subtitle, memberName, chitName, accentColor, emoji, iconBg, isNeg })}>
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
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{smartTime(log.occurredAt ?? log.createdAt)}</Text>
                  {(log.source || log.outcome) && (
                    <Text style={{ fontSize: 10, color: log.outcome === 'FAILURE' || log.outcome === 'DENIED' ? C.red : C.gray400, marginTop: 2 }}>
                      {(log.source ?? 'UNKNOWN').replace('_', ' ')} · {log.outcome ?? 'SUCCESS'}
                    </Text>
                  )}
                  <Text style={{ fontSize: 10, color: C.gray300, marginTop: 2 }}>Tap for details</Text>
                </Card>
              </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity disabled={isFetchingNextPage} onPress={() => fetchNextPage()}
                style={{ marginTop: 12, padding: 14, borderRadius: 12,
                  backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>
                  {isFetchingNextPage ? 'Loading more…' : `Load More (${Math.max(totalEvents - feed.length, 0)} remaining)`}
                </Text>
              </TouchableOpacity>
            ) : feed.length > PAGE_SIZE ? (
              <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 16, fontSize: 12 }}>
                All {feed.length} entries loaded
              </Text>
            ) : null
          }
        />

      {/* ── Activity Detail Modal ─────────────────────────────────────────────── */}
      {detailLog && (
        <Modal visible={!!detailLog} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailLog(null)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: detailLog.iconBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{detailLog.emoji}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: detailLog.isNeg ? C.red : C.gray900 }}>{detailLog.title}</Text>
                  <Text style={{ fontSize: 12, color: detailLog.accentColor, fontWeight: '600', marginTop: 1 }}>{entityTypeLabel(detailLog.log.entityType)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetailLog(null)} style={{ padding: 8 }}>
                <Text style={{ fontSize: 26, color: C.gray400, lineHeight: 26 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 4 }}>
              {/* Who / what */}
              {detailLog.memberName && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray500 }}>Member</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>{detailLog.memberName}</Text>
                </View>
              )}
              {detailLog.chitName && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray500 }}>Chit Fund</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>{detailLog.chitName}</Text>
                </View>
              )}
              {detailLog.log.actorRole && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray500 }}>Performed by</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>{detailLog.log.actorRole}</Text>
                </View>
              )}

              {/* Value change */}
              {(detailLog.log.previousValue || detailLog.log.newValue) && (
                <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 6 }}>Change</Text>
                  {detailLog.log.previousValue && detailLog.log.newValue ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>{detailLog.log.previousValue}</Text>
                      </View>
                      <Text style={{ fontSize: 16, color: C.gray400 }}>→</Text>
                      <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>{detailLog.log.newValue}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>{detailLog.log.newValue ?? detailLog.log.previousValue}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Reason / notes */}
              {detailLog.log.reason && (
                <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 4 }}>Reason</Text>
                  <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{detailLog.log.reason}"</Text>
                </View>
              )}

              {/* Subtitle/context */}
              {detailLog.subtitle && (
                <View style={{ marginTop: 4, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>{detailLog.subtitle}</Text>
                </View>
              )}

              {/* Chips */}
              {detailLog.chips.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {detailLog.chips.map((chip: any, i: number) => (
                    <View key={i} style={{ backgroundColor: chip.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: chip.color }}>{chip.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Before / After state (from audit service) */}
              {(detailLog.log.beforeState || detailLog.log.afterState) && (() => {
                let before: any = null;
                let after: any = null;
                try { before = detailLog.log.beforeState ? JSON.parse(detailLog.log.beforeState) : null; } catch {}
                try { after  = detailLog.log.afterState  ? JSON.parse(detailLog.log.afterState)  : null; } catch {}
                const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
                const changed = [...allKeys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
                if (changed.length === 0) return null;
                return (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, marginBottom: 8, letterSpacing: 0.5 }}>FIELD CHANGES</Text>
                    {changed.map((k) => (
                      <View key={k} style={{ marginBottom: 8, padding: 12, backgroundColor: C.gray50, borderRadius: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, marginBottom: 4, textTransform: 'uppercase' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {before?.[k] !== undefined && (
                            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>{String(before[k])}</Text>
                            </View>
                          )}
                          {before?.[k] !== undefined && after?.[k] !== undefined && (
                            <Text style={{ fontSize: 14, color: C.gray400 }}>→</Text>
                          )}
                          {after?.[k] !== undefined && (
                            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>{String(after[k])}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* Metadata */}
              {detailLog.log.metadata && (() => {
                let meta: any = null;
                try { meta = JSON.parse(detailLog.log.metadata); } catch {}
                if (!meta) return <Text style={{ fontSize: 12, color: C.gray400, marginTop: 8 }}>{detailLog.log.metadata}</Text>;
                return (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, marginBottom: 8, letterSpacing: 0.5 }}>DETAILS</Text>
                    {Object.entries(meta).map(([k, v]: [string, any]) => (
                      <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                        <Text style={{ fontSize: 12, color: C.gray500, flex: 1 }}>{k.replace(/([A-Z])/g, ' $1').trim()}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray900, flex: 1, textAlign: 'right' }}>{String(v)}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {auditRecordRoute(detailLog.log) && (
                <TouchableOpacity
                  onPress={() => {
                    const destination = auditRecordRoute(detailLog.log);
                    if (!destination) return;
                    setDetailLog(null);
                    router.push(destination as any);
                  }}
                  style={{ marginTop: 12, borderWidth: 1.5, borderColor: C.navy, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: C.navy, fontSize: 13, fontWeight: '700' }}>Open affected record →</Text>
                </TouchableOpacity>
              )}

              {/* Business occurrence and evidence-recording timestamps are deliberately
                  separate. An offline payment happened on the device before it synchronized. */}
              <View style={{ marginTop: 16, padding: 14, backgroundColor: C.gray50, borderRadius: 12 }}>
                <Text style={{ fontSize: 11, color: C.gray500 }}>Occurred</Text>
                <Text style={{ fontSize: 12, color: C.gray700, marginTop: 2 }}>{fmtDateTime(detailLog.log.occurredAt ?? detailLog.log.createdAt)}</Text>
                <Text style={{ fontSize: 11, color: C.gray500, marginTop: 10 }}>Recorded in audit history</Text>
                <Text style={{ fontSize: 12, color: C.gray700, marginTop: 2 }}>{fmtDateTime(detailLog.log.createdAt)}</Text>
                {detailLog.log.originalOfflineAt ? (
                  <>
                    <Text style={{ fontSize: 11, color: C.gray500, marginTop: 10 }}>Recorded offline on device</Text>
                    <Text style={{ fontSize: 12, color: C.gray700, marginTop: 2 }}>{fmtDateTime(detailLog.log.originalOfflineAt)}</Text>
                  </>
                ) : null}
                {detailLog.log.synchronizedAt ? (
                  <>
                    <Text style={{ fontSize: 11, color: C.gray500, marginTop: 10 }}>Synchronized</Text>
                    <Text style={{ fontSize: 12, color: C.gray700, marginTop: 2 }}>{fmtDateTime(detailLog.log.synchronizedAt)}</Text>
                  </>
                ) : null}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}
