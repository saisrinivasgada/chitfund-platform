import { useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, Alert, TextInput,
  TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import {
  getMyAssignedRequests, cancelByStaff,
  getMembers, getChits, getMyPendingBatches, listStaff,
  rescheduleRequest, getAdminSupportContact,
} from '../../../services/api';
import { C, T, Card, Badge, Amount, fmtDate, fmtDateTime, EmptyState, LoadingScreen } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { toast } from '../../../components/Toast';
import { SyncStatusCard } from '../../../components/SyncStatusCard';
import RoleLogo from '../../../components/RoleLogo';
import { syncCurrentAccount } from '../../../offline/syncEngine';
import { markPickupOfflineCapable, partialCollectOfflineCapable } from '../../../offline/staffQueue';

// ── Task Detail Modal ──────────────────────────────────────────────────────────
function TaskModal({
  task,
  memberName,
  chitName,
  onClose,
  onRefresh,
}: {
  task: any;
  memberName: string;
  chitName: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();

  // 'idle' | 'partial-input' | 'reschedule' | 'done' | 'partial-done'
  const [screen, setScreen] = useState<'idle' | 'partial-input' | 'reschedule' | 'done' | 'partial-done'>('idle');
  const [partialAmount, setPartialAmount] = useState('');
  const [doneAmount, setDoneAmount] = useState(0);
  const [doneOffline, setDoneOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reschedDate, setReschedDate] = useState('');

  async function handleFullCollect() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await markPickupOfflineCapable(task.id);
      // Optimistic update — task moves to PICKED_UP in local cache
      qc.setQueryData(['staff-tasks'], (old: any[]) =>
        (old ?? []).map((t: any) =>
          t.id === task.id ? { ...t, status: 'PICKED_UP', pickedUpAt: new Date().toISOString() } : t,
        ),
      );
      setDoneAmount(Number(task.requestedAmount));
      setDoneOffline(!!res?.offlineQueued);
      setScreen('done');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Could not record pickup');
    } finally {
      setLoading(false);
    }
  }

  async function handlePartialCollect() {
    const amt = Number(partialAmount);
    if (!amt || amt <= 0 || amt >= Number(task.requestedAmount)) return;
    if (loading) return;
    setLoading(true);
    try {
      const res = await partialCollectOfflineCapable(task.id, amt);
      qc.setQueryData(['staff-tasks'], (old: any[]) =>
        (old ?? []).map((t: any) =>
          t.id === task.id
            ? { ...t, status: 'PARTIALLY_COLLECTED', collectedAmount: amt, pickedUpAt: new Date().toISOString() }
            : t,
        ),
      );
      setDoneAmount(amt);
      setDoneOffline(!!res?.offlineQueued);
      setScreen('partial-done');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Could not record partial collection');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    Alert.alert(
      'Cancel Task',
      'Are you sure you want to cancel this collection? Admin will be notified.',
      [
        { text: 'No, go back', style: 'cancel' },
        {
          text: 'Yes, cancel it',
          style: 'destructive',
          onPress: () => {
            cancelByStaff(task.id)
              .then(() => {
                qc.invalidateQueries({ queryKey: ['staff-tasks'] });
                toast.cancelled('Task cancelled');
                onClose();
              })
              .catch((e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Cancel failed'));
          },
        },
      ],
    );
  }

  function handleReschedule(iso: string) {
    rescheduleRequest(task.id, iso)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['staff-tasks'] });
        toast.saved(`Visit rescheduled to ${iso}`);
        onClose();
      })
      .catch((e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Reschedule failed'));
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  if (screen === 'done' || screen === 'partial-done') {
    const isPartial = screen === 'partial-done';
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <View style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: isPartial ? '#FFF7ED' : '#DCFCE7',
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
              <Text style={{ fontSize: 40 }}>{isPartial ? '🟡' : '✅'}</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.gray900, marginBottom: 6 }}>
              {isPartial ? 'Partial Collection Recorded' : 'Marked as Collected!'}
            </Text>
            <Text style={{ fontSize: 32, fontWeight: '900', color: isPartial ? C.amber : C.green, marginBottom: 4 }}>
              ₹{doneAmount.toLocaleString('en-IN')}
            </Text>
            <Text style={{ fontSize: 14, color: C.gray500, textAlign: 'center', marginBottom: 8 }}>
              {isPartial
                ? `of ₹${Number(task.requestedAmount).toLocaleString('en-IN')} requested from ${memberName}`
                : `collected from ${memberName}`}
            </Text>
            {doneOffline && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#FFF7ED', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1, borderColor: C.amber, marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14 }}>⏱</Text>
                <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>
                  Saved offline — will sync when connected
                </Text>
              </View>
            )}
            {!doneOffline && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1, borderColor: C.green, marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14 }}>☁️</Text>
                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>
                  Synced with server
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', marginBottom: 32 }}>
              {isPartial
                ? 'Admin will follow up on the remaining amount.'
                : 'Hand the cash to your admin. Awaiting their confirmation.'}
            </Text>
            <TouchableOpacity
              onPress={() => { onRefresh(); onClose(); }}
              style={{
                width: '100%', paddingVertical: 16, borderRadius: 14,
                backgroundColor: C.navy, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.white }}>Back to My Tasks</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Main modal ────────────────────────────────────────────────────────────────
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray100,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.navy }} numberOfLines={1}>{memberName}</Text>
            {chitName && <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{chitName}</Text>}
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8, marginLeft: 12 }}>
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

            {/* Amount hero */}
            <View style={{
              alignItems: 'center', paddingVertical: 28,
              backgroundColor: C.navy50, borderRadius: 16, marginBottom: 20,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, letterSpacing: 0.5, marginBottom: 8 }}>
                AMOUNT TO COLLECT
              </Text>
              <Text style={{ fontSize: 44, fontWeight: '900', color: C.navy }}>
                ₹{Number(task.requestedAmount).toLocaleString('en-IN')}
              </Text>
              {task.scheduledFor && (
                <Text style={{ fontSize: 13, color: C.navy, marginTop: 8, opacity: 0.7 }}>
                  Scheduled: {fmtDate(task.scheduledFor)}
                </Text>
              )}
              {task.notes && (
                <View style={{ marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.surface, borderRadius: 8, maxWidth: '90%' }}>
                  <Text style={{ fontSize: 13, color: C.gray600, fontStyle: 'italic', textAlign: 'center' }}>
                    "{task.notes}"
                  </Text>
                </View>
              )}
              {task.adminNotes && (
                <View style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#EFF6FF', borderRadius: 8, maxWidth: '90%' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy, marginBottom: 2 }}>ADMIN NOTE</Text>
                  <Text style={{ fontSize: 13, color: C.navy, textAlign: 'center' }}>{task.adminNotes}</Text>
                </View>
              )}
            </View>

            {/* PRIMARY ACTION */}
            {screen === 'idle' && (
              <>
                <TouchableOpacity
                  onPress={handleFullCollect}
                  disabled={loading}
                  style={{
                    paddingVertical: 18, borderRadius: 14, alignItems: 'center',
                    backgroundColor: loading ? C.gray300 : C.green,
                    marginBottom: 12,
                    shadowColor: C.green, shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3, shadowRadius: 10,
                  }}
                >
                  <Text style={{ fontSize: 17, fontWeight: '900', color: C.white }}>
                    {loading ? 'Recording…' : `✓  I Collected ₹${Number(task.requestedAmount).toLocaleString('en-IN')}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.white + 'CC', marginTop: 3 }}>
                    Full amount — tap to confirm
                  </Text>
                </TouchableOpacity>

                {/* Partial collection */}
                <TouchableOpacity
                  onPress={() => setScreen('partial-input')}
                  style={{
                    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                    borderWidth: 1.5, borderColor: '#0D9488', marginBottom: 24,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0D9488' }}>
                    Collected a different amount?
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Tap to enter partial amount</Text>
                </TouchableOpacity>

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: C.gray100, marginBottom: 20 }} />

                {/* Reschedule */}
                <TouchableOpacity
                  onPress={() => setScreen('reschedule')}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 14, paddingHorizontal: 16,
                    backgroundColor: C.gray50, borderRadius: 12, marginBottom: 10,
                    borderWidth: 1, borderColor: C.gray200,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 18 }}>📅</Text>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Reschedule Visit</Text>
                      <Text style={{ fontSize: 12, color: C.gray400 }}>Member not home? Come back later</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: C.navy }}>→</Text>
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity
                  onPress={handleCancel}
                  style={{ paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 14, color: C.red, fontWeight: '600' }}>Cancel This Task</Text>
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>Admin will be notified</Text>
                </TouchableOpacity>
              </>
            )}

            {/* PARTIAL INPUT SCREEN */}
            {screen === 'partial-input' && (
              <>
                <TouchableOpacity
                  onPress={() => { setScreen('idle'); setPartialAmount(''); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}
                >
                  <Text style={{ fontSize: 14, color: C.navy }}>← Back</Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 16, fontWeight: '800', color: C.gray900, marginBottom: 6 }}>
                  How much did you collect?
                </Text>
                <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
                  Must be less than ₹{Number(task.requestedAmount).toLocaleString('en-IN')}. Member will approve or reject this amount.
                </Text>

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderWidth: 2, borderColor: '#0D9488', borderRadius: 12,
                  paddingHorizontal: 16, paddingVertical: 4, marginBottom: 20,
                  backgroundColor: '#F0FDFA',
                }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#0D9488', marginRight: 8 }}>₹</Text>
                  <TextInput
                    value={partialAmount}
                    onChangeText={setPartialAmount}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={C.gray300}
                    style={{ flex: 1, fontSize: 32, fontWeight: '900', color: C.gray900, paddingVertical: 12 }}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePartialCollect}
                  disabled={loading || !partialAmount || Number(partialAmount) <= 0 || Number(partialAmount) >= Number(task.requestedAmount)}
                  style={{
                    paddingVertical: 18, borderRadius: 14, alignItems: 'center',
                    backgroundColor:
                      loading || !partialAmount || Number(partialAmount) <= 0 || Number(partialAmount) >= Number(task.requestedAmount)
                        ? C.gray200
                        : '#0D9488',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.white }}>
                    {loading ? 'Recording…' : `Record ₹${Number(partialAmount || 0).toLocaleString('en-IN')} Collected`}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* RESCHEDULE SCREEN */}
            {screen === 'reschedule' && (
              <>
                <TouchableOpacity
                  onPress={() => { setScreen('idle'); setReschedDate(''); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}
                >
                  <Text style={{ fontSize: 14, color: C.navy }}>← Back</Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 16, fontWeight: '800', color: C.gray900, marginBottom: 16 }}>
                  When should we revisit?
                </Text>

                {/* Quick options */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: 'In 3 days', days: 3 },
                    { label: 'Next week', days: 7 },
                  ].map(({ label, days }) => (
                    <TouchableOpacity
                      key={label}
                      onPress={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        handleReschedule(d.toISOString().slice(0, 10));
                      }}
                      style={{
                        flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
                        backgroundColor: C.navy50, borderWidth: 1.5, borderColor: C.navy,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: C.navy }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray500, marginBottom: 8 }}>
                  OR PICK A DATE
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16,
                }}>
                  <TextInput
                    value={reschedDate}
                    onChangeText={setReschedDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.gray300}
                    style={{ flex: 1, fontSize: 16, color: C.gray900, paddingVertical: 12 }}
                  />
                </View>
                <TouchableOpacity
                  disabled={!reschedDate || !/^\d{4}-\d{2}-\d{2}$/.test(reschedDate)}
                  onPress={() => handleReschedule(reschedDate)}
                  style={{
                    paddingVertical: 16, borderRadius: 14, alignItems: 'center',
                    backgroundColor: reschedDate && /^\d{4}-\d{2}-\d{2}$/.test(reschedDate) ? C.navy : C.gray200,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.white }}>Set Date</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function StaffTasksScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [expandedCustodyId, setExpandedCustodyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['staff-tasks'],
    queryFn: getMyAssignedRequests,
    refetchInterval: 30_000,
  });

  const { data: members = [] } = useQuery({ queryKey: ['members', 'all'], queryFn: getMembers });
  const { data: chits = [] }   = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: staff = [] }   = useQuery({ queryKey: ['staff'], queryFn: listStaff, staleTime: 5 * 60_000 });
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['worker-pending-batches'],
    queryFn: getMyPendingBatches,
    refetchInterval: 60_000,
  });
  const { data: adminContact } = useQuery({
    queryKey: ['admin-support-contact'],
    queryFn: getAdminSupportContact,
    staleTime: 10 * 60_000,
  });

  const memberMap: Record<string, string> = {};
  (staff as any[]).forEach((s: any) => { memberMap[s.id] = s.fullName ?? s.username ?? s.id.slice(0, 8); });
  (members as any[]).forEach((m: any) => {
    const name = m.fullName ?? m.name ?? m.id.slice(0, 8);
    memberMap[m.id] = name;
    if (m.userId) memberMap[m.userId] = name;
  });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  const assigned           = (tasks as any[]).filter((t: any) => t.status === 'ASSIGNED');
  const pickedUp           = (tasks as any[]).filter((t: any) => t.status === 'PICKED_UP');
  const partiallyCollected = (tasks as any[]).filter((t: any) => t.status === 'PARTIALLY_COLLECTED');

  // Unified "cash not yet reconciled by admin" queue. These come from two different
  // backend paths — a picked-up CashRequest (no ledger effect yet, admin hasn't
  // confirmed receipt) and an AWAITING_REMITTANCE PaymentBatch (admin still needs
  // to remit to treasury before FIFO/ledger updates) — but from where the staff
  // member is standing, both mean the same thing: "I'm holding cash the admin
  // hasn't reconciled yet." They're shown as one sorted queue instead of two
  // disconnected lists, with a small stage pill on each card to keep the two
  // underlying actions distinguishable.
  type CustodyItem = { kind: 'pickup' | 'batch'; id: string; memberId: string; chitId?: string; amount: number; at?: string; allocations?: any[] };
  const custodyItems: CustodyItem[] = [
    ...pickedUp.map((t: any): CustodyItem => ({ kind: 'pickup', id: t.id, memberId: t.memberId, chitId: t.chitId, amount: Number(t.requestedAmount ?? 0), at: t.pickedUpAt, allocations: t.allocations })),
    ...(pendingBatches as any[]).map((b: any): CustodyItem => ({ kind: 'batch', id: b.id, memberId: b.memberId, chitId: b.chitId, amount: Number(b.amount ?? b.totalAmount ?? 0), at: b.collectedAt ?? b.createdAt })),
  ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

  const holdingAmt = custodyItems.reduce((s, item) => s + item.amount, 0)
    + partiallyCollected.reduce((s: number, t: any) => s + Number(t.collectedAmount ?? 0), 0);
  const needAmt  = assigned.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);
  const today    = new Date().toDateString();
  const todayAmt = (tasks as any[])
    .filter((t: any) => t.pickedUpAt && new Date(t.pickedUpAt).toDateString() === today)
    .reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  async function onRefresh() {
    setIsRefreshing(true);
    try { await syncCurrentAccount(qc); } catch {}
    setIsRefreshing(false);
  }

  if (isLoading) return <LoadingScreen />;

  const empty = assigned.length === 0 && custodyItems.length === 0 && partiallyCollected.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={assigned}
        keyExtractor={(t: any) => t.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <RoleLogo role="STAFF" size={58} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: C.navy, letterSpacing: -0.55 }} numberOfLines={1}>My Tasks</Text>
                  <Text style={{ fontSize: 12, color: C.gold, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                    {user?.tenantName ?? 'Your organization'}
                  </Text>
                  <View style={{ marginTop: 4 }}><SyncStatusCard compact /></View>
                </View>
              </View>
              <ProfileAvatarButton />
            </View>

            <View style={{ marginBottom: 14, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 27, lineHeight: 33, fontWeight: '800', color: C.navy, letterSpacing: -0.65 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                {greeting}, {user?.fullName?.split(' ')[0] ?? 'Staff'} 👋
              </Text>
              <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 17, color: C.gray500 }}>Collections and cash currently assigned to you.</Text>
            </View>

            {/* Summary strip */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'TO COLLECT', amt: needAmt, count: assigned.length, color: C.navy, bg: C.navy50 },
                { label: 'HOLDING',    amt: holdingAmt, count: custodyItems.length + partiallyCollected.length, color: C.amber, bg: '#FFFBEB' },
                { label: 'TODAY',      amt: todayAmt, count: 0, color: C.green, bg: '#F0FDF4' },
              ].map(({ label, amt, count, color, bg }) => (
                <View key={label} style={{
                  flex: 1, borderRadius: 12, padding: 12,
                  backgroundColor: amt > 0 ? bg : C.gray50,
                  borderWidth: 1.5, borderColor: amt > 0 ? color : C.gray200,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: amt > 0 ? color : C.gray400, letterSpacing: 0.5, marginBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: amt > 0 ? color : C.gray300 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    ₹{amt.toLocaleString('en-IN')}
                  </Text>
                  {count > 0 && <Text style={{ fontSize: 10, color, marginTop: 2 }}>{count} task{count > 1 ? 's' : ''}</Text>}
                </View>
              ))}
            </View>

            {/* Cash not yet reconciled by admin — unified queue across both
                the CashRequest pickup flow and the direct payment-batch flow. */}
            {custodyItems.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Cash with you — pending admin action ({custodyItems.length})
                </Text>
                {custodyItems.map((item) => {
                  const isPickup = item.kind === 'pickup';
                  const stageColor = isPickup ? C.green : C.amber;
                  const itemKey = `${item.kind}-${item.id}`;
                  const breakdown = item.allocations ?? [];
                  const hasBreakdown = isPickup && breakdown.length > 1;
                  const isExpanded = expandedCustodyId === itemKey;
                  return (
                    <Card key={itemKey} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: stageColor }}>
                      <TouchableOpacity
                        activeOpacity={hasBreakdown ? 0.6 : 1}
                        disabled={!hasBreakdown}
                        onPress={() => setExpandedCustodyId(isExpanded ? null : itemKey)}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                                {memberMap[item.memberId] ?? `Member`}
                              </Text>
                              {hasBreakdown && (
                                <Text style={{ fontSize: 11, color: C.gray400 }}>
                                  {isExpanded ? '▾' : '▸'} {breakdown.length} chits
                                </Text>
                              )}
                            </View>
                            {item.chitId && chitMap[item.chitId] && (
                              <Text style={{ fontSize: 12, color: C.navy, marginTop: 1 }}>{chitMap[item.chitId]}</Text>
                            )}
                            {item.at && (
                              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>
                                {isPickup ? 'Collected' : 'Recorded'} {fmtDate(item.at)}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Amount value={item.amount} size="sm" color={stageColor} />
                            <View style={{ backgroundColor: stageColor + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: stageColor }}>
                                {isPickup ? 'PICKED UP' : 'AWAITING REMITTANCE'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        {isExpanded && hasBreakdown && (
                          <View style={{ backgroundColor: C.gray50, borderRadius: 8, padding: 10, marginTop: 8, gap: 4 }}>
                            {breakdown.map((a: any) => (
                              <View key={a.chitId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 12, color: C.gray700 }}>{chitMap[a.chitId] ?? 'Chit'}</Text>
                                <Text style={{ fontSize: 12, color: C.gray900, fontWeight: '600' }}>₹{Number(a.amount ?? 0).toLocaleString('en-IN')}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    </Card>
                  );
                })}
              </View>
            )}

            {/* Partially collected */}
            {partiallyCollected.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Partial — Admin follow-up ({partiallyCollected.length})
                </Text>
                {partiallyCollected.map((t: any) => (
                  <Card key={t.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                          {memberMap[t.memberId] ?? `Member`}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                          ₹{Number(t.collectedAmount ?? 0).toLocaleString('en-IN')} of ₹{Number(t.requestedAmount).toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <Badge status="PARTIALLY_COLLECTED" />
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {assigned.length > 0 && (
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                To Collect ({assigned.length})
              </Text>
            )}

            {empty && (
              <EmptyState title="All done!" message="No tasks assigned right now. Admin will add new tasks here." />
            )}
          </>
        }
        ListFooterComponent={
          adminContact?.supportPhoneNumber ? (
            <TouchableOpacity
              onPress={() => {
                const { Linking } = require('react-native');
                Linking.openURL(`tel:${adminContact.supportPhoneNumber}`);
              }}
              style={{
                marginTop: 16, paddingVertical: 14, alignItems: 'center',
                backgroundColor: C.gray50, borderRadius: 12,
                borderWidth: 1.5, borderColor: C.gray200,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              <Text style={{ fontSize: 15 }}>📞</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray700 }}>Call Admin</Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item: t }) => (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setSelectedTask(t)}>
            <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.gray900 }}>
                    {memberMap[t.memberId] ?? `Member`}
                  </Text>
                  {t.chitId && chitMap[t.chitId] && (
                    <Text style={{ fontSize: 12, color: C.navy, marginTop: 2 }}>{chitMap[t.chitId]}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                    Assigned {fmtDate(t.assignedAt)}
                    {t.scheduledFor ? ` · Visit: ${fmtDate(t.scheduledFor)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: C.navy }}>
                    ₹{Number(t.requestedAmount).toLocaleString('en-IN')}
                  </Text>
                  <View style={{ backgroundColor: C.amber, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.white }}>Collect →</Text>
                  </View>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          memberName={memberMap[selectedTask.memberId] ?? 'Member'}
          chitName={selectedTask.chitId ? chitMap[selectedTask.chitId] ?? null : null}
          onClose={() => setSelectedTask(null)}
          onRefresh={onRefresh}
        />
      )}
    </SafeAreaView>
  );
}
