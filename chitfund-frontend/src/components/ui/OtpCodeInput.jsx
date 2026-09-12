import { useEffect, useRef } from 'react';

export default function OtpCodeInput({
  value = '',
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  ariaLabel = 'One-time password',
}) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus();
  }, [autoFocus, disabled]);

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
    onChange(next.join(''));
    refs.current[Math.min(index + numeric.length, length - 1)]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      onChange(next.join(''));
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
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
    <div
      className="flex gap-2 justify-center"
      role="group"
      aria-label={ariaLabel}
      onPaste={handlePaste}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length}
          value={digit}
          disabled={disabled}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`OTP digit ${index + 1} of ${length}`}
          onChange={(event) => updateDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          className={`w-11 h-12 text-center text-lg font-bold rounded-xl border-2 outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400
            ${digit ? 'border-[#1E3A5F] bg-[#EFF4FA] text-[#1E3A5F]' : 'border-gray-200 bg-white text-gray-900'}
            focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10`}
        />
      ))}
    </div>
  );
}
