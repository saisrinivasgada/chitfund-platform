import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, FlatList, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getMembers } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, RowItem } from '../../../components/ui';

export default function AdminMembersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-members'],
    queryFn: getMembers,
  });

  const filtered = (members as any[]).filter((m) => {
    const q = search.toLowerCase();
    return !q
      || (m.fullName ?? m.name ?? '').toLowerCase().includes(q)
      || (m.phone ?? '').includes(q);
  });

  const activeCount   = (members as any[]).filter((m) => m.status === 'ACTIVE' || !m.status).length;
  const inactiveCount = (members as any[]).length - activeCount;

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={T.h1}>Members</Text>
        <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2, marginBottom: 14 }}>
          {activeCount} active · {inactiveCount} inactive
        </Text>

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone…"
          placeholderTextColor={C.gray400}
          style={{
            borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
            color: C.gray900, backgroundColor: C.white, marginBottom: 4,
          }}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(m: any) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32 }}
        ListEmptyComponent={
          <EmptyState title="No members found" message={search ? 'Try a different search' : 'No members yet'} />
        }
        renderItem={({ item: m }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                <View style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>
                    {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }} numberOfLines={1}>
                    {m.fullName ?? m.name ?? 'Unknown'}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>
                    {m.phone ?? m.email ?? 'No contact'}
                  </Text>
                </View>
              </View>
              <Badge status={m.status ?? 'ACTIVE'} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
