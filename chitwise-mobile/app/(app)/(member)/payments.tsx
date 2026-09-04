import { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getMyPaymentBatches } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, ListLoadingScreen, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 Days' },
  { key: '30d',   label: '30 Days' },
  { key: 'all',   label: 'All Time' },
] as const;

const MODE_FILTERS = ['ALL', 'CASH', 'UPI', 'BANK_TRANSFER'] as const;

const MODE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  CASH:          { bg: C.green,      text: '#fff',    label: 'Cash' },
  UPI:           { bg: C.gold,       text: '#fff',    label: 'UPI' },
  BANK_TRANSFER: { bg: C.navy,       text: '#fff',    label: 'Bank' },
};

function isToday(d: Date | null) {
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function parseTs(s: any): Date | null {
  if (!s) return null;
  const str = typeof s === 'string' && !s.endsWith('Z') && !s.includes('+') ? s + 'Z' : s;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export default function MemberPaymentsScreen() {
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<string>('ALL');

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['my-payment-batches'],
    queryFn: getMyPaymentBatches,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    return (batches as any[]).filter((b: any) => {
      const dt = parseTs(b.collectedAt ?? b.createdAt);
      const ts = dt?.getTime() ?? 0;
      if (dateFilter === 'today' && !isToday(dt)) return false;
      if (dateFilter === '7d'   && ts < now - 7  * 86_400_000) return false;
      if (dateFilter === '30d'  && ts < now - 30 * 86_400_000) return false;
      if (modeFilter !== 'ALL' && b.paymentMode !== modeFilter) return false;
      return true;
    });
  }, [batches, dateFilter, modeFilter]);

  const total = filtered.filter((b: any) => b.status !== 'VOIDED').reduce((s: number, b: any) => s + Number(b.totalAmount ?? 0), 0);

  if (isLoading) return <ListLoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={filtered}
        keyExtractor={(b: any) => b.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={T.h1}>Payments</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 14 }}>Your payment history</Text>

            {/* Summary card */}
            <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 18, marginBottom: 14 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: 4 }}>
                {dateFilter === 'today' ? 'PAID TODAY' : dateFilter === '7d' ? 'PAID (7 DAYS)' : dateFilter === '30d' ? 'PAID (30 DAYS)' : 'TOTAL PAID'}
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#D4A017' }}>
                ₹{total.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {filtered.filter((b: any) => b.status !== 'VOIDED').length} payment{filtered.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Date filters */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {DATE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setDateFilter(f.key)}
                  style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: dateFilter === f.key ? C.navy : C.gray100, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: dateFilter === f.key ? '#fff' : C.gray600 ?? C.gray500 }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mode filters */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {MODE_FILTERS.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setModeFilter(m)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: modeFilter === m ? C.navy : C.gray100 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: modeFilter === m ? '#fff' : C.gray600 ?? C.gray500 }}>
                    {m === 'ALL' ? 'All' : (MODE_BADGE[m]?.label ?? m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No payments found"
            message={dateFilter === 'today' ? 'No payments recorded today.' : 'No payments match the filter.'}
          />
        }
        renderItem={({ item: b }) => {
          const isVoided = b.status === 'VOIDED';
          return (
            <Card style={{ marginBottom: 10, opacity: isVoided ? 0.55 : 1, borderLeftWidth: 4, borderLeftColor: isVoided ? C.gray300 : C.navy }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {(() => {
                      const badge = MODE_BADGE[b.paymentMode];
                      return badge ? (
                        <View style={{ backgroundColor: badge.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: badge.text }}>{badge.label}</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: C.gray200, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray700 }}>{b.paymentMode ?? 'Payment'}</Text>
                        </View>
                      );
                    })()}
                    {isVoided && (
                      <View style={{ backgroundColor: C.red + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: C.red }}>VOIDED</Text>
                      </View>
                    )}
                  </View>
                  {b.chitName && (
                    <Text style={{ fontSize: 12, color: C.navy, marginBottom: 3 }}>{b.chitName}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: C.gray400 }}>
                    {fmtDate(b.collectedAt ?? b.createdAt)}
                  </Text>
                  {b.collectorName && (
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>Collected by: {b.collectorName}</Text>
                  )}
                </View>
                <Amount
                  value={Number(b.totalAmount ?? 0)}
                  size="md"
                  color={isVoided ? C.gray400 : C.gray900}
                />
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}
