import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, ScrollView, StyleSheet, Platform, Modal as RNModal,
  Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView, BlurTint } from 'expo-blur';
import { useUIStore } from '../store/uiStore';

// ── Colors ──────────────────────────────────────────────────────────────────
export const C = {
  navy:       '#1E3A5F',
  navyLight:  '#2D5490',
  navy50:     '#EEF2F8',
  gold:       '#D4A017',
  goldLight:  '#F5D97A',
  green:      '#16A34A',
  red:        '#DC2626',
  amber:      '#D97706',
  gray900:    '#111827',
  gray700:    '#374151',
  gray600:    '#4B5563',
  gray500:    '#6B7280',
  gray400:    '#9CA3AF',
  gray300:    '#D1D5DB',
  gray200:    '#E5E7EB',
  gray100:    '#F3F4F6',
  gray50:     '#E8EDF3',
  surface:    '#E8EDF3',
  white:      '#FFFFFF',
};

export const NEO = {
  background: '#E8EDF3',
  surface: '#E8EDF3',
  highlight: '#FFFFFF',
  shadow: '#AEB9C7',
};

// Semantic colours are intentionally independent from the role/brand palette.
// Money and workflow state should mean the same thing on every screen:
// red = action/risk, amber = waiting/partial, green = complete/positive,
// blue = informational/in progress, gray = neutral or intentionally skipped.
export const SEMANTIC = {
  danger:  { solid: '#DC2626', text: '#B91C1C', soft: '#FEE2E2' },
  warning: { solid: '#D97706', text: '#B45309', soft: '#FEF3C7' },
  success: { solid: '#16A34A', text: '#047857', soft: '#D1FAE5' },
  info:    { solid: '#2563EB', text: '#1D4ED8', soft: '#DBEAFE' },
  neutral: { solid: '#6B7280', text: '#4B5563', soft: '#F3F4F6' },
};

// ── Typography ──────────────────────────────────────────────────────────────
export const T = StyleSheet.create({
  h1:    { fontSize: 26, fontWeight: '700', color: C.navy, letterSpacing: -0.5 },
  h2:    { fontSize: 20, fontWeight: '700', color: C.navy },
  h3:    { fontSize: 16, fontWeight: '600', color: C.gray900 },
  body:  { fontSize: 15, color: C.gray700 },
  sm:    { fontSize: 13, color: C.gray500 },
  xs:    { fontSize: 12, color: C.gray400 },
  label: { fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 },
  mono:  { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
});

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: NEO.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.78)',
      padding: 16,
      shadowColor: NEO.shadow,
      shadowOffset: { width: 6, height: 6 },
      shadowOpacity: 0.48,
      shadowRadius: 11,
      elevation: 5,
    }, style]}>
      {children}
    </View>
  );
}

// ── Glass Card — iOS frosted glass, Android opaque fallback ──────────────────
export function GlassCard({ children, style, intensity = 80 }: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
}) {
  return (
    <View style={[{
      borderRadius: 20,
      backgroundColor: NEO.surface,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.8)',
      shadowColor: NEO.shadow,
      shadowOffset: { width: 6, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 5,
    }, style]}>
      <View style={{ padding: 16 }}>{children}</View>
    </View>
  );
}

