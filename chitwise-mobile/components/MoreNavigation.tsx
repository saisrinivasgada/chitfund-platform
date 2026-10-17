import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { C } from './ui';
export interface MoreNavItem { emoji: string; label: string; description: string; route: string; badge?: number; accent?: string }
export function MoreSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 10, marginTop: 20 }}><Text style={{ color: C.gray500, fontSize: 12, fontWeight: '700', marginLeft: 5, marginBottom: 2 }}>{title.toUpperCase()}</Text>{children}</View>;
}
export function MoreNavigationRows({ items, labels }: { items: MoreNavItem[]; labels: string[] }) {
  const router = useRouter();
  return <>{labels.map((label) => items.find((item) => item.label === label)).filter((item): item is MoreNavItem => !!item).map((item) =>
    <TouchableOpacity key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.push(item.route as any)}
      style={{ backgroundColor: C.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: C.gray100 }}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: (item.accent ?? C.navy) + '15', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{item.emoji}</Text></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>{item.label}</Text><Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{item.description}</Text></View>
      {!!item.badge && item.badge > 0 && <View style={{ backgroundColor: C.red, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}><Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>{item.badge}</Text></View>}
      <Text style={{ color: C.gray400, fontSize: 18 }}>›</Text>
    </TouchableOpacity>)}</>;
}
