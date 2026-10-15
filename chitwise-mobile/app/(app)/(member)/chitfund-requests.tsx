import { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptChitfundRequest, declineChitfundRequest,
  getMyChitfundRequests, sendChitfundRequestOtp,
} from '../../../services/api';
import { Button, C, LoadingScreen, T } from '../../../components/ui';
import OtpCodeInput from '../../../components/OtpCodeInput';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; description: string }> = {
  PENDING_MEMBER: {
    label: 'Action required',
    bg: '#FEF3C7', text: '#92400E',
    description: 'Tap "Verify & Accept" to confirm your identity and activate access.',
  },
  MEMBER_VERIFIED: {
    label: 'Verified',
    bg: '#DBEAFE', text: '#1D4ED8',
    description: 'Your identity was verified. Access is being activated.',
  },
  AWAITING_ADMIN: {
    label: 'Pending activation',
    bg: '#DBEAFE', text: '#1D4ED8',
    description: 'Your verification is complete — access is being activated.',
  },
  ACTIVE: {
    label: 'Active',
    bg: '#DCFCE7', text: '#15803D',
    description: 'You have active app access to this organisation.',
  },
  SUSPENDED: {
    label: 'Suspended',
    bg: '#FFF7ED', text: '#9A3412',
    description: 'Your app access for this organisation has been temporarily suspended. Contact the organisation for details.',
  },
  DECLINED: {
    label: 'Declined',
    bg: '#F3F4F6', text: '#6B7280',
    description: 'This request was declined.',
  },
  EXPIRED: {
    label: 'Expired',
    bg: '#FEE2E2', text: '#B91C1C',
    description: 'This request expired before you responded. Ask the organisation to send a new one.',
  },
  REVOKED: {
    label: 'Revoked',
    bg: '#F3F4F6', text: '#6B7280',
    description: 'App access was revoked by the organisation.',
  },
  ESCALATED: {
    label: 'Under review',
    bg: '#FEE2E2', text: '#B91C1C',
    description: 'This request has been escalated for manual review. ChitWise Support will be in touch.',
  },
};

export default function ChitfundRequestsScreen() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [otp, setOtp] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-chitfund-requests'],
    queryFn: getMyChitfundRequests,
  });

  const begin = useMutation({
    mutationFn: async (r: any) => { await sendChitfundRequestOtp(r.id); return r; },
    onSuccess: setSelected,
    onError: (e: any) => Alert.alert('Could not send OTP', e.response?.data?.message ?? e.message),
  });
  const accept = useMutation({
    mutationFn: () => acceptChitfundRequest(selected.id, otp),
    onSuccess: () => {
      setSelected(null);
      setOtp('');
      qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] });
    },
    onError: (e: any) => Alert.alert('Verification failed', e.response?.data?.message ?? e.message),
  });
  const decline = useMutation({
    mutationFn: (id: string) => declineChitfundRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }),
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Could not decline'),
  });

  if (isLoading) return <LoadingScreen />;

  const pending = (requests as any[]).filter(r => r.status === 'PENDING_MEMBER');
  const active = (requests as any[]).filter(r => r.status === 'ACTIVE');
  const others = (requests as any[]).filter(r => !['PENDING_MEMBER', 'ACTIVE'].includes(r.status));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={T.h1}>ChitWise App Access</Text>
        <Text style={{ color: C.gray500, marginBottom: 8 }}>
          Organisations can invite you to access their portal through ChitWise.
        </Text>

        {(requests as any[]).length === 0 && (
          <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 28 }}>
            <Text style={{ textAlign: 'center', color: C.gray500 }}>No access requests</Text>
          </View>
        )}

        {/* Action-required requests first */}
        {pending.map((r: any) => (
          <RequestCard
            key={r.id} r={r} onBegin={() => begin.mutate(r)} beginLoading={begin.isPending}
            onDecline={() => Alert.alert('Decline request', `Decline the request from ${r.organizationName}?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Decline', style: 'destructive', onPress: () => decline.mutate(r.id) },
            ])}
          />
        ))}

        {/* Active */}
        {active.map((r: any) => <RequestCard key={r.id} r={r} />)}

        {/* Other statuses */}
        {others.map((r: any) => <RequestCard key={r.id} r={r} />)}

        {/* OTP entry overlay */}
        {selected && (
          <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 18, gap: 14, borderWidth: 1.5, borderColor: C.navy }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>Verify your identity</Text>
            <Text style={{ fontSize: 13, color: C.gray500 }}>
              Enter the OTP sent to your phone to confirm your connection to{' '}
              <Text style={{ fontWeight: '700' }}>{selected.organizationName}</Text>.
            </Text>
            <OtpCodeInput value={otp} onChangeText={setOtp} />
            <Button
              label="Accept & connect"
              disabled={otp.length !== 6}
              loading={accept.isPending}
              onPress={() => accept.mutate()}
            />
            <TouchableOpacity onPress={() => { setSelected(null); setOtp(''); }}>
              <Text style={{ textAlign: 'center', color: C.gray500 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RequestCard({
  r,
  onBegin,
  beginLoading,
  onDecline,
}: {
  r: any;
  onBegin?: () => void;
  beginLoading?: boolean;
  onDecline?: () => void;
}) {
  const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, bg: '#F3F4F6', text: '#6B7280', description: '' };
  const isSuspended = r.status === 'SUSPENDED';
  const isPending = r.status === 'PENDING_MEMBER';

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 10,
      borderWidth: 1.5,
      borderColor: isSuspended ? '#FED7AA' : r.status === 'ACTIVE' ? '#86EFAC' : C.gray200,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900, flex: 1 }}>{r.organizationName}</Text>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bg }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: cfg.text }}>{cfg.label.toUpperCase()}</Text>
        </View>
      </View>

      {r.maskedPhone && (
        <Text style={{ fontSize: 12, color: C.gray500 }}>Phone: {r.maskedPhone}</Text>
      )}

      <Text style={{ fontSize: 12, color: C.gray600, lineHeight: 18 }}>{cfg.description}</Text>

      {r.expiresAt && isPending && (
        <Text style={{ fontSize: 11, color: C.gray400 }}>
          Expires {new Date(r.expiresAt).toLocaleDateString()}
        </Text>
      )}

      {r.status === 'ACTIVE' && r.phoneVerificationPending && (
        <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>Phone verification pending</Text>
          <Text style={{ fontSize: 12, color: '#78350F', lineHeight: 18, marginTop: 4 }}>
            Your phone number will be verified once SMS is available. Your access is active in the meantime.
          </Text>
        </View>
      )}

      {isPending && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={onDecline}
            style={{ flex: 1, alignItems: 'center', padding: 11, borderRadius: 9, borderWidth: 1, borderColor: C.gray300 }}>
            <Text style={{ color: C.red, fontWeight: '700' }}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onBegin}
            disabled={beginLoading}
            style={{ flex: 1, alignItems: 'center', padding: 11, borderRadius: 9, backgroundColor: C.navy }}>
            <Text style={{ color: C.white, fontWeight: '700' }}>
              {beginLoading ? 'Sending OTP…' : 'Verify & Accept'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isSuspended && (
        <View style={{ backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 12, color: '#9A3412', lineHeight: 18 }}>
            To restore access or get more information, contact the organisation directly or reach us at{' '}
            <Text style={{ fontWeight: '700' }}>help@thechitwise.com</Text>.
          </Text>
        </View>
      )}
    </View>
  );
}
