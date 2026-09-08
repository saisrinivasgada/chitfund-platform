import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
  Animated, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '../../../components/ui';
import { getMyReminders, getMyReminder, setReminderPromisedDate, removeReminder } from '../../../services/api';
import { cancelReminderRepeat } from '../../../hooks/usePushNotifications';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Reminder Detail Modal ─────────────────────────────────────────────────────

function ReminderDetailModal({ reminderId, onClose }: { reminderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateInput, setDateInput] = useState(''); // YYYY-MM-DD

  const { data: reminder, isLoading } = useQuery({
    queryKey: ['my-reminder', reminderId],
    queryFn: () => getMyReminder(reminderId),
    staleTime: 30_000,
  });

  const promiseMutation = useMutation({
    mutationFn: (date: string) => setReminderPromisedDate(reminderId, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-reminders'] });
      qc.invalidateQueries({ queryKey: ['my-reminder', reminderId] });
      cancelReminderRepeat(reminderId); // promised date set → stop repeat notifications
      setShowDateInput(false);
      setDateInput('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeReminder(reminderId),
    onSuccess: () => {
      // Do NOT cancel local notifications on remove — they keep running until a
      // promised date is set. Remove only hides the reminder from the list view.
      qc.invalidateQueries({ queryKey: ['my-reminders'] });
      onClose();
    },
  });

  if (isLoading || !reminder) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <ActivityIndicator color={C.navy} />
      </View>
    );
  }

  let chits: any[] = [];
  try { chits = JSON.parse(reminder.chitDetails ?? '[]'); } catch {}

  const promisedDateStr = reminder.promisedDate
    ? new Date(reminder.promisedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200 }} />
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.gray100 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900 }}>Reminder Details</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 20, color: C.gray400 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
          {/* Total */}
          {reminder.totalAmount > 0 && (
            <View style={{ backgroundColor: '#EEF2F8', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: C.gray500 }}>Total Outstanding</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.navy }}>₹{Number(reminder.totalAmount).toLocaleString('en-IN')}</Text>
            </View>
          )}

          {/* Chit breakdown — names are tappable links to chit detail page */}
          {chits.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Chits Included</Text>
              {chits.map((c: any, i: number) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    if (c.chitId) {
                      onClose();
                      // Pass reminderId so chit-detail's back button reopens this reminder
                      router.push({ pathname: '/(app)/(member)/chit-detail', params: { chitId: c.chitId, fromReminderId: reminderId } } as any);
                    }
                  }}
                  disabled={!c.chitId}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.gray100 }}
                  activeOpacity={c.chitId ? 0.7 : 1}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: c.chitId ? C.navy : C.gray700, fontWeight: c.chitId ? '600' : '400' }}>
                      {c.chitName}{c.cycleNo ? ` · Cycle ${c.cycleNo}` : ''}
                      {c.chitId ? ' →' : ''}
                    </Text>
                  </View>
                  {c.installmentAmount && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900, marginLeft: 8 }}>₹{Number(c.installmentAmount).toLocaleString('en-IN')}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Admin message */}
          {reminder.message && (
            <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: C.navy }}>
              <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 4 }}>Message from admin</Text>
              <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{reminder.message}"</Text>
            </View>
          )}

          {/* Promised date */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your Commitment</Text>
            {promisedDateStr ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>📅 {promisedDateStr}</Text>
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>You promised to pay by this date</Text>
                </View>
                <TouchableOpacity onPress={() => { setDateInput(reminder.promisedDate ?? ''); setShowDateInput(true); }}>
                  <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600' }}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowDateInput(true)}
                style={{ backgroundColor: '#EEF2F8', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', gap: 8 }}
              >
                <Text style={{ fontSize: 16 }}>📅</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>Set my promised payment date</Text>
              </TouchableOpacity>
            )}

            {showDateInput && (
              <View style={{ marginTop: 10, padding: 12, backgroundColor: C.gray50, borderRadius: 10, gap: 10 }}>
                <Text style={{ fontSize: 12, color: C.gray500 }}>Enter date (YYYY-MM-DD)</Text>
                <TextInput
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="2025-01-31"
                  placeholderTextColor={C.gray300}
                  style={{ fontSize: 16, fontWeight: '600', color: C.gray900, borderBottomWidth: 1, borderColor: C.navy, paddingVertical: 4 }}
                  keyboardType="numbers-and-punctuation"
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setShowDateInput(false)}>
                    <Text style={{ fontSize: 13, color: C.gray500 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) promiseMutation.mutate(dateInput); }}
                    disabled={promiseMutation.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>
                      {promiseMutation.isPending ? 'Saving…' : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Audit trail */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Timeline</Text>
            <AuditRow icon="📤" label="Sent" value={formatDateTime(reminder.sentAt)} />
            <AuditRow icon="👁" label="Seen" value={reminder.seenAt ? formatDateTime(reminder.seenAt) : 'Not recorded'} dim={!reminder.seenAt} />
            <AuditRow icon="📖" label="Read" value={reminder.readAt ? formatDateTime(reminder.readAt) : 'Not recorded'} dim={!reminder.readAt} />
            {(() => {
              let history: { date: string; setAt: string }[] = [];
              try { history = JSON.parse(reminder.promisedDateHistory ?? '[]'); } catch {}
              return history.map((h, i) => (
                <AuditRow
                  key={i}
                  icon="✅"
                  label={i === history.length - 1 ? 'Promise set' : 'Promise updated'}
                  value={`${formatDate(h.date)} · ${formatDateTime(h.setAt)}`}
                />
              ));
            })()}
          </View>
        </View>

      </View>
    </View>
  );
}

function AuditRow({ icon, label, value, dim = false }: { icon: string; label: string; value: string; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: 13, color: C.gray500, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: dim ? C.gray300 : C.gray600 }}>{value}</Text>
    </View>
  );
}

