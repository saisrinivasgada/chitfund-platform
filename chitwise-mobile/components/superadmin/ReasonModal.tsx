import { useEffect, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../ui';

export default function ReasonModal({
  visible,
  title,
  message,
  confirmLabel = 'Continue',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('');
      setError('');
    }
  }, [visible]);

  function submit() {
    const normalized = reason.trim();
    if (normalized.length < 5) {
      setError('Enter a reason of at least 5 characters.');
      return;
    }
    onConfirm(normalized);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: C.surface, borderRadius: 18, padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>{title}</Text>
          {message ? <Text style={{ fontSize: 13, lineHeight: 19, color: C.gray500 }}>{message}</Text> : null}
          <TextInput
            value={reason}
            onChangeText={(value) => { setReason(value); setError(''); }}
            placeholder="Explain why this change is needed"
            multiline
            numberOfLines={3}
            autoFocus
            editable={!busy}
            style={{ minHeight: 86, borderWidth: 1.5, borderColor: error ? C.red : C.gray300, borderRadius: 12, padding: 12, color: C.gray900, textAlignVertical: 'top' }}
          />
          {error ? <Text style={{ fontSize: 12, color: C.red }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity disabled={busy} onPress={onCancel}
              style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.gray300, alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: C.gray700 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={submit}
              style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: destructive ? C.red : C.navy, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              <Text style={{ fontWeight: '700', color: '#fff' }}>{busy ? 'Saving…' : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
