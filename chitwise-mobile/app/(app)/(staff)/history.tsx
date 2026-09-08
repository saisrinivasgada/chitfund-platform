import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyStaffHistory, getMembers, getChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, ListLoadingScreen, fmtDate, fmtDateTime } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

// ── Cash pickup trail ─────────────────────────────────────────────────────────
function PickupTrailModal({ request, memberName, chitName, onClose }: {
  request: any; memberName: string; chitName?: string; onClose: () => void;
}) {
  const steps = [
    {
      key: 'requested',
      label: 'Pickup Initiated',
      sub: 'Request created',
      time: request.requestedAt ?? request.createdAt,
      done: true,
      color: C.navy,
    },
    {
      key: 'assigned',
      label: 'Assigned to You',
      sub: request.assignedAt ? 'You were assigned' : 'Waiting for assignment',
      time: request.assignedAt,
      done: !!request.assignedAt,
      color: C.amber,
    },
    {
      key: 'picked_up',
      label: 'Picked Up from Member',
      sub: request.pickedUpAt ? 'You confirmed physical pickup' : 'Not picked up',
      time: request.pickedUpAt,
      done: !!request.pickedUpAt,
      color: C.green,
    },
    {
      key: 'collected',
      label: 'Handed to Admin',
      sub: request.status === 'COLLECTED'
        ? 'Admin confirmed receipt — payment credited'
        : request.status === 'CANCELLED' ? 'Task was cancelled' : 'Awaiting admin confirmation',
      time: request.status === 'COLLECTED' ? (request.collectedAt ?? request.updatedAt) : null,
      done: request.status === 'COLLECTED',
      color: C.navy,
    },
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
            {request.collectedAmount != null && request.collectedAmount !== request.requestedAmount && (
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>
                of ₹{Number(request.requestedAmount).toLocaleString('en-IN')} requested
              </Text>
            )}
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
          {!!request.cancelReason && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.red, letterSpacing: 0.5, marginBottom: 4 }}>CANCEL REASON</Text>
              <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{request.cancelReason}"</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function StaffHistoryScreen() {
  const [trail, setTrail] = useState<any>(null);

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['staff-history'],
    queryFn: getMyStaffHistory,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });

  const { data: members = [] } = useQuery({ queryKey: ['members', 'all'], queryFn: () => getMembers() });
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });

  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => {
    const name = m.fullName ?? m.name ?? m.id.slice(0, 8);
    memberMap[m.id] = name;
    if (m.userId) memberMap[m.userId] = name;
  });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  // Remitted today — collections the admin confirmed today, mirroring the web home stat.
  const todayStr = new Date().toDateString();
  const remittedToday = (history as any[]).filter(
    (r: any) => r.status === 'COLLECTED' && new Date(r.collectedAt ?? r.updatedAt).toDateString() === todayStr
  );
  const remittedTodayAmt = remittedToday.reduce(
    (s: number, r: any) => s + Number(r.collectedAmount ?? r.requestedAmount ?? 0), 0
  );

  if (isLoading) return <ListLoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={history as any[]}
        keyExtractor={(t: any) => t.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={T.h1}>History</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              Your completed & cancelled tasks
            </Text>

            <View style={{
              marginTop: 14, borderRadius: 12, padding: 14,
              backgroundColor: remittedTodayAmt > 0 ? '#F0FDF4' : C.gray50,
              borderWidth: 1.5, borderColor: remittedTodayAmt > 0 ? C.green : C.gray200,
            }}>
              <Text style={{
                fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
                color: remittedTodayAmt > 0 ? C.green : C.gray400,
              }}>
                REMITTED TODAY
              </Text>
              <Text style={{
                fontSize: 22, fontWeight: '800', marginTop: 3,
                color: remittedTodayAmt > 0 ? C.green : C.gray400,
              }}>
                ₹{remittedTodayAmt.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 11, color: remittedTodayAmt > 0 ? '#166534' : C.gray400, marginTop: 2 }}>
                {remittedToday.length > 0 ? `${remittedToday.length} handed to admin` : 'None today'}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No history yet" message="Completed tasks appear here." />}
        renderItem={({ item: t }) => (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setTrail(t)}>
            <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: t.status === 'COLLECTED' ? C.green : C.gray300 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                  {memberMap[t.memberId] ?? `Member ${t.memberId?.slice(0, 8)}…`}
                </Text>
                <Badge status={t.status} />
              </View>
              {t.chitId && chitMap[t.chitId] && (
                <Text style={{ fontSize: 12, color: C.navy, marginBottom: 4 }}>{chitMap[t.chitId]}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 1 }}>Requested</Text>
                  <Amount value={t.requestedAmount} size="sm" />
                </View>
                {t.collectedAmount != null && t.collectedAmount !== t.requestedAmount && (
                  <View>
                    <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 1 }}>Collected</Text>
                    <Amount value={t.collectedAmount} size="sm" color={C.green} />
                  </View>
                )}
                {t.collectedAmount != null && t.collectedAmount === t.requestedAmount && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.green }}>✓ Full amount</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: C.gray400 }}>
                  {t.status === 'COLLECTED'
                    ? `Collected ${fmtDate(t.collectedAt ?? t.updatedAt)}`
                    : t.status === 'CANCELLED'
                      ? `Cancelled ${fmtDate(t.cancelledAt ?? t.updatedAt)}`
                      : fmtDate(t.updatedAt)}
                </Text>
                <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>View trail →</Text>
              </View>
              {t.cancelReason && (
                <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginTop: 2 }}>"{t.cancelReason}"</Text>
              )}
            </Card>
          </TouchableOpacity>
        )}
      />

      {trail && (
        <PickupTrailModal
          request={trail}
          memberName={memberMap[trail.memberId] ?? `Member ${trail.memberId?.slice(0, 8)}…`}
          chitName={trail.chitId ? chitMap[trail.chitId] : undefined}
          onClose={() => setTrail(null)}
        />
      )}
    </SafeAreaView>
  );
}
