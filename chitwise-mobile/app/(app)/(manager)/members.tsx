import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMembers, getMemberTotalBalance } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen } from '../../../components/ui';

function MemberBalance({ memberId }: { memberId: string }) {
  const { data: bal } = useQuery({
    queryKey: ['member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    staleTime: 120_000,
  });
  if (bal == null) return null;
  const num = Number(bal);
  return (
    <Text style={{ fontSize: 12, fontWeight: '600', color: num > 0 ? C.red : C.green, marginTop: 2 }}>
      {num > 0 ? `Owes ₹${num.toLocaleString('en-IN')}` : 'Paid up'}
    </Text>
  );
}

const PAGE_SIZE = 30;

export default function ManagerMembersScreen() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  if (isLoading) return <LoadingScreen />;

  const filtered = (members as any[]).filter((m: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.fullName ?? '').toLowerCase().includes(q) ||
      (m.phone ?? '').includes(q) ||
      (m.memberCode ?? '').toLowerCase().includes(q)
    );
  });

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={paged}
        keyExtractor={(m: any) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onEndReached={() => { if (hasMore) setPage(p => p + 1); }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Members</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2, marginBottom: 12 }}>
              {(members as any[]).filter((m: any) => m.status === 'ACTIVE').length} active · {(members as any[]).length} total
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or phone…"
              placeholderTextColor={C.gray400}
              style={{
                backgroundColor: C.white, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200,
                paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.gray900,
              }}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No members found" message="Try a different search." />}
        ListFooterComponent={hasMore ? (
          <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 12, marginTop: 8 }}>
            Showing {paged.length} of {filtered.length}
          </Text>
        ) : null}
        renderItem={({ item: m }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{m.fullName ?? m.name}</Text>
                {m.phone && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{m.phone}</Text>}
                {m.memberCode && <Text style={{ fontSize: 11, color: C.gray400 }}>#{m.memberCode}</Text>}
                <MemberBalance memberId={m.id} />
              </View>
              <Badge status={m.status} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