// ── Reminder Card (swipeable) ─────────────────────────────────────────────────

function ReminderCard({
  reminder,
  onTap,
  onRemove,
}: {
  reminder: any;
  onTap: () => void;
  onRemove: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  function animateOut(cb: () => void) {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 60, duration: 220, useNativeDriver: true }),
    ]).start(() => cb());
  }

  function handleDelete() {
    swipeRef.current?.close();
    animateOut(onRemove);
  }

  function renderRightActions(_: any, dragX: Animated.AnimatedInterpolation<number>) {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.8], extrapolate: 'clamp' });
    return (
      <TouchableOpacity onPress={handleDelete} activeOpacity={0.8}>
        <Animated.View style={{
          width: 72, backgroundColor: '#EF4444', alignItems: 'center',
          justifyContent: 'center', flex: 1, transform: [{ scale }],
        }}>
          <Text style={{ fontSize: 20 }}>🗑</Text>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 }}>Remove</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  let chits: any[] = [];
  try { chits = JSON.parse(reminder.chitDetails ?? '[]'); } catch {}
  const chitNames = chits.map((c: any) => c.chitName).join(', ') || 'Reminder';
  const isRead = !!reminder.readAt;
  const isSeen = !!reminder.seenAt;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={() => {
        if (swiped) {
          // Second swipe — delete immediately
          animateOut(onRemove);
        } else {
          setSwiped(true);
        }
      }}
    >
      <Animated.View style={{ opacity, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={onTap}
          style={{
            flexDirection: 'row', alignItems: 'flex-start',
            padding: 16, gap: 12, backgroundColor: isRead ? '#fff' : '#F0F4FF',
          }}
          activeOpacity={0.8}
        >
          {/* Unread dot */}
          <View style={{ marginTop: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: isRead ? C.gray200 : C.navy, flexShrink: 0 }} />

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 14, fontWeight: isRead ? '500' : '700', color: C.gray900, flex: 1, marginRight: 8 }} numberOfLines={1}>
                {chitNames}
              </Text>
              <Text style={{ fontSize: 11, color: C.gray400 }}>{formatDate(reminder.sentAt)}</Text>
            </View>
            {reminder.totalAmount > 0 && (
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, marginTop: 2 }}>
                ₹{Number(reminder.totalAmount).toLocaleString('en-IN')}
              </Text>
            )}
            {reminder.promisedDate && (
              <Text style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                📅 Promised: {formatDate(reminder.promisedDate)}
              </Text>
            )}
            {reminder.message && !reminder.promisedDate && (
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }} numberOfLines={1}>
                {reminder.message}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Swipeable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
] as const;

export default function RemindersScreen() {
  const qc = useQueryClient();
  const { openReminderId } = useLocalSearchParams<{ openReminderId?: string }>();
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-open detail when navigated here from a notification tap
  useEffect(() => {
    if (openReminderId) setSelectedId(openReminderId);
  }, [openReminderId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-reminders', filter, page],
    queryFn: () => getMyReminders({ filter, page, size: 20 }),
    staleTime: 30_000,
  });

  const reminders: any[] = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeReminder(id),
    onSuccess: (_, id) => {
      // Local notifications keep running after remove — only promised date cancels them
      qc.invalidateQueries({ queryKey: ['my-reminders'] });
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.gray900 }}>Reminders</Text>
        <Text style={{ fontSize: 13, color: C.gray400, marginTop: 2 }}>Payment reminders from your admin</Text>
      </View>

      {/* Filter capsules */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { setFilter(key); setPage(0); }}
              style={{
                paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: 20, borderWidth: 1,
                borderColor: active ? C.navy : C.gray200,
                backgroundColor: active ? C.navy : '#fff',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : C.gray500 }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      ) : reminders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, textAlign: 'center', marginBottom: 6 }}>
            {filter === 'unread' ? 'All caught up!' : filter === 'archived' ? 'Nothing archived' : 'No reminders yet'}
          </Text>
          <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>
            {filter === 'all' ? 'Your admin will send payment reminders here.' : ''}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          onRefresh={() => { refetch(); }}
          refreshing={false}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.gray100 }} />}
          renderItem={({ item }) => (
            <ReminderCard
              reminder={item}
              onTap={() => setSelectedId(item.id)}
              onRemove={() => removeMutation.mutate(item.id)}
            />
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <TouchableOpacity disabled={page === 0} onPress={() => setPage(p => p - 1)}>
                  <Text style={{ fontSize: 13, color: page === 0 ? C.gray300 : C.navy, fontWeight: '600' }}>← Prev</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 12, color: C.gray400 }}>{page + 1} / {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages - 1} onPress={() => setPage(p => p + 1)}>
                  <Text style={{ fontSize: 13, color: page >= totalPages - 1 ? C.gray300 : C.navy, fontWeight: '600' }}>Next →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {/* Reminder detail bottom sheet */}
      <Modal visible={!!selectedId} transparent animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId && (
          <ReminderDetailModal reminderId={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </Modal>
    </SafeAreaView>
  );
}
