import { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastKind =
  | 'saved'
  | 'created'
  | 'deleted'
  | 'voided'
  | 'noted'
  | 'skipped'
  | 'collected'
  | 'assigned'
  | 'cancelled'
  | 'submitted'
  | 'transferred';

interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

const TOAST_STYLES: Record<ToastKind, { bg: string; border: string; icon: string; color: string }> = {
  saved:       { bg: '#DCFCE7', border: '#86EFAC', icon: '✓',  color: '#15803D' },
  created:     { bg: '#DBEAFE', border: '#93C5FD', icon: '+',  color: '#1D4ED8' },
  deleted:     { bg: '#FEE2E2', border: '#FCA5A5', icon: '✕',  color: '#B91C1C' },
  voided:      { bg: '#FEF3C7', border: '#FCD34D', icon: '⊘',  color: '#92400E' },
  noted:       { bg: '#F0F9FF', border: '#7DD3FC', icon: 'ℹ',  color: '#0369A1' },
  skipped:     { bg: '#F3F4F6', border: '#D1D5DB', icon: '→',  color: '#4B5563' },
  collected:   { bg: '#DCFCE7', border: '#86EFAC', icon: '₹',  color: '#15803D' },
  assigned:    { bg: '#EDE9FE', border: '#C4B5FD', icon: '↗',  color: '#6D28D9' },
  cancelled:   { bg: '#FEE2E2', border: '#FCA5A5', icon: '×',  color: '#991B1B' },
  submitted:   { bg: '#DBEAFE', border: '#93C5FD', icon: '✉',  color: '#1E40AF' },
  transferred: { bg: '#F5F3FF', border: '#C4B5FD', icon: '⇄',  color: '#6D28D9' },
};

const FLASH_KINDS: ToastKind[] = ['saved', 'created', 'collected', 'assigned', 'submitted', 'transferred'];

// ── Module-level singleton ────────────────────────────────────────────────────

let _emit: ((entry: ToastEntry) => void) | null = null;
let _idCounter = 0;

export function registerToastEmitter(fn: (entry: ToastEntry) => void) {
  _emit = fn;
}

function show(kind: ToastKind, message: string) {
  _emit?.({ id: ++_idCounter, kind, message });
}

export const toast = {
  saved:       (msg = 'Saved')        => show('saved', msg),
  created:     (msg = 'Created')      => show('created', msg),
  deleted:     (msg = 'Deleted')      => show('deleted', msg),
  voided:      (msg = 'Voided')       => show('voided', msg),
  noted:       (msg = 'Noted')        => show('noted', msg),
  skipped:     (msg = 'Skipped')      => show('skipped', msg),
  collected:   (msg = 'Collected')    => show('collected', msg),
  assigned:    (msg = 'Assigned')     => show('assigned', msg),
  cancelled:   (msg = 'Cancelled')    => show('cancelled', msg),
  submitted:   (msg = 'Submitted')    => show('submitted', msg),
  transferred: (msg = 'Transferred')  => show('transferred', msg),
};

// ── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ entry, onDone }: { entry: ToastEntry; onDone: () => void }) {
  const translateY  = useRef(new Animated.Value(-80)).current;
  const opacity     = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const flash       = FLASH_KINDS.includes(entry.kind);

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Glow pulse on the card for positive kinds
    if (flash) {
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.35, duration: 120, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0,    duration: 500, useNativeDriver: true }),
      ]).start();
    }

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start(() => onDone());
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  const s = TOAST_STYLES[entry.kind];

  return (
    <Animated.View
      style={[
        styles.item,
        { backgroundColor: s.bg, borderColor: s.border, transform: [{ translateY }], opacity },
      ]}
    >
      {/* Glow overlay — fades in then out on entry for flash kinds */}
      {flash && (
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: 14,
            backgroundColor: s.color,
            opacity: glowOpacity,
          }}
          pointerEvents="none"
        />
      )}
      <View style={[styles.iconBox, { backgroundColor: s.color + '20' }]}>
        <Text style={{ fontSize: 15, color: s.color, fontWeight: '700' }}>{s.icon}</Text>
      </View>
      <Text style={[styles.msg, { color: s.color }]} numberOfLines={2}>
        {entry.message}
      </Text>
    </Animated.View>
  );
}

// ── Root container — mount once in _layout.tsx ───────────────────────────────

export function ToastRoot() {
  const [queue, setQueue] = useState<ToastEntry[]>([]);

  const emit = useCallback((entry: ToastEntry) => {
    setQueue((q) => [...q, entry]);
  }, []);

  useEffect(() => {
    _emit = emit;
  }, [emit]);

  function remove(id: number) {
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  return (
    <View style={styles.root} pointerEvents="none">
      {queue.map((e) => (
        <ToastItem key={e.id} entry={e} onDone={() => remove(e.id)} />
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msg: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
});
