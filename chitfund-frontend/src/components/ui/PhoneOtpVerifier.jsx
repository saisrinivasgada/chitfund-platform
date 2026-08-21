import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, MessageSquare } from 'lucide-react';
import PhoneInput from './PhoneInput';
import { adminSendPhoneOtp, adminVerifyPhoneOtp } from '../../services/api';

/**
 * Drop-in phone input + OTP verification widget for admin forms.
 *
 * originalPhone=null  → creation mode: any phone entered must be verified
 * originalPhone=<str> → edit mode: verification only required when phone changes
 *
 * onVerified(bool) is called whenever verified state changes.
 * Parent disables submit when `needsVerification && !verified`.
 */
export default function PhoneOtpVerifier({
  phone,
  countryCode = '+91',
  originalPhone,
  onPhoneChange,
  onCountryChange,
  onVerified,
  onBeforeSend = null,
  required = false,
  label = 'Mobile Number',
  fieldError = null,
}) {
  const [otpStep, setOtpStep] = useState(null); // null | 'pending'
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [verified, setVerified] = useState(false);
  const timerRef = useRef(null);

  const isCreation = originalPhone === null;
  const phoneChanged = !isCreation && phone !== originalPhone;
  const needsVerification = phone && (isCreation || phoneChanged);

  // Reset verification whenever phone changes
  useEffect(() => {
    setVerified(false);
    setOtpStep(null);
    setOtpCode('');
    setOtpError('');
    onVerified?.(false);
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearInterval(timerRef.current), []);

  function startTimer() {
    setOtpTimer(60);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setOtpTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  const sendMut = useMutation({
    mutationFn: adminSendPhoneOtp,
    onSuccess: () => {
      setOtpStep('pending');
      setOtpCode('');
      setOtpError('');
      startTimer();
    },
    onError: (err) => {
      setOtpError(err.response?.data?.message || 'Failed to send OTP. Try again.');
    },
  });

  const verifyMut = useMutation({
    mutationFn: adminVerifyPhoneOtp,
    onSuccess: () => {
      setOtpStep(null);
      setVerified(true);
      onVerified?.(true);
      clearInterval(timerRef.current);
      setOtpTimer(0);
    },
    onError: (err) => {
      const code = err.response?.data?.errorCode;
      if (code === 'OTP_004') {
        setOtpError('Too many attempts. Click "Resend OTP" to try again.');
        setOtpStep(null);
        setOtpTimer(0);
        clearInterval(timerRef.current);
      } else {
        setOtpError('Incorrect OTP. Please try again.');
      }
      setOtpCode('');
    },
  });

  async function handleSend() {
    setOtpError('');
    if (onBeforeSend) {
      try {
        await onBeforeSend();
      } catch (err) {
        setOtpError(err.message || 'Cannot send OTP. Please try a different number.');
        return;
      }
    }
    sendMut.mutate({ phone, countryCode });
  }

  function handleVerify() {
    verifyMut.mutate({ phone, countryCode, code: otpCode });
  }

  return (
    <div className="space-y-2">
      {/* Phone field row */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <PhoneInput
            label={label}
            phone={phone}
            countryCode={countryCode}
            onPhoneChange={onPhoneChange}
            onCountryChange={onCountryChange}
            required={required}
            disabled={otpStep === 'pending'}
            error={fieldError}
          />
        </div>

        {/* "Send OTP" button — only when phone entered and not yet verified */}
        {needsVerification && !verified && otpStep === null && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sendMut.isPending || !phone}
            className="h-10 px-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {sendMut.isPending ? 'Sending…' : 'Send OTP'}
          </button>
        )}

        {/* Verified badge */}
        {verified && (
          <div className="flex items-center gap-1 text-green-600 text-sm font-medium pb-[2px]">
            <CheckCircle size={15} />
            <span>Verified</span>
          </div>
        )}
      </div>

      {/* OTP send error (not in pending step) */}
      {!otpStep && otpError && (
        <p className="text-xs text-red-500">{otpError}</p>
      )}

      {/* OTP verification box */}
      {otpStep === 'pending' && (
        <div className="border border-indigo-300 rounded-xl bg-indigo-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 text-sm font-medium">
            <MessageSquare size={14} />
            <span>Enter the 6-digit code sent to {countryCode} {phone}</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
              placeholder="000000"
              className="w-36 h-10 px-3 text-center text-xl font-mono tracking-widest border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={otpCode.length !== 6 || verifyMut.isPending}
              className="h-10 px-4 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {verifyMut.isPending ? 'Verifying…' : 'Verify'}
            </button>
          </div>

          {otpError && <p className="text-xs text-red-500">{otpError}</p>}

          <div className="text-xs text-gray-500">
            {otpTimer > 0 ? (
              <span>Resend in {otpTimer}s</span>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={sendMut.isPending}
                className="text-indigo-600 hover:underline disabled:opacity-60"
              >
                {sendMut.isPending ? 'Sending…' : 'Resend OTP'}
              </button>
            )}
            <span className="mx-2">·</span>
            <button
              type="button"
              onClick={() => { setOtpStep(null); setOtpCode(''); setOtpError(''); clearInterval(timerRef.current); setOtpTimer(0); }}
              className="text-gray-400 hover:text-gray-600 hover:underline"
            >
              Change number
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
