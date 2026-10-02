import { useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, PanResponder,
  Animated, useWindowDimensions, ScrollView, Vibration,
  Platform, StyleSheet,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useToolkitStore } from '../store/toolkitStore';
import { useShake } from '../hooks/useShake';
import { toast } from './Toast';
import { C } from './ui';

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

function Calculator({ onClose }: { onClose: () => void }) {
  const { display, expression, calcInput } = useToolkitStore();
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Animated.View style={[styles.calcSheet, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Close bar */}
      <TouchableOpacity onPress={handleClose} style={styles.calcCloseBar} activeOpacity={0.6}>
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
}

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
    calcOpen, openCalc, closeCalc, toggleCalc,
    loadSettings,
  } = useToolkitStore();

  const qc = useQueryClient();
  const { width: W, height: H } = useWindowDimensions();

  // Animated position (starts right-centre)
  const pan    = useRef(new Animated.ValueXY({ x: W - buttonSize - 12, y: H * 0.42 })).current;
  const scale  = useRef(new Animated.Value(0)).current;
  const pulseS = useRef(new Animated.Value(1)).current;
  const refreshVisible = useRef(false);
  const refreshAnim    = useRef(new Animated.Value(0)).current;
  const isRefreshing   = useRef(false);

  // Entrance animation on mount
  useEffect(() => {
    loadSettings();
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 160, friction: 9, delay: 400 }).start();
  }, []);

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
      onStartShouldSetPanResponder: () => true,
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
        const snapX = curX < W / 2 ? 12 : W - buttonSize - 12;
        const clampY = Math.max(80, Math.min(curY, H - buttonSize - 90));
        Animated.spring(pan, {
          toValue: { x: snapX, y: clampY },
          useNativeDriver: false,
          tension: 180,
          friction: 12,
        }).start();
      },
    })
  ).current;

  const handleTap = useCallback(() => {
    toggleCalc();
    Vibration.vibrate(Platform.OS === 'ios' ? [0, 8] : [0, 10]);
  }, [toggleCalc]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    Vibration.vibrate(Platform.OS === 'ios' ? [0, 12, 60, 12] : [0, 15, 60, 15]);

    // Bounce-scale animation
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();

    refreshVisible.current = true;
    refreshAnim.setValue(1);

    await qc.invalidateQueries();
    await new Promise(r => setTimeout(r, 900));

    Animated.timing(refreshAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      refreshVisible.current = false;
      isRefreshing.current = false;
    });

    toast.saved('Screen refreshed');
  }, [qc, scale]);

  useShake(toggleCalc, enabled);

  if (!enabled) return null;

  const btnRadius = buttonSize / 2;

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
            transform: [{ scale: Animated.multiply(scale, pulseS) }],
          },
          pan.getLayout(),
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={handleTap}
          onLongPress={handleRefresh}
          delayLongPress={500}
          activeOpacity={0.85}
          style={[styles.floatBtn, { width: buttonSize, height: buttonSize, borderRadius: btnRadius }]}
        >
          <Text style={[styles.floatIcon, { fontSize: buttonSize * 0.38 }]}>⌗</Text>
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
          <RefreshSpinner visible={refreshVisible.current} />
        </Animated.View>
      </Animated.View>

      {/* Calculator overlay */}
      <Modal
        visible={calcOpen}
        transparent
        animationType="none"
        onRequestClose={closeCalc}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeCalc}
        />
        <Calculator onClose={closeCalc} />
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
    backgroundColor: C.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatIcon: {
    color: '#fff',
    fontWeight: '700',
    includeFontPadding: false,
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
