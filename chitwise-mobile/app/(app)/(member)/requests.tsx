import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Alert, Modal, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyRequests, getMyChits, createCashRequest, updateCashRequest, getCashRequestAuditLog, memberApproveCashRequest, getPaymentBatchById, getChit, getDraws, getMyMemberProfile, getMemberBalance } from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, Input, EmptyState, LoadingScreen, ListLoadingScreen, Divider, fmtDateTime, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const STATUS_STEPS = [
  { key: 'PENDING',              label: 'Submitted',           desc: 'Waiting for staff assignment' },
  { key: 'ASSIGNED',             label: 'Staff Assigned',      desc: 'Staff will visit you soon' },
  { key: 'PICKED_UP',            label: 'Cash Picked Up',      desc: 'Awaiting admin confirmation' },
  { key: 'PARTIALLY_COLLECTED',  label: 'Partial Collection',  desc: 'Staff collected partial — your approval needed' },
  { key: 'COLLECTED',            label: 'Payment Confirmed',   desc: 'Account credited' },
];

function RequestTimeline({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);
  if (status === 'CANCELLED') {
    return (
      <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.red }}>Request Cancelled</Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 10 }}>
      {STATUS_STEPS.map((step, i) => {
        const done   = i <= currentIdx;
        const active = i === currentIdx;
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <View key={step.key} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: done ? C.navy : C.gray200,
                borderWidth: 2, borderColor: done ? C.navy : C.gray300,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.white }} />}
              </View>
              {!isLast && <View style={{ width: 2, flex: 1, backgroundColor: done ? C.navy + '40' : C.gray200, marginTop: 2, minHeight: 16 }} />}
            </View>
            <View style={{ paddingBottom: 14, flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: done ? C.gray900 : C.gray400 }}>
                {step.label}
              </Text>
              {active && <Text style={{ fontSize: 12, color: C.navy, marginTop: 2 }}>{step.desc}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function MemberRequestsScreen() {
  const qc = useQueryClient();

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [selectedChitId, setSelectedChitId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Edit
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Audit log
  const [auditTarget, setAuditTarget] = useState<any>(null);

  const { data: requests = [], isLoading: reqLoading, refetch } = useQuery({
    queryKey: ['member-requests'],
    queryFn: getMyRequests,
  });

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: myProfile } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
    staleTime: 5 * 60_000,
  });

  const activeChits = (chits as any[]).filter((c: any) => ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(c.status));

  // Fetch balances for ALL chits in parallel once profile + chit list are ready
  const balanceResults = useQueries({
    queries: activeChits.map((c: any) => ({
      queryKey: ['member-balance-for-pickup', myProfile?.id, c.id],
      queryFn: () => getMemberBalance(myProfile!.id, c.id),
      enabled: !!myProfile?.id,
      staleTime: 30_000,
    })),
  });
  const balanceMap: Record<string, number | null> = Object.fromEntries(
    activeChits.map((c: any, i: number) => [
      c.id,
      balanceResults[i]?.data?.totalOutstanding != null ? Number(balanceResults[i].data.totalOutstanding) : null,
    ])
  );
  const outstanding = selectedChitId ? (balanceMap[selectedChitId] ?? null) : null;
  const balanceFetching = balanceResults.some((r) => r.isFetching);

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['member-request-audit', auditTarget?.id],
    queryFn: () => getCashRequestAuditLog(auditTarget.id),
    enabled: !!auditTarget,
  });

  const createMut = useMutation({
    mutationFn: () => createCashRequest(selectedChitId, Number(amount), notes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-requests'] });
      setShowCreate(false);
      setSelectedChitId(''); setAmount(''); setNotes('');
      toast.submitted('Cash pickup request submitted');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed to submit request.'),
  });

  const editMut = useMutation({
    mutationFn: () => updateCashRequest(editTarget.id, {
      requestedAmount: Number(editAmount),
      notes: editNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-requests'] });
      setEditTarget(null); setEditAmount(''); setEditNotes('');
      toast.saved('Request updated');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed to update request.'),
  });

  const [rejectReason, setRejectReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  // Receipt (transaction detail) for COLLECTED requests
  const [receiptTarget, setReceiptTarget] = useState<any>(null);
  const { data: receiptBatch, isLoading: receiptLoading } = useQuery({
    queryKey: ['batch', receiptTarget?.collectedBatchId],
    queryFn: () => getPaymentBatchById(receiptTarget.collectedBatchId),
    enabled: !!receiptTarget?.collectedBatchId,
  });
  const { data: receiptChit } = useQuery({
    queryKey: ['chit', receiptBatch?.chitId],
    queryFn: () => getChit(receiptBatch.chitId),
    enabled: !!receiptBatch?.chitId,
  });
  const { data: receiptDraws = [] } = useQuery({
    queryKey: ['draws', receiptBatch?.chitId],
    queryFn: () => getDraws(receiptBatch.chitId),
    enabled: !!receiptBatch?.chitId,
  });

  const approveMut = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
      memberApproveCashRequest(id, approved, reason),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['member-requests'] });
      setRejectTarget(null); setRejectReason('');
      toast.saved(vars.approved ? 'Approved — admin will review and collect the payment' : 'Rejected — admin will arrange a new pickup');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const activeRequests = (requests as any[]).filter((r: any) => ['PENDING', 'ASSIGNED', 'PICKED_UP', 'PARTIALLY_COLLECTED'].includes(r.status));
  const isLoading = reqLoading || chitsLoading;

  function onNewRequest() {
    if (activeRequests.length > 0) {
      Alert.alert(
        'Active Request Exists',
        `You already have ${activeRequests.length} active cash pickup request${activeRequests.length > 1 ? 's' : ''}. Do you want to create another one?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Anyway', onPress: () => setShowCreate(true) },
        ]
      );
    } else {
      setShowCreate(true);
    }
  }

  if (isLoading) return <ListLoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={requests as any[]}
        keyExtractor={(r: any) => r.id}
        refreshControl={<RefreshControl refreshing={reqLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={T.h1}>Requests</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Button label="+ New" variant="primary" size="sm" onPress={onNewRequest} />
                <ProfileAvatarButton size={34} />
              </View>
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{(requests as any[]).length} requests</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No requests yet" message="Request a cash pickup and a staff member will collect from you." />
        }
        renderItem={({ item: r }) => {
          const canEdit = r.status === 'PENDING' || r.status === 'ASSIGNED';
          const needsApproval = r.status === 'PARTIALLY_COLLECTED';
          return (
            <Card style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <Amount value={r.collectedAmount ?? r.requestedAmount} size="sm" />
                <Badge status={r.status} />
              </View>
              {r.collectedAmount && r.collectedAmount !== r.requestedAmount && (
                <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 2 }}>
                  Requested: ₹{Number(r.requestedAmount).toLocaleString('en-IN')}
                </Text>
              )}
              <Text style={{ fontSize: 12, color: C.gray400 }}>Requested {fmtDate(r.requestedAt)}</Text>
              {r.notes && <Text style={{ fontSize: 12, color: C.gray600, fontStyle: 'italic', marginTop: 4 }}>"{r.notes}"</Text>}

              <RequestTimeline status={r.status} />

              {needsApproval && (
                <View style={{ marginTop: 8, backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#F97316' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#C2410C', marginBottom: 4 }}>Action Required</Text>
                  <Text style={{ fontSize: 13, color: C.gray700, marginBottom: 2 }}>
                    Staff collected{r.collectedAmount ? ` ₹${Number(r.collectedAmount).toLocaleString('en-IN')}` : ' a partial amount'} of your requested ₹{Number(r.requestedAmount).toLocaleString('en-IN')}.
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 12 }}>
                    Approve to accept this amount, or reject and request a new pickup.
                  </Text>
                  {rejectTarget === r.id ? (
                    <>
                      <TextInput
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        placeholder="Reason for rejection (optional)"
                        placeholderTextColor={C.gray400}
                        style={{
                          borderWidth: 1.5, borderColor: C.gray300, borderRadius: 8,
                          padding: 10, fontSize: 13, color: C.gray900,
                          backgroundColor: C.white, marginBottom: 10,
                        }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gray100, alignItems: 'center' }}
                          onPress={() => { setRejectTarget(null); setRejectReason(''); }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center' }}
                          onPress={() => approveMut.mutate({ id: r.id, approved: false, reason: rejectReason || undefined })}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>Confirm Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: C.green, alignItems: 'center' }}
                        onPress={() => approveMut.mutate({ id: r.id, approved: true })}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>✓ Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#EF4444', alignItems: 'center' }}
                        onPress={() => setRejectTarget(r.id)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              <Divider />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setAuditTarget(r)}>
                  <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600', textAlign: 'center' }}>View Full Log →</Text>
                </TouchableOpacity>
                {r.status === 'COLLECTED' && r.collectedBatchId && (
                  <TouchableOpacity
                    onPress={() => setReceiptTarget(r)}
                    style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: C.navy50, borderWidth: 1.5, borderColor: C.navy }}
                  >
                    <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600' }}>Receipt →</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => { setEditTarget(r); setEditAmount(String(r.requestedAmount)); setEditNotes(r.notes ?? ''); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, borderColor: C.navy }}
                  >
                    <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600' }}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Create Request Modal */}
      <Modal visible={showCreate} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 20 }}>Request Cash Pickup</Text>

            <Text style={T.label}>Select Chit Fund</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {activeChits.map((c: any) => {
                  const bal = balanceMap[c.id];
                  const isSelected = selectedChitId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setSelectedChitId(c.id); setAmount(''); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                        borderWidth: 2, borderColor: isSelected ? C.navy : C.gray300,
                        backgroundColor: isSelected ? C.navy50 : C.white,
                        minWidth: 110,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? C.navy : C.gray700 }}>
                        {c.name}
                      </Text>
                      {c.status !== 'ACTIVE' && (
                        <Text style={{ fontSize: 10, color: C.gray400, marginTop: 1 }}>
                          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                        </Text>
                      )}
                      {bal === null ? (
                        <Text style={{ fontSize: 10, color: C.gray300, marginTop: 3 }}>loading…</Text>
                      ) : bal > 0 ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626', marginTop: 3 }}>
                          ₹{bal.toLocaleString('en-IN')} due
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#16A34A', marginTop: 3 }}>No dues</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Input label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={outstanding != null && outstanding > 0 ? `e.g. ${outstanding}` : 'Enter amount'} />
            {outstanding != null && outstanding > 0 && (
              <TouchableOpacity
                onPress={() => setAmount(String(outstanding))}
                style={{ marginTop: 6, marginBottom: 4 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>
                  Fill ₹{outstanding.toLocaleString('en-IN')} due →
                </Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 12 }} />
            <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any instructions…" multiline />

            <View style={{ height: 20 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={() => setShowCreate(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Submit"
                  variant="primary"
                  disabled={!selectedChitId || !amount || Number(amount) <= 0}
                  loading={createMut.isPending}
                  onPress={() => createMut.mutate()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Request Modal */}
      <Modal visible={!!editTarget} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 6 }}>Edit Cash Pickup</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 20 }}>
              Editing is allowed before pickup. All changes are logged in audit.
            </Text>

            <Input
              label="Amount (₹)"
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="Enter amount"
            />
            <View style={{ height: 12 }} />
            <Input
              label="Notes (optional)"
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Any instructions…"
              multiline
            />

            <View style={{ height: 20 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={() => { setEditTarget(null); setEditAmount(''); setEditNotes(''); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Save Changes"
                  variant="primary"
                  disabled={!editAmount || Number(editAmount) <= 0}
                  loading={editMut.isPending}
                  onPress={() => editMut.mutate()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <Modal visible={!!receiptTarget} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Payment Receipt</Text>
              <TouchableOpacity onPress={() => setReceiptTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {receiptLoading ? (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
            ) : receiptBatch ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ backgroundColor: '#F0F4FA', borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: C.gray500, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 }}>AMOUNT PAID</Text>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: C.navy }}>
                    ₹{Number(receiptBatch.totalAmount ?? 0).toLocaleString('en-IN')}
                  </Text>
                  <View style={{ marginTop: 8, backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
                      {receiptBatch.status === 'COMPLETED' ? '✓ Confirmed' : receiptBatch.status === 'AWAITING_REMITTANCE' ? 'Processing' : receiptBatch.status}
                    </Text>
                  </View>
                </View>

                {[
                  receiptChit?.name && { label: 'Chit Fund', value: receiptChit.name },
                  receiptBatch.allocations?.length > 0 && {
                    label: 'Draw(s)',
                    value: (() => {
                      const drawByMonth = Object.fromEntries((receiptDraws as any[]).map((d: any) => [d.monthNumber, d]));
                      return receiptBatch.allocations.map((a: any) => {
                        const draw = drawByMonth[a.monthNumber];
                        const d = draw?.drawDate ? new Date(draw.drawDate) : null;
                        const month = d ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null;
                        return month ? `Draw #${a.monthNumber} · ${month}` : `Draw #${a.monthNumber}`;
                      }).join('\n');
                    })(),
                  },
                  receiptBatch.paymentMode && { label: 'Mode', value: receiptBatch.paymentMode.replace('_', ' ') },
                  (receiptBatch.remittedAt || receiptBatch.collectedAt || receiptBatch.createdAt) && {
                    label: 'Date',
                    value: new Date(receiptBatch.remittedAt ?? receiptBatch.collectedAt ?? receiptBatch.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  },
                ].filter(Boolean).map((row: any) => (
                  <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                    <Text style={{ fontSize: 13, color: C.gray500, fontWeight: '500' }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 }}>{row.value}</Text>
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </ScrollView>
            ) : (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Receipt not available</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Audit Log Modal */}
      <Modal visible={!!auditTarget} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Activity Log</Text>
              <TouchableOpacity onPress={() => setAuditTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {auditLoading ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
              ) : (auditLog as any[]).length === 0 ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No entries yet</Text>
              ) : (
                (auditLog as any[]).map((entry: any, i: number) => (
                  <View key={entry.id ?? i} style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: entry.action === 'PICKUP_VOIDED' || entry.action === 'CANCELLED' ? C.red
                          : entry.action === 'EDITED' ? C.amber : C.navy,
                        marginTop: 4,
                      }} />
                      {i < (auditLog as any[]).length - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 4 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                        {entry.action.replace(/_/g, ' ')}
                      </Text>
                      {entry.reason && (
                        <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic' }}>"{entry.reason}"</Text>
                      )}
                      {entry.previousValue && (
                        <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                          Before: {entry.previousValue}
                        </Text>
                      )}
                      {entry.newValue && (
                        <Text style={{ fontSize: 11, color: C.navy, marginTop: 1 }}>
                          After: {entry.newValue}
                        </Text>
                      )}
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{fmtDateTime(entry.performedAt)}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
