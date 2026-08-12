import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../../components/ui';

type PermValue = '✓' | '~' | '—';

interface Row {
  label: string;
  ADMIN: PermValue;
  MANAGER: PermValue;
  STAFF: PermValue;
  note?: string;
}

interface Section {
  title: string;
  rows: Row[];
}

const SECTIONS: Section[] = [
  {
    title: 'Members',
    rows: [
      { label: 'View member list',                ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Add / edit members',              ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Create member portal login',      ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'View member transaction history', ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Reset member passwords',          ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Chit Funds',
    rows: [
      { label: 'View all chit funds',              ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Create / edit chit funds',         ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Activate / deactivate chit',       ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Manage enrollment & reservations', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Draws',
    rows: [
      { label: 'View draw results & winners', ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Open a draw',                 ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Skip a draw',                 ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Close / delete a draw',       ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Record draw winner',          ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Payments',
    rows: [
      { label: 'Record payments for members',       ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'View payment history',              ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Approve cash collection requests',  ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Cash pickups (field)',              ADMIN: '✓', MANAGER: '✓', STAFF: '✓' },
      { label: 'Void / cancel payment batches',    ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Pending remittance view',           ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Payouts',
    rows: [
      { label: 'View payouts',             ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Create payout record',     ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Disburse / cancel payout', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Treasury & Settlement',
    rows: [
      { label: 'Treasury overview',     ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Add wallet transaction', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Settlement operations', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'View reports',          ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Team',
    rows: [
      { label: 'View team members',            ADMIN: '✓', MANAGER: '~', STAFF: '—', note: 'Manager: cannot see other Admins' },
      { label: 'Add Staff / Manager accounts', ADMIN: '✓', MANAGER: '~', STAFF: '—', note: 'Manager: cannot create Admin accounts' },
      { label: 'Add Admin accounts',           ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Deactivate / remove staff',    ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'System',
    rows: [
      { label: 'View admin audit logs', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Plan & Billing',        ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
];

const ROLE_COLORS = {
  ADMIN:   { bg: '#EFF3F8', border: '#BFCFDE', text: '#1E3A5F' },
  MANAGER: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  STAFF:   { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A' },
};

function PermCell({ value }: { value: PermValue }) {
  const color = value === '✓' ? '#16A34A' : value === '~' ? '#D97706' : '#9CA3AF';
  return (
    <View style={{ width: 36, alignItems: 'center' }}>
      <Text style={{ fontSize: 15, color, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export default function RolesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.gray200,
        backgroundColor: C.white,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Roles & Permissions</Text>
          <Text style={{ fontSize: 12, color: C.gray400 }}>What each role can do</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Role badges */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {(['ADMIN', 'MANAGER', 'STAFF'] as const).map((role) => (
            <View key={role} style={{
              flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
              backgroundColor: ROLE_COLORS[role].bg,
              borderWidth: 1.5, borderColor: ROLE_COLORS[role].border,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: ROLE_COLORS[role].text }}>{role}</Text>
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20, backgroundColor: C.white, borderRadius: 12, padding: 12 }}>
          {[
            { sym: '✓', label: 'Full access', color: '#16A34A' },
            { sym: '~', label: 'Limited',     color: '#D97706' },
            { sym: '—', label: 'No access',   color: '#9CA3AF' },
          ].map((l) => (
            <View key={l.sym} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: l.color }}>{l.sym}</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>{l.label}</Text>
            </View>
          ))}
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: C.gray500,
              letterSpacing: 0.8, marginBottom: 8,
            }}>
              {section.title.toUpperCase()}
            </Text>
            <View style={{
              backgroundColor: C.white, borderRadius: 14,
              borderWidth: 1, borderColor: C.gray100,
              overflow: 'hidden',
            }}>
              {/* Column header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 14, paddingVertical: 8,
                backgroundColor: C.gray50,
                borderBottomWidth: 1, borderBottomColor: C.gray100,
              }}>
                <View style={{ flex: 1 }} />
                {(['ADMIN', 'MANAGER', 'STAFF'] as const).map((role) => (
                  <View key={role} style={{ width: 36, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ROLE_COLORS[role].text }}>{role.slice(0, 3)}</Text>
                  </View>
                ))}
              </View>

              {section.rows.map((row, i) => (
                <View key={row.label}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                  }}>
                    <Text style={{ flex: 1, fontSize: 13, color: C.gray900 }}>{row.label}</Text>
                    <PermCell value={row.ADMIN} />
                    <PermCell value={row.MANAGER} />
                    <PermCell value={row.STAFF} />
                  </View>
                  {row.note && (
                    <Text style={{ fontSize: 11, color: C.amber ?? '#D97706', paddingHorizontal: 14, paddingBottom: 8, marginTop: -6 }}>
                      ⚠ {row.note}
                    </Text>
                  )}
                  {i < section.rows.length - 1 && (
                    <View style={{ height: 1, backgroundColor: C.gray100, marginHorizontal: 14 }} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={{ fontSize: 12, color: C.gray400, textAlign: 'center', marginTop: 8 }}>
          Permissions are enforced at both the API gateway and service level.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
