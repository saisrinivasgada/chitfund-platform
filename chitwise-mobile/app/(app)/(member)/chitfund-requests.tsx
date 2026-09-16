import { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptChitfundRequest, declineChitfundRequest, getMyChitfundRequests, sendChitfundRequestOtp } from '../../../services/api';
import { Button, C, LoadingScreen, T } from '../../../components/ui';
import OtpCodeInput from '../../../components/OtpCodeInput';

export default function ChitfundRequestsScreen() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const { data: requests = [], isLoading } = useQuery({ queryKey: ['my-chitfund-requests'], queryFn: getMyChitfundRequests });
  const begin = useMutation({ mutationFn: async (r: any) => { await sendChitfundRequestOtp(r.id); return r; }, onSuccess: setSelected, onError: (e: any) => Alert.alert('Could not send OTP', e.response?.data?.message ?? e.message) });
  const accept = useMutation({ mutationFn: () => acceptChitfundRequest(selected.id, otp), onSuccess: () => { setSelected(null); setOtp(''); qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }); }, onError: (e: any) => Alert.alert('Verification failed', e.response?.data?.message ?? e.message) });
  const decline = useMutation({ mutationFn: declineChitfundRequest, onSuccess: () => qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }) });
  if (isLoading) return <LoadingScreen />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}><ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}><Text style={T.h1}>Chitfund Requests</Text><Text style={{ color: C.gray500, marginBottom: 8 }}>Organizations asking to connect your member profile.</Text>
    {(requests as any[]).length === 0 && <View style={{ backgroundColor: C.white, borderRadius: 16, padding: 28 }}><Text style={{ textAlign: 'center', color: C.gray500 }}>No pending requests</Text></View>}
    {(requests as any[]).map((r: any) => <View key={r.id} style={{ backgroundColor: C.white, borderRadius: 16, padding: 16, gap: 8 }}><Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900 }}>{r.organizationName}</Text><Text style={{ color: C.gray500, fontSize: 12 }}>Phone {r.maskedPhone}</Text><Text style={{ color: C.amber, fontSize: 12, fontWeight: '700' }}>{String(r.status).replaceAll('_', ' ')}</Text>{r.status === 'PENDING_MEMBER' && <View style={{ flexDirection: 'row', gap: 8 }}><Button label="Decline" variant="outline" onPress={() => decline.mutate(r.id)} /><Button label="Verify & Accept" onPress={() => begin.mutate(r)} loading={begin.isPending} /></View>}</View>)}
    {selected && <View style={{ backgroundColor: C.white, borderRadius: 16, padding: 18, gap: 14 }}><Text style={{ fontSize: 16, fontWeight: '700' }}>Enter phone OTP</Text><OtpCodeInput value={otp} onChangeText={setOtp} /><Button label="Accept Request" disabled={otp.length !== 6} loading={accept.isPending} onPress={() => accept.mutate()} /><TouchableOpacity onPress={() => setSelected(null)}><Text style={{ textAlign: 'center', color: C.gray500 }}>Cancel</Text></TouchableOpacity></View>}
  </ScrollView></SafeAreaView>;
}
