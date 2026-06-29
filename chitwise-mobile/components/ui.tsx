import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, ScrollView, StyleSheet, Platform,
} from 'react-native';

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
  PENDING:   { bg: '#FEF3C7', text: '#D97706' },
  ASSIGNED:  { bg: '#DBEAFE', text: '#2563EB' },
  PICKED_UP: { bg: '#D1FAE5', text: '#059669' },
  COLLECTED: { bg: C.navy50,  text: C.navy },
  CANCELLED: { bg: C.gray100, text: C.gray500 },
  ACTIVE:    { bg: '#D1FAE5', text: '#059669' },
  PAUSED:    { bg: '#FEF3C7', text: '#D97706' },
  COMPLETED: { bg: C.navy50,  text: C.navy },
  DRAFT:     { bg: C.gray100, text: C.gray500 },
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
export function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: accent ?? C.navy, marginTop: 4 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{sub}</Text>}
    </Card>
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
export function Amount({ value, size = 'md', color }: { value: number | string; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const fs = size === 'sm' ? 14 : size === 'lg' ? 22 : 17;
  const num = Number(value);
  return (
    <Text style={{ fontSize: fs, fontWeight: '700', color: color ?? C.navy }}>
      ₹{num.toLocaleString('en-IN')}
    </Text>
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

// ── Loading Spinner ───────────────────────────────────────────────────────────
export function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.gray50 }}>
      <ActivityIndicator size="large" color={C.navy} />
    </View>
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
