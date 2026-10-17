import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import { getMemberConversationUnread, getMyChitfundRequests } from '../../../services/api';
import { TutorialSettingsRow } from '../../../tutorials/TutorialProvider';
import { ToolkitSettingsRow } from '../../../components/ToolkitSettingsRow';
import { MoreSection, MoreNavigationRows } from '../../../components/MoreNavigation';

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

  const chatEnabled = user?.chatEnabled === true;
  const { data: chitfundRequests = [] } = useQuery({
    queryKey: ['m-chitfund-requests'], queryFn: getMyChitfundRequests, refetchInterval: 60_000,
  });
  const chitfundRequestCount = (chitfundRequests as any[]).filter(r => r.status === 'PENDING_MEMBER').length;

  const items: NavItem[] = [
    {
      emoji: '₹',
      label: 'Finance',
      description: 'Payments, balances & history',
      route: '/(app)/(member)/payments',
      accent: '#059669',
    },
    {
      emoji: '📝',
      label: 'Payment Intimations',
      description: 'Report a payment your admin missed',
      route: '/(app)/(member)/intimations',
      accent: '#D97706',
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
    {
      emoji: '🏢',
      label: 'Chitfund Requests',
      description: 'Connect another organization',
      route: '/(app)/(member)/chitfund-requests',
      badge: chitfundRequestCount || undefined,
      accent: '#7C3AED',
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
      emoji: '🔔',
      label: 'Reminders',
      description: 'Payment reminders from your admin',
      route: '/(app)/(member)/reminders',
      accent: '#D97706',
    },
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

        <MoreSection title="My finances"><MoreNavigationRows items={items} labels={['Finance', 'Payment Intimations', 'Payouts']} /></MoreSection>
        <MoreSection title="Chit requests"><MoreNavigationRows items={items} labels={['Invitations', 'Chitfund Requests']} /></MoreSection>
        <MoreSection title="Communication"><MoreNavigationRows items={items} labels={['Messages', 'Reminders']} /></MoreSection>
        <MoreSection title="App settings"><ToolkitSettingsRow /><TutorialSettingsRow /></MoreSection>
        <MoreSection title="Account & help"><MoreNavigationRows items={items} labels={['My Account', 'Support']} /></MoreSection>

        {/* Footer */}
        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>ChitWise Member</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
