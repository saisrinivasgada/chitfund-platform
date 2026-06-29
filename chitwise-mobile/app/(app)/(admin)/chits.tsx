import { View, Text, ScrollView, RefreshControl, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen } from '../../../components/ui';

export default function AdminChitsScreen() {
  const { data: chits = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-chits'],
    queryFn: getChits,
  });

  const active    = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const paused    = (chits as any[]).filter((c) => c.status === 'PAUSED');
  const completed = (chits as any[]).filter((c) => c.status === 'COMPLETED');

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={chits as any[]}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Chit Funds</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {active.length} active · {paused.length} paused · {completed.length} completed
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No chits" message="No chit funds created yet." />}
        renderItem={({ item: c }) => (
          <Card style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
              <Badge status={c.status} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <View>
                <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 2 }}>INSTALLMENT</Text>
                <Amount value={c.installmentAmount ?? 0} size="sm" />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 2 }}>MEMBERS</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{c.totalMembers ?? '—'}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 2 }}>DRAW</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                  {c.currentDraw ?? '1'} / {c.totalDraws ?? '?'}
                </Text>
              </View>
              {c.totalAmount && (
                <View>
                  <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 2 }}>TOTAL VALUE</Text>
                  <Amount value={c.totalAmount} size="sm" color={C.green} />
                </View>
              )}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
