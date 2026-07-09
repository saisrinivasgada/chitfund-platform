import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyWorkerHistory, getMembers, getChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, ListLoadingScreen, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const PAGE_SIZE = 25;

export default function WorkerHistoryScreen() {
  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['worker-history'],
    queryFn: getMyWorkerHistory,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits });

  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => { memberMap[m.id] = m.fullName ?? m.name ?? m.id.slice(0, 8); });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

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
          </View>
        }
        ListEmptyComponent={<EmptyState title="No history yet" message="Completed tasks appear here." />}
        renderItem={({ item: t }) => (
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
            <Text style={{ fontSize: 12, color: C.gray400, marginTop: 6 }}>
              {t.status === 'COLLECTED'
                ? `Collected ${fmtDate(t.collectedAt ?? t.updatedAt)}`
                : t.status === 'CANCELLED'
                  ? `Cancelled ${fmtDate(t.cancelledAt ?? t.updatedAt)}`
                  : fmtDate(t.updatedAt)}
            </Text>
            {t.cancelReason && (
              <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginTop: 2 }}>"{t.cancelReason}"</Text>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
