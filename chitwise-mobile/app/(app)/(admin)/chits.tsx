import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, RefreshControl, FlatList, Modal, Alert, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getChits, createChit, updateChitStatus, getEnrollments, enrollMember,
  removeEnrollment, getMembers, getWinners, recordWinner,
  getDraws, openDraw, closeDraw, skipDraw, deleteDraw, getDrawPayments,
  getReservations, addReservationSlot, removeReservationSlot,
  swapReservationSlots, shiftReservations, markSlotProcessed,
  updateReservationSlot, hardDeleteReservationSlot,
  recordPayment, createPayout, disbursePayout, getPaymentBatches, voidPaymentBatch, getPayoutsByChit,
  listStaff, updateChitName,
} from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, EmptyState, LoadingScreen, fmtDate, fmtDateTime } from '../../../components/ui';
import { toast } from '../../../components/Toast';

// Statuses that count as "cleared" (no payment needed)
const CLEARED_STATUSES = new Set(['SETTLED', 'SETTLEMENT_CLEARED', 'WAIVED', 'PAYOUT_DEDUCTED']);
const PAY_STATUS_COLOR: Record<string, string> = {
  SETTLED: C.green, SETTLEMENT_CLEARED: '#0D9488', WAIVED: C.gray400,
  PAYOUT_DEDUCTED: '#7C3AED', PARTIALLY_PAID: C.amber, OUTSTANDING: C.red,
};
const PAY_STATUS_LABEL: Record<string, string> = {
  SETTLED: 'Settled', SETTLEMENT_CLEARED: 'Settled', WAIVED: 'Waived',
  PAYOUT_DEDUCTED: 'Payout', PARTIALLY_PAID: 'Partial', OUTSTANDING: 'Pending',
};

