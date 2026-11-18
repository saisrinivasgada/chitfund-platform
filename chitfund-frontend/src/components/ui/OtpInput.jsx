import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import OtpCodeInput from './OtpCodeInput';

const RESEND_COOLDOWN = 60;

export default function OtpInput({ phone, countryCode, channel, onVerify, onResend, onCancel, loading: externalLoading }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const inFlight = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(nextCode = code) {
    if (nextCode.length !== 6 || inFlight.current || externalLoading) return;
    inFlight.current = true;
    setStatus('loading');
    setError('');
    try {
      await onVerify(nextCode);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.message ?? 'Incorrect code. Please try again.');
      setCode('');
    } finally {
      inFlight.current = false;
    }
  }

  async function resend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError('');
    try {
      await onResend();
      setCooldown(RESEND_COOLDOWN);
      setCode('');
      setStatus('idle');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  const maskedPhone = phone ? `${countryCode ?? ''} ${'*'.repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}` : '';
  const busy = status === 'loading' || externalLoading;

  return (
    <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }} className="space-y-5 rounded-2xl border border-[#C7D5E8] bg-white p-4 sm:p-6 shadow-[0_12px_32px_rgba(30,58,95,0.08)]">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[#1E3A5F]">Let’s verify your number</h2>
        <p className="mt-2 text-sm text-gray-600">
          We’ve sent a 6 digit code by {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to <span className="font-semibold text-[#1E3A5F]">{maskedPhone}</span>.
        </p>
      </div>
      <OtpCodeInput value={code} onChange={(value) => { setCode(value); setError(''); setStatus('idle'); }}
        onComplete={verify} autoFocus status={status} ariaLabel="Registration verification code" />
      <p role="alert" aria-live="polite" className="min-h-5 text-center text-xs text-red-600">{error}</p>
      <button type="button" onClick={() => verify()} disabled={code.length !== 6 || busy || status === 'success'}
        className="w-full rounded-xl bg-[#1E3A5F] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
        {busy ? 'Verifying…' : status === 'success' ? 'Verified' : 'Verify code'}
      </button>
      <div className="flex items-center justify-between gap-3 text-xs">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-[#1E3A5F]">← Change number</button>
        {cooldown > 0 ? <span className="text-gray-500">Resend in {cooldown}s</span> :
          <button type="button" onClick={resend} disabled={resending || busy}
            className="flex items-center gap-1 font-medium text-[#1E3A5F] disabled:opacity-50">
            <RefreshCw size={13} className={resending ? 'animate-spin' : ''} /> Resend code
          </button>}
      </div>
    </motion.div>
  );
}
