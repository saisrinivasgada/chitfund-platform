import { useState } from 'react';
import {
  View, Text, ScrollView, FlatList, RefreshControl, Alert, TextInput,
  Modal, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getMyAssignedRequests, getMyStaffHistory, getMyPendingBatches,
  markPickedUp, cancelByStaff, partiallyCollectCashRequest, rescheduleRequest,
  getMembers, getChits, listStaff,
} from '../../../services/api';
import {
  C, T, Card, Badge, Button, Amount, EmptyState, ListLoadingScreen, fmtDate, fmtDateTime,
} from '../../../components/ui';
import { toast } from '../../../components/Toast';

type Tab = 'pickups' | 'history';

// ── Pickup trail ──────────────────────────────────────────────────────────────
function PickupTrailModal({ request, memberName, chitName, onClose }: {
  request: any; memberName: string; chitName?: string; onClose: () => void;
}) {
  const steps = [
    { key: 'requested', label: 'Pickup Initiated', sub: 'Request created',
      time: request.requestedAt ?? request.createdAt, done: true, color: C.navy },
    { key: 'assigned', label: 'Assigned to You',
      sub: request.assignedAt ? 'You were assigned' : 'Waiting for assignment',
      time: request.assignedAt, done: !!request.assignedAt, color: C.amber },
    { key: 'picked_up', label: 'Picked Up from Member',
      sub: request.pickedUpAt ? 'You confirmed physical pickup' : 'Not yet picked up',
      time: request.pickedUpAt, done: !!request.pickedUpAt, color: C.green },
    { key: 'collected', label: 'Handed to Admin',
      sub: request.status === 'COLLECTED'
        ? 'Admin confirmed receipt — payment credited'
        : request.status === 'CANCELLED' ? 'Task was cancelled' : 'Awaiting admin confirmation',
      time: request.status === 'COLLECTED' ? (request.collectedAt ?? request.updatedAt) : null,
      done: request.status === 'COLLECTED', color: C.navy },
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={T.h2} numberOfLines={1}>Cash Pickup Trail</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }} numberOfLines={1}>
              {memberName}{chitName ? ` · ${chitName}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8, marginLeft: 12 }}>
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Card style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Amount value={request.collectedAmount ?? request.requestedAmount ?? 0} size="lg" />
              <Badge status={request.status} />
            </View>
          </Card>

          {steps.map((step, i) => (
            <View key={step.key} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: step.done ? step.color + '20' : C.gray100,
                  borderWidth: 2, borderColor: step.done ? step.color : C.gray300,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 12, color: step.done ? step.color : C.gray400 }}>
                    {step.done ? '✓' : '○'}
                  </Text>
                </View>
                {i < steps.length - 1 && (
                  <View style={{
                    width: 2, flex: 1, minHeight: 26, marginVertical: 3,
                    backgroundColor: step.done ? step.color : C.gray200,
                  }} />
                )}
              </View>
              <View style={{ flex: 1, paddingBottom: i === steps.length - 1 ? 4 : 18 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: step.done ? C.gray900 : C.gray400 }}>
                  {step.label}
                </Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{step.sub}</Text>
                {!!step.time && (
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>{fmtDateTime(step.time)}</Text>
                )}
              </View>
            </View>
          ))}

          {!!request.notes && (
            <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ ...T.label, marginBottom: 4 }}>NOTES</Text>
              <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{request.notes}"</Text>
            </View>
          )}
          {!!request.adminNotes && (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.amber, letterSpacing: 0.5, marginBottom: 4 }}>ADMIN NOTE</Text>
              <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{request.adminNotes}"</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Action sheet for a single assigned pickup ─────────────────────────────────
function PickupActionsModal({ task, memberName, chitName, onClose }: {
  task: any; memberName: string; chitName?: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['manager-pickups'] });
    qc.invalidateQueries({ queryKey: ['manager-pickup-history'] });
  }

  const pickupMut = useMutation({
    mutationFn: () => markPickedUp(task.id),
    onSuccess: () => {
      invalidate();
      toast.collected('Marked as picked up — hand the cash to admin');
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to mark as picked up'),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelByStaff(task.id, 'Member not available'),
    onSuccess: () => {
      invalidate();
      toast.cancelled('Task cancelled — admin has been notified');
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Cancel failed'),
  });

  const partialMut = useMutation({
    mutationFn: () => partiallyCollectCashRequest(task.id, Number(partialAmount)),
    onSuccess: () => {
      invalidate();
      toast.saved('Partial collection submitted — member must approve');
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const reschedMut = useMutation({
    mutationFn: (iso: string) => rescheduleRequest(task.id, iso),
    onSuccess: () => {
      invalidate();
      toast.saved('Rescheduled — admin has been notified');
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Reschedule failed'),
  });

  function reschedule(label: string, days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().slice(0, 10);
    Alert.alert('Reschedule', `Move this visit to ${label.toLowerCase()} (${iso})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => reschedMut.mutate(iso) },
    ]);
  }

  const requested = Number(task.requestedAmount ?? 0);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={T.h2} numberOfLines={1}>{memberName}</Text>
              {!!chitName && <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{chitName}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8, marginLeft: 12 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Card style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Amount value={requested} size="lg" />
                <Badge status={task.status} />
              </View>
              {!!task.notes && (
                <Text style={{ fontSize: 13, color: C.gray500, fontStyle: 'italic', marginTop: 8 }}>"{task.notes}"</Text>
              )}
              {!!task.adminNotes && (
                <View style={{ marginTop: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy, marginBottom: 2 }}>ADMIN NOTE</Text>
                  <Text style={{ fontSize: 13, color: C.navy }}>{task.adminNotes}</Text>
                </View>
              )}
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 8 }}>
                Assigned {fmtDate(task.assignedAt ?? task.createdAt)}
                {task.scheduledFor ? ` · Visit: ${fmtDate(task.scheduledFor)}` : ''}
              </Text>
            </Card>

            {/* Mark picked up */}
            <Button
              label={pickupMut.isPending ? 'Confirming…' : 'Mark Picked Up'}
              variant="primary"
              fullWidth
              loading={pickupMut.isPending}
              onPress={() => Alert.alert(
                'Confirm Cash Pickup',
                `Confirm you physically collected ₹${requested.toLocaleString('en-IN')} from ${memberName}? Hand the cash to admin next.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: "Yes, I Picked It Up", onPress: () => pickupMut.mutate() },
                ]
              )}
            />

            {/* Partial collection */}
            <TouchableOpacity
              onPress={() => setPartialOpen((v) => !v)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: partialOpen ? '#F0FDFA' : C.gray50,
                borderRadius: 12,
                borderBottomLeftRadius: partialOpen ? 0 : 12, borderBottomRightRadius: partialOpen ? 0 : 12,
                padding: 14, marginTop: 14, marginBottom: partialOpen ? 0 : 10,
                borderWidth: 1.5, borderColor: partialOpen ? '#0D9488' : C.gray200,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: partialOpen ? '#0D9488' : C.gray900 }}>
                  Partial Collection
                </Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Collected less than the full amount?</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: partialOpen ? '#0D9488' : C.navy }}>
                {partialOpen ? '▲ Close' : 'Partial →'}
              </Text>
            </TouchableOpacity>

            {partialOpen && (
              <View style={{
                backgroundColor: '#F0FDFA', padding: 14, marginBottom: 10,
                borderWidth: 1.5, borderTopWidth: 0, borderColor: '#0D9488',
                borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D9488', marginBottom: 4 }}>AMOUNT COLLECTED (₹)</Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 8 }}>
                  The member will be asked to approve this partial amount.
                </Text>
                <TextInput
                  value={partialAmount}
                  onChangeText={setPartialAmount}
                  keyboardType="numeric"
                  placeholder={`Less than ₹${requested.toLocaleString('en-IN')}`}
                  placeholderTextColor={C.gray400}
                  style={{
                    borderWidth: 1.5, borderColor: '#0D9488', borderRadius: 8,
                    padding: 10, fontSize: 18, fontWeight: '700', color: C.gray900,
                    backgroundColor: C.white, marginBottom: 10,
                  }}
                />
                <Button
                  label={partialMut.isPending ? 'Submitting…' : 'Submit Partial Collection'}
                  variant="primary"
                  fullWidth
                  loading={partialMut.isPending}
                  disabled={!partialAmount || Number(partialAmount) <= 0 || Number(partialAmount) >= requested}
                  onPress={() => partialMut.mutate()}
                />
              </View>
            )}

            {/* Can't go today */}
            <Text style={{ ...T.label, marginTop: 8, marginBottom: 8 }}>CAN'T COLLECT TODAY?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {[{ label: 'Tomorrow', days: 1 }, { label: 'Next Week', days: 7 }].map(({ label, days }) => (
                <TouchableOpacity
                  key={label}
                  disabled={reschedMut.isPending}
                  onPress={() => reschedule(label, days)}
                  style={{
                    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.navy,
                    opacity: reschedMut.isPending ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              label={cancelMut.isPending ? 'Cancelling…' : 'Cancel Task'}
              variant="danger"
              fullWidth
              loading={cancelMut.isPending}
              onPress={() => Alert.alert(
                'Cancel Task',
                'Member not available? This cancels the pickup and notifies the admin.',
                [
                  { text: 'Keep Task', style: 'cancel' },
                  { text: 'Cancel Task', style: 'destructive', onPress: () => cancelMut.mutate() },
                ]
              )}
            />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ManagerPickupsScreen() {
  const [tab, setTab] = useState<Tab>('pickups');
  const [actionTask, setActionTask] = useState<any>(null);
  const [trail, setTrail] = useState<any>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['manager-pickups'],
    queryFn: getMyAssignedRequests,
    refetchInterval: 30_000,
  });
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['manager-pickup-history'],
    queryFn: getMyStaffHistory,
  });
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['manager-pending-batches'],
    queryFn: getMyPendingBatches,
    refetchInterval: 60_000,
  });

  const { data: members = [] } = useQuery({ queryKey: ['members', 'all'], queryFn: () => getMembers() });
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff, staleTime: 5 * 60_000 });

  const memberMap: Record<string, string> = {};
  (staff as any[]).forEach((s: any) => { memberMap[s.id] = s.fullName ?? s.username ?? s.id.slice(0, 8); });
  (members as any[]).forEach((m: any) => {
    const name = m.fullName ?? m.name ?? m.id.slice(0, 8);
    memberMap[m.id] = name;
    if (m.userId) memberMap[m.userId] = name;
  });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  const nameOf = (id?: string) => memberMap[id ?? ''] ?? `Member ${id?.slice(0, 8)}…`;

  const assigned = (tasks as any[]).filter((t) => t.status === 'ASSIGNED');
  const pickedUp = (tasks as any[]).filter((t) => t.status === 'PICKED_UP');
  const partial = (tasks as any[]).filter((t) => t.status === 'PARTIALLY_COLLECTED');

  const cashInHand = pickedUp.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0)
    + partial.reduce((s: number, t: any) => s + Number(t.collectedAmount ?? 0), 0);
  const toCollect = assigned.reduce((s: number, t: any) => s + Number(t.requestedAmount ?? 0), 0);

  if (isLoading) return <ListLoadingScreen />;

  const listData = tab === 'pickups' ? assigned : (history as any[]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: 12 }}>
        {([
          { key: 'pickups' as Tab, label: `Active Pickups${assigned.length ? ` (${assigned.length})` : ''}` },
          { key: 'history' as Tab, label: 'Collection History' },
        ]).map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              paddingHorizontal: 14, paddingVertical: 12, marginRight: 4,
              borderBottomWidth: 2, borderBottomColor: tab === t.key ? C.navy : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? C.navy : C.gray400 }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(t: any) => t.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); refetchHistory(); }} tintColor={C.navy} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          tab === 'pickups' ? (
            <>
              {/* Cash ledger */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                <View style={{
                  flex: 1, borderRadius: 12, padding: 12,
                  backgroundColor: cashInHand > 0 ? '#FFFBEB' : C.gray50,
                  borderWidth: 1.5, borderColor: cashInHand > 0 ? C.amber : C.gray200,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cashInHand > 0 ? C.amber : C.gray400 }}>
                    CASH IN HAND
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', marginTop: 4, color: cashInHand > 0 ? C.amber : C.gray400 }}>
                    ₹{cashInHand.toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 10, color: cashInHand > 0 ? '#92400E' : C.gray400, marginTop: 2 }}>
                    {pickedUp.length + partial.length} with you
                  </Text>
                </View>
                <View style={{
                  flex: 1, borderRadius: 12, padding: 12,
                  backgroundColor: assigned.length > 0 ? C.navy50 : C.gray50,
                  borderWidth: 1.5, borderColor: assigned.length > 0 ? C.navy : C.gray200,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: assigned.length > 0 ? C.navy : C.gray400 }}>
                    TO COLLECT
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', marginTop: 4, color: assigned.length > 0 ? C.navy : C.gray400 }}>
                    ₹{toCollect.toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 10, color: assigned.length > 0 ? C.navy + 'AA' : C.gray400, marginTop: 2 }}>
                    {assigned.length} pending
                  </Text>
                </View>
              </View>

              {/* Awaiting admin confirmation */}
              {pickedUp.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ ...T.label, marginBottom: 8 }}>AWAITING CONFIRMATION ({pickedUp.length})</Text>
                  {pickedUp.map((t: any) => (
                    <TouchableOpacity key={t.id} activeOpacity={0.75} onPress={() => setTrail(t)}>
                      <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.green }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{nameOf(t.memberId)}</Text>
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
                          Picked up {fmtDate(t.pickedUpAt)} · Tap to view trail
                        </Text>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Partial — admin follow-up */}
              {partial.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber, letterSpacing: 0.5, marginBottom: 8 }}>
                    PARTIAL — ADMIN FOLLOW-UP ({partial.length})
                  </Text>
                  {partial.map((t: any) => (
                    <TouchableOpacity key={t.id} activeOpacity={0.75} onPress={() => setTrail(t)}>
                      <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{nameOf(t.memberId)}</Text>
                            {t.chitId && chitMap[t.chitId] && (
                              <Text style={{ fontSize: 12, color: C.navy, marginTop: 1 }}>{chitMap[t.chitId]}</Text>
                            )}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Amount value={t.collectedAmount ?? t.requestedAmount} size="sm" color={C.amber} />
                            <Text style={{ fontSize: 10, color: C.gray400 }}>
                              of ₹{Number(t.requestedAmount).toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Pending remittance batches */}
              {(pendingBatches as any[]).length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber, letterSpacing: 0.5, marginBottom: 8 }}>
                    PENDING REMITTANCE ({(pendingBatches as any[]).length})
                  </Text>
                  {(pendingBatches as any[]).map((b: any) => (
                    <Card key={b.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{nameOf(b.memberId)}</Text>
                        <Amount value={b.totalAmount ?? b.amount ?? 0} size="sm" color={C.amber} />
                      </View>
                      <Text style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
                        Cash collected — awaiting admin to confirm receipt
                      </Text>
                    </Card>
                  ))}
                </View>
              )}

              {assigned.length > 0 && (
                <Text style={{ ...T.label, marginBottom: 8 }}>TO COLLECT ({assigned.length})</Text>
              )}
            </>
          ) : null
        }
        ListEmptyComponent={
          tab === 'pickups'
            ? (pickedUp.length === 0 && partial.length === 0 && (pendingBatches as any[]).length === 0
                ? <EmptyState title="No active pickups" message="Cash pickups assigned to you appear here." />
                : null)
            : <EmptyState title="No collection history" message="Completed and cancelled pickups appear here." />
        }
        renderItem={({ item: t }) =>
          tab === 'pickups' ? (
            <TouchableOpacity activeOpacity={0.75} onPress={() => setActionTask(t)}>
              <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{nameOf(t.memberId)}</Text>
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
          ) : (
            <TouchableOpacity activeOpacity={0.75} onPress={() => setTrail(t)}>
              <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: t.status === 'COLLECTED' ? C.green : C.gray300 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{nameOf(t.memberId)}</Text>
                  <Badge status={t.status} />
                </View>
                {t.chitId && chitMap[t.chitId] && (
                  <Text style={{ fontSize: 12, color: C.navy, marginBottom: 4 }}>{chitMap[t.chitId]}</Text>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Amount value={t.collectedAmount ?? t.requestedAmount} size="sm" />
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(t.collectedAt ?? t.updatedAt)}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          )
        }
      />

      {actionTask && (
        <PickupActionsModal
          task={actionTask}
          memberName={nameOf(actionTask.memberId)}
          chitName={actionTask.chitId ? chitMap[actionTask.chitId] : undefined}
          onClose={() => setActionTask(null)}
        />
      )}

      {trail && (
        <PickupTrailModal
          request={trail}
          memberName={nameOf(trail.memberId)}
          chitName={trail.chitId ? chitMap[trail.chitId] : undefined}
          onClose={() => setTrail(null)}
        />
      )}
    </SafeAreaView>
  );
}
