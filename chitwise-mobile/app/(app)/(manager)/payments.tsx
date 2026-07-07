import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllPaymentBatches, getPendingRemittance, getPendingPayouts, getMembers, getChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Divider, SectionHeader, fmtDate } from '../../../components/ui';

const TABS = ['Remittance', 'Payouts', 'All Payments'] as const;
type Tab = typeof TABS[number];

export default function ManagerPaymentsScreen() {
  const [tab, setTab] = useState<Tab>('Remittance');

  const { data: pendingRemit = [],  isLoading: l1, refetch: r1 } = useQuery({ queryKey: ['pending-remit'],    queryFn: getPendingRemittance });
  const { data: pendingPayouts = [],isLoading: l2, refetch: r2 } = useQuery({ queryKey: ['pending-payouts'],  queryFn: getPendingPayouts });
  const { data: allBatches = [],    isLoading: l3, refetch: r3 } = useQuery({ queryKey: ['all-batches'],      queryFn: () => getAllPaymentBatches() });
  const { data: members = [] }                                    = useQuery({ queryKey: ['members'],          queryFn: getMembers });
  const { data: chits = [] }                                      = useQuery({ queryKey: ['chits'],            queryFn: getChits });

  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => { memberMap[m.id] = m.fullName ?? m.name ?? '—'; });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  const isLoading = l1 || l2 || l3;
  function onRefresh() { r1(); r2(); r3(); }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: C.white, paddingHorizontal: 12, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
        {TABS.map((t) => (
          <View key={t} style={{ marginRight: 8 }}>
            <Text
              onPress={() => setTab(t)}
              style={{
                fontSize: 13, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 12,
                color: tab === t ? C.navy : C.gray400,
                borderBottomWidth: 2, borderBottomColor: tab === t ? C.navy : 'transparent',
              }}
            >{t}</Text>
          </View>
        ))}
      </View>

      {isLoading ? <LoadingScreen /> : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          {tab === 'Remittance' && (
            <>
              <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
                {(pendingRemit as any[]).length} batches pending remittance
              </Text>
              {(pendingRemit as any[]).length === 0
                ? <EmptyState title="All clear" message="No batches awaiting remittance." />
                : (pendingRemit as any[]).map((b: any) => (
                  <Card key={b.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                        {memberMap[b.memberId] ?? '—'}
                      </Text>
                      <Badge status={b.status ?? 'AWAITING_REMITTANCE'} />
                    </View>
                    <Text style={{ fontSize: 12, color: C.navy, marginBottom: 4 }}>{chitMap[b.chitId] ?? b.chitName ?? '—'}</Text>
                    <Amount value={b.amount ?? b.totalAmount ?? 0} size="sm" color={C.amber} />
                    {b.collectedAt && <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Collected {fmtDate(b.collectedAt)}</Text>}
                  </Card>
                ))
              }
            </>
          )}

          {tab === 'Payouts' && (
            <>
              <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
                {(pendingPayouts as any[]).length} payouts pending disbursement
              </Text>
              {(pendingPayouts as any[]).length === 0
                ? <EmptyState title="All clear" message="No payouts pending." />
                : (pendingPayouts as any[]).map((p: any) => (
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
              }
            </>
          )}

          {tab === 'All Payments' && (
            <>
              <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
                {(allBatches as any[]).length} total payment batches
              </Text>
              {(allBatches as any[]).length === 0
                ? <EmptyState title="No payments" message="Payment history will appear here." />
                : (allBatches as any[]).map((b: any) => (
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
              }
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