// Compute ISO due date for a given cycle number relative to chit start date
function computeDueDate(startDateStr: string | null | undefined, cycleNum: number): string {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length < 3) return '';
  const [y, m, d] = parts;
  const targetMonth = m - 1 + (cycleNum - 1);
  const targetYear = y + Math.floor(targetMonth / 12);
  const targetMon = targetMonth % 12;
  const lastDay = new Date(targetYear, targetMon + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Sub-component: fetches real per-draw payment records (includes SETTLEMENT_CLEARED)
function DrawPaymentRows({ drawId, drawStatus, memberMap, installmentAmount, onCollect }: {
  drawId: string;
  drawStatus: string;
  memberMap: Record<string, string>;
  installmentAmount?: number;
  onCollect: (memberId: string) => void;
}) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['draw-payments', drawId],
    queryFn: () => getDrawPayments(drawId),
    staleTime: 30_000,
    enabled: !!drawId,
  });

  const cleared = (payments as any[]).filter((p: any) => CLEARED_STATUSES.has(p.status)).length;
  const total = (payments as any[]).length;

  if (isLoading) return (
    <View style={{ paddingVertical: 12, alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: C.gray400 }}>Loading payments…</Text>
    </View>
  );
  if (payments.length === 0) return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, color: C.gray400 }}>No payment records for this draw.</Text>
    </View>
  );

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>
        Member Payments ({cleared}/{total} cleared)
      </Text>
      {(payments as any[]).map((p: any) => {
        const mName = memberMap[p.memberId] ?? 'Unknown';
        const isCleared = CLEARED_STATUSES.has(p.status);
        const canCollect = (p.status === 'OUTSTANDING' || p.status === 'PARTIALLY_PAID') && drawStatus === 'OPEN';
        const dotColor = PAY_STATUS_COLOR[p.status] ?? C.gray400;
        const label = PAY_STATUS_LABEL[p.status] ?? p.status?.replace(/_/g, ' ') ?? '';
        const outstanding = Number(p.balance ?? 0);
        const pct = p.amountDue > 0 ? Math.min(100, Math.round((p.amountPaid / p.amountDue) * 100)) : 0;
        const effectivePct = isCleared ? 100 : pct;
        const barColor = isCleared ? C.green : pct > 0 ? C.navy : C.red;

        return (
          <View key={p.id} style={{
            paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.gray100,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500', flex: 1 }}>{mName}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: dotColor }}>{label}</Text>
              </View>
              {canCollect && (
                <TouchableOpacity
                  onPress={() => onCollect(p.memberId)}
                  style={{ marginLeft: 8, backgroundColor: C.green + '15', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>Collect</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Progress bar */}
            <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, height: 4, backgroundColor: C.gray100, borderRadius: 2 }}>
                <View style={{ width: `${effectivePct}%`, height: 4, backgroundColor: barColor, borderRadius: 2 }} />
              </View>
              {outstanding > 0 && !isCleared ? (
                <Text style={{ fontSize: 10, color: C.red, fontWeight: '600' }}>₹{outstanding.toLocaleString('en-IN')} due</Text>
              ) : isCleared ? (
                <Text style={{ fontSize: 10, color: C.green, fontWeight: '600' }}>Clear ✓</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const STATUS_NEXT: Record<string, string[]> = {
  DRAFT: ['ACTIVE'], ACTIVE: ['PAUSED', 'COMPLETED'], PAUSED: ['ACTIVE', 'COMPLETED'], COMPLETED: [],
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: C.gray400, ACTIVE: C.green, PAUSED: C.amber, COMPLETED: C.navy,
};
const DRAW_COLOR: Record<string, string> = {
  PENDING: C.gray400, OPEN: C.green, CLOSED: C.navy, SKIPPED: C.amber,
};
const SLOT_COLOR: Record<string, string> = {
  UNALLOCATED: C.gray400, RESERVED: C.navy, VOIDED: C.red, PROCESSED: C.green,
};

type DetailTab = 'info' | 'members' | 'winners' | 'draws' | 'schedule';

export default function AdminChitsScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ openChitId?: string }>();
  const [selected, setSelected] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [editingChitName, setEditingChitName] = useState(false);
  const [chitNameInput, setChitNameInput] = useState('');
  const [chitDescInput, setChitDescInput] = useState('');

  // ── Create form (4-step wizard matching web) ──────────────────────────────
  const [createStep, setCreateStep] = useState(1);       // 1=type 2=details 3=contribution 4=schedule
  const [cChitType, setCChitType] = useState('RESERVATION');
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cChitValue, setCChitValue] = useState('');
  const [cMembers, setCMembers] = useState('');
  const [cInstall, setCInstall] = useState('');
  const [cStart, setCStart] = useState(new Date().toISOString().slice(0, 10));
  const [cDueDate, setCDueDate] = useState('');
  const [cAdminSpots, setCAdminSpots] = useState('0');
  const [cPostPayoutEnabled, setCPostPayoutEnabled] = useState(false);
  const [cPostPayoutAmount, setCPostPayoutAmount] = useState('');
  const [cSchedule, setCSchedule] = useState<Array<{reservationMonth: string; label: string; payoutAmount: string}>>([]);
  // legacy aliases kept for pre-existing references
  const cTotal = cChitValue;
  const cDuration = cMembers;

  // ── Members tab ────────────────────────────────────────────────────────────
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollMemberId, setEnrollMemberId] = useState('');

  // ── Winners tab ────────────────────────────────────────────────────────────
  const [showWinner, setShowWinner] = useState(false);
  const [winnerMemberId, setWinnerMemberId] = useState('');
  const [winnerDraw, setWinnerDraw] = useState('');

  // ── Draws tab ──────────────────────────────────────────────────────────────
  const [showOpenDraw, setShowOpenDraw] = useState(false);
  const [odWinnerIds, setOdWinnerIds] = useState<string[]>([]);
  const [odDrawNum, setOdDrawNum] = useState('');
  const toggleOdWinner = (mid: string) =>
    setOdWinnerIds((prev) => prev.includes(mid) ? prev.filter((id) => id !== mid) : [...prev, mid]);
  const [showSkipDraw, setShowSkipDraw] = useState(false);
  const [sdDrawId, setSdDrawId] = useState('');
  const [sdDrawNum, setSdDrawNum] = useState('');
  const [sdReason, setSdReason] = useState('');

  // ── Draw expand + history ──────────────────────────────────────────────────
  const [expandedDrawId, setExpandedDrawId] = useState<string | null>(null);

  // ── Create Payout from Winner ──────────────────────────────────────────────
  const [showWinnerPayout, setShowWinnerPayout] = useState(false);
  const [wpWinner, setWpWinner] = useState<any>(null);
  const [wpAmount, setWpAmount] = useState('');
  const [wpNotes, setWpNotes] = useState('');

  // ── Disburse Payout ────────────────────────────────────────────────────────
  const [showDisburse, setShowDisburse] = useState(false);
  const [dsPayout, setDsPayout] = useState<any>(null);
  const [dsMode, setDsMode] = useState('CASH');
  const [dsNotes, setDsNotes] = useState('');
  const [dsAmount, setDsAmount] = useState('');

  // ── View Payout Detail ─────────────────────────────────────────────────────
  const [showPayoutDetail, setShowPayoutDetail] = useState(false);
  const [pdPayout, setPdPayout] = useState<any>(null);

  // ── Collect payment from draw ──────────────────────────────────────────────
  const [showCollectPay, setShowCollectPay] = useState(false);
  const [cpDraw, setCpDraw] = useState<any>(null);
  const [cpMemberId, setCpMemberId] = useState('');
  const [cpAmount, setCpAmount] = useState('');
  const [cpMode, setCpMode] = useState('CASH');
  const [cpNotes, setCpNotes] = useState('');

  // ── Void payment batch ─────────────────────────────────────────────────────
  const [voidBatchId, setVoidBatchId] = useState('');
  const [voidBatchReason, setVoidBatchReason] = useState('');

  // ── Schedule tab ───────────────────────────────────────────────────────────
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [asMonth, setAsMonth] = useState('');
  const [asMemberId, setAsMemberId] = useState('');
  const [asPayoutAmount, setAsPayoutAmount] = useState('');
  const [showVoidSlot, setShowVoidSlot] = useState(false);
  const [vsSlot, setVsSlot] = useState<any>(null);
  const [vsReason, setVsReason] = useState('');
  const [vsReplaceAt, setVsReplaceAt] = useState<'same' | 'end'>('same');
  const [showSwap, setShowSwap] = useState(false);
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');
  const [showShift, setShowShift] = useState(false);
  const [shiftFrom, setShiftFrom] = useState('');
  // Inline slot editing
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotEditMemberId, setSlotEditMemberId] = useState('');
  const [slotEditPayout, setSlotEditPayout] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: chits = [], isLoading, refetch } = useQuery({ queryKey: ['a-chits'], queryFn: getChits });
  const { data: members = [] } = useQuery({ queryKey: ['a-members'], queryFn: getMembers });

  // Auto-open chit when navigated from member detail with openChitId param
  useEffect(() => {
    if (params.openChitId && (chits as any[]).length > 0) {
      const target = (chits as any[]).find((c: any) => c.id === params.openChitId);
      if (target) { setSelected(target); setDetailTab('info'); setShowDetail(true); }
    }
  }, [params.openChitId, chits]);
  const { data: enrollments = [] } = useQuery({
    queryKey: ['a-enrollments', selected?.id],
    queryFn: () => getEnrollments(selected!.id),
    enabled: !!selected?.id && showDetail,
  });
  const { data: winners = [] } = useQuery({
    queryKey: ['a-winners', selected?.id],
    queryFn: () => getWinners(selected!.id),
    enabled: !!selected?.id && (detailTab === 'winners' || detailTab === 'draws'),
  });
  const { data: draws = [], refetch: refetchDraws } = useQuery({
    queryKey: ['a-draws', selected?.id],
    queryFn: () => getDraws(selected!.id),
    enabled: !!selected?.id && detailTab === 'draws',
  });
  const { data: reservations = [], refetch: refetchSlots } = useQuery({
    queryKey: ['a-reservations', selected?.id],
    queryFn: () => getReservations(selected!.id),
    enabled: !!selected?.id && detailTab === 'schedule',
  });
  const { data: chitPayouts = [] } = useQuery({
    queryKey: ['a-chit-payouts', selected?.id],
    queryFn: () => getPayoutsByChit(selected!.id),
    enabled: !!selected?.id && detailTab === 'winners',
    staleTime: 30_000,
  });
  // All payment batches for this chit — used in draws tab to show per-member pay status
  const { data: chitBatches = [] } = useQuery({
    queryKey: ['a-chit-batches', selected?.id],
    queryFn: () => getPaymentBatches(undefined, selected!.id),
    enabled: !!selected?.id && detailTab === 'draws',
  });
  const { data: staff = [] } = useQuery({ queryKey: ['a-staff'], queryFn: listStaff });

  // ── Mutations: list/create ─────────────────────────────────────────────────
  function buildMonthRows(startDateStr: string, count: number, defaultPayout: string) {
    if (!startDateStr || !count || count < 1) return [];
    const [year, month] = startDateStr.split('-').map(Number);
    if (!year || !month) return [];
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(year, month - 1 + i, 1);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      return { reservationMonth: iso, label, payoutAmount: defaultPayout };
    });
  }

  function handleCStartChange(val: string) {
    setCStart(val);
    if (val && cMembers) setCSchedule(buildMonthRows(val, Number(cMembers), cChitValue));
  }

  function handleCMembersChange(val: string) {
    setCMembers(val);
    if (val) setCSchedule(buildMonthRows(cStart || new Date().toISOString().slice(0, 10), Number(val), cChitValue));
  }

  function resetCreateForm() {
    setCreateStep(1);
    setCChitType('RESERVATION'); setCName(''); setCDesc('');
    setCChitValue(''); setCMembers(''); setCInstall('');
    setCStart(new Date().toISOString().slice(0, 10)); setCDueDate(''); setCAdminSpots('0');
    setCPostPayoutEnabled(false); setCPostPayoutAmount('');
    setCSchedule([]);
  }

  const createMut = useMutation({
    mutationFn: (includeSchedule: boolean) => {
      const n = (v: string) => { const x = Number(v); return isNaN(x) ? 0 : x; };
      const due = n(cDueDate);
      return createChit({
        chitType: cChitType,
        winnerSelectionMode: cChitType,
        name: cName.trim(),
        description: cDesc.trim() || null,
        chitValue: n(cChitValue),
        numberOfMonths: n(cMembers),
        numberOfMembers: n(cMembers),
        installmentAmount: n(cInstall) || null,
        startDate: cStart.trim() || null,
        monthlyDueDate: due >= 1 && due <= 28 ? due : null,
        adminHeldSpotsCount: Math.max(0, n(cAdminSpots)),
        postPayoutContributionEnabled: cPostPayoutEnabled,
        defaultPostPayoutContribution: cPostPayoutEnabled && cPostPayoutAmount ? n(cPostPayoutAmount) : null,
        reservationSchedule: includeSchedule && cSchedule.length > 0
          ? cSchedule.map((r) => ({
              reservationMonth: r.reservationMonth,
              memberId: null,
              payoutAmount: n(r.payoutAmount) > 0 ? n(r.payoutAmount) : null,
            }))
          : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      setShowCreate(false);
      resetCreateForm();
      toast.created('Chit fund created');
    },
    onError: (e: any) => {
      const data = e.response?.data;
      const fieldErrors = data?.fieldErrors as Record<string, string> | undefined;
      const detail = fieldErrors
        ? Object.entries(fieldErrors).map(([k, v]) => `• ${k}: ${v}`).join('\n')
        : (data?.message ?? e.message ?? 'Failed to create chit fund');
      Alert.alert('Create Failed', detail);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, startDate }: any) => updateChitStatus(id, status, startDate),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      setSelected((prev: any) => prev ? { ...prev, status: vars.status } : prev);
      toast.saved('Status updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const enrollMut = useMutation({
    mutationFn: ({ chitId, memberId }: any) => enrollMember(chitId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-enrollments', selected?.id] });
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      setShowEnroll(false); setEnrollMemberId('');
      toast.created('Member enrolled');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Already enrolled or failed'),
  });

  const removeMut = useMutation({
    mutationFn: ({ chitId, memberId }: any) => removeEnrollment(chitId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-enrollments', selected?.id] });
      qc.invalidateQueries({ queryKey: ['a-chits'] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const winnerMut = useMutation({
    mutationFn: ({ chitId, memberId, monthNumber }: any) =>
      recordWinner(chitId, { memberId, monthNumber: Number(monthNumber) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-winners', selected?.id] });
      setShowWinner(false); setWinnerMemberId(''); setWinnerDraw('');
      toast.saved('Winner recorded');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  // ── Mutations: draws ───────────────────────────────────────────────────────
  const openDrawMut = useMutation({
    mutationFn: async () => {
      const drawNum = Number(odDrawNum) || nextDrawNum;
      await openDraw({ chitId: selected.id, drawNumber: drawNum });
      // Record each winner separately
      const chitValue = Number(selected?.chitValue ?? 0);
      for (const mid of odWinnerIds) {
        await recordWinner(selected.id, {
          winnerId: mid,
          monthNumber: drawNum,
          winningAmount: chitValue,
          discountAmount: 0,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-draws', selected.id] });
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      if (odWinnerIds.length > 0) qc.invalidateQueries({ queryKey: ['a-winners', selected.id] });
      setShowOpenDraw(false); setOdWinnerIds([]); setOdDrawNum('');
      toast.noted('Draw opened');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const closeDrawMut = useMutation({
    mutationFn: (drawId: string) => closeDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-draws', selected.id] });
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      toast.noted('Draw closed');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const skipDrawMut = useMutation({
    mutationFn: async () => {
      const monthNum = Number(sdDrawNum);
      const baseInstallment = Number(selected.installmentAmount ?? (Number(selected.chitValue ?? 0) / Number(selected.totalMembers ?? 1)));
      const uniqueMemberIds = [...new Set((enrollments as any[]).map((e: any) => e.memberId ?? e.id))];
      const dueDate = computeDueDate(selected.startDate, monthNum);
      await skipDraw({
        chitId: selected.id,
        monthNumber: monthNum,
        dueDate,
        installmentAmount: baseInstallment,
        memberIds: uniqueMemberIds,
        skipReason: sdReason,
      });
      await shiftReservations(selected.id, monthNum).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-draws', selected.id] });
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      qc.invalidateQueries({ queryKey: ['a-chits'] });
      setShowSkipDraw(false); setSdDrawId(''); setSdDrawNum(''); setSdReason('');
      toast.skipped('Draw skipped — slots shifted forward');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const deleteDrawMut = useMutation({
    mutationFn: (drawId: string) => deleteDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-draws', selected.id] });
      qc.invalidateQueries({ queryKey: ['a-chit-batches', selected.id] });
      toast.deleted('Draw deleted');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to delete draw'),
  });

  const voidBatchMut = useMutation({
    mutationFn: () => voidPaymentBatch(voidBatchId, voidBatchReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-chit-batches', selected.id] });
      setVoidBatchId(''); setVoidBatchReason('');
      toast.voided('Payment voided — records reversed');
    },
    onError: (e: any) => Alert.alert('Cannot Void Payment', e.response?.data?.message ?? 'Void failed — payment may be linked to a disbursed payout or already voided.'),
  });

  // ── Mutation: collect payment for a draw ──────────────────────────────────
  const collectPayMut = useMutation({
    mutationFn: () => recordPayment({
      chitId: selected.id,
      memberId: cpMemberId,
      amount: Number(cpAmount),
      paymentMode: cpMode,
      drawNumber: cpDraw?.drawNumber,
      notes: cpNotes || undefined,
    }),
    onSuccess: () => {
      setShowCollectPay(false);
      setCpDraw(null); setCpMemberId(''); setCpAmount(''); setCpMode('CASH'); setCpNotes('');
      qc.invalidateQueries({ predicate: (q: any) => q.queryKey[0] === 'draw-payments' });
      if (selected?.id) {
        qc.invalidateQueries({ queryKey: ['a-draws', selected.id] });
        qc.invalidateQueries({ queryKey: ['a-payment-history', selected.id, cpMemberId] });
      }
      toast.saved('Payment recorded');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Payment failed'),
  });

  // ── Mutations: schedule ────────────────────────────────────────────────────
  const addSlotMut = useMutation({
    mutationFn: () => addReservationSlot(selected.id, {
      slotNumber: Number(asMonth), memberId: asMemberId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      setShowAddSlot(false); setAsMonth(''); setAsMemberId('');
      toast.created('Reservation slot added');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to reserve slot.'),
  });

  const voidSlotMut = useMutation({
    mutationFn: () => removeReservationSlot(selected.id, vsSlot.id, vsReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      setShowVoidSlot(false); setVsSlot(null); setVsReason('');
      toast.voided('Slot voided');
    },
    onError: (e: any) => Alert.alert('Cannot Void Slot', e.response?.data?.message ?? 'Void failed — slot may be in a non-voidable state.'),
  });

  const swapMut = useMutation({
    mutationFn: () => swapReservationSlots(selected.id, swapA, swapB),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      setShowSwap(false); setSwapA(''); setSwapB('');
      toast.saved('Slots swapped');
    },
    onError: (e: any) => Alert.alert('Swap Failed', e.response?.data?.message ?? e.message ?? 'Failed to swap slots. Both slots must be in RESERVED status.'),
  });

  const shiftMut = useMutation({
    mutationFn: () => shiftReservations(selected.id, Number(shiftFrom)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      setShowShift(false); setShiftFrom('');
      toast.saved('Schedule shifted forward by 1 month');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const processSlotMut = useMutation({
    mutationFn: (resId: string) => markSlotProcessed(selected.id, resId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] }),
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const updateSlotMut = useMutation({
    mutationFn: ({ slot, memberId, payoutAmount }: { slot: any; memberId: string; payoutAmount: string }) =>
      updateReservationSlot(selected.id, slot.id, {
        reservationMonth: slot.reservationMonth,
        memberId: memberId || null,
        payoutAmount: payoutAmount ? Number(payoutAmount) : null,
        postPayoutContribution: slot.postPayoutContribution ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      setEditingSlotId(null);
      toast.saved('Slot updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to save slot'),
  });

  const hardDeleteSlotMut = useMutation({
    mutationFn: (resId: string) => hardDeleteReservationSlot(selected.id, resId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-reservations', selected.id] });
      toast.deleted('Slot permanently deleted');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to delete'),
  });

  // Payout from winner tab
  const winnerPayoutMut = useMutation({
    mutationFn: () => createPayout({
      memberId: wpWinner?.memberId ?? wpWinner?.winnerId,
      chitId: selected?.id,
      monthNumber: wpWinner?.monthNumber ?? wpWinner?.drawNumber,
      winningAmount: Number(wpAmount),
      discountAmount: 0,
      notes: wpNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-chit-payouts', selected?.id] });
      setShowWinnerPayout(false); setWpWinner(null); setWpAmount(''); setWpNotes('');
      toast.created('Payout created — go to Finance → Payouts to disburse');
    },
    onError: (e: any) => Alert.alert('Create Payout Failed', e.response?.data?.message ?? 'Please check the details and try again.'),
  });

  // Disburse existing payout
  const disburseMut = useMutation({
    mutationFn: () => disbursePayout(dsPayout.id, {
      disbursedAmount: Number(dsAmount),
      paymentMode: dsMode,
      notes: dsNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-chit-payouts', selected?.id] });
      setShowDisburse(false); setDsPayout(null); setDsMode('CASH'); setDsNotes(''); setDsAmount('');
      toast.saved('Payout disbursed successfully');
    },
    onError: (e: any) => Alert.alert('Disburse Failed', e.response?.data?.message ?? 'Disbursement failed. Please try again.'),
  });

  const renameMut = useMutation({
    mutationFn: () => updateChitName(selected!.id, chitNameInput.trim(), chitDescInput.trim() || undefined),
    onSuccess: (updated: any) => {
      qc.setQueryData(['a-chits'], (old: any[]) => old?.map((c) => c.id === updated.id ? updated : c));
      setSelected(updated);
      setEditingChitName(false);
      toast.saved('Chit name updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to update name'),
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const memberMap: Record<string, string> = Object.fromEntries([
    ...(staff as any[]).map((s) => [String(s.id), `${s.fullName ?? s.username} (Admin)`]),
    ...(members as any[]).map((m) => [String(m.id), m.fullName ?? m.name ?? '—']),
  ]);
  const enrolledIds = new Set((enrollments as any[]).map((e: any) => e.memberId ?? e.id));
  const unenrolled = (members as any[]).filter((m) => !enrolledIds.has(m.id));
  const reservedSlots = (reservations as any[]).filter((r) => r.status === 'RESERVED');

  const drawsList = [...(draws as any[])].sort((a, b) => ((a.drawNumber ?? a.monthNumber ?? 0) - (b.drawNumber ?? b.monthNumber ?? 0)));
  const slotsList = [...(reservations as any[])].sort((a, b) => (a.slotNumber ?? a.monthNumber ?? 0) - (b.slotNumber ?? b.monthNumber ?? 0));
  const nextDrawNum = drawsList.length > 0 ? Math.max(...drawsList.map((d: any) => (d.drawNumber ?? d.monthNumber ?? 0))) + 1 : 1;

  const active    = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const paused    = (chits as any[]).filter((c) => c.status === 'PAUSED');
  const completed = (chits as any[]).filter((c) => c.status === 'COMPLETED');
  const draft     = (chits as any[]).filter((c) => c.status === 'DRAFT');
  const cancelled = (chits as any[]).filter((c) => c.status === 'CANCELLED');

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [chitShowCount, setChitShowCount] = useState(15);
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'members'>('name');

  const allDisplayChits = [...(chits as any[])].filter((c) =>
    statusFilter === 'ALL' ? c.status !== 'CANCELLED' : c.status === statusFilter
  )
    .sort((a, b) => {
      if (sortBy === 'amount') return Number(b.installmentAmount ?? 0) - Number(a.installmentAmount ?? 0);
      if (sortBy === 'members') return Number(b.enrolledCount ?? b.totalMembers ?? 0) - Number(a.enrolledCount ?? a.totalMembers ?? 0);
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  const displayChits = allDisplayChits.slice(0, chitShowCount);

  function openDetail(c: any) {
    setSelected(c); setDetailTab('info'); setShowDetail(true);
  }

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'members', label: `Members (${(enrollments as any[]).length})` },
    { key: 'draws', label: 'Draws' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'winners', label: 'Winners' },
  ];

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={displayChits}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={T.h1}>Chit Funds</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowCreate(true)}
                  style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
                  <Text style={{ color: C.white, fontWeight: '700', fontSize: 13 }}>+ Create</Text>
                </TouchableOpacity>
                <ProfileAvatarButton size={34} />
              </View>
            </View>
            {/* Status filter boxes */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'All', status: 'ALL', count: (chits as any[]).filter((c) => c.status !== 'CANCELLED').length, color: C.navy },
                  { label: 'Active', status: 'ACTIVE', count: active.length, color: C.green },
                  { label: 'Paused', status: 'PAUSED', count: paused.length, color: C.amber },
                  { label: 'Done', status: 'COMPLETED', count: completed.length, color: C.navy },
                  { label: 'Draft', status: 'DRAFT', count: draft.length, color: C.gray400 },
                  { label: 'Cancelled', status: 'CANCELLED', count: cancelled.length, color: C.amber },
                ].map((s) => {
                  const isActive = statusFilter === s.status;
                  return (
                    <TouchableOpacity key={s.label} onPress={() => { setStatusFilter(s.status); setChitShowCount(15); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 2,
                        borderColor: isActive ? s.color : C.gray200,
                        backgroundColor: isActive ? s.color + '15' : C.white, alignItems: 'center', minWidth: 64 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: isActive ? s.color : C.gray400 }}>{s.count}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: isActive ? s.color : C.gray400, marginTop: 1 }}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            {/* Sort row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: C.gray400, fontWeight: '600' }}>Sort:</Text>
              {[
                { key: 'name', label: 'Name' },
                { key: 'amount', label: 'Amount' },
                { key: 'members', label: 'Members' },
              ].map((s) => (
                <TouchableOpacity key={s.key} onPress={() => setSortBy(s.key as any)}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: sortBy === s.key ? C.navy : C.gray100 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: sortBy === s.key ? C.white : C.gray500 }}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No chit funds" message={statusFilter === 'ALL' ? 'Create your first chit fund.' : `No ${statusFilter.toLowerCase()} chit funds.`} />}
        ListFooterComponent={allDisplayChits.length > chitShowCount ? (
          <TouchableOpacity onPress={() => setChitShowCount(c => c + 15)}
            style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>Load More ({allDisplayChits.length - chitShowCount} remaining)</Text>
          </TouchableOpacity>
        ) : allDisplayChits.length > 15 ? (
          <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 12, fontSize: 12 }}>All {allDisplayChits.length} chit funds shown</Text>
        ) : null}
        renderItem={({ item: c }) => (
          <TouchableOpacity onPress={() => openDetail(c)} activeOpacity={0.75}>
            <Card style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: STATUS_COLOR[c.status] ?? C.gray300 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={1}>{c.name}</Text>
                <Badge status={c.status} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Monthly</Text>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Members</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{c.enrolledCount ?? c.totalMembers ?? '—'}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Draw</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                    {c.winnersAssigned ?? c.currentDraw ?? 0}/{c.durationMonths ?? c.totalDraws ?? '—'}
                  </Text>
                </View>
                {(c.totalAmount ?? c.chitValue) && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Total</Text>
                    <Amount value={c.totalAmount ?? c.chitValue ?? 0} size="sm" color={C.green} />
                  </View>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* ════════════════════════════════════════════════════════════════════════
          CHIT DETAIL MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          {/* Header */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            {editingChitName ? (
              <View>
                <TextInput
                  autoFocus
                  value={chitNameInput}
                  onChangeText={setChitNameInput}
                  style={{ fontSize: 18, fontWeight: '700', color: C.navy, borderBottomWidth: 2, borderBottomColor: C.navy, paddingBottom: 4, marginBottom: 8 }}
                  placeholder="Chit name…"
                  returnKeyType="next"
                />
                <TextInput
                  value={chitDescInput}
                  onChangeText={setChitDescInput}
                  style={{ fontSize: 13, color: C.gray500, borderBottomWidth: 1, borderBottomColor: C.gray300, paddingBottom: 4, marginBottom: 10 }}
                  placeholder="Description (optional)…"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Save" size="sm" loading={renameMut.isPending} disabled={!chitNameInput.trim()} onPress={() => renameMut.mutate()} />
                  <Button label="Cancel" size="sm" variant="outline" onPress={() => setEditingChitName(false)} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[T.h2, { flex: 1 }]} numberOfLines={1}>{selected?.name}</Text>
                    {selected?.status !== 'DELETED' && (
                      <TouchableOpacity
                        onPress={() => { setChitNameInput(selected?.name ?? ''); setChitDescInput(selected?.description ?? ''); setEditingChitName(true); }}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ fontSize: 16, color: C.gray400 }}>✎</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Badge status={selected?.status ?? 'DRAFT'} />
                    {selected?.totalAmount && <Amount value={selected.totalAmount} size="sm" color={C.green} />}
                  </View>
                </View>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Sub-tabs (scrollable) — no extra margin, border is on tab row itself */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
              {TABS.map((tab) => (
                <TouchableOpacity key={tab.key} onPress={() => setDetailTab(tab.key)}
                  style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, marginBottom: -1, borderBottomWidth: 2.5, borderBottomColor: detailTab === tab.key ? C.navy : 'transparent' }}>
                  <Text style={{ fontSize: 13, fontWeight: detailTab === tab.key ? '700' : '500', color: detailTab === tab.key ? C.navy : C.gray400, paddingBottom: 8 }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* ── INFO TAB ─────────────────────────────────────────────────── */}
            {detailTab === 'info' && selected && (
              <>
                <Card style={{ marginBottom: 16 }}>
                  {[
                    { label: 'Chit Value', value: selected.chitValue ? `₹${Number(selected.chitValue).toLocaleString('en-IN')}` : '—' },
                    { label: 'Installment', value: selected.installmentAmount ? `₹${Number(selected.installmentAmount).toLocaleString('en-IN')} / member` : '—' },
                    (selected.postPayoutContributionEnabled || selected.defaultPostPayoutContribution)
                      ? { label: 'Post-Payout', value: selected.defaultPostPayoutContribution ? `₹${Number(selected.defaultPostPayoutContribution).toLocaleString('en-IN')} / member` : 'Enabled' }
                      : null,
                    { label: 'Duration', value: `${selected.durationMonths ?? '—'} months` },
                    { label: 'Draw Progress', value: `${selected.winnersAssigned ?? selected.currentDraw ?? 0} / ${selected.durationMonths ?? selected.totalDraws ?? '—'}` },
                    { label: 'Members', value: String(selected.totalMembers ?? '—') },
                    { label: 'Start Date', value: fmtDate(selected.startDate) },
                    selected.endDate ? { label: 'End Date', value: fmtDate(selected.endDate) } : null,
                    selected.monthlyDueDate ? { label: 'Due Day', value: `${selected.monthlyDueDate}th of month` } : null,
                  ].filter(Boolean).map((row: any) => (
                    <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ fontSize: 13, color: C.gray500 }}>{row.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{row.value}</Text>
                    </View>
                  ))}
                </Card>
                {(STATUS_NEXT[selected.status] ?? []).length > 0 && (
                  <>
                    <Text style={{ ...T.label, marginBottom: 10 }}>CHANGE STATUS</Text>
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                      {(STATUS_NEXT[selected.status] ?? []).map((s) => (
                        <View key={s} style={{ flex: 1, minWidth: '40%' }}>
                          <Button
                            label={`Set ${s}`}
                            variant={s === 'ACTIVE' ? 'success' : s === 'COMPLETED' ? 'primary' : 'ghost'}
                            size="sm"
                            loading={statusMut.isPending}
                            onPress={() => Alert.alert('Change Status', `Set chit to ${s}?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Confirm', onPress: () => statusMut.mutate({ id: selected.id, status: s, startDate: s === 'ACTIVE' ? (selected.startDate ?? new Date().toISOString().split('T')[0]) : undefined }) },
                            ])}
                          />
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* ── MEMBERS TAB ──────────────────────────────────────────────── */}
            {detailTab === 'members' && (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Button label="+ Enroll Member" variant="primary" size="sm" onPress={() => setShowEnroll(true)} />
                </View>
                {(enrollments as any[]).length === 0 ? (
                  <EmptyState title="No members enrolled" message="Enroll members to start this chit." />
                ) : (
                  (enrollments as any[]).map((e: any) => {
                    const name = memberMap[e.memberId ?? e.id] ?? 'Unknown';
                    return (
                      <Card key={e.id ?? e.memberId} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{name[0].toUpperCase()}</Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{name}</Text>
                          </View>
                          <TouchableOpacity onPress={() => Alert.alert('Remove', `Remove ${name} from chit?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => removeMut.mutate({ chitId: selected.id, memberId: e.memberId ?? e.id }) },
                          ])}>
                            <Text style={{ fontSize: 12, color: C.red, fontWeight: '600' }}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </Card>
                    );
                  })
                )}
              </>
            )}

            {/* ── WINNERS TAB ──────────────────────────────────────────────── */}
            {detailTab === 'winners' && (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Button label="+ Record Winner" variant="gold" size="sm" onPress={() => setShowWinner(true)} />
                </View>
                {(winners as any[]).length === 0 ? (
                  <EmptyState title="No winners yet" message="Record draw winners here." />
                ) : (
                  (() => {
                    // Index payouts by BOTH monthNumber and drawNumber so the lookup
                    // matches regardless of which field name the backend uses.
                    const payoutByKey: Record<string, any> = {};
                    (chitPayouts as any[]).forEach((p: any) => {
                      const mId = p.memberId ?? p.winnerId;
                      const n1 = p.monthNumber;
                      const n2 = p.drawNumber;
                      if (n1 != null) payoutByKey[`${n1}:${mId}`] = p;
                      if (n2 != null && n2 !== n1) payoutByKey[`${n2}:${mId}`] = p;
                    });
                    const PAYOUT_STATUS_COLOR: Record<string, { text: string; bg: string }> = {
                      PENDING:              { text: C.amber,   bg: '#FFFBEB' },
                      DISBURSED:            { text: C.green,   bg: '#F0FDF4' },
                      PARTIALLY_DISBURSED:  { text: '#7C3AED', bg: '#F5F3FF' },
                      CANCELLED:            { text: C.gray400, bg: C.gray50  },
                      VOIDED:               { text: C.gray400, bg: C.gray50  },
                    };
                    return (winners as any[]).map((w: any) => {
                      const mid = w.memberId ?? w.winnerId;
                      const mName = memberMap[mid] ?? w.memberName ?? 'Unknown';
                      const drawNum = w.monthNumber ?? w.drawNumber;
                      const payout = payoutByKey[`${drawNum}:${mid}`] ?? null;
                      const payoutVoided = payout?.status === 'VOIDED' || payout?.status === 'CANCELLED';
                      const hasPayout = payout && !payoutVoided;
                      const ps = payout ? (PAYOUT_STATUS_COLOR[payout.status] ?? PAYOUT_STATUS_COLOR.PENDING) : null;
                      return (
                        <Card key={w.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                          {/* Header row */}
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{mName}</Text>
                              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Draw #{drawNum}</Text>
                              {w.wonAt && <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(w.wonAt ?? w.createdAt)}</Text>}
                            </View>
                            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber }}>WINNER</Text>
                            </View>
                          </View>

                          {/* Amounts row */}
                          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                            {w.winningAmount != null && (
                              <View>
                                <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>WINNING AMT</Text>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>₹{Number(w.winningAmount).toLocaleString('en-IN')}</Text>
                              </View>
                            )}
                            {w.discountAmount != null && Number(w.discountAmount) > 0 && (
                              <View>
                                <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>ADJUSTED</Text>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray600 ?? C.gray500 }}>₹{Number(w.discountAmount).toLocaleString('en-IN')}</Text>
                              </View>
                            )}
                            {hasPayout && (
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>PAYOUT</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: ps!.text }}>
                                    ₹{Number(payout.netPayoutAmount ?? payout.disbursedAmount ?? 0).toLocaleString('en-IN')}
                                  </Text>
                                  <View style={{ backgroundColor: ps!.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: ps!.text }}>
                                      {payout.status === 'PARTIALLY_DISBURSED' ? 'Partial' : payout.status}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>

                          {/* Action buttons */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {!hasPayout && (
                              <View style={{ flex: 1 }}>
                                <Button
                                  label="Create Payout"
                                  variant="gold"
                                  size="sm"
                                  onPress={() => {
                                    setWpWinner(w);
                                    const hint = w.winningAmount ?? selected?.chitValue ?? selected?.totalAmount ?? 0;
                                    setWpAmount(hint > 0 ? String(hint) : '');
                                    setWpNotes('');
                                    setShowWinnerPayout(true);
                                  }}
                                />
                              </View>
                            )}
                            {hasPayout && payout.status !== 'DISBURSED' && (
                              <View style={{ flex: 1 }}>
                                <Button
                                  label={payout.status === 'PARTIALLY_DISBURSED' ? 'Disburse More' : 'Disburse'}
                                  variant="gold"
                                  size="sm"
                                  onPress={() => {
                                    setDsPayout(payout);
                                    const remaining = Number(payout.netPayoutAmount ?? payout.payoutAmount ?? 0) - Number(payout.disbursedAmount ?? 0);
                                    setDsAmount(remaining > 0 ? String(remaining) : String(payout.netPayoutAmount ?? 0));
                                    setDsMode('CASH');
                                    setDsNotes('');
                                    setShowDisburse(true);
                                  }}
                                />
                              </View>
                            )}
                            {hasPayout && (
                              <View style={{ flex: hasPayout && payout.status !== 'DISBURSED' ? undefined : 1 }}>
                                <Button
                                  label={payout.status === 'DISBURSED' ? 'View Payout' : 'View'}
                                  variant="outline"
                                  size="sm"
                                  onPress={() => { setPdPayout(payout); setShowPayoutDetail(true); }}
                                />
                              </View>
                            )}
                            {payoutVoided && (
                              <View style={{ flex: 1 }}>
                                <Button
                                  label="Create New Payout"
                                  variant="gold"
                                  size="sm"
                                  onPress={() => {
                                    setWpWinner(w);
                                    const hint = w.winningAmount ?? selected?.chitValue ?? 0;
                                    setWpAmount(hint > 0 ? String(hint) : '');
                                    setWpNotes('');
                                    setShowWinnerPayout(true);
                                  }}
                                />
                              </View>
                            )}
                          </View>
                        </Card>
                      );
                    });
                  })()
                )}
              </>
            )}

            {/* ── DRAWS TAB ────────────────────────────────────────────────── */}
            {detailTab === 'draws' && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="+ Open New Draw" variant="primary" size="sm" onPress={() => {
                      setOdDrawNum(String(nextDrawNum));
                      setShowOpenDraw(true);
                    }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Skip Draw" variant="ghost" size="sm" onPress={() => {
                      setSdDrawNum(String(nextDrawNum - 1 || 1));
                      setShowSkipDraw(true);
                    }} />
                  </View>
                </View>

                {drawsList.length === 0 ? (
                  <EmptyState title="No draws yet" message="Open the first draw to start the chit cycle." />
                ) : (
                  drawsList.map((d: any) => {
                    const dNum = d.drawNumber ?? d.monthNumber;
                    const cycleWinners = (winners as any[]).filter((w: any) => w.monthNumber === dNum);
                    const isDoubleWinner = cycleWinners.length >= 2;
                    const winnerName = cycleWinners.length > 0
                      ? cycleWinners.map((w: any) => (memberMap as any)[w.memberId ?? w.winnerId] ?? 'Member').join(', ')
                      : 'No winner set';
                    const dColor = DRAW_COLOR[d.status] ?? C.gray400;
                    const isExpanded = expandedDrawId === d.id;

                    // Legacy batch history for void actions
                    const drawHistory = (chitBatches as any[]).filter((b: any) =>
                      (b.allocations ?? []).some((a: any) => a.monthNumber === dNum)
                    );

                    return (
                      <Card key={d.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: dColor }}>
                        {/* ── Draw header — tap to expand ── */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setExpandedDrawId(isExpanded ? null : d.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isExpanded ? 10 : 0 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ backgroundColor: dColor + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: dColor }}>Draw #{dNum}</Text>
                            </View>
                            {isDoubleWinner && (
                              <View style={{ backgroundColor: '#F3E8FF', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#C084FC' }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#7E22CE' }}>×{cycleWinners.length} Double Payout</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: dColor + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: dColor }}>{d.status}</Text>
                            </View>
                            <Text style={{ fontSize: 14, color: C.gray400 }}>{isExpanded ? '▲' : '▼'}</Text>
                          </View>
                        </TouchableOpacity>

                        {/* ── Collapsed summary row ── */}
                        {!isExpanded && (
                          <View style={{ flexDirection: 'row', gap: 16, paddingTop: 6 }}>
                            <Text style={{ fontSize: 12, color: C.gray500 }}>Winner: <Text style={{ color: C.gray900, fontWeight: '500' }}>{winnerName}</Text></Text>
                            {d.periodStartDate && (
                              <Text style={{ fontSize: 12, color: C.gray500 }}>{fmtDate(d.periodStartDate)}</Text>
                            )}
                          </View>
                        )}

                        {/* ── Expanded view ── */}
                        {isExpanded && (
                          <>
                            {/* Draw details */}
                            {[
                              { label: 'Winner', value: winnerName },
                              d.periodStartDate && { label: 'Period', value: `${fmtDate(d.periodStartDate)} – ${fmtDate(d.periodEndDate)}` },
                              d.skippedReason && { label: 'Skip Reason', value: d.skippedReason },
                            ].filter(Boolean).map((row: any) => (
                              <View key={row.label} style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                                <Text style={{ fontSize: 12, color: C.gray500, width: 60 }}>{row.label}</Text>
                                <Text style={{ fontSize: 12, color: C.gray900, flex: 1, fontWeight: '500' }}>{row.value}</Text>
                              </View>
                            ))}

                            {/* ── Member payment status via getDrawPayments ── */}
                            <DrawPaymentRows
                              drawId={d.id}
                              drawStatus={d.status}
                              memberMap={memberMap}
                              installmentAmount={selected?.installmentAmount}
                              onCollect={(mId: string) => {
                                setCpDraw(d);
                                setCpMemberId(mId);
                                setCpAmount(String(selected?.installmentAmount ?? ''));
                                setCpMode('CASH'); setCpNotes('');
                                setShowCollectPay(true);
                              }}
                            />

                            {/* ── Payment Batch History (for void actions) ── */}
                            {drawHistory.length > 0 && (
                              <View style={{ marginTop: 14 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>
                                  Transactions ({drawHistory.length})
                                </Text>
                                {drawHistory.map((b: any) => {
                                  const alloc = (b.allocations ?? []).find((a: any) => a.monthNumber === dNum);
                                  const isVoided = b.status === 'VOIDED';
                                  return (
                                    <View key={b.id} style={{
                                      backgroundColor: isVoided ? C.gray50 : C.white,
                                      borderRadius: 8,
                                      padding: 8,
                                      marginBottom: 6,
                                      borderWidth: 1,
                                      borderColor: isVoided ? C.gray200 : C.gray100,
                                      opacity: isVoided ? 0.7 : 1,
                                    }}>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: isVoided ? C.gray400 : C.gray900,
                                          textDecorationLine: isVoided ? 'line-through' : 'none' }}>
                                          {memberMap[b.memberId] ?? 'Unknown'}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                          <Amount value={alloc?.allocatedAmount ?? b.totalAmount} size="sm"
                                            color={isVoided ? C.gray400 : C.green} />
                                          {!isVoided && (
                                            <TouchableOpacity
                                              onPress={() => { setVoidBatchId(b.id); setVoidBatchReason(''); }}
                                              style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.red }}>
                                              <Text style={{ fontSize: 10, fontWeight: '700', color: C.red }}>Void</Text>
                                            </TouchableOpacity>
                                          )}
                                        </View>
                                      </View>
                                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                                        {b.paymentMode && (
                                          <Text style={{ fontSize: 11, color: C.gray500 }}>{b.paymentMode}</Text>
                                        )}
                                        {b.status && (
                                          <Text style={{ fontSize: 11, fontWeight: '600',
                                            color: isVoided ? C.gray400 : b.status === 'COMPLETED' ? C.green : C.amber }}>
                                            {isVoided ? 'VOIDED' : b.status}
                                          </Text>
                                        )}
                                        {b.collectedAt && (
                                          <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(b.collectedAt)}</Text>
                                        )}
                                      </View>
                                      {b.voidReason && (
                                        <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginTop: 2 }}>Voided: {b.voidReason}</Text>
                                      )}
                                      {b.notes && !b.voidReason && (
                                        <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{b.notes}</Text>
                                      )}
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                            {/* ── Action buttons ── */}
                            {d.status === 'OPEN' && (
                              <View style={{ marginTop: 12, gap: 8 }}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  <View style={{ flex: 1 }}>
                                    <Button label="Collect Payment" variant="success" size="sm"
                                      onPress={() => {
                                        setCpDraw(d);
                                        setCpAmount(String(selected?.installmentAmount ?? ''));
                                        setCpMemberId(''); setCpMode('CASH'); setCpNotes('');
                                        setShowCollectPay(true);
                                      }} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Button label="Close Draw" variant="primary" size="sm"
                                      loading={closeDrawMut.isPending}
                                      onPress={() => Alert.alert('Close Draw', `Close Draw #${dNum}? This marks the draw complete.`, [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Close', onPress: () => closeDrawMut.mutate(d.id) },
                                      ])} />
                                  </View>
                                </View>
                                <Button label="Skip This Draw" variant="ghost" size="sm"
                                  onPress={() => { setSdDrawId(d.id); setSdDrawNum(String(dNum)); setShowSkipDraw(true); }} />
                                <Button label="Delete Draw" variant="danger" size="sm"
                                  loading={deleteDrawMut.isPending}
                                  onPress={() => Alert.alert(
                                    `Delete Draw #${dNum}`,
                                    'This permanently deletes the draw and all payment records.\n\nIf any member has already paid, void their payment batches first.',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Delete', style: 'destructive', onPress: () => deleteDrawMut.mutate(d.id) },
                                    ]
                                  )} />
                              </View>
                            )}
                            {d.status === 'PENDING' && (
                              <View style={{ marginTop: 8 }}>
                                <Button label="Skip This Draw" variant="ghost" size="sm"
                                  onPress={() => { setSdDrawId(d.id); setSdDrawNum(String(dNum)); setShowSkipDraw(true); }} />
                              </View>
                            )}
                          </>
                        )}
                      </Card>
                    );
                  })
                )}
              </>
            )}

            {/* ── SCHEDULE TAB ─────────────────────────────────────────────── */}
            {detailTab === 'schedule' && (
              <>
                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="+ Add Slot" variant="primary" size="sm" onPress={() => setShowAddSlot(true)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Swap Slots" variant="outline" size="sm"
                      disabled={reservedSlots.length < 2}
                      onPress={() => {
                        if (reservedSlots.length < 2) {
                          Alert.alert('Need Reserved Slots', `Swap requires at least 2 reserved slots. You currently have ${reservedSlots.length}.`);
                          return;
                        }
                        setSwapA(''); setSwapB('');
                        setShowSwap(true);
                      }} />
                    {reservedSlots.length < 2 && (
                      <Text style={{ fontSize: 10, color: C.gray400, textAlign: 'center', marginTop: 3 }}>
                        Need 2+ reserved slots
                      </Text>
                    )}
                  </View>
                </View>
                <View style={{ marginBottom: 16 }}>
                  <Button label="Shift Schedule Forward" variant="ghost" size="sm"
                    onPress={() => setShowShift(true)} />
                </View>

                {/* Summary */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Reserved', count: (reservations as any[]).filter(r => r.status === 'RESERVED').length, color: C.navy },
                    { label: 'Processed', count: (reservations as any[]).filter(r => r.status === 'PROCESSED').length, color: C.green },
                    { label: 'Voided', count: (reservations as any[]).filter(r => r.status === 'VOIDED').length, color: C.red },
                    { label: 'Empty', count: (reservations as any[]).filter(r => r.status === 'UNALLOCATED').length, color: C.gray400 },
                  ].map((s) => (
                    <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 8, padding: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: s.color }}>{s.count}</Text>
                      <Text style={{ fontSize: 9, color: s.color + 'CC', marginTop: 1 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Total planned payout */}
                {(() => {
                  const activeSlots = (reservations as any[]).filter((r: any) => r.status !== 'VOIDED');
                  const totalPayout = activeSlots.reduce((s: number, r: any) => s + Number(r.payoutAmount ?? 0), 0);
                  return totalPayout > 0 ? (
                    <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 10 }}>
                      Total planned payout: <Text style={{ fontWeight: '700', color: C.navy }}>₹{totalPayout.toLocaleString('en-IN')}</Text>
                    </Text>
                  ) : null;
                })()}

                {slotsList.length === 0 ? (
                  <EmptyState title="No schedule yet" message="Add reservation slots to assign members to draw months." />
                ) : (
                  slotsList.map((slot: any) => {
                    const slotNum = slot.slotNumber ?? slot.monthNumber ?? '?';
                    const sColor = SLOT_COLOR[slot.status] ?? C.gray400;
                    const isVoided = slot.status === 'VOIDED';
                    const isEditing = editingSlotId === slot.id;
                    const activeMembers = (members as any[]).filter((m: any) => m.status === 'ACTIVE').sort((a: any, b: any) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
                    const adminHeld = selected?.adminHeldSpotsCount ?? 0;
                    const memberIdSet = new Set((members as any[]).map((m: any) => String(m.id)));
                    const allocatedAdminSlots = slotsList.filter((s: any) => s.id !== slot.id && s.memberId && !memberIdSet.has(String(s.memberId)) && s.status !== 'VOIDED').length;
                    const currentIsAdmin = slot.memberId && !memberIdSet.has(String(slot.memberId));
                    const canShowAdmins = adminHeld > 0 && (currentIsAdmin || allocatedAdminSlots < adminHeld);
                    const mName = slot.memberName ?? memberMap[slot.memberId] ?? (slot.memberId ? 'Unknown' : 'Unallocated');
                    const monthLabel = slot.reservationMonth ? (() => {
                      const [y, m] = slot.reservationMonth.split('-').map(Number);
                      if (!y || !m) return '';
                      return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                    })() : '';

                    return (
                      <Card key={slot.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: sColor, opacity: isVoided ? 0.6 : 1 }}>
                        {/* Slot header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: sColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: sColor }}>{slotNum}</Text>
                            </View>
                            {monthLabel ? <Text style={{ fontSize: 11, color: C.gray400 }}>{monthLabel}</Text> : null}
                            <View style={{ backgroundColor: sColor + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: sColor }}>{slot.status}</Text>
                            </View>
                          </View>
                          {!isVoided && !isEditing && (
                            <TouchableOpacity
                              onPress={() => {
                                setEditingSlotId(slot.id);
                                setSlotEditMemberId(slot.memberId ?? '');
                                setSlotEditPayout(slot.payoutAmount ? String(slot.payoutAmount) : '');
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.navy + '10', borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy }}>Edit</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Inline edit form */}
                        {isEditing ? (
                          <View style={{ gap: 10 }}>
                            <View>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>MEMBER</Text>
                              <View style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, overflow: 'hidden' }}>
                                <ScrollView style={{ maxHeight: 160 }}>
                                  <TouchableOpacity
                                    onPress={() => setSlotEditMemberId('')}
                                    style={{ padding: 10, backgroundColor: !slotEditMemberId ? C.navy + '15' : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                                    <Text style={{ fontSize: 13, color: !slotEditMemberId ? C.navy : C.gray500, fontWeight: !slotEditMemberId ? '700' : '400' }}>
                                      Unallocated
                                    </Text>
                                  </TouchableOpacity>
                                  {canShowAdmins && (staff as any[]).map((s: any) => (
                                    <TouchableOpacity key={s.id}
                                      onPress={() => setSlotEditMemberId(String(s.id))}
                                      style={{ padding: 10, backgroundColor: slotEditMemberId === String(s.id) ? C.navy + '15' : '#F0F4FF', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                                      <Text style={{ fontSize: 13, color: slotEditMemberId === String(s.id) ? C.navy : C.navy, fontWeight: '600' }}>
                                        {s.fullName ?? s.username} (Admin)
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                  {activeMembers.map((m: any) => (
                                    <TouchableOpacity key={m.id}
                                      onPress={() => setSlotEditMemberId(m.id)}
                                      style={{ padding: 10, backgroundColor: slotEditMemberId === m.id ? C.navy + '15' : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                                      <Text style={{ fontSize: 13, color: slotEditMemberId === m.id ? C.navy : C.gray900, fontWeight: slotEditMemberId === m.id ? '700' : '400' }}>
                                        {m.fullName}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            </View>
                            <View>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>PAYOUT AMOUNT (₹)</Text>
                              <TextInput
                                value={slotEditPayout}
                                onChangeText={setSlotEditPayout}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={C.gray400}
                                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900 }}
                              />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Button label={updateSlotMut.isPending ? 'Saving…' : 'Save'} variant="primary" size="sm"
                                  loading={updateSlotMut.isPending}
                                  onPress={() => updateSlotMut.mutate({ slot, memberId: slotEditMemberId, payoutAmount: slotEditPayout })} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Button label="Cancel" variant="ghost" size="sm" onPress={() => setEditingSlotId(null)} />
                              </View>
                            </View>
                          </View>
                        ) : (
                          /* Read-only view */
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{
                                fontSize: 14, fontWeight: '600',
                                color: isVoided ? C.gray400 : (slot.memberId ? C.gray900 : C.gray400),
                                fontStyle: isVoided || !slot.memberId ? 'italic' : 'normal',
                                textDecorationLine: isVoided ? 'line-through' : 'none',
                              }}>{mName}</Text>
                              {slot.payoutAmount != null && (
                                <Text style={{ fontSize: 12, color: isVoided ? C.gray400 : C.navy, marginTop: 2, fontWeight: '600',
                                  textDecorationLine: isVoided ? 'line-through' : 'none' }}>
                                  ₹{Number(slot.payoutAmount).toLocaleString('en-IN')} payout
                                </Text>
                              )}
                            </View>
                            {/* Action buttons */}
                            <View style={{ gap: 5 }}>
                              {slot.status === 'RESERVED' && (
                                <>
                                  <TouchableOpacity onPress={() => { setVsSlot(slot); setVsReason(''); setVsReplaceAt('same'); setShowVoidSlot(true); }}
                                    style={{ backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.red }}>Void</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => Alert.alert('Mark Processed', `Mark slot ${slotNum} as processed?`, [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Confirm', onPress: () => processSlotMut.mutate(slot.id) },
                                    ])}
                                    style={{ backgroundColor: '#F0FDF4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.green }}>Done</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {slot.status === 'UNALLOCATED' && (
                                <TouchableOpacity
                                  onPress={() => Alert.alert('Delete Slot', 'Permanently delete this empty slot?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => hardDeleteSlotMut.mutate(slot.id) },
                                  ])}
                                  style={{ backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.red }}>Delete</Text>
                                </TouchableOpacity>
                              )}
                              {isVoided && (
                                <TouchableOpacity
                                  onPress={() => Alert.alert('Delete Voided Slot', 'Permanently delete this voided slot?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => hardDeleteSlotMut.mutate(slot.id) },
                                  ])}
                                  style={{ backgroundColor: C.gray100, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500 }}>Delete</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )}
                      </Card>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════════
          CREATE CHIT MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => { setShowCreate(false); resetCreateForm(); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <View>
              <Text style={T.h2}>Create Chit Fund</Text>
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                Step {createStep} of 4 — {['', 'Chit Type', 'Fund Details', 'Contribution Rule', 'Schedule'][createStep]}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setShowCreate(false); resetCreateForm(); }}>
              <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Step progress dots */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 6 }}>
            {[1, 2, 3, 4].map((s) => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= createStep ? C.navy : C.gray200 }} />
            ))}
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* ── STEP 1: Chit Type ──────────────────────────────────────── */}
            {createStep === 1 && (
              <>
                <Text style={{ fontSize: 14, color: C.gray500, marginBottom: 16 }}>
                  Choose how the monthly winner is determined.
                </Text>
                {[
                  { type: 'RESERVATION', label: 'Reservation', desc: 'Each member reserves a specific draw month in advance. Most common for family chits.', available: true },
                  { type: 'LOTTERY',     label: 'Lottery',     desc: 'Winner is randomly drawn each month. Coming soon.', available: false },
                  { type: 'AUCTION',     label: 'Auction',     desc: 'Members bid for the payout each month. Coming soon.', available: false },
                ].map(({ type, label, desc, available }) => (
                  <TouchableOpacity key={type} disabled={!available}
                    onPress={() => setCChitType(type)}
                    activeOpacity={available ? 0.7 : 1}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      borderRadius: 12, borderWidth: 2, padding: 14, marginBottom: 10,
                      borderColor: cChitType === type ? C.navy : C.gray200,
                      backgroundColor: !available ? C.gray50 : cChitType === type ? C.navy50 : C.white,
                      opacity: available ? 1 : 0.45,
                    }}>
                    {/* Gold accent bar */}
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: cChitType === type ? C.amber : 'transparent' }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: cChitType === type ? C.navy : C.gray900 }}>{label}</Text>
                        {!available && (
                          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: C.amber }}>Coming Soon</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: C.gray500 }}>{desc}</Text>
                    </View>
                    {/* Radio */}
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: cChitType === type ? C.navy : C.gray300,
                      backgroundColor: cChitType === type ? C.navy : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {cChitType === type && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.white }} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* ── STEP 2: Fund Details ───────────────────────────────────── */}
            {createStep === 2 && (
              <>
                {/* Fund Identity */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>FUND IDENTITY</Text>
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Chit Name *</Text>
                  <TextInput value={cName} onChangeText={setCName} placeholder="e.g. Family Gold Chit 2027"
                    placeholderTextColor={C.gray400}
                    style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                </View>
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Description</Text>
                  <TextInput value={cDesc} onChangeText={setCDesc} placeholder="Optional notes about this chit…"
                    placeholderTextColor={C.gray400} multiline
                    style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60, textAlignVertical: 'top' }} />
                </View>

                {/* Fund Structure */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>FUND STRUCTURE</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Chit Value (₹) *</Text>
                    <TextInput value={cChitValue} onChangeText={setCChitValue} placeholder="200000" keyboardType="numeric"
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>No. of Members *</Text>
                    <TextInput value={cMembers} onChangeText={handleCMembersChange} placeholder="20" keyboardType="numeric"
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Monthly Installment (₹) *</Text>
                    <TextInput value={cInstall} onChangeText={setCInstall}
                      placeholder={cChitValue && cMembers ? String(Math.round(Number(cChitValue) / Number(cMembers))) : '10000'}
                      keyboardType="numeric" placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Admin Held Spots</Text>
                    <TextInput value={cAdminSpots} onChangeText={setCAdminSpots} placeholder="0" keyboardType="numeric"
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                </View>

                {/* Schedule */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>SCHEDULE</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Due Day (1–28)</Text>
                    <TextInput value={cDueDate} onChangeText={setCDueDate} placeholder="5"
                      keyboardType="numeric" placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Anticipated Start Date</Text>
                    <TextInput value={cStart} onChangeText={handleCStartChange} placeholder="YYYY-MM-DD"
                      placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 20 }}>
                  Actual activation date is set when the chit is started. This is used for schedule labels only.
                </Text>

                {/* Live summary */}
                {(cChitValue || cMembers || cInstall) && (
                  <View style={{ backgroundColor: C.navy50, borderRadius: 12, padding: 14, marginBottom: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                    {cChitValue && <Text style={{ fontSize: 13, color: C.navy }}>Total <Text style={{ fontWeight: '700' }}>₹{Number(cChitValue).toLocaleString('en-IN')}</Text></Text>}
                    {cMembers && <Text style={{ fontSize: 13, color: C.navy }}>Duration <Text style={{ fontWeight: '700' }}>{cMembers} months</Text></Text>}
                    {cInstall && cMembers && (
                      <Text style={{ fontSize: 13, color: C.navy }}>Monthly pool <Text style={{ fontWeight: '700' }}>₹{(Number(cInstall) * Number(cMembers)).toLocaleString('en-IN')}</Text></Text>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── STEP 3: Post-Payout Contribution Rule ─────────────────── */}
            {createStep === 3 && (
              <>
                <Text style={{ fontSize: 14, color: C.gray600 ?? C.gray500, marginBottom: 16 }}>
                  After a member receives their payout{cChitValue ? ` (₹${Number(cChitValue).toLocaleString('en-IN')})` : ''}, do they pay a <Text style={{ fontWeight: '700' }}>different</Text> monthly installment for the rest of the chit?
                </Text>
                {[
                  {
                    val: false,
                    label: 'Same amount throughout',
                    sub: `₹${cInstall ? Number(cInstall).toLocaleString('en-IN') : '—'} / month for all members`,
                  },
                  {
                    val: true,
                    label: 'Different post-payout amount',
                    sub: "Members who've received their payout pay a different monthly installment",
                  },
                ].map(({ val, label, sub }) => (
                  <TouchableOpacity key={String(val)} onPress={() => setCPostPayoutEnabled(val)} activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      borderRadius: 12, borderWidth: 2, padding: 14, marginBottom: 10,
                      borderColor: cPostPayoutEnabled === val ? C.navy : C.gray200,
                      backgroundColor: cPostPayoutEnabled === val ? C.navy50 : C.white,
                    }}>
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: cPostPayoutEnabled === val ? C.amber : 'transparent' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: cPostPayoutEnabled === val ? C.navy : C.gray900, marginBottom: 3 }}>{label}</Text>
                      <Text style={{ fontSize: 12, color: C.gray500 }}>{sub}</Text>
                    </View>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: cPostPayoutEnabled === val ? C.navy : C.gray300,
                      backgroundColor: cPostPayoutEnabled === val ? C.navy : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {cPostPayoutEnabled === val && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.white }} />}
                    </View>
                  </TouchableOpacity>
                ))}

                {cPostPayoutEnabled && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>
                      Post-payout monthly contribution (₹) *
                    </Text>
                    <TextInput value={cPostPayoutAmount} onChangeText={setCPostPayoutAmount}
                      placeholder="e.g. 12000" keyboardType="numeric" placeholderTextColor={C.gray400}
                      style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 6 }}>
                      Normal installment: ₹{cInstall ? Number(cInstall).toLocaleString('en-IN') : '—'} / month · Can be overridden per slot in the Schedule tab
                    </Text>
                  </View>
                )}

                {/* Summary before submitting */}
                <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, marginTop: 20, gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, marginBottom: 4 }}>REVIEW</Text>
                  {[
                    { label: 'Type', value: cChitType },
                    { label: 'Name', value: cName },
                    { label: 'Chit Value', value: `₹${Number(cChitValue).toLocaleString('en-IN')}` },
                    { label: 'Members', value: cMembers },
                    { label: 'Installment', value: `₹${Number(cInstall).toLocaleString('en-IN')}` },
                    cStart && { label: 'Start Date', value: cStart },
                    cDueDate && { label: 'Due Day', value: cDueDate },
                    Number(cAdminSpots) > 0 && { label: 'Admin Spots', value: cAdminSpots },
                  ].filter(Boolean).map((row: any) => (
                    <View key={row.label} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ fontSize: 13, color: C.gray500, width: 90 }}>{row.label}</Text>
                      <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '600', flex: 1 }}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── STEP 4: Reservation Schedule ──────────────────────────── */}
            {createStep === 4 && (
              <>
                <Text style={{ fontSize: 14, color: C.gray500, marginBottom: 4 }}>
                  Assign who receives the payout each month. Member assignment is optional — slots can be filled later from the Schedule tab.
                </Text>
                {cSchedule.length === 0 ? (
                  <View style={{ backgroundColor: C.gray50, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200, borderStyle: 'dashed', padding: 24, alignItems: 'center', marginTop: 12 }}>
                    <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', marginBottom: 12 }}>
                      Set Number of Members in Step 2 to auto-generate slots.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const now = new Date();
                        const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                        setCSchedule([{ reservationMonth: iso, label: now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), payoutAmount: cChitValue }]);
                      }}
                      style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>+ Add Slot Manually</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Column headers */}
                    <View style={{ flexDirection: 'row', paddingHorizontal: 4, marginTop: 12, marginBottom: 6 }}>
                      <Text style={{ flex: 0.5, fontSize: 11, fontWeight: '700', color: C.gray400 }}>#</Text>
                      <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: C.gray400 }}>MONTH</Text>
                      <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: C.gray400 }}>PAYOUT (₹)</Text>
                      <Text style={{ width: 32 }} />
                    </View>
                    {cSchedule.map((row, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gray50, borderRadius: 8, padding: 8, marginBottom: 6 }}>
                        <Text style={{ flex: 0.5, fontSize: 12, fontWeight: '700', color: C.gray400 }}>{i + 1}</Text>
                        <View style={{ flex: 1.5 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy, backgroundColor: '#EEF2F8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>{row.label}</Text>
                        </View>
                        <TextInput
                          value={row.payoutAmount}
                          onChangeText={(v) => setCSchedule((rows) => rows.map((r, idx) => idx === i ? { ...r, payoutAmount: v } : r))}
                          placeholder={cChitValue || 'e.g. 45000'}
                          keyboardType="numeric"
                          placeholderTextColor={C.gray400}
                          style={{ flex: 2, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 8, padding: 8, fontSize: 13, color: C.gray900 }}
                        />
                        <TouchableOpacity
                          onPress={() => setCSchedule((rows) => rows.filter((_, idx) => idx !== i))}
                          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 14, color: C.red ?? '#DC2626' }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {(!cMembers || cSchedule.length < Number(cMembers)) && (
                      <TouchableOpacity
                        onPress={() => {
                          setCSchedule((rows) => {
                            const last = rows[rows.length - 1]?.reservationMonth ?? (cStart || new Date().toISOString().slice(0, 7) + '-01');
                            const [y, m] = last.split('-').map(Number);
                            const nextM = m === 12 ? 1 : m + 1;
                            const nextY = m === 12 ? y + 1 : y;
                            const iso = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
                            const label = new Date(nextY, nextM - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                            return [...rows, { reservationMonth: iso, label, payoutAmount: cChitValue }];
                          });
                        }}
                        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.navy, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>+ Add Slot</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}

          </ScrollView>

          {/* Footer navigation */}
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200, flexDirection: 'row', gap: 10 }}>
            {createStep > 1 && (
              <View style={{ flex: 1 }}>
                <Button label="← Back" variant="ghost" onPress={() => setCreateStep(createStep - 1)} />
              </View>
            )}
            <View style={{ flex: createStep > 1 ? 1 : undefined, width: createStep === 1 ? '100%' : undefined }}>
              {createStep < 4 ? (
                <Button
                  label="Continue →"
                  variant="primary"
                  fullWidth={createStep === 1}
                  disabled={
                    (createStep === 1 && !cChitType) ||
                    (createStep === 2 && (!cName.trim() || !cChitValue || !cMembers || !cInstall)) ||
                    (createStep === 3 && cPostPayoutEnabled && !cPostPayoutAmount)
                  }
                  onPress={() => {
                    if (createStep === 2) {
                      const cv = Number(cChitValue); const cm = Number(cMembers); const ci = Number(cInstall);
                      if (!cv || cv < 1000) return Alert.alert('Invalid', 'Chit value must be at least ₹1,000');
                      if (!cm || cm < 2)    return Alert.alert('Invalid', 'Must have at least 2 members');
                      if (!ci || ci < 1)   return Alert.alert('Invalid', 'Installment must be at least ₹1');
                    }
                    if (createStep === 3 && cStart && cMembers) {
                      setCSchedule((rows) => rows.map((r) => ({ ...r, payoutAmount: r.payoutAmount || cChitValue })));
                    }
                    setCreateStep(createStep + 1);
                  }}
                />
              ) : (
                <Button
                  label="Create →"
                  variant="primary"
                  loading={createMut.isPending}
                  onPress={() => createMut.mutate(cSchedule.length > 0)}
                />
              )}
            </View>
          </View>
          {/* Skip schedule option on step 4 */}
          {createStep === 4 && cSchedule.length > 0 && (
            <TouchableOpacity
              onPress={() => createMut.mutate(false)}
              disabled={createMut.isPending}
              style={{ paddingBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: C.gray400 }}>Save and fill schedule later</Text>
            </TouchableOpacity>
          )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Enroll Member bottom-sheet ─────────────────────────────────────── */}
      <Modal visible={showEnroll} animationType="slide" transparent onRequestClose={() => setShowEnroll(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 16 }}>Enroll Member</Text>
            {unenrolled.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.gray400, paddingVertical: 20 }}>All members already enrolled</Text>
            ) : (
              <ScrollView>
                {unenrolled.map((m: any) => (
                  <TouchableOpacity key={m.id} onPress={() => setEnrollMemberId(m.id)}
                    style={{ padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: enrollMemberId === m.id ? C.navy50 : C.gray50, borderWidth: 2, borderColor: enrollMemberId === m.id ? C.navy : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: enrollMemberId === m.id ? '700' : '400', color: enrollMemberId === m.id ? C.navy : C.gray900 }}>
                      {m.fullName ?? m.name} {enrollMemberId === m.id ? '✓' : ''}
                    </Text>
                    {m.phone && <Text style={{ fontSize: 12, color: C.gray500 }}>{m.phone}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setShowEnroll(false); setEnrollMemberId(''); }} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Enroll" variant="primary" disabled={!enrollMemberId} loading={enrollMut.isPending}
                  onPress={() => enrollMut.mutate({ chitId: selected.id, memberId: enrollMemberId })} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Record Winner bottom-sheet ─────────────────────────────────────── */}
      <Modal visible={showWinner} animationType="slide" transparent onRequestClose={() => setShowWinner(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '65%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.amber, marginBottom: 4 }}>Record Draw Winner</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>Select the member who won this draw</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Draw # (month number)</Text>
              <TextInput value={winnerDraw} onChangeText={setWinnerDraw} keyboardType="numeric" placeholder="e.g. 3"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <ScrollView style={{ maxHeight: 200 }}>
              {(enrollments as any[]).map((e: any) => {
                const name = memberMap[e.memberId ?? e.id] ?? 'Unknown';
                const mid = e.memberId ?? e.id;
                return (
                  <TouchableOpacity key={mid} onPress={() => setWinnerMemberId(mid)}
                    style={{ padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: winnerMemberId === mid ? '#FEF3C7' : C.gray50, borderWidth: 2, borderColor: winnerMemberId === mid ? C.amber : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: winnerMemberId === mid ? '700' : '400', color: winnerMemberId === mid ? C.amber : C.gray900 }}>
                      {name} {winnerMemberId === mid ? '★' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setShowWinner(false); setWinnerMemberId(''); setWinnerDraw(''); }} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Record Winner" variant="gold" disabled={!winnerMemberId || !winnerDraw} loading={winnerMut.isPending}
                  onPress={() => winnerMut.mutate({ chitId: selected.id, memberId: winnerMemberId, monthNumber: winnerDraw })} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Open Draw bottom-sheet ─────────────────────────────────────────── */}
      <Modal visible={showOpenDraw} animationType="slide" transparent onRequestClose={() => setShowOpenDraw(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '82%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Open Draw</Text>
              <TouchableOpacity onPress={() => setShowOpenDraw(false)}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Draw Number *</Text>
                <TextInput value={odDrawNum} onChangeText={setOdDrawNum} keyboardType="numeric" placeholder={String(nextDrawNum)}
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
                <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>Next suggested: #{nextDrawNum}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Select Winners (optional)</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 10 }}>Tap to select one or more winners. You can also record winners later via the Winners tab.</Text>

              {/* Selected winners chips */}
              {odWinnerIds.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {odWinnerIds.map((mid) => (
                    <TouchableOpacity key={mid} onPress={() => toggleOdWinner(mid)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.navy, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.white }}>{memberMap[mid] ?? mid}</Text>
                      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={{ borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                  {(enrollments as any[]).map((e: any) => {
                    const mid = String(e.memberId ?? e.id);
                    const name = memberMap[mid] ?? 'Unknown';
                    const isSelected = odWinnerIds.includes(mid);
                    return (
                      <TouchableOpacity key={mid} onPress={() => toggleOdWinner(mid)}
                        style={{ padding: 12, backgroundColor: isSelected ? C.navy50 : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '400', color: isSelected ? C.navy : C.gray900 }}>
                          {name}
                        </Text>
                        {isSelected && <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => { setShowOpenDraw(false); setOdWinnerIds([]); setOdDrawNum(''); }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={odWinnerIds.length > 1
                      ? `Open Draw #${odDrawNum || nextDrawNum} · ${odWinnerIds.length} Winners`
                      : `Open Draw #${odDrawNum || nextDrawNum}`}
                    variant="success"
                    onPress={() => openDrawMut.mutate()} loading={openDrawMut.isPending}
                    disabled={!odDrawNum} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Skip Draw bottom-sheet ─────────────────────────────────────────── */}
      <Modal visible={showSkipDraw} animationType="slide" transparent onRequestClose={() => setShowSkipDraw(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.amber, marginBottom: 4 }}>Skip Draw</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 20 }}>
              Skipping shifts all future reservation slots forward by 1 month.
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Draw Number to Skip</Text>
              <TextInput value={sdDrawNum} onChangeText={setSdDrawNum} keyboardType="numeric" placeholder="e.g. 3"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason *</Text>
              <TextInput value={sdReason} onChangeText={setSdReason} multiline numberOfLines={3}
                placeholder="e.g. Festival holiday, member request..."
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 80, textAlignVertical: 'top' }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setShowSkipDraw(false); setSdDrawId(''); setSdDrawNum(''); setSdReason(''); }} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Skip & Shift" variant="danger" disabled={!sdDrawNum || !sdReason} loading={skipDrawMut.isPending}
                  onPress={() => Alert.alert('Skip Draw', `Skip Draw #${sdDrawNum} and shift all future slots? This cannot be undone.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Skip', style: 'destructive', onPress: () => skipDrawMut.mutate() },
                  ])} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Slot bottom-sheet ─────────────────────────────────────────── */}
      <Modal visible={showAddSlot} animationType="slide" transparent onRequestClose={() => setShowAddSlot(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Add Reservation Slot</Text>
              <TouchableOpacity onPress={() => setShowAddSlot(false)}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Month Number *</Text>
                <TextInput value={asMonth} onChangeText={setAsMonth} keyboardType="numeric"
                  placeholder={`1 – ${selected?.totalDraws ?? selected?.durationMonths ?? '?'}`}
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Assign Member *</Text>
              <View style={{ borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                  {(enrollments as any[]).map((e: any) => {
                    const name = memberMap[e.memberId ?? e.id] ?? 'Unknown';
                    const mid = e.memberId ?? e.id;
                    return (
                      <TouchableOpacity key={mid} onPress={() => setAsMemberId(mid)}
                        style={{ padding: 12, backgroundColor: asMemberId === mid ? C.navy50 : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                        <Text style={{ fontSize: 14, fontWeight: asMemberId === mid ? '700' : '400', color: asMemberId === mid ? C.navy : C.gray900 }}>
                          {name} {asMemberId === mid ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => { setShowAddSlot(false); setAsMonth(''); setAsMemberId(''); }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Reserve Slot" variant="primary"
                    onPress={() => addSlotMut.mutate()} loading={addSlotMut.isPending}
                    disabled={!asMonth || !asMemberId} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Void Slot bottom-sheet ─────────────────────────────────────────── */}
      <Modal visible={showVoidSlot} animationType="slide" transparent onRequestClose={() => setShowVoidSlot(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.red, marginBottom: 4 }}>Void Slot</Text>
            {vsSlot && (
              <Text style={{ fontSize: 13, color: C.gray600, marginBottom: 16 }}>
                Month {vsSlot.slotNumber ?? vsSlot.monthNumber} — {memberMap[vsSlot.memberId] ?? vsSlot.memberName ?? 'Unknown'}
              </Text>
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason (optional)</Text>
            <TextInput value={vsReason} onChangeText={setVsReason} multiline
              placeholder="e.g. Member withdrew, swap arranged..."
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 64, textAlignVertical: 'top', marginBottom: 12 }} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Replace blank slot at</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {(['same', 'end'] as const).map((opt) => (
                <TouchableOpacity key={opt} onPress={() => setVsReplaceAt(opt)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5,
                    borderColor: vsReplaceAt === opt ? C.navy : C.gray300,
                    backgroundColor: vsReplaceAt === opt ? C.navy50 : C.white }}>
                  <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', color: vsReplaceAt === opt ? C.navy : C.gray500 }}>
                    {opt === 'same' ? 'Same position' : 'End of schedule'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setShowVoidSlot(false); setVsSlot(null); setVsReason(''); }} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Void Slot" variant="danger" loading={voidSlotMut.isPending}
                  onPress={() => Alert.alert('Void Slot', 'This removes the member from this slot. Continue?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Void', style: 'destructive', onPress: () => voidSlotMut.mutate() },
                  ])} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Void Payment Batch Modal ──────────────────────────────────────── */}
      <Modal visible={!!voidBatchId} animationType="slide" transparent onRequestClose={() => setVoidBatchId('')}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.red, marginBottom: 4 }}>Void Payment</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
              This reverses the payment record. The member's balance will be updated accordingly.
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason *</Text>
            <TextInput value={voidBatchReason} onChangeText={setVoidBatchReason} multiline
              placeholder="e.g. Entered wrong amount, duplicate entry"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 72, textAlignVertical: 'top', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setVoidBatchId(''); setVoidBatchReason(''); }} /></View>
              <View style={{ flex: 1 }}><Button label="Void Payment" variant="danger" disabled={!voidBatchReason.trim()} loading={voidBatchMut.isPending}
                onPress={() => voidBatchMut.mutate()} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Swap Slots bottom-sheet ────────────────────────────────────────── */}
      <Modal visible={showSwap} animationType="slide" transparent onRequestClose={() => { setShowSwap(false); setSwapA(''); setSwapB(''); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '82%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Swap Slots</Text>
              <TouchableOpacity onPress={() => { setShowSwap(false); setSwapA(''); setSwapB(''); }}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
                Swap two reserved slots — members exchange their scheduled draw months.
              </Text>
              {['A', 'B'].map((label, idx) => {
                const currentVal = idx === 0 ? swapA : swapB;
                const setValue = idx === 0 ? setSwapA : setSwapB;
                const otherVal = idx === 0 ? swapB : swapA;
                const displaySlot = reservedSlots.find((r: any) => r.id === currentVal);
                const displayName = displaySlot
                  ? `Month ${displaySlot.slotNumber ?? displaySlot.monthNumber} — ${memberMap[displaySlot.memberId] ?? 'Unknown'}`
                  : 'Tap to select…';
                return (
                  <View key={label} style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: currentVal ? C.navy : C.gray500, marginBottom: 8 }}>
                      Slot {label}: {displayName}
                    </Text>
                    <View style={{ borderWidth: 1.5, borderColor: currentVal ? C.navy : C.gray200, borderRadius: 12, overflow: 'hidden' }}>
                      {reservedSlots.filter((r: any) => r.id !== otherVal).map((slot: any) => {
                        const name = memberMap[slot.memberId] ?? 'Unknown';
                        const slotNum = slot.slotNumber ?? slot.monthNumber;
                        const isSelected = currentVal === slot.id;
                        return (
                          <TouchableOpacity key={slot.id}
                            onPress={() => setValue(slot.id)}
                            activeOpacity={0.6}
                            style={{ padding: 13, backgroundColor: isSelected ? C.navy + '15' : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                            <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '400', color: isSelected ? C.navy : C.gray900 }}>
                              Month {slotNum} — {name}{isSelected ? '  ✓' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {(!swapA || !swapB) && (
                <Text style={{ fontSize: 12, color: C.amber, textAlign: 'center', marginBottom: 12 }}>
                  {!swapA && !swapB ? 'Select two slots to swap' : !swapA ? 'Select Slot A' : 'Select Slot B'}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => { setShowSwap(false); setSwapA(''); setSwapB(''); }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Confirm Swap" variant="primary"
                    disabled={!swapA || !swapB || swapA === swapB} loading={swapMut.isPending}
                    onPress={() => {
                      const sA = reservedSlots.find((r: any) => r.id === swapA);
                      const sB = reservedSlots.find((r: any) => r.id === swapB);
                      const nameA = sA ? `Month ${sA.slotNumber ?? sA.monthNumber} (${memberMap[sA.memberId] ?? 'Unknown'})` : swapA;
                      const nameB = sB ? `Month ${sB.slotNumber ?? sB.monthNumber} (${memberMap[sB.memberId] ?? 'Unknown'})` : swapB;
                      Alert.alert('Confirm Swap', `Swap:\n${nameA}\n↕\n${nameB}\n\nTheir draw months will be exchanged.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Swap', style: 'destructive', onPress: () => swapMut.mutate() },
                      ]);
                    }} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Shift Schedule bottom-sheet ────────────────────────────────────── */}
      <Modal visible={showShift} animationType="slide" transparent onRequestClose={() => setShowShift(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.amber, marginBottom: 4 }}>Shift Schedule</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 20 }}>
              Push all reserved slots from this month onwards forward by 1 month. Use after skipping a draw.
            </Text>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Shift From Month *</Text>
              <TextInput value={shiftFrom} onChangeText={setShiftFrom} keyboardType="numeric" placeholder="e.g. 4"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>
                Slots from month {shiftFrom || '?'} onwards will shift to month {shiftFrom ? Number(shiftFrom) + 1 : '?'} onwards.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => { setShowShift(false); setShiftFrom(''); }} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Shift Forward" variant="danger" disabled={!shiftFrom} loading={shiftMut.isPending}
                  onPress={() => Alert.alert('Shift Schedule', `Push all slots from month ${shiftFrom} onwards forward by 1 month?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Shift', style: 'destructive', onPress: () => shiftMut.mutate() },
                  ])} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Collect Payment bottom-sheet ───────────────────────────────────── */}
      <Modal visible={showCollectPay} animationType="slide" transparent onRequestClose={() => setShowCollectPay(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Collect Payment</Text>
                {cpDraw && <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>Draw #{cpDraw.drawNumber} — {selected?.name}</Text>}
              </View>
              <TouchableOpacity onPress={() => setShowCollectPay(false)}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.6 }}>SELECT MEMBER</Text>
              <View style={{ borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, overflow: 'hidden' }}>
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {(enrollments as any[]).map((e: any) => {
                    const mId = e.memberId ?? e.id;
                    const mName = e.memberName ?? memberMap[mId] ?? mId;
                    return (
                      <TouchableOpacity key={mId} onPress={() => setCpMemberId(mId)}
                        style={{ padding: 12, backgroundColor: cpMemberId === mId ? C.navy50 : C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                        <Text style={{ fontSize: 14, fontWeight: cpMemberId === mId ? '700' : '400', color: cpMemberId === mId ? C.navy : C.gray900 }}>
                          {mName} {cpMemberId === mId ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.6, marginBottom: 6 }}>AMOUNT (₹)</Text>
                <TextInput value={cpAmount} onChangeText={setCpAmount} keyboardType="numeric" placeholder="Enter amount"
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
                {selected?.installmentAmount && (
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                    Standard: ₹{Number(selected.installmentAmount).toLocaleString('en-IN')}
                  </Text>
                )}
              </View>

              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.6, marginBottom: 8 }}>PAYMENT MODE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((mode) => (
                    <TouchableOpacity key={mode} onPress={() => setCpMode(mode)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                        borderColor: cpMode === mode ? C.navy : C.gray300,
                        backgroundColor: cpMode === mode ? C.navy50 : C.white }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: cpMode === mode ? C.navy : C.gray500 }}>
                        {mode.replace('_', ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.6, marginBottom: 6 }}>NOTES (OPTIONAL)</Text>
                <TextInput value={cpNotes} onChangeText={setCpNotes} multiline placeholder="Any notes…"
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 56, textAlignVertical: 'top' }} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => setShowCollectPay(false)} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button label={`Record ₹${Number(cpAmount || 0).toLocaleString('en-IN')}`}
                    variant="success" size="lg"
                    disabled={!cpMemberId || !cpAmount}
                    loading={collectPayMut.isPending}
                    onPress={() => collectPayMut.mutate()} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Create Payout from Winner (bottom-sheet, stacks over pageSheet detail) ── */}
      <Modal visible={showWinnerPayout} animationType="slide" transparent onRequestClose={() => setShowWinnerPayout(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.gray900 }}>Create Payout</Text>
              <TouchableOpacity onPress={() => setShowWinnerPayout(false)}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {/* Winner info banner */}
              {wpWinner && (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>Winner — Draw #{wpWinner.monthNumber ?? wpWinner.drawNumber}</Text>
                  <Text style={{ fontSize: 14, color: C.gray900, marginTop: 2 }}>
                    {memberMap[wpWinner.memberId ?? wpWinner.winnerId] ?? wpWinner.memberName ?? 'Unknown Member'}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    {selected?.name ?? '—'} • {selected?.durationMonths ?? '—'} months
                  </Text>
                </View>
              )}

              {/* Chit value reference */}
              {selected?.totalAmount && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>CHIT VALUE</Text>
                    <Amount value={selected.totalAmount} size="md" />
                  </View>
                  {selected.installmentAmount && (
                    <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 8, padding: 10 }}>
                      <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2 }}>INSTALLMENT</Text>
                      <Amount value={selected.installmentAmount} size="md" />
                    </View>
                  )}
                </View>
              )}

              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Payout Amount *</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 16 }}
                placeholder="Enter amount"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={wpAmount}
                onChangeText={setWpAmount}
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, height: 72, textAlignVertical: 'top', marginBottom: 20 }}
                placeholder="Add notes about this payout..."
                placeholderTextColor={C.gray400}
                multiline
                value={wpNotes}
                onChangeText={setWpNotes}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => setShowWinnerPayout(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Create Payout"
                    variant="gold"
                    disabled={!wpAmount || Number(wpAmount) <= 0}
                    loading={winnerPayoutMut.isPending}
                    onPress={() => winnerPayoutMut.mutate()}
                  />
                </View>
              </View>
              <Text style={{ fontSize: 11, color: C.gray400, textAlign: 'center', marginTop: 10 }}>
                After creating, tap "Disburse" to release the funds to the winner.
              </Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Disburse Payout bottom-sheet ─────────────────────────────────────── */}
      <Modal visible={showDisburse} animationType="slide" transparent onRequestClose={() => setShowDisburse(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.green }}>Disburse Payout</Text>
                <TouchableOpacity onPress={() => setShowDisburse(false)}>
                  <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
                </TouchableOpacity>
              </View>

              {dsPayout && (
                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: C.green }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>Payout #{dsPayout.id?.slice(-6)?.toUpperCase()}</Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                    {dsPayout.payoutAmount && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400 }}>TOTAL</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>₹{Number(dsPayout.netPayoutAmount ?? dsPayout.payoutAmount).toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {dsPayout.disbursedAmount > 0 && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400 }}>PAID SO FAR</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>₹{Number(dsPayout.disbursedAmount).toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Amount to Disburse (₹) *</Text>
              <TextInput
                value={dsAmount}
                onChangeText={setDsAmount}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 14 }}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Payment Mode</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((mode) => (
                  <TouchableOpacity key={mode} onPress={() => setDsMode(mode)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                      borderColor: dsMode === mode ? C.navy : C.gray300,
                      backgroundColor: dsMode === mode ? C.navy50 : C.white }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: dsMode === mode ? C.navy : C.gray500 }}>
                      {mode.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes (optional)</Text>
              <TextInput
                value={dsNotes}
                onChangeText={setDsNotes}
                multiline
                placeholder="Any notes about this disbursement..."
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60, textAlignVertical: 'top', marginBottom: 20 }}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="ghost" onPress={() => setShowDisburse(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={`Disburse ₹${Number(dsAmount || 0).toLocaleString('en-IN')}`}
                    variant="success"
                    disabled={!dsAmount || Number(dsAmount) <= 0}
                    loading={disburseMut.isPending}
                    onPress={() => Alert.alert('Confirm Disbursement', `Disburse ₹${Number(dsAmount).toLocaleString('en-IN')} via ${dsMode.replace('_', ' ')}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Disburse', onPress: () => disburseMut.mutate() },
                    ])}
                  />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Payout Detail bottom-sheet ────────────────────────────────────────── */}
      <Modal visible={showPayoutDetail} animationType="slide" transparent onRequestClose={() => setShowPayoutDetail(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <SafeAreaView style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Payout Details</Text>
                <TouchableOpacity onPress={() => setShowPayoutDetail(false)}>
                  <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
                </TouchableOpacity>
              </View>

              {pdPayout && (() => {
                const ps = pdPayout.status;
                const statusColor = ps === 'DISBURSED' ? C.green : ps === 'PARTIALLY_DISBURSED' ? '#7C3AED' : ps === 'PENDING' ? C.amber : C.gray400;
                const statusLabel = ps === 'PARTIALLY_DISBURSED' ? 'Partial' : ps;
                return (
                  <>
                    {/* Status badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <View style={{ backgroundColor: statusColor + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: C.gray400 }}>Payout #{pdPayout.id?.slice(-8)?.toUpperCase()}</Text>
                    </View>

                    {/* Key amounts */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 10, padding: 12 }}>
                        <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 4 }}>PAYOUT AMOUNT</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>
                          ₹{Number(pdPayout.netPayoutAmount ?? pdPayout.payoutAmount ?? 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                      {Number(pdPayout.disbursedAmount ?? 0) > 0 && (
                        <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12 }}>
                          <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 4 }}>DISBURSED</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: C.green }}>
                            ₹{Number(pdPayout.disbursedAmount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Details rows */}
                    {[
                      pdPayout.paymentMode     && { label: 'Payment Mode',   value: pdPayout.paymentMode.replace('_', ' ') },
                      pdPayout.disbursedAt      && { label: 'Disbursed At',   value: fmtDateTime(pdPayout.disbursedAt) },
                      pdPayout.createdAt        && { label: 'Created At',     value: fmtDate(pdPayout.createdAt) },
                      pdPayout.notes            && { label: 'Notes',          value: pdPayout.notes },
                    ].filter(Boolean).map((row: any) => (
                      <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                        <Text style={{ fontSize: 13, color: C.gray500 }}>{row.label}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900, flex: 1, textAlign: 'right' }}>{row.value}</Text>
                      </View>
                    ))}

                    {/* Cross-chit dues note */}
                    {Number(pdPayout.crossChitDuesDeducted ?? 0) > 0 && (
                      <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginTop: 12 }}>
                        <Text style={{ fontSize: 12, color: C.amber, fontWeight: '600' }}>
                          ₹{Number(pdPayout.crossChitDuesDeducted).toLocaleString('en-IN')} deducted for outstanding dues
                        </Text>
                      </View>
                    )}

                    <View style={{ marginTop: 20 }}>
                      <Button label="Close" variant="outline" onPress={() => setShowPayoutDetail(false)} />
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