// ── Glass View — for non-card containers (tab bars, headers, sheets) ─────────
export function GlassView({ children, style, intensity = 80, tint = 'systemChromeMaterial' }: {
  children?: React.ReactNode;
  style?: any;
  intensity?: number;
  tint?: BlurTint;
}) {
  if (Platform.OS !== 'ios') {
    return <View style={[{ backgroundColor: 'rgba(255,255,255,0.94)' }, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={[{ overflow: 'hidden' }, style]}>
      {children}
    </BlurView>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'success' | 'danger' | 'ghost' | 'outline' | 'gold';

const BTN_STYLES: Record<BtnVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: C.navy,    text: C.white },
  success: { bg: C.green,   text: C.white },
  danger:  { bg: C.red,     text: C.white },
  ghost:   { bg: NEO.surface, text: C.gray700 },
  outline: { bg: NEO.surface, text: C.navy, border: C.navy },
  gold:    { bg: C.gold,    text: C.white },
};

export function Button({
  label, onPress, variant = 'primary', loading = false, disabled = false,
  size = 'md', fullWidth = false, icon,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}) {
  const s = BTN_STYLES[variant];
  const pad = size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 14 }
            : size === 'lg' ? { paddingVertical: 15, paddingHorizontal: 24 }
            : { paddingVertical: 11, paddingHorizontal: 18 };
  const fs  = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[{
        backgroundColor: (disabled || loading) ? C.gray300 : s.bg,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        borderWidth: s.border ? 1.5 : 0,
        borderColor: s.border,
        shadowColor: variant === 'ghost' || variant === 'outline' ? NEO.shadow : s.bg,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: disabled || loading ? 0.12 : 0.28,
        shadowRadius: 7,
        elevation: disabled || loading ? 0 : 3,
        ...(fullWidth ? { width: '100%' } : {}),
        ...pad,
      }]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={s.text} />
      ) : (
        <>
          {icon}
          <Text style={{ color: (disabled || loading) ? C.gray500 : s.text, fontWeight: '600', fontSize: fs }}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  // Waiting, incomplete, or attention required.
  PENDING:              { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PENDING_MEMBER:       { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  AWAITING_ADMIN:       { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  AWAITING_AUCTION:     { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  AWAITING_REMITTANCE:  { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PENDING_SYNC:         { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PARTIALLY_PAID:       { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PARTIAL_CREDIT:       { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PARTIALLY_COLLECTED:  { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PARTIALLY_DISBURSED:  { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  IN_PROGRESS:          { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  INVESTIGATING:        { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  ON_HOLD:              { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  PAUSED:               { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },
  SCHEDULED:            { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  UNALLOCATED:          { bg: SEMANTIC.warning.soft, text: SEMANTIC.warning.text },

  // Informational or currently being acted upon.
  ASSIGNED:             { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  OPEN:                 { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  MEMBER_VERIFIED:      { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  RESERVED:             { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  PROPOSED:             { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },
  EXECUTING:            { bg: SEMANTIC.info.soft, text: SEMANTIC.info.text },

  // Successfully completed or positive value.
  ACTIVE:               { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  PICKED_UP:            { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  COLLECTED:            { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  FULLY_COLLECTED:      { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  SETTLED:              { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  PAID:                 { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  APPROVED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  ACCEPTED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  INTERESTED:           { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  REMITTED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  PROCESSED:            { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  DISBURSED:            { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  FULLY_DISBURSED:      { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  BALANCED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  COMPLETED:            { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  CREDIT_COVERED:       { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  SYNCED:               { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  SENT:                 { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  RESOLVED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },
  EXECUTED:             { bg: SEMANTIC.success.soft, text: SEMANTIC.success.text },

  // Financial risk, failure, rejection, or destructive history.
  OUTSTANDING:          { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  OVERDUE:              { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  FAILED:               { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  EXECUTION_FAILED:     { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  CONFLICT:             { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  DECLINED:             { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  REJECTED:             { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  EXPIRED:              { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  REVOKED:              { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  ESCALATED:            { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  SUSPENDED:            { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  BLACKLISTED:          { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  CANCELLED:            { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },
  VOIDED:               { bg: SEMANTIC.danger.soft, text: SEMANTIC.danger.text },

  // Neutral historical states.
  DRAFT:                { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  INACTIVE:             { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  CLOSED:               { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  DELETED:              { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  SKIPPED:              { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  WAIVED:               { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  NOT_INTERESTED:       { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  SETTLEMENT_CLEARED:   { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
  PAYOUT_DEDUCTED:      { bg: SEMANTIC.neutral.soft, text: SEMANTIC.neutral.text },
};

export function Badge({ status }: { status: string }) {
  const s = BADGE_STYLES[status] ?? { bg: C.gray100, text: C.gray600 };
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: s.text }}>{status}</Text>
    </View>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({
  label, value, onChangeText, placeholder, secureTextEntry = false,
  keyboardType = 'default', autoCapitalize = 'none', multiline = false,
  error, returnKeyType, onSubmitEditing, editable = true,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  error?: string;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 4 }}>
      {label && <Text style={T.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        style={{
          borderWidth: 1,
          borderColor: error ? C.red : 'rgba(255,255,255,0.86)',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 11,
          fontSize: 15,
          color: editable ? C.gray900 : C.gray500,
          backgroundColor: editable ? NEO.surface : C.gray100,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          shadowColor: NEO.shadow,
          shadowOffset: { width: 3, height: 3 },
          shadowOpacity: editable ? 0.28 : 0.08,
          shadowRadius: 6,
          elevation: editable ? 2 : 0,
        }}
      />
      {error && <Text style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={T.h3}>{title}</Text>
      {action}
    </View>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, accent, onPress, glass = false }: {
  label: string; value: string; sub?: string; accent?: string; onPress?: () => void; glass?: boolean;
}) {
  const content = (
    <>
      <Text
        style={{ fontSize: 11, fontWeight: '600', color: glass ? 'rgba(100,120,150,0.9)' : C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {label}
      </Text>
      <Text
        style={{ fontSize: 22, fontWeight: '700', color: accent ?? C.navy, marginTop: 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {sub && <Text style={{ fontSize: 12, color: glass ? 'rgba(80,100,120,0.8)' : C.gray500, marginTop: 2 }}>{sub}</Text>}
    </>
  );
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} style={{ flex: 1 }}>
      {glass
        ? <GlassCard style={{ flex: 1 }}>{content}</GlassCard>
        : <Card>{content}</Card>
      }
    </TouchableOpacity>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 36, marginBottom: 12 }}>📭</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: C.gray700, textAlign: 'center' }}>{title}</Text>
      {message && <Text style={{ fontSize: 14, color: C.gray500, textAlign: 'center', marginTop: 6 }}>{message}</Text>}
    </View>
  );
}

// ── Amount ────────────────────────────────────────────────────────────────────
export function Amount({ value, size = 'md', color }: { value: number | string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string }) {
  const hidden = useUIStore((s) => s.amountsHidden);
  const fs = size === 'sm' ? 14 : size === 'lg' ? 22 : size === 'xl' ? 32 : 17;
  const num = Number(value);
  return (
    <Text style={{ fontSize: fs, fontWeight: '700', color: color ?? C.navy }}>
      {hidden ? '₹ ••••' : `₹${num.toLocaleString('en-IN')}`}
    </Text>
  );
}

// ── Eye Toggle ────────────────────────────────────────────────────────────────
export function EyeToggle({ size = 22 }: { size?: number }) {
  const { amountsHidden, toggleAmounts } = useUIStore();
  return (
    <TouchableOpacity onPress={toggleAmounts} activeOpacity={0.7}
      style={{
        padding: 7, borderRadius: 14, backgroundColor: NEO.surface,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)',
        shadowColor: NEO.shadow, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.4, shadowRadius: 7, elevation: 3,
      }}>
      <Text style={{ fontSize: size, lineHeight: size + 2 }}>{amountsHidden ? '🙈' : '👁'}</Text>
    </TouchableOpacity>
  );
}

// ── Screen Wrapper ────────────────────────────────────────────────────────────
export function Screen({ children, scroll = true, style }: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: object;
}) {
  const inner = (
    <View style={[{ flex: 1, backgroundColor: C.gray50, padding: 16 }, style]}>
      {children}
    </View>
  );
  if (!scroll) return inner;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.gray50 }}
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.gray200, marginVertical: 12 }} />;
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
export function LoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  const Bone = ({ w, h, br = 10, mt = 0 }: { w?: number | string; h: number; br?: number; mt?: number }) => (
    <View style={{ width: (w ?? '100%') as any, height: h, marginTop: mt }}>
      <Animated.View style={{ width: '100%', height: h, borderRadius: br, backgroundColor: C.gray200, opacity }} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ padding: 16, gap: 14 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 8 }}>
            <Bone w={130} h={22} />
            <Bone w={170} h={14} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Bone w={36} h={36} br={8} />
            <Bone w={36} h={36} br={8} />
            <Bone w={36} h={36} br={18} />
          </View>
        </View>

        {/* Hero card */}
        <Bone h={90} br={20} />

        {/* Stat cards — 3 rows of 2 */}
        {[0, 1, 2].map(row => (
          <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
            <Animated.View style={{ flex: 1, height: 72, borderRadius: 14, backgroundColor: C.gray200, opacity }} />
            <Animated.View style={{ flex: 1, height: 72, borderRadius: 14, backgroundColor: C.gray200, opacity }} />
          </View>
        ))}

        {/* List section */}
        <Bone w={110} h={18} br={6} mt={4} />
        {[0, 1, 2].map(i => <Bone key={i} h={60} br={14} />)}
      </View>
    </SafeAreaView>
  );
}

// ── List Loading Screen ───────────────────────────────────────────────────────
export function ListLoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const Bone = ({ w, h, br = 8, mt = 0 }: { w?: number | string; h: number; br?: number; mt?: number }) => (
    <View style={{ width: (w ?? '100%') as any, height: h, marginTop: mt }}>
      <Animated.View style={{ width: '100%', height: h, borderRadius: br, backgroundColor: C.gray200, opacity }} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ padding: 16, gap: 12 }}>
        {/* Search/filter bar */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Bone w="70%" h={36} br={10} />
          <Bone w="25%" h={36} br={10} />
        </View>
        {/* List rows */}
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Bone w={40} h={40} br={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone w="55%" h={14} />
              <Bone w="35%" h={11} />
            </View>
            <Bone w={60} h={14} br={6} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ── Row Item ──────────────────────────────────────────────────────────────────
export function RowItem({ onPress, left, right, sub }: {
  onPress?: () => void;
  left: React.ReactNode;
  right?: React.ReactNode;
  sub?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.gray200,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {left}
        {sub && <Text style={T.xs}>{sub}</Text>}
      </View>
      {right}
    </TouchableOpacity>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── PhoneInput ────────────────────────────────────────────────────────────────
export const COUNTRIES = [
  { code: '+91',  iso: 'IN', name: 'India',         flag: '🇮🇳' },
  { code: '+1',   iso: 'US', name: 'USA',           flag: '🇺🇸' },
  { code: '+44',  iso: 'GB', name: 'UK',            flag: '🇬🇧' },
  { code: '+1',   iso: 'CA', name: 'Canada',        flag: '🇨🇦' },
  { code: '+61',  iso: 'AU', name: 'Australia',     flag: '🇦🇺' },
  { code: '+64',  iso: 'NZ', name: 'New Zealand',   flag: '🇳🇿' },
  { code: '+971', iso: 'AE', name: 'UAE',           flag: '🇦🇪' },
  { code: '+966', iso: 'SA', name: 'Saudi Arabia',  flag: '🇸🇦' },
  { code: '+974', iso: 'QA', name: 'Qatar',         flag: '🇶🇦' },
  { code: '+965', iso: 'KW', name: 'Kuwait',        flag: '🇰🇼' },
  { code: '+973', iso: 'BH', name: 'Bahrain',       flag: '🇧🇭' },
  { code: '+968', iso: 'OM', name: 'Oman',          flag: '🇴🇲' },
  { code: '+65',  iso: 'SG', name: 'Singapore',     flag: '🇸🇬' },
  { code: '+60',  iso: 'MY', name: 'Malaysia',      flag: '🇲🇾' },
  { code: '+49',  iso: 'DE', name: 'Germany',       flag: '🇩🇪' },
  { code: '+33',  iso: 'FR', name: 'France',        flag: '🇫🇷' },
  { code: '+31',  iso: 'NL', name: 'Netherlands',   flag: '🇳🇱' },
  { code: '+81',  iso: 'JP', name: 'Japan',         flag: '🇯🇵' },
  { code: '+86',  iso: 'CN', name: 'China',         flag: '🇨🇳' },
  { code: '+27',  iso: 'ZA', name: 'South Africa',  flag: '🇿🇦' },
];

export function formatPhone(countryCode: string, phone: string) {
  if (!phone) return '';
  return `(${countryCode}) ${phone}`;
}

export function PhoneInput({
  label = 'Phone',
  required = false,
  countryCode = '+91',
  phone = '',
  onCountryChange,
  onPhoneChange,
}: {
  label?: string;
  required?: boolean;
  countryCode?: string;
  phone?: string;
  onCountryChange?: (code: string) => void;
  onPhoneChange?: (phone: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const filtered = search
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search) ||
        c.iso.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  function selectCountry(c: typeof COUNTRIES[0]) {
    onCountryChange?.(c.code);
    setPickerOpen(false);
    setSearch('');
  }

  return (
    <View>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>
          {label}{required ? ' *' : ''}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Country code selector */}
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 12, backgroundColor: C.surface,
          }}>
          <Text style={{ fontSize: 18, lineHeight: 22 }}>{selected.flag}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{selected.code}</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>▾</Text>
        </TouchableOpacity>

        {/* Phone number */}
        <TextInput
          value={phone}
          onChangeText={(t) => onPhoneChange?.(t.replace(/\D/g, '').slice(0, 15))}
          placeholder="Phone number"
          placeholderTextColor={C.gray400}
          keyboardType="phone-pad"
          style={{
            flex: 1, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10,
            padding: 12, fontSize: 14, color: C.gray900,
          }}
        />
      </View>

      {/* Country picker modal */}
      <RNModal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setPickerOpen(false); setSearch(''); }}>
        <View style={{ flex: 1, backgroundColor: C.surface }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingTop: Platform.OS === 'ios' ? 56 : 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Select Country</Text>
            <TouchableOpacity onPress={() => { setPickerOpen(false); setSearch(''); }}>
              <Text style={{ fontSize: 26, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>
          {/* Search */}
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 ?? C.gray200 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search country, code…"
              placeholderTextColor={C.gray400}
              autoFocus
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900 }}
            />
          </View>
          {/* List */}
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 24 }}>No countries found</Text>
            ) : (
              filtered.map((c) => (
                <TouchableOpacity
                  key={c.iso}
                  onPress={() => selectCountry(c)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 14, paddingHorizontal: 16,
                    backgroundColor: c.code === countryCode && c.iso === selected.iso ? C.navy50 : C.white,
                    borderBottomWidth: 1, borderBottomColor: C.gray100 ?? C.gray200,
                  }}>
                  <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 15, color: c.code === countryCode && c.iso === selected.iso ? C.navy : C.gray900 }}>{c.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray500 }}>{c.code}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </RNModal>
    </View>
  );
}
