import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Text, TextInput, View } from 'react-native';
import { C } from './ui';

type Status = 'idle' | 'loading' | 'error' | 'success';
type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
  status?: Status;
};

function DigitBox({ digit, index, length, active, status, disabled, autoFocus, reducedMotion, collapse, inputRef, onChange, onKeyPress, onFocus }: {
  digit: string; index: number; length: number; active: boolean; status: Status;
  disabled: boolean; autoFocus: boolean; reducedMotion: boolean; collapse: Animated.Value;
  inputRef: (input: TextInput | null) => void;
  onChange: (raw: string) => void; onKeyPress: (key: string) => void; onFocus: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!digit || reducedMotion) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.07, duration: 90, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
  }, [digit, reducedMotion, scale]);

  const borderColor = status === 'error' ? C.red : status === 'success' ? C.green : active || digit ? C.navy : C.gray300;
  const backgroundColor = status === 'error' ? '#FEF2F2' : status === 'success' ? '#F0FDF4' : digit ? C.navy50 : C.white;
  return (
    <Animated.View style={{ flex: 1, maxWidth: 50,
      opacity: collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      transform: [{ translateX: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, ((length - 1) / 2 - index) * 52] }) }] }}>
    <Animated.View style={{ transform: [{ scale }] }}>
      <TextInput
        ref={inputRef} value={digit} onChangeText={onChange}
        onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key)}
        onFocus={onFocus} editable={!disabled} autoFocus={autoFocus && index === 0}
        keyboardType="number-pad" textContentType={index === 0 ? 'oneTimeCode' : 'none'}
        autoComplete={index === 0 ? 'sms-otp' : 'off'} maxLength={length} selectTextOnFocus
        accessibilityLabel={`Digit ${index + 1} of ${length}`}
        accessibilityState={{ disabled }}
        style={{ width: '100%', height: 56, borderWidth: 2, borderColor, borderRadius: 12,
          backgroundColor, color: status === 'error' ? C.red : status === 'success' ? C.green : C.navy,
          textAlign: 'center', fontSize: 22, fontWeight: '700',
          shadowColor: active && status === 'idle' ? C.navy : 'transparent',
          shadowOpacity: active && status === 'idle' ? 0.16 : 0, shadowRadius: 7, elevation: 0 }}
      />
    </Animated.View>
    </Animated.View>
  );
}

/** One consistent six-digit entry across all mobile verification flows. */
export default function OtpCodeInput({ value, onChangeText, onComplete, length = 6,
  disabled = false, autoFocus = false, hasError = false, status = 'idle' }: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const lastCompleted = useRef('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [resultStatus, setResultStatus] = useState<Status | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(0)).current;
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const visualStatus = hasError ? 'error' : status;
  const locked = disabled || visualStatus === 'loading' || visualStatus === 'success';

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
  }, []);

  useEffect(() => {
    if (visualStatus === 'idle') {
      Animated.timing(collapse, { toValue: 0, duration: reducedMotion ? 0 : 200, useNativeDriver: true })
        .start(({ finished }) => { if (finished) { setResultStatus(null); if (autoFocus) refs.current[0]?.focus(); } });
      return;
    }
    setResultStatus(visualStatus);
    Animated.timing(collapse, { toValue: 1, duration: reducedMotion ? 0 : 220, useNativeDriver: true }).start();
    if (visualStatus === 'error') {
      const timer = setTimeout(() => {
        Animated.timing(collapse, { toValue: 0, duration: reducedMotion ? 0 : 220, useNativeDriver: true })
          .start(({ finished }) => { if (finished) { setResultStatus(null); refs.current[0]?.focus(); } });
      }, reducedMotion ? 300 : 850);
      return () => clearTimeout(timer);
    }
  }, [visualStatus, reducedMotion, collapse, autoFocus]);

  useEffect(() => {
    if (value.length !== length) lastCompleted.current = '';
    else if (onComplete && value !== lastCompleted.current && !locked) {
      lastCompleted.current = value;
      onComplete(value);
    }
  }, [value, length, locked, onComplete]);

  useEffect(() => {
    if (visualStatus !== 'error' || reducedMotion) return;
    Animated.sequence([-5, 5, -3, 3, 0].map((toValue) =>
      Animated.timing(shake, { toValue, duration: 45, useNativeDriver: true }))).start();
  }, [visualStatus, reducedMotion, shake]);

  function update(index: number, raw: string) {
    const numeric = raw.replace(/\D/g, '');
    const next = [...digits];
    if (numeric.length > 1) {
      numeric.slice(0, length - index).split('').forEach((digit, offset) => { next[index + offset] = digit; });
      refs.current[Math.min(index + numeric.length, length - 1)]?.focus();
    } else {
      next[index] = numeric.slice(-1);
      if (numeric && index < length - 1) refs.current[index + 1]?.focus();
    }
    onChangeText(next.join('').slice(0, length));
  }

  return (
    <Animated.View style={{ minHeight: 56, flexDirection: 'row', gap: 7, justifyContent: 'center', opacity: locked && !resultStatus ? 0.6 : 1,
      transform: [{ translateX: shake }] }}>
      {digits.map((digit, index) => (
        <DigitBox key={index} digit={digit} index={index} length={length}
          active={activeIndex === index} status={resultStatus ? visualStatus : visualStatus === 'error' ? 'idle' : visualStatus}
          disabled={locked || !!resultStatus}
          autoFocus={autoFocus} reducedMotion={reducedMotion} collapse={collapse}
          inputRef={(input) => { refs.current[index] = input; }}
          onChange={(raw) => update(index, raw)} onFocus={() => setActiveIndex(index)}
          onKeyPress={(key) => {
            if (key === 'Backspace' && !digits[index] && index > 0) {
              const next = [...digits]; next[index - 1] = '';
              onChangeText(next.join('')); refs.current[index - 1]?.focus();
            }
          }} />
      ))}
      {resultStatus && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', width: 56, height: 56,
          borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
          borderColor: resultStatus === 'error' ? C.red : resultStatus === 'success' ? C.green : C.navy,
          backgroundColor: resultStatus === 'error' ? '#FEF2F2' : resultStatus === 'success' ? '#F0FDF4' : C.navy50,
          opacity: collapse, transform: [{ scale: collapse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }] }}>
          {resultStatus === 'loading' ? <ActivityIndicator color={C.navy} /> :
            <Text accessibilityLabel={resultStatus === 'success' ? 'Code verified' : 'Incorrect code'}
              style={{ fontSize: 28, fontWeight: '700', color: resultStatus === 'error' ? C.red : C.green }}>
              {resultStatus === 'success' ? '✓' : '×'}
            </Text>}
        </Animated.View>
      )}
    </Animated.View>
  );
}
