import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChit, updateChitStatus, pauseChit, resumeChit, deleteChit,
  getEnrollments, enrollMember, removeEnrollment,
  getMembers,
  getDraws, openDraw, closeDraw, skipDraw, deleteDraw, shiftReservations,
  getWinners, recordWinner, deleteWinnerForDraw,
  getReservations, addReservationSlot, updateReservationSlot, removeReservationSlot, hardDeleteReservationSlot, markSlotProcessed, swapSlots,
  getMemberBalanceBulk,
  getDrawPayments, recordPayment, collectPayment, remitPayment, getPaymentHistory,
  getPaymentBatches, voidPaymentBatch,
  getPayoutsByChit, getPayoutsForMember, createPayout, disbursePayout, cancelPayout,
  getChitsForMember, getMemberTotalBalance, getMemberBalance,
  getMe, listStaff,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea, DateInput } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog, DestructiveDialog } from '../../components/ui/ConfirmDialog';
import {
  ArrowLeft, Settings, Users, Calendar, Trophy, BookMarked,
  UserPlus, Trash2, Plus, ChevronDown, CheckCircle, XCircle,
  AlertTriangle, Pause, Play, List, Info, Phone, Mail, MapPin, ArrowLeftRight, Eye,
  Banknote, AlertCircle, ChevronRight, Clock, ArrowRight, Wallet,
} from 'lucide-react';

