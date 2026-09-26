import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { C } from './ui';

export function NeumorphicTabIcon({
  glyph,
  focused,
  size = 19,
}: {
  glyph: string;
  focused: boolean;
  size?: number;
}) {
  return (
    <View style={[styles.icon, focused && styles.iconActive]}>
      <Text style={{ fontSize: size, lineHeight: 22, fontWeight: '800', color: focused ? C.white : C.gray400 }}>
        {glyph}
      </Text>
    </View>
  );
}

export function NeumorphicTabBackground() {
  return (
    <BlurView
      intensity={Platform.OS === 'ios' ? 72 : 0}
      tint="light"
      style={[StyleSheet.absoluteFill, styles.background]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 91 : 72,
    paddingBottom: Platform.OS === 'ios' ? 23 : 7,
    paddingTop: 7,
    paddingHorizontal: 7,
    shadowColor: '#8290A1',
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.28,
    shadowRadius: 15,
    elevation: 16,
  },
  label: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  item: { borderRadius: 18 },
  background: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(232,237,243,0.90)' : '#E8EDF3',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
  },
  icon: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: C.navy,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: C.navy,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
});

export const neumorphicTabBarStyle = styles.bar;
export const neumorphicTabLabelStyle = styles.label;
export const neumorphicTabItemStyle = styles.item;
