import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';

/** Shared code entry for login, recovery, registration and profile changes. */
export default function OtpCodeInput({
  value = '', onChange, onComplete, length = 6, disabled = false,
  autoFocus = false, status = 'idle', ariaLabel = 'Verification code',
}) {
  const refs = useRef([]);
  const lastCompleted = useRef('');
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const locked = disabled || status === 'loading' || status === 'success';

  useEffect(() => {
    if (!autoFocus || locked || collapsed) return;
    refs.current[0]?.focus();
    const timer = setTimeout(() => refs.current[0]?.focus(), reduceMotion ? 0 : 240);
    return () => clearTimeout(timer);
  }, [autoFocus, locked, collapsed, reduceMotion]);

  useEffect(() => {
    if (status === 'loading' || status === 'success') {
      setCollapsed(true);
      return;
    }
    if (status === 'error') {
      setCollapsed(true);
      const timer = setTimeout(() => setCollapsed(false), reduceMotion ? 300 : 850);
      return () => clearTimeout(timer);
    }
    setCollapsed(false);
  }, [status, reduceMotion]);

  useEffect(() => {
    if (value.length !== length) lastCompleted.current = '';
    else if (onComplete && value !== lastCompleted.current && !locked) {
      lastCompleted.current = value;
      onComplete(value);
    }
  }, [value, length, locked, onComplete]);

  function updateDigit(index, rawValue) {
    const numeric = rawValue.replace(/\D/g, '');
    const next = [...digits];
    if (!numeric) {
      next[index] = '';
      onChange(next.join(''));
      return;
    }
    numeric.slice(0, length - index).split('').forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    onChange(next.join('').slice(0, length));
    refs.current[Math.min(index + numeric.length, length - 1)]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      onChange(next.join(''));
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length) - 1]?.focus();
  }

  return (
    <div role="group" aria-label={ariaLabel} onPaste={handlePaste}
      className="relative flex min-h-14 items-center justify-center">
      <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.div key="result" role="status" aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.65 }}
          animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.75 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 shadow-sm
            ${status === 'error' ? 'border-red-500 bg-red-50 text-red-600' : status === 'success' ? 'border-green-600 bg-green-50 text-green-700' : 'border-[#1E3A5F] bg-[#EEF2F8] text-[#1E3A5F]'}`}>
          {status === 'success' ? <><Check size={26} aria-hidden="true" /><span className="sr-only">Code verified</span></> :
            status === 'error' ? <><X size={26} aria-hidden="true" /><span className="sr-only">Incorrect code</span></> :
              <motion.span aria-label="Verifying code" className="h-5 w-5 rounded-full border-2 border-[#1E3A5F]/20 border-t-[#1E3A5F]"
                animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />}
        </motion.div>
      ) : (
      <motion.div key="digits" className="flex w-full justify-center gap-1.5 sm:gap-2"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.55 }}
        transition={{ duration: 0.18 }}>
      {digits.map((digit, index) => (
        <motion.div key={index}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, scale: digit && !reduceMotion ? [1, 1.06, 1] : 1 }}
          transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: 0.2 }}
          className="relative min-w-0 flex-1 max-w-12">
          <input
            ref={(element) => { refs.current[index] = element; }}
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={length}
            value={digit} disabled={locked}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={status === 'error'}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={`w-full h-12 sm:h-14 text-center text-xl font-semibold rounded-xl border-2 outline-none transition-[border-color,background-color,box-shadow] duration-200 disabled:opacity-60
              ${status === 'success' ? 'border-green-600 bg-green-50 text-green-800' : digit ? 'border-[#1E3A5F] bg-[#EEF2F8] text-[#1E3A5F]' : 'border-[#C7D5E8] bg-white text-[#1E3A5F]'}
              focus-visible:border-[#1E3A5F] focus-visible:ring-4 focus-visible:ring-[#1E3A5F]/15`}
          />
        </motion.div>
      ))}
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