function ToggleSwitch({ on, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
        on ? 'bg-[#1E3A5F]' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
            active === t
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── MemberLink — clickable member name that navigates to profile ─────────────
function MemberLink({ id, name, className }) {
  const navigate = useNavigate();
  if (!id) return <span className={className}>{name ?? '—'}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigate(`/members/${id}`); }}
      className={`hover:underline hover:text-[#1E3A5F] cursor-pointer text-left ${className ?? ''}`}
    >
      {name ?? '—'}
    </button>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ chit }) {
  const installment = chit.installmentAmount ?? (chit.chitValue && chit.totalMembers
    ? chit.chitValue / chit.totalMembers : null);

  const rows = [
    ['Chit Type',            chit.chitType ?? 'RESERVATION'],
    ['Status',               <Badge key="s" variant={statusBadge(chit.status)}>{chit.status}</Badge>],
    ['Chit Value',           chit.chitValue ? `₹${Number(chit.chitValue).toLocaleString()}` : '—'],
    ['Installment / Member', installment ? `₹${Number(installment).toLocaleString()}` : '—'],
    ['Number of Members',    chit.totalMembers],
    ['Number of Months',     chit.durationMonths ?? chit.totalMembers],
    ['Admin Held Spots',     chit.adminHeldSpotsCount ?? 0],
    ['Monthly Due Date',     chit.monthlyDueDate ? `${chit.monthlyDueDate}th of each month` : '—'],
    ...(chit.status === 'DRAFT'
      ? [['Anticipated Start Date', chit.startDate ?? '— (set when activating)']]
      : [
          ['Start Date', chit.startDate ?? '—'],
          ['End Date',   chit.endDate ?? '—'],
        ]),
    ['Winner Selection',     chit.winnerSelectionMode],
    ['Description',          chit.description ?? '—'],
  ];

  const contribRows = chit.postPayoutContributionEnabled
    ? [
        ['Post-Payout Rule',   'Yes — different contribution after payout'],
        ['Default Post-Payout Amount', chit.defaultPostPayoutContribution
          ? `₹${Number(chit.defaultPostPayoutContribution).toLocaleString()}`
          : '—'],
      ]
    : [['Post-Payout Rule', 'No — same amount for all members throughout']];

  const pauseRows = chit.pausedAt
    ? [['Paused At', new Date(chit.pausedAt).toLocaleDateString()],
       ['Total Paused Months', chit.totalPausedMonths ?? 0]]
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Chit Details</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {rows.map(([label, val]) => (
            <div key={label} className="flex items-center px-6 py-3 gap-4">
              <span className="text-sm text-gray-500 w-52 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium text-gray-900">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Contribution Rule</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {[...contribRows, ...pauseRows].map(([label, val]) => (
            <div key={label} className="flex items-center px-6 py-3 gap-4">
              <span className="text-sm text-gray-500 w-52 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium text-gray-900">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────────────────────────────
function EnrollMemberModal({ chitId, chit, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [memberId, setMemberId] = useState('');
  const [spots, setSpots] = useState(1);

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const totalSpots = enrollments.length;
  const remaining = (chit?.totalMembers ?? 0) - totalSpots;

  const mutation = useMutation({
    mutationFn: () => enrollMember({ chitId, memberId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', chitId] });
      qc.invalidateQueries({ queryKey: ['chit', chitId] });
      toast.success('Spot enrolled successfully');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to enroll'),
  });

  // Count spots per member so UI shows how many each already holds
  const spotCountMap = {};
  enrollments.forEach((e) => {
    const mid = String(e.memberId ?? e.id);
    spotCountMap[mid] = (spotCountMap[mid] ?? 0) + 1;
  });

  return (
    <Modal title="Enroll Member / Add Spot" onClose={onClose} size="sm">
      <div className="space-y-4">
        {remaining <= 0 && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            This chit is at full capacity ({chit?.totalMembers} spots).
          </p>
        )}
        <p className="text-xs text-gray-400">
          {totalSpots} / {chit?.totalMembers ?? '?'} spots filled · {remaining} remaining
          <br />A member can hold multiple spots in the same chit.
        </p>
        <FormField label="Select Member" required>
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
            <option value="">— Choose a member —</option>
            {activeMembers.map((m) => {
              const count = spotCountMap[String(m.id)] ?? 0;
              return (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.phone}){count > 0 ? ` — ${count} spot${count > 1 ? 's' : ''} held` : ''}
                </option>
              );
            })}
          </Select>
        </FormField>
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!memberId || remaining <= 0}
            loading={mutation.isPending} className="flex-1">
            Enroll
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MembersTab({ chitId, chit }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { user } = useAuth();
  const canEdit = user?.role !== 'MANAGER' || chit?.status === 'DRAFT';
  const [showEnroll, setShowEnroll] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null); // { memberId, displayName }

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const memberMap = Object.fromEntries(allMembers.map((m) => [m.id, m]));

  const removeMutation = useMutation({
    mutationFn: ({ memberId }) => removeEnrollment({ chitId, memberId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', chitId] });
      toast.success('Spot removed');
      setPendingRemove(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to remove'),
  });

  // Aggregate spots per member for display
  const spotMap = {};
  enrollments.forEach((e) => {
    const mid = String(e.memberId ?? e.id);
    if (!spotMap[mid]) spotMap[mid] = { ...e, spots: 0, enrollmentId: e.id };
    spotMap[mid].spots += 1;
  });
  const uniqueMembers = Object.values(spotMap);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {enrollments.length} spots filled · {(chit?.totalMembers ?? 0) - enrollments.length} remaining
        </p>
        {canEdit && (
          <Button onClick={() => setShowEnroll(true)} size="sm">
            <UserPlus size={14} /> Add Spot
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? <PageSpinner /> : uniqueMembers.length === 0 ? (
          <EmptyState icon={Users} title="No members enrolled"
            message="Enroll members to this chit fund."
            action={canEdit ? 'Add Spot' : undefined}
            onAction={canEdit ? () => setShowEnroll(true) : undefined} />
        ) : (
          <Table columns={['Member', 'Spots Held', 'Enrolled On', 'Actions']}>
            {uniqueMembers.map((e) => {
              const mid = e.memberId ?? e.id;
              const member = memberMap[mid];
              const isAdmin = !member; // UUID not in member-service = admin reserved their own slot
              const avatarBg = isAdmin ? '#B45309' : '#1E3A5F'; // amber for admin, navy for member
              const displayName = isAdmin ? 'Admin (Self)' : member.fullName;
              const initial = isAdmin ? '★' : member.fullName[0].toUpperCase();
              return (
                <Tr key={mid}>
                  <Td className="font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: avatarBg }}>
                        {initial}
                      </div>
                      {isAdmin ? (
                        <span className="text-amber-700">{displayName}</span>
                      ) : (
                        <MemberLink id={mid} name={displayName} />
                      )}
                      {isAdmin && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">★</span>
                      )}
                      {!isAdmin && <MemberInfoPopover member={member} />}
                    </div>
                  </Td>
                  <Td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      e.spots > 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {e.spots} {e.spots > 1 ? 'spots' : 'spot'}
                    </span>
                  </Td>
                  <Td>{e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : '—'}</Td>
                  <Td>
                    {canEdit && (
                      <Button variant="danger" size="sm"
                        onClick={() => setPendingRemove({ memberId: mid, displayName })}>
                        <Trash2 size={13} /> Remove
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {showEnroll && (
        <EnrollMemberModal chitId={chitId} chit={chit} onClose={() => setShowEnroll(false)} />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove Spot"
          description={`Remove one spot for ${pendingRemove.displayName}? If they hold multiple spots only one will be removed.`}
          actionLabel="Remove Spot"
          variant="danger"
          loading={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate({ memberId: pendingRemove.memberId })}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

// ─── Reservation Schedule Tab ─────────────────────────────────────────────────

// prefill: { monthNumber, reservationMonth } — set when filling a voided slot at its original position
function AddSlotModal({ chitId, chit, onClose, prefill = null }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminOption = me ? { id: me.id, fullName: `${me.username} (Admin)` } : null;

  const initMonth  = prefill?.reservationMonth ? prefill.reservationMonth.substring(0, 7) : '';
  const initPayout = prefill?.payoutAmount     ? String(prefill.payoutAmount)             : '';
  const [form, setForm] = useState({ reservationMonth: initMonth, memberId: '', payoutAmount: initPayout, postPayoutContribution: '' });

  const mutation = useMutation({
    mutationFn: () => addReservationSlot({
      chitId,
      reservationMonth: form.reservationMonth + '-01',
      monthNumber: prefill?.monthNumber ?? undefined,
      memberId: form.memberId || null,
      payoutAmount: Number(form.payoutAmount),
      postPayoutContribution: form.postPayoutContribution ? Number(form.postPayoutContribution) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      toast.success(prefill ? 'Replacement slot added at same position' : 'Slot added');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to add slot'),
  });

  const isPinned = !!prefill;

  return (
    <Modal title={isPinned ? 'Fill Voided Slot' : 'Add Reservation Slot'} onClose={onClose} size="sm">
      <div className="space-y-4">
        {isPinned && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-800">
              Filling slot <strong>#{prefill.monthNumber}</strong> at <strong>{formatMonthLabel(prefill.reservationMonth, prefill.monthNumber)}</strong>.
              This new slot will take the same position as the voided one.
            </p>
          </div>
        )}
        <FormField label="Month" required>
          <Input type="month" value={form.reservationMonth}
            onChange={(e) => !isPinned && setForm((f) => ({ ...f, reservationMonth: e.target.value }))}
            readOnly={isPinned}
            className={isPinned ? 'opacity-60 cursor-not-allowed' : ''}
            required />
        </FormField>
        <FormField label="Member (optional — leave blank for Unallocated)">
          <Select value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}>
            <option value="">— Unallocated —</option>
            {adminOption && (chit?.adminHeldSpotsCount ?? 0) > 0 && (
              <option key={adminOption.id} value={adminOption.id}>{adminOption.fullName}</option>
            )}
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Payout Amount (₹)" required>
          <Input type="number" min="0" placeholder="45000" value={form.payoutAmount}
            onChange={(e) => setForm((f) => ({ ...f, payoutAmount: e.target.value }))} required />
        </FormField>
        {chit?.postPayoutContributionEnabled && (
          <FormField label={`Post-Payout Contribution (₹) — default ₹${chit.defaultPostPayoutContribution?.toLocaleString() ?? '—'}`}>
            <Input type="number" min="0" value={form.postPayoutContribution}
              onChange={(e) => setForm((f) => ({ ...f, postPayoutContribution: e.target.value }))} />
          </FormField>
        )}
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.reservationMonth || !form.payoutAmount} className="flex-1">
            {isPinned ? 'Fill Slot' : 'Add Slot'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const STATUS_COLORS = {
  RESERVED:    'bg-blue-50 text-blue-700',
  UNALLOCATED: 'bg-gray-100 text-gray-500',
  PROCESSED:   'bg-green-50 text-green-700',
  VOIDED:      'bg-red-50 text-red-400 line-through',
};

// Safely format a reservation month string ("2027-01-01") into "Jan 2027"
// Uses string splitting to avoid UTC/local timezone offset bugs
// Given the chit's startDate and a 1-based cycle number, returns the ISO due date
// for that cycle (same day of month as start, clamped to end of target month).
function computeDefaultDueDate(startDateStr, cycleNum) {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length < 3) return '';
  const [y, m, d] = parts;
  // Target month = startMonth + (cycleNum - 1)
  const targetMonth = m - 1 + (cycleNum - 1);  // 0-indexed months from JS Date
  const targetYear  = y + Math.floor(targetMonth / 12);
  const targetMon   = targetMonth % 12;          // 0-indexed
  const lastDay     = new Date(targetYear, targetMon + 1, 0).getDate();
  const day         = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatMonthLabel(dateStr, fallbackMonth) {
  if (!dateStr) return fallbackMonth != null ? `Month ${fallbackMonth}` : '—';
  const parts = dateStr.substring(0, 7).split('-');
  if (parts.length < 2) return '—';
  const [year, month] = parts.map(Number);
  if (!year || !month) return '—';
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// ─── Member info hover card ───────────────────────────────────────────────────
// Uses position:fixed so it's never clipped by the table's overflow-hidden.
function MemberInfoPopover({ member }) {
  const [coords, setCoords] = useState(null);

  // Lazy-fetch total outstanding only while the popover is visible
  const { data: totalOutstanding } = useQuery({
    queryKey: ['member-total-balance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!coords && !!member?.id,
    staleTime: 30_000,
  });

  if (!member) return null;
  const isClear = totalOutstanding !== undefined && Number(totalOutstanding) <= 0;

  return (
    <>
      <span className="inline-flex cursor-help flex-shrink-0"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
        }}
        onMouseLeave={() => setCoords(null)}
      >
        <Info size={13} className="text-gray-400 hover:text-[#1E3A5F] transition-colors" />
      </span>
      {coords && (
        <div
          className="fixed w-60 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-[9999] pointer-events-none"
          style={{ left: coords.x, top: coords.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-semibold text-gray-900 text-sm">{member.fullName}</p>
          {member.phone && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <Phone size={11} className="flex-shrink-0" /> {member.phone}
            </div>
          )}
          {member.email && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <Mail size={11} className="flex-shrink-0" /> {member.email}
            </div>
          )}
          {member.city && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <MapPin size={11} className="flex-shrink-0" /> {member.city}
            </div>
          )}
          {/* Outstanding balance */}
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {totalOutstanding === undefined ? (
              <span className="text-xs text-gray-400">Loading balance…</span>
            ) : isClear ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-xs font-medium text-green-700">Clear — no dues</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-xs font-medium text-red-600">
                  Outstanding: ₹{Number(totalOutstanding).toLocaleString('en-IN')}
                </span>
              </>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-[5px] border-r-[5px] border-t-[5px]
            border-l-transparent border-r-transparent border-t-gray-200" />
        </div>
      )}
    </>
  );
}

// ─── Void confirmation modal ─────────────────────────────────────────────────
// onConfirm({ reason, replaceAt }) — replaceAt is 'same' | 'end'
function VoidSlotModal({ slot, memberName, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');
  const [replaceAt, setReplaceAt] = useState('same');
  const monthLabel = formatMonthLabel(slot.reservationMonth, slot.monthNumber);
  return (
    <Modal title="Void Reservation Slot" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-800">
            Voiding <strong>{monthLabel}</strong>
            {memberName ? ` — ${memberName}` : ''}
          </p>
          <p className="text-xs text-red-600 mt-1">
            The slot will be marked VOIDED and kept for audit. A blank replacement will be added so the total count stays at {slot.monthNumber}.
          </p>
        </div>
        <FormField label="Reason for voiding" required>
          <Textarea
            placeholder="e.g. Member withdrew, chit restructured…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </FormField>
        <FormField label="Add replacement slot at">
          <div className="flex flex-col gap-2 mt-1">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="radio" name="replaceAt" value="same" checked={replaceAt === 'same'}
                onChange={() => setReplaceAt('same')}
                className="mt-0.5 accent-[#1E3A5F]" />
              <div>
                <span className="text-sm font-medium text-gray-800">Same position — {monthLabel}</span>
                <p className="text-xs text-gray-400">New UNALLOCATED slot takes slot #{slot.monthNumber}. Useful when reassigning the same month to another member.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="radio" name="replaceAt" value="end" checked={replaceAt === 'end'}
                onChange={() => setReplaceAt('end')}
                className="mt-0.5 accent-[#1E3A5F]" />
              <div>
                <span className="text-sm font-medium text-gray-800">End of schedule</span>
                <p className="text-xs text-gray-400">Replacement goes after the last slot. Position {slot.monthNumber} stays voided in history.</p>
              </div>
            </label>
          </div>
        </FormField>
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm({ reason, replaceAt })} disabled={!reason.trim()} loading={loading} className="flex-1">
            <XCircle size={13} /> Void Slot
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SwapSlotsModal({ chitId, slots, memberMap, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [slotAId, setSlotAId] = useState('');
  const [slotBId, setSlotBId] = useState('');

  const reserved = slots.filter((s) => s.status === 'RESERVED');

  const slotA = reserved.find((s) => s.id === slotAId);
  const slotB = reserved.find((s) => s.id === slotBId);

  const slotLabel = (s) => {
    const month = formatMonthLabel(s.reservationMonth, s.monthNumber);
    const name  = s.memberId ? (memberMap[String(s.memberId)]?.fullName ?? memberMap[String(s.memberId)]?.name ?? 'Unknown') : 'Unallocated';
    return `${month} — ${name}`;
  };

  const swapMutation = useMutation({
    mutationFn: () => swapSlots({ chitId, slotAId, slotBId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      toast.success('Slots swapped');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to swap slots'),
  });

  const canSwap = slotAId && slotBId && slotAId !== slotBId;

  return (
    <Modal title="Swap Reservation Slots" onClose={onClose} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Select two RESERVED slots to swap their assigned members. Payout amounts stay with their original months.
        </p>

        <div className="space-y-3">
          <FormField label="Slot A">
            <Select value={slotAId} onChange={(e) => setSlotAId(e.target.value)}>
              <option value="">Select a slot…</option>
              {reserved.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === slotBId}>
                  {slotLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="h-px w-16 bg-gray-200" />
              <ArrowLeftRight size={16} />
              <div className="h-px w-16 bg-gray-200" />
            </div>
          </div>

          <FormField label="Slot B">
            <Select value={slotBId} onChange={(e) => setSlotBId(e.target.value)}>
              <option value="">Select a slot…</option>
              {reserved.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === slotAId}>
                  {slotLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {canSwap && slotA && slotB && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Preview</p>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
              <div className="text-center">
                <p className="font-medium text-gray-800">
                  {slotA.memberId ? (memberMap[String(slotA.memberId)]?.fullName ?? memberMap[String(slotA.memberId)]?.name) : 'Unallocated'}
                </p>
                <p className="text-xs text-gray-500">{formatMonthLabel(slotA.reservationMonth, slotA.monthNumber)}</p>
                <p className="text-xs text-gray-400">₹{Number(slotA.payoutAmount ?? 0).toLocaleString()} payout stays</p>
              </div>
              <ArrowLeftRight size={16} className="text-blue-500 flex-shrink-0" />
              <div className="text-center">
                <p className="font-medium text-gray-800">
                  {slotB.memberId ? (memberMap[String(slotB.memberId)]?.fullName ?? memberMap[String(slotB.memberId)]?.name) : 'Unallocated'}
                </p>
                <p className="text-xs text-gray-500">{formatMonthLabel(slotB.reservationMonth, slotB.monthNumber)}</p>
                <p className="text-xs text-gray-400">₹{Number(slotB.payoutAmount ?? 0).toLocaleString()} payout stays</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => swapMutation.mutate()}
            disabled={!canSwap}
            loading={swapMutation.isPending}
            className="flex-1"
          >
            <ArrowLeftRight size={13} /> Confirm Swap
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReservationScheduleTab({ chitId, chit }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { user } = useAuth();
  const canEdit = user?.role !== 'MANAGER' || chit?.status === 'DRAFT';
  const [showAdd, setShowAdd] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [voidingSlot, setVoidingSlot] = useState(null);    // slot being confirmed for void
  const [deletingSlot, setDeletingSlot] = useState(null);  // voided slot being permanently deleted
  const [fillingSlot, setFillingSlot] = useState(null);    // voided slot being filled with a new slot at same position

  // Local edits keyed by slot.id — only set when a user modifies a row
  const [edits, setEdits] = useState({});

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminOption = me ? { id: me.id, fullName: `${me.username} (Admin)` } : null;
  const memberMap = Object.fromEntries([
    ...(adminOption ? [[String(adminOption.id), adminOption]] : []),
    ...allMembers.map((m) => [String(m.id), m]),
  ]);
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  // Current displayed value for a field — edit state wins over server state
  function getEdit(slot) {
    return edits[slot.id] ?? {
      memberId:     String(slot.memberId ?? ''),
      payoutAmount: String(slot.payoutAmount ?? ''),
    };
  }

  // A row is dirty only if the user actually changed something from the server value
  function isDirty(slot) {
    const e = edits[slot.id];
    if (!e) return false;
    const memberChanged = (e.memberId || null) !== (slot.memberId ? String(slot.memberId) : null);
    const serverPayout  = slot.payoutAmount != null ? Number(slot.payoutAmount) : null;
    const editPayout    = e.payoutAmount    ? Number(e.payoutAmount)            : null;
    const payoutChanged = editPayout !== serverPayout;
    return memberChanged || payoutChanged;
  }

  // Initialise edit record from server state on first touch, then overlay the changed key
  function updateEdit(slot, key, val) {
    setEdits((prev) => ({
      ...prev,
      [slot.id]: {
        memberId:     String(slot.memberId ?? ''),
        payoutAmount: String(slot.payoutAmount ?? ''),
        ...(prev[slot.id] ?? {}),
        [key]: val,
      },
    }));
  }

  const saveMutation = useMutation({
    mutationFn: ({ slot, edit }) => updateReservationSlot({
      chitId,
      reservationId: slot.id,
      reservationMonth: slot.reservationMonth,
      memberId: edit.memberId || null,
      payoutAmount: edit.payoutAmount ? Number(edit.payoutAmount) : null,
      postPayoutContribution: slot.postPayoutContribution ?? null,
    }),
    onSuccess: (_, { slot }) => {
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      setEdits((prev) => { const n = { ...prev }; delete n[slot.id]; return n; });
      toast.success('Slot saved');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to save'),
  });

  // Void: mark slot as VOIDED, then add a replacement UNALLOCATED slot.
  // replaceAt === 'same' → replacement pins to the voided slot's monthNumber + reservationMonth
  // replaceAt === 'end'  → replacement goes after the last existing slot
  const voidMutation = useMutation({
    mutationFn: ({ slot, reason }) => removeReservationSlot({ chitId, reservationId: slot.id, reason }),
    onSuccess: async (_, { slot, replaceAt }) => {
      console.log('[voidMutation] replaceAt:', replaceAt, '| slot.monthNumber:', slot?.monthNumber, '| slot.reservationMonth:', slot?.reservationMonth);
      let replacementMonth;
      let replacementMonthNumber;

      if (replaceAt === 'same') {
        replacementMonth = slot.reservationMonth; // same calendar month as voided slot
        replacementMonthNumber = slot.monthNumber;
      } else {
        // Calculate next month after the last existing slot
        const maxDate = slots.reduce((max, s) => {
          const parts = (s.reservationMonth ?? '').substring(0, 7).split('-').map(Number);
          if (parts.length < 2 || !parts[0] || !parts[1]) return max;
          const d = new Date(parts[0], parts[1] - 1, 1);
          return d > max ? d : max;
        }, new Date(0));
        const nextYear = maxDate.getMonth() === 11 ? maxDate.getFullYear() + 1 : maxDate.getFullYear();
        const nextMon  = (maxDate.getMonth() + 1) % 12 + 1;
        replacementMonth = `${nextYear}-${String(nextMon).padStart(2, '0')}-01`;
        replacementMonthNumber = undefined; // backend assigns max+1
      }

      try {
        const payload = {
          chitId,
          reservationMonth: replacementMonth,
          monthNumber: replacementMonthNumber,
          memberId: null,
          payoutAmount: replaceAt === 'same' ? (slot.payoutAmount ?? null) : null,
        };
        console.log('[voidMutation] addReservationSlot payload:', payload);
        await addReservationSlot(payload);
      } catch (e) {
        console.error('[voidMutation] replacement slot add failed:', e?.response?.data ?? e);
      }

      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      setVoidingSlot(null);
      toast.success(
        replaceAt === 'same'
          ? 'Slot voided — blank replacement added at same position'
          : 'Slot voided — blank replacement added at end'
      );
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to void slot'),
  });

  // Unvoid: restore the slot (PUT sets it back to UNALLOCATED/RESERVED),
  // then remove the last UNALLOCATED slot (the replacement that was added on void)
  const unvoidMutation = useMutation({
    mutationFn: (slot) => updateReservationSlot({
      chitId,
      reservationId: slot.id,
      reservationMonth: slot.reservationMonth,
      memberId: slot.memberId || null,
      payoutAmount: slot.payoutAmount ? Number(slot.payoutAmount) : null,
      postPayoutContribution: slot.postPayoutContribution ?? null,
    }),
    onSuccess: async () => {
      // Delete the last UNALLOCATED slot (the replacement added at void time)
      await qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      const fresh = qc.getQueryData(['reservations', chitId]) ?? [];
      const lastUnallocated = [...fresh]
        .reverse()
        .find((s) => s.status === 'UNALLOCATED');
      if (lastUnallocated) {
        try {
          await removeReservationSlot({ chitId, reservationId: lastUnallocated.id });
        } catch {
          // Non-fatal — slot was restored even if replacement removal fails
        }
      }
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      toast.success('Slot restored');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to restore slot'),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (slot) => hardDeleteReservationSlot({ chitId, reservationId: slot.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      setDeletingSlot(null);
      toast.success('Slot permanently deleted');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to delete slot'),
  });

  const active = slots.filter((s) => s.status !== 'VOIDED');
  const totalPayout = active.reduce((sum, s) => sum + Number(s.payoutAmount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{active.length} active slots</p>
          {totalPayout > 0 && (
            <p className="text-xs text-gray-400">Total planned payout: ₹{totalPayout.toLocaleString()}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {slots.filter((s) => s.status === 'RESERVED').length >= 2 && (
              <Button variant="secondary" size="sm" onClick={() => setShowSwap(true)}>
                <ArrowLeftRight size={14} /> Swap Slots
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Slot
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : slots.length === 0 ? (
          <EmptyState icon={List} title="No schedule yet"
            message="Add reservation slots to build the payout schedule."
            action={canEdit ? 'Add Slot' : undefined}
            onAction={canEdit ? () => setShowAdd(true) : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b border-gray-100">
                  {['Slot', 'Member', 'Payout Amount (₹)', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {slots.map((slot, i) => {
                  const isVoided = slot.status === 'VOIDED';
                  const edit     = getEdit(slot);
                  const dirty    = isDirty(slot);
                  const memberObj  = slot.memberId ? memberMap[String(slot.memberId)] : null;
                  const memberName = memberObj
                    ? (memberObj.fullName ?? memberObj.name)
                    : slot.memberId ? `#${slot.memberId}` : null;
                  return (
                    <tr key={slot.id} className={`${isVoided ? 'bg-red-50/40' : 'bg-white hover:bg-gray-50'} transition-colors`}>

                      {/* ── Slot # + month label ── */}
                      <td className="px-5 py-3 w-28">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`w-7 h-7 rounded-full text-xs font-bold inline-flex items-center justify-center flex-shrink-0 ${
                            isVoided ? 'bg-red-100 text-red-400 line-through' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {i + 1}
                          </span>
                          <span className={`text-xs whitespace-nowrap ${isVoided ? 'text-red-300 line-through' : 'text-gray-400'}`}>
                            {formatMonthLabel(slot.reservationMonth, slot.monthNumber)}
                          </span>
                        </div>
                      </td>

                      {/* ── Member ── */}
                      <td className="px-5 py-3">
                        {isVoided ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-red-300 italic text-sm line-through">
                              {memberName ?? 'Unallocated'}
                            </span>
                            {memberObj && <MemberInfoPopover member={memberObj} />}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {(() => {
                              const adminHeld = chit?.adminHeldSpotsCount ?? 0;
                              const allocatedAdminSlots = adminOption
                                ? slots.filter((s) => s.id !== slot.id && String(s.memberId) === String(adminOption.id)).length
                                : 0;
                              const isAlreadyAdmin = adminOption && edit.memberId === String(adminOption.id);
                              const canAddAdmin = adminHeld > 0 && (isAlreadyAdmin || allocatedAdminSlots < adminHeld);
                              return (
                                <Select
                                  value={edit.memberId}
                                  onChange={(e) => updateEdit(slot, 'memberId', e.target.value)}
                                  className="min-w-44"
                                >
                                  <option value="">Unallocated</option>
                                  {adminOption && canAddAdmin && (
                                    <option key={adminOption.id} value={adminOption.id}>{adminOption.fullName}</option>
                                  )}
                                  {activeMembers.map((m) => (
                                    <option key={m.id} value={m.id}>{m.fullName ?? m.name}</option>
                                  ))}
                                </Select>
                              );
                            })()}
                            {edit.memberId && <MemberInfoPopover member={memberMap[edit.memberId]} />}
                          </div>
                        )}
                      </td>

                      {/* ── Payout amount ── */}
                      <td className="px-5 py-3">
                        {isVoided ? (
                          <span className="font-semibold text-red-300 line-through">
                            {slot.payoutAmount ? `₹${Number(slot.payoutAmount).toLocaleString()}` : '—'}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            value={edit.payoutAmount}
                            onChange={(e) => updateEdit(slot, 'payoutAmount', e.target.value)}
                            className="w-36"
                          />
                        )}
                      </td>

                      {/* ── Status badge + last-updated ── */}
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[slot.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {slot.status}
                          </span>
                          {isVoided && slot.voidReason && (
                            <span className="text-xs text-red-400 max-w-36 truncate" title={slot.voidReason}>
                              {slot.voidReason}
                            </span>
                          )}
                          {slot.updatedAt && (
                            <span className="text-xs text-gray-400" title={new Date(slot.updatedAt).toLocaleString('en-IN')}>
                              {new Date(slot.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ── Actions ── */}
                      <td className="px-5 py-3">
                        {canEdit ? (isVoided ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Button variant="secondary" size="sm"
                              loading={unvoidMutation.isPending}
                              onClick={() => unvoidMutation.mutate(slot)}>
                              <CheckCircle size={13} /> Restore
                            </Button>
                            <Button size="sm"
                              onClick={() => setFillingSlot(slot)}
                              title="Add a new slot at this same position">
                              <Plus size={13} /> Fill Slot
                            </Button>
                            <Button variant="danger" size="sm"
                              onClick={() => setDeletingSlot(slot)}>
                              <Trash2 size={13} /> Delete
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            {dirty && (
                              <Button size="sm"
                                loading={saveMutation.isPending}
                                onClick={() => saveMutation.mutate({ slot, edit })}>
                                <CheckCircle size={13} /> Save
                              </Button>
                            )}
                            <Button variant="danger" size="sm"
                              onClick={() => setVoidingSlot(slot)}>
                              <XCircle size={13} /> Void
                            </Button>
                          </div>
                        )) : (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddSlotModal chitId={chitId} chit={chit} onClose={() => setShowAdd(false)} />}

      {fillingSlot && (
        <AddSlotModal
          chitId={chitId}
          chit={chit}
          prefill={{ monthNumber: fillingSlot.monthNumber, reservationMonth: fillingSlot.reservationMonth, payoutAmount: fillingSlot.payoutAmount }}
          onClose={() => setFillingSlot(null)}
        />
      )}

      {showSwap && (
        <SwapSlotsModal
          chitId={chitId}
          slots={slots}
          memberMap={memberMap}
          onClose={() => setShowSwap(false)}
        />
      )}

      {voidingSlot && (
        <VoidSlotModal
          slot={voidingSlot}
          memberName={memberMap[String(voidingSlot.memberId)]?.fullName ?? null}
          loading={voidMutation.isPending}
          onClose={() => setVoidingSlot(null)}
          onConfirm={({ reason, replaceAt }) => voidMutation.mutate({ slot: voidingSlot, reason, replaceAt })}
        />
      )}

      {deletingSlot && (
        <DestructiveDialog
          title="Permanently Delete Slot"
          description={`This will permanently delete the ${formatMonthLabel(deletingSlot.reservationMonth, deletingSlot.monthNumber)} slot. The voided record and audit trail will be erased. This cannot be undone.`}
          confirmWord="DELETE"
          actionLabel="Permanently Delete"
          loading={hardDeleteMutation.isPending}
          onConfirm={() => hardDeleteMutation.mutate(deletingSlot)}
          onClose={() => setDeletingSlot(null)}
        />
      )}
    </div>
  );
}

// Custom React dropdown for picking a reservation slot — shows "Slot #N (Mon YYYY)" labels.
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

  const label = (s) =>
    `Slot #${s.monthNumber} (${formatMonthLabel(s.reservationMonth, s.monthNumber)})`;

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
                s.id === value ? 'bg-blue-50 text-[#1E3A5F] font-medium' : 'text-gray-800'
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

// ─── Months Tab ───────────────────────────────────────────────────────────────
function OpenDrawModal({ chitId, chit, draws, onClose }) {
  // Derive draw number before any hooks so it's available to useState initializer
  const nextCycleNum = draws.length > 0 ? Math.max(...draws.map((c) => c.monthNumber)) + 1 : 1;

  const qc = useQueryClient();
  const toast = useToastContext();
  const [step, setStep] = useState(1);
  const [dueDate, setDueDate] = useState(() => computeDefaultDueDate(chit?.startDate, nextCycleNum));
  const [addExtra, setAddExtra] = useState(false);
  const [extraMemberId, setExtraMemberId] = useState('');
  const [extraSlotId, setExtraSlotId] = useState('');
  const [preview, setPreview] = useState(null);

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: meUser } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminMemberOption = meUser ? { id: meUser.id, fullName: `${meUser.username} (Admin)` } : null;
  const memberMap = Object.fromEntries([
    ...(adminMemberOption ? [[String(adminMemberOption.id), adminMemberOption]] : []),
    ...allMembers.map((m) => [m.id, m]),
  ]);
  // Only ACTIVE members can be selected for additional early payout
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  const baseInstallment    = Number(chit.installmentAmount ?? (chit.chitValue / chit.totalMembers) ?? 0);
  const defaultPostPayout  = Number(chit.defaultPostPayoutContribution ?? baseInstallment);

  // Deduplicated member IDs from enrollments (DB has duplicate rows per member)
  const enrolledMemberIds = [...new Set(enrollments.map((e) => e.memberId ?? e.id))];

  // Outstanding balances from previous cycles — positive = member owes, negative = credit
  const { data: balanceMap = {} } = useQuery({
    queryKey: ['balances', chitId, enrolledMemberIds.join(',')],
    queryFn: () => getMemberBalanceBulk(enrolledMemberIds),
    enabled: enrolledMemberIds.length > 0,
  });

  // Primary winner: the first unpaid slot in schedule order (lowest monthNumber among all RESERVED slots).
  // We do NOT pin to nextCycleNum because a lower-numbered slot may still be pending —
  // e.g. slot 19 is RESERVED for Anita while the slot-19 cycle was already opened for a
  // different holder. In a chit fund, schedule order wins: pay the lowest slot first.
  const primaryWinnerSlot = [...reservations]
    .filter((r) => r.status === 'RESERVED')
    .sort((a, b) => (a.monthNumber ?? 999) - (b.monthNumber ?? 999))[0] ?? null;
  const cyclePayoutAmount = primaryWinnerSlot?.payoutAmount ? Number(primaryWinnerSlot.payoutAmount) : null;

  // Candidates for additional early payout: active enrolled members (+ admin) with RESERVED slots, excluding primary winner
  const activeMemberIds = new Set([
    ...activeMembers.map((m) => String(m.id)),
    ...(adminMemberOption ? [String(adminMemberOption.id)] : []),
  ]);
  const extraCandidates = (() => {
    const seen = new Set();
    return enrollments.filter((e) => {
      const mid = e.memberId ?? e.id;
      if (seen.has(mid)) return false;
      if (!activeMemberIds.has(String(mid))) return false;
      if (mid === primaryWinnerSlot?.memberId) return false;
      if (!reservations.some((r) => r.memberId === mid && r.status === 'RESERVED')) return false;
      seen.add(mid);
      return true;
    });
  })();

  // RESERVED slots belonging to the selected extra member
  const extraMemberSlots = extraMemberId
    ? reservations.filter((r) => r.memberId === extraMemberId && r.status === 'RESERVED')
    : [];

  function computePreview() {
    const seen = new Set();
    const members = [];
    for (const e of enrollments) {
      const mid = e.memberId ?? e.id;
      if (seen.has(mid)) continue;   // skip duplicate enrollment rows
      seen.add(mid);

      const memberSlots    = reservations.filter((r) => r.memberId === mid);
      const processedSlots = memberSlots.filter((r) => r.status === 'PROCESSED');
      const reservedSlots  = memberSlots.filter((r) => r.status === 'RESERVED');

      // This cycle's installment: post-payout rate per settled slot + base rate per pending slot
      const processedAmt = processedSlots.reduce(
        (s, sl) => s + Number(sl.postPayoutContribution ?? defaultPostPayout), 0
      );
      const amountDue = processedAmt + reservedSlots.length * baseInstallment;

      const previousBalance = Number(balanceMap[mid] ?? 0);
      const isPrimary = mid === primaryWinnerSlot?.memberId;
      const isExtra   = addExtra && mid === extraMemberId;
      const isWinner  = isPrimary || isExtra;
      // Net payout = what the winner physically receives (payout minus this month's installment)
      const netPayout = isWinner && cyclePayoutAmount !== null ? cyclePayoutAmount - amountDue : null;

      members.push({
        memberId: mid,
        memberName:      memberMap[mid]?.fullName ?? `Member #${mid}`,
        phone:           memberMap[mid]?.phone ?? null,
        previousBalance,
        processedCount:  processedSlots.length,
        reservedCount:   reservedSlots.length,
        amountDue,
        isWinner, isPrimary, isExtra,
        netPayout,
      });
    }
    setPreview({ cycleNum: nextCycleNum, members });
    setStep(2);
  }

  // Slot IDs to mark PROCESSED when cycle is opened
  const slotsToProcess = [
    ...(primaryWinnerSlot ? [primaryWinnerSlot.id] : []),
    ...(addExtra && extraSlotId ? [extraSlotId] : []),
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      await openDraw({
        chitId,
        monthNumber: nextCycleNum,
        dueDate,
        installmentAmount: baseInstallment,
        maxCycles: chit?.totalMembers ?? nextCycleNum,
        members: preview.members.map((m) => ({ memberId: m.memberId, amountDue: m.amountDue })),
      });

      // Mark winner slots PROCESSED — commitment is made at cycle open time
      if (slotsToProcess.length > 0) {
        await Promise.all(slotsToProcess.map((sid) => markSlotProcessed({ chitId, reservationId: sid }).catch(() => {})));
      }

      // Allocate winner(s) — records who won this cycle; payout is managed separately in Winners tab
      const winnersToRecord = [
        ...(primaryWinnerSlot ? [{ memberId: primaryWinnerSlot.memberId, slot: primaryWinnerSlot }] : []),
        ...(addExtra && extraMemberId && extraSlotId
          ? [{ memberId: extraMemberId, slot: reservations.find((r) => r.id === extraSlotId) }]
          : []),
      ];
      await Promise.all(
        winnersToRecord.map(({ memberId, slot }) =>
          recordWinner({
            chitId,
            winnerId: memberId,
            monthNumber: nextCycleNum,
            winningAmount: slot?.payoutAmount ?? chit?.chitValue ?? 0,
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

  const totalCollection = preview?.members.reduce((s, m) => s + m.amountDue, 0) ?? 0;

  return (
    <Modal title={step === 1 ? `Open Draw ${nextCycleNum}` : `Draw ${nextCycleNum} Preview`} onClose={onClose} size="lg">
      {step === 1 ? (
        <form onSubmit={(e) => { e.preventDefault(); computePreview(); }} className="space-y-5">
          {/* Due date */}
          <FormField label="Due Date" required>
            <DateInput value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} required />
          </FormField>

          {/* Draw info bar */}
          <div className="flex items-center gap-4 text-sm bg-gray-50 rounded-lg px-4 py-3">
            <span className="text-gray-500">Draw <strong className="text-gray-800">#{nextCycleNum}</strong></span>
            <span className="text-gray-300">·</span>
            {primaryWinnerSlot ? (
              <span className="text-gray-500">
                Winner: <strong className="text-gray-800">
                  {memberMap[primaryWinnerSlot.memberId]?.fullName ?? 'Unknown'}
                </strong>
                {cyclePayoutAmount && (
                  <span className="ml-1 text-amber-700 font-medium">· ₹{cyclePayoutAmount.toLocaleString()} payout</span>
                )}
              </span>
            ) : (
              <span className="text-gray-400 italic">No winner scheduled — VOIDED draw</span>
            )}
          </div>

          {/* Additional early payout toggle */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={addExtra}
                onChange={(e) => { setAddExtra(e.target.checked); setExtraMemberId(''); setExtraSlotId(''); }}
                className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F]" />
              <div>
                <p className="text-sm font-medium text-gray-800">Pay out an additional member this draw</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Both receive ₹{cyclePayoutAmount?.toLocaleString() ?? '—'} (this draw's payout). Both slots settle immediately.
                </p>
              </div>
            </label>

            {addExtra && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <FormField label="Member">
                  <Select value={extraMemberId}
                    onChange={(e) => { setExtraMemberId(e.target.value); setExtraSlotId(''); }}>
                    <option value="">Select member…</option>
                    {[...extraCandidates].sort((a, b) => {
                      const nameA = memberMap[a.memberId ?? a.id]?.fullName ?? '';
                      const nameB = memberMap[b.memberId ?? b.id]?.fullName ?? '';
                      return nameA.localeCompare(nameB);
                    }).map((e) => {
                      const mid = e.memberId ?? e.id;
                      return <option key={mid} value={mid}>{memberMap[mid]?.fullName ?? `Member #${mid}`}</option>;
                    })}
                  </Select>
                </FormField>

                <FormField label="Their slot to settle">
                  <SlotPickerDropdown
                    slots={extraMemberSlots}
                    value={extraSlotId}
                    onChange={setExtraSlotId}
                    disabled={!extraMemberId}
                    placeholder="Select slot…"
                  />
                </FormField>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit"
              disabled={enrollments.length === 0 || (addExtra && (!extraMemberId || !extraSlotId))}
              className="flex-1">
              Preview →
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
            <span>Cycle <strong>#{preview.cycleNum}</strong></span>
            <span className="text-gray-300">·</span>
            <span>Due <strong>{new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
            {addExtra && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Double payout</span>
            )}
          </div>

          {/* Payout band */}
          {cyclePayoutAmount && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm flex items-center gap-3 flex-wrap">
              <span className="font-medium text-amber-800">Cycle payout: ₹{cyclePayoutAmount.toLocaleString()}</span>
              {addExtra && <span className="text-amber-600">disbursed to both winners</span>}
            </div>
          )}

          {/* Member table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-y-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">This Draw</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Net Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.members.map((m) => (
                    <tr
                      key={m.memberId}
                      className={m.isPrimary ? 'bg-amber-50' : m.isExtra ? 'bg-blue-50/50' : 'hover:bg-gray-50'}
                    >
                      {/* ── Member cell ── */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          {/* Name + winner badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-900">{m.memberName}</span>
                            {m.isPrimary && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🏆 Winner</span>
                            )}
                            {m.isExtra && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Early payout</span>
                            )}
                          </div>
                          {/* Phone */}
                          {m.phone && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Phone size={10} />{m.phone}
                            </span>
                          )}
                          {/* Previous balance tag */}
                          {m.previousBalance > 0 && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">
                              ₹{m.previousBalance.toLocaleString()} outstanding
                            </span>
                          )}
                          {m.previousBalance < 0 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full w-fit">
                              ₹{Math.abs(m.previousBalance).toLocaleString()} credit
                            </span>
                          )}
                          {/* Slot breakdown */}
                          <span className="text-xs text-gray-400 mt-0.5">
                            {[
                              m.processedCount > 0 ? `${m.processedCount} settled` : null,
                              m.reservedCount  > 0 ? `${m.reservedCount} pending`  : null,
                            ].filter(Boolean).join(' · ') || 'no slots'}
                          </span>
                        </div>
                      </td>

                      {/* ── This cycle installment ── */}
                      <td className="px-3 py-3 text-right align-top">
                        <span className="font-semibold text-gray-900">₹{m.amountDue.toLocaleString()}</span>
                      </td>

                      {/* ── Net payout (winners only) ── */}
                      <td className="px-3 py-3 text-right align-top">
                        {m.isWinner && m.netPayout !== null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-bold text-green-700">₹{m.netPayout.toLocaleString()}</span>
                            <span className="text-xs text-gray-400">after deduction</span>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200 sticky bottom-0">
                  <tr>
                    <td className="px-3 py-2.5 text-xs font-semibold text-gray-700">
                      Total collection · {preview.members.length} members
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-900">
                      ₹{totalCollection.toLocaleString()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {slotsToProcess.length > 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              {slotsToProcess.length === 1 ? '1 slot' : `${slotsToProcess.length} slots`} will be marked as settled on confirm.
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">← Back</Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="flex-1">
              Open Draw {nextCycleNum}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SkipDrawModal({ chitId, chit, enrollments, draws, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();

  const nextCycleNum = draws && draws.length > 0
    ? Math.max(...draws.map((c) => c.monthNumber)) + 1
    : 1;

  const [form, setForm] = useState({
    monthNumber: String(nextCycleNum),
    dueDate: computeDefaultDueDate(chit?.startDate, nextCycleNum),
    skipReason: '',
  });

  const baseInstallment = Number(chit?.installmentAmount ?? (chit?.chitValue / chit?.totalMembers) ?? 0);
  const uniqueMemberIds = [...new Set(enrollments.map((e) => e.memberId ?? e.id))];

  const mutation = useMutation({
    mutationFn: async () => {
      const monthNum = Number(form.monthNumber);
      await skipDraw({
        chitId,
        monthNumber: monthNum,
        dueDate: form.dueDate,
        installmentAmount: baseInstallment,
        memberIds: uniqueMemberIds,
        skipReason: form.skipReason,
      });
      // Shift all future schedule slots forward by 1 — the skipped month is a moratorium,
      // so the member who was due in this month moves to the next real cycle.
      await shiftReservations({ chitId, fromMonth: monthNum }).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      toast.success('Draw skipped — schedule shifted forward by 1 month');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to skip draw'),
  });

  return (
    <Modal title="Skip Draw" onClose={onClose} size="md">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Draw Number" required>
            <Input type="number" min="1" value={form.monthNumber}
              onChange={(e) => {
                const num = Number(e.target.value);
                setForm((f) => ({
                  ...f,
                  monthNumber: e.target.value,
                  dueDate: num > 0 ? computeDefaultDueDate(chit?.startDate, num) : f.dueDate,
                }));
              }} required />
          </FormField>
          <FormField label="Due Date" required>
            <DateInput value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} required />
          </FormField>
        </div>
        <FormField label="Skip Reason" required>
          <Input placeholder="e.g. Festival holiday, COVID, Admin decision" value={form.skipReason}
            onChange={(e) => setForm((f) => ({ ...f, skipReason: e.target.value }))} required />
        </FormField>
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          All {uniqueMemberIds.length} enrolled members will have this draw waived.
        </p>
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} variant="warning" className="flex-1">Skip Draw</Button>
        </div>
      </form>
    </Modal>
  );
}

const STATUS_ROW = {
  SETTLED:        { bg: 'bg-green-50',  dot: 'bg-green-500',  text: 'Settled'     },
  PARTIALLY_PAID: { bg: 'bg-amber-50',  dot: 'bg-amber-400',  text: 'Partial'     },
  OUTSTANDING:    { bg: 'bg-red-50',    dot: 'bg-red-400',    text: 'Outstanding' },
  WAIVED:         { bg: 'bg-gray-50',   dot: 'bg-gray-300',   text: 'Waived'      },
};

function PaymentStatusBadge({ status, overdue }) {
  const style = STATUS_ROW[status] ?? STATUS_ROW.OUTSTANDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full
      ${status === 'SETTLED'        ? 'bg-green-100 text-green-700'
      : status === 'PARTIALLY_PAID' ? 'bg-amber-100 text-amber-700'
      : status === 'WAIVED'         ? 'bg-gray-100 text-gray-500'
      : 'bg-red-100 text-red-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.text}
      {overdue && <span className="text-red-500">!</span>}
    </span>
  );
}

// ── Payment history modal — shows all cycles' records for a member in this chit ──
const BATCH_MODE_LABEL = { UPI: 'UPI', BANK_TRANSFER: 'Bank', CHEQUE: 'Cheque', CASH: 'Cash' };
const BATCH_STATUS_STYLE = {
  COMPLETED:           'bg-green-100 text-green-700',
  AWAITING_REMITTANCE: 'bg-amber-100 text-amber-700',
  VOIDED:              'bg-gray-100 text-gray-500 line-through',
};

function PaymentHistoryModal({ member, chitId, onCollect, onClose, initialTab = 'draws' }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [tab, setTab] = useState(initialTab);   // 'draws' | 'transactions'
  const [voidingId, setVoidingId]   = useState(null);   // batchId being voided
  const [voidReason, setVoidReason] = useState('');

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['paymentHistory', chitId, member?.id],
    queryFn: () => getPaymentHistory({ memberId: member.id, chitId }),
    enabled: !!member?.id && !!chitId,
  });

  const { data: batches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ['paymentBatches', chitId, member?.id],
    queryFn: () => getPaymentBatches({ memberId: member.id, chitId }),
    enabled: !!member?.id && !!chitId && tab === 'transactions',
  });

  const voidMutation = useMutation({
    mutationFn: () => voidPaymentBatch({ batchId: voidingId, reason: voidReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paymentBatches', chitId, member?.id] });
      qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, member?.id] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      toast.success('Payment voided — records reversed');
      setVoidingId(null);
      setVoidReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Void failed'),
  });

  const TAB_CLS = (active) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <Modal title={`Payment History — ${member?.fullName ?? 'Member'}`} onClose={onClose} size="lg">
      <div className="space-y-3">
        {member?.phone && (
          <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{member.phone}</p>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 -mb-1">
          <button className={TAB_CLS(tab === 'draws')}        onClick={() => setTab('draws')}>Draws</button>
          <button className={TAB_CLS(tab === 'transactions')} onClick={() => setTab('transactions')}>Transactions</button>
        </div>

        {/* ── Draws tab ── */}
        {tab === 'draws' && (
          loadingHistory
            ? <p className="text-sm text-gray-400 animate-pulse py-4 text-center">Loading…</p>
            : history.length === 0
            ? <p className="text-sm text-gray-400 italic py-4 text-center">No payment records found.</p>
            : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Draw</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Due</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((r) => {
                      const canCollect = r.status === 'OUTSTANDING' || r.status === 'PARTIALLY_PAID';
                      return (
                        <tr key={r.id} className={`${STATUS_ROW[r.status]?.bg ?? ''} hover:brightness-[0.98]`}>
                          <td className="px-4 py-2.5 font-medium text-gray-800">Draw {r.monthNumber}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">₹{Number(r.amountDue).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-green-700">
                            {Number(r.amountPaid) > 0 ? `₹${Number(r.amountPaid).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            {Number(r.balance) > 0
                              ? <span className="text-red-600">₹{Number(r.balance).toLocaleString()}</span>
                              : <span className="text-green-600">✓</span>}
                          </td>
                          <td className="px-3 py-2.5"><PaymentStatusBadge status={r.status} overdue={r.overdue} /></td>
                          <td className="px-3 py-2.5 text-right">
                            {canCollect && (
                              <Button size="sm" onClick={() => { onCollect(r, member); onClose(); }}>
                                Collect
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        )}

        {/* ── Transactions tab ── */}
        {tab === 'transactions' && (
          loadingBatches
            ? <p className="text-sm text-gray-400 animate-pulse py-4 text-center">Loading…</p>
            : batches.length === 0
            ? <p className="text-sm text-gray-400 italic py-4 text-center">No transactions recorded yet.</p>
            : (
              <div className="space-y-3">
                {batches.map((b) => {
                  const isVoiding = voidingId === b.id;
                  const isVoided  = b.status === 'VOIDED';
                  const date      = b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

                  return (
                    <div key={b.id} className={`border rounded-lg p-4 space-y-2 ${isVoided ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-semibold ${isVoided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              ₹{Number(b.totalAmount).toLocaleString()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_STYLE[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {b.status === 'AWAITING_REMITTANCE' ? 'Pending Remittance' : b.status === 'VOIDED' ? 'Voided' : 'Settled'}
                            </span>
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {BATCH_MODE_LABEL[b.paymentMode] ?? b.paymentMode}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{date}</span>
                        </div>

                        {!isVoided && (
                          <button
                            onClick={() => { setVoidingId(isVoiding ? null : b.id); setVoidReason(''); }}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap"
                          >
                            {isVoiding ? 'Cancel' : 'Void'}
                          </button>
                        )}
                      </div>

                      {/* Allocations */}
                      {b.allocations?.length > 0 && (
                        <div className="pl-1 space-y-0.5">
                          {b.allocations.map((a, i) => (
                            <p key={i} className="text-xs text-gray-500">
                              → Draw {a.monthNumber}: ₹{Number(a.allocatedAmount).toLocaleString()}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Void reason (already voided) */}
                      {isVoided && b.voidReason && (
                        <p className="text-xs text-gray-400 italic">Voided: {b.voidReason}</p>
                      )}

                      {/* Void inline form */}
                      {isVoiding && (
                        <div className="flex gap-2 pt-1">
                          <Input
                            autoFocus
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            placeholder="Reason for voiding…"
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!voidReason.trim() || voidMutation.isPending}
                            onClick={() => voidMutation.mutate()}
                          >
                            {voidMutation.isPending ? 'Voiding…' : 'Confirm Void'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}

        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Per-cycle payment rows (lazy-loaded when the card is expanded) ────────────
function DrawPaymentRows({ draw, chitId, memberMap, onCollect, onView, onViewTransactions }) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['drawPayments', draw.id],
    queryFn: () => getDrawPayments(draw.id),
    enabled: !!draw.id,
  });

  if (isLoading) return (
    <div className="px-5 py-4 border-t border-gray-100">
      <p className="text-xs text-gray-400 animate-pulse">Loading members…</p>
    </div>
  );
  if (payments.length === 0) return (
    <div className="px-5 py-4 border-t border-gray-100">
      <p className="text-xs text-gray-400 italic">No payment records found.</p>
    </div>
  );

  return (
    <div className="border-t border-gray-100">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map((p) => {
            const member = memberMap[p.memberId];
            const style  = STATUS_ROW[p.status] ?? STATUS_ROW.OUTSTANDING;
            const canCollect   = p.status === 'OUTSTANDING' || p.status === 'PARTIALLY_PAID';
            const hasPaidSomething = Number(p.amountPaid) > 0;
            return (
              <tr key={p.id} className={`${style.bg} hover:brightness-[0.98] transition-all`}>
                <td className="px-5 py-3">
                  <div className="flex flex-col gap-0.5">
                    <MemberLink id={member?.status !== undefined ? p.memberId : null} name={member?.fullName ?? `Member #${String(p.memberId).slice(0, 8)}`} className="font-medium text-gray-900" />
                    {member?.phone && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Phone size={10} />{member.phone}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-gray-700 font-medium">₹{Number(p.amountDue).toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-green-700 font-medium">
                  {hasPaidSomething ? `₹${Number(p.amountPaid).toLocaleString()}` : '—'}
                </td>
                <td className="px-3 py-3 text-right font-semibold">
                  {Number(p.balance) > 0
                    ? <span className="text-red-600">₹{Number(p.balance).toLocaleString()}</span>
                    : <span className="text-green-600">✓</span>}
                </td>
                <td className="px-3 py-3">
                  <PaymentStatusBadge status={p.status} overdue={p.overdue} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-1.5 justify-end items-center">
                    {/* Transactions (void/history) — visible whenever any payment was made */}
                    {hasPaidSomething && (
                      <button
                        title="View & void transactions"
                        onClick={() => onViewTransactions(p, member)}
                        className="text-xs text-[#1E3A5F] hover:underline font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        Transactions
                      </button>
                    )}
                    {/* History — always available */}
                    <button
                      title="Payment history by draw"
                      onClick={() => onView(p, member)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-gray-100 transition-colors"
                    >
                      <Eye size={14} />
                    </button>
                    {/* Collect — only for outstanding/partial */}
                    {canCollect && (
                      <Button size="sm" onClick={() => onCollect(p, member)}>
                        Collect
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Collect payment modal — two tabs: settle now vs via worker ─────────────────
function CollectPaymentModal({ paymentRecord, member, chitId, onClose }) {
  const { user } = useAuth();
  const isWorker = user?.role === 'WORKER';
  const qc = useQueryClient();
  const toast = useToastContext();
  const balance = Number(paymentRecord?.balance ?? 0);

  const [tab, setTab] = useState('direct');           // 'direct' | 'worker'
  const [amount, setAmount] = useState(String(balance));
  // Workers can only collect cash physically — no UPI/Bank options
  const [paymentMode, setPaymentMode] = useState(isWorker ? 'CASH' : 'UPI');
  const [notes, setNotes] = useState('');
  const [workerId, setWorkerId] = useState('');

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
    staleTime: 60_000,
  });
  const collectors = staff.filter((s) => (s.role === 'WORKER' || s.role === 'MANAGER') && s.enabled !== false);

  function invalidate() {
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
    qc.invalidateQueries({ queryKey: ['draws', chitId] });
    qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, member?.id] });
  }

  // Direct: UPI/Bank/Cheque settle immediately; Cash-in-hand = collect + auto-remit
  const directMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (paymentMode === 'CASH') {
        const batch = await collectPayment({ chitId, memberId: paymentRecord.memberId, amount: amt, notes: notes || undefined });
        await remitPayment(batch.id);
      } else {
        await recordPayment({ chitId, memberId: paymentRecord.memberId, amount: amt, paymentMode, notes: notes || undefined });
      }
    },
    onSuccess: () => { invalidate(); toast.success('Payment recorded and settled'); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record payment'),
  });

  // Worker: cash handed to worker — creates AWAITING_REMITTANCE, admin remits later
  const workerMutation = useMutation({
    mutationFn: () => collectPayment({
      chitId,
      memberId: paymentRecord.memberId,
      amount: Number(amount),
      notes: notes || undefined,
      ...(workerId ? { overrideCollectedBy: workerId } : {}),
    }),
    onSuccess: () => { invalidate(); toast.success('Marked as collected by worker — remit when cash is received'); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record collection'),
  });

  const isPending = directMutation.isPending || workerMutation.isPending;
  const amtNum = Number(amount || 0);

  return (
    <Modal title="Collect Payment" onClose={onClose} size="sm">
      <div className="space-y-4">
        {/* Member summary */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">{member?.fullName ?? 'Unknown'}</p>
            {member?.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{member.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Outstanding</p>
            <p className="font-bold text-red-600 text-lg">₹{balance.toLocaleString()}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {[
            { key: 'direct', label: 'Settle Now',   desc: 'UPI / Bank / Cash in hand' },
            { key: 'worker', label: 'Via Worker',    desc: 'Worker holds cash, remit later' },
          ].map(({ key, label, desc }) => (
            <button key={key} type="button"
              onClick={() => setTab(key)}
              className={`flex-1 px-3 py-2.5 text-left transition-colors ${
                tab === key ? 'bg-[#1E3A5F] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              <p className="font-medium text-sm">{label}</p>
              <p className={`text-xs mt-0.5 ${tab === key ? 'text-blue-200' : 'text-gray-400'}`}>{desc}</p>
            </button>
          ))}
        </div>

        {/* Amount */}
        <FormField label="Amount (₹)" required>
          <Input type="number" min="0.01" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>

        {/* Payment mode — only for direct tab; workers can only accept cash */}
        {tab === 'direct' && (
          <FormField label="Payment Mode" required>
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}
              disabled={isWorker}>
              {isWorker ? (
                <option value="CASH">Cash (in hand — settles immediately)</option>
              ) : (
                <>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash (in hand — settles immediately)</option>
                </>
              )}
            </Select>
          </FormField>
        )}

        {/* Worker selector — only for worker tab */}
        {tab === 'worker' && (
          <FormField label="Collected By">
            <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">— Select worker / manager —</option>
              {collectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role === 'WORKER' ? 'Worker' : 'Manager'}: {s.fullName ?? s.username}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Notes */}
        <FormField label={tab === 'direct' ? 'Reference / Notes' : 'Notes'}>
          <Input
            placeholder={tab === 'direct' ? 'UPI ref, cheque no., remarks…' : 'Remarks…'}
            value={notes} onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        {/* Worker tab info */}
        {tab === 'worker' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
            Payment will stay <strong>pending remittance</strong> until you confirm the worker handed over the cash. Go to <em>Pending Remittances</em> to finalize.
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            disabled={!amtNum || amtNum <= 0}
            loading={isPending}
            onClick={() => tab === 'direct' ? directMutation.mutate() : workerMutation.mutate()}
            className="flex-1"
          >
            {tab === 'direct' ? `Settle ₹${amtNum.toLocaleString()}` : `Mark Collected ₹${amtNum.toLocaleString()}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DrawsTab({ chitId, chit }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [pendingClose, setPendingClose] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);   // { cycleId, monthNumber }
  const [expandedCycle, setExpandedCycle] = useState(null);   // cycleId of expanded card
  const [collectTarget, setCollectTarget] = useState(null);   // { paymentRecord, member }
  const [viewTarget, setViewTarget] = useState(null);         // { paymentRecord, member } for history modal

  const { data: draws = [], isLoading } = useQuery({
    queryKey: ['draws', chitId],
    queryFn: () => getDraws(chitId),
  });
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminOption = me ? { id: me.id, fullName: `${me.username} (Admin)` } : null;
  const memberMap = Object.fromEntries([
    ...(adminOption ? [[String(adminOption.id), adminOption]] : []),
    ...allMembers.map((m) => [m.id, m]),
  ]);

  // Needed for delete rollback — to find the slot that was processed for a given cycle
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });
  const { data: winners = [] } = useQuery({
    queryKey: ['winners', chitId],
    queryFn: () => getWinners(chitId),
  });

  // Payouts keyed by monthNumber — used to show disbursement status on draw cards
  const { data: chitPayouts = [] } = useQuery({
    queryKey: ['payouts', chitId],
    queryFn: () => getPayoutsByChit(chitId),
    staleTime: 30_000,
  });
  const payoutByMonth = Object.fromEntries(chitPayouts.map((p) => [p.monthNumber, p]));

  const closeMutation = useMutation({
    mutationFn: (cycleId) => closeDraw(cycleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      toast.success('Draw closed');
      setPendingClose(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to close draw'),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ cycleId, monthNumber }) => {
      // 1. Find which member was the winner for this cycle
      const winner = winners.find((w) => w.monthNumber === monthNumber);

      // 2. If there's a winner, find the PROCESSED slot that was marked when this cycle opened
      //    and revert it to RESERVED so it can be assigned again
      if (winner) {
        const winnerId = winner.memberId ?? winner.winnerId;
        // The slot that was most recently processed for this member is the one to revert
        const slotToRevert = [...reservations]
          .filter((r) => String(r.memberId) === String(winnerId) && r.status === 'PROCESSED')
          .sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))[0];

        if (slotToRevert) {
          await updateReservationSlot({
            chitId,
            reservationId: slotToRevert.id,
            reservationMonth: slotToRevert.reservationMonth,
            memberId: slotToRevert.memberId,
            payoutAmount: slotToRevert.payoutAmount,
            postPayoutContribution: slotToRevert.postPayoutContribution ?? null,
          }).catch(() => {});
        }

        // 3. Remove the winner record for this cycle
        await deleteWinnerForDraw({ chitId, monthNumber }).catch(() => {});
      }

      // 4. Delete the cycle itself
      await deleteDraw(cycleId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      qc.invalidateQueries({ queryKey: ['winners', chitId] });
      toast.success('Draw deleted — schedule slot restored to RESERVED');
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to delete draw'),
  });

  const today = new Date();
  const totalSlots     = chit?.totalMembers ?? 0;
  const realCycles     = draws.filter((c) => c.status !== 'SKIPPED').length;
  const skippedDraws  = draws.filter((c) => c.status === 'SKIPPED').length;
  const allSlotsUsed   = totalSlots > 0 && realCycles >= totalSlots;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-gray-700 font-medium">
            {realCycles} / {totalSlots} real draws
            {skippedDraws > 0 && <span className="text-gray-400 font-normal"> · {skippedDraws} skipped</span>}
          </p>
          {allSlotsUsed && (
            <p className="text-xs text-amber-600">All {totalSlots} draws have been opened for this chit.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowSkipModal(true)}>
            <XCircle size={14} /> Skip Draw
          </Button>
          <Button size="sm" onClick={() => setShowOpenModal(true)}
            disabled={allSlotsUsed || chit?.status !== 'ACTIVE'}
            title={chit?.status !== 'ACTIVE' ? `Chit must be Active to open draws (current: ${chit?.status})` : allSlotsUsed ? `All ${totalSlots} cycles already opened` : undefined}>
            <Plus size={14} /> Open Draw
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? <PageSpinner /> : draws.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <EmptyState icon={Calendar} title="No draws opened"
              message={chit?.status !== 'ACTIVE' ? `Chit must be Active to open draws (current: ${chit?.status ?? 'DRAFT'}).` : 'Open the first draw to start collecting payments.'}
              action={chit?.status === 'ACTIVE' ? 'Open Draw' : undefined}
              onAction={chit?.status === 'ACTIVE' ? () => setShowOpenModal(true) : undefined} />
          </div>
        ) : (
          draws.map((c) => {
            const totalDue    = Number(c.totalOutstanding ?? 0) + Number(c.totalCollected ?? 0);
            const collected   = Number(c.totalCollected ?? 0);
            const pct         = totalDue > 0 ? Math.min(100, Math.round((collected / totalDue) * 100)) : 0;
            const dueDate     = c.dueDate ? new Date(c.dueDate) : null;
            const isOverdue   = c.status === 'OPEN' && (c.outstandingCount ?? 0) > 0 && dueDate && dueDate < today;
            const isExpanded  = expandedCycle === c.id;
            const cycleWinners = winners.filter((w) => w.monthNumber === c.monthNumber);
            const payout      = payoutByMonth[c.monthNumber];
            const fullyCollected = pct === 100 || (c.outstandingCount === 0 && c.settledCount > 0);
            const isCompleted  = (c.status === 'CLOSED' || c.status === 'SKIPPED') && payout?.status === 'DISBURSED';

            return (
              <div key={c.id ?? c.monthNumber} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* ── Card header ── */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <button
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                      onClick={() => setExpandedCycle(isExpanded ? null : c.id)}
                    >
                      <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: '#1E3A5F' }}>
                        {c.monthNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">Draw {c.monthNumber}</span>
                          {isCompleted
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                                <CheckCircle size={10} /> Completed
                              </span>
                            : <Badge variant={statusBadge(c.status ?? 'OPEN')}>{c.status ?? 'OPEN'}</Badge>
                          }
                          {/* Disbursement status tag */}
                          {payout && payout.status === 'DISBURSED' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle size={10} /> Disbursed ₹{Number(payout.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          )}
                          {payout && payout.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> Payout Pending ₹{Number(payout.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          )}
                          {!payout && cycleWinners.length > 0 && (c.status === 'CLOSED' || fullyCollected) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> No Payout Created
                            </span>
                          )}
                          {cycleWinners.map((w) => {
                            const wMid = w.memberId ?? w.winnerId;
                            const wName = memberMap[wMid]?.fullName ?? `#${String(wMid).slice(0, 8)}`;
                            return (
                              <span key={w.id} className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                                <Trophy size={10} /> {wName}
                              </span>
                            );
                          })}
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={11} /> Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {dueDate ? dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          {payout?.status === 'DISBURSED'
                            ? ` · Disbursed ₹${Number(payout.netPayoutAmount).toLocaleString('en-IN')}`
                            : c.installmentAmount ? ` · ₹${Number(c.installmentAmount).toLocaleString('en-IN')} / member` : ''}
                          {chit?.postPayoutContributionEnabled && chit?.defaultPostPayoutContribution
                            ? ` · ₹${Number(chit.defaultPostPayoutContribution).toLocaleString('en-IN')} post-payout`
                            : ''}
                        </p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {c.status === 'OPEN' && (
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm"
                          onClick={() => setPendingDelete({ cycleId: c.id, monthNumber: c.monthNumber })}>
                          <Trash2 size={13} /> Delete
                        </Button>
                        <Button variant="secondary" size="sm" loading={closeMutation.isPending}
                          onClick={() => setPendingClose({ cycleId: c.id, outstandingCount: c.outstandingCount ?? 0 })}>
                          <CheckCircle size={13} /> Close
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Collection Progress</span>
                      <span className="font-medium">
                        {pct}% · ₹{collected.toLocaleString()} of ₹{totalDue.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? '#16A34A' : isOverdue ? '#DC2626' : '#1E3A5F',
                      }} />
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Settled',     count: c.settledCount,       color: 'text-green-700', bg: 'bg-green-50'  },
                      { label: 'Partial',     count: c.partiallyPaidCount, color: 'text-amber-600', bg: 'bg-amber-50'  },
                      { label: 'Outstanding', count: c.outstandingCount,   color: isOverdue ? 'text-red-600' : 'text-gray-700', bg: isOverdue ? 'bg-red-50' : 'bg-gray-50' },
                      { label: 'Waived',      count: c.waivedCount,        color: 'text-gray-400',  bg: 'bg-gray-50'   },
                    ].map(({ label, count, color, bg }) => (
                      <button key={label}
                        onClick={() => setExpandedCycle(isExpanded ? null : c.id)}
                        className={`text-center ${bg} rounded-lg py-2 hover:brightness-95 transition-all cursor-pointer`}>
                        <p className={`text-lg font-bold ${color}`}>{count ?? 0}</p>
                        <p className="text-xs text-gray-400">{label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Expanded member rows ── */}
                {isExpanded && (
                  <DrawPaymentRows
                    draw={c}
                    chitId={chitId}
                    memberMap={memberMap}
                    onCollect={(paymentRecord, member) => setCollectTarget({ paymentRecord, member })}
                    onView={(paymentRecord, member) => setViewTarget({ paymentRecord, member, initialTab: 'draws' })}
                    onViewTransactions={(paymentRecord, member) => setViewTarget({ paymentRecord, member, initialTab: 'transactions' })}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {showOpenModal && <OpenDrawModal chitId={chitId} chit={chit} draws={draws} onClose={() => setShowOpenModal(false)} />}
      {showSkipModal && <SkipDrawModal chitId={chitId} chit={chit} enrollments={enrollments} draws={draws} onClose={() => setShowSkipModal(false)} />}

      {collectTarget && (
        <CollectPaymentModal
          paymentRecord={collectTarget.paymentRecord}
          member={collectTarget.member}
          chitId={chitId}
          onClose={() => setCollectTarget(null)}
        />
      )}

      {viewTarget && (
        <PaymentHistoryModal
          member={viewTarget.member}
          chitId={chitId}
          initialTab={viewTarget.initialTab ?? 'draws'}
          onCollect={(paymentRecord, member) => { setViewTarget(null); setCollectTarget({ paymentRecord, member }); }}
          onClose={() => setViewTarget(null)}
        />
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Close Draw"
          description={
            pendingClose.outstandingCount > 0
              ? `${pendingClose.outstandingCount} member${pendingClose.outstandingCount > 1 ? 's' : ''} still have outstanding payments. Closing will carry unpaid balances forward. Continue?`
              : 'Close this draw? This marks it complete and cannot be reopened.'
          }
          actionLabel="Close Draw"
          variant={pendingClose.outstandingCount > 0 ? 'warning' : 'primary'}
          loading={closeMutation.isPending}
          onConfirm={() => closeMutation.mutate(pendingClose.cycleId)}
          onClose={() => setPendingClose(null)}
        />
      )}

      {pendingDelete && (
        <DestructiveDialog
          title={`Delete Draw ${pendingDelete.monthNumber}`}
          description="This permanently deletes the draw and all payment records. If any member has already paid, void their payment batches first — then come back to delete."
          confirmWord="DELETE"
          actionLabel="Delete Draw"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate({ cycleId: pendingDelete.cycleId, monthNumber: pendingDelete.monthNumber })}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Winners Tab ──────────────────────────────────────────────────────────────
function RecordWinnerModal({ chitId, winnerSelectionMode, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [form, setForm] = useState({ monthNumber: '', winnerId: '', discountAmount: '', winningAmount: '' });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: meRec } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminRecOption = meRec ? { id: meRec.id, fullName: `${meRec.username} (Admin)` } : null;
  const memberMap = Object.fromEntries([
    ...(adminRecOption ? [[String(adminRecOption.id), adminRecOption]] : []),
    ...allMembers.map((m) => [m.id, m]),
  ]);

  const mutation = useMutation({
    mutationFn: () => recordWinner({
      chitId,
      monthNumber: Number(form.monthNumber),
      winnerId: form.winnerId,
      discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
      winningAmount: form.winningAmount ? Number(form.winningAmount) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['winners', chitId] });
      toast.success('Winner recorded successfully');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record winner'),
  });

  return (
    <Modal title="Record Winner" onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <FormField label="Draw Number" required>
          <Input type="number" min="1" placeholder="1" value={form.monthNumber}
            onChange={(e) => setForm((f) => ({ ...f, monthNumber: e.target.value }))} required />
        </FormField>
        <FormField label="Winner" required>
          <Select value={form.winnerId} onChange={(e) => setForm((f) => ({ ...f, winnerId: e.target.value }))} required>
            <option value="">— Select winner —</option>
            {[...enrollments].sort((a, b) => {
              const nameA = memberMap[a.memberId ?? a.id]?.fullName ?? '';
              const nameB = memberMap[b.memberId ?? b.id]?.fullName ?? '';
              return nameA.localeCompare(nameB);
            }).map((e) => (
              <option key={e.memberId ?? e.id} value={e.memberId ?? e.id}>
                {memberMap[e.memberId ?? e.id]?.fullName ?? `Member #${e.memberId ?? e.id}`}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Payout Amount (₹)" required>
          <Input type="number" min="0" placeholder="Enter actual payout for this member" value={form.winningAmount}
            onChange={(e) => setForm((f) => ({ ...f, winningAmount: e.target.value }))} required />
        </FormField>
        {winnerSelectionMode === 'AUCTION' && (
          <FormField label="Adjusted Amount (₹)" required>
            <Input type="number" min="0" placeholder="0" value={form.discountAmount}
              onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))} required />
          </FormField>
        )}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">Record Winner</Button>
        </div>
      </form>
    </Modal>
  );
}

function WinnersTab({ chitId, chit, winnerSelectionMode }) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [showRecordModal, setShowRecordModal]   = useState(false);
  const [disburseTarget, setDisburseTarget]     = useState(null); // { winner, payout|null }

  const { data: winners = [], isLoading } = useQuery({
    queryKey: ['winners', chitId],
    queryFn: () => getWinners(chitId),
  });
  const { data: payouts = [] } = useQuery({
    queryKey: ['payouts', chitId],
    queryFn: () => getPayoutsByChit(chitId),
  });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: meWinner } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const adminWinnerOption = meWinner ? { id: meWinner.id, fullName: `${meWinner.username} (Admin)` } : null;
  const memberMap = Object.fromEntries([
    ...(adminWinnerOption ? [[String(adminWinnerOption.id), adminWinnerOption]] : []),
    ...allMembers.map((m) => [m.id, m]),
  ]);
  // Key: `${monthNumber}:${memberId}` — supports multiple winners per cycle (double payout)
  const payoutByKey = Object.fromEntries(
    payouts.map((p) => [`${p.monthNumber}:${p.memberId ?? p.winnerId}`, p])
  );

  const PAYOUT_STATUS_STYLE = {
    PENDING:   'bg-amber-100 text-amber-700',
    DISBURSED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
    VOIDED:    'bg-red-100 text-red-500 line-through',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{winners.length} winner{winners.length !== 1 ? 's' : ''} recorded</p>
        {!isManager && (
          <Button onClick={() => setShowRecordModal(true)} size="sm">
            <Trophy size={14} /> Record Winner
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? <PageSpinner /> : winners.length === 0 ? (
          <EmptyState icon={Trophy} title="No winners yet" message="Record the winner for each month."
            action="Record Winner" onAction={() => setShowRecordModal(true)} />
        ) : (
          <Table columns={["Draw", "Winner", 'Payout Amt', 'Adjusted', 'Payout', '']}>
            {winners.map((w) => {
              const mid    = w.memberId ?? w.winnerId;
              const member = memberMap[mid];
              const payout = payoutByKey[`${w.monthNumber}:${mid}`] ?? null;
              return (
                <Tr key={w.id ?? w.monthNumber}>
                  <Td className="font-semibold text-gray-800">Draw {w.monthNumber}</Td>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <MemberLink id={member?.status !== undefined ? mid : null} name={member?.fullName ?? `#${String(mid).slice(0,8)}`} className="font-medium text-gray-900" />
                      {member?.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{member.phone}</span>}
                    </div>
                  </Td>
                  <Td className="font-semibold text-gray-800">
                    {w.winningAmount ? `₹${Number(w.winningAmount).toLocaleString()}` : '—'}
                  </Td>
                  <Td className="text-gray-600">
                    {w.discountAmount ? `₹${Number(w.discountAmount).toLocaleString()}` : '—'}
                  </Td>
                  <Td>
                    {payout && payout.status !== 'VOIDED' ? (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PAYOUT_STATUS_STYLE[payout.status] ?? ''}`}>
                        {payout.status === 'PENDING' ? `₹${Number(payout.netPayoutAmount).toLocaleString()} Pending`
                          : payout.status === 'DISBURSED' ? `₹${Number(payout.netPayoutAmount).toLocaleString()} Disbursed`
                          : payout.status === 'PARTIALLY_DISBURSED' ? `₹${Number(payout.disbursedAmount ?? payout.netPayoutAmount).toLocaleString()} Partial`
                          : 'Cancelled'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">{payout?.status === 'VOIDED' ? 'Voided' : 'No payout'}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {/* Managers: view-only; Admins: full create/disburse access */}
                    {(!isManager || payout?.status === 'DISBURSED') && (
                      <Button size="sm"
                        variant={payout?.status === 'DISBURSED' ? 'secondary' : 'primary'}
                        onClick={() => setDisburseTarget({ winner: w, payout: (payout?.status === 'VOIDED' || payout?.status === 'CANCELLED') ? null : payout, member })}>
                        <Banknote size={13} />
                        {payout && payout.status !== 'VOIDED' && payout.status !== 'CANCELLED'
                          ? (payout.status === 'DISBURSED' ? 'View' : 'Disburse')
                          : 'Create Payout'}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {showRecordModal && (
        <RecordWinnerModal chitId={chitId} winnerSelectionMode={winnerSelectionMode}
          onClose={() => setShowRecordModal(false)} />
      )}
      {disburseTarget && (
        <DisburseModal
          chitId={chitId}
          chit={chit}
          winner={disburseTarget.winner}
          payout={disburseTarget.payout}
          member={disburseTarget.member}
          onClose={() => setDisburseTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Disbursement modal ────────────────────────────────────────────────────────
function DisburseModal({ chitId, chit, winner, payout: initialPayout, member, onClose }) {
  const qc    = useQueryClient();
  const toast = useToastContext();

  const memberId   = winner.memberId ?? winner.winnerId;
  const monthNumber = winner.monthNumber;

  // local payout state — updated after create/disburse/cancel
  const [payout, setPayout] = useState(initialPayout);

  // ── Create payout form state ──
  const [winningAmt,          setWinningAmt]          = useState(String(winner.winningAmount ?? chit?.chitValue ?? ''));
  const [manualAdjustment,    setManualAdjustment]    = useState(String(winner.discountAmount ?? '0'));
  const [createNotes,         setCreateNotes]         = useState('');
  const [collectCurrentMonth, setCollectCurrentMonth] = useState(false);
  const [crossChitCollect,    setCrossChitCollect]    = useState({}); // { [chitId]: { enabled, amount } }
  const installmentAmount = Number(chit?.installmentAmount ?? 0);

  // ── Disburse form state ──
  const [disbMode,  setDisbMode]  = useState('UPI');
  const [refNum,    setRefNum]    = useState('');
  const [disbNotes, setDisbNotes] = useState('');

  // ── Cancel payout form state ──
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason,   setCancelReason]   = useState('');

  // ── Partial disburse amount state ──
  const [disbAmount, setDisbAmount] = useState('');

  // ── Cross-chit balance ──
  const { data: memberChits = [] } = useQuery({
    queryKey: ['memberChits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });
  const { data: totalBalance = 0 } = useQuery({
    queryKey: ['memberTotalBalance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    enabled: !!memberId,
  });
  // Per-chit balances — parallel queries
  const perChitQueries = memberChits.map((c) => ({
    queryKey: ['memberBalance', c.id, memberId],
    queryFn:  () => getMemberBalance({ memberId, chitId: c.id }),
    enabled:  !!memberId,
  }));
  // We can't call hooks conditionally, so we use a single combined query key
  const { data: perChitBalances } = useQuery({
    queryKey: ['memberBalancesAllChits', memberId, memberChits.map(c => c.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        memberChits.map((c) => getMemberBalance({ memberId, chitId: c.id }))
      );
      return results.map((b, i) => ({ ...b, chitName: memberChits[i].name, chitId: memberChits[i].id }));
    },
    enabled: memberChits.length > 0 && !!memberId,
  });

  // ── Settlement helpers ──
  const otherActiveChits = (memberChits ?? []).filter(
    (c) => String(c.id) !== String(chitId) && c.status === 'ACTIVE'
  );
  const crossBalances = Object.fromEntries(
    (perChitBalances ?? [])
      .filter((b) => String(b.chitId) !== String(chitId))
      .map((b) => [String(b.chitId), Number(b.totalOutstanding ?? 0)])
  );
  const otherChitsWithBalance = otherActiveChits.filter((c) => (crossBalances[String(c.id)] ?? 0) > 0);

  const currentMonthDed = collectCurrentMonth ? installmentAmount : 0;
  const crossDed = Object.entries(crossChitCollect)
    .filter(([, v]) => v.enabled)
    .reduce((sum, [, v]) => sum + Math.max(0, Number(v.amount) || 0), 0);
  const manualNum  = Number(manualAdjustment) || 0;
  const totalDiscount = manualNum + currentMonthDed + crossDed;
  const winNum     = Number(winningAmt) || 0;
  const netCreate  = Math.max(0, winNum - totalDiscount);
  const isOverDeducted = totalDiscount > winNum && winNum > 0;

  function toggleCrossChit(cId) {
    const balance = crossBalances[String(cId)] ?? 0;
    setCrossChitCollect((prev) => {
      const cur = prev[String(cId)];
      if (cur?.enabled) return { ...prev, [String(cId)]: { enabled: false, amount: cur.amount } };
      return { ...prev, [String(cId)]: { enabled: true, amount: String(balance) } };
    });
  }
  function setCrossAmt(cId, val) {
    setCrossChitCollect((prev) => ({ ...prev, [String(cId)]: { ...prev[String(cId)], amount: val } }));
  }

  const invalidatePayouts = () => {
    qc.invalidateQueries({ queryKey: ['payouts', chitId] });
  };

  // ── Create payout ──
  const createMutation = useMutation({
    mutationFn: async () => {
      const p = await createPayout({
        chitId,
        memberId,
        monthNumber,
        winningAmount:         winNum,
        discountAmount:        totalDiscount,
        installmentSettlement: currentMonthDed || undefined,
        crossChitSettlement:   crossDed || undefined,
        manualAdjustment:      manualNum || undefined,
        notes: createNotes || undefined,
      });
      // Record settlement payments best-effort; tag with payout ID so void can find them across chits
      const payoutTag = `[payout=${p.id}]`;
      const tasks = [];
      if (collectCurrentMonth && installmentAmount > 0) {
        tasks.push(recordPayment({
          chitId,
          memberId,
          amount: installmentAmount,
          paymentMode: 'BANK_TRANSFER',
          notes: `Disbursement settlement — Draw ${monthNumber} installment ${payoutTag}`,
        }).catch(() => null));
      }
      Object.entries(crossChitCollect)
        .filter(([, v]) => v.enabled && Number(v.amount) > 0)
        .forEach(([xChitId, v]) => {
          // Find oldest outstanding draw number for this cross-chit so the note is specific
          const xBalance = (perChitBalances ?? []).find((b) => String(b.chitId) === String(xChitId));
          const oldestDraw = xBalance?.months?.[0]?.monthNumber;
          const crossNote = oldestDraw
            ? `Disbursement settlement — Draw ${oldestDraw} installment ${payoutTag}`
            : `Disbursement settlement — installment collection ${payoutTag}`;
          tasks.push(recordPayment({
            chitId: xChitId,
            memberId,
            amount: Number(v.amount),
            paymentMode: 'BANK_TRANSFER',
            notes: crossNote,
          }).catch(() => null));
        });
      if (tasks.length > 0) await Promise.all(tasks);
      return p;
    },
    onSuccess: (p) => {
      setPayout(p);
      invalidatePayouts();
      qc.invalidateQueries({ queryKey: ['memberBalancesAllChits', memberId] });
      // Refresh draw payment cards so installment/cross-chit payments appear immediately
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, memberId] });
      const msg = currentMonthDed > 0 || crossDed > 0
        ? `Payout created · ₹${totalDiscount.toLocaleString('en-IN')} collected as settlement`
        : 'Payout record created — ready to disburse';
      toast.success(msg);
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to create payout'),
  });

  // ── Disburse ──
  const disbMutation = useMutation({
    mutationFn: () => {
      const remaining = Number(payout.remainingAmount ?? payout.netPayoutAmount ?? 0);
      const enteredAmt = disbAmount.trim() !== '' ? Number(disbAmount) : null;
      return disbursePayout({
        id: payout.id,
        disbursementMode: disbMode,
        referenceNumber:  disbMode !== 'CASH' ? refNum : undefined,
        notes: disbNotes || undefined,
        amount: enteredAmt != null && enteredAmt < remaining ? enteredAmt : undefined,
      });
    },
    onSuccess: (p) => {
      setPayout(p);
      invalidatePayouts();
      setDisbAmount('');
      setRefNum('');
      setDisbNotes('');
      toast.success(p.status === 'DISBURSED'
        ? 'Full amount disbursed — payout complete'
        : `₹${Number(p.disbursedAmount).toLocaleString('en-IN')} disbursed — ₹${Number(p.remainingAmount).toLocaleString('en-IN')} remaining`);
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Disbursement failed'),
  });

  // ── Cancel ──
  const cancelMutation = useMutation({
    mutationFn: () => cancelPayout({ id: payout.id, reason: cancelReason }),
    onSuccess: (p) => {
      setPayout(p);
      invalidatePayouts();
      toast.success('Payout cancelled');
      setShowCancelForm(false);
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to cancel payout'),
  });


  const net         = payout ? Number(payout.netPayoutAmount) : netCreate;
  const totalDues   = Number(totalBalance ?? 0);
  const afterDues   = Math.max(0, net - totalDues);
  const hasDues     = totalDues > 0;
  const needsRef    = disbMode !== 'CASH';

  const STATUS_ICON = {
    PENDING:   <AlertCircle size={15} className="text-amber-500" />,
    DISBURSED: <CheckCircle size={15} className="text-green-500" />,
    PARTIALLY_DISBURSED: <AlertCircle size={15} className="text-blue-500" />,
    CANCELLED: <XCircle    size={15} className="text-gray-400"  />,
    VOIDED:    <XCircle    size={15} className="text-red-400"   />,
  };

  return (
    <Modal
      title={`Disbursement — Draw ${monthNumber} · ${member?.fullName ?? `Member #${String(memberId).slice(0,8)}`}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">

        {/* ── Winner summary ── */}
        <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {member?.phone && (
            <span className="flex items-center gap-1.5 text-gray-500"><Phone size={13} />{member.phone}</span>
          )}
          {member?.email && (
            <span className="flex items-center gap-1.5 text-gray-500"><Mail size={13} />{member.email}</span>
          )}
          <span className="text-gray-500">Winning amount: <strong className="text-gray-800">₹{Number(winner.winningAmount ?? 0).toLocaleString()}</strong></span>
          <span className="text-gray-500">Adjusted: <strong className="text-gray-800">₹{Number(winner.discountAmount ?? 0).toLocaleString()}</strong></span>
        </div>

        {/* ── Cross-chit dues ── */}
        {hasDues && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-amber-800">
                Outstanding dues: ₹{totalDues.toLocaleString()} across all chits
              </span>
            </div>
            {perChitBalances?.filter(b => Number(b.totalOutstanding) > 0).map((b) => (
              <div key={b.chitId} className="pl-5 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{b.chitName}</span>
                  <span className="text-red-600 font-semibold">₹{Number(b.totalOutstanding).toLocaleString()}</span>
                </div>
                {b.months?.slice(0, 3).map((m) => (
                  <div key={m.monthNumber} className="flex justify-between text-xs text-gray-500 pl-2">
                    <span>Draw {m.monthNumber} {m.dueDate ? `· due ${new Date(m.dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}` : ''}</span>
                    <span>₹{Number(m.balance).toLocaleString()}</span>
                  </div>
                ))}
                {b.months?.length > 3 && (
                  <p className="text-xs text-gray-400 pl-2">+{b.months.length - 3} more draws…</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Payout calculation ── */}
        {payout && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-200">
              {STATUS_ICON[payout.status]}
              <span className="text-sm font-semibold text-gray-800">Payout Record</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                payout.status === 'PENDING'              ? 'bg-amber-100 text-amber-700' :
                payout.status === 'DISBURSED'            ? 'bg-green-100 text-green-700' :
                payout.status === 'PARTIALLY_DISBURSED'  ? 'bg-blue-100 text-blue-700' :
                payout.status === 'VOIDED'               ? 'bg-red-100 text-red-500' :
                                                           'bg-gray-100 text-gray-500'}`}>
                {payout.status === 'PARTIALLY_DISBURSED' ? 'Partial' : payout.status}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Winning amount</span>
                <span>₹{Number(payout.winningAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Adjusted</span>
                <span className="text-red-600">− ₹{Number(payout.discountAmount).toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900">
                <span>Net payout</span>
                <span className="text-green-700">₹{Number(payout.netPayoutAmount).toLocaleString()}</span>
              </div>
              {hasDues && payout.status === 'PENDING' && (
                <>
                  <div className="flex justify-between text-gray-500 text-xs pt-1">
                    <span>Outstanding dues (for reference)</span>
                    <span className="text-amber-600">₹{totalDues.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium text-gray-700 border-t border-dashed border-gray-200 pt-2">
                    <span>After deducting dues</span>
                    <span className="text-blue-700">₹{afterDues.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-400 italic">
                    Collect dues separately if you deduct before disbursing.
                  </p>
                </>
              )}
              {/* Disbursement transaction history — shown for any paid status */}
              {(payout.status === 'DISBURSED' || payout.status === 'PARTIALLY_DISBURSED') && payout.disbursements?.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Disbursement{payout.disbursements.length > 1 ? ` transactions (${payout.disbursements.length})` : ''}
                  </p>
                  {payout.disbursements.map((d, i) => (
                    <div key={d.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700">
                          #{i + 1} · ₹{Number(d.amount).toLocaleString('en-IN')}
                        </span>
                        <span className="text-gray-500">{d.mode?.replace('_', ' ')}</span>
                      </div>
                      {d.referenceNumber && (
                        <div className="text-gray-400 font-mono">{d.referenceNumber}</div>
                      )}
                      <div className="text-gray-400">
                        {new Date(d.disbursedAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                      {d.notes && <div className="text-gray-400 italic">{d.notes}</div>}
                    </div>
                  ))}
                  {payout.status === 'PARTIALLY_DISBURSED' && (
                    <div className="text-xs text-blue-600 font-medium pt-1">
                      ₹{Number(payout.disbursedAmount).toLocaleString('en-IN')} disbursed · ₹{Number(payout.remainingAmount).toLocaleString('en-IN')} remaining
                    </div>
                  )}
                </div>
              )}
              {payout.status === 'CANCELLED' && (
                <div className="pt-2 border-t border-gray-100 text-xs text-red-500">
                  Cancelled: {payout.cancellationReason}
                </div>
              )}
              {payout.status === 'VOIDED' && (
                <div className="pt-2 border-t border-gray-100 text-xs text-red-500">
                  Voided: {payout.voidReason}
                  {payout.voidedAt && (
                    <span className="ml-2 text-gray-400">
                      {new Date(payout.voidedAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  )}
                </div>
              )}
              {payout.notes && (
                <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">{payout.notes}</p>
              )}
            </div>
          </div>
        )}

        {/* ── No payout yet — create form ── */}
        {!payout && (
          <div className="space-y-4">
            <FormField label="Winning Amount (₹)" required>
              <Input type="number" min="0" value={winningAmt}
                onChange={(e) => setWinningAmt(e.target.value)} />
            </FormField>

            {/* ── Settlement Section ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
                <Wallet size={14} className="text-[#1E3A5F]" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Collect at Disbursement
                </span>
              </div>
              <div className="divide-y divide-gray-100">

                {/* Current month installment */}
                {installmentAmount > 0 && (
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">Draw {monthNumber} installment</p>
                      <p className="text-xs text-gray-500 mt-0.5">{chit?.name} — ₹{installmentAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {collectCurrentMonth && (
                        <span className="text-xs font-semibold text-[#1E3A5F]">−₹{installmentAmount.toLocaleString('en-IN')}</span>
                      )}
                      <ToggleSwitch on={collectCurrentMonth} onToggle={() => setCollectCurrentMonth((v) => !v)} />
                    </div>
                  </div>
                )}

                {/* Cross-chit dues */}
                {otherChitsWithBalance.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-medium text-gray-500">Outstanding dues in other chits</p>
                    </div>
                    {otherChitsWithBalance.map((c) => {
                      const balance = crossBalances[String(c.id)] ?? 0;
                      const state   = crossChitCollect[String(c.id)];
                      const isOn    = state?.enabled ?? false;
                      const amt     = state?.amount ?? String(balance);
                      const amtNum  = Math.max(0, Number(amt) || 0);
                      const exceeds = amtNum > balance;
                      return (
                        <div key={c.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Outstanding: <span className="text-red-600 font-medium">₹{balance.toLocaleString('en-IN')}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-gray-500">Collect now</span>
                              <ToggleSwitch on={isOn} onToggle={() => toggleCrossChit(c.id)} />
                            </div>
                          </div>
                          {isOn && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-16 flex-shrink-0">Amount (₹)</span>
                              <Input type="number" min="1" max={balance} value={amt}
                                onChange={(e) => setCrossAmt(c.id, e.target.value)} className="w-40" />
                              {amtNum > 0 && !exceeds && (
                                <span className="text-xs font-semibold text-[#1E3A5F]">−₹{amtNum.toLocaleString('en-IN')}</span>
                              )}
                              {exceeds && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                  <AlertCircle size={11} /> Max ₹{balance.toLocaleString('en-IN')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {otherChitsWithBalance.length === 0 && installmentAmount === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400 italic">
                    No outstanding dues or installment to collect.
                  </div>
                )}
              </div>
            </div>

            {/* Manual adjustment */}
            <FormField label="Additional Adjustment (₹)">
              <Input type="number" min="0" value={manualAdjustment}
                onChange={(e) => setManualAdjustment(e.target.value)} placeholder="0" />
              <p className="text-xs text-gray-400 mt-1">Any extra deduction e.g. security deposit, commission</p>
            </FormField>

            {/* Breakdown summary */}
            {winNum > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payout Breakdown</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Winning amount</span>
                    <span className="font-medium text-gray-900">₹{winNum.toLocaleString('en-IN')}</span>
                  </div>
                  {collectCurrentMonth && installmentAmount > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span className="flex items-center gap-1"><ArrowRight size={12} /> Draw {monthNumber} installment</span>
                      <span>−₹{installmentAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {Object.entries(crossChitCollect).filter(([, v]) => v.enabled && Number(v.amount) > 0).map(([cId, v]) => {
                    const cName = otherActiveChits.find((c) => String(c.id) === cId)?.name ?? cId;
                    return (
                      <div key={cId} className="flex justify-between text-amber-700">
                        <span className="flex items-center gap-1 truncate max-w-[200px]"><ArrowRight size={12} /> {cName}</span>
                        <span>−₹{Number(v.amount).toLocaleString('en-IN')}</span>
                      </div>
                    );
                  })}
                  {manualNum > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span className="flex items-center gap-1"><ArrowRight size={12} /> Adjustment</span>
                      <span>−₹{manualNum.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
                    <span className="text-gray-700">Net cash to member</span>
                    <span className={netCreate === 0 ? 'text-red-600' : 'text-green-700'}>
                      ₹{netCreate.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {isOverDeducted && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
                <AlertCircle size={14} /> Total deductions exceed winning amount.
              </div>
            )}

            <FormField label="Notes (optional)">
              <Textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Any notes for this payout…" rows={2} />
            </FormField>
            <Button
              className="w-full"
              loading={createMutation.isPending}
              disabled={!winningAmt || winNum <= 0 || isOverDeducted || netCreate <= 0 ||
                Object.entries(crossChitCollect).some(([cId, v]) => {
                  if (!v.enabled) return false;
                  return Number(v.amount) > (crossBalances[String(cId)] ?? 0);
                })
              }
              onClick={() => createMutation.mutate()}
            >
              <Banknote size={15} />
              Create Payout · Net ₹{netCreate.toLocaleString('en-IN')}
            </Button>
          </div>
        )}

        {/* ── Disburse form — for PENDING and PARTIALLY_DISBURSED ── */}
        {(payout?.status === 'PENDING' || payout?.status === 'PARTIALLY_DISBURSED') && !showCancelForm && (
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                {payout.status === 'PARTIALLY_DISBURSED' ? 'Record Next Disbursement' : 'Record Disbursement'}
              </p>
              {payout.status === 'PARTIALLY_DISBURSED' && (
                <span className="text-xs text-blue-700 font-medium">
                  ₹{Number(payout.remainingAmount).toLocaleString('en-IN')} remaining
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Mode" required>
                <Select value={disbMode} onChange={(e) => { setDisbMode(e.target.value); setRefNum(''); }}>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </Select>
              </FormField>
              {needsRef && (
                <FormField
                  label={disbMode === 'UPI' ? 'UPI Transaction ID' : disbMode === 'BANK_TRANSFER' ? 'UTR Number' : 'Cheque Number'}
                  required
                >
                  <Input value={refNum} onChange={(e) => setRefNum(e.target.value)}
                    placeholder={disbMode === 'UPI' ? 'UPI ref…' : disbMode === 'BANK_TRANSFER' ? 'UTR…' : 'Cheque no…'} />
                </FormField>
              )}
            </div>
            {/* Amount field — leave blank to disburse full remaining amount */}
            <FormField label={`Amount to disburse (₹) — blank = full ₹${Number(payout.remainingAmount ?? payout.netPayoutAmount).toLocaleString('en-IN')}`}>
              <Input
                type="number"
                min="1"
                max={Number(payout.remainingAmount ?? payout.netPayoutAmount)}
                value={disbAmount}
                onChange={(e) => setDisbAmount(e.target.value)}
                placeholder={`Up to ₹${Number(payout.remainingAmount ?? payout.netPayoutAmount).toLocaleString('en-IN')}`}
              />
              {disbAmount.trim() !== '' && Number(disbAmount) > Number(payout.remainingAmount ?? payout.netPayoutAmount) && (
                <p className="text-xs text-red-500 mt-1">
                  Cannot exceed remaining ₹{Number(payout.remainingAmount ?? payout.netPayoutAmount).toLocaleString('en-IN')}
                </p>
              )}
              {disbAmount.trim() !== '' && Number(disbAmount) > 0 && Number(disbAmount) < Number(payout.remainingAmount ?? payout.netPayoutAmount) && (
                <p className="text-xs text-amber-600 mt-1">
                  Partial — ₹{(Number(payout.remainingAmount ?? payout.netPayoutAmount) - Number(disbAmount)).toLocaleString('en-IN')} will still be owed
                </p>
              )}
            </FormField>
            <FormField label="Notes (optional)">
              <Textarea value={disbNotes} onChange={(e) => setDisbNotes(e.target.value)}
                placeholder="Any disbursement notes…" rows={2} />
            </FormField>
            <div className="flex gap-3">
              {payout.status === 'PENDING' && (
                <Button variant="secondary" size="sm" onClick={() => setShowCancelForm(true)}>
                  Cancel Payout
                </Button>
              )}
              <Button
                className="flex-1"
                loading={disbMutation.isPending}
                disabled={
                  (needsRef && !refNum.trim()) ||
                  (disbAmount.trim() !== '' && (Number(disbAmount) <= 0 || Number(disbAmount) > Number(payout.remainingAmount ?? payout.netPayoutAmount)))
                }
                onClick={() => disbMutation.mutate()}
              >
                <Banknote size={15} />
                {disbAmount.trim() !== '' && Number(disbAmount) > 0 && Number(disbAmount) < Number(payout.remainingAmount ?? payout.netPayoutAmount)
                  ? `Disburse ₹${Number(disbAmount).toLocaleString('en-IN')}`
                  : `Disburse ₹${Number(payout.remainingAmount ?? payout.netPayoutAmount).toLocaleString('en-IN')}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Cancel payout inline form ── */}
        {payout?.status === 'PENDING' && showCancelForm && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-red-700">Cancel this payout?</p>
            <FormField label="Reason" required>
              <Input autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this payout being cancelled?" />
              <div className="flex justify-between mt-1">
                {cancelReason.trim().length > 0 && cancelReason.trim().length < 5
                  ? <span className="text-xs text-red-500">Minimum 5 characters</span>
                  : <span />}
                <span className="text-xs text-gray-400 ml-auto">{cancelReason.length}/500</span>
              </div>
            </FormField>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={() => { setShowCancelForm(false); setCancelReason(''); }}>
                Back
              </Button>
              <Button variant="danger" size="sm"
                disabled={cancelReason.trim().length < 5 || cancelMutation.isPending}
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Header actions ───────────────────────────────────────────────────────────
function HeaderActions({ chitId, chit }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null); // status being confirmed
  const [pendingStartDate, setPendingStartDate] = useState('');
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chit', chitId] });
    qc.invalidateQueries({ queryKey: ['chits'] });
    qc.invalidateQueries({ queryKey: ['enrollments', chitId] });
    qc.invalidateQueries({ queryKey: ['reservations', chitId] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ status, startDate }) => {
      // When activating with a start date that differs from the anticipated date,
      // shift all RESERVED/UNALLOCATED reservation months to match the actual start date.
      if (status === 'ACTIVE' && startDate && chit.startDate && startDate !== chit.startDate) {
        const [ay, am] = chit.startDate.split('-').map(Number);
        const [by, bm] = startDate.split('-').map(Number);
        const offsetMonths = (by - ay) * 12 + (bm - am);
        if (offsetMonths !== 0) {
          const shiftable = reservations.filter((r) => r.status === 'RESERVED' || r.status === 'UNALLOCATED');
          await Promise.all(shiftable.map((r) => {
            const parts = r.reservationMonth.split('-').map(Number);
            const totalMonths = (parts[0] - 1) * 12 + parts[1] + offsetMonths;
            const newYear = Math.floor((totalMonths - 1) / 12) + 1;
            const newMonth = ((totalMonths - 1) % 12) + 1;
            const newDate = `${newYear}-${String(newMonth).padStart(2, '0')}-01`;
            return updateReservationSlot({
              chitId,
              reservationId: r.id,
              reservationMonth: newDate,
              memberId: r.memberId || null,
              payoutAmount: r.payoutAmount,
              postPayoutContribution: r.postPayoutContribution || null,
            }).catch(() => {});
          }));
        }
      }
      return updateChitStatus({ id: chitId, status, startDate: startDate || null });
    },
    onSuccess: () => { invalidate(); toast.success('Status updated'); setPendingStatus(null); setPendingStartDate(''); setShowStatusMenu(false); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to update status'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseChit(chitId),
    onSuccess: () => { invalidate(); toast.success('Chit paused'); setShowPauseModal(false); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to pause'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeChit(chitId),
    onSuccess: () => { invalidate(); toast.success('Chit resumed — end date extended'); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to resume'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteChit(chitId),
    onSuccess: () => { invalidate(); toast.success('Chit deleted'); setShowDeleteModal(false); },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to delete'),
  });

  const status = chit.status;
  const statusTargets = {
    DRAFT:    ['ACTIVE', 'CANCELLED'],
    ACTIVE:   ['DRAFT', 'COMPLETED', 'CANCELLED'],
    PAUSED:   ['CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
    DELETED:  [],
  }[status] ?? [];

  // Preflight: pre-load reservations while on a DRAFT chit so the count is
  // instantly available when the admin opens the activation confirmation.
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
    enabled: status === 'DRAFT',
    staleTime: 30_000,
  });
  const unallocatedCount = reservations.filter((r) => r.status === 'UNALLOCATED').length;

  // Destructive statuses require type-to-confirm; others use ConfirmDialog
  const isDestructiveStatus = (s) => s === 'CANCELLED';

  const statusModalTitle = pendingStatus === 'DRAFT'
    ? 'Revert to Draft'
    : pendingStatus === 'ACTIVE' && unallocatedCount > 0
      ? 'Incomplete Schedule — Activate Anyway?'
      : pendingStatus
        ? (isDestructiveStatus(pendingStatus) ? 'Cancel Chit' : `Set Status to ${pendingStatus}`)
        : '';
  const statusModalDesc = pendingStatus === 'DRAFT'
    ? `"${chit.name}" will go back to DRAFT. All current enrollments will be cleared so you can freely edit the schedule. Re-activating will re-sync enrollments from the updated schedule.`
    : pendingStatus === 'ACTIVE' && unallocatedCount > 0
      ? `${unallocatedCount} slot${unallocatedCount > 1 ? 's are' : ' is'} still UNALLOCATED — no member or payout assigned. Those months will have no winner when they come due. Go back and fill them in, or activate anyway if that's intentional.`
      : pendingStatus
        ? (isDestructiveStatus(pendingStatus)
            ? `This will permanently cancel "${chit.name}". This action cannot be undone.`
            : `Change "${chit.name}" status to ${pendingStatus}?`)
        : '';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pause */}
      {status === 'ACTIVE' && !isManager && (
        <Button variant="warning" size="sm" loading={pauseMutation.isPending}
          onClick={() => setShowPauseModal(true)}>
          <Pause size={14} /> Pause
        </Button>
      )}

      {/* Resume */}
      {status === 'PAUSED' && !isManager && (
        <Button variant="success" size="sm" loading={resumeMutation.isPending}
          onClick={() => resumeMutation.mutate()}>
          <Play size={14} /> Resume
        </Button>
      )}

      {/* Status dropdown — managers can only change status on DRAFT chits */}
      {statusTargets.length > 0 && (!isManager || status === 'DRAFT') && (
        <div className="relative">
          <Button variant="secondary" size="sm" loading={statusMutation.isPending}
            onClick={() => setShowStatusMenu((o) => !o)}>
            <Settings size={14} /> Edit Status <ChevronDown size={13} />
          </Button>
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 min-w-[160px] py-1">
                {statusTargets.map((s) => (
                  <button key={s}
                    onClick={() => { setShowStatusMenu(false); setPendingStatus(s); if (s === 'ACTIVE' && chit.startDate) setPendingStartDate(chit.startDate); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-medium ${
                      isDestructiveStatus(s) ? 'text-red-600' : s === 'COMPLETED' ? 'text-green-700' : s === 'DRAFT' ? 'text-amber-700' : 'text-gray-700'
                    }`}>
                    {s === 'DRAFT' ? 'Revert to Draft' : `Set to ${s}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete — admins only */}
      {status !== 'DELETED' && !isManager && (
        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
          <Trash2 size={14} /> Delete
        </Button>
      )}

      {/* Pause confirmation */}
      {showPauseModal && (
        <ConfirmDialog
          title="Pause Chit Fund"
          description={`Pausing "${chit.name}" will stop payment generation until resumed. The end date will be extended when you resume.`}
          actionLabel="Pause"
          variant="warning"
          loading={pauseMutation.isPending}
          onConfirm={() => pauseMutation.mutate()}
          onClose={() => setShowPauseModal(false)}
        />
      )}

      {/* Status change confirmation */}
      {pendingStatus && (
        isDestructiveStatus(pendingStatus) ? (
          <DestructiveDialog
            title={statusModalTitle}
            description={statusModalDesc}
            confirmWord="DELETE"
            actionLabel={`Set to ${pendingStatus}`}
            loading={statusMutation.isPending}
            onConfirm={() => statusMutation.mutate({ status: pendingStatus, startDate: pendingStartDate })}
            onClose={() => setPendingStatus(null)}
          />
        ) : (
          <ConfirmDialog
            title={statusModalTitle}
            description={statusModalDesc}
            actionLabel={`Set to ${pendingStatus}`}
            loading={statusMutation.isPending}
            onConfirm={() => statusMutation.mutate({ status: pendingStatus, startDate: pendingStartDate })}
            onClose={() => { setPendingStatus(null); setPendingStartDate(''); }}
            confirmDisabled={pendingStatus === 'ACTIVE' && status === 'DRAFT' && !pendingStartDate}
          >
            {pendingStatus === 'ACTIVE' && status === 'DRAFT' && (
              <FormField label="Actual Start Date" required>
                <DateInput
                  value={pendingStartDate || chit.startDate || ''}
                  onChange={(e) => setPendingStartDate(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  {chit.startDate
                    ? `Anticipated: ${new Date(chit.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}. Change if the actual start differs — schedule months will shift accordingly.`
                    : 'Schedule months will count from this date.'}
                </p>
              </FormField>
            )}
          </ConfirmDialog>
        )
      )}

      {/* Delete chit confirmation */}
      {showDeleteModal && (
        <DestructiveDialog
          title="Delete Chit Fund"
          description={`This will soft-delete "${chit.name}" and hide it from all lists. Type DELETE to confirm.`}
          confirmWord="DELETE"
          actionLabel="Delete Chit Fund"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    const t = location.state?.tab;
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Overview';
  });

  const { data: chit, isLoading } = useQuery({
    queryKey: ['chit', id],
    queryFn: () => getChit(id),
  });

  if (isLoading) return <PageSpinner />;
  if (!chit) return (
    <div className="text-center py-24">
      <p className="text-gray-400">Chit fund not found.</p>
      <Button variant="secondary" onClick={() => navigate('/chits')} className="mt-4">
        <ArrowLeft size={14} /> Back to Chit Funds
      </Button>
    </div>
  );

  const isReservation = (chit.chitType ?? 'RESERVATION') === 'RESERVATION';
  const TABS = ['Overview', 'Members', ...(isReservation ? ['Schedule'] : []), 'Draws', 'Winners'];

  const installment = chit.installmentAmount
    ?? (chit.chitValue && chit.totalMembers ? chit.chitValue / chit.totalMembers : null);

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Deleted banner */}
      {chit.status === 'DELETED' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <Trash2 size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">This chit fund has been deleted</p>
            <p className="text-xs text-red-500 mt-0.5">
              {chit.deletedAt
                ? `Deleted ${new Date(chit.deletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} — `
                : ''}
              Record is read-only. All data is preserved for audit purposes.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#1E3A5F', fontFamily: 'Inter, system-ui, sans-serif' }}>
              {chit.name}
            </h2>
            <Badge variant={statusBadge(chit.status)}>{chit.status ?? 'DRAFT'}</Badge>
            {chit.chitType && chit.chitType !== 'RESERVATION' && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {chit.chitType}
              </span>
            )}
            {chit.status === 'PAUSED' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                ⏸ Paused {chit.totalPausedMonths > 0 ? `· ${chit.totalPausedMonths} months paused` : ''}
              </span>
            )}
          </div>
          {chit.description && <p className="text-sm text-gray-500 mt-1">{chit.description}</p>}
        </div>
        <HeaderActions chitId={id} chit={chit} />
      </div>

      {/* Stat mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Chit Value',  chit.chitValue ? `₹${Number(chit.chitValue).toLocaleString()}` : '—'],
          ['Installment', installment ? `₹${Number(installment).toLocaleString()}` : '—'],
          ['Members / Spots', `${chit.enrolledCount ?? '?'} / ${chit.totalMembers}`],
          ['Duration',    `${chit.durationMonths ?? chit.totalMembers ?? '—'} months`],
        ].map(([label, val]) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{val}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
        {activeTab === 'Overview'  && <OverviewTab chit={chit} />}
        {activeTab === 'Members'   && <MembersTab chitId={id} chit={chit} />}
        {activeTab === 'Schedule'  && <ReservationScheduleTab chitId={id} chit={chit} />}
        {activeTab === 'Draws'     && <DrawsTab chitId={id} chit={chit} />}
        {activeTab === 'Winners'   && <WinnersTab chitId={id} chit={chit} winnerSelectionMode={chit.winnerSelectionMode} />}
      </div>
    </div>
  );
}
