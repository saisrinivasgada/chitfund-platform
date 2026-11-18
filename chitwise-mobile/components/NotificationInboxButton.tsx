import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '../services/api';
import { C } from './ui';
import { NotificationsModal } from './NotificationsModal';

export function NotificationInboxButton() {
  const [open, setOpen] = useState(false);
  const { data: unread = 0, isError } = useQuery({
    queryKey: ['m-unread'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={isError ? 'Notifications unavailable; tap to retry' : `Notifications, ${unread} unread`}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface,
          alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.gray200 }}
      >
        <Text style={{ fontSize: 21 }}>🔔</Text>
        {(unread > 0 || isError) && (
          <View style={{ position: 'absolute', right: 0, top: 0, minWidth: 16, height: 16,
            paddingHorizontal: 3, borderRadius: 8, backgroundColor: isError ? C.amber : C.navy,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: C.white }}>
              {isError ? '!' : unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      <NotificationsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
