import { applyChitScheduleCommand } from '../../../features/chits/scheduleCommand';
import { DrawPaymentRows } from '../../../components/DrawPaymentRows';
import { ReadDataBoundary } from '../../../components/ReadDataBoundary';
import { useState, useRef, useEffect } from 'react';
import { ChitActionDialog, ChitDialogHost } from '../../../components/ChitActionDialog';
import { useOnlineMutation } from '../../../offline/useOnlineMutation';
import { buildOpenDrawRequest } from '../../../features/chits/drawRequest';
import {
  View, Text, FlatList, Modal, ScrollView, RefreshControl,
  TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import {
  getChit, getChits, getDraws, openDraw, closeDraw, skipDraw, deleteDraw,
  getEnrollments, getMembers, getWinners, recordWinner,
  getPayoutsByChit,
  recordPayment, createPayout, disbursePayout,
  getReservations, updateReservationSlot, markSlotProcessed,
  listAuctions, closeAuction, placeBid,
  getChitLifecycleSync,
} from '../../../services/api';
import {
  C, T, Card, Badge, Button, Amount, EmptyState, LoadingScreen,
  fmtDate, Divider,
} from '../../../components/ui';
import { toast } from '../../../components/Toast';

const DRAW_STATUS_COLOR: Record<string, string> = {
  PENDING: C.gray400, OPEN: C.green, CLOSED: C.navy, SKIPPED: C.amber,
};

type DetailTab = 'draws' | 'members' | 'winners' | 'schedule' | 'info' | 'auction';

export default function ManagerChitsScreen() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const { data: lifecycleSync } = useQuery({
    queryKey: ['m-chit-lifecycle-sync', selected?.id],
    queryFn: () => getChitLifecycleSync(selected.id),
    enabled: (selected?.status === 'COMPLETED' || !!selected?.scheduleSyncCommandId) && !!selected?.id,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.status;
      return status && ['PENDING', 'RETRYING'].includes(status) ? 3000 : false;
    },
  });
  useEffect(() => {
    if (!['COMPLETED', 'REJECTED'].includes(lifecycleSync?.status ?? '') || !selected?.scheduleSyncCommandId) return;
    const chitId = selected.id;
    getChit(chitId).then((fresh) => setSelected((current: any) => current?.id === chitId ? fresh : current)).catch(() => {});
    for (const key of ['m-draws', 'm-reservations', 'm-chits']) qc.invalidateQueries({ queryKey: key === 'm-chits' ? [key] : [key, chitId] });
  }, [lifecycleSync?.status, selected?.scheduleSyncCommandId, selected?.id, qc]);

  const [detailTab, setDetailTab] = useState<DetailTab>('draws');
  const [expandedDrawId, setExpandedDrawId] = useState<string | null>(null);

  const [showOpenDraw, setShowOpenDraw] = useState(false);
  const [odDrawNum, setOdDrawNum] = useState('');
  const [odWinnerIds, setOdWinnerIds] = useState<string[]>([]);
  const toggleWinner = (mid: string) =>
    setOdWinnerIds((p) => p.includes(mid) ? p.filter((x) => x !== mid) : [...p, mid]);
  const [lotteryDrawMode, setLotteryDrawMode] = useState<'RANDOM' | 'PICK'>('RANDOM');
  const [lotteryPickedWinnerId, setLotteryPickedWinnerId] = useState('');

  const [showSkip, setShowSkip] = useState(false);
  const [skipTarget, setSkipTarget] = useState<any>(null);
  const [skipReason, setSkipReason] = useState('');

  const [showCollect, setShowCollect] = useState(false);
  const [collectDraw, setCollectDraw] = useState<any>(null);
  const [collectMemberId, setCollectMemberId] = useState('');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState('CASH');
  const [collectIdempotencyKey, setCollectIdempotencyKey] = useState(() => Crypto.randomUUID());

  const [showPayout, setShowPayout] = useState(false);
  const [payoutWinner, setPayoutWinner] = useState<any>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutIdempotencyKey, setPayoutIdempotencyKey] = useState(() => Crypto.randomUUID());

  const [showDisburse, setShowDisburse] = useState(false);
  const [disbursePay, setDisbursePay] = useState<any>(null);
  const [disburseIdempotencyKey, setDisburseIdempotencyKey] = useState(() => Crypto.randomUUID());
  const [disburseMode, setDisburseMode] = useState('CASH');
  const [disburseAmount, setDisburseAmount] = useState('');

  const [proxyMemberId, setProxyMemberId] = useState('');
  const [proxyBidAmount, setProxyBidAmount] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: chits = [], isLoading, refetch } = useQuery({
    queryKey: ['m-chits'], queryFn: getChits,
  });
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => { memberMap[m.id] = m.fullName ?? m.name ?? '—'; });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['m-enrollments', selected?.id],
    queryFn: () => getEnrollments(selected!.id),
    enabled: !!selected?.id && (detailTab === 'members' || detailTab === 'draws' || detailTab === 'auction' || showOpenDraw),
  });
  const enrolledIds = new Set((enrollments as any[]).map((e: any) => e.memberId ?? e.id));

  const { data: draws = [], refetch: refetchDraws } = useQuery({
    queryKey: ['m-draws', selected?.id],
    queryFn: async () => (await getDraws(selected!.id)).map((draw: any) => ({ ...draw, drawNumber: draw.monthNumber ?? draw.drawNumber })),
    enabled: !!selected?.id && detailTab === 'draws',
    staleTime: 30_000,
  });
  const sortedDraws = [...(draws as any[])].sort((a, b) => (b.drawNumber ?? 0) - (a.drawNumber ?? 0));
  const activeOpenDraw = (draws as any[]).find((d: any) => d.status === 'OPEN');
  const nextDrawNum = Math.max(...(draws as any[]).map((d: any) => d.drawNumber ?? 0), 0) + 1;

  const { data: winners = [] } = useQuery({
    queryKey: ['m-winners', selected?.id],
    queryFn: () => getWinners(selected!.id),
    enabled: !!selected?.id && (detailTab === 'winners' || detailTab === 'draws' || (selected?.chitType === 'LOTTERY' && showOpenDraw)),
  });
  const { data: reservations = [] } = useQuery({
    queryKey: ['m-reservations', selected?.id],
    queryFn: () => getReservations(selected!.id),
    enabled: !!selected?.id && (detailTab === 'schedule' || showOpenDraw),
    staleTime: 60_000,
  });

  const { data: chitPayouts = [] } = useQuery({
    queryKey: ['m-chit-payouts', selected?.id],
    queryFn: () => getPayoutsByChit(selected!.id),
    enabled: !!selected?.id && detailTab === 'winners',
    staleTime: 30_000,
  });

  const { data: auctionSessions = [], refetch: refetchAuctions } = useQuery({
    queryKey: ['mg-auctions', selected?.id],
    queryFn: () => listAuctions(selected!.id),
    enabled: !!selected?.id && detailTab === 'auction',
    refetchInterval: detailTab === 'auction' ? 10_000 : false,
  });
  const activeAuction = (auctionSessions as any[]).find((s: any) => s.status === 'OPEN');
  const isAuctionChit = selected?.chitType === 'AUCTION' || selected?.winnerSelectionMode === 'AUCTION';

  // ── Mutations ────────────────────────────────────────────────────────────────
  const proxyBidMut = useMutation({
    mutationFn: () => placeBid({
      chitId: selected!.id,
      auctionId: activeAuction?.id,
      bidAmount: Number(proxyBidAmount),
      onBehalfOfMemberId: proxyMemberId,
    }),
    onSuccess: () => {
      refetchAuctions();
      setProxyBidAmount('');
      setProxyMemberId('');
      toast.saved(`Bid placed for ${memberMap[proxyMemberId] ?? 'member'}`);
    },
    onError: (e: any) => Alert.alert('Bid Failed', e.response?.data?.message ?? 'Could not place bid'),
  });

  const closeAuctionMut = useMutation({
    mutationFn: () => closeAuction({ chitId: selected!.id, auctionId: activeAuction?.id }),
    onSuccess: () => { refetchAuctions(); toast.saved('Auction closed'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to close'),
  });

  const dialogClosers = useRef(new Map<symbol, () => void>());
  const drawSequence = useRef(0);
  useEffect(() => () => { drawSequence.current++; }, []);
  const selectedChitId = useRef(selected?.id);
  selectedChitId.current = selected?.id;
  const [openDrawError, setOpenDrawError] = useState('');
  const actionOpen = showOpenDraw || showSkip || showCollect || showPayout || showDisburse;
  function closeDrawDialog() {
    drawSequence.current++; setShowOpenDraw(false); setOpenDrawError('');
    setOdDrawNum(''); setOdWinnerIds([]); setLotteryDrawMode('RANDOM'); setLotteryPickedWinnerId('');
  }
  function closeDetail() {
    closeDrawDialog(); setShowSkip(false); setShowCollect(false); setShowPayout(false); setShowDisburse(false); setSelected(null);
  }

  const openDrawMut = useOnlineMutation({
    offlineErrorMode: 'handler',
    onMutate: () => ({ chitId: selected.id, sequence: drawSequence.current }),
    mutationFn: async () => {
      const drawNum = Number(odDrawNum) || nextDrawNum;
      await openDraw(buildOpenDrawRequest(selected, drawNum, enrollments as any[], winners as any[], reservations as any[]));

      if (selected?.chitType === 'LOTTERY') {
        const lotterySlot = (reservations as any[]).find(
          (r: any) => r.monthNumber === drawNum && r.status !== 'VOIDED'
        );
        const winningAmount = lotterySlot?.payoutAmount
          ? Number(lotterySlot.payoutAmount)
          : Number(selected?.chitValue ?? 0);

        const winnerRecord = await recordWinner(selected.id, {
          ...(lotteryDrawMode === 'PICK' && lotteryPickedWinnerId ? { winnerId: lotteryPickedWinnerId } : {}),
          monthNumber: drawNum,
          winningAmount,
          discountAmount: 0,
        });

        if (lotterySlot && winnerRecord?.memberId) {
          await updateReservationSlot(selected.id, lotterySlot.id, {
            reservationMonth: lotterySlot.reservationMonth,
            memberId: winnerRecord.memberId,
            orgHeld: false,
            payoutAmount: lotterySlot.payoutAmount ?? null,
            postPayoutContribution: lotterySlot.postPayoutContribution ?? null,
          });
          await markSlotProcessed(selected.id, lotterySlot.id).catch(() => {});
        }
      } else {
        for (const mid of odWinnerIds) {
          await recordWinner(selected.id, {
            winnerId: mid,
            monthNumber: drawNum,
            winningAmount: Number(selected?.chitValue ?? 0),
            discountAmount: 0,
          }).catch(() => {});
        }
      }
    },
    onSuccess: (_data, _variables, original) => {
      for (const key of ['m-draws', 'm-winners', 'm-reservations']) qc.invalidateQueries({ queryKey: [key, original?.chitId] });
      qc.invalidateQueries({ queryKey: ['m-chits'] });
      if (original?.chitId !== selectedChitId.current || original?.sequence !== drawSequence.current) return;
      closeDrawDialog();
      toast.noted('Draw opened');
    },
    onError: (error: any, _variables, original) => {
      if (original?.chitId === selectedChitId.current && original?.sequence === drawSequence.current) setOpenDrawError(error.response?.data?.message ?? error.message ?? 'Failed to open draw');
    },
  });

  const closeDrawMut = useMutation({
    mutationFn: (drawId: string) => closeDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-draws', selected.id] });
      qc.invalidateQueries({ queryKey: ['m-chits'] });
      toast.noted('Draw closed');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const skipAttemptIds = useRef<Record<string, string>>({});
  const skipDrawMut = useMutation({
    mutationFn: async () => {
      const chitId = selected.id;
      const request = buildOpenDrawRequest(selected, Number(skipTarget.drawNumber), enrollments as any[], winners as any[], reservations as any[]);
      const attemptId = skipAttemptIds.current[chitId] ??= Crypto.randomUUID();
      const command = await skipDraw({ attemptId, chitId: request.chitId, monthNumber: request.monthNumber, dueDate: request.dueDate,
        installmentAmount: request.installmentAmount, skipReason: skipReason || 'Skipped by manager',
        memberIds: request.members.map(member => member.memberId) });
      return { ...command, chitId, attemptId };
    },
    onSuccess: (command: any) => {
      if (skipAttemptIds.current[command.chitId] === command.attemptId) delete skipAttemptIds.current[command.chitId];
      setSelected((prev: any) => applyChitScheduleCommand(prev, command));
      qc.invalidateQueries({ queryKey: ['m-chit-lifecycle-sync', command.chitId] });
      qc.invalidateQueries({ queryKey: ['m-draws', command.chitId] });
      qc.invalidateQueries({ queryKey: ['m-chits'] });
      qc.invalidateQueries({ queryKey: ['m-reservations', command.chitId] });
      if (selectedChitId.current !== command.chitId) return;
      setShowSkip(false); setSkipTarget(null); setSkipReason('');
      if (command.status === 'REJECTED') Alert.alert('Draw unchanged', 'This skip request was rejected because a draw already exists at or after this number. Refresh the draw list.');
      else toast.cancelled('Skip requested — draw and schedule are syncing');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to skip draw'),
  });

  const deleteDrawMut = useMutation({
    mutationFn: (drawId: string) => deleteDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-draws', selected.id] });
      toast.cancelled('Empty draw discarded');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const collectMut = useMutation({
    mutationFn: () => recordPayment({
      memberId: collectMemberId,
      chitId: selected.id,
      drawId: collectDraw?.id,
      amount: Number(collectAmount),
      paymentMode: collectMode,
      idempotencyKey: collectIdempotencyKey,
    }),
    onSuccess: () => {
      setCollectIdempotencyKey(Crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ['m-draw-payments', collectDraw?.id] });
      setShowCollect(false); setCollectMemberId(''); setCollectAmount(''); setCollectMode('CASH');
      toast.saved('Payment recorded');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to record payment'),
  });

  const payoutMut = useMutation({
    mutationFn: () => createPayout({
      idempotencyKey: payoutIdempotencyKey,
      memberId: payoutWinner.memberId ?? payoutWinner.winnerId,
      chitId: selected.id,
      monthNumber: payoutWinner.monthNumber ?? payoutWinner.drawNumber,
      winningAmount: Number(payoutAmount) || Number(payoutWinner.winningAmount ?? selected?.chitValue ?? 0),
      discountAmount: 0,
      notes: null,
    }),
    onSuccess: () => {
      setPayoutIdempotencyKey(Crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ['m-chit-payouts', selected.id] });
      setShowPayout(false); setPayoutWinner(null); setPayoutAmount('');
      toast.saved('Payout created');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to create payout'),
  });

  const disburseMut = useMutation({
    mutationFn: () => disbursePayout(disbursePay.id, {
      disbursementMode: disburseMode,
      amount: Number(disburseAmount) || Number(disbursePay.netPayoutAmount ?? disbursePay.winningAmount ?? 0),
    }, disburseIdempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-chit-payouts', selected.id] });
      setShowDisburse(false); setDisbursePay(null); setDisburseAmount('');
      setDisburseIdempotencyKey(Crypto.randomUUID());
      toast.saved('Payout disbursed');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to disburse'),
  });

  // ── List ─────────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen />;

  const sorted = [...(chits as any[])].sort((a, b) => {
    const o: Record<string, number> = { ACTIVE: 0, PAUSED: 1, COMPLETED: 2, CANCELLED: 3, DRAFT: 4 };
    return (o[a.status] ?? 9) - (o[b.status] ?? 9);
  });

  const enrolledMembers = (members as any[]).filter((m: any) => enrolledIds.has(m.id));

  const isLotteryChit = selected?.chitType === 'LOTTERY';
  const lotteryWinCounts: Record<string, number> = {};
  (winners as any[]).forEach((w: any) => {
    const mid = String(w.memberId ?? w.winnerId);
    lotteryWinCounts[mid] = (lotteryWinCounts[mid] ?? 0) + 1;
  });
  const lotterySpotCounts: Record<string, number> = {};
  (enrollments as any[]).forEach((e: any) => {
    const mid = String(e.memberId ?? e.id);
    lotterySpotCounts[mid] = (lotterySpotCounts[mid] ?? 0) + 1;
  });
  const lotteryEligibleIds = isLotteryChit
    ? Object.entries(lotterySpotCounts)
        .filter(([mid, spots]) => (lotteryWinCounts[mid] ?? 0) < spots)
        .map(([mid]) => mid)
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ReadDataBoundary label="Chits" queryKeys={[['m-chits']]}>

      <FlatList
        data={sorted}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Chits</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').length} active · {(chits as any[]).length} total
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No chits" message="No chits found." />}
        renderItem={({ item: c }) => (
          <TouchableOpacity activeOpacity={0.8} onPress={() => { setSelected(c); setDetailTab('draws'); setExpandedDrawId(null); }}>
            <Card style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }}>{c.name}</Text>
                <Badge status={c.status} />
              </View>
              {(() => {
                const type = c.chitType ?? c.winnerSelectionMode;
                if (!type) return null;
                const typeColor = type === 'RESERVATION' ? C.navy : type === 'LOTTERY' ? C.gold : type === 'AUCTION' ? C.amber : C.gray400;
                const typeBg   = type === 'RESERVATION' ? '#EEF2F8' : type === 'LOTTERY' ? '#FEF9C3' : type === 'AUCTION' ? '#FFFBEB' : C.gray100;
                return (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: typeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: typeColor }}>{type}</Text>
                  </View>
                );
              })()}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Monthly</Text>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Draw</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    {c.winnersAssigned ?? c.currentDraw ?? 0} / {c.durationMonths ?? c.totalDraws ?? '?'}
                  </Text>
                </View>
                {c.totalAmount && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Total</Text>
                    <Amount value={c.totalAmount} size="sm" color={C.green} />
                  </View>
                )}
                {c.memberCount != null && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Members</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{c.memberCount}</Text>
                  </View>
                )}
                {c.postPayoutContributionEnabled !== undefined && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Post-Payout</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.postPayoutContributionEnabled ? C.green : C.gray400 }}>
                      {c.postPayoutContributionEnabled ? 'Yes' : 'No'}
                    </Text>
                  </View>
                )}
              </View>
              {(c.durationMonths ?? c.totalDraws) && (c.winnersAssigned != null || c.currentDraw != null) && (
                <>
                  <Divider />
                  <View style={{ height: 5, backgroundColor: C.gray200, borderRadius: 3 }}>
                    <View style={{
                      height: 5, borderRadius: 3,
                      backgroundColor: c.status === 'COMPLETED' ? C.green : C.navy,
                      width: `${Math.min(100, ((c.winnersAssigned ?? c.currentDraw ?? 0) / (c.durationMonths ?? c.totalDraws)) * 100)}%`,
                    }} />
                  </View>
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 3, textAlign: 'right' }}>
                    {Math.round(((c.winnersAssigned ?? c.currentDraw ?? 0) / (c.durationMonths ?? c.totalDraws)) * 100)}% complete
                  </Text>
                </>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>Manage →</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* ── Chit Detail Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          const closeAction = [...dialogClosers.current.values()].at(-1);
          if (Platform.OS === 'android' && closeAction) closeAction(); else closeDetail();
        }}
      >
        <ChitDialogHost value={dialogClosers}>
        {selected && (
          <SafeAreaView accessibilityElementsHidden={actionOpen} importantForAccessibility={actionOpen ? 'no-hide-descendants' : 'auto'} style={{ flex: 1, backgroundColor: C.gray50 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 16, paddingVertical: 12,
              backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray200,
            }}>
              <TouchableOpacity accessibilityLabel="Close chit details" onPress={closeDetail} style={{ padding: 4 }}>
                <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.navy }} numberOfLines={1}>{selected.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <Badge status={selected.status} />
                  <Text style={{ fontSize: 12, color: C.gray400 }}>
                    Draw {selected.winnersAssigned ?? selected.currentDraw ?? 0} of {selected.durationMonths ?? selected.totalDraws ?? '?'}
                  </Text>
                </View>
              </View>
            </View>

          {lifecycleSync?.status === 'REJECTED' && (
            <View style={{ margin: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB' }}>
              <Text style={{ color: C.amber, fontWeight: '700' }}>Schedule change was not applied</Text>
              <Text style={{ color: C.gray700, fontSize: 12, marginTop: 4 }}>A draw already exists at or after that number. Your draw, payments and schedule are unchanged. Refresh the draw list before continuing.</Text>
            </View>
          )}
            {lifecycleSync?.status === 'FAILED' && (
              <View style={{ margin: 12, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.red }}>Chit sync needs attention</Text>
                <Text style={{ fontSize: 12, color: C.red, marginTop: 3 }}>
                  A chit change could not finish syncing. Ask an administrator to retry before changing this schedule.
                </Text>
              </View>
            )}
            {['PENDING', 'RETRYING'].includes(lifecycleSync?.status) && (
              <View style={{ marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber }}>☁ Syncing chit and schedule…</Text>
              </View>
            )}

            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray200 }}
              contentContainerStyle={{ paddingHorizontal: 12 }}
            >
              {(([
                'draws', 'members', 'winners',
                ...(selected?.chitType === 'RESERVATION' || selected?.winnerSelectionMode === 'RESERVATION' ? ['schedule'] : []),
                ...(isAuctionChit ? ['auction'] : []),
                'info',
              ]) as DetailTab[]).map((t) => (
                <TouchableOpacity key={t} onPress={() => setDetailTab(t)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 12, marginRight: 4,
                    borderBottomWidth: 2, borderBottomColor: detailTab === t ? C.navy : 'transparent',
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: detailTab === t ? C.navy : C.gray400 }}>
                    {t === 'draws' ? 'Draws' : t === 'members' ? 'Members' : t === 'winners' ? 'Winners'
                      : t === 'schedule' ? 'Schedule' : t === 'auction' ? (activeAuction ? '🔴 Auction' : 'Auction') : 'Info'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── DRAWS TAB ───────────────────────────────────────────────── */}
            {detailTab === 'draws' && (
              <ReadDataBoundary label="Draws" queryKeys={[['m-draws', selected?.id], ['m-enrollments', selected?.id], ['m-winners', selected?.id]]}><ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={false} onRefresh={refetchDraws} tintColor={C.navy} />}
              >
                {selected.status === 'ACTIVE' && !activeOpenDraw && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    <TouchableOpacity
                      onPress={() => { drawSequence.current++; setOpenDrawError(''); setOdDrawNum(String(nextDrawNum)); setShowOpenDraw(true); }}
                      style={{ flex: 1, backgroundColor: C.navy, borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Open Draw #{nextDrawNum}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSkipTarget({ drawNumber: nextDrawNum }); setSkipReason(''); setShowSkip(true);
                      }}
                      style={{ backgroundColor: '#FEF3C7', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {(draws as any[]).length === 0 ? (
                  <EmptyState title="No draws yet" message="Open the first draw when ready." />
                ) : (
                  sortedDraws.map((d: any) => {
                    const isExpanded = expandedDrawId === d.id;
                    const col = DRAW_STATUS_COLOR[d.status] ?? C.gray400;
                    return (
                      <Card key={d.id} style={{ marginBottom: 10 }}>
                        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedDrawId(isExpanded ? null : d.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: col + '18', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: col }}>#{d.drawNumber}</Text>
                              </View>
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>Draw {d.drawNumber}</Text>
                                <Text style={{ fontSize: 11, color: C.gray400 }}>
                                  {d.openedAt ? fmtDate(d.openedAt) : d.closedAt ? fmtDate(d.closedAt) : '—'}
                                </Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ backgroundColor: col + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: col }}>{d.status}</Text>
                              </View>
                              <Text style={{ fontSize: 16, color: C.gray400 }}>{isExpanded ? '▲' : '▼'}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={{ marginTop: 12 }}>
                            <Divider />
                            {d.status === 'OPEN' && (
                              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                                <TouchableOpacity
                                  onPress={() => Alert.alert(
                                    'Close Draw',
                                    `Close draw #${d.drawNumber}?`,
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Close', onPress: () => closeDrawMut.mutate(d.id) },
                                    ]
                                  )}
                                  style={{ flex: 1, backgroundColor: C.navy, borderRadius: 10, padding: 10, alignItems: 'center' }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Close Draw</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => { setSkipTarget(d); setShowSkip(true); }}
                                  style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, paddingHorizontal: 14 }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>Skip</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                            {d.status === 'PENDING' && (
                              <TouchableOpacity
                                onPress={() => Alert.alert(
                                  'Discard Empty Draw',
                                  `Discard empty draw #${d.drawNumber}? Any financial, winner, auction, reservation, or payout history will block this action.`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Discard', style: 'destructive', onPress: () => deleteDrawMut.mutate(d.id) },
                                  ]
                                )}
                                style={{ backgroundColor: '#FEE2E2', borderRadius: 10, padding: 9, alignItems: 'center', marginVertical: 6 }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>Discard Empty Draw</Text>
                              </TouchableOpacity>
                            )}
                            {(d.status === 'OPEN' || d.status === 'CLOSED') && (
                              <DrawPaymentRows queryKeyPrefix="m-draw-payments"
                                drawId={d.id}
                                drawStatus={d.status}
                                memberMap={memberMap}
                                onCollect={(memberId) => {
                                  setCollectDraw(d);
                                  setCollectMemberId(memberId);
                                  setCollectAmount(String(selected.installmentAmount ?? ''));
                                  setShowCollect(true);
                                }}
                              />
                            )}
                            {d.status === 'SKIPPED' && d.reason && (
                              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 8 }}>Reason: {d.reason}</Text>
                            )}
                          </View>
                        )}
                      </Card>
                    );
                  })
                )}
              </ScrollView></ReadDataBoundary>
            )}

            {/* ── MEMBERS TAB ─────────────────────────────────────────────── */}
            {detailTab === 'members' && (
              <ReadDataBoundary label="Enrolments" queryKeys={[['m-enrollments', selected?.id]]}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
                  {(enrollments as any[]).length} enrolled
                </Text>
                {(enrollments as any[]).length === 0 ? (
                  <EmptyState title="No members enrolled" message="Admin enrolls members in this chit." />
                ) : (
                  (enrollments as any[]).map((e: any) => {
                    const mName = memberMap[e.memberId ?? e.id] ?? e.fullName ?? '—';
                    return (
                      <Card key={e.id ?? e.memberId} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{mName[0]?.toUpperCase() ?? '?'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{mName}</Text>
                            {e.slotsHeld != null && (
                              <Text style={{ fontSize: 12, color: C.gray400 }}>{e.slotsHeld} slot{e.slotsHeld !== 1 ? 's' : ''}</Text>
                            )}
                          </View>
                          <Badge status={e.status ?? 'ACTIVE'} />
                        </View>
                      </Card>
                    );
                  })
                )}
              </ScrollView></ReadDataBoundary>
            )}

            {/* ── WINNERS TAB ─────────────────────────────────────────────── */}
            {detailTab === 'winners' && (
              <ReadDataBoundary label="Winners" queryKeys={[['m-winners', selected?.id], ['m-chit-payouts', selected?.id]]}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 12 }}>Payouts</Text>
                {(chitPayouts as any[]).length === 0 ? (
                  <EmptyState title="No payouts yet" message="Payouts appear after winners are recorded." />
                ) : (
                  (chitPayouts as any[]).map((p: any) => {
                    const canDisburse = p.status === 'PENDING' || p.status === 'APPROVED';
                    return (
                      <Card key={p.id} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                              {memberMap[p.memberId ?? p.winnerId] ?? '—'}
                            </Text>
                            <Text style={{ fontSize: 12, color: C.navy, marginTop: 1 }}>Draw #{p.drawNumber}</Text>
                            <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{fmtDate(p.createdAt)}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Badge status={p.status} />
                            <Amount value={p.netPayoutAmount ?? p.winningAmount ?? 0} size="sm" color={C.gold} />
                          </View>
                        </View>
                        {canDisburse && (
                          <TouchableOpacity
                            onPress={() => {
                              setDisbursePay(p);
                              setDisburseAmount(String(p.netPayoutAmount ?? p.winningAmount ?? ''));
                              setDisburseMode('CASH');
                              setShowDisburse(true);
                            }}
                            style={{ backgroundColor: '#EEF2F8', borderRadius: 10, padding: 9, alignItems: 'center', marginTop: 4 }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Disburse Payout</Text>
                          </TouchableOpacity>
                        )}
                      </Card>
                    );
                  })
                )}

                <Divider />
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 12, marginTop: 12 }}>Winners Recorded</Text>
                {(winners as any[]).length === 0 ? (
                  <Text style={{ fontSize: 13, color: C.gray400 }}>No winners yet.</Text>
                ) : (
                  (winners as any[]).map((w: any) => {
                    const hasPayout = (chitPayouts as any[]).some(
                      (p: any) => (p.memberId === w.memberId || p.memberId === w.winnerId) && p.drawNumber === w.monthNumber
                    );
                    return (
                      <Card key={w.id} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                              {memberMap[w.memberId ?? w.winnerId] ?? '—'}
                            </Text>
                            <Text style={{ fontSize: 12, color: C.navy }}>Draw #{w.monthNumber ?? w.drawNumber}</Text>
                          </View>
                          {!hasPayout ? (
                            <TouchableOpacity
                              onPress={() => {
                                setPayoutWinner(w);
                                setPayoutAmount(String(w.winningAmount ?? selected?.chitValue ?? ''));
                                setShowPayout(true);
                              }}
                              style={{ backgroundColor: '#EEF2F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Create Payout</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.green }}>Payout exists</Text>
                            </View>
                          )}
                        </View>
                      </Card>
                    );
                  })
                )}
              </ScrollView></ReadDataBoundary>
            )}

            {/* ── SCHEDULE TAB (read-only) ─────────────────────────────────── */}
            {detailTab === 'schedule' && <ReadDataBoundary label="Schedule" queryKeys={[['m-reservations', selected?.id]]}>{(() => {
              const slotsList = [...(reservations as any[])].sort(
                (a, b) => (a.slotNumber ?? a.monthNumber ?? 0) - (b.slotNumber ?? b.monthNumber ?? 0)
              );
              const STATUS_COLOR: Record<string, string> = {
                RESERVED: C.navy, PROCESSED: C.green, VOIDED: C.red, UNALLOCATED: C.gray400,
              };
              return (
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                  <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 12 }}>
                    View-only · Contact admin to modify slot assignments
                  </Text>
                  {slotsList.length === 0 ? (
                    <EmptyState title="No schedule" message="No reservation slots have been set up for this chit." />
                  ) : slotsList.map((slot: any) => {
                    const slotNum = slot.slotNumber ?? slot.monthNumber ?? '?';
                    const sColor = STATUS_COLOR[slot.status] ?? C.gray400;
                    const memberName = slot.orgHeld ? 'Organisation' : (memberMap[String(slot.memberId)] ?? (slot.memberId ? 'Unknown member' : 'Unallocated'));
                    const month = slot.reservationMonth ? slot.reservationMonth.substring(0, 7) : '—';
                    return (
                      <View key={slot.id} style={{
                        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                        borderBottomWidth: 1, borderBottomColor: C.gray100,
                      }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: sColor + '18', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sColor }}>#{slotNum}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{memberName}</Text>
                          <Text style={{ fontSize: 12, color: C.gray400 }}>{month} · {slot.status}</Text>
                        </View>
                        {slot.payoutAmount != null && (
                          <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>
                            ₹{Number(slot.payoutAmount).toLocaleString('en-IN')}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              );
            })()}</ReadDataBoundary>}

            {/* ── AUCTION TAB ─────────────────────────────────────────────── */}
            {detailTab === 'auction' && isAuctionChit && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={false} onRefresh={refetchAuctions} tintColor={C.navy} />}
              >
                {activeAuction ? (
                  <View style={{ backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FED7AA' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#C2410C' }}>
                        LIVE — Draw {activeAuction.monthNumber}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#7C2D12', marginBottom: 4 }}>
                      Pot: ₹{Number(activeAuction.scheduledPayoutAmount ?? 0).toLocaleString('en-IN')}
                      {'  ·  '}
                      {activeAuction.closesAt
                        ? `Closes ${new Date(activeAuction.closesAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                        : 'No timer'}
                    </Text>
                    {/* Bid leaderboard */}
                    {(activeAuction.bids ?? []).length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 6, letterSpacing: 0.5 }}>
                          BIDS ({(activeAuction.bids ?? []).length})
                        </Text>
                        {[...(activeAuction.bids ?? [])]
                          .sort((a: any, b: any) => b.bidAmount - a.bidAmount)
                          .map((bid: any, i: number) => (
                            <View key={bid.id ?? i} style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#FED7AA',
                            }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {i === 0 && <Text style={{ fontSize: 14 }}>🏆</Text>}
                                <Text style={{ fontSize: 13, color: '#7C2D12', fontWeight: i === 0 ? '700' : '500' }}>
                                  {memberMap[bid.memberId] ?? 'Unknown'}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: i === 0 ? '#D97706' : '#7C2D12' }}>
                                ₹{Number(bid.bidAmount).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          ))}
                      </View>
                    )}
                    {(activeAuction.bids ?? []).length === 0 && (
                      <Text style={{ fontSize: 12, color: '#9A3412', marginTop: 6 }}>No bids placed yet.</Text>
                    )}
                    {/* Close auction */}
                    <TouchableOpacity
                      onPress={() => closeAuctionMut.mutate()}
                      disabled={closeAuctionMut.isPending || (activeAuction.bids ?? []).length === 0}
                      style={{
                        marginTop: 12, backgroundColor: (activeAuction.bids ?? []).length === 0 ? C.gray300 : C.navy,
                        borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>
                        {closeAuctionMut.isPending ? 'Closing…' : 'Close Auction'}
                      </Text>
                    </TouchableOpacity>

                    {/* Proxy bid panel */}
                    <View style={{ marginTop: 14, backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 }}>Place Bid on Behalf of Member</Text>
                      <Text style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>
                        For members who can't use the app. Recorded in their name and fully audited.
                      </Text>
                      <View style={{ marginBottom: 8 }}>
                        {(enrollments as any[]).filter((e: any) => e.active).map((e: any) => (
                          <TouchableOpacity
                            key={e.memberId}
                            onPress={() => setProxyMemberId(e.memberId)}
                            style={{
                              paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4,
                              backgroundColor: proxyMemberId === e.memberId ? '#DBEAFE' : C.white,
                              borderWidth: 1, borderColor: proxyMemberId === e.memberId ? '#93C5FD' : C.gray200,
                            }}
                          >
                            <Text style={{ fontSize: 13, color: proxyMemberId === e.memberId ? '#1D4ED8' : C.gray700, fontWeight: proxyMemberId === e.memberId ? '700' : '400' }}>
                              {memberMap[e.memberId] ?? e.memberId}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TextInput
                          style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.gray900 }}
                          placeholder="Bid amount (₹)"
                          placeholderTextColor={C.gray400}
                          keyboardType="numeric"
                          value={proxyBidAmount}
                          onChangeText={setProxyBidAmount}
                        />
                        <TouchableOpacity
                          disabled={!proxyMemberId || !proxyBidAmount || proxyBidMut.isPending}
                          onPress={() => proxyBidMut.mutate()}
                          style={{
                            backgroundColor: (!proxyMemberId || !proxyBidAmount || proxyBidMut.isPending) ? C.gray300 : '#1D4ED8',
                            borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>
                            {proxyBidMut.isPending ? '…' : 'Bid'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.gray200 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray700, marginBottom: 4 }}>No active auction</Text>
                    <Text style={{ fontSize: 12, color: C.gray400 }}>Wait for the admin to open an auction for the current draw.</Text>
                  </View>
                )}

                {/* Past auction sessions */}
                {(auctionSessions as any[]).filter((s: any) => s.status !== 'OPEN').length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8 }}>PAST AUCTIONS</Text>
                    {(auctionSessions as any[]).filter((s: any) => s.status !== 'OPEN').map((s: any, i: number) => {
                      const topBid = [...(s.bids ?? [])].sort((a: any, b: any) => b.bidAmount - a.bidAmount)[0];
                      return (
                        <View key={s.id ?? i} style={{ backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.gray200 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>Draw {s.monthNumber}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.green }}>{s.status}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: C.gray500 }}>
                            Winner: {memberMap[topBid?.memberId ?? ''] ?? '—'}{'  ·  '}
                            ₹{Number(s.wonAmount ?? topBid?.bidAmount ?? 0).toLocaleString('en-IN')}
                            {'  ·  '}{(s.bids ?? []).length} bid{(s.bids ?? []).length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}

            {/* ── INFO TAB ────────────────────────────────────────────────── */}
            {detailTab === 'info' && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {[
                  { label: 'Status', value: selected.status },
                  { label: 'Type', value: selected.chitType ?? selected.winnerSelectionMode ?? '—' },
                  { label: 'Chit Value', value: selected.chitValue != null ? `₹${Number(selected.chitValue).toLocaleString('en-IN')}` : '—' },
                  { label: 'Monthly', value: selected.installmentAmount != null ? `₹${Number(selected.installmentAmount).toLocaleString('en-IN')}` : '—' },
                  { label: 'Duration', value: (selected.durationMonths ?? selected.totalDraws) != null ? `${selected.durationMonths ?? selected.totalDraws} months` : '—' },
                  { label: 'Members', value: String(selected.memberCount ?? selected.numberOfMembers ?? '—') },
                  { label: 'Current Draw', value: String(selected.winnersAssigned ?? selected.currentDraw ?? '—') },
                  { label: 'Start Date', value: selected.startDate ? fmtDate(selected.startDate) : '—' },
                  { label: 'Description', value: selected.description ?? '—' },
                ].map(({ label, value }) => (
                  <View key={label} style={{ flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: C.gray500 }}>{label}</Text>
                    <Text style={{ flex: 2, fontSize: 13, fontWeight: '600', color: C.gray900, textAlign: 'right' }}>{value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        )}

      {/* ── Open Draw Modal ──────────────────────────────────────────────────── */}
      <ChitActionDialog visible={showOpenDraw} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDrawDialog}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>
                {isLotteryChit ? '🎲 Lottery Draw' : 'Open Draw'}
              </Text>
              {isLotteryChit && (
                <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                  {lotteryEligibleIds.length} eligible member{lotteryEligibleIds.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity accessibilityLabel="Cancel draw" onPress={closeDrawDialog}>
              <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>
          <ReadDataBoundary label="Draw inputs" queryKeys={[[ 'm-enrollments', selected?.id ], [ 'm-winners', selected?.id ], [ 'm-reservations', selected?.id ] ]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Draw Number</Text>
              <TextInput
                value={odDrawNum}
                onChangeText={setOdDrawNum}
                keyboardType="numeric"
                placeholder={String(nextDrawNum)}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900, marginBottom: 20 }}
              />

              {isLotteryChit ? (
                <>
                  {/* Payout amount from slot */}
                  {(() => {
                    const drawNum = Number(odDrawNum) || nextDrawNum;
                    const slot = (reservations as any[]).find((r: any) => r.monthNumber === drawNum && r.status !== 'VOIDED');
                    return slot?.payoutAmount ? (
                      <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>Draw #{drawNum} Payout</Text>
                        <Text style={{ fontSize: 17, fontWeight: '800', color: C.amber }}>₹{Number(slot.payoutAmount).toLocaleString('en-IN')}</Text>
                      </View>
                    ) : null;
                  })()}

                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Winner Selection</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {(['RANDOM', 'PICK'] as const).map((mode) => (
                      <TouchableOpacity key={mode} onPress={() => { setLotteryDrawMode(mode); setLotteryPickedWinnerId(''); }}
                        style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2,
                          borderColor: lotteryDrawMode === mode ? C.navy : C.gray200,
                          backgroundColor: lotteryDrawMode === mode ? '#EEF2F8' : '#fff',
                          alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, marginBottom: 4 }}>{mode === 'RANDOM' ? '🎲' : '👆'}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: lotteryDrawMode === mode ? C.navy : C.gray700 }}>
                          {mode === 'RANDOM' ? 'Random Draw' : 'Pick Winner'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {lotteryDrawMode === 'RANDOM' && (
                    <View style={{ backgroundColor: '#EEF2F8', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>
                        System will randomly pick from {lotteryEligibleIds.length} eligible member{lotteryEligibleIds.length !== 1 ? 's' : ''}.
                      </Text>
                    </View>
                  )}

                  {lotteryDrawMode === 'PICK' && (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Select Winner</Text>
                      {lotteryEligibleIds.length === 0 ? (
                        <View style={{ backgroundColor: '#FFF5F5', borderRadius: 10, padding: 12 }}>
                          <Text style={{ fontSize: 13, color: C.red, fontWeight: '600' }}>No eligible members</Text>
                          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>All enrolled members have used their spots.</Text>
                        </View>
                      ) : (
                        lotteryEligibleIds.map((mid) => {
                          const name = memberMap[mid] ?? 'Unknown';
                          const isSelected = lotteryPickedWinnerId === mid;
                          const wins = lotteryWinCounts[mid] ?? 0;
                          const spots = lotterySpotCounts[mid] ?? 1;
                          return (
                            <TouchableOpacity key={mid} onPress={() => setLotteryPickedWinnerId(mid)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: isSelected ? C.navy : C.gray100, alignItems: 'center', justifyContent: 'center', borderWidth: isSelected ? 0 : 1.5, borderColor: C.gray300 }}>
                                {isSelected && <Text style={{ fontSize: 12, color: '#fff', fontWeight: '800' }}>✓</Text>}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, color: isSelected ? C.navy : C.gray900, fontWeight: isSelected ? '700' : '400' }}>{name}</Text>
                                <Text style={{ fontSize: 11, color: C.gray400 }}>{spots} spot{spots > 1 ? 's' : ''} · {wins} win{wins !== 1 ? 's' : ''}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </>
                  )}
                </>
              ) : (
                enrolledMembers.length > 0 && (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Pre-select Winners (optional)</Text>
                    {enrolledMembers.map((m: any) => {
                      const sel = odWinnerIds.includes(m.id);
                      return (
                        <TouchableOpacity key={m.id} onPress={() => toggleWinner(m.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: sel ? C.navy : C.gray100, alignItems: 'center', justifyContent: 'center', borderWidth: sel ? 0 : 1.5, borderColor: C.gray300 }}>
                            {sel && <Text style={{ fontSize: 12, color: '#fff', fontWeight: '800' }}>✓</Text>}
                          </View>
                          <Text style={{ fontSize: 14, color: C.gray900, fontWeight: sel ? '700' : '400' }}>
                            {m.fullName ?? m.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )
              )}
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            {!!openDrawError && <Text accessibilityRole="alert" style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{openDrawError}</Text>}
            <Button
              label={isLotteryChit
                ? (lotteryDrawMode === 'PICK' && lotteryPickedWinnerId ? `Draw · ${memberMap[lotteryPickedWinnerId] ?? 'Selected'}` : `Run Lottery Draw #${odDrawNum || nextDrawNum}`)
                : (openDrawMut.isPending ? 'Opening…' : 'Open Draw')}
              onPress={() => openDrawMut.mutate()}
              loading={openDrawMut.isPending}
              disabled={openDrawMut.isPending || (isLotteryChit && lotteryDrawMode === 'PICK' && !lotteryPickedWinnerId) || (isLotteryChit && lotteryEligibleIds.length === 0)}
            />
          </View>
          </ReadDataBoundary>
        </SafeAreaView>
      </ChitActionDialog>

      {/* ── Skip Draw Modal ──────────────────────────────────────────────────── */}
      <ChitActionDialog visible={showSkip} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowSkip(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Skip Draw #{skipTarget?.drawNumber}</Text>
            <TouchableOpacity onPress={() => setShowSkip(false)}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason</Text>
              <TextInput
                value={skipReason}
                onChangeText={setSkipReason}
                placeholder="Reason for skipping…"
                multiline numberOfLines={3}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 80 }}
              />
              <Text style={{ fontSize: 12, color: C.amber, marginTop: 10 }}>
                This marks draw #{skipTarget?.drawNumber} as SKIPPED for all enrolled members.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label={skipDrawMut.isPending ? 'Skipping…' : 'Confirm Skip'} variant="danger" onPress={() => skipDrawMut.mutate()} loading={skipDrawMut.isPending} />
          </View>
        </SafeAreaView>
      </ChitActionDialog>

      {/* ── Collect Payment Modal ────────────────────────────────────────────── */}
      <ChitActionDialog visible={showCollect} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCollect(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Collect Payment</Text>
            <TouchableOpacity onPress={() => setShowCollect(false)}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>Member</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>{memberMap[collectMemberId] ?? collectMemberId}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Amount (₹)</Text>
                <TextInput
                  value={collectAmount} onChangeText={setCollectAmount}
                  keyboardType="numeric" placeholder={String(selected?.installmentAmount ?? '')}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900 }}
                />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Payment Mode</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['CASH', 'UPI', 'BANK_TRANSFER'].map((m) => (
                    <TouchableOpacity key={m} onPress={() => setCollectMode(m)}
                      style={{ flex: 1, backgroundColor: collectMode === m ? C.navy : C.gray100, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: collectMode === m ? '#fff' : C.gray700 }}>
                        {m === 'BANK_TRANSFER' ? 'Bank' : m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label={collectMut.isPending ? 'Recording…' : 'Record Payment'} onPress={() => collectMut.mutate()} loading={collectMut.isPending} disabled={!collectAmount || !collectMemberId} />
          </View>
        </SafeAreaView>
      </ChitActionDialog>

      {/* ── Create Payout Modal ──────────────────────────────────────────────── */}
      <ChitActionDialog visible={showPayout} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowPayout(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Create Payout</Text>
            <TouchableOpacity onPress={() => setShowPayout(false)}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>Winner</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>
                  {memberMap[payoutWinner?.memberId ?? payoutWinner?.winnerId] ?? '—'} · Draw #{payoutWinner?.monthNumber ?? payoutWinner?.drawNumber}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Recorded Winner Amount</Text>
                <TextInput
                  value={payoutAmount} editable={false}
                  keyboardType="numeric" placeholder={String(selected?.chitValue ?? '')}
                  style={{ borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.gray50, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900 }}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label={payoutMut.isPending ? 'Creating…' : 'Create Payout'} onPress={() => payoutMut.mutate()} loading={payoutMut.isPending} disabled={!payoutAmount} />
          </View>
        </SafeAreaView>
      </ChitActionDialog>

      {/* ── Disburse Payout Modal ────────────────────────────────────────────── */}
      <ChitActionDialog visible={showDisburse} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowDisburse(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Disburse Payout</Text>
            <TouchableOpacity onPress={() => setShowDisburse(false)}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>Recipient</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>
                  {memberMap[disbursePay?.memberId ?? disbursePay?.winnerId] ?? '—'}
                </Text>
                <Amount value={disbursePay?.netPayoutAmount ?? disbursePay?.winningAmount ?? 0} size="lg" color={C.gold} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Actual Amount (₹)</Text>
                <TextInput
                  value={disburseAmount} onChangeText={setDisburseAmount}
                  keyboardType="numeric" placeholder={String(disbursePay?.netPayoutAmount ?? '')}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900 }}
                />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Mode</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['CASH', 'UPI', 'BANK_TRANSFER'].map((m) => (
                    <TouchableOpacity key={m} onPress={() => setDisburseMode(m)}
                      style={{ flex: 1, backgroundColor: disburseMode === m ? C.navy : C.gray100, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: disburseMode === m ? '#fff' : C.gray700 }}>
                        {m === 'BANK_TRANSFER' ? 'Bank' : m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label={disburseMut.isPending ? 'Disbursing…' : 'Confirm Disburse'} onPress={() => disburseMut.mutate()} loading={disburseMut.isPending} />
          </View>
        </SafeAreaView>
      </ChitActionDialog>
        </ChitDialogHost>
      </Modal>
      </ReadDataBoundary>
    </SafeAreaView>
  );
}
