import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { C } from './ui';

export type DashboardGridItem = {
  id: string;
  content: (options: { editing: boolean; beginEditing: () => void }) => ReactNode;
};

type Props = {
  items: DashboardGridItem[];
  storageKey: string;
  columns?: number;
  gap?: number;
  rowHeight?: number;
  collapsedCount?: number;
  onEditingChange?: (editing: boolean) => void;
};

function normalizeOrder(saved: string[] | null, ids: string[]) {
  if (!saved) return ids;
  const valid = saved.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function move<T>(values: T[], from: number, to: number) {
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SortableItem({
  item,
  index,
  editing,
  cellWidth,
  rowHeight,
  gap,
  columns,
  onBeginEditing,
  onMove,
}: {
  item: DashboardGridItem;
  index: number;
  editing: boolean;
  cellWidth: number;
  rowHeight: number;
  gap: number;
  columns: number;
  onBeginEditing: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const translation = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const dragging = useRef(false);
  const targetIndex = useRef(index);
  targetIndex.current = index;

  const panGesture = useMemo(() => Gesture.Pan()
    .enabled(editing)
    .minDistance(2)
    .shouldCancelWhenOutside(false)
    .runOnJS(true)
    .onBegin(() => {
      dragging.current = true;
      targetIndex.current = index;
      Vibration.vibrate(18);
      Animated.spring(scale, { toValue: 1.035, useNativeDriver: true, speed: 28, bounciness: 5 }).start();
    })
    .onUpdate((gesture) => {
      translation.setValue({ x: gesture.translationX, y: gesture.translationY });

      const startColumn = index % columns;
      const startRow = Math.floor(index / columns);
      const x = startColumn * (cellWidth + gap) + cellWidth / 2 + gesture.translationX;
      const y = startRow * (rowHeight + gap) + rowHeight / 2 + gesture.translationY;
      const column = Math.max(0, Math.min(columns - 1, Math.floor(x / (cellWidth + gap))));
      const row = Math.max(0, Math.floor(y / (rowHeight + gap)));
      targetIndex.current = Math.max(0, Math.min(row * columns + column, Number.MAX_SAFE_INTEGER));
    })
    .onFinalize(() => {
      const destination = targetIndex.current;
      if (destination !== index) onMove(index, destination);
      Animated.parallel([
        Animated.spring(translation, { toValue: { x: 0, y: 0 }, useNativeDriver: true, speed: 28, bounciness: 4 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 4 }),
      ]).start();
      dragging.current = false;
    }), [cellWidth, columns, editing, gap, index, onMove, rowHeight, scale, translation]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={{
          width: cellWidth,
          height: rowHeight,
          zIndex: dragging.current ? 10 : 1,
          transform: [...translation.getTranslateTransform(), { scale }],
        }}
      >
        {item.content({ editing, beginEditing: onBeginEditing })}
        {editing && (
          <View
            pointerEvents="none"
            accessibilityRole="adjustable"
            accessibilityLabel={`Move ${item.id.replace(/-/g, ' ')}`}
            style={StyleSheet.absoluteFill}
          >
            <View pointerEvents="none" style={styles.dragHandle}>
              <Text style={styles.dragHandleText}>⠿</Text>
            </View>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export function SortableDashboardGrid({
  items,
  storageKey,
  columns = 2,
  gap = 10,
  rowHeight = 122,
  collapsedCount,
  onEditingChange,
}: Props) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [order, setOrder] = useState(ids);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active) return;
        const saved = raw ? JSON.parse(raw) as string[] : null;
        setOrder(normalizeOrder(saved, ids));
      })
      .catch(() => {
        if (active) setOrder(ids);
      });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    setOrder((current) => normalizeOrder(current, ids));
  }, [ids.join('|')]);

  const visibleItems = normalizeOrder(order, ids)
    .map((id) => itemMap.get(id))
    .filter((item): item is DashboardGridItem => Boolean(item));
  const hasCollapsedItems = Boolean(collapsedCount && visibleItems.length > collapsedCount);
  const displayedItems = editing || expanded || !collapsedCount
    ? visibleItems
    : visibleItems.slice(0, collapsedCount);
  const cellWidth = width > 0 ? (width - gap * (columns - 1)) / columns : 0;

  const saveOrder = (next: string[]) => {
    setOrder(next);
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
  };

  const handleMove = (from: number, rawTo: number) => {
    const to = Math.max(0, Math.min(rawTo, visibleItems.length - 1));
    if (from === to) return;
    saveOrder(move(visibleItems.map((item) => item.id), from, to));
  };

  const reset = () => {
    Vibration.vibrate(18);
    saveOrder(ids);
  };

  const changeEditing = (next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ marginBottom: 10 }}>
      {editing && (
        <View style={styles.editBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.editTitle}>Customize dashboard</Text>
            <Text style={styles.editHint}>Hold and drag a card to move it</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset dashboard layout" onPress={reset} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Reset</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Finish customizing dashboard" onPress={() => changeEditing(false)} style={styles.doneButton}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      )}
      {width > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {displayedItems.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              editing={editing}
              cellWidth={cellWidth}
              rowHeight={rowHeight}
              gap={gap}
              columns={columns}
              onBeginEditing={() => {
                if (!editing) {
                  Vibration.vibrate(18);
                  changeEditing(true);
                }
              }}
              onMove={handleMove}
            />
          ))}
        </View>
      )}
      {!editing && width > 0 && (
        <View>
          {hasCollapsedItems && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Show fewer dashboard insights' : 'Show all dashboard insights'}
              onPress={() => setExpanded((current) => !current)}
              style={styles.insightsButton}
            >
              <Text style={styles.insightsButtonText}>
                {expanded ? 'Show less' : `More insights (${visibleItems.length - (collapsedCount ?? 0)})`}
              </Text>
              <Text style={styles.insightsChevron}>{expanded ? '⌃' : '⌄'}</Text>
            </Pressable>
          )}
          <Text style={styles.customizeHint}>Long-press any overview card to customize</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editBar: {
    minHeight: 54,
    marginBottom: 12,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#DDE4EC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  editTitle: { color: C.navy, fontSize: 13, fontWeight: '800' },
  editHint: { color: C.gray500, fontSize: 10, marginTop: 1 },
  secondaryButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12 },
  secondaryText: { color: C.gray600, fontSize: 12, fontWeight: '700' },
  doneButton: { backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  doneText: { color: C.white, fontSize: 12, fontWeight: '800' },
  dragHandle: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,43,68,0.10)',
  },
  dragHandleText: { color: C.navy, fontSize: 17, fontWeight: '800', lineHeight: 19 },
  insightsButton: {
    alignSelf: 'center',
    minHeight: 36,
    marginTop: 11,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  insightsButtonText: { color: C.navy, fontSize: 12, fontWeight: '700' },
  insightsChevron: { color: C.navy, fontSize: 15, fontWeight: '800', marginTop: -2 },
  customizeHint: { color: C.gray400, fontSize: 10, textAlign: 'center', marginTop: 7 },
});
