import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyWorkerHistory } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, fmtDate } from '../../../components/ui';

export default function WorkerHistoryScreen() {
  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['worker-history'],
    queryFn: getMyWorkerHistory,
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={history as any[]}
        keyExtractor={(t: any) => t.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>History</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              Your completed & cancelled tasks
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No history yet" message="Completed tasks appear here." />}
        renderItem={({ item: t }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                Member {t.memberId?.slice(0, 8)}…
              </Text>
              <Badge status={t.status} />
            </View>
            <Amount value={t.requestedAmount} size="sm" />
            <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>
              {fmtDate(t.updatedAt)}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
