import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { C, T } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useUIStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';
import { getConversationUnread } from '../../../services/api';
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

export default function MoreScreen() {
  const { activityBadge } = useUIStore();
  const { user } = useAuthStore();

  const { data: msgUnread = 0 } = useQuery({
    queryKey: ['m-convUnread'],
    queryFn: getConversationUnread,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const chatEnabled = user?.chatEnabled === true;
  const analyticsEnabled = user?.analyticsEnabled === true;

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
    ...(analyticsEnabled ? [{
      emoji: '📊',
      label: 'Reports',
      description: 'Member & payment reports',
      route: '/(app)/(admin)/reports',
      accent: C.navy,
    }] : []),
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

        <MoreSection title="Daily work"><MoreNavigationRows items={items} labels={['Reports', 'Activity Log', 'Messages', 'Team Notes']} /></MoreSection>
        <MoreSection title="Organisation"><MoreNavigationRows items={items} labels={['My Organization', 'Team', 'Roles & Permissions', 'Plan & Billing']} /></MoreSection>
        <MoreSection title="App settings"><ToolkitSettingsRow /><TutorialSettingsRow /></MoreSection>
        <MoreSection title="Account & help"><MoreNavigationRows items={items} labels={['My Account', 'Support']} /></MoreSection>

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
