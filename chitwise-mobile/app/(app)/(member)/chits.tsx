import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Divider } from '../../../components/ui';

export default function MemberChitsScreen() {
  const { data: chits = [], isLoading, refetch } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

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
            <Text style={T.h1}>My Chit Funds</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').length} active
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No chit funds" message="You haven't been enrolled in any chit funds yet." />
        }
        renderItem={({ item: c }) => (
          <Card style={{ marginBottom: 14 }}>
            {/* Chit name + status */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={2}>{c.name}</Text>
              <Badge status={c.status} />
            </View>

            {/* Key stats */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Monthly</Text>
                <Amount value={c.installmentAmount ?? 0} size="sm" />
              </View>
              <View>
                <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Draw</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                  {c.currentDraw ?? 1} / {c.totalDraws ?? '?'}
                </Text>
              </View>
              {c.totalAmount && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Total Value</Text>
                  <Amount value={c.totalAmount} size="sm" color={C.green} />
                </View>
              )}
            </View>

            {/* Progress bar */}
            {c.totalDraws && c.currentDraw && (
              <>
                <Divider />
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, color: C.gray400 }}>Progress</Text>
                    <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>
                      {Math.round((c.currentDraw / c.totalDraws) * 100)}%
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: C.gray200, borderRadius: 3 }}>
                    <View style={{
                      height: 6, borderRadius: 3,
                      backgroundColor: c.status === 'COMPLETED' ? C.green : C.navy,
                      width: `${Math.min(100, (c.currentDraw / c.totalDraws) * 100)}%`,
                    }} />
                  </View>
                </View>
              </>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
