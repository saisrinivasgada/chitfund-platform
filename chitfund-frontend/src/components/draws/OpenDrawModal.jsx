import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  openDraw, recordWinner, markSlotProcessed, updateReservationSlot,
  getEnrollments, getReservations, getMembers, getMemberBalanceBulk, listStaff, getDrawPayments, getWinners,
} from '../../services/api';
import { useToastContext } from '../layout/AppLayout';
import Button from '../ui/Button';
import FormField, { Select, DateInput } from '../ui/FormField';
import {
  Trophy, Building2, X, Plus, AlertCircle, Phone, CheckCircle, ChevronDown, Info, Shuffle,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
export function computeDefaultDueDate(startDateStr, cycleNum, monthlyDueDate) {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length < 3) return '';
  const [y, m, d] = parts;
  // Use chit's configured due-day of month; fall back to start date's day
  const dueDay = (monthlyDueDate && monthlyDueDate >= 1 && monthlyDueDate <= 28) ? monthlyDueDate : d;
  const targetMonth = m - 1 + (cycleNum - 1);
  const targetYear  = y + Math.floor(targetMonth / 12);
  const targetMon   = targetMonth % 12;
  const lastDay     = new Date(targetYear, targetMon + 1, 0).getDate();
  const day         = Math.min(dueDay, lastDay);
  return `${targetYear}-${String(targetMon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatMonthLabel(dateStr, fallbackMonth) {
  if (!dateStr) return fallbackMonth != null ? `Draw ${fallbackMonth}` : '—';
  const parts = dateStr.substring(0, 7).split('-');
  if (parts.length < 2) return '—';
  const [year, month] = parts.map(Number);
  if (!year || !month) return '—';
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function SlotPickerDropdown({ slots, value, onChange, disabled, placeholder = 'Select slot…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const selected = slots.find((s) => s.id === value);
  const label = (s) => `Slot #${s.monthNumber} (${formatMonthLabel(s.reservationMonth, s.monthNumber)})`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full text-left text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] disabled:opacity-50 flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? label(selected) : placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-52">
          {slots.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-400 italic">No available slots</p>
          ) : slots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 hover:bg-gray-50 ${
                s.id === value ? 'bg-[#EEF2F8] text-[#1E3A5F] font-medium' : 'text-gray-800'
              }`}
            >
              <span className="font-medium">Slot #{s.monthNumber}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatMonthLabel(s.reservationMonth, s.monthNumber)}
                {s.payoutAmount ? ` · ₹${Number(s.payoutAmount).toLocaleString()}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── OpenDrawModal ────────────────────────────────────────────────────────────
export default function OpenDrawModal({ chitId, chit, draws, onClose }) {
  const nextCycleNum = draws.length > 0 ? Math.max(...draws.map((c) => c.monthNumber)) + 1 : 1;

  const qc = useQueryClient();
  const toast = useToastContext();
  const [step, setStep] = useState(1);
  const [dueDate, setDueDate] = useState(() => computeDefaultDueDate(chit?.startDate, nextCycleNum, chit?.monthlyDueDate));
  const [additionalWinners, setAdditionalWinners] = useState([]);
  const [preview, setPreview] = useState(null);

  const isLottery = (chit?.winnerSelectionMode ?? chit?.chitType) === 'LOTTERY';
  const [lotteryMode, setLotteryMode] = useState('RANDOM');
  const [pickedWinnerId, setPickedWinnerId] = useState('');

  const addWinner    = () => setAdditionalWinners((prev) => [...prev, { id: Date.now(), memberId: '', slotId: '' }]);
  const removeWinner = (id) => setAdditionalWinners((prev) => prev.filter((w) => w.id !== id));
  const updateWinner = (id, updates) => setAdditionalWinners((prev) => prev.map((w) => w.id === id ? { ...w, ...updates } : w));

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: staffListDraw = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const { data: pastWinners = [] } = useQuery({
    queryKey: ['winners', chitId],
    queryFn: () => getWinners(chitId),
    enabled: isLottery,
  });
  const memberMap = Object.fromEntries([
    ...staffListDraw.map((s) => [String(s.id), { id: s.id, fullName: `${s.fullName ?? s.username} (Admin)`, phone: null }]),
    ...allMembers.map((m) => [m.id, m]),
  ]);
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  // Lottery: compute eligible members (spots > wins so far)
  const lotteryEligible = isLottery ? (() => {
    const winCounts = {};
    pastWinners.forEach((w) => {
      const mid = String(w.memberId);
      winCounts[mid] = (winCounts[mid] ?? 0) + 1;
    });
    const spotCounts = {};
    enrollments.forEach((e) => {
      const mid = String(e.memberId ?? e.id);
      spotCounts[mid] = (spotCounts[mid] ?? 0) + 1;
    });
    return Object.entries(spotCounts)
      .filter(([mid, spots]) => (winCounts[mid] ?? 0) < spots)
      .map(([mid]) => mid);
  })() : [];

  const baseInstallment   = Number(chit.installmentAmount ?? (chit.chitValue / chit.capacity) ?? 0);
  const defaultPostPayout = Number(chit.defaultPostPayoutContribution ?? baseInstallment);

  const enrolledMemberIds = [...new Set(enrollments.map((e) => e.memberId ?? e.id))];
  const enrolledSet = new Set(enrolledMemberIds.map(String));
  // Members who have a slot reservation but no formal enrollment (e.g., added after chit start)
  const reservationOnlyMemberIds = [...new Set(
    reservations
      .filter((r) => r.memberId && !r.orgHeld && r.status !== 'VOIDED')
      .map((r) => String(r.memberId))
  )].filter((mid) => !enrolledSet.has(mid));
  const allParticipantIds = [...enrolledMemberIds.map(String), ...reservationOnlyMemberIds];

  const { data: balanceMap = {} } = useQuery({
    queryKey: ['balances', chitId, allParticipantIds.join(',')],
    queryFn: () => getMemberBalanceBulk(allParticipantIds),
    enabled: allParticipantIds.length > 0,
  });

  // Fetch the most recent real draw's payment records to detect late-member already charged
  const lastRealDraw = [...draws]
    .filter((d) => d.status !== 'SKIPPED')
    .sort((a, b) => b.monthNumber - a.monthNumber)[0] ?? null;
  const { data: lastDrawPayments = [] } = useQuery({
    queryKey: ['draw-payments', lastRealDraw?.id],
    queryFn: () => getDrawPayments(lastRealDraw.id),
    enabled: !!lastRealDraw && reservationOnlyMemberIds.length > 0,
  });
  const membersInLastDraw = new Set(lastDrawPayments.map((p) => String(p.memberId)));

  const primaryWinnerSlot = [...reservations]
    .filter((r) => r.status === 'RESERVED')
    .sort((a, b) => (a.monthNumber ?? 999) - (b.monthNumber ?? 999))[0] ?? null;
  const isOrgDraw = primaryWinnerSlot?.orgHeld === true;
  const cyclePayoutAmount = primaryWinnerSlot?.payoutAmount ? Number(primaryWinnerSlot.payoutAmount) : null;

  const activeMemberIds = new Set([
    ...activeMembers.map((m) => String(m.id)),
    ...staffListDraw.map((s) => String(s.id)),
  ]);
  // Members eligible as additional winners: must have at least one RESERVED slot
  // (a member may have settled slots + reserved slots — only the reserved ones qualify)
  // Primary winner is excluded unless they hold more than one reserved slot.
  const extraCandidates = [...new Set([
    ...enrolledMemberIds.map(String),
    ...reservationOnlyMemberIds,
  ])].filter((mid) => {
    if (!activeMemberIds.has(mid)) return false;
    const memberReserved = reservations.filter((r) => String(r.memberId) === mid && r.status === 'RESERVED');
    if (mid === String(primaryWinnerSlot?.memberId)) return memberReserved.length > 1;
    return memberReserved.length > 0;
  });

  function computePreview() {
    if (isLottery) {
      const winCounts = {};
      pastWinners.forEach((w) => { winCounts[String(w.memberId)] = (winCounts[String(w.memberId)] ?? 0) + 1; });
      const spotCounts = {};
      enrollments.forEach((e) => { const mid = String(e.memberId ?? e.id); spotCounts[mid] = (spotCounts[mid] ?? 0) + 1; });

      // Payout amount from pre-configured slot
      const lotterySlot = reservations.find((r) => r.monthNumber === nextCycleNum && r.status !== 'VOIDED');
      const slotPayoutAmount = lotterySlot?.payoutAmount
        ? Number(lotterySlot.payoutAmount)
        : Number(chit?.chitValue ?? 0);

      const seen = new Set();
      const members = [];
      for (const e of enrollments) {
        const mid = String(e.memberId ?? e.id);
        if (seen.has(mid)) continue;
        seen.add(mid);
        const winsCount = winCounts[mid] ?? 0;
        const spotsCount = spotCounts[mid] ?? 1;
        const isEligible = winsCount < spotsCount;
        const isWinner = lotteryMode === 'PICK' && mid === String(pickedWinnerId);
        const effectivePostPayout = chit.postPayoutContributionEnabled ? defaultPostPayout : baseInstallment;
        const amountDue = winsCount * effectivePostPayout + (spotsCount - winsCount) * baseInstallment;
        const previousBalance = Number(balanceMap[mid] ?? 0);
        members.push({
          memberId: mid,
          memberName: memberMap[mid]?.fullName ?? `Member #${mid}`,
          phone: memberMap[mid]?.phone ?? null,
          isDiscontinued: memberMap[mid]?.status === 'INACTIVE',
          previousBalance,
          amountDue,
          isWinner,
          isPrimary: isWinner,
          isExtra: false,
          winCount: isWinner ? 1 : 0,
          isLotteryEligible: isEligible,
          winsCount,
          netPayout: isWinner ? slotPayoutAmount - amountDue : null,
          reservedSlotNums: [],
          processedSlotNums: [],
        });
      }
      setPreview({ cycleNum: nextCycleNum, members, isLottery: true, lotteryMode, slotPayoutAmount });
      setStep(2);
      return;
    }

    const seen = new Set();
    const members = [];
    // Draws that happened before this one (skipped don't generate installments)
    const pastRealDrawCount = draws.filter((d) => d.status !== 'SKIPPED').length;
    for (const e of enrollments) {
      const mid = e.memberId ?? e.id;
      if (seen.has(mid)) continue;
      seen.add(mid);

      const memberSlots    = reservations.filter((r) => r.memberId === mid);
      const processedSlots = memberSlots.filter((r) => r.status === 'PROCESSED');
      const reservedSlots  = memberSlots.filter((r) => r.status === 'RESERVED');

      const processedAmt = processedSlots.reduce(
        (s, sl) => s + Number(sl.postPayoutContribution ?? defaultPostPayout), 0
      );
      const amountDue = processedAmt + reservedSlots.length * baseInstallment;

      const previousBalance = Number(balanceMap[mid] ?? 0);
      const isPrimary  = String(mid) === String(primaryWinnerSlot?.memberId);
      const extraCount = additionalWinners.filter((w) => w.memberId && String(w.memberId) === String(mid)).length;
      const isExtra    = extraCount > 0;
      const isWinner   = isPrimary || isExtra;
      const winCount   = (isPrimary ? 1 : 0) + extraCount;
      const netPayout  = isWinner && cyclePayoutAmount !== null
        ? winCount * cyclePayoutAmount - amountDue
        : null;

      members.push({
        memberId: mid,
        memberName:       memberMap[mid]?.fullName ?? `Member #${mid}`,
        phone:            memberMap[mid]?.phone ?? null,
        isDiscontinued:   memberMap[mid]?.status === 'INACTIVE',
        previousBalance,
        processedCount:   processedSlots.length,
        reservedCount:    reservedSlots.length,
        reservedSlotNums: reservedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        processedSlotNums: processedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        amountDue,
        isWinner, isPrimary, isExtra, winCount,
        netPayout,
      });
    }
    // Members with a reservation but no enrollment (late-added participants)
    for (const mid of reservationOnlyMemberIds) {
      if (seen.has(mid)) continue;
      seen.add(mid);

      const memberSlots    = reservations.filter((r) => String(r.memberId) === mid);
      const processedSlots = memberSlots.filter((r) => r.status === 'PROCESSED');
      const reservedSlots  = memberSlots.filter((r) => r.status === 'RESERVED');

      const processedAmt = processedSlots.reduce(
        (s, sl) => s + Number(sl.postPayoutContribution ?? defaultPostPayout), 0
      );
      // Late-added members owe installments for every real draw before they joined,
      // multiplied by the number of slots they hold (each slot = one installment per draw).
      // If they already appeared in the last draw's payment records, they were charged
      // their backlog then — don't charge again.
      const totalSlots = reservedSlots.length + processedSlots.length;
      const alreadyInSystem = membersInLastDraw.has(mid);
      const backdateCount = alreadyInSystem ? 0 : pastRealDrawCount;
      const amountDue = processedAmt + reservedSlots.length * baseInstallment + backdateCount * totalSlots * baseInstallment;

      const previousBalance = Number(balanceMap[mid] ?? 0);
      const isPrimary  = String(mid) === String(primaryWinnerSlot?.memberId);
      const extraCount = additionalWinners.filter((w) => w.memberId && String(w.memberId) === mid).length;
      const isExtra    = extraCount > 0;
      const isWinner   = isPrimary || isExtra;
      const winCount   = (isPrimary ? 1 : 0) + extraCount;
      const netPayout  = isWinner && cyclePayoutAmount !== null
        ? winCount * cyclePayoutAmount - amountDue
        : null;

      members.push({
        memberId: mid,
        memberName:        memberMap[mid]?.fullName ?? `Member #${mid.slice(0, 8)}`,
        phone:             memberMap[mid]?.phone ?? null,
        isDiscontinued:    memberMap[mid]?.status === 'INACTIVE',
        previousBalance,
        processedCount:    processedSlots.length,
        reservedCount:     reservedSlots.length,
        reservedSlotNums:  reservedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        processedSlotNums: processedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        amountDue,
        backdateCount,
        isWinner, isPrimary, isExtra, winCount,
        netPayout,
      });
    }

    const orgSlots = reservations.filter((r) => r.orgHeld && r.status === 'RESERVED');
    for (const slot of orgSlots) {
      members.push({
        memberId: `org_${slot.id}`,
        memberName: 'Organization',
        phone: null,
        isOrg: true,
        previousBalance: 0,
        processedCount: 0,
        reservedCount: 1,
        reservedSlotNums: [slot.monthNumber].filter(Boolean),
        processedSlotNums: [],
        amountDue: baseInstallment,
        isWinner: false,
        isPrimary: slot.id === primaryWinnerSlot?.id,
        isExtra: false,
        winCount: 0,
        netPayout: null,
      });
    }

    setPreview({ cycleNum: nextCycleNum, members });
    setStep(2);
  }

  const slotsToProcess = [
    ...(primaryWinnerSlot ? [primaryWinnerSlot.id] : []),
    ...additionalWinners.filter((w) => w.slotId).map((w) => w.slotId),
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      if (isLottery) {
        // Find the pre-configured slot for this draw (UNALLOCATED, set up in Schedule tab)
        const lotterySlot = reservations.find(
          (r) => r.monthNumber === nextCycleNum && r.status !== 'VOIDED'
        );
        const winningAmount = lotterySlot?.payoutAmount
          ? Number(lotterySlot.payoutAmount)
          : Number(chit?.chitValue ?? chit?.totalAmount ?? 0);

        await openDraw({
          chitId,
          monthNumber: nextCycleNum,
          dueDate,
          installmentAmount: baseInstallment,
          maxCycles: chit?.capacity ?? nextCycleNum,
          members: preview.members.map((m) => ({ memberId: m.memberId, amountDue: m.amountDue })),
        });

        const winnerRecord = await recordWinner({
          chitId,
          ...(lotteryMode === 'PICK' && pickedWinnerId ? { winnerId: pickedWinnerId } : {}),
          monthNumber: nextCycleNum,
          winningAmount,
          discountAmount: 0,
        });

        // Update the slot: assign winner + mark PROCESSED
        if (lotterySlot && winnerRecord?.memberId) {
          await updateReservationSlot({
            chitId,
            reservationId: lotterySlot.id,
            reservationMonth: lotterySlot.reservationMonth,
            memberId: winnerRecord.memberId,
            orgHeld: false,
            payoutAmount: lotterySlot.payoutAmount ?? null,
            postPayoutContribution: lotterySlot.postPayoutContribution ?? null,
          });
          await markSlotProcessed({ chitId, reservationId: lotterySlot.id }).catch(() => {});
        }
        return;
      }
      const isAuctionDraw = (chit?.winnerSelectionMode ?? chit?.chitType) === 'AUCTION';
      await openDraw({
        chitId,
        monthNumber: nextCycleNum,
        dueDate,
        installmentAmount: baseInstallment,
        maxCycles: chit?.capacity ?? nextCycleNum,
        auctionMode: isAuctionDraw ? (chit?.auctionMode ?? 'OFFLINE') : undefined,
        members: preview.members.filter((m) => !m.isOrg).map((m) => ({ memberId: m.memberId, amountDue: m.amountDue })),
      });

      if (slotsToProcess.length > 0) {
        await Promise.all(slotsToProcess.map((sid) => markSlotProcessed({ chitId, reservationId: sid }).catch(() => {})));
      }

      const primaryAmt = Number(primaryWinnerSlot?.payoutAmount ?? chit?.chitValue ?? 0);
      const winsByMember = {};
      if (primaryWinnerSlot && !primaryWinnerSlot.orgHeld) {
        const mid = String(primaryWinnerSlot.memberId);
        winsByMember[mid] = (winsByMember[mid] ?? 0) + 1;
      }
      for (const aw of additionalWinners) {
        if (aw.memberId) {
          winsByMember[String(aw.memberId)] = (winsByMember[String(aw.memberId)] ?? 0) + 1;
        }
      }
      const winnersToRecord = Object.entries(winsByMember).map(([memberId, count]) => ({
        memberId,
        winningAmount: count * primaryAmt,
      }));
      await Promise.all(
        winnersToRecord.map(({ memberId, winningAmount }) =>
          recordWinner({
            chitId,
            winnerId: memberId,
            monthNumber: nextCycleNum,
            winningAmount,
            discountAmount: 0,
          }).catch(() => {})
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      qc.invalidateQueries({ queryKey: ['winners', chitId] });
      toast.success(`Draw ${nextCycleNum} opened`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to open draw'),
  });

  const completedDraws = draws.filter((d) => d.status !== 'SKIPPED').length;
  const skippedCount   = draws.filter((d) => d.status === 'SKIPPED').length;

  const totalCollection = preview?.members.reduce((s, m) => s + m.amountDue, 0) ?? 0;

  const winnerName = primaryWinnerSlot
    ? (isOrgDraw ? null : (memberMap[primaryWinnerSlot.memberId]?.fullName ?? 'Unknown'))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-8 lg:p-10">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl sm:shadow-2xl overflow-hidden flex flex-col sm:flex-row max-h-[90vh] sm:max-h-[82vh]">

        {/* ── Left panel — navy context sidebar ── */}
        <div
          className="flex-shrink-0 sm:w-52 flex flex-col overflow-y-auto"
          style={{ background: 'linear-gradient(160deg, #162D49 0%, #1E3A5F 60%, #243F6A 100%)', padding: '16px 20px', gap: 14, display: 'flex', flexDirection: 'column' }}
        >
          {/* Mobile: single compact row showing draw number + winner */}
          <div className="flex sm:flex-col sm:gap-0 items-center sm:items-start gap-3">
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-0.5">Opening</p>
              <p className="text-2xl sm:text-3xl font-black text-white leading-none" style={{ fontFamily: 'Merriweather, serif' }}>
                Draw #{nextCycleNum}
              </p>
              <p className="text-xs text-white/50 mt-0.5 hidden sm:block">{chit?.name}</p>
            </div>
            {/* Winner pill — visible on mobile inline, hidden on desktop (shown in own block below) */}
            {isLottery ? (
              <div className="sm:hidden ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(212,160,23,0.2)' }}>
                <Shuffle size={11} style={{ color: '#D4A017' }} />
                <span className="text-xs font-semibold" style={{ color: '#D4A017' }}>
                  {lotteryMode === 'PICK' && pickedWinnerId ? (memberMap[pickedWinnerId]?.fullName ?? 'Selected') : 'Lottery'}
                </span>
              </div>
            ) : (winnerName || isOrgDraw) && (
              <div className="sm:hidden ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(212,160,23,0.2)' }}>
                {isOrgDraw ? <Building2 size={11} style={{ color: '#D4A017' }} /> : <Trophy size={11} style={{ color: '#D4A017' }} />}
                <span className="text-xs font-semibold" style={{ color: '#D4A017' }}>{isOrgDraw ? 'Org' : winnerName}</span>
              </div>
            )}
          </div>

          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 mb-2">
              {isLottery ? <Shuffle size={12} style={{ color: '#D4A017' }} /> : <Trophy size={12} style={{ color: '#D4A017' }} />}
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
                {isLottery ? 'Lottery' : isOrgDraw ? 'This Draw' : 'Winner'}
              </p>
            </div>
            {isLottery ? (
              <>
                {lotteryMode === 'PICK' && pickedWinnerId ? (
                  <>
                    <p className="text-sm font-bold text-white leading-snug">{memberMap[pickedWinnerId]?.fullName ?? 'Selected'}</p>
                    <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(212,160,23,0.2)', color: '#D4A017' }}>
                      Admin selected
                    </span>
                    <p className="text-xs text-white/30 mt-1.5">{lotteryEligible.length} eligible</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white/60">
                      {lotteryMode === 'RANDOM' ? 'Drawn at random' : 'Pick a winner →'}
                    </p>
                    <p className="text-xs text-white/30 mt-1">{lotteryEligible.length} eligible</p>
                  </>
                )}
                {(() => {
                  const s = reservations.find((r) => r.monthNumber === nextCycleNum && r.status !== 'VOIDED');
                  return s?.payoutAmount ? (
                    <p className="text-base font-black mt-2" style={{ color: '#D4A017' }}>
                      ₹{Number(s.payoutAmount).toLocaleString()}
                    </p>
                  ) : null;
                })()}
              </>
            ) : isOrgDraw ? (
              <div>
                <div className="flex items-center gap-1.5">
                  <Building2 size={14} style={{ color: '#D4A017' }} />
                  <p className="text-sm font-bold text-white leading-snug">Organization</p>
                </div>
                <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212,160,23,0.2)', color: '#D4A017' }}>
                  Org-held slot · no payout
                </span>
              </div>
            ) : winnerName ? (
              <>
                <p className="text-sm font-bold text-white leading-snug">{winnerName}</p>
                {cyclePayoutAmount && (
                  <p className="text-base font-black mt-1" style={{ color: '#D4A017' }}>
                    ₹{cyclePayoutAmount.toLocaleString()}
                  </p>
                )}
                {additionalWinners.filter((w) => w.memberId).map((w) => (
                  <div key={w.id} className="mt-2 rounded-lg px-3 py-2" style={{ background: 'rgba(212,160,23,0.15)' }}>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">
                      {String(w.memberId) === String(primaryWinnerSlot?.memberId) ? 'Double Payout' : 'Also paying'}
                    </p>
                    <p className="text-xs font-semibold text-white/80">{memberMap[w.memberId]?.fullName ?? '—'}</p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-white/40 italic">No winner scheduled</p>
            )}
          </div>

          <div className="hidden sm:block">
            <div className="h-px bg-white/10 mb-3" />

            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Progress</p>
              <div className="flex items-end gap-1.5">
                <span className="text-2xl font-black text-white">{completedDraws}</span>
                <span className="text-sm text-white/40 mb-0.5">/ {chit?.capacity ?? '?'}</span>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">draws done</p>
              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: chit?.capacity ? `${Math.min(100, (completedDraws / chit.capacity) * 100)}%` : '0%',
                    background: 'linear-gradient(90deg, #D4A017, #F59E0B)',
                  }}
                />
              </div>
              {skippedCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <span className="text-[10px] font-semibold" style={{ color: '#F59E0B' }}>{skippedCount} skipped</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              {[1, 2].map((s) => (
                <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-5 bg-white' : 'w-1.5 bg-white/25'}`} />
              ))}
              <span className="text-[10px] text-white/30 ml-1">{step === 1 ? 'Configure' : 'Preview'}</span>
            </div>
          </div>
        </div>

        {/* ── Right panel — white form / preview ── */}
        <div className="flex-1 bg-white flex flex-col min-h-0">

          <div className="flex items-center justify-between border-b border-gray-100 flex-shrink-0" style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 20, paddingBottom: 16 }}>
            <div>
              <h3 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                {step === 1 ? 'Configure Draw' : 'Preview & Confirm'}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 1 ? 'Set the due date for this cycle' : `${preview?.members.filter((m) => !m.isOrg).length ?? 0} members · ₹${totalCollection.toLocaleString()} total`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 20, paddingBottom: 20 }}>

            {step === 1 ? (
              <form id="open-draw-form" onSubmit={(e) => { e.preventDefault(); computePreview(); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                <FormField label="Payment Due Date" required>
                  <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </FormField>

                {isLottery && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Winner Selection</p>
                      <div className="flex gap-2">
                        {[
                          { val: 'RANDOM', label: 'Random Draw', icon: Shuffle, desc: 'System picks randomly' },
                          { val: 'PICK', label: 'Pick Winner', icon: Trophy, desc: 'Admin selects manually' },
                        ].map(({ val, label, icon: Icon, desc }) => (
                          <button key={val} type="button"
                            onClick={() => { setLotteryMode(val); setPickedWinnerId(''); }}
                            className={`flex-1 flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border transition-all ${
                              lotteryMode === val
                                ? 'border-[#1E3A5F] bg-[#EEF2F8] text-[#1E3A5F]'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}>
                            <Icon size={14} className="mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-semibold text-xs">{label}</p>
                              <p className="text-[11px] mt-0.5 opacity-70">{desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {lotteryMode === 'PICK' && (
                      <FormField label="Select Winner" required>
                        <Select value={pickedWinnerId} onChange={(e) => setPickedWinnerId(e.target.value)} required>
                          <option value="">Choose from eligible members…</option>
                          {lotteryEligible
                            .sort((a, b) => (memberMap[a]?.fullName ?? '').localeCompare(memberMap[b]?.fullName ?? ''))
                            .map((mid) => (
                              <option key={mid} value={mid}>{memberMap[mid]?.fullName ?? `Member #${mid}`}</option>
                            ))}
                        </Select>
                      </FormField>
                    )}
                    {lotteryEligible.length === 0 && (
                      <div className="flex items-start gap-2 text-xs text-red-500 bg-red-50 rounded-xl px-4 py-3">
                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                        <span>All members have already won their allocated draws. No eligible members remain.</span>
                      </div>
                    )}
                  </>
                )}

                {!isLottery && cyclePayoutAmount && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {additionalWinners.map((aw, idx) => {
                      const usedSlotIds = new Set(additionalWinners.filter((_, i) => i < idx).map((w) => w.slotId).filter(Boolean));
                      const awSlots = aw.memberId
                        ? reservations.filter((r) =>
                            String(r.memberId) === String(aw.memberId) &&
                            r.status === 'RESERVED' &&
                            r.id !== primaryWinnerSlot?.id &&
                            !usedSlotIds.has(r.id)
                          )
                        : [];
                      return (
                        <div key={aw.id} className="rounded-xl border border-[#1E3A5F]/20 bg-[#F0F4FA]">
                          <div className="flex items-center justify-between border-b border-[#1E3A5F]/10" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12 }}>
                            <p className="text-sm font-semibold text-gray-800">Additional Winner {idx + 1}</p>
                            <button type="button" onClick={() => removeWinner(aw.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 16 }}>
                            <FormField label="Member">
                              <Select value={aw.memberId}
                                onChange={(e) => updateWinner(aw.id, { memberId: e.target.value, slotId: '' })}>
                                <option value="">Select member…</option>
                                {[...extraCandidates].sort((a, b) =>
                                  (memberMap[a]?.fullName ?? '').localeCompare(memberMap[b]?.fullName ?? '')
                                ).map((mid) => (
                                  <option key={mid} value={mid}>{memberMap[mid]?.fullName ?? `Member #${mid}`}</option>
                                ))}
                              </Select>
                            </FormField>
                            <FormField label="Slot to settle (optional)">
                              <SlotPickerDropdown slots={awSlots} value={aw.slotId}
                                onChange={(v) => updateWinner(aw.id, { slotId: v })}
                                disabled={!aw.memberId} placeholder={awSlots.length === 0 ? 'No reserved slots' : 'Select slot…'} />
                            </FormField>
                          </div>
                        </div>
                      );
                    })}

                    {extraCandidates.length > 0 && (
                      <button type="button" onClick={addWinner}
                        className="flex items-center gap-2 text-sm text-[#1E3A5F] hover:text-[#0f2540] font-semibold transition-colors">
                        <Plus size={14} /> Add another member
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>Members will be notified to submit payment by the due date. Winner receives payout upon cycle close.</span>
                </div>

              </form>
            ) : (
              <div className="space-y-4">

                <div className={`grid gap-3 ${preview.members.some((m) => m.isOrg) ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {[
                    { label: 'Due Date', value: (() => { const [y,m,d] = dueDate.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); })() },
                    { label: 'Members', value: preview.members.filter((m) => !m.isOrg).length },
                    ...(preview.members.some((m) => m.isOrg)
                      ? [{ label: 'Org Held', value: preview.members.filter((m) => m.isOrg).length, orgBox: true }]
                      : []),
                    { label: 'Total', value: `₹${totalCollection.toLocaleString()}` },
                  ].map(({ label, value, orgBox }) => (
                    <div key={label} className={`rounded-xl border px-3 py-2.5 text-center ${orgBox ? 'bg-[#EEF2F8] border-[#1E3A5F]/20' : 'bg-gray-50 border-gray-100'}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${orgBox ? 'text-[#1E3A5F]/60' : 'text-gray-400'}`}>{label}</p>
                      <p className={`text-sm font-bold mt-0.5 ${orgBox ? 'text-[#1E3A5F]' : 'text-gray-900'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-y-auto max-h-64">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">This Draw</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Net Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {preview.members.map((m) => (
                          <tr key={m.memberId}
                            className={`transition-colors ${m.isDiscontinued ? 'opacity-50' : ''} ${m.isOrg ? 'bg-[#EEF2F8]/40' : m.isPrimary ? 'bg-amber-50/70' : m.isExtra ? 'bg-[#EEF2F8]/60' : 'bg-white hover:bg-gray-50/60'}`}>
                            <td className={`py-2.5 pl-4 pr-3 ${m.isOrg && m.isPrimary ? 'border-l-2 border-[#1E3A5F]' : (m.isPrimary || m.isExtra) ? 'border-l-2' : ''}`}
                              style={(!m.isOrg && (m.isPrimary || m.isExtra)) ? { borderLeftColor: m.isPrimary ? '#D97706' : '#1E3A5F' } : {}}>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {m.isOrg
                                    ? <span className="flex items-center gap-1 font-semibold text-[#1E3A5F] text-sm"><Building2 size={12} /> {m.memberName}</span>
                                    : <span className={`font-semibold text-sm ${m.isDiscontinued ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{m.memberName}</span>}
                                  {m.isDiscontinued && (
                                    <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
                                      Discontinued
                                    </span>
                                  )}
                                  {m.isOrg && m.isPrimary && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-[#EEF2F8] text-[#1E3A5F] px-1.5 py-0.5 rounded-full font-semibold">
                                      <Building2 size={8} /> This draw's slot
                                    </span>
                                  )}
                                  {!m.isOrg && m.isPrimary && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                                      <Trophy size={8} /> Winner
                                    </span>
                                  )}
                                  {m.isExtra && (
                                    <span className="text-[10px] bg-[#EEF2F8] text-[#1E3A5F] px-1.5 py-0.5 rounded-full font-semibold">
                                      {m.winCount > 1 ? `×${m.winCount} Payout` : 'Extra'}
                                    </span>
                                  )}
                                  {preview?.isLottery && m.isLotteryEligible && !m.isWinner && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-[#EEF2F8] text-[#1E3A5F] px-1.5 py-0.5 rounded-full font-semibold">
                                      <Shuffle size={8} /> Eligible
                                    </span>
                                  )}
                                  {preview?.isLottery && !m.isLotteryEligible && (
                                    <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-semibold">
                                      Already won
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {m.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={9} />{m.phone}</span>}
                                  {m.backdateCount > 0 && (
                                    <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-md font-semibold">
                                      {m.backdateCount} missed draw{m.backdateCount > 1 ? 's' : ''} included
                                    </span>
                                  )}
                                  {m.previousBalance > 0 && (
                                    <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-1.5 py-0.5 rounded-md">
                                      +₹{m.previousBalance.toLocaleString()} owed
                                    </span>
                                  )}
                                  {m.previousBalance < 0 && (
                                    <span className="text-[10px] bg-green-50 text-green-600 border border-green-100 px-1.5 py-0.5 rounded-md">
                                      ₹{Math.abs(m.previousBalance).toLocaleString()} credit
                                    </span>
                                  )}
                                </div>
                                {(m.reservedSlotNums?.length > 0 || m.processedSlotNums?.length > 0) && (
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {m.reservedSlotNums?.map((n) => (
                                      <span key={n} className="text-[10px] font-semibold bg-[#EEF2F8] text-[#1E3A5F] px-1.5 py-0.5 rounded-md">
                                        Slot #{n}
                                      </span>
                                    ))}
                                    {m.processedSlotNums?.map((n) => (
                                      <span key={n} className="text-[10px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-md line-through">
                                        Slot #{n}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              {m.backdateCount > 0 ? (() => {
                                const totalSlots = (m.reservedSlotNums?.length ?? 0) + (m.processedSlotNums?.length ?? 0);
                                const backlogPerDraw = totalSlots * baseInstallment;
                                const backlogTotal   = m.backdateCount * backlogPerDraw;
                                const currentDraw    = (m.reservedSlotNums?.length ?? 0) * baseInstallment;
                                return (
                                  <div className="relative inline-flex items-center gap-1 group justify-end">
                                    <span className="text-sm font-semibold text-gray-800">₹{m.amountDue.toLocaleString()}</span>
                                    <Info size={12} className="text-orange-400 flex-shrink-0 cursor-help" />
                                    <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50 w-60 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-2xl pointer-events-none">
                                      <p className="font-semibold text-orange-300 mb-2">Amount breakdown</p>
                                      <div className="space-y-1.5">
                                        <div className="flex justify-between gap-2">
                                          <span className="text-gray-400">{m.backdateCount} missed draw{m.backdateCount > 1 ? 's' : ''} × ₹{backlogPerDraw.toLocaleString()}</span>
                                          <span className="text-orange-200 font-semibold whitespace-nowrap">₹{backlogTotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                          <span className="text-gray-400">Current draw</span>
                                          <span className="whitespace-nowrap">₹{currentDraw.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between gap-2 border-t border-gray-700 pt-1.5">
                                          <span className="font-semibold">Total</span>
                                          <span className="font-bold whitespace-nowrap">₹{m.amountDue.toLocaleString()}</span>
                                        </div>
                                      </div>
                                      <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45" />
                                    </div>
                                  </div>
                                );
                              })() : (
                                <span className="text-sm font-semibold text-gray-800">₹{m.amountDue.toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              {m.isWinner && m.netPayout !== null ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-bold text-green-700">₹{m.netPayout.toLocaleString()}</span>
                                  <span className="text-[9px] text-gray-400">after deduction</span>
                                </div>
                              ) : <span className="text-gray-300 text-sm">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td className="px-4 py-2.5 text-xs font-semibold text-gray-500">
                            {preview.members.filter((m) => !m.isOrg).length} members
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">₹{totalCollection.toLocaleString()}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {preview?.isLottery && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 bg-[#EEF2F8] rounded-xl px-4 py-2.5">
                    <Shuffle size={12} style={{ color: '#1E3A5F' }} className="flex-shrink-0" />
                    {preview.lotteryMode === 'RANDOM'
                      ? 'Winner will be drawn randomly when the draw is confirmed.'
                      : `${memberMap[pickedWinnerId]?.fullName ?? 'Selected member'} will be recorded as this draw's winner.`
                    }
                  </div>
                )}
                {!preview?.isLottery && slotsToProcess.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2.5">
                    <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                    {slotsToProcess.length === 1 ? '1 reservation slot' : `${slotsToProcess.length} reservation slots`} will be marked settled.
                  </div>
                )}

              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t border-gray-100 flex gap-3 bg-white" style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 16 }}>
            {step === 1 ? (
              <>
                <Button type="button" variant="muted" onClick={onClose} className="flex-1">Cancel</Button>
                <Button
                  type="submit"
                  form="open-draw-form"
                  disabled={
                    enrollments.length === 0 ||
                    (isLottery && lotteryEligible.length === 0) ||
                    (isLottery && lotteryMode === 'PICK' && !pickedWinnerId) ||
                    (!isLottery && additionalWinners.some((w) => !w.memberId || !w.slotId))
                  }
                  className="flex-1">
                  Preview →
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="muted" onClick={() => setStep(1)} className="flex-1">← Back</Button>
                <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="flex-1">
                  Open Draw #{nextCycleNum}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
