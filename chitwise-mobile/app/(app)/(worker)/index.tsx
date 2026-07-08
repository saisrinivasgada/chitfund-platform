import { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, RefreshControl, Alert, TextInput,
  TouchableOpacity, Animated, Easing, Pressable, Modal, ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import {
  getMyAssignedRequests, markPickedUp, cancelByWorker,
  getMembers, getChits, getMyPendingBatches, updateCashRequest, listStaff,
} from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, fmtDateTime, fmtDate, EmptyState, LoadingScreen, Divider } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { toast } from '../../../components/Toast';

const PAGE_SIZE = 10;

// ── Hold-to-Pickup Button ──────────────────────────────────────────────────────
function HoldPickupButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'holding' | 'done'>('idle');
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const successScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === 'done') {
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }).start();
    }
  }, [phase]);

  function startHold() {
    if (disabled || phase !== 'idle') return;
    setPhase('holding');
    animation.current = Animated.timing(progress, {
      toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (finished) {
        successScale.setValue(0);
        setPhase('done');
        onConfirm();
      }
    });
  }

  function endHold() {
    if (phase !== 'holding') return;
    animation.current?.stop();
    setPhase('idle');
    Animated.timing(progress, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  }

  function reset() {
    setPhase('idle');
    progress.setValue(0);
  }

  if (phase === 'done') {
    return (
      <Animated.View style={{ alignItems: 'center', paddingVertical: 16, transform: [{ scale: successScale }] }}>
        <View style={{
          width: 72, height: 72, borderRadius: 36,
          backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        }}>
          <Text style={{ fontSize: 32 }}>✓</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.green }}>Picked Up!</Text>
        <Text style={{ fontSize: 13, color: C.gray500, marginTop: 4 }}>Awaiting admin confirmation</Text>
        <TouchableOpacity onPress={reset}
          style={{ marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: C.gray100, borderRadius: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>Continue Working →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
      <Pressable
        onPressIn={startHold}
        onPressOut={endHold}
        style={{
          width: 100, height: 100, borderRadius: 50,
          backgroundColor: phase === 'holding' ? C.green : C.navy,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: phase === 'holding' ? C.green : C.navy,
          shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '900', color: C.white, letterSpacing: 1.5 }}>HOLD</Text>
        <Text style={{ fontSize: 11, color: C.white + 'AA', marginTop: 2 }}>to pick up</Text>
      </Pressable>

      <View style={{ marginTop: 14, width: 140, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', width: barWidth, backgroundColor: C.green, borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 12, color: C.gray400, marginTop: 7 }}>
        {phase === 'holding' ? 'Keep holding…' : 'Hold 2 seconds to confirm'}
      </Text>
    </View>
  );
}

// ── Request Timeline ───────────────────────────────────────────────────────────
function RequestTimeline({ task }: { task: any }) {
  const steps = [
    task.requestedAt  && { label: 'Request Created',      time: task.requestedAt,  color: C.navy,   note: `₹${Number(task.requestedAmount).toLocaleString('en-IN')}` },
    task.assignedAt   && { label: 'Assigned to You',      time: task.assignedAt,   color: C.navy,   note: task.adminNotes ?? '' },
    task.notes        && { label: 'Member Note',          time: null,              color: C.gray400, note: task.notes },
    task.scheduledFor && { label: 'Scheduled For',        time: task.scheduledFor, color: '#7C3AED', note: '' },
    task.pickedUpAt   && { label: 'You Marked Picked Up', time: task.pickedUpAt,   color: C.green,  note: '' },
    task.collectedAt  && { label: 'Admin Confirmed',      time: task.collectedAt,  color: C.green,  note: '' },
    task.cancelledAt  && { label: 'Cancelled',            time: task.cancelledAt,  color: C.red,    note: task.cancelReason ?? '' },
  ].filter(Boolean) as { label: string; time: string | null; color: string; note: string }[];

  return (
    <View>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: step.color, marginTop: 3 }} />
            {i < steps.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 3 }} />}
          </View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{step.label}</Text>
            {!!step.note && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>{step.note}</Text>}
            {!!step.time && <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{fmtDateTime(step.time)}</Text>}
          </View>
        </View>
      ))}
      {steps.length === 0 && (
        <Text style={{ color: C.gray400, textAlign: 'center', padding: 12 }}>No timeline data</Text>
      )}
    </View>
  );
}

