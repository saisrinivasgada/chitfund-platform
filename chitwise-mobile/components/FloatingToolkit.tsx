import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, PanResponder,
  Animated, useWindowDimensions, ScrollView, Vibration,
  Platform, StyleSheet,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useToolkitStore } from '../store/toolkitStore';
import { toast } from './Toast';

// ─── Calculator button definitions ──────────────────────────────────────────

const CALC_ROWS: string[][] = [
  ['AC', '±', '%', '÷'],
  ['7',  '8', '9', '×'],
  ['4',  '5', '6', '-'],
  ['1',  '2', '3', '+'],
  ['0',  '.',     '='],
];

const BTN_STYLE: Record<string, { bg: string; color: string; flex?: number }> = {
  AC:  { bg: '#EF4444', color: '#fff' },
  '±': { bg: '#334155', color: '#fff' },
  '%': { bg: '#334155', color: '#fff' },
  '÷': { bg: '#3B82F6', color: '#fff' },
  '×': { bg: '#3B82F6', color: '#fff' },
  '-': { bg: '#3B82F6', color: '#fff' },
  '+': { bg: '#3B82F6', color: '#fff' },
  '=': { bg: '#10B981', color: '#fff' },
  '0': { bg: '#1E3A5F', color: '#fff', flex: 2 },
};

// ─── Calculator component ───────────────────────────────────────────────────

export interface CalcHandle {
  animatedClose: () => void;
}

const Calculator = forwardRef<CalcHandle, { onClose: () => void }>(({ onClose }, ref) => {
  const { display, expression, calcInput } = useToolkitStore();
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose]);

  useImperativeHandle(ref, () => ({ animatedClose: handleClose }), [handleClose]);

  return (
    <Animated.View style={[styles.calcSheet, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Close bar */}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close calculator" onPress={handleClose} style={styles.calcCloseBar} activeOpacity={0.6}>
        <View style={styles.calcHandle} />
      </TouchableOpacity>

      {/* Display */}
      <View style={styles.calcDisplay}>
        <Text style={styles.calcExpression} numberOfLines={1}>{expression || ' '}</Text>
        <Text style={styles.calcNumber} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      {/* Button grid */}
      <View style={styles.calcGrid}>
        {CALC_ROWS.map((row, ri) => (
          <View key={ri} style={styles.calcRow}>
            {row.map((key) => {
              const s = BTN_STYLE[key] ?? { bg: '#1E3A5F', color: '#fff' };
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.7}
                  onPress={() => calcInput(key)}
                  style={[styles.calcBtn, { backgroundColor: s.bg, flex: s.flex ?? 1 }]}
                >
                  <Text style={[styles.calcBtnText, { color: s.color }]}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Animated.View>
  );
});

// ─── Refresh spinner overlay ────────────────────────────────────────────────

function RefreshSpinner({ visible }: { visible: boolean }) {
  const rot   = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const anim  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      scale.setValue(0);
      rot.setValue(0);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
      anim.current = Animated.loop(
        Animated.timing(rot, { toValue: 1, duration: 700, useNativeDriver: true })
      );
      anim.current.start();
    } else {
      anim.current?.stop();
      Animated.spring(scale, { toValue: 0, useNativeDriver: true, tension: 200, friction: 10 }).start();
    }
  }, [visible]);

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.refreshRing, { transform: [{ scale }, { rotate: spin }] }]}
    >
      <View style={styles.refreshArc} />
    </Animated.View>
  );
}

// ─── Floating button ────────────────────────────────────────────────────────

