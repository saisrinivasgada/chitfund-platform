import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { C, Button, Input } from '../../components/ui';
import OtpCodeInput from '../../components/OtpCodeInput';
import { forgotPasswordResetWithToken, getPublicChitfundRequest, sendChitfundRequestRecoveryEmailOtp, verifyChitfundRequestRecoveryEmailOtp } from '../../services/api';

function validatePassword(value: string) {
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) return 'Use uppercase, lowercase, a number and a special character';
  return '';
}

export default function ChitfundRequestLanding() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [step, setStep] = useState<'details'|'otp'|'password'|'done'>('details');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const request = useQuery({ queryKey: ['public-chitfund-request-mobile', token], queryFn: () => getPublicChitfundRequest(token), enabled: !!token, retry: false });
  const send = useMutation({ mutationFn: () => sendChitfundRequestRecoveryEmailOtp(token), onSuccess: () => { setError(''); setStep('otp'); }, onError: (e: any) => setError(e.response?.data?.message ?? 'Email recovery is unavailable') });
  const verify = useMutation({ mutationFn: () => verifyChitfundRequestRecoveryEmailOtp(token, otp), onSuccess: (data: any) => { setResetToken(data.resetToken); setError(''); setStep('password'); }, onError: (e: any) => setError(e.response?.data?.message ?? 'Incorrect or expired OTP') });
  const reset = useMutation({ mutationFn: async () => { if (password !== confirm) throw new Error("Passwords don't match"); const issue = validatePassword(password); if (issue) throw new Error(issue); await forgotPasswordResetWithToken({ resetToken, newPassword: password }); }, onSuccess: () => { setError(''); setStep('done'); }, onError: (e: any) => setError(e.response?.data?.message ?? e.message ?? 'Password reset failed') });
  const data: any = request.data;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22 }}><View style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.gray200, padding: 22 }}>
    <Text style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>Chitfund Request</Text>
    {request.isLoading && <Text style={{ marginTop: 12, color: C.gray500 }}>Loading request…</Text>}
    {(request.isError || !token) && <Text style={{ marginTop: 12, color: C.red }}>This link is invalid, expired, or replaced. Ask the organization to resend it.</Text>}
    {data && step === 'details' && <View style={{ gap: 14, marginTop: 14 }}><Text style={{ fontSize: 18, fontWeight: '700', color: C.gray900 }}>{data.organizationName} wants to connect</Text><Text style={{ color: C.gray600, lineHeight: 20 }}>Sign in, then verify a fresh phone OTP before accepting. Other organizations remain private.</Text><Text style={{ color: C.gray500 }}>Phone {data.maskedPhone} · expires {new Date(data.expiresAt).toLocaleString()}</Text><Button label="Sign in to continue" fullWidth onPress={() => router.replace('/(auth)/login')} />{data.emailRecoveryAvailable ? <Button label={`Forgot password? Verify ${data.maskedEmail}`} variant="outline" fullWidth loading={send.isPending} onPress={() => send.mutate()} /> : <Text style={{ fontSize: 12, color: C.gray500, textAlign: 'center' }}>Use normal mobile-OTP recovery on the login screen, or ask the organization to raise an Account Access ticket.</Text>}</View>}
    {data && step === 'otp' && <View style={{ gap: 14, marginTop: 14 }}><Text style={{ fontSize: 18, fontWeight: '700' }}>Verify recovery email</Text><Text style={{ color: C.gray500 }}>Enter the code sent to {data.maskedEmail}.</Text><OtpCodeInput value={otp} onChangeText={setOtp}/><Button label="Verify email" fullWidth disabled={otp.length !== 6} loading={verify.isPending} onPress={() => verify.mutate()} /></View>}
    {data && step === 'password' && <View style={{ gap: 12, marginTop: 14 }}><Text style={{ fontSize: 18, fontWeight: '700' }}>Choose a new password</Text><Input label="New password" value={password} onChangeText={setPassword} secureTextEntry/><Input label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry/><Button label="Reset password" fullWidth loading={reset.isPending} onPress={() => reset.mutate()} /></View>}
    {data && step === 'done' && <View style={{ gap: 14, marginTop: 14 }}><Text style={{ fontSize: 18, fontWeight: '700', color: C.green }}>Password updated</Text><Text style={{ color: C.gray600 }}>All old sessions and trusted devices were revoked. Sign in and complete phone verification.</Text><Button label="Sign in" fullWidth onPress={() => router.replace('/(auth)/login')} /></View>}
    {!!error && <Text style={{ color: C.red, marginTop: 14 }}>{error}</Text>}
  </View></ScrollView></SafeAreaView>;
}