// ── Task Detail Modal ──────────────────────────────────────────────────────────
function TaskDetailModal({
  task, memberMap, chitMap, onClose,
  onPickup, pickupPending,
  onCancel, cancelPending,
}: {
  task: any; memberMap: Record<string, string>; chitMap: Record<string, string>; onClose: () => void;
  onPickup: (id: string) => void; pickupPending: boolean;
  onCancel: (id: string, reason?: string) => void; cancelPending: boolean;
}) {
  const qc = useQueryClient();
  const [editAmount, setEditAmount] = useState(String(task.requestedAmount ?? ''));
  const [editReason, setEditReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedOpen, setReschedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'detail' | 'timeline'>('detail');

  const editMut = useMutation({
    mutationFn: () => updateCashRequest(task.id, { requestedAmount: Number(editAmount), notes: editReason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      setEditOpen(false);
      setEditReason('');
      toast.saved('Amount updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Cannot edit this request'),
  });

  const memberName = memberMap[task.memberId] ?? `Member ${task.memberId?.slice(0, 8)}…`;
  const chitName   = task.chitId ? chitMap[task.chitId] : null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }} numberOfLines={1}>{memberName}</Text>
            {chitName && <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{chitName}</Text>}
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8, marginLeft: 12 }}>
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
          {(['detail', 'timeline'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10,
                backgroundColor: activeTab === tab ? C.navy : C.gray100,
              }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === tab ? C.white : C.gray500 }}>
                {tab === 'detail' ? 'Details' : 'Timeline'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {activeTab === 'detail' ? (
            <>
              {/* Amount + status */}
              <Card style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Amount value={task.requestedAmount} size="lg" />
                  <Badge status={task.status} />
                </View>
                {task.notes && (
                  <Text style={{ fontSize: 13, color: C.gray500, fontStyle: 'italic' }}>"{task.notes}"</Text>
                )}
                {task.adminNotes && (
                  <View style={{ marginTop: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy, marginBottom: 2 }}>ADMIN NOTE</Text>
                    <Text style={{ fontSize: 13, color: C.navy }}>{task.adminNotes}</Text>
                  </View>
                )}
              </Card>

              {/* Edit amount */}
              <TouchableOpacity
                onPress={() => setEditOpen(v => !v)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: editOpen ? '#FFFBEB' : C.gray50,
                  borderRadius: 12, borderBottomLeftRadius: editOpen ? 0 : 12, borderBottomRightRadius: editOpen ? 0 : 12,
                  padding: 14, marginBottom: editOpen ? 0 : 10,
                  borderWidth: 1.5, borderColor: editOpen ? C.amber : C.gray200,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: editOpen ? C.amber : C.gray900 }}>Edit Amount</Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Member changed mind? Update here</Text>
                </View>
                <Text style={{ fontSize: 13, color: editOpen ? C.amber : C.navy, fontWeight: '700' }}>
                  {editOpen ? '▲ Close' : 'Edit →'}
                </Text>
              </TouchableOpacity>

              {editOpen && (
                <View style={{
                  backgroundColor: '#FFFBEB', padding: 14, marginBottom: 10,
                  borderWidth: 1.5, borderTopWidth: 0, borderColor: C.amber,
                  borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.amber, marginBottom: 8 }}>NEW AMOUNT (₹)</Text>
                  <TextInput
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="numeric"
                    placeholder="Enter amount"
                    placeholderTextColor={C.gray400}
                    style={{
                      borderWidth: 1.5, borderColor: C.amber, borderRadius: 8,
                      padding: 10, fontSize: 18, fontWeight: '700', color: C.gray900,
                      backgroundColor: C.white, marginBottom: 8,
                    }}
                  />
                  <TextInput
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="Reason for change (optional)"
                    placeholderTextColor={C.gray400}
                    style={{
                      borderWidth: 1.5, borderColor: C.gray300, borderRadius: 8,
                      padding: 10, fontSize: 14, color: C.gray900,
                      backgroundColor: C.white, marginBottom: 10,
                    }}
                  />
                  <Button
                    label={editMut.isPending ? 'Saving…' : 'Save New Amount'}
                    variant="primary" fullWidth loading={editMut.isPending}
                    disabled={!editAmount || Number(editAmount) <= 0 || Number(editAmount) === Number(task.requestedAmount)}
                    onPress={() => editMut.mutate()}
                  />
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 6, textAlign: 'center' }}>
                    Change is logged in audit trail visible to admin
                  </Text>
                </View>
              )}

              {/* Reschedule */}
              <TouchableOpacity
                onPress={() => setReschedOpen(v => !v)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: reschedOpen ? '#F5F3FF' : C.gray50,
                  borderRadius: 12, borderBottomLeftRadius: reschedOpen ? 0 : 12, borderBottomRightRadius: reschedOpen ? 0 : 12,
                  padding: 14, marginBottom: reschedOpen ? 0 : 10,
                  borderWidth: 1.5, borderColor: reschedOpen ? '#7C3AED' : C.gray200,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: reschedOpen ? '#7C3AED' : C.gray900 }}>Reschedule Visit</Text>
                  {task.scheduledFor && (
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Currently: {fmtDate(task.scheduledFor)}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 13, color: reschedOpen ? '#7C3AED' : C.navy, fontWeight: '700' }}>
                  {reschedOpen ? '▲ Close' : 'Schedule →'}
                </Text>
              </TouchableOpacity>

              {reschedOpen && (
                <View style={{
                  backgroundColor: '#F5F3FF', padding: 14, marginBottom: 10,
                  borderWidth: 1.5, borderTopWidth: 0, borderColor: '#7C3AED',
                  borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED', marginBottom: 8 }}>SCHEDULE DATE (YYYY-MM-DD)</Text>
                  <TextInput
                    value={reschedDate}
                    onChangeText={setReschedDate}
                    placeholder="2026-07-15"
                    placeholderTextColor={C.gray400}
                    style={{
                      borderWidth: 1.5, borderColor: '#7C3AED', borderRadius: 8,
                      padding: 10, fontSize: 16, color: C.gray900,
                      backgroundColor: C.white, marginBottom: 10,
                    }}
                  />
                  <Button
                    label="Set Schedule"
                    variant="primary" fullWidth
                    disabled={!reschedDate || !/^\d{4}-\d{2}-\d{2}$/.test(reschedDate)}
                    onPress={() => {
                      Alert.alert('Reschedule', `Set visit for ${reschedDate}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Confirm',
                          onPress: () => {
                            // rescheduleRequest API call – just invalidates; no mutation state needed here
                            import('../../../services/api').then(({ rescheduleRequest }) => {
                              rescheduleRequest(task.id, reschedDate)
                                .then(() => {
                                  qc.invalidateQueries({ queryKey: ['worker-tasks'] });
                                  setReschedOpen(false);
                                  toast.saved('Visit scheduled');
                                })
                                .catch((e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'));
                            });
                          },
                        },
                      ]);
                    }}
                  />
                </View>
              )}

              {/* Hold to Pick Up — the big button */}
              <View style={{ borderWidth: 1.5, borderColor: C.gray200, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                <View style={{ backgroundColor: C.navy, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.white + 'CC', letterSpacing: 1 }}>CONFIRM CASH PICKUP</Text>
                </View>
                <HoldPickupButton onConfirm={() => onPickup(task.id)} disabled={pickupPending} />
              </View>

              {/* Cancel */}
              <Button
                label="Cancel This Task"
                variant="danger"
                fullWidth
                loading={cancelPending}
                onPress={() => Alert.alert('Cancel Task', 'Cancel and notify admin?', [
                  { text: 'No', style: 'cancel' },
                  { text: 'Cancel Task', style: 'destructive', onPress: () => { onCancel(task.id); onClose(); } },
                ])}
              />
            </>
          ) : (
            <RequestTimeline task={task} />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function WorkerTasksScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [page, setPage] = useState(1);

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['worker-tasks'],
    queryFn: getMyAssignedRequests,
    refetchInterval: 30_000,
  });

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: chits = [] }   = useQuery({ queryKey: ['chits'],   queryFn: getChits });
  const { data: staff = [] }   = useQuery({ queryKey: ['staff'],   queryFn: listStaff, staleTime: 5 * 60_000 });
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['worker-pending-batches'],
    queryFn: getMyPendingBatches,
    refetchInterval: 60_000,
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

  const pickupMut = useMutation({
    mutationFn: (id: string) => markPickedUp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      qc.invalidateQueries({ queryKey: ['worker-history'] });
      toast.collected('Marked as picked up — hand cash to admin');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelByWorker(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      qc.invalidateQueries({ queryKey: ['worker-history'] });
      toast.cancelled('Task cancelled');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  if (isLoading) return <LoadingScreen />;

  const assigned  = (tasks as any[]).filter((t) => t.status === 'ASSIGNED');
  const pickedUp  = (tasks as any[]).filter((t) => t.status === 'PICKED_UP');

  // Holding amount (picked up, not yet remitted)
  const holdingAmt = pickedUp.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);
  // Needed pickup
  const needAmt = assigned.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);
  // Today's pickups (picked up today across all statuses)
  const today = new Date().toDateString();
  const todayTasks = (tasks as any[]).filter((t) =>
    t.pickedUpAt && new Date(t.pickedUpAt).toDateString() === today
  );
  const todayAmt = todayTasks.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);

  // Paginated assigned list
  const pagedAssigned = assigned.slice(0, page * PAGE_SIZE);
  const hasMore = pagedAssigned.length < assigned.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={pagedAssigned}
        keyExtractor={(t: any) => t.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); setPage(1); }} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={T.h1}>My Tasks</Text>
                <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
                  {user?.fullName?.split(' ')[0] ?? 'Worker'}
                </Text>
              </View>
              <ProfileAvatarButton />
            </View>

            {/* Cash ledger cards */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              <View style={{
                flex: 1, borderRadius: 12, padding: 12,
                backgroundColor: holdingAmt > 0 ? '#FFFBEB' : C.gray50,
                borderWidth: 1.5, borderColor: holdingAmt > 0 ? C.amber : C.gray200,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: holdingAmt > 0 ? C.amber : C.gray400, letterSpacing: 0.5, marginBottom: 4 }}>HOLDING</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: holdingAmt > 0 ? C.amber : C.gray400 }}>
                  ₹{holdingAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={{ fontSize: 10, color: holdingAmt > 0 ? '#92400E' : C.gray400, marginTop: 2 }}>
                  {pickedUp.length} with you
                </Text>
              </View>

              <View style={{
                flex: 1, borderRadius: 12, padding: 12,
                backgroundColor: assigned.length > 0 ? C.navy50 : C.gray50,
                borderWidth: 1.5, borderColor: assigned.length > 0 ? C.navy : C.gray200,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: assigned.length > 0 ? C.navy : C.gray400, letterSpacing: 0.5, marginBottom: 4 }}>TO COLLECT</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: assigned.length > 0 ? C.navy : C.gray400 }}>
                  ₹{needAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={{ fontSize: 10, color: assigned.length > 0 ? C.navy + 'AA' : C.gray400, marginTop: 2 }}>
                  {assigned.length} pending
                </Text>
              </View>

              <View style={{
                flex: 1, borderRadius: 12, padding: 12,
                backgroundColor: todayAmt > 0 ? '#F0FDF4' : C.gray50,
                borderWidth: 1.5, borderColor: todayAmt > 0 ? C.green : C.gray200,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: todayAmt > 0 ? C.green : C.gray400, letterSpacing: 0.5, marginBottom: 4 }}>TODAY</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: todayAmt > 0 ? C.green : C.gray400 }}>
                  ₹{todayAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={{ fontSize: 10, color: todayAmt > 0 ? '#166534' : C.gray400, marginTop: 2 }}>
                  {todayTasks.length} picked up
                </Text>
              </View>
            </View>

            {/* Holding — awaiting admin confirmation */}
            {pickedUp.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Awaiting Confirmation ({pickedUp.length})
                </Text>
                {pickedUp.map((t: any) => (
                  <TouchableOpacity key={t.id} activeOpacity={0.75} onPress={() => setSelectedTask(t)}>
                    <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.green }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                            {memberMap[t.memberId] ?? `Member ${t.memberId?.slice(0, 8)}…`}
                          </Text>
                          {t.chitId && chitMap[t.chitId] && (
                            <Text style={{ fontSize: 12, color: C.navy, marginTop: 1 }}>{chitMap[t.chitId]}</Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Amount value={t.requestedAmount} size="sm" color={C.green} />
                          <Badge status="PICKED_UP" />
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: C.green, marginTop: 6 }}>
                        Picked up {fmtDate(t.pickedUpAt)} · Tap to view
                      </Text>
                    </Card>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Pending remittance batches */}
            {(pendingBatches as any[]).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Pending Remittance ({(pendingBatches as any[]).length})
                </Text>
                {(pendingBatches as any[]).map((b: any) => (
                  <Card key={b.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                        {memberMap[b.memberId] ?? `Member ${b.memberId?.slice(0, 8)}…`}
                      </Text>
                      <Amount value={b.amount ?? b.totalAmount ?? 0} size="sm" color={C.amber} />
                    </View>
                    <Text style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Needs remittance to admin</Text>
                  </Card>
                ))}
              </View>
            )}

            {assigned.length > 0 && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                To Collect ({assigned.length})
              </Text>
            )}
            {assigned.length === 0 && pickedUp.length === 0 && (pendingBatches as any[]).length === 0 && (
              <EmptyState title="No tasks assigned" message="Admin will assign cash pickup tasks here." />
            )}
          </>
        }
        ListEmptyComponent={null}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              onPress={() => setPage(p => p + 1)}
              style={{ marginTop: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: C.gray100, borderRadius: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>
                Load More ({assigned.length - pagedAssigned.length} remaining)
              </Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item: t }) => (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setSelectedTask(t)}>
            <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                    {memberMap[t.memberId] ?? `Member ${t.memberId?.slice(0, 8)}…`}
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
                  <Amount value={t.requestedAmount} size="sm" />
                  <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>Tap to collect →</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          memberMap={memberMap}
          chitMap={chitMap}
          onClose={() => setSelectedTask(null)}
          onPickup={(id) => pickupMut.mutate(id)}
          pickupPending={pickupMut.isPending}
          onCancel={(id, reason) => cancelMut.mutate({ id, reason })}
          cancelPending={cancelMut.isPending}
        />
      )}
    </SafeAreaView>
  );
}
