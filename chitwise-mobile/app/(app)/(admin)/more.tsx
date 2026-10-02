import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useUIStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';
import { getConversationUnread } from '../../../services/api';
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
  { label: 'Ghost',  value: 0.25 },
  { label: 'Dim',    value: 0.5  },
  { label: 'Normal', value: 0.75 },
  { label: 'Full',   value: 1.0  },
];

const SIZE_STEPS = [
  { label: 'S', value: 36 },
  { label: 'M', value: 44 },
  { label: 'L', value: 52 },
];

function ToolkitSettingsCard() {
  const { enabled, opacity, buttonSize, setEnabled, setOpacity, setButtonSize } = useToolkitStore();

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 2,
      borderWidth: 1, borderColor: C.gray100,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.navy + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>⌗</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Quick Toolkit</Text>
          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Floating calculator & screen refresh</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: C.navy, false: C.gray200 }}
          thumbColor="#fff"
        />
      </View>

      {enabled && (
        <>
          <View style={{ height: 1, backgroundColor: C.gray100, marginBottom: 14 }} />

          {/* Opacity */}
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>BUTTON OPACITY</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {OPACITY_STEPS.map((s) => (
              <TouchableOpacity
                key={s.label}
                onPress={() => setOpacity(s.value)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                  backgroundColor: Math.abs(opacity - s.value) < 0.05 ? C.navy : C.gray100,
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: '600',
                  color: Math.abs(opacity - s.value) < 0.05 ? '#fff' : C.gray600,
                }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Size */}
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>BUTTON SIZE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SIZE_STEPS.map((s) => (
              <TouchableOpacity
                key={s.label}
                onPress={() => setButtonSize(s.value)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                  backgroundColor: buttonSize === s.value ? C.navy : C.gray100,
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: '600',
                  color: buttonSize === s.value ? '#fff' : C.gray600,
                }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 12 }}>
            Tap to open calculator · Long-press to refresh screen · Drag to reposition · Shake phone to toggle
          </Text>
        </>
      )}
    </View>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const { activityBadge } = useUIStore();
  const { user } = useAuthStore();

  const { data: msgUnread = 0 } = useQuery({
    queryKey: ['m-convUnread'],
    queryFn: getConversationUnread,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const chatEnabled = user?.chatEnabled !== false;

  const items: NavItem[] = [
    ...(chatEnabled ? [{
      emoji: '💬',
      label: 'Messages',
      description: 'Chat with members and groups',
      route: '/(app)/(admin)/messages',
      badge: (msgUnread as number) > 0 ? (msgUnread as number) : undefined,
      accent: C.navy,
    }] : []),
    {
      emoji: '◈',
      label: 'Activity Log',
      description: 'All actions & audit trail',
      route: '/(app)/(admin)/activity',
      badge: activityBadge > 0 ? activityBadge : undefined,
      accent: C.navy,
    },
    {
      emoji: '📊',
      label: 'Reports',
      description: 'Member & payment reports',
      route: '/(app)/(admin)/reports',
      accent: C.navy,
    },
    {
      emoji: '📝',
      label: 'Team Notes',
      description: 'Shared notes for your team',
      route: '/(app)/(admin)/notes',
      accent: '#D97706',
    },
    {
      emoji: '✦',
      label: 'Team',
      description: 'Manage staff & managers',
      route: '/(app)/(admin)/team',
      accent: '#059669',
    },
    {
      emoji: '◎',
      label: 'Plan & Billing',
      description: 'Subscription, credits & referral',
      route: '/(app)/(admin)/billing',
      accent: '#D97706',
    },
    {
      emoji: '🛡️',
      label: 'Roles & Permissions',
      description: 'What each role can do',
      route: '/(app)/(admin)/roles',
      accent: C.navyLight,
    },
    {
      emoji: '🏢',
      label: 'My Organization',
      description: 'Org details, hub & settings',
      route: '/(app)/(admin)/my-org',
      accent: C.navy,
    },
    {
      emoji: '🎧',
      label: 'Support',
      description: 'Get help · raise a ticket',
      route: '/(app)/(admin)/support',
      accent: '#059669',
    },
    {
      emoji: '👤',
      label: 'My Account',
      description: 'Profile, password & settings',
      route: '/(app)/(admin)/my-account',
      accent: C.navy,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <View>
            <Text style={T.h1}>More</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              Additional tools & settings
            </Text>
          </View>
          <ProfileAvatarButton size={38} />
        </View>

        {/* Navigation grid */}
        <View style={{ gap: 10 }}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              accessibilityLabel={item.label}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
              style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 2,
                borderWidth: 1,
                borderColor: C.gray100,
              }}
            >
              {/* Icon */}
              <View style={{
                width: 46, height: 46, borderRadius: 14,
                backgroundColor: (item.accent ?? C.navy) + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              </View>

              {/* Text */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>{item.description}</Text>
              </View>

              {/* Badge or arrow */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {item.badge != null && item.badge > 0 && (
                  <View style={{
                    backgroundColor: C.red,
                    borderRadius: 10, minWidth: 20, height: 20,
                    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{item.badge}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
          <TutorialSettingsRow />
          <ToolkitSettingsCard />
        </View>

        {/* Version / org info */}
        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>
            Logged in as {user?.fullName ?? user?.username} · {user?.role}
          </Text>
          <Text style={{ fontSize: 11, color: C.gray300, marginTop: 3 }}>ChitWise Admin</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
