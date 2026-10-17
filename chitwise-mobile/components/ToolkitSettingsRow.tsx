import { useRef, useState } from 'react';
import { Image, Modal, PanResponder, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from './ui';
import { useToolkitStore } from '../store/toolkitStore';

function AdjustmentSlider({ label, value, minimum, maximum, step, onCommit, onPreview }: {
  label: string; value: number; minimum: number; maximum: number; step: number;
  onCommit(value: number): void; onPreview(value: number): void;
}) {
  const [draft, setDraft] = useState(value);
  const [width, setWidth] = useState(0);
  const live = useRef({ width, draft, minimum, maximum, step, onCommit, onPreview });
  live.current = { width, draft, minimum, maximum, step, onCommit, onPreview };
  const start = useRef(0);
  const update = (x: number) => {
    const s = live.current;
    const ratio = Math.max(0, Math.min(1, (x - 15) / Math.max(1, s.width - 30)));
    const next = Math.min(s.maximum, Math.max(s.minimum, Math.round((s.minimum + ratio * (s.maximum - s.minimum)) / s.step) * s.step));
    live.current.draft = next; setDraft(next); s.onPreview(next);
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: (event) => { start.current = event.nativeEvent.locationX; update(start.current); },
    onPanResponderMove: (_, g) => update(start.current + g.dx),
    onPanResponderRelease: () => live.current.onCommit(live.current.draft),
    onPanResponderTerminate: () => live.current.onCommit(live.current.draft),
  })).current;
  const ratio = (draft - minimum) / (maximum - minimum);
  return <View testID={`toolkit-${label.toLowerCase()}-slider`} accessible accessibilityRole="adjustable"
    accessibilityLabel={`Button ${label.toLowerCase()}`} accessibilityValue={{ min: minimum, max: maximum, now: draft,
      text: label === 'Opacity' ? `${Math.round(draft * 100)} percent` : `${Math.round(draft)} points` }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      const next = Math.max(minimum, Math.min(maximum, draft + (nativeEvent.actionName === 'increment' ? step : -step)));
      setDraft(next); onPreview(next); onCommit(next);
    }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...responder.panHandlers}
    style={{ height: 58, justifyContent: 'center', marginVertical: 18 }}>
    <View pointerEvents="none" style={{ height: 5, marginHorizontal: 15, borderRadius: 4, backgroundColor: '#D1D5DB' }}>
      <View style={{ height: 5, borderRadius: 4, width: `${ratio * 100}%`, backgroundColor: C.navy }} />
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', left: ratio * Math.max(0, width - 30), width: 30, height: 30,
      borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: '#D1D5DB', shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 3, elevation: 3 }} />
  </View>;
}

export function ToolkitSettingsRow() {
  const settings = useToolkitStore();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'main' | 'opacity' | 'size'>('main');
  const [previewOpacity, setPreviewOpacity] = useState(settings.opacity);
  const [previewSize, setPreviewSize] = useState(settings.buttonSize);
  const show = (next: typeof page) => { setPreviewOpacity(settings.opacity); setPreviewSize(settings.buttonSize); setPage(next); };
  const title = page === 'opacity' ? 'Button opacity' : page === 'size' ? 'Button size' : 'Floating button';
  const row = (label: string, detail: string, next: 'opacity' | 'size') => <TouchableOpacity testID={`toolkit-${next}-row`}
    accessibilityRole="button" accessibilityLabel={`${label}, ${detail}`} onPress={() => show(next)}
    style={{ flexDirection: 'row', padding: 17, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.gray100 }}>
    <Text style={{ color: C.gray900, fontSize: 15, flex: 1 }}>{label}</Text><Text style={{ color: C.gray500, marginRight: 10 }}>{detail}</Text>
    <Ionicons name="chevron-forward" size={16} color={C.gray400} />
  </TouchableOpacity>;
  return <>
    <TouchableOpacity testID="toolkit-settings-row" accessibilityRole="button" accessibilityLabel="Floating button settings"
      onPress={() => { show('main'); setOpen(true); }} style={{ backgroundColor: C.surface, borderRadius: 16, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: C.gray100 }}>
      <Image source={require('../assets/icon.png')} style={{ width: 46, height: 46, borderRadius: 14 }} accessible={false} />
      <View style={{ flex: 1 }}><Text style={{ color: C.gray900, fontSize: 15, fontWeight: '700' }}>Floating button</Text>
        <Text style={{ color: C.gray500, fontSize: 12, marginTop: 2 }}>Calculator, refresh & appearance</Text></View>
      <Text style={{ color: C.gray500, fontSize: 12 }}>{settings.enabled ? 'On' : 'Off'}</Text><Ionicons name="chevron-forward" size={17} color={C.gray400} />
    </TouchableOpacity>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, gap: 12 }}>
          {page !== 'main' && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to floating button settings" onPress={() => show('main')} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={C.navy} /></TouchableOpacity>}
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: C.navy }}>{title}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close floating button settings" onPress={() => setOpen(false)} hitSlop={10}><Text style={{ color: C.navy, fontSize: 15 }}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          {page === 'main' ? <>
            <View style={{ borderRadius: 14, backgroundColor: C.surface, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', padding: 17, alignItems: 'center' }}><Text style={{ flex: 1, color: C.gray900, fontSize: 15 }}>Floating button</Text>
                <Switch accessibilityLabel="Enable floating button" value={settings.enabled} onValueChange={settings.setEnabled} trackColor={{ true: C.navy, false: C.gray200 }} thumbColor="#FFFFFF" /></View>
              {row('Opacity', `${Math.round(settings.opacity * 100)}%`, 'opacity')}
              {row('Size', `${Math.round(settings.buttonSize)} pt`, 'size')}
            </View>
            <Text style={{ color: C.gray500, fontSize: 13, lineHeight: 20 }}>Tap the button for calculator and refresh. Drag it to move it to a comfortable position.</Text>
          </> : <>
            <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6EBF2', borderRadius: 18 }}>
              <Image source={require('../assets/icon.png')} accessibilityLabel="Floating button preview" style={{ width: previewSize, height: previewSize,
                borderRadius: previewSize * 0.28, opacity: previewOpacity }} />
            </View>
            <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 20 }}>
              <Text style={{ textAlign: 'center', color: C.navy, fontSize: 26, fontWeight: '700' }}>{page === 'opacity' ? `${Math.round(previewOpacity * 100)}%` : `${Math.round(previewSize)} pt`}</Text>
              <AdjustmentSlider key={page} label={page === 'opacity' ? 'Opacity' : 'Size'} value={page === 'opacity' ? settings.opacity : settings.buttonSize}
                minimum={page === 'opacity' ? 0.15 : 36} maximum={page === 'opacity' ? 1 : 64} step={page === 'opacity' ? 0.01 : 1}
                onPreview={page === 'opacity' ? setPreviewOpacity : setPreviewSize} onCommit={page === 'opacity' ? settings.setOpacity : settings.setButtonSize} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: C.gray500 }}>{page === 'opacity' ? '15%' : 'Small'}</Text><Text style={{ color: C.gray500 }}>{page === 'opacity' ? '100%' : 'Large'}</Text></View>
            </View>
            <Text style={{ color: C.gray500, fontSize: 13, lineHeight: 20 }}>{page === 'opacity' ? 'Drag the slider to adjust how visible the floating button appears.' : 'Drag the slider to find a button size that is easy to reach.'}</Text>
          </>}
        </ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}