export function FloatingToolkit() {
  const {
    enabled, opacity, buttonSize,
    calcOpen, openCalc, closeCalc,
    loadSettings,
  } = useToolkitStore();

  const qc      = useQueryClient();
  const calcRef = useRef<CalcHandle>(null);
  const { width: W, height: H } = useWindowDimensions();
  const geometry = useRef({ width: W, height: H, size: buttonSize });
  geometry.current = { width: W, height: H, size: buttonSize };

  // Animated position (starts right-centre)
  const pan    = useRef(new Animated.ValueXY({ x: W - buttonSize - 12, y: H * 0.68 })).current;
  const scale  = useRef(new Animated.Value(0)).current;
  const pulseS = useRef(new Animated.Value(1)).current;
  const [refreshVisible, setRefreshVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const refreshAnim    = useRef(new Animated.Value(0)).current;
  const isRefreshing   = useRef(false);

  useEffect(() => { loadSettings(); }, []);

  // A disabled button has no native animation node. Start its entrance when
  // it becomes visible, including after restoring a disabled preference.
  useEffect(() => {
    scale.setValue(0);
    if (!enabled) { setMenuOpen(false); closeCalc(); return; }
    const entrance = Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 160, friction: 9 });
    entrance.start();
    return () => entrance.stop();
  }, [enabled]);

  useEffect(() => {
    pan.stopAnimation((position) => {
      pan.setOffset({ x: 0, y: 0 });
      pan.setValue({ x: Math.max(8, Math.min(position.x, W - buttonSize - 8)),
        y: Math.max(80, Math.min(position.y, H - buttonSize - 100)) });
    });
  }, [W, H, buttonSize]);

  // Pulse when calculator is open
  useEffect(() => {
    if (calcOpen) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseS, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseS, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseS.setValue(1);
    }
  }, [calcOpen]);

  // Drag
  const dragOffset = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        dragOffset.current = {
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        };
        pan.setOffset(dragOffset.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const curX = (pan.x as any)._value;
        const curY = (pan.y as any)._value;
        const { width, height, size } = geometry.current;
        const snapX = curX < width / 2 ? 8 : width - size - 8;
        const clampY = Math.max(80, Math.min(curY, height - size - 100));
        Animated.spring(pan, {
          toValue: { x: snapX, y: clampY },
          useNativeDriver: false,
          tension: 180,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // Tap always uses animated close so the sheet slides out properly
  const animatedClose = useCallback(() => {
    if (calcRef.current) {
      calcRef.current.animatedClose();
    } else {
      closeCalc();
    }
  }, [closeCalc]);

  const handleTap = useCallback(() => {
    setMenuOpen(true);
    Vibration.vibrate(Platform.OS === 'ios' ? [0, 8] : [0, 10]);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    Vibration.vibrate(Platform.OS === 'ios' ? [0, 12, 60, 12] : [0, 15, 60, 15]);

    // Bounce-scale animation
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();

    setRefreshVisible(true);
    refreshAnim.setValue(1);

    try {
      await qc.invalidateQueries();
      await new Promise(r => setTimeout(r, 900));
      toast.saved('Screen refreshed');
    } finally {
      Animated.timing(refreshAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setRefreshVisible(false);
        isRefreshing.current = false;
      });
    }
  }, [qc, scale]);

  if (!enabled) return null;

  const btnRadius = buttonSize * 0.28;

  return (
    <>
      {/* Floating button */}
      <Animated.View
        style={[
          styles.floatWrapper,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: btnRadius,
            opacity,
          },
          pan.getLayout(),
        ]}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ width: buttonSize, height: buttonSize, transform: [{ scale: Animated.multiply(scale, pulseS) }] }}>
        <TouchableOpacity
          hitSlop={8}
          testID="chitwise-tools-button"
          accessibilityRole="button"
          accessibilityLabel="Open ChitWise tools"
          accessibilityHint="Calculator and refresh. Drag to move the control."
          onPress={handleTap}
          onLongPress={handleRefresh}
          delayLongPress={500}
          activeOpacity={0.85}
          style={[styles.floatBtn, { width: buttonSize, height: buttonSize, borderRadius: btnRadius }]}
        >
          <Image source={require('../assets/icon.png')} accessible={false} resizeMode="contain"
            style={{ width: buttonSize * 0.88, height: buttonSize * 0.88, borderRadius: buttonSize * 0.22 }} />
        </TouchableOpacity>

        {/* Refresh spinner ring */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.refreshRingWrap,
            {
              width: buttonSize + 12,
              height: buttonSize + 12,
              borderRadius: (buttonSize + 12) / 2,
              opacity: refreshAnim,
            },
          ]}
        >
          <RefreshSpinner visible={refreshVisible} />
        </Animated.View>
        </Animated.View>
      </Animated.View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close ChitWise tools" onPress={() => setMenuOpen(false)}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,23,42,0.18)' }]} />
          <View style={{ width: 248, borderRadius: 27, padding: 22, backgroundColor: 'rgba(36,41,49,0.96)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', shadowColor: '#000', shadowOpacity: 0.22,
            shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 14 }}>
            <Text style={{ color: '#CBD5E1', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 20 }}>CHITWISE TOOLS</Text>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open calculator"
                onPress={() => { setMenuOpen(false); openCalc(); }} style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                <View style={{ width: 54, height: 54, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                  <View style={{ width: 25, height: 31, borderRadius: 5, borderWidth: 2, borderColor: '#F1F5F9', padding: 4, gap: 4 }}>
                    <View style={{ height: 5, borderRadius: 1, backgroundColor: '#F1F5F9' }} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>{[0,1,2,3].map((key) => <View key={key} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#F1F5F9' }} />)}</View>
                  </View>
                </View>
                <Text style={{ color: '#F1F5F9', fontSize: 12, fontWeight: '500' }}>Calculator</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh this screen"
                onPress={() => { setMenuOpen(false); handleRefresh(); }} style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                <View style={{ width: 54, height: 54, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#F1F5F9', fontSize: 34 }}>↻</Text>
                </View>
                <Text style={{ color: '#F1F5F9', fontSize: 12, fontWeight: '500' }}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calculator overlay */}
      <Modal
        visible={calcOpen}
        transparent
        animationType="none"
        onRequestClose={animatedClose}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={animatedClose}
        />
        <Calculator ref={calcRef} onClose={closeCalc} />
      </Modal>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  floatWrapper: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  floatBtn: {
    backgroundColor: '#1E3A5F',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshRingWrap: {
    position: 'absolute',
    top: -6,
    left: -6,
    borderWidth: 2.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    pointerEvents: 'none',
  },
  // -- Calculator sheet --
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  calcSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0B1F35',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 24,
  },
  calcCloseBar: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  calcHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  calcDisplay: {
    paddingHorizontal: 6,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  calcExpression: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 4,
  },
  calcNumber: {
    fontSize: 48,
    fontWeight: '300',
    color: '#F1F5F9',
    letterSpacing: -1,
  },
  calcGrid: {
    gap: 10,
    marginTop: 4,
  },
  calcRow: {
    flexDirection: 'row',
    gap: 10,
  },
  calcBtn: {
    flex: 1,
    height: 68,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnText: {
    fontSize: 22,
    fontWeight: '500',
  },
  // -- Refresh ring --
  refreshRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2.5,
    borderColor: '#10B981',
    borderTopColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshArc: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    position: 'absolute',
    top: -5,
    right: 2,
  },
});
