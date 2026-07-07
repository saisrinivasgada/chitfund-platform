import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Alert, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyRequests, getMyChits, createCashRequest, updateCashRequest, getCashRequestAuditLog } from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, Input, EmptyState, LoadingScreen, Divider, fmtDateTime, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const STATUS_STEPS = [
  { key: 'PENDING',   label: 'Submitted',        desc: 'Waiting for worker assignment' },
  { key: 'ASSIGNED',  label: 'Worker Assigned',   desc: 'Worker will visit you soon' },
  { key: 'PICKED_UP', label: 'Cash Picked Up',    desc: 'Awaiting admin confirmation' },
  { key: 'COLLECTED', label: 'Payment Confirmed', desc: 'Account credited' },
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

  const activeChits = (chits as any[]).filter((c: any) => c.status === 'ACTIVE' || c.status === 'PAUSED');
  const activeRequests = (requests as any[]).filter((r: any) => ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(r.status));
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

  if (isLoading) return <LoadingScreen />;

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
          <EmptyState title="No requests yet" message="Request a cash pickup and a worker will collect from you." />
        }
        renderItem={({ item: r }) => {
          const canEdit = r.status === 'PENDING' || r.status === 'ASSIGNED';
          return (
            <Card style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <Amount value={r.requestedAmount} size="sm" />
                <Badge status={r.status} />
              </View>
              <Text style={{ fontSize: 12, color: C.gray400 }}>Requested {fmtDate(r.requestedAt)}</Text>
              {r.notes && <Text style={{ fontSize: 12, color: C.gray600, fontStyle: 'italic', marginTop: 4 }}>"{r.notes}"</Text>}

              <RequestTimeline status={r.status} />

              <Divider />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setAuditTarget(r)}>
                  <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600', textAlign: 'center' }}>View Full Log →</Text>
                </TouchableOpacity>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {activeChits.map((c: any) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => { setSelectedChitId(c.id); setAmount(c.installmentAmount ? String(c.installmentAmount) : ''); }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                      borderWidth: 2, borderColor: selectedChitId === c.id ? C.navy : C.gray300,
                      backgroundColor: selectedChitId === c.id ? C.navy50 : C.white,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: selectedChitId === c.id ? C.navy : C.gray700 }}>
                      {c.name}
                    </Text>
                    {c.installmentAmount && (
                      <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>
                        ₹{Number(c.installmentAmount).toLocaleString('en-IN')}/draw
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Input label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Enter amount" />
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
