import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C, T } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useUIStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';

interface NavItem {
  emoji: string;
  label: string;
  description: string;
  route: string;
  badge?: number;
  accent?: string;
}

export default function MoreScreen() {
  const router = useRouter();
  const { activityBadge } = useUIStore();
  const { user } = useAuthStore();

  const items: NavItem[] = [
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
      accent: '#7C3AED',
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
      accent: '#2563EB',
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
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
              style={{
                backgroundColor: C.white,
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
