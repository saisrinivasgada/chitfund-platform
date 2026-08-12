import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChits, createChit, getMembers, getLatestDrawNumbers, getDeletedChits, getCancelledChits, listStaff, getChitOutstandingSummary, getMyTenantLimits } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea, DateInput } from '../../components/ui/FormField';
import { CardGridSkeleton } from '../../components/ui/Spinner';
import { Td } from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { Plus, BookOpen, Users, Calendar, ArrowRight, LayoutGrid, List, ArrowUp, ArrowDown, ChevronsUpDown, BookMarked, Shuffle, Gavel, ChevronLeft, ChevronRight, Trash2, Check } from 'lucide-react';
import PlanLimitModal, { usePlanLimitHandler } from '../../components/ui/PlanLimitModal';

const MODE_LABELS = {
  AUCTION: 'Auction',
  LOTTERY: 'Lottery',
  RESERVATION: 'Reservation',
};

const BOARD_COLUMNS = [
  { status: 'DRAFT',  label: 'Draft',  color: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
  { status: 'ACTIVE', label: 'Active', color: 'bg-green-50 border-green-200',  dot: 'bg-green-500' },
  { status: 'PAUSED', label: 'Paused', color: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-500' },
];

// ─── Chit Type selection cards ────────────────────────────────────────────────
const CHIT_TYPES = [
  {
    type: 'RESERVATION',
    icon: BookMarked,
    label: 'Reservation Chit',
    desc: 'Members pre-book a month. Schedule is fixed upfront.',
  },
  {
    type: 'LOTTERY',
    icon: Shuffle,
    label: 'Lottery Chit',
    desc: 'Winner drawn randomly each month.',
  },
  {
    type: 'AUCTION',
    icon: Gavel,
    label: 'Auction Chit',
    desc: 'Highest bidder wins the monthly pot.',
  },
];

// Build month rows from startDate (YYYY-MM-DD or YYYY-MM) + count.
// existingRows: current rows — passed to preserve member/payout assignments across regeneration.
// Without a startDate: generates placeholder "Slot N" rows with no date assigned yet.
function buildMonthRows(startDateStr, count, defaultPayoutAmount = '', existingRows = []) {
  if (!count || Number(count) < 1) return [];
  const n = Number(count);

  if (!startDateStr) {
    return Array.from({ length: n }, (_, i) => ({
      reservationMonth: '',
      label: `Slot ${i + 1}`,
      memberId:              existingRows[i]?.memberId              ?? '',
      payoutAmount:          existingRows[i]?.payoutAmount          ?? String(defaultPayoutAmount || ''),
      postPayoutContribution: existingRows[i]?.postPayoutContribution ?? '',
    }));
  }

  const [year, month] = startDateStr.split('-').map(Number);
  if (!year || !month) return [];
  return Array.from({ length: n }, (_, i) => {
    const d   = new Date(year, month - 1 + i, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return {
      reservationMonth: iso,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      memberId:              existingRows[i]?.memberId              ?? '',
      payoutAmount:          existingRows[i]?.payoutAmount          ?? String(defaultPayoutAmount || ''),
      postPayoutContribution: existingRows[i]?.postPayoutContribution ?? '',
    };
  });
}

// ─── Create Modal (4 steps) ───────────────────────────────────────────────────
function CreateChitModal({ onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToastContext();
  const { tenantPlan } = useAuth();
  const { handleError: handlePlanError, modal: planModal } = usePlanLimitHandler(tenantPlan);
  const [step, setStep] = useState(1);          // 1=type 2=basic 3=contribution 4=schedule
  const [chitType, setChitType] = useState('');

  // Fetch plan limits to check allowed chit types
  const { data: tenantLimits } = useQuery({ queryKey: ['my-tenant-limits'], queryFn: getMyTenantLimits, staleTime: 5 * 60 * 1000 });
  const allowedTypes = tenantLimits?.allowedChitTypes
    ? tenantLimits.allowedChitTypes.split(',').map((t) => t.trim())
    : ['RESERVATION', 'LOTTERY', 'AUCTION']; // fail open if limits unavailable

  // numberOfMonths is always equal to numberOfMembers for reservation chits
  const [basic, setBasic] = useState({
    name: '', description: '', chitValue: '', numberOfMembers: '',
    installmentAmount: '',
    startDate: new Date().toISOString().slice(0, 10), monthlyDueDate: '', orgHeldSpotsCount: '0',
  });

  // Contribution rule
  const [contrib, setContrib] = useState({ enabled: false, amount: '' });

  // Reservation schedule rows (one per month)
  const [schedule, setSchedule] = useState([]);

  // Pre-fetch members for the member dropdown in schedule step
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  // Load all staff so any admin can be selected as a slot owner (admin-held spots)
  const { data: staffList = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const adminOptions = staffList.map((s) => ({
    id: s.id,
    fullName: `${s.fullName ?? s.username} (Admin)`,
  }));

  function setBasicField(key, val) {
    setBasic((b) => {
      const next = { ...b, [key]: val };
      // Regenerate schedule rows whenever startDate or member count changes.
      // Pass chitValue so payout amounts are pre-filled with the chit value —
      // prevents rows being silently dropped on submit due to empty payoutAmount.
      if (key === 'startDate' || key === 'numberOfMembers') {
        setSchedule((prev) => buildMonthRows(
          key === 'startDate' ? val : next.startDate,
          key === 'numberOfMembers' ? val : next.numberOfMembers,
          next.chitValue,
          prev,
        ));
      }
      return next;
    });
  }

  function setScheduleRow(i, key, val) {
    setSchedule((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  }

  function addSlotAtEnd() {
    setSchedule((rows) => {
      const lastWithDate = [...rows].reverse().find((r) => r.reservationMonth);
      if (!lastWithDate && !basic.startDate) {
        // No dates at all — add a placeholder slot
        return [...rows, { reservationMonth: '', label: `Slot ${rows.length + 1}`, memberId: '', payoutAmount: String(basic.chitValue || ''), postPayoutContribution: '' }];
      }
      const base = lastWithDate?.reservationMonth ?? basic.startDate;
      const [y, m] = base.split('-').map(Number);
      const isFirst = !lastWithDate;
      const nextY = !isFirst ? (m === 12 ? y + 1 : y) : y;
      const nextM = !isFirst ? (m === 12 ? 1 : m + 1) : m;
      const iso   = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
      const label = new Date(nextY, nextM - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      return [...rows, { reservationMonth: iso, label, memberId: '', payoutAmount: String(basic.chitValue || ''), postPayoutContribution: '' }];
    });
  }

  function removeSlot(i) {
    setSchedule((rows) => rows.filter((_, idx) => idx !== i));
  }

  const mutation = useMutation({
    mutationFn: createChit,
    onSuccess: (chit) => {
      qc.invalidateQueries({ queryKey: ['chits'] });
      toast.success('Chit fund created successfully');
      onClose();
      navigate(`/chits/${chit.id}`);
    },
    onError: (err) => {
      if (handlePlanError(err)) return;
      toast.error(err.response?.data?.message ?? 'Failed to create chit fund');
    },
  });

  function submit(includeSchedule) {
    // Send ALL rows regardless of whether payout is filled — the backend accepts
    // null payoutAmount and marks those slots UNALLOCATED. Rows the admin didn't
    // touch will still appear in the Schedule tab so they can be filled in later.
    const datedRows = schedule.filter((r) => r.reservationMonth);
    const reservationSchedule = includeSchedule && datedRows.length > 0
      ? datedRows.map((r) => ({
          reservationMonth: r.reservationMonth,
          memberId: r.memberId || null,
          payoutAmount: r.payoutAmount ? Number(r.payoutAmount) : null,
          postPayoutContribution: r.postPayoutContribution ? Number(r.postPayoutContribution) : null,
        }))
      : null;
    // When includeSchedule=false (skip) and a startDate is set, the backend
    // auto-generates one UNALLOCATED slot per month automatically.

    mutation.mutate({
      chitType,
      name: basic.name,
      description: basic.description || null,
      chitValue: Number(basic.chitValue),
      numberOfMonths: Number(basic.numberOfMembers),
      numberOfMembers: Number(basic.numberOfMembers),
      installmentAmount: Number(basic.installmentAmount),
      startDate: basic.startDate || null,
      monthlyDueDate: basic.monthlyDueDate ? Number(basic.monthlyDueDate) : null,
      orgHeldSpotsCount: Number(basic.orgHeldSpotsCount) || 0,
      postPayoutContributionEnabled: contrib.enabled,
      defaultPostPayoutContribution: contrib.enabled && contrib.amount ? Number(contrib.amount) : null,
      winnerSelectionMode: chitType,
      reservationSchedule,
    });
  }

  const STEP_LABELS = ['Type', 'Details', 'Contribution', 'Schedule'];
  const fmtINR = (n) => n ? Number(n).toLocaleString('en-IN') : null;

  return (
    <>
    <Modal title="Create New Chit Fund" onClose={onClose} size="xl">

      {/* ── Step indicator ─────────────────────────────────────────────────── */}
      <div className="flex items-start mb-7">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <div key={label} className="flex items-start flex-1 last:flex-none">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done   ? 'bg-green-500 text-white' :
                  active ? 'bg-[#1E3A5F] text-white' :
                           'bg-white border-2 border-gray-200 text-gray-400'
                }`}>
                  {done ? <Check size={13} /> : n}
                </div>
                <span className={`text-xs mt-1.5 font-medium hidden sm:block ${
                  active ? 'text-[#1E3A5F]' : done ? 'text-green-600' : 'text-gray-400'
                }`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`flex-1 mt-4 h-px transition-colors ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Type ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Choose how the monthly winner is determined.</p>
          <div className="space-y-2">
            {CHIT_TYPES.map(({ type, icon: Icon, label, desc }) => {
              const onPlan = allowedTypes.includes(type);
              const selected = chitType === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={!onPlan}
                  onClick={() => onPlan && setChitType(type)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border text-left transition-all ${
                    !onPlan
                      ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                      : selected
                      ? 'border-[#1E3A5F] border-2 bg-slate-50 cursor-pointer'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                  }`}
                >
                  <div className={`self-stretch w-[3px] rounded-full flex-shrink-0 transition-colors ${selected ? 'bg-[#D4A017]' : 'bg-transparent'}`} />
                  <Icon size={17} className={`flex-shrink-0 ${selected ? 'text-[#1E3A5F]' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold text-sm ${selected ? 'text-[#1E3A5F]' : 'text-gray-800'}`}>{label}</p>
                      {!onPlan && (
                        <span className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          Not on your plan
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {desc}
                      {!onPlan && ' — Upgrade your plan to unlock this chit type.'}
                    </p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    selected ? 'border-[#1E3A5F] bg-[#1E3A5F]' : 'border-gray-300'
                  }`}>
                    {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={() => setStep(2)} disabled={!chitType} className="flex-1">
              Continue <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Basic Details ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Fund Identity</p>
            <div className="space-y-3">
              <FormField label="Chit Name" required>
                <Input placeholder="e.g. Family Gold Chit 2027" value={basic.name}
                  onChange={(e) => setBasicField('name', e.target.value)} required />
              </FormField>
              <FormField label="Description">
                <Textarea placeholder="Optional notes" value={basic.description}
                  onChange={(e) => setBasicField('description', e.target.value)} />
              </FormField>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Fund Structure</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Chit Value (₹)" required>
                <Input type="number" min="1000" placeholder="200000" value={basic.chitValue}
                  onChange={(e) => setBasicField('chitValue', e.target.value)} required />
              </FormField>
              <FormField label="Number of Members" required>
                <Input type="number" min="2" max="100" placeholder="20" value={basic.numberOfMembers}
                  onChange={(e) => setBasicField('numberOfMembers', e.target.value)} required />
              </FormField>
              <FormField label="Monthly Installment (₹)" required>
                <Input type="number" min="1" placeholder="10000" value={basic.installmentAmount}
                  onChange={(e) => setBasicField('installmentAmount', e.target.value)} required />
              </FormField>
              <FormField label="Org Held Slots">
                <Input type="number" min="0" placeholder="0" value={basic.orgHeldSpotsCount}
                  onChange={(e) => setBasicField('orgHeldSpotsCount', e.target.value)} />
              </FormField>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Monthly Due Date (day)">
                <Input type="number" min="1" max="28" placeholder="5" value={basic.monthlyDueDate}
                  onChange={(e) => setBasicField('monthlyDueDate', e.target.value)} />
              </FormField>
              <FormField label="Anticipated Start Date">
                <DateInput value={basic.startDate}
                  onChange={(e) => setBasicField('startDate', e.target.value)} />
              </FormField>
            </div>
            <p className="text-xs text-gray-400 mt-2">Actual activation date is set when the chit is started. This is used for schedule labels only.</p>
          </div>

          {/* Inline computed preview — appears as values are filled in */}
          {(basic.chitValue || basic.numberOfMembers || basic.installmentAmount) && (
            <>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
                {basic.chitValue && (
                  <span className="text-gray-500">Fund total: <strong className="text-gray-800 font-semibold">₹{fmtINR(basic.chitValue)}</strong></span>
                )}
                {basic.numberOfMembers && <span className="text-gray-300">|</span>}
                {basic.numberOfMembers && (
                  <span className="text-gray-500">Duration: <strong className="text-gray-800 font-semibold">{basic.numberOfMembers} months</strong></span>
                )}
                {basic.installmentAmount && basic.numberOfMembers && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-500">Monthly collection: <strong className="text-gray-800 font-semibold">₹{(Number(basic.installmentAmount) * Number(basic.numberOfMembers)).toLocaleString('en-IN')}</strong></span>
                  </>
                )}
              </div>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
              <ChevronLeft size={15} /> Back
            </Button>
            <Button onClick={() => setStep(3)}
              disabled={!basic.name || !basic.chitValue || !basic.numberOfMembers || !basic.installmentAmount}
              className="flex-1">
              Continue <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Contribution Rule ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            After a member receives their payout{basic.chitValue ? ` (₹${fmtINR(basic.chitValue)})` : ''}, do they pay a <strong>different</strong> monthly installment for the rest of the chit?
          </p>
          <div className="space-y-2">
            {[
              {
                val: false,
                label: 'Same amount throughout',
                sublabel: `₹${fmtINR(basic.installmentAmount) || '—'} / month for all members`,
              },
              {
                val: true,
                label: 'Different post-payout amount',
                sublabel: "Members who've received their payout pay a different monthly installment",
              },
            ].map(({ val, label, sublabel }) => (
              <button key={String(val)} type="button"
                onClick={() => setContrib((c) => ({ ...c, enabled: val }))}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                  contrib.enabled === val
                    ? 'border-[#1E3A5F] border-2 bg-slate-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                <div className={`self-stretch w-[3px] rounded-full flex-shrink-0 transition-colors ${
                  contrib.enabled === val ? 'bg-[#D4A017]' : 'bg-transparent'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${contrib.enabled === val ? 'text-[#1E3A5F]' : 'text-gray-800'}`}>{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  contrib.enabled === val ? 'border-[#1E3A5F] bg-[#1E3A5F]' : 'border-gray-300'
                }`}>
                  {contrib.enabled === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>
          {contrib.enabled && (
            <FormField label="Post-payout monthly contribution (₹)" required>
              <Input type="number" min="0" placeholder="12000" value={contrib.amount}
                onChange={(e) => setContrib((c) => ({ ...c, amount: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Normal installment: ₹{fmtINR(basic.installmentAmount) || '—'} / month &middot; Can be overridden per slot in schedule</p>
            </FormField>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
              <ChevronLeft size={15} /> Back
            </Button>
            <Button
              onClick={() => {
                // Fill any rows that still have no payout amount with the chit value.
                // This handles the case where chitValue was entered after the rows were generated.
                if (basic.chitValue) {
                  setSchedule((rows) => rows.map((r) => ({
                    ...r,
                    payoutAmount: r.payoutAmount || basic.chitValue,
                  })));
                }
                setStep(4);
              }}
              disabled={contrib.enabled && !contrib.amount} className="flex-1">
              Continue <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Reservation Schedule ─────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Assign who receives the payout each month. Member is optional — slots can stay unallocated and be filled later.
          </p>

          {/* Warn when slots exist but no start date — month labels won't be included on submit */}
          {schedule.length > 0 && schedule.every((r) => !r.reservationMonth) && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <Calendar size={13} className="flex-shrink-0 mt-0.5" />
              No start date set — go back to Step 2 to assign months to these slots. You can still assign members now.
            </div>
          )}

          {schedule.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200 space-y-3">
              <Calendar size={28} className="mx-auto text-gray-300" />
              <p className="text-sm text-gray-400">
                Set Number of Members in Step 2 to auto-generate slots.
              </p>
              <button type="button" onClick={addSlotAtEnd}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#1E3A5F] border border-[#1E3A5F]/40 rounded-lg hover:bg-[#1E3A5F]/5 transition-colors cursor-pointer">
                <Plus size={14} /> Add Slot Manually
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Draw</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payout (₹)</th>
                      <th className="w-8 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schedule.map((row, i) => {
                      const prevMonth = i > 0 ? schedule[i - 1].reservationMonth : null;
                      const isExtra = row.reservationMonth === prevMonth;
                      return (
                        <tr key={i} className={`${isExtra ? 'bg-amber-50/40' : 'bg-white'} hover:bg-gray-50 transition-colors`}>
                          <td className="px-3 py-2">
                            {isExtra
                              ? <span className="text-amber-500 text-xs pl-1">&#8627;</span>
                              : <span className="text-xs font-semibold text-gray-400">{i + 1}</span>
                            }
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                              {row.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const orgHeld = Number(basic.orgHeldSpotsCount) || 0;
                              const memberIdSet = new Set(members.map((m) => String(m.id)));
                              const allocatedAdminSlots = schedule.filter(
                                (s, si) => si !== i && s.memberId && !memberIdSet.has(s.memberId)
                              ).length;
                              const currentIsAdmin = row.memberId && !memberIdSet.has(row.memberId);
                              const canShowAdmins = orgHeld > 0 && (currentIsAdmin || allocatedAdminSlots < orgHeld);
                              return (
                                <Select value={row.memberId}
                                  onChange={(e) => setScheduleRow(i, 'memberId', e.target.value)}
                                  className="min-w-36">
                                  <option value="">Unallocated</option>
                                  {canShowAdmins && adminOptions.map((ao) => (
                                    <option key={ao.id} value={ao.id}>{ao.fullName}</option>
                                  ))}
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
                                  ))}
                                </Select>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" placeholder="e.g. 45000"
                              value={row.payoutAmount}
                              onChange={(e) => setScheduleRow(i, 'payoutAmount', e.target.value)}
                              className="w-32" />
                          </td>
                          <td className="px-2 py-2">
                            {schedule.length > 1 && (
                              <button type="button" title="Remove this slot" onClick={() => removeSlot(i)}
                                className="text-red-400 hover:bg-red-50 rounded p-1.5 transition-colors cursor-pointer">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {schedule.length > 0 && (!basic.numberOfMembers || schedule.length < Number(basic.numberOfMembers)) && (
            <button type="button" onClick={addSlotAtEnd}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-[#1E3A5F] border border-dashed border-[#1E3A5F]/30 rounded-lg hover:bg-[#1E3A5F]/5 transition-colors cursor-pointer">
              <Plus size={14} /> Add Slot
            </button>
          )}

          {/* Sticky footer — always visible regardless of scroll position */}
          <div className="sticky bottom-0 bg-white pt-3 pb-1 -mx-6 px-6 border-t border-gray-100 mt-2">
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(3)} className="flex-1">
                <ChevronLeft size={15} /> Back
              </Button>
              <Button
                onClick={() => submit(true)}
                loading={mutation.isPending}
                className="flex-1">
                Create Chit Fund
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
    {planModal}
    </>
  );
}

// ─── Chit Card (board view) ───────────────────────────────────────────────────
function ChitCard({ chit, onClick, isBehind }) {
  const totalAmount = chit.chitValue ?? chit.totalAmount ?? (chit.installmentAmount ?? 0) * (chit.totalMembers ?? 0);
  const isCompleted = chit.status === 'COMPLETED';

  const { data: outstanding } = useQuery({
    queryKey: ['chit-outstanding', chit.id],
    queryFn: () => getChitOutstandingSummary(chit.id),
    enabled: isCompleted,
    staleTime: 5 * 60_000,
  });

  const hasOutstanding = isCompleted && outstanding && Number(outstanding.totalOutstanding) > 0;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-[#1E3A5F]/20 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="p-3.5">
        {/* Name — full, no truncation */}
        <h3
          className="font-semibold text-gray-900 text-sm leading-snug group-hover:text-[#1E3A5F] transition-colors mb-1"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {chit.name}
        </h3>
        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          <Badge variant={statusBadge(chit.status)}>{chit.status ?? 'DRAFT'}</Badge>
          {isBehind && (
            <span title="Draw not opened for current month"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
              Due
            </span>
          )}
          {chit.description && (
            <p className="text-xs text-gray-400 truncate w-full mt-0.5">{chit.description}</p>
          )}
        </div>

        {/* Stats row: horizontal */}
        <div className="flex items-center gap-3 text-xs border-t border-gray-50 pt-2.5">
          <div className="flex-1 min-w-0">
            <span className="text-gray-400">₹/mo </span>
            <span className="font-semibold text-gray-800">₹{chit.installmentAmount?.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Users size={11} />
            <span className="font-medium text-gray-700">{chit.totalMembers}</span>
          </div>
          {(chit.chitType ?? chit.winnerSelectionMode) && (() => {
            const type = chit.chitType ?? chit.winnerSelectionMode;
            const typeStyle = type === 'RESERVATION' ? 'text-blue-600 bg-blue-50'
              : type === 'LOTTERY' ? 'text-purple-600 bg-purple-50'
              : type === 'AUCTION' ? 'text-amber-600 bg-amber-50'
              : 'text-gray-500 bg-gray-100';
            return (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${typeStyle}`}>
                {MODE_LABELS[type] ?? type}
              </span>
            );
          })()}
        </div>

        {/* Second stats row: draws + post payout */}
        <div className="flex items-center gap-3 text-xs pt-1.5">
          {(chit.durationMonths ?? chit.totalDraws) && (
            <span className="text-gray-400">
              Draws <strong className="text-gray-600">{chit.winnersAssigned ?? chit.currentDraw ?? 0}/{chit.durationMonths ?? chit.totalDraws}</strong>
            </span>
          )}
          {chit.postPayoutContributionEnabled !== undefined && (
            <span className="text-gray-400">
              Post-payout <strong className={chit.postPayoutContributionEnabled ? 'text-green-600' : 'text-gray-500'}>
                {chit.postPayoutContributionEnabled ? 'Yes' : 'No'}
              </strong>
            </span>
          )}
        </div>

        {/* Total + arrow */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
          <span className="text-xs text-gray-400">
            Total <strong className="text-gray-600">₹{totalAmount.toLocaleString()}</strong>
          </span>
          <ArrowRight size={13} className="text-gray-300 group-hover:text-[#1E3A5F] transition-colors" />
        </div>
      </div>
    </div>
  );
}

const COL_INITIAL = 8;

// ─── Board View ───────────────────────────────────────────────────────────────
function BoardView({ chits, onChitClick, behindChitIds }) {
  const [colExpanded, setColExpanded] = useState({});

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {BOARD_COLUMNS.map((col) => {
        const items = chits.filter((c) => (c.status ?? 'DRAFT') === col.status);
        const expanded = colExpanded[col.status] ?? false;
        const visible = expanded ? items : items.slice(0, COL_INITIAL);
        const remaining = items.length - COL_INITIAL;

        return (
          <div key={col.status} className={`rounded-xl border ${col.color} p-4 flex flex-col`}>
            {/* Column header */}
            <div className="flex items-center gap-2 pb-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className="ml-auto text-xs font-semibold text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No {col.label.toLowerCase()} chits</p>
              ) : (
                visible.map((c) => (
                  <ChitCard key={c.id} chit={c} onClick={() => onChitClick(c.id)}
                    isBehind={behindChitIds.has(c.id)} />
                ))
              )}

              {/* Show more / less */}
              {remaining > 0 && !expanded && (
                <button
                  onClick={() => setColExpanded((prev) => ({ ...prev, [col.status]: true }))}
                  className="mt-1 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-white/70 hover:bg-white border border-gray-200 rounded-lg py-2 transition-colors"
                >
                  Show {remaining} more
                </button>
              )}
              {expanded && items.length > COL_INITIAL && (
                <button
                  onClick={() => setColExpanded((prev) => ({ ...prev, [col.status]: false }))}
                  className="mt-1 text-xs font-semibold text-gray-400 hover:text-gray-600 bg-white/70 hover:bg-white border border-gray-200 rounded-lg py-2 transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sort icon helper ─────────────────────────────────────────────────────────
function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronsUpDown size={13} className="text-gray-300" />;
  return sortDir === 'asc'
    ? <ArrowUp size={13} className="text-[#1E3A5F]" />
    : <ArrowDown size={13} className="text-[#1E3A5F]" />;
}

const LIST_PAGE_SIZE = 20;

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ chits, onChitClick, behindChitIds, page, setPage }) {
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  }

  const sorted = [...chits].sort((a, b) => {
    let av = a[sortField] ?? '';
    let bv = b[sortField] ?? '';
    if (sortField === 'createdAt') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / LIST_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(safePage * LIST_PAGE_SIZE, (safePage + 1) * LIST_PAGE_SIZE);

  function SortTh({ field, children }) {
    return (
      <th
        onClick={() => toggleSort(field)}
        className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-[#1E3A5F] transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          {children}
          <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Members</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Installment</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Start Date</th>
              <SortTh field="status">Status</SortTh>
              <SortTh field="createdAt">Created</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pageItems.map((c) => (
              <tr
                key={c.id}
                onClick={() => onChitClick(c.id)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <Td className="font-medium text-gray-900">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{c.name}</p>
                      {behindChitIds.has(c.id) && (
                        <span title="Draw not opened for current month"
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                          Draw due
                        </span>
                      )}
                    </div>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                  </div>
                </Td>
                <Td>{MODE_LABELS[c.winnerSelectionMode] ?? c.winnerSelectionMode}</Td>
                <Td>{c.totalMembers}</Td>
                <Td className="font-semibold">₹{c.installmentAmount?.toLocaleString()}</Td>
                <Td>{c.startDate ?? '—'}</Td>
                <Td>
                  <Badge variant={statusBadge(c.status)}>{c.status ?? 'DRAFT'}</Badge>
                </Td>
                <Td className="text-gray-400">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            Page {safePage + 1} of {totalPages} &middot; {sorted.length} chits
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── More view list row ───────────────────────────────────────────────────────
function MoreListItem({ chit, onClick }) {
  const isCompleted = chit.status === 'COMPLETED';
  const isDeleted   = chit.status === 'DELETED';

  const { data: outstanding } = useQuery({
    queryKey: ['chit-outstanding', chit.id],
    queryFn: () => getChitOutstandingSummary(chit.id),
    enabled: isCompleted,
    staleTime: 5 * 60_000,
  });

  const hasOutstanding = isCompleted && outstanding && Number(outstanding.totalOutstanding) > 0;
  const allCleared     = isCompleted && outstanding && Number(outstanding.totalOutstanding) === 0;

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-all ${isDeleted ? 'opacity-60' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold text-sm text-gray-900 truncate ${isDeleted ? 'line-through text-gray-500' : ''}`}>
            {chit.name}
          </p>
          <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
        </div>
        {chit.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{chit.description}</p>}
        <p className="text-xs text-gray-400 mt-0.5">
          ₹{chit.chitValue?.toLocaleString()} &middot; {chit.totalMembers} members
          {chit.startDate ? ` · ${chit.startDate}` : ''}
        </p>
      </div>

      <div className="ml-4 flex-shrink-0 text-right">
        {hasOutstanding && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            <div>
              <p className="text-xs font-semibold text-red-700">
                ₹{Number(outstanding.totalOutstanding).toLocaleString('en-IN')} outstanding
              </p>
              <p className="text-xs text-red-500">
                {outstanding.membersWithOutstanding} member{outstanding.membersWithOutstanding !== 1 ? 's' : ''} with dues
              </p>
            </div>
          </div>
        )}
        {allCleared && (
          <div className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
            All dues cleared
          </div>
        )}
        {(chit.status === 'DELETED' || chit.status === 'CANCELLED') && (
          <p className="text-xs text-gray-400">
            {new Date(chit.deletedAt ?? chit.updatedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Compute months elapsed since chit start date ─────────────────────────────
function monthsElapsed(startDateStr) {
  if (!startDateStr) return -1;
  const [y, m] = startDateStr.split('-').map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ChitsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, planExpiresAt } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();
  const canSeeDeleted = isAdmin || isManager;
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState('board');
  const [listPage, setListPage] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [moreFilter, setMoreFilter] = useState('all');
  const [morePage, setMorePage] = useState(0);

  useEffect(() => {
    if (location.state?.openAdd && isAdmin) {
      setShowModal(true);
      window.history.replaceState({}, '');
    }
  }, [location.state, isAdmin]);

  const { data: chits = [], isLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
  });

  const { data: limits } = useQuery({
    queryKey: ['myTenantLimits'],
    queryFn: getMyTenantLimits,
    staleTime: 60_000,
    enabled: isAdmin,
  });
  const maxActiveChits = limits?.maxActiveChits ?? -1;
  const activeChitCount = chits.filter(c => c.status === 'ACTIVE').length;
  const isAtChitLimit = maxActiveChits !== -1 && activeChitCount >= maxActiveChits;

  const { data: deletedData = { content: [] }, isLoading: loadingDeleted } = useQuery({
    queryKey: ['chits', 'deleted'],
    queryFn: () => getDeletedChits({ size: 100 }),
    enabled: showMore && canSeeDeleted,
  });
  const deletedChits = deletedData.content ?? [];

  const { data: cancelledData = { content: [] }, isLoading: loadingCancelled } = useQuery({
    queryKey: ['chits', 'cancelled'],
    queryFn: () => getCancelledChits({ size: 100 }),
    enabled: showMore && canSeeDeleted,
  });
  const cancelledChits = cancelledData.content ?? [];

  // Derived lists for board/list view (exclude COMPLETED — it lives in More)
  const boardChits = chits.filter((c) => c.status !== 'COMPLETED');
  const completedChits = chits.filter((c) => c.status === 'COMPLETED');

  // More view combined + filtered list
  const moreAllItems = [
    ...completedChits,
    ...(canSeeDeleted ? cancelledChits : []),
    ...(canSeeDeleted ? deletedChits : []),
  ];
  const moreItems =
    moreFilter === 'completed'  ? completedChits :
    moreFilter === 'deleted'    ? deletedChits :
    moreFilter === 'cancelled'  ? cancelledChits :
    moreAllItems;

  const MORE_PAGE_SIZE = 20;
  const moreTotalPages = Math.max(1, Math.ceil(moreItems.length / MORE_PAGE_SIZE));
  const safeMorePage = Math.min(morePage, moreTotalPages - 1);
  const morePageItems = moreItems.slice(safeMorePage * MORE_PAGE_SIZE, (safeMorePage + 1) * MORE_PAGE_SIZE);

  // IDs of ACTIVE chits that have a start date — we need cycle status for these
  const activeChitIds = chits
    .filter((c) => c.status === 'ACTIVE' && c.startDate)
    .map((c) => c.id);

  const { data: latestCycleMap = {} } = useQuery({
    queryKey: ['latest-cycles', activeChitIds.join(',')],
    queryFn: () => getLatestDrawNumbers(activeChitIds),
    enabled: activeChitIds.length > 0,
  });

  // A chit is "behind" if the expected cycle for the current month hasn't been opened
  const behindChitIds = new Set(
    chits
      .filter((c) => {
        if (c.status !== 'ACTIVE' || !c.startDate) return false;
        const elapsed = monthsElapsed(c.startDate);
        if (elapsed <= 0) return false; // chit hasn't started yet or started this month
        const expectedCycle = elapsed + 1;
        const latestCycle = latestCycleMap[c.id] ?? 0;
        return latestCycle < expectedCycle;
      })
      .map((c) => c.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Chit Funds
          </h2>
          <p className="text-sm text-gray-500 mt-1">{boardChits.length} chit funds</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!showMore && (
            <>
              {/* View toggle — iOS-style segmented control */}
              <div className="flex items-center bg-gray-200 rounded-full p-1">
                <button
                  onClick={() => { setViewMode('board'); setListPage(0); }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    viewMode === 'board'
                      ? 'bg-white text-[#1E3A5F] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutGrid size={14} /> Board
                </button>
                <button
                  onClick={() => { setViewMode('list'); setListPage(0); }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-white text-[#1E3A5F] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List size={14} /> List
                </button>
              </div>

              {!isManager && (
                <Button
                  onClick={() => setShowModal(true)}
                  disabled={isExpired || isAtChitLimit}
                  title={
                    isExpired
                      ? 'Plan expired — renew to create chit funds'
                      : isAtChitLimit
                      ? `Active chit limit reached (${maxActiveChits} max on this plan)`
                      : undefined
                  }
                >
                  <Plus size={16} /> New Chit Fund
                </Button>
              )}
            </>
          )}

          <Button
            variant="secondary"
            onClick={() => { setShowMore((v) => !v); setMorePage(0); setMoreFilter('all'); }}
          >
            {showMore ? (
              <><ChevronLeft size={14} /> Chit Funds</>
            ) : (
              <>More {completedChits.length > 0 && <span className="ml-1 text-xs font-semibold bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">{completedChits.length}</span>}</>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      {showMore ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Filter pills */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
            {[
              { key: 'all',       label: `All (${moreAllItems.length})` },
              { key: 'completed', label: `Completed (${completedChits.length})` },
              ...(canSeeDeleted ? [
                { key: 'cancelled', label: `Cancelled (${cancelledChits.length})` },
                { key: 'deleted',   label: `Deleted (${deletedChits.length})` },
              ] : []),
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setMoreFilter(key); setMorePage(0); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  moreFilter === key
                    ? 'bg-[#1E3A5F] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(loadingDeleted || loadingCancelled) && moreFilter !== 'completed' ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading…</div>
          ) : morePageItems.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Nothing here"
              message={moreFilter === 'completed' ? 'No completed chit funds yet.' : 'Nothing to show for this filter.'}
            />
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {morePageItems.map((c) => (
                  <MoreListItem key={c.id} chit={c} onClick={() => navigate(`/chits/${c.id}`)} />
                ))}
              </div>
              {moreTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100">
                  <span className="text-sm text-gray-500">
                    Page {safeMorePage + 1} of {moreTotalPages} &middot; {moreItems.length} chits
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMorePage((p) => Math.max(0, p - 1))}
                      disabled={safeMorePage === 0}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setMorePage((p) => Math.min(moreTotalPages - 1, p + 1))}
                      disabled={safeMorePage >= moreTotalPages - 1}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : boardChits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <EmptyState
            icon={BookOpen}
            title="No chit funds yet"
            message="Create your first chit fund to get started."
            action={!isManager && !isExpired ? 'Create Chit Fund' : undefined}
            onAction={!isManager && !isExpired ? () => setShowModal(true) : undefined}
          />
        </div>
      ) : viewMode === 'board' ? (
        <BoardView chits={boardChits} onChitClick={(id) => navigate(`/chits/${id}`)} behindChitIds={behindChitIds} />
      ) : (
        <ListView chits={boardChits} onChitClick={(id) => navigate(`/chits/${id}`)} behindChitIds={behindChitIds} page={listPage} setPage={setListPage} />
      )}

      {showModal && <CreateChitModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
