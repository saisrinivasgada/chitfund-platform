import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Divider } from '../../../components/ui';

export default function ManagerChitsScreen() {
  const { data: chits = [], isLoading, refetch } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
  });

  if (isLoading) return <LoadingScreen />;

  const sorted = [...(chits as any[])].sort((a, b) => {
    const order: Record<string, number> = { ACTIVE: 0, PAUSED: 1, COMPLETED: 2, CANCELLED: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={sorted}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Chit Funds</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').length} active
              {' · '}{(chits as any[]).length} total
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No chit funds" message="No chit funds found." />}
        renderItem={({ item: c }) => (
          <Card style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={2}>{c.name}</Text>
              <Badge status={c.status} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
              <View>
                <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Monthly</Text>
                <Amount value={c.installmentAmount ?? 0} size="sm" />
              </View>
              <View>
                <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Draw</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                  {c.currentDraw ?? 1} / {c.totalDraws ?? '?'}
                </Text>
              </View>
              {c.totalAmount && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Total</Text>
                  <Amount value={c.totalAmount} size="sm" color={C.green} />
                </View>
              )}
              {c.memberCount != null && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Members</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{c.memberCount}</Text>
                </View>
              )}
            </View>
            {c.totalDraws && c.currentDraw && (
              <>
                <Divider />
                <View style={{ height: 6, backgroundColor: C.gray200, borderRadius: 3 }}>
                  <View style={{
                    height: 6, borderRadius: 3,
                    backgroundColor: c.status === 'COMPLETED' ? C.green : C.navy,
                    width: `${Math.min(100, (c.currentDraw / c.totalDraws) * 100)}%`,
                  }} />
                </View>
                <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4, textAlign: 'right' }}>
                  {Math.round((c.currentDraw / c.totalDraws) * 100)}% complete
                </Text>
              </>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
