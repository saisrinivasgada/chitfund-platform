import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, C, Input, LoadingScreen } from '../../components/ui';
import OtpCodeInput from '../../components/OtpCodeInput';
import { completeChitfundAccountSetup, getPublicChitfundRequest, sendChitfundSetupEmailOtp } from '../../services/api';

export default function SetupAccountScreen() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [email, setEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');

  const { data: requestDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['chitfund-request-public', token],
    queryFn: () => getPublicChitfundRequest(token),
    enabled: !!token,
  });

  // Phone OTP is required only when SMS provider delivered it
  const phoneOtpRequired = requestDetails ? !requestDetails.phoneVerificationPending : true;

  const sendEmail = useMutation({
    mutationFn: () => sendChitfundSetupEmailOtp(token, email.trim().toLowerCase()),
    onSuccess: () => { setEmailSent(true); setEmailOtp(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Could not send email OTP'),
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('This setup link is missing its token');
      if (username.trim().length < 3) throw new Error('Choose a username with at least 3 characters');
      if (phoneOtpRequired && phoneOtp.length !== 6) throw new Error('Enter the six-digit phone OTP');
      if (!email.trim() || !emailSent || emailOtp.length !== 6) throw new Error('Verify your recovery email');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      if (password !== confirm) throw new Error('Passwords do not match');
      if (!terms) throw new Error('Accept the Terms of Service to continue');
      return completeChitfundAccountSetup({
        token,
        username: username.trim().toLowerCase(),
        newPassword: password,
        fullName: fullName.trim() || undefined,
        phoneOtp: phoneOtpRequired ? phoneOtp : undefined,
        email: email.trim().toLowerCase(),
        emailOtp,
        termsAccepted: true,
      });
    },
    onSuccess: () => Alert.alert(
      'Account ready',
      'Your ChitWise account is set up. You can now sign in to this organisation.',
      [{ text: 'Go to sign in', onPress: () => router.replace('/(auth)/login') }],
    ),
    onError: (e: any) => setError(e.response?.data?.message ?? e.message ?? 'Setup failed'),
  });

  if (detailsLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.gray200, padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>Create your ChitWise account</Text>
          <Text style={{ color: C.gray600, lineHeight: 20 }}>
            You choose the credentials. Your organisation cannot view your password.
          </Text>
          {requestDetails?.organizationName && (
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 13, color: '#1D4ED8', fontWeight: '600' }}>
                Invited by {requestDetails.organizationName}
              </Text>
            </View>
          )}
          {!token && (
            <Text style={{ color: C.red }}>This setup link is invalid. Ask the organisation to resend it.</Text>
          )}

          <Input label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your name" />
          <Input
            label="Username *"
            value={username}
            onChangeText={v => setUsername(v.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
            autoCapitalize="none"
            placeholder="your.username"
          />

          {phoneOtpRequired ? (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700 }}>Phone OTP *</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>
                Enter the code sent to {requestDetails?.maskedPhone ?? 'your phone'}.
              </Text>
              <OtpCodeInput value={phoneOtp} onChangeText={setPhoneOtp} />
            </>
          ) : (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400E' }}>Phone verification pending</Text>
              <Text style={{ fontSize: 12, color: '#78350F', lineHeight: 18, marginTop: 4 }}>
                SMS delivery is not yet configured. Your phone number will be verified once it becomes available.
                You can still set up your account now using email verification only.
              </Text>
            </View>
          )}

          <Input
            label="Recovery email *"
            value={email}
            onChangeText={v => { setEmail(v); setEmailSent(false); setEmailOtp(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />
          <Button
            label={emailSent ? 'Resend email OTP' : 'Send email OTP'}
            variant="outline"
            fullWidth
            loading={sendEmail.isPending}
            disabled={!email.trim()}
            onPress={() => sendEmail.mutate()}
          />
          {emailSent && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700 }}>Email OTP *</Text>
              <OtpCodeInput value={emailOtp} onChangeText={setEmailOtp} />
            </>
          )}

          <Input label="Password *" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          <Input label="Confirm password *" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />

          <TouchableOpacity onPress={() => setTerms(v => !v)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ width: 21, height: 21, borderWidth: 1.5, borderColor: terms ? C.navy : C.gray400, backgroundColor: terms ? C.navy : C.white, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}>
              {terms && <Text style={{ color: C.white }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, color: C.gray700, fontSize: 13 }}>I accept the Terms of Service</Text>
          </TouchableOpacity>

          {!!error && <Text style={{ color: C.red }}>{error}</Text>}
          <Button
            label="Create account"
            fullWidth
            loading={complete.isPending}
            disabled={!token || complete.isPending}
            onPress={() => complete.mutate()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
