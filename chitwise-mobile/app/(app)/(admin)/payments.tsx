import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TextInput, Modal, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getActiveCashRequests, collectForRequest, voidCashPickup,
  cancelCashRequest, getCashRequestAuditLog,
} from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, fmtDateTime, EmptyState, LoadingScreen, SectionHeader, Divider } from '../../../components/ui';

const STATUS_ORDER = { PICKED_UP: 0, PENDING: 1, ASSIGNED: 2 };

export default function AdminPaymentsScreen() {
  const qc = useQueryClient();
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [auditTarget, setAuditTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-cash-requests'],
    queryFn: getActiveCashRequests,
    refetchInterval: 30_000,
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['mobile-cash-audit', auditTarget?.id],
    queryFn: () => getCashRequestAuditLog(auditTarget.id),
    enabled: !!auditTarget,
  });

  const collectMut = useMutation({
    mutationFn: (id: string) => collectForRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-cash-requests'] });
      Alert.alert('Success', 'Cash collected — member account credited');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidCashPickup(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-cash-requests'] });
      qc.invalidateQueries({ queryKey: ['mobile-cash-audit'] });
      setVoidTarget(null);
      setVoidReason('');
      Alert.alert('Done', 'Pickup voided — reverted to Assigned');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelCashRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-cash-requests'] }),
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const sorted = [...(requests as any[])].sort((a, b) =>
    (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 9) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 9)
  );

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <Text style={[T.h1, { marginBottom: 4 }]}>Cash Requests</Text>
        <Text style={[T.sm, { marginBottom: 20 }]}>{sorted.length} active requests</Text>

        {sorted.length === 0 ? (
          <EmptyState title="No active requests" message="All cash pickups are done or no requests yet." />
        ) : (
          sorted.map((r: any) => (
            <Card key={r.id} style={{ marginBottom: 12 }}>
              {/* Header row */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    Member {r.memberId?.slice(0, 8)}…
                  </Text>
                  <Amount value={r.requestedAmount} size="sm" />
                </View>
                <Badge status={r.status} />
              </View>

              {/* Details */}
              {r.assignedWorkerId && (
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  Worker: {r.assignedWorkerId.slice(0, 8)}…
                </Text>
              )}
              {r.pickedUpAt && (
                <Text style={{ fontSize: 12, color: C.green, marginTop: 2 }}>
                  Picked up: {fmtDateTime(r.pickedUpAt)}
                </Text>
              )}
              {r.notes && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2, fontStyle: 'italic' }}>"{r.notes}"</Text>}

              <Divider />

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {r.status === 'PICKED_UP' && (
                  <>
                    <Button
                      label="Collect"
                      variant="success"
                      size="sm"
                      onPress={() => Alert.alert(
                        'Confirm Collection',
                        `Confirm you received ₹${Number(r.requestedAmount).toLocaleString('en-IN')} from worker?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Confirm', onPress: () => collectMut.mutate(r.id) },
                        ]
                      )}
                      loading={collectMut.isPending}
                    />
                    <Button
                      label="Void Pickup"
                      variant="danger"
                      size="sm"
                      onPress={() => { setVoidTarget(r); setVoidReason(''); }}
                    />
                  </>
                )}
                {(r.status === 'PENDING' || r.status === 'ASSIGNED') && (
                  <Button
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    onPress={() => Alert.alert('Cancel Request', 'Cancel this cash pickup?', [
                      { text: 'No', style: 'cancel' },
                      { text: 'Cancel Request', style: 'destructive', onPress: () => cancelMut.mutate(r.id) },
                    ])}
                  />
                )}
                <Button
                  label="Audit Log"
                  variant="outline"
                  size="sm"
                  onPress={() => setAuditTarget(r)}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Void Pickup Modal */}
      <Modal visible={!!voidTarget} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.red, marginBottom: 8 }}>Void Pickup</Text>
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: C.red, fontWeight: '600' }}>
                This will undo the worker's pickup mark.
              </Text>
              <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>
                Request reverts to Assigned — same worker must re-collect and re-mark.
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>
              Reason (required — saved in audit log)
            </Text>
            <TextInput
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="e.g. Worker marked wrong member by mistake"
              placeholderTextColor={C.gray400}
              multiline
              style={{
                borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10,
                padding: 12, fontSize: 14, color: C.gray900, minHeight: 80,
                textAlignVertical: 'top', marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" size="md" onPress={() => setVoidTarget(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Void Pickup"
                  variant="danger"
                  size="md"
                  disabled={!voidReason.trim()}
                  loading={voidMut.isPending}
                  onPress={() => voidMut.mutate({ id: voidTarget.id, reason: voidReason })}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Audit Log Modal */}
      <Modal visible={!!auditTarget} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Audit Trail</Text>
              <TouchableOpacity onPress={() => setAuditTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {auditLoading ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
              ) : (auditLog as any[]).length === 0 ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No audit entries yet</Text>
              ) : (
                (auditLog as any[]).map((entry: any, i: number) => (
                  <View key={entry.id} style={{ flexDirection: 'row', marginBottom: 16 }}>
                    <View style={{ alignItems: 'center', marginRight: 12 }}>
                      <View style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: entry.action === 'PICKUP_VOIDED' ? C.red
                          : entry.action === 'COLLECTED' ? C.navy
                          : entry.action === 'PICKED_UP' ? C.green
                          : C.amber,
                        marginTop: 4,
                      }} />
                      {i < (auditLog as any[]).length - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 4 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                        {entry.action.replace(/_/g, ' ')}
                      </Text>
                      {entry.performedByRole && (
                        <Text style={{ fontSize: 12, color: C.gray500 }}>
                          By {entry.performedByRole}
                          {entry.fromStatus && ` · ${entry.fromStatus} → ${entry.toStatus}`}
                        </Text>
                      )}
                      {entry.reason && (
                        <Text style={{ fontSize: 12, color: C.red, fontStyle: 'italic', marginTop: 2 }}>
                          "{entry.reason}"
                        </Text>
                      )}
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                        {fmtDateTime(entry.performedAt)}
                      </Text>
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
