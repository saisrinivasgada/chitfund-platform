import { useRef } from 'react';
import { TextInput, View } from 'react-native';
import { C } from './ui';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
};

/** Six real digit fields with paste and OS one-time-code autofill support. */
export default function OtpCodeInput({
  value,
  onChangeText,
  length = 6,
  disabled = false,
  autoFocus = false,
  hasError = false,
}: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function update(index: number, raw: string) {
    const numeric = raw.replace(/\D/g, '');
    const next = [...digits];
    if (numeric.length > 1) {
      numeric.slice(0, length - index).split('').forEach((digit, offset) => {
        next[index + offset] = digit;
      });
      const last = Math.min(index + numeric.length, length - 1);
      refs.current[last]?.focus();
    } else {
      next[index] = numeric.slice(-1);
      if (numeric && index < length - 1) refs.current[index + 1]?.focus();
    }
    onChangeText(next.join('').slice(0, length));
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(input) => { refs.current[index] = input; }}
          value={digit}
          onChangeText={(raw) => update(index, raw)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
              const next = [...digits];
              next[index - 1] = '';
              onChangeText(next.join(''));
              refs.current[index - 1]?.focus();
            }
          }}
          editable={!disabled}
          autoFocus={autoFocus && index === 0}
          keyboardType="number-pad"
          textContentType={index === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={index === 0 ? 'sms-otp' : 'off'}
          maxLength={length}
          selectTextOnFocus
          accessibilityLabel={`OTP digit ${index + 1} of ${length}`}
          style={{
            flex: 1,
            maxWidth: 48,
            height: 54,
            borderWidth: 1.5,
            borderColor: hasError ? C.red : digit ? C.navy : C.gray200,
            borderRadius: 11,
            backgroundColor: C.white,
            color: C.navy,
            textAlign: 'center',
            fontSize: 22,
            fontWeight: '800',
          }}
        />
      ))}
    </View>
  );
}
