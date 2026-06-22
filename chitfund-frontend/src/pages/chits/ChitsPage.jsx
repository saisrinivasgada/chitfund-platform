import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChits, createChit, getMembers, getLatestDrawNumbers, getMe, getDeletedChits } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea, DateInput } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { Td } from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { Plus, BookOpen, Users, Calendar, ArrowRight, LayoutGrid, List, ArrowUp, ArrowDown, ChevronsUpDown, BookMarked, Shuffle, Gavel, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

const MODE_LABELS = {
  AUCTION: 'Auction',
  LOTTERY: 'Lottery',
  RESERVATION: 'Reservation',
};

const BOARD_COLUMNS = [
  { status: 'DRAFT',     label: 'Draft',     color: 'bg-slate-100 border-slate-200',  dot: 'bg-slate-400' },
  { status: 'ACTIVE',    label: 'Active',    color: 'bg-green-50 border-green-200',   dot: 'bg-green-500' },
  { status: 'PAUSED',    label: 'Paused',    color: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-500' },
  { status: 'COMPLETED', label: 'Completed', color: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500' },
];

// ─── Chit Type selection cards ────────────────────────────────────────────────
const CHIT_TYPES = [
  {
    type: 'RESERVATION',
    icon: BookMarked,
    label: 'Reservation Chit',
    desc: 'Members pre-book a month. Schedule is fixed upfront.',
    available: true,
  },
  {
    type: 'LOTTERY',
    icon: Shuffle,
    label: 'Lottery Chit',
    desc: 'Winner drawn randomly each month.',
    available: false,
  },
  {
    type: 'AUCTION',
    icon: Gavel,
    label: 'Auction Chit',
    desc: 'Highest bidder wins the monthly pot.',
    available: false,
  },
];

// Build month rows from startDate (YYYY-MM-DD or YYYY-MM) + count
// Splits the string to avoid timezone conversion bugs.
// defaultPayoutAmount: pre-fills payout so rows aren't silently dropped on submit.
function buildMonthRows(startDateStr, count, defaultPayoutAmount = '') {
  if (!startDateStr || !count || count < 1) return [];
  const [year, month] = startDateStr.split('-').map(Number);
  if (!year || !month) return [];
  return Array.from({ length: Number(count) }, (_, i) => {
    const d = new Date(year, month - 1 + i, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return { reservationMonth: iso, label, memberId: '', payoutAmount: String(defaultPayoutAmount || ''), postPayoutContribution: '' };
  });
}

// ─── Create Modal (4 steps) ───────────────────────────────────────────────────
function CreateChitModal({ onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToastContext();
  const [step, setStep] = useState(1);          // 1=type 2=basic 3=contribution 4=schedule
  const [chitType, setChitType] = useState('');

  // numberOfMonths is always equal to numberOfMembers for reservation chits
  const [basic, setBasic] = useState({
    name: '', description: '', chitValue: '', numberOfMembers: '',
    installmentAmount: '',
    startDate: '', monthlyDueDate: '', adminHeldSpotsCount: '0',
  });

  // Contribution rule
  const [contrib, setContrib] = useState({ enabled: false, amount: '' });

  // Reservation schedule rows (one per month)
  const [schedule, setSchedule] = useState([]);

  // Pre-fetch members for the member dropdown in schedule step
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  // Include the logged-in admin as a selectable slot owner (admin-held spots)
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminOption = me ? { id: me.id, fullName: `${me.username} (Admin)` } : null;

  function setBasicField(key, val) {
    setBasic((b) => {
      const next = { ...b, [key]: val };
      // Regenerate schedule rows whenever startDate or member count changes.
      // Pass chitValue so payout amounts are pre-filled with the chit value —
      // prevents rows being silently dropped on submit due to empty payoutAmount.
      if (key === 'startDate' || key === 'numberOfMembers') {
        setSchedule(buildMonthRows(
          key === 'startDate' ? val : next.startDate,
          key === 'numberOfMembers' ? val : next.numberOfMembers,
          next.chitValue,
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
      const base = rows.length > 0 ? rows[rows.length - 1].reservationMonth : (basic.startDate || new Date().toISOString().slice(0, 7) + '-01');
      const [y, m] = base.split('-').map(Number);
      const isFirst = rows.length === 0;
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
      toast.error(err.response?.data?.message ?? 'Failed to create chit fund');
    },
  });

  function submit(includeSchedule) {
    // Send ALL rows regardless of whether payout is filled — the backend accepts
    // null payoutAmount and marks those slots UNALLOCATED. Rows the admin didn't
    // touch will still appear in the Schedule tab so they can be filled in later.
    const reservationSchedule = includeSchedule && schedule.length > 0
      ? schedule.map((r) => ({
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
      adminHeldSpotsCount: Number(basic.adminHeldSpotsCount) || 0,
      postPayoutContributionEnabled: contrib.enabled,
      defaultPostPayoutContribution: contrib.enabled && contrib.amount ? Number(contrib.amount) : null,
      winnerSelectionMode: chitType,
      reservationSchedule,
    });
  }


  const STEPS = ['Type', 'Details', 'Contribution', 'Schedule'];

  return (
    <Modal title="Create New Chit Fund" onClose={onClose} size="xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                done ? 'bg-green-500 text-white' : active ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-400'
              }`}>{done ? '✓' : n}</div>
              <span className={`text-xs font-medium hidden sm:block ${active ? 'text-[#1E3A5F]' : 'text-gray-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Type ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">Select the type of chit fund you want to create.</p>
          {CHIT_TYPES.map(({ type, icon: Icon, label, desc, available }) => (
            <button
              key={type}
              type="button"
              disabled={!available}
              onClick={() => setChitType(type)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                !available
                  ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                  : chitType === type
                  ? 'border-[#1E3A5F] bg-[#1E3A5F]/5'
                  : 'border-gray-200 hover:border-[#1E3A5F]/40 bg-white'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                chitType === type ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                {!available && <span className="text-xs text-amber-600 font-medium">Coming soon</span>}
              </div>
            </button>
          ))}
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={() => setStep(2)} disabled={!chitType} className="flex-1">
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Basic Details ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <FormField label="Chit Name" required>
            <Input placeholder="e.g. Family Gold Chit 2027" value={basic.name}
              onChange={(e) => setBasicField('name', e.target.value)} required />
          </FormField>
          <FormField label="Description">
            <Textarea placeholder="Optional description" value={basic.description}
              onChange={(e) => setBasicField('description', e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Chit Value (₹)" required>
              <Input type="number" min="1000" placeholder="200000" value={basic.chitValue}
                onChange={(e) => setBasicField('chitValue', e.target.value)} required />
            </FormField>
            <FormField label="Number of Members" required>
              <Input type="number" min="2" max="100" placeholder="20" value={basic.numberOfMembers}
                onChange={(e) => setBasicField('numberOfMembers', e.target.value)} required />
              <p className="text-xs text-gray-400 mt-1">Duration equals number of members (1 member wins per month)</p>
            </FormField>
            <FormField label="Monthly Installment Amount (₹)" required>
              <Input type="number" min="1" placeholder="10000" value={basic.installmentAmount}
                onChange={(e) => setBasicField('installmentAmount', e.target.value)} required />
              <p className="text-xs text-gray-400 mt-1">Amount each member pays per month</p>
            </FormField>
            <FormField label="Admin Held Spots">
              <Input type="number" min="0" placeholder="0" value={basic.adminHeldSpotsCount}
                onChange={(e) => setBasicField('adminHeldSpotsCount', e.target.value)} />
            </FormField>
            <FormField label="Monthly Due Date (day)">
              <Input type="number" min="1" max="28" placeholder="5" value={basic.monthlyDueDate}
                onChange={(e) => setBasicField('monthlyDueDate', e.target.value)} />
            </FormField>
            <FormField label="Anticipated Start Date">
              <DateInput value={basic.startDate}
                onChange={(e) => setBasicField('startDate', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Used to generate month labels in the schedule. Actual start date is set when activating.</p>
            </FormField>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
              <ChevronLeft size={15} /> Back
            </Button>
            <Button onClick={() => setStep(3)}
              disabled={!basic.name || !basic.chitValue || !basic.numberOfMembers || !basic.installmentAmount}
              className="flex-1">
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Contribution Rule ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            After a member receives their payout, do they pay a <strong>different</strong> monthly amount?
          </p>
          <div className="space-y-3">
            {[
              { val: false, label: 'No — same amount for everyone throughout', sublabel: `₹${basic.installmentAmount || '—'} / month for all members` },
              { val: true,  label: 'Yes — post-payout members pay a different amount', sublabel: 'Specify the new monthly contribution below' },
            ].map(({ val, label, sublabel }) => (
              <button key={String(val)} type="button"
                onClick={() => setContrib((c) => ({ ...c, enabled: val }))}
                className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  contrib.enabled === val
                    ? 'border-[#1E3A5F] bg-[#1E3A5F]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                  contrib.enabled === val ? 'border-[#1E3A5F]' : 'border-gray-300'
                }`}>
                  {contrib.enabled === val && <div className="w-2.5 h-2.5 rounded-full bg-[#1E3A5F]" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
                </div>
              </button>
            ))}
          </div>
          {contrib.enabled && (
            <FormField label="Default post-payout monthly contribution (₹)" required>
              <Input type="number" min="0" placeholder="12000" value={contrib.amount}
                onChange={(e) => setContrib((c) => ({ ...c, amount: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">
                Can be overridden per slot in the schedule. Normal payment: ₹{basic.installmentAmount || '—'}
              </p>
            </FormField>
          )}
          <div className="flex gap-3 pt-4">
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
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Reservation Schedule ─────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Assign who gets the payout each month. Member is optional — slots can stay unallocated and be filled later.
          </p>

          {schedule.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 space-y-3">
              <p className="text-sm text-gray-400">
                Set an Anticipated Start Date and Number of Members in Step 2 to auto-generate the schedule.
              </p>
              <button type="button" onClick={addSlotAtEnd}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#1E3A5F] border border-[#1E3A5F]/40 rounded-lg hover:bg-[#1E3A5F]/5 transition-colors">
                <Plus size={14} /> Add Slot Manually
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['#', 'Member (optional)', 'Payout Amount (₹)', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap" width={h === '' ? 40 : undefined}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schedule.map((row, i) => {
                      const prevMonth = i > 0 ? schedule[i - 1].reservationMonth : null;
                      const isExtra = row.reservationMonth === prevMonth;
                      return (
                        <tr key={i} className={`${isExtra ? 'bg-amber-50/60' : 'bg-white'} hover:bg-gray-50 transition-colors`}>
                          <td className="px-4 py-3 w-12">
                            {isExtra
                              ? <span className="text-amber-500 text-xs font-medium pl-2">↳</span>
                              : <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs font-bold inline-flex items-center justify-center">{i + 1}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const adminHeld = Number(basic.adminHeldSpotsCount) || 0;
                              const allocatedAdminSlots = adminOption
                                ? schedule.filter((s, si) => si !== i && s.memberId === String(adminOption.id)).length
                                : 0;
                              const isAlreadyAdmin = adminOption && row.memberId === String(adminOption.id);
                              const canAddAdmin = adminHeld > 0 && (isAlreadyAdmin || allocatedAdminSlots < adminHeld);
                              return (
                                <Select value={row.memberId}
                                  onChange={(e) => setScheduleRow(i, 'memberId', e.target.value)}
                                  className="min-w-36">
                                  <option value="">Unallocated</option>
                                  {adminOption && canAddAdmin && (
                                    <option value={adminOption.id}>{adminOption.fullName}</option>
                                  )}
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
                                  ))}
                                </Select>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <Input type="number" min="0" placeholder="e.g. 45000"
                              value={row.payoutAmount}
                              onChange={(e) => setScheduleRow(i, 'payoutAmount', e.target.value)}
                              className="w-32" />
                          </td>
                          <td className="px-4 py-3">
                            {schedule.length > 1 && (
                              <button type="button" title="Remove this slot" onClick={() => removeSlot(i)}
                                className="text-red-400 hover:bg-red-50 rounded-md p-1">
                                <Trash2 size={12} />
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

          {schedule.length > 0 && (
            <button type="button" onClick={addSlotAtEnd}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-[#1E3A5F] border border-dashed border-[#1E3A5F]/30 rounded-lg hover:bg-[#1E3A5F]/5 transition-colors">
              <Plus size={14} /> Add Slot
            </button>
          )}

          {/* Sticky footer — always visible regardless of scroll position */}
          <div className="sticky bottom-0 bg-white pt-3 pb-1 space-y-2 -mx-6 px-6 border-t border-gray-100 mt-2">
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(3)} className="flex-1">
                <ChevronLeft size={15} /> Back
              </Button>
              <Button
                onClick={() => submit(true)}
                loading={mutation.isPending}
                className="flex-1">
                Save
              </Button>
            </div>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={mutation.isPending}
              className="w-full text-center text-sm text-gray-400 hover:text-[#1E3A5F] hover:underline py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save and fill schedule later
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Chit Card (board view) ───────────────────────────────────────────────────
function ChitCard({ chit, onClick, isBehind }) {
  const totalAmount = chit.chitValue ?? chit.totalAmount ?? (chit.installmentAmount ?? 0) * (chit.totalMembers ?? 0);
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#1E3A5F]/20 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <h3
              className="font-semibold text-gray-900 truncate group-hover:text-[#1E3A5F] transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {chit.name}
            </h3>
            {chit.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{chit.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isBehind && (
              <span title="Draw not opened for current month"
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                Draw due
              </span>
            )}
            <Badge variant={statusBadge(chit.status)}>{chit.status ?? 'DRAFT'}</Badge>
          </div>
        </div>

        <dl className="space-y-2 mt-4">
          <div className="flex items-center justify-between text-sm">
            <dt className="text-gray-500 flex items-center gap-1.5">
              <span className="text-xs">₹</span> Installment
            </dt>
            <dd className="font-semibold text-gray-900">₹{chit.installmentAmount?.toLocaleString()}</dd>
          </div>
          <div className="flex items-center justify-between text-sm">
            <dt className="text-gray-500 flex items-center gap-1.5">
              <Users size={13} /> Members
            </dt>
            <dd className="font-medium text-gray-700">{chit.totalMembers}</dd>
          </div>
          <div className="flex items-center justify-between text-sm">
            <dt className="text-gray-500">Mode</dt>
            <dd className="font-medium text-gray-700">{MODE_LABELS[chit.winnerSelectionMode] ?? chit.winnerSelectionMode}</dd>
          </div>
          <div className="flex items-center justify-between text-sm">
            <dt className="text-gray-500 flex items-center gap-1.5">
              <Calendar size={13} /> Start Date
            </dt>
            <dd className="font-medium text-gray-700">{chit.startDate}</dd>
          </div>
        </dl>

        <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Total: <strong className="text-gray-600">₹{totalAmount.toLocaleString()}</strong>
          </span>
          <ArrowRight size={15} className="text-gray-400 group-hover:text-[#1E3A5F] transition-colors" />
        </div>
      </div>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────
function BoardView({ chits, onChitClick, behindChitIds }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" style={{ minHeight: '60vh' }}>
      {BOARD_COLUMNS.map((col) => {
        const items = chits.filter((c) => (c.status ?? 'DRAFT') === col.status && c.status !== 'DELETED');
        return (
          <div key={col.status} className={`rounded-xl border ${col.color} p-4 flex flex-col h-full`}>
            {/* Column header — pinned, never scrolls */}
            <div className="flex items-center gap-2 pb-3 flex-shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className="ml-auto text-xs font-semibold text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </div>

            {/* Cards — fills remaining column height and scrolls independently */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No {col.label.toLowerCase()} chits</p>
              ) : (
                items.map((c) => (
                  <ChitCard key={c.id} chit={c} onClick={() => onChitClick(c.id)}
                    isBehind={behindChitIds.has(c.id)} />
                ))
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

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ chits, onChitClick, behindChitIds }) {
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
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
            {sorted.map((c) => (
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
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const canSeeDeleted = isAdmin || isManager;
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState('board');
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: chits = [], isLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: () => getChits(),
  });

  const { data: deletedData = { content: [] }, isLoading: loadingDeleted } = useQuery({
    queryKey: ['chits', 'deleted'],
    queryFn: () => getDeletedChits({ size: 100 }),
    enabled: showDeleted && canSeeDeleted,
  });
  const deletedChits = deletedData.content ?? [];

  // IDs of ACTIVE chits that have a start date — we need cycle status for these
  const activeChitIds = chits
    .filter((c) => c.status === 'ACTIVE' && c.startDate)
    .map((c) => c.id);

  const { data: latestCycleMap = {} } = useQuery({
    queryKey: ['latest-cycles', activeChitIds.join(',')],
    queryFn: () => getLatestDrawNumbers(activeChitIds),
    enabled: activeChitIds.length > 0,
    staleTime: 60_000,
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
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Chit Funds
          </h2>
          <p className="text-sm text-gray-500 mt-1">{chits.length} total chit funds</p>
        </div>

        <div className="flex items-center gap-3">
          {canSeeDeleted && (
            <Button
              variant={showDeleted ? 'danger' : 'secondary'}
              onClick={() => setShowDeleted((v) => !v)}
            >
              <Trash2 size={14} />
              {showDeleted ? 'Deleted Chits' : 'Show Deleted'}
            </Button>
          )}
          {!showDeleted && (
            <div className="flex items-center gap-3">
              {/* View toggle — iOS-style segmented control */}
              <div className="flex items-center bg-gray-200 rounded-full p-1">
                <button
                  onClick={() => setViewMode('board')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    viewMode === 'board'
                      ? 'bg-white text-[#1E3A5F] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutGrid size={14} /> Board
                </button>
                <button
                  onClick={() => setViewMode('list')}
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
                <Button onClick={() => setShowModal(true)}>
                  <Plus size={16} /> New Chit Fund
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {showDeleted ? (
        loadingDeleted ? (
          <PageSpinner />
        ) : deletedChits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <EmptyState
              icon={Trash2}
              title="No deleted chits"
              message="No chit funds have been deleted yet."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Deleted Chit Funds</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {deletedChits.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/chits/${c.id}`)}
                  className="flex items-center justify-between px-6 py-4 opacity-60 hover:opacity-80 cursor-pointer hover:bg-gray-50 transition-all"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-500 line-through">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      ₹{c.chitValue?.toLocaleString()} · {c.totalMembers} members
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="danger">Deleted</Badge>
                    <p className="text-xs text-gray-400 mt-1">
                      {c.deletedAt
                        ? new Date(c.deletedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                        : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : isLoading ? (
        <PageSpinner />
      ) : chits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <EmptyState
            icon={BookOpen}
            title="No chit funds yet"
            message="Create your first chit fund to get started."
            action={!isManager ? 'Create Chit Fund' : undefined}
            onAction={!isManager ? () => setShowModal(true) : undefined}
          />
        </div>
      ) : viewMode === 'board' ? (
        <BoardView chits={chits} onChitClick={(id) => navigate(`/chits/${id}`)} behindChitIds={behindChitIds} />
      ) : (
        <ListView chits={chits} onChitClick={(id) => navigate(`/chits/${id}`)} behindChitIds={behindChitIds} />
      )}

      {showModal && <CreateChitModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
