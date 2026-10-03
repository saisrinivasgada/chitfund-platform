import { useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, Modal,
  ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyIntimations, createPaymentIntimation, withdrawPaymentIntimation,
  getMyChits, getMyMemberProfile, getMemberBalance,
} from '../../../services/api';
import { C, T, Card, Amount, EmptyState, ListLoadingScreen, fmtDate, Button } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  PENDING:   { label: 'Pending',   bg: '#FEF3C7', text: '#B45309' },
  APPROVED:  { label: 'Approved',  bg: '#DCFCE7', text: '#15803D' },
  REJECTED:  { label: 'Rejected',  bg: '#FEE2E2', text: '#DC2626' },
  WITHDRAWN: { label: 'Withdrawn', bg: '#F3F4F6', text: '#6B7280' },
  VOIDED:    { label: 'Voided',    bg: '#FEE2E2', text: '#DC2626' },
};

interface ChitItem {
  chitId: string;
  claimedAmount: string;
}

function CreateIntimationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: chits = [] } = useQuery({
    queryKey: ['my-chits'],
    queryFn: getMyChits,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['my-member-profile'],
    queryFn: getMyMemberProfile,
    staleTime: 60_000,
  });
  const memberId: string | undefined = (memberProfile as any)?.id;

  const balanceResults = useQueries({
    queries: (chits as any[]).map((c: any) => ({
      queryKey: ['memberBalance', memberId, c.id],
      queryFn: () => getMemberBalance(memberId!, c.id),
      enabled: !!memberId,
      staleTime: 60_000,
    })),
  });
  const balanceMap: Record<string, number | null> = Object.fromEntries(
    (chits as any[]).map((c: any, i: number) => [
      c.id,
      (balanceResults[i]?.data as any)?.totalOutstanding != null
        ? Number((balanceResults[i].data as any).totalOutstanding)
        : null,
    ])
  );
  // Only show chits where balance is unknown (still loading) or outstanding > 0
  const chitsWithDues = (chits as any[]).filter((c: any) => balanceMap[c.id] === null || (balanceMap[c.id] ?? 0) > 0);

  const [items, setItems] = useState<ChitItem[]>([{ chitId: '', claimedAmount: '' }]);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const payload = items
        .filter(it => it.chitId && it.claimedAmount)
        .map(it => ({ chitId: it.chitId, claimedAmount: Number(it.claimedAmount) }));
      if (payload.length === 0) throw new Error('Add at least one chit and amount');
      return createPaymentIntimation(payload, notes || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-intimations'] });
      toast.submitted('Payment intimation submitted');
      onClose();
    },
    onError: (e: any) => toast.noted(e?.response?.data?.message ?? e?.message ?? 'Failed to submit'),
  });

  const addItem = () => setItems(prev => [...prev, { chitId: '', claimedAmount: '' }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ChitItem, value: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Report a Payment</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 16 }}>
              Report a payment you made that wasn't recorded. Your admin will review and confirm.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map((it, idx) => (
                <View key={idx} style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>
                      {it.chitId
                        ? ((chits as any[]).find((c: any) => c.id === it.chitId)?.name ?? `Chit ${idx + 1}`)
                        : `Chit ${idx + 1}`}
                    </Text>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(idx)}>
                        <Text style={{ fontSize: 12, color: C.red }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>Select Chit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {chitsWithDues.map((c: any) => {
                        const due = balanceMap[c.id];
                        const selected = it.chitId === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => updateItem(idx, 'chitId', c.id)}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                              backgroundColor: selected ? C.navy : C.gray100,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : C.gray700 }}>
                              {c.name ?? c.id.substring(0, 8)}
                            </Text>
                            {due != null && due > 0 && (
                              <Text style={{ fontSize: 10, color: selected ? '#CBD5E1' : C.gray500, marginTop: 1 }}>
                                ₹{due.toLocaleString('en-IN')} due
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>Amount (₹)</Text>
                  <TextInput
                    value={it.claimedAmount}
                    onChangeText={v => updateItem(idx, 'claimedAmount', v)}
                    keyboardType="numeric"
                    placeholder="0"
                    style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: C.gray900 }}
                  />
                </View>
              ))}

              <TouchableOpacity onPress={addItem} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>+ Add another chit</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                placeholder="e.g. Paid via UPI on 25 Sep"
                style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: C.gray900, marginBottom: 16 }}
              />

              <Button
                label={mutation.isPending ? 'Submitting…' : 'Submit Intimation'}
                onPress={() => mutation.mutate()}
                disabled={mutation.isPending}
              />
              <View style={{ height: 8 }} />
              <Button label="Cancel" variant="ghost" onPress={onClose} />
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IntimationDetailModal({ item, onClose, onWithdraw }: { item: any; onClose: () => void; onWithdraw: () => void }) {
  const status = STATUS_STYLE[item.status] ?? { label: item.status, bg: C.gray100, text: C.gray700 };
  const canWithdraw = item.status === 'PENDING';

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Payment Intimation</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <View style={{ backgroundColor: status.bg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: status.text }}>{status.label}</Text>
              </View>
              <Text style={{ fontSize: 12, color: C.gray400 }}>{fmtDate(item.createdAt)}</Text>
            </View>

            {item.rejectReason && (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>Reject reason</Text>
                <Text style={{ fontSize: 13, color: '#DC2626', marginTop: 2 }}>{item.rejectReason}</Text>
              </View>
            )}
            {item.voidReason && (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>Void reason</Text>
                <Text style={{ fontSize: 13, color: '#DC2626', marginTop: 2 }}>{item.voidReason}</Text>
              </View>
            )}

            <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, marginBottom: 8 }}>Chit Payments Reported</Text>
            {(item.items ?? []).map((it: any) => (
              <View key={it.id} style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: C.gray500 }}>Claimed</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>
                    ₹{Number(it.claimedAmount).toLocaleString('en-IN')}
                  </Text>
                </View>
                {it.approvedAmount != null && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: C.gray500 }}>Approved</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803D' }}>
                      ₹{Number(it.approvedAmount).toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {item.notes && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 2 }}>Notes</Text>
                <Text style={{ fontSize: 13, color: C.gray700 }}>{item.notes}</Text>
              </View>
            )}

            {canWithdraw && (
              <View style={{ marginTop: 16 }}>
                <Button
                  label="Withdraw Intimation"
                  variant="danger"
                  onPress={() => {
                    Alert.alert('Withdraw?', 'This will cancel your payment intimation.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Withdraw', style: 'destructive', onPress: onWithdraw },
                    ]);
                  }}
                />
              </View>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MemberIntimationsScreen() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const { data: intimations = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-intimations'],
    queryFn: getMyIntimations,
    refetchOnMount: 'always',
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdrawPaymentIntimation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-intimations'] });
      setSelected(null);
      toast.cancelled('Intimation withdrawn');
    },
    onError: (e: any) => toast.noted(e?.response?.data?.message ?? 'Failed to withdraw'),
  });

  const pendingCount = (intimations as any[]).filter(i => i.status === 'PENDING').length;

  if (isLoading) return <ListLoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={intimations as any[]}
        keyExtractor={(i: any) => i.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Payment Intimations</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 14 }}>
              Report payments you made that weren't recorded
            </Text>
            {pendingCount > 0 && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '600' }}>
                  {pendingCount} intimation{pendingCount > 1 ? 's' : ''} awaiting admin review
                </Text>
              </View>
            )}
            <Button label="Report a Payment" onPress={() => setShowCreate(true)} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No intimations yet" message="Use the button above to report a payment your admin missed." />
        }
        renderItem={({ item }: { item: any }) => {
          const s = STATUS_STYLE[item.status] ?? { label: item.status, bg: C.gray100, text: C.gray700 };
          const total = (item.items ?? []).reduce((sum: number, it: any) => sum + Number(it.claimedAmount ?? 0), 0);
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelected(item)}>
              <Card style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: C.navy }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: s.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: s.text }}>{s.label}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: C.gray400 }}>{(item.items ?? []).length} chit{item.items?.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: C.gray400 }}>{fmtDate(item.createdAt)}</Text>
                    {item.notes && (
                      <Text style={{ fontSize: 12, color: C.gray600, marginTop: 2 }} numberOfLines={1}>{item.notes}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Amount value={total} size="md" color={C.gray900} />
                    <Text style={{ fontSize: 16, color: C.gray300, marginTop: 4 }}>›</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {showCreate && (
        <CreateIntimationModal
          onClose={() => setShowCreate(false)}
        />
      )}

      {selected && (
        <IntimationDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onWithdraw={() => withdrawMutation.mutate(selected.id)}
        />
      )}
    </SafeAreaView>
  );
}
