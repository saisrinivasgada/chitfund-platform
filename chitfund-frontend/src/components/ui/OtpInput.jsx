import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

const RESEND_COOLDOWN = 60; // seconds

export default function OtpInput({ phone, countryCode, onVerify, onResend, onCancel, loading: externalLoading }) {
  const [digits, setDigits]       = useState(['', '', '', '', '', '']);
  const [error, setError]         = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown]   = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const ref0 = useRef(null);
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const ref3 = useRef(null);
  const ref4 = useRef(null);
  const ref5 = useRef(null);
  const refs = [ref0, ref1, ref2, ref3, ref4, ref5];

  useEffect(() => {
    refs[0].current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleChange(i, val) {
    const ch = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    setError('');
    if (ch && i < 5) refs[i + 1].current?.focus();
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace') {
      if (!digits[i] && i > 0) {
        const next = [...digits];
        next[i - 1] = '';
        setDigits(next);
        refs[i - 1].current?.focus();
      }
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      refs[5].current?.focus();
    }
  }

  async function handleVerify() {
    const code = digits.join('');
    if (code.length < 6) { setError('Enter all 6 digits'); return; }
    setVerifying(true);
    setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Incorrect OTP. Please try again.');
      setDigits(['', '', '', '', '', '']);
      refs[0].current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    try {
      await onResend();
      setCooldown(RESEND_COOLDOWN);
      setDigits(['', '', '', '', '', '']);
      refs[0].current?.focus();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }

  const maskedPhone = phone ? `${countryCode ?? ''} ${'*'.repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}` : '';
  const code = digits.join('');
  const isLoading = verifying || externalLoading;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm text-gray-600">
          OTP sent to <span className="font-semibold text-gray-900">{maskedPhone}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">Enter the 6-digit code below</p>
      </div>

      {/* 6 digit boxes */}
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`w-11 h-12 text-center text-lg font-bold rounded-xl border-2 outline-none transition-all
              ${d ? 'border-[#1E3A5F] bg-[#EFF4FA] text-[#1E3A5F]' : 'border-gray-200 bg-white text-gray-900'}
              focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10`}
          />
        ))}
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <button
        type="button"
        onClick={handleVerify}
        disabled={code.length < 6 || isLoading}
        className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        style={{ backgroundColor: '#1E3A5F' }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Verifying…
          </span>
        ) : 'Verify OTP'}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          ← Change number
        </button>
        {cooldown > 0 ? (
          <span className="text-gray-400">Resend in {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="flex items-center gap-1 text-[#1E3A5F] font-medium hover:opacity-70 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={11} className={resending ? 'animate-spin' : ''} />
            Resend OTP
          </button>
        )}
      </div>
    </div>
  );
}
