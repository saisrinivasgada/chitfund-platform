import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listStaff } from '../../../services/api';
import { C, T, Card, Badge, EmptyState, LoadingScreen } from '../../../components/ui';

const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  ADMIN:   { bg: C.navy50,  text: C.navy },
  MANAGER: { bg: '#F5F3FF', text: '#7C3AED' },
  WORKER:  { bg: '#FEF3C7', text: '#D97706' },
};

export default function AdminTeamScreen() {
  const { data: staff = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-staff'],
    queryFn: listStaff,
  });

  const workers  = (staff as any[]).filter((s) => s.role === 'WORKER');
  const managers = (staff as any[]).filter((s) => s.role === 'MANAGER');

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={staff as any[]}
        keyExtractor={(s: any) => s.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Team</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {workers.length} workers · {managers.length} managers
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No staff" message="No staff members added yet." />}
        renderItem={({ item: s }) => {
          const rc = ROLE_COLOR[s.role] ?? ROLE_COLOR.WORKER;
          return (
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: rc.bg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: rc.text }}>
                    {(s.fullName ?? s.username ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    {s.fullName ?? s.username}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500 }}>{s.phone ?? s.email ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ backgroundColor: rc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: rc.text }}>{s.role}</Text>
                  </View>
                  {s.enabled === false && (
                    <Badge status="INACTIVE" />
                  )}
                </View>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}
