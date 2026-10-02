import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import { getMemberConversationUnread, getMyChitfundRequests } from '../../../services/api';
import { TutorialSettingsRow } from '../../../tutorials/TutorialProvider';
import { useToolkitStore } from '../../../store/toolkitStore';

interface NavItem {
  emoji: string;
  label: string;
  description: string;
  route: string;
  badge?: number;
  accent?: string;
}

const OPACITY_STEPS = [
  { label: 'Ghost', value: 0.25 }, { label: 'Dim', value: 0.5 },
  { label: 'Normal', value: 0.75 }, { label: 'Full', value: 1.0 },
];
const SIZE_STEPS = [
  { label: 'S', value: 36 }, { label: 'M', value: 44 }, { label: 'L', value: 52 },
];

function MemberToolkitSettingsCard() {
  const { enabled, opacity, buttonSize, setEnabled, setOpacity, setButtonSize } = useToolkitStore();
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 2,
      borderWidth: 1, borderColor: C.gray100,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: enabled ? 14 : 0 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.navy + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>⌗</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Quick Toolkit</Text>
          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Floating calculator & refresh</Text>
        </View>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: C.navy, false: C.gray200 }} thumbColor="#fff" />
      </View>
      {enabled && (
        <>
          <View style={{ height: 1, backgroundColor: C.gray100, marginBottom: 14 }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>OPACITY</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {OPACITY_STEPS.map((s) => (
              <TouchableOpacity key={s.label} onPress={() => setOpacity(s.value)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: Math.abs(opacity - s.value) < 0.05 ? C.navy : C.gray100 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Math.abs(opacity - s.value) < 0.05 ? '#fff' : C.gray600 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>SIZE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SIZE_STEPS.map((s) => (
              <TouchableOpacity key={s.label} onPress={() => setButtonSize(s.value)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: buttonSize === s.value ? C.navy : C.gray100 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: buttonSize === s.value ? '#fff' : C.gray600 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 12 }}>
            Tap → calculator · Long-press → refresh · Drag to move · Shake to toggle
          </Text>
        </>
      )}
    </View>
  );
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

        {/* Nav items */}
        <View style={{ gap: 10 }}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              accessibilityLabel={item.label}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
              style={{
                backgroundColor: C.surface, borderRadius: 16, padding: 16,
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
          <TutorialSettingsRow />
          <MemberToolkitSettingsCard />
        </View>

        {/* Footer */}
        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>ChitWise Member</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
