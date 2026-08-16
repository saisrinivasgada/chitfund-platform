import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { PhoneInput, C } from './ui';
import { adminSendPhoneOtp, adminVerifyPhoneOtp } from '../services/api';

interface Props {
  phone: string;
  countryCode: string;
  /** undefined → creation mode (any phone must be verified).
   *  string     → edit mode (verification only when phone changes). */
  originalPhone?: string;
  onPhoneChange: (v: string) => void;
  onCountryChange: (cc: string) => void;
  onVerified: (verified: boolean) => void;
  label?: string;
  required?: boolean;
}

export function AdminPhoneOtpInput({
  phone,
  countryCode,
  originalPhone,
  onPhoneChange,
  onCountryChange,
  onVerified,
  label = 'Phone',
  required = false,
}: Props) {
  const [otpStep, setOtpStep] = useState<'pending' | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [resendBlocked, setResendBlocked] = useState(false);
  const [verified, setVerified] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCreation = originalPhone === undefined;
  const phoneChanged = !isCreation && phone !== originalPhone;
  const needsVerification = !!(phone && (isCreation || phoneChanged));

  // Reset whenever phone changes
  useEffect(() => {
    setVerified(false);
    setOtpStep(null);
    setOtpCode('');
    setOtpError('');
    setSendCount(0);
    setResendBlocked(false);
    onVerified(false);
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startTimer(seconds: number) {
    setOtpTimer(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setOtpTimer((t) => {
        if (t <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  function fmtSecs(s: number) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  }

  const sendMut = useMutation({
    mutationFn: adminSendPhoneOtp,
    onSuccess: () => {
      const nextCount = sendCount + 1;
      setSendCount(nextCount);
      setOtpStep('pending');
      setOtpCode('');
      setOtpError('');
      startTimer(nextCount * 60);
    },
    onError: (e: any) => {
      const code = e.response?.data?.errorCode;
      if (code === 'OTP_005') { setResendBlocked(true); setOtpStep('pending'); }
      else setOtpError(e.response?.data?.message ?? 'Failed to send OTP');
    },
  });

  const verifyMut = useMutation({
    mutationFn: adminVerifyPhoneOtp,
    onSuccess: () => {
      setOtpStep(null);
      setVerified(true);
      onVerified(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setOtpTimer(0);
    },
    onError: (e: any) => {
      const code = e.response?.data?.errorCode;
      if (code === 'OTP_004') {
        setOtpError('Too many attempts. Request a new OTP.');
        setOtpStep(null);
        setOtpTimer(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setOtpError('Incorrect OTP. Try again.');
      }
      setOtpCode('');
    },
  });

  function handleSend() {
    setOtpError('');
    sendMut.mutate({ phone, countryCode });
  }

  function handleVerify() {
    verifyMut.mutate({ phone, countryCode, code: otpCode });
  }

  return (
    <View>
      {/* Phone input row */}
      <PhoneInput
        label={required ? `${label} *` : label}
        phone={phone}
        countryCode={countryCode}
        onPhoneChange={(v) => { onPhoneChange(v); setVerified(false); }}
        onCountryChange={(cc) => { onCountryChange(cc); setVerified(false); }}
      />

      {/* Verified badge */}
      {verified && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '600' }}>✓ Verified</Text>
        </View>
      )}

      {/* Send OTP button — only when phone filled and not yet verified */}
      {needsVerification && !verified && !otpStep && (
        <TouchableOpacity
          onPress={handleSend}
          disabled={sendMut.isPending}
          activeOpacity={0.7}
          style={{
            marginTop: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
            backgroundColor: '#4F46E5', alignSelf: 'flex-start',
            flexDirection: 'row', alignItems: 'center', gap: 6,
            opacity: sendMut.isPending ? 0.6 : 1,
          }}
        >
          {sendMut.isPending && <ActivityIndicator size="small" color="#fff" />}
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {sendMut.isPending ? 'Sending…' : 'Send OTP'}
          </Text>
        </TouchableOpacity>
      )}

      {/* OTP send error */}
      {!otpStep && otpError ? (
        <Text style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{otpError}</Text>
      ) : null}

      {/* OTP verification box */}
      {otpStep === 'pending' && (
        <View style={{
          marginTop: 10, padding: 14, borderRadius: 12,
          borderWidth: 1.5, borderColor: '#818CF8', backgroundColor: '#EEF2FF',
        }}>
          <Text style={{ fontSize: 13, color: '#4338CA', marginBottom: 10, fontWeight: '500' }}>
            Enter the 6-digit code sent to {countryCode} {phone}
          </Text>

          {/* Code input + verify button */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={otpCode}
              onChangeText={(v) => { setOtpCode(v.replace(/\D/g, '')); setOtpError(''); }}
              placeholder="000000"
              keyboardType="numeric"
              maxLength={6}
              placeholderTextColor={C.gray400}
              style={{
                flex: 1, borderWidth: 1.5, borderColor: '#818CF8', borderRadius: 10,
                padding: 12, fontSize: 20, fontFamily: 'monospace', letterSpacing: 6,
                textAlign: 'center', backgroundColor: '#fff', color: C.gray900,
              }}
            />
            <TouchableOpacity
              onPress={handleVerify}
              disabled={otpCode.length !== 6 || verifyMut.isPending}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#4F46E5',
                justifyContent: 'center', opacity: otpCode.length !== 6 || verifyMut.isPending ? 0.5 : 1,
              }}
            >
              {verifyMut.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Verify</Text>
              }
            </TouchableOpacity>
          </View>

          {otpError ? (
            <Text style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{otpError}</Text>
          ) : null}

          {/* Resend / Change number row */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {resendBlocked ? (
              <Text style={{ fontSize: 12, color: C.red }}>Max attempts — help@thechitwise.com</Text>
            ) : otpTimer > 0 ? (
              <Text style={{ fontSize: 12, color: C.gray400 }}>Resend in {fmtSecs(otpTimer)}</Text>
            ) : (
              <TouchableOpacity onPress={handleSend} disabled={sendMut.isPending}>
                <Text style={{ fontSize: 12, color: '#4F46E5', fontWeight: '600' }}>
                  {sendMut.isPending ? 'Sending…' : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: C.gray300 }}>·</Text>
            <TouchableOpacity onPress={() => {
              setOtpStep(null); setOtpCode(''); setOtpError('');
              if (timerRef.current) clearInterval(timerRef.current); setOtpTimer(0);
            }}>
              <Text style={{ fontSize: 12, color: C.gray400 }}>Change number</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
