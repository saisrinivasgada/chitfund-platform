import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Modal, TextInput, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import { getMyAssignedRequests, markPickedUp, cancelByWorker, rescheduleRequest } from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, fmtDateTime, EmptyState, LoadingScreen, Divider } from '../../../components/ui';

export default function WorkerTasksScreen() {
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['worker-tasks'],
    queryFn: getMyAssignedRequests,
    refetchInterval: 30_000,
  });

  const pickupMut = useMutation({
    mutationFn: (id: string) => markPickedUp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-tasks'] });
      Alert.alert('Done', 'Pickup marked! Admin will confirm receipt.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelByWorker(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-tasks'] }),
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Failed'),
  });

  if (isLoading) return <LoadingScreen />;

  const assigned  = (tasks as any[]).filter((t) => t.status === 'ASSIGNED');
  const pickedUp  = (tasks as any[]).filter((t) => t.status === 'PICKED_UP');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={T.h1}>My Tasks</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {user?.fullName?.split(' ')[0] ?? 'Worker'} · {tasks.length} tasks
            </Text>
          </View>
          <TouchableOpacity onPress={logout}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray300 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray600 }}>Logout</Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 && (
          <EmptyState title="No tasks assigned" message="Admin will assign cash pickup tasks here." />
        )}

        {/* Picked-up tasks (awaiting admin confirmation) */}
        {pickedUp.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Awaiting Admin Confirmation
            </Text>
            {pickedUp.map((t: any) => (
              <Card key={t.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: C.green }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    Member {t.memberId?.slice(0, 8)}…
                  </Text>
                  <Badge status="PICKED_UP" />
                </View>
                <Amount value={t.requestedAmount} size="sm" color={C.green} />
                <Text style={{ fontSize: 12, color: C.green, marginTop: 4 }}>
                  You marked pickup at {fmtDateTime(t.pickedUpAt)}
                </Text>
                {t.notes && <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic', marginTop: 4 }}>"{t.notes}"</Text>}
              </Card>
            ))}
          </View>
        )}

        {/* Assigned tasks */}
        {assigned.length > 0 && (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              To Collect ({assigned.length})
            </Text>
            {assigned.map((t: any) => (
              <Card key={t.id} style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.amber }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    Member {t.memberId?.slice(0, 8)}…
                  </Text>
                  <Badge status="ASSIGNED" />
                </View>
                <Amount value={t.requestedAmount} size="sm" />
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>
                  Assigned {fmtDateTime(t.assignedAt)}
                </Text>
                {t.scheduledFor && (
                  <Text style={{ fontSize: 12, color: '#7C3AED', marginTop: 2 }}>
                    Scheduled: {fmtDateTime(t.scheduledFor)}
                  </Text>
                )}
                {t.notes && <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic', marginTop: 4 }}>"{t.notes}"</Text>}

                <Divider />

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    label="Mark Picked Up"
                    variant="success"
                    size="sm"
                    onPress={() => Alert.alert(
                      'Confirm Pickup',
                      `Confirm you collected cash from this member?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm', onPress: () => pickupMut.mutate(t.id) },
                      ]
                    )}
                    loading={pickupMut.isPending}
                  />
                  <Button
                    label="Cancel Task"
                    variant="ghost"
                    size="sm"
                    onPress={() => Alert.alert('Cancel Task', 'Cancel this task? Admin will be notified.', [
                      { text: 'No', style: 'cancel' },
                      { text: 'Cancel Task', style: 'destructive', onPress: () => cancelMut.mutate({ id: t.id }) },
                    ])}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
