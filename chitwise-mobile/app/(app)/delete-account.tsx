import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { AccountDeletionRequest, getMyDeletionRequest, requestMyAccountDeletion } from '../../services/api';

const EMAIL_LINK = 'mailto:help@thechitwise.com?subject=ChitWise%20account%20deletion%20request';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [confirmation, setConfirmation] = useState('');
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);
  const isOrganisationAccount = user?.authSource !== 'HUB';
  const hasRequest = Boolean(request?.requestId || (request?.status && request.status !== 'NONE'));

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    setChecked(false);
    setRequest(null);
    try {
      setRequest(await getMyDeletionRequest());
      setChecked(true);
    } catch {
      setError('Could not load your request status. You can contact our privacy team below.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOrganisationAccount && user) checkStatus();
  }, [isOrganisationAccount, user?.id, checkStatus]);

  const submit = async () => {
    if (!checked || hasRequest || confirmation !== 'DELETE' || loading || !isOrganisationAccount) return;
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    keyRef.current ??= Crypto.randomUUID();
    try {
      setRequest(await requestMyAccountDeletion(keyRef.current));
      setConfirmation('');
      setChecked(true);
      Alert.alert('Request received', 'We will verify your identity and let you know what can be deleted and what financial records must be kept.');
    } catch (err: any) {
      setError(err?.response?.status === 404
        ? 'Online deletion requests are not yet available. Please email our privacy team below to start your request.'
        : err?.response?.data?.message ?? 'Could not submit your request. Please try again or contact our privacy team.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 16, paddingVertical: 5 }}>
          <Text style={{ fontSize: 24, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Delete my account</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: C.gray200 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy }}>Request account deletion</Text>
            <Text style={{ fontSize: 14, color: C.gray600, lineHeight: 21, marginTop: 12 }}>
              Ask us to remove your ChitWise sign-in account and personal data that is no longer needed. We will verify your identity, give you an expected timeline, and confirm the outcome.
            </Text>

            <View style={{ backgroundColor: '#FFF7E6', borderRadius: 12, borderWidth: 1, borderColor: '#F3D9A4', padding: 14, marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#744B0A' }}>Financial records may need to stay</Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: '#744B0A', marginTop: 6 }}>
                Chit, installment, payout, payment, receipt, and audit records may be retained where your organisation or applicable law requires them. We will explain what is kept and why. Deletion does not cancel a subscription or change an outstanding balance.
                If you have a saved offline payment, sync or resolve it before the account is removed.
              </Text>
            </View>

            <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, marginTop: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700 }}>CURRENT SIGN-IN ACCOUNT</Text>
              <Text style={{ fontSize: 14, color: C.gray900, marginTop: 4 }}>{user?.fullName ?? user?.username ?? 'ChitWise user'}</Text>
              {user?.tenantName ? <Text style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{user.tenantName}</Text> : null}
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 6 }}>This request concerns this sign-in identity across linked organisations. Other separately saved sign-ins are separate.</Text>
            </View>

            {isOrganisationAccount && !checked && (loading
              ? <Text accessibilityRole="text" style={{ fontSize: 13, color: C.gray600, marginTop: 18 }}>Checking for an existing request…</Text>
              : <TouchableOpacity onPress={checkStatus} style={{ paddingVertical: 12, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 13, color: C.navy, fontWeight: '700', textDecorationLine: 'underline' }}>Retry request status</Text>
                </TouchableOpacity>)}

            {!isOrganisationAccount ? (
              <Text style={{ fontSize: 13, color: C.gray600, lineHeight: 20, marginTop: 18 }}>Hub and platform accounts use a separate identity review. Email our privacy team below to start the request.</Text>
            ) : hasRequest ? (
              <View style={{ backgroundColor: '#EFF4FA', borderRadius: 12, padding: 14, marginTop: 18 }}>
                <Text style={{ color: C.navy, fontWeight: '700' }}>Request {request?.status?.toLowerCase().replaceAll('_', ' ') ?? 'received'}</Text>
                {request?.requestId ? <Text style={{ color: C.gray700, marginTop: 4 }}>Reference: {request.requestId}</Text> : null}
                {request?.nextStep ? <Text style={{ color: C.gray700, marginTop: 8 }}>{request.nextStep}</Text> : null}
              </View>
            ) : checked ? (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '700', marginBottom: 8 }}>Type DELETE to request account deletion</Text>
                <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false}
                  placeholder="DELETE" placeholderTextColor={C.gray400} accessibilityLabel="Type DELETE to confirm"
                  style={{ borderWidth: 1, borderColor: C.gray300, backgroundColor: C.white, borderRadius: 10, padding: 13, fontSize: 16, color: C.gray900 }} />
                <TouchableOpacity onPress={submit} disabled={confirmation !== 'DELETE' || loading}
                  style={{ backgroundColor: '#B91C1C', borderRadius: 11, padding: 15, alignItems: 'center', marginTop: 14, opacity: confirmation !== 'DELETE' || loading ? 0.5 : 1 }}>
                  <Text style={{ color: C.white, fontWeight: '700', fontSize: 14 }}>{loading ? 'Submitting…' : 'Request account deletion'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 13, marginTop: 12 }}>{error}</Text> : null}

            <View style={{ borderTopWidth: 1, borderTopColor: C.gray200, marginTop: 26, paddingTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Cannot sign in or need help?</Text>
              <Text style={{ fontSize: 13, color: C.gray600, lineHeight: 19, marginTop: 4 }}>Email help@thechitwise.com with the account you want to close. We will verify you using a registered contact method. Do not send passwords, OTPs, Aadhaar, or PAN.</Text>
              <TouchableOpacity onPress={() => Linking.openURL(EMAIL_LINK)} style={{ paddingVertical: 12, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, textDecorationLine: 'underline' }}>Email a deletion request</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 22, marginTop: 8 }}>
                <Text accessibilityRole="link" onPress={() => Linking.openURL('https://thechitwise.com/privacy')} style={{ fontSize: 12, color: C.navy, textDecorationLine: 'underline' }}>Privacy Policy</Text>
                <Text accessibilityRole="link" onPress={() => Linking.openURL('https://thechitwise.com/terms')} style={{ fontSize: 12, color: C.navy, textDecorationLine: 'underline' }}>Terms</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
