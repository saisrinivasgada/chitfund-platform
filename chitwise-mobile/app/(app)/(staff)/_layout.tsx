import { Tabs } from 'expo-router';
import { Text, Platform, StyleSheet, View } from 'react-native';
import { C } from '../../../components/ui';
import { useStaffStartupPrefetch } from '../../../offline/useStartupPrefetch';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '◈', history: '≡' };
  return (
    <Text style={{ fontSize: 18, color: focused ? C.navy : C.gray400, marginBottom: -2 }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

export default function StaffLayout() {
  useStaffStartupPrefetch();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.gray400,
        tabBarBackground: () => <View style={[StyleSheet.absoluteFill, { backgroundColor: C.gray50 }]} />,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          shadowColor: '#AEB9C7', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.42, shadowRadius: 10, elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tabs.Screen name="index"   options={{ title: 'My Tasks' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
