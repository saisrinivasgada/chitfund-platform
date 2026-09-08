import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import { getMemberConversationUnread } from '../../../services/api';

interface NavItem {
  emoji: string;
  label: string;
  description: string;
  route: string;
  badge?: number;
  accent?: string;
}

export default function MemberMoreScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const { data: msgUnread = 0 } = useQuery({
    queryKey: ['m-convUnread'],
    queryFn: getMemberConversationUnread,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const chatEnabled = user?.chatEnabled !== false;

  const items: NavItem[] = [
    {
      emoji: '₹',
      label: 'Finance',
      description: 'Payments, balances & history',
      route: '/(app)/(member)/payments',
      accent: '#059669',
    },
    {
      emoji: '📤',
      label: 'Payouts',
      description: 'Track your payout history',
      route: '/(app)/(member)/payouts',
      accent: '#059669',
    },
    {
      emoji: '📩',
      label: 'Invitations',
      description: 'Pending chit invitations',
      route: '/(app)/(member)/invitations',
      accent: C.navy,
    },
    ...(chatEnabled ? [{
      emoji: '💬',
      label: 'Messages',
      description: 'Chat with your admin',
      route: '/(app)/(member)/messages',
      badge: (msgUnread as number) > 0 ? (msgUnread as number) : undefined,
      accent: C.navy,
    }] : []),
    {
      emoji: '🙋',
      label: 'Support',
      description: 'Raise a request with your admin',
      route: '/(app)/(member)/support',
      accent: '#7C3AED',
    },
    {
      emoji: '👤',
      label: 'My Account',
      description: 'Profile & settings',
      route: '/(app)/(member)/my-account',
      accent: C.navy,
    },
  ];

  const initials = ((user?.fullName ?? user?.username ?? 'M') as string).slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Text style={T.h1}>More</Text>
        </View>

        {/* Profile card */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/(member)/my-account' as any)}
          activeOpacity={0.85}
          style={{
            backgroundColor: C.navy, borderRadius: 18, padding: 18,
            flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16,
            shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
          }}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#D4A017', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
              {user?.fullName ?? user?.username}
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>MEMBER</Text>
            </View>
          </View>
          <Text style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)' }}>›</Text>
        </TouchableOpacity>

        {/* Nav items */}
        <View style={{ gap: 10 }}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              accessibilityLabel={item.label}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
              style={{
                backgroundColor: C.white, borderRadius: 16, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
                borderWidth: 1, borderColor: C.gray100,
              }}
            >
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: (item.accent ?? C.navy) + '15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>{item.description}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {item.badge != null && item.badge > 0 && (
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{item.badge}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>ChitWise Member</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
