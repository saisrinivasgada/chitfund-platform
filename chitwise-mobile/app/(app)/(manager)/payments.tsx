import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getAllPaymentBatches, getPendingPayouts, getMembers, getChits,
  getAllCashRequests, assignStaffToRequest, collectForRequest, voidCashPickup, cancelCashRequest, listStaff,
  getWalletBalance, getWalletTransactions,
} from '../../../services/api';
import { C, Card, Badge, Amount, EmptyState, LoadingScreen, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const TABS = ['Cash Requests', 'Payouts', 'All Payments', 'Treasury'] as const;
type Tab = typeof TABS[number];

function sevenDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
}

const REQ_STATUS_COLOR: Record<string, string> = {
  PENDING: C.amber, ASSIGNED: C.navy, PICKED_UP: '#7C3AED', COLLECTED: C.green,
  CANCELLED: C.gray400, VOIDED: C.red, PARTIALLY_COLLECTED: C.amber,
};

function TreasuryTab() {
  const { data: balance, isLoading: bl } = useQuery({
    queryKey: ['m-wallet-balance'],
    queryFn: getWalletBalance,
    staleTime: 60_000,
  });
  const { data: txns = [], isLoading: tl, refetch } = useQuery({
    queryKey: ['m-wallet-txns'],
    queryFn: getWalletTransactions,
    staleTime: 60_000,
  });

  if (bl || tl) return <LoadingScreen />;

  const bal = (balance as any)?.balance ?? (balance as any)?.currentBalance ?? 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={C.navy} />}
    >
      <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 }}>
          TREASURY BALANCE
        </Text>
        <Text style={{ fontSize: 32, fontWeight: '800', color: '#D4A017' }}>
          ₹{Number(bal).toLocaleString('en-IN')}
        </Text>
      </View>

      {(txns as any[]).length === 0 ? (
        <EmptyState title="No transactions" message="Treasury transactions will appear here." />
      ) : (
        (txns as any[]).map((t: any, i: number) => (
          <Card key={t.id ?? i} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }} numberOfLines={2}>
                  {t.description ?? t.type ?? '—'}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{fmtDate(t.createdAt ?? t.date)}</Text>
              </View>
              <Text style={{
                fontSize: 15, fontWeight: '700',
                color: (t.amount ?? t.value ?? 0) < 0 ? C.red : C.green,
              }}>
                {(t.amount ?? t.value ?? 0) < 0 ? '-' : '+'}₹{Math.abs(Number(t.amount ?? t.value ?? 0)).toLocaleString('en-IN')}
              </Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

export default function ManagerPaymentsScreen() {
  const [tab, setTab] = useState<Tab>('Cash Requests');
  const qc = useQueryClient();

  const { data: cashRequests = [], isLoading: l0, refetch: r0 } = useQuery({
    queryKey: ['m-cash-requests'],
    queryFn: () => getAllCashRequests({ status: 'PENDING,ASSIGNED,PICKED_UP', size: 50 }),
  });
  const { data: pendingPayouts = [], isLoading: l1, refetch: r1 } = useQuery({
    queryKey: ['pending-payouts'],
    queryFn: getPendingPayouts,
  });
  const { data: allBatches = [], isLoading: l2, refetch: r2 } = useQuery({
    queryKey: ['m-all-batches-7d'],
    queryFn: () => getAllPaymentBatches({ fromDate: sevenDaysAgoStr() }),
  });
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: chits = [] } = useQuery({ queryKey: ['m-chits'], queryFn: getChits });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff });

  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => { memberMap[m.id] = m.fullName ?? m.name ?? '—'; });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });
  const staffMap: Record<string, string> = {};
  (staff as any[]).forEach((s: any) => { staffMap[s.id] = s.fullName ?? s.name ?? '—'; });

  const assignMut = useMutation({
    mutationFn: ({ requestId, staffId }: { requestId: string; staffId: string }) =>
      assignStaffToRequest(requestId, staffId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m-cash-requests'] }); toast.saved('Staff assigned'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const collectMut = useMutation({
    mutationFn: (requestId: string) => collectForRequest(requestId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m-cash-requests'] }); toast.saved('Marked as collected'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const voidMut = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      voidCashPickup(requestId, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m-cash-requests'] }); toast.cancelled('Request voided'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: (requestId: string) => cancelCashRequest(requestId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m-cash-requests'] }); toast.cancelled('Request cancelled'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const isLoading = l0 || l1 || l2;
  function onRefresh() { r0(); r1(); r2(); }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 }}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 14, paddingVertical: 12, marginRight: 4,
              borderBottomWidth: 2, borderBottomColor: tab === t ? C.navy : 'transparent',
            }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t ? C.navy : C.gray400 }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── CASH REQUESTS ───────────────────────────────────────────────────── */}
      {tab === 'Cash Requests' && (
        isLoading ? <LoadingScreen /> : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={l0} onRefresh={r0} tintColor={C.navy} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
              {(cashRequests as any[]).length} active requests
            </Text>
            {(cashRequests as any[]).length === 0 ? (
              <EmptyState title="No active requests" message="Cash pickup requests from members appear here." />
            ) : (
              (cashRequests as any[]).map((r: any) => {
                const col = REQ_STATUS_COLOR[r.status] ?? C.gray400;
                return (
                  <Card key={r.id} style={{ marginBottom: 12, borderLeftWidth: 3, borderLeftColor: col }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                          {memberMap[r.memberId] ?? '—'}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.navy, marginTop: 1 }}>
                          {chitMap[r.chitId] ?? '—'}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                          {fmtDate(r.createdAt)} · {r.status}
                        </Text>
                        {r.assignedStaffId && (
                          <Text style={{ fontSize: 11, color: C.navy, marginTop: 1 }}>
                            Staff: {staffMap[r.assignedStaffId] ?? r.assignedStaffId}
                          </Text>
                        )}
                      </View>
                      <Amount value={r.requestedAmount ?? r.amount ?? 0} size="sm" />
                    </View>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(r.status === 'PENDING' || r.status === 'ASSIGNED') && (staff as any[]).length > 0 && (
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            'Assign Staff',
                            'Pick a staff member for pickup:',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              ...(staff as any[]).slice(0, 3).map((s: any) => ({
                                text: s.fullName ?? s.name ?? s.id,
                                onPress: () => assignMut.mutate({ requestId: r.id, staffId: s.id }),
                              })),
                            ]
                          )}
                          style={{ backgroundColor: C.navy50, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Assign Staff</Text>
                        </TouchableOpacity>
                      )}
                      {(r.status === 'PICKED_UP' || r.status === 'ASSIGNED') && (
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            'Mark Collected',
                            `Confirm collection for ${memberMap[r.memberId] ?? '—'}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Confirm', onPress: () => collectMut.mutate(r.id) },
                            ]
                          )}
                          style={{ backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>Mark Collected</Text>
                        </TouchableOpacity>
                      )}
                      {(r.status === 'PENDING' || r.status === 'ASSIGNED') && (
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            'Cancel Request',
                            'Cancel this cash pickup request?',
                            [
                              { text: 'No', style: 'cancel' },
                              { text: 'Cancel Request', style: 'destructive', onPress: () => cancelMut.mutate(r.id) },
                            ]
                          )}
                          style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                      {r.status === 'PICKED_UP' && (
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            'Void Pickup',
                            'Enter reason:',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Void', style: 'destructive', onPress: () => voidMut.mutate({ requestId: r.id, reason: 'Voided by manager' }) },
                            ]
                          )}
                          style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>Void</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {/* ── PAYOUTS ─────────────────────────────────────────────────────────── */}
      {tab === 'Payouts' && (
        isLoading ? <LoadingScreen /> : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={l1} onRefresh={r1} tintColor={C.navy} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
              {(pendingPayouts as any[]).length} payouts pending disbursement
            </Text>
            {(pendingPayouts as any[]).length === 0 ? (
              <EmptyState title="All clear" message="No payouts pending." />
            ) : (
              (pendingPayouts as any[]).map((p: any) => (
                <Card key={p.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#7C3AED' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[p.memberId ?? p.winnerId] ?? '—'}
                    </Text>
                    <Badge status={p.status} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.navy, marginBottom: 4 }}>
                    {chitMap[p.chitId] ?? '—'} · Draw #{p.drawNumber ?? '—'}
                  </Text>
                  <Amount value={p.netPayoutAmount ?? p.winningAmount ?? p.payoutAmount ?? 0} size="sm" color="#7C3AED" />
                </Card>
              ))
            )}
          </ScrollView>
        )
      )}

      {/* ── ALL PAYMENTS ────────────────────────────────────────────────────── */}
      {tab === 'All Payments' && (
        isLoading ? <LoadingScreen /> : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={l2} onRefresh={r2} tintColor={C.navy} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
              {(allBatches as any[]).length} payments in the last 7 days
            </Text>
            {(allBatches as any[]).length === 0 ? (
              <EmptyState title="No payments" message="No payments in the last 7 days." />
            ) : (
              (allBatches as any[]).map((b: any) => (
                <Card key={b.id} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[b.memberId] ?? '—'}
                    </Text>
                    <Badge status={b.status} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.navy }}>{chitMap[b.chitId] ?? b.chitName ?? '—'}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Amount value={b.amount ?? b.totalAmount ?? 0} size="sm" />
                    <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(b.createdAt ?? b.collectedAt)}</Text>
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        )
      )}

      {/* ── TREASURY ────────────────────────────────────────────────────────── */}
      {tab === 'Treasury' && <TreasuryTab />}
    </SafeAreaView>
  );
}
