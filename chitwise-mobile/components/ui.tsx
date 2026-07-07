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
  gray50:     '#F9FAFB',
  white:      '#FFFFFF',
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
      backgroundColor: C.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.gray200,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
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
  if (Platform.OS !== 'ios') {
    return (
      <View style={[{
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      }, style]}>
        <View style={{ padding: 16 }}>{children}</View>
      </View>
    );
  }
  // Outer View carries shadow (overflow:visible); BlurView clips to border radius
  return (
    <View style={[{
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
    }, style]}>
      <BlurView intensity={intensity} tint="systemUltraThinMaterial" style={{
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
      }}>
        <View style={{ padding: 16 }}>{children}</View>
      </BlurView>
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
  ghost:   { bg: C.gray100, text: C.gray700 },
  outline: { bg: C.white,   text: C.navy, border: C.navy },
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
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        borderWidth: s.border ? 1.5 : 0,
        borderColor: s.border,
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
  PENDING:              { bg: '#FEF3C7', text: '#D97706' },
  ASSIGNED:             { bg: '#DBEAFE', text: '#2563EB' },
  PICKED_UP:            { bg: '#D1FAE5', text: '#059669' },
  COLLECTED:            { bg: C.navy50,  text: C.navy },
  CANCELLED:            { bg: C.gray100, text: C.gray500 },
  ACTIVE:               { bg: '#D1FAE5', text: '#059669' },
  PAUSED:               { bg: '#FEF3C7', text: '#D97706' },
  COMPLETED:            { bg: C.navy50,  text: C.navy },
  DRAFT:                { bg: C.gray100, text: C.gray500 },
  INACTIVE:             { bg: '#FEE2E2', text: '#DC2626' },
  SUSPENDED:            { bg: '#FEE2E2', text: '#DC2626' },
  DISBURSED:            { bg: '#D1FAE5', text: '#059669' },
  PARTIALLY_DISBURSED:  { bg: '#DBEAFE', text: '#2563EB' },
  VOIDED:               { bg: '#FEE2E2', text: '#DC2626' },
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
  error,
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
        style={{
          borderWidth: 1.5,
          borderColor: error ? C.red : C.gray300,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          fontSize: 15,
          color: C.gray900,
          backgroundColor: C.white,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
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
      <Text style={{ fontSize: 11, fontWeight: '600', color: glass ? 'rgba(100,120,150,0.9)' : C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: accent ?? C.navy, marginTop: 4 }}>{value}</Text>
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
      style={{ padding: 6, borderRadius: 8, backgroundColor: amountsHidden ? C.navy50 : C.gray100 }}>
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
    <Animated.View style={{
      width: w ?? '100%', height: h, borderRadius: br,
      backgroundColor: C.gray200, opacity, marginTop: mt,
    }} />
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
            paddingHorizontal: 10, paddingVertical: 12, backgroundColor: C.white,
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
        <View style={{ flex: 1, backgroundColor: C.white }}>
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
