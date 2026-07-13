import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChit, updateChitStatus, updateChitName, pauseChit, resumeChit, deleteChit,
  getEnrollments, enrollMember, removeEnrollment,
  getMembers,
  getDraws, openDraw, closeDraw, skipDraw, deleteDraw, shiftReservations,
  getWinners, recordWinner, deleteWinnerForDraw,
  getReservations, addReservationSlot, updateReservationSlot, removeReservationSlot, hardDeleteReservationSlot, markSlotProcessed, swapSlots, getSlotHistory,
  getMemberBalanceBulk,
  getDrawPayments, recordPayment, collectPayment, adminCreateCashRequest, getPaymentHistory, updatePromisedDate,
  getPaymentBatches, voidPaymentBatch, markPayoutDeducted, revertPayoutDeductions,
  getPayoutsByChit, getPayoutsForMember, createPayout, disbursePayout, cancelPayout,
  getChitsForMember, getMemberTotalBalance, getMemberBalance,
  getMe, listStaff, getUserById, getWalletBalance,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import PayoutCreationForm from '../../components/payout/PayoutCreationForm';
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
  Banknote, AlertCircle, ChevronRight, Clock, ArrowRight, RotateCcw, X, History, Vault, CreditCard, Building2, ExternalLink,
} from 'lucide-react';

// ─── Tabs ────────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-5 py-2 text-sm font-semibold rounded-lg border-2 transition-colors cursor-pointer whitespace-nowrap ${
            active === t
              ? 'bg-[#1E3A5F] border-[#1E3A5F] text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:border-[#1E3A5F] hover:text-[#1E3A5F]'
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
    ['Org Held Slots',       chit.orgHeldSpotsCount ?? 0],
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

// Resolves a non-member admin UUID to their user account name
function AdminSpotCell({ adminId }) {
  const navigate = useNavigate();
  const { data: adminUser } = useQuery({
    queryKey: ['user', adminId],
    queryFn: () => getUserById(adminId),
    enabled: !!adminId,
  });
  const name = adminUser?.fullName ?? adminUser?.username ?? 'Admin';
  return (
    <button
      type="button"
      onClick={() => navigate(`/admin/participation/${adminId}`)}
      className="flex items-center gap-2 text-left group cursor-pointer"
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: '#B45309' }}>
        ★
      </div>
      <span className="text-amber-700 font-medium group-hover:underline">{name}</span>
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">★ Admin</span>
    </button>
  );
}

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
  const totalSpots = enrollments.length + (chit?.orgHeldSpotsCount ?? 0);
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
          {(chit?.orgHeldSpotsCount ?? 0) > 0 && <> · {chit.orgHeldSpotsCount} org-held</>}
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

  const orgHeldCount   = chit?.orgHeldSpotsCount ?? 0;
  const totalSpots2    = enrollments.length + orgHeldCount;
  const maxSpots       = chit?.totalMembers ?? Infinity;
  const spotsAreFull   = totalSpots2 >= maxSpots;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalSpots2} spots filled · {(chit?.totalMembers ?? 0) - totalSpots2} remaining
          {orgHeldCount > 0 && <span className="text-gray-400"> ({orgHeldCount} org-held)</span>}
        </p>
        {canEdit && !spotsAreFull && (
          <Button onClick={() => setShowEnroll(true)} size="sm">
            <UserPlus size={14} /> Add Spot
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? <PageSpinner /> : uniqueMembers.length === 0 ? (
          <EmptyState icon={Users} title="No members enrolled"
            message="Enroll members to this chit fund."
            action={canEdit && !spotsAreFull ? 'Add Spot' : undefined}
            onAction={canEdit && !spotsAreFull ? () => setShowEnroll(true) : undefined} />
        ) : (
          <Table columns={['Member', 'Spots Held', 'Enrolled On', 'Actions']}>
            {uniqueMembers.map((e) => {
              const mid = e.memberId ?? e.id;
              const member = memberMap[mid];
              const isAdmin = !member; // UUID not in member-service = admin/staff holding a spot
              return (
                <Tr key={mid}>
                  <Td className="font-medium text-gray-900">
                    {isAdmin ? (
                      <AdminSpotCell adminId={mid} />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: '#1E3A5F' }}>
                          {member.fullName[0].toUpperCase()}
                        </div>
                        <MemberLink id={mid} name={member.fullName} />
                        <MemberInfoPopover member={member} />
                      </div>
                    )}
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
  const { data: staffList = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const adminOptions = staffList.map((s) => ({
    id: s.id,
    fullName: `${s.fullName ?? s.username} (Admin)`,
  }));

  const initMonth  = prefill?.reservationMonth ? prefill.reservationMonth.substring(0, 7) : '';
  const initPayout = prefill?.payoutAmount     ? String(prefill.payoutAmount)             : '';
  const [form, setForm] = useState({ reservationMonth: initMonth, memberId: '', orgHeld: false, payoutAmount: initPayout, postPayoutContribution: '' });

  const mutation = useMutation({
    mutationFn: () => addReservationSlot({
      chitId,
      reservationMonth: form.reservationMonth + '-01',
      monthNumber: prefill?.monthNumber ?? undefined,
      memberId: form.orgHeld ? null : (form.memberId || null),
      orgHeld: form.orgHeld,
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
          <Select
            value={form.orgHeld ? 'ORG' : form.memberId}
            onChange={(e) => {
              if (e.target.value === 'ORG') {
                setForm((f) => ({ ...f, memberId: '', orgHeld: true }));
              } else {
                setForm((f) => ({ ...f, memberId: e.target.value, orgHeld: false }));
              }
            }}
          >
            <option value="">— Unallocated —</option>
            <option value="ORG">🏛 Organization</option>
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

// "Rajesh Kumar Sharma" → "Rajesh S."  keeps options compact in narrow dropdowns
function shortName(full) {
  if (!full) return '';
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
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

function SlotAuditTooltip({ slot, memberMap }) {
  const [coords, setCoords] = useState(null);
  const updatedByObj = slot.updatedBy ? memberMap[String(slot.updatedBy)] : null;
  const updatedByName = updatedByObj
    ? (updatedByObj.fullName ?? updatedByObj.name)
    : slot.updatedBy ? `ID: ${String(slot.updatedBy).slice(0, 8)}…` : null;

  return (
    <>
      <span
        className="inline-flex cursor-help flex-shrink-0"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
        }}
        onMouseLeave={() => setCoords(null)}
      >
        <Info size={11} className="text-gray-300 hover:text-[#1E3A5F] transition-colors" />
      </span>
      {coords && (
        <div
          className="fixed w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-[9999] pointer-events-none"
          style={{ left: coords.x, top: coords.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Last modified</p>
          {updatedByName && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Users size={11} className="flex-shrink-0 text-gray-400" /> {updatedByName}
            </div>
          )}
          {slot.updatedAt && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <Clock size={11} className="flex-shrink-0 text-gray-400" />
              {new Date(slot.updatedAt).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          )}
          {slot.createdAt && (
            <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-gray-100 text-xs text-gray-400">
              Created {new Date(slot.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Member / Admin picker modal ─────────────────────────────────────────────
function MemberPickerRow({ id, name, phone, city, isAdmin, isSelected, balance, slotCount, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-0 ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isAdmin ? 'bg-amber-600 text-white' : 'bg-[#1E3A5F] text-white'}`}>
        {isAdmin ? '★' : (name?.[0] ?? '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
          {isAdmin && (
            <span className="inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
              Admin
            </span>
          )}
          {isSelected && (
            <span className="inline-flex items-center text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
              Selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {phone && <span className="text-xs text-gray-400">{phone}</span>}
          {city && <span className="text-xs text-gray-400">{phone ? '·' : ''} {city}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0 min-w-[90px] space-y-0.5">
        {slotCount > 0 && (
          <p className="text-xs font-semibold text-[#1E3A5F]">{slotCount} ({slotCount === 1 ? 'total spot' : 'total spots'})</p>
        )}
        {balance !== undefined && (
          <p className={`text-xs font-medium ${Number(balance) > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {Number(balance) > 0
              ? `₹${Number(balance).toLocaleString('en-IN')} due`
              : '✓ clear'}
          </p>
        )}
      </div>
    </button>
  );
}

function MemberPickerModal({ slots, members, adminOptions, canShowAdmins, value, onChange, onClose }) {
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const allPickableIds = [
    ...(canShowAdmins ? adminOptions.map((a) => String(a.id)) : []),
    ...members.map((m) => String(m.id)),
  ];

  const { data: balanceMap = {} } = useQuery({
    queryKey: ['balances-picker', allPickableIds.slice().sort().join(',')],
    queryFn: () => getMemberBalanceBulk(allPickableIds),
    enabled: allPickableIds.length > 0,
  });

  // Slot count per member IN THIS CHIT (excluding voided)
  const slotCountMap = {};
  for (const s of slots) {
    if (s.memberId && s.status !== 'VOIDED') {
      const k = String(s.memberId);
      slotCountMap[k] = (slotCountMap[k] ?? 0) + 1;
    }
  }

  const q = search.toLowerCase().trim();
  const filteredAdmins = (canShowAdmins ? adminOptions : []).filter(
    (a) => !q || (a.fullName ?? '').toLowerCase().includes(q)
  );
  const filteredMembers = members.filter((m) => {
    if (!q) return true;
    return (
      (m.fullName ?? m.name ?? '').toLowerCase().includes(q) ||
      (m.phone ?? '').includes(search) ||
      (m.city ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <Modal title="Select Member or Organization" onClose={onClose} size="md">
      <div className="px-4 pt-1 pb-3 border-b border-gray-100">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search by name, phone or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
        />
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        {/* Unallocated */}
        <button
          type="button"
          onClick={() => { onChange(''); onClose(); }}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${!value ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
        >
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-base flex-shrink-0">—</div>
          <span className="text-sm text-gray-500 italic flex-1">Unallocated</span>
          {!value && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Selected</span>}
        </button>
        {/* Organization */}
        {!search && (
          <button
            type="button"
            onClick={() => { onChange('ORG'); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 transition-colors ${value === 'ORG' ? 'bg-[#EEF2F8] hover:bg-[#E0E9F4]' : 'hover:bg-gray-50'}`}
          >
            <div className="w-9 h-9 rounded-full bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-[#1E3A5F]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1E3A5F]">Organization</p>
              <p className="text-xs text-gray-400">Org-held slot · installment auto-covered</p>
            </div>
            {value === 'ORG' && <span className="text-[10px] font-semibold bg-[#EEF2F8] text-[#1E3A5F] px-1.5 py-0.5 rounded-full">Selected</span>}
          </button>
        )}
        {filteredMembers.map((m) => (
          <MemberPickerRow
            key={m.id}
            id={m.id}
            name={m.fullName ?? m.name}
            phone={m.phone}
            city={m.city}
            isAdmin={false}
            isSelected={String(value) === String(m.id)}
            balance={balanceMap[String(m.id)]}
            slotCount={slotCountMap[String(m.id)] ?? 0}
            onSelect={() => { onChange(String(m.id)); onClose(); }}
          />
        ))}
        {filteredAdmins.length === 0 && filteredMembers.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">No matches for "{search}"</div>
        )}
      </div>
    </Modal>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="bg-red-50 border border-red-100 rounded-lg" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
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
        <div className="flex gap-3" style={{ marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm({ reason, replaceAt })} disabled={!reason.trim()} loading={loading} className="flex-1">
            <XCircle size={13} /> Void Slot
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Slot History Modal ───────────────────────────────────────────────────────
const ACTION_LABELS = {
  SLOT_CREATED:   { label: 'Created',   color: 'bg-green-100 text-green-700' },
  SLOT_UPDATED:   { label: 'Updated',   color: 'bg-blue-100 text-blue-700' },
  SLOT_VOIDED:    { label: 'Voided',    color: 'bg-red-100 text-red-600' },
  SLOT_PROCESSED: { label: 'Processed', color: 'bg-purple-100 text-purple-700' },
  SLOT_SWAPPED:   { label: 'Swapped',   color: 'bg-amber-100 text-amber-700' },
};

function parseState(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function SlotHistoryModal({ slot, memberMap, onClose }) {
  const monthLabel = formatMonthLabel(slot.reservationMonth, slot.monthNumber);
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['slotHistory', slot.id],
    queryFn: () => getSlotHistory(slot.id),
  });

  function renderState(raw) {
    const s = parseState(raw);
    if (!s) return null;
    const memberId = s.memberId ?? s.chit?.members;
    const memberName = memberId ? (memberMap[String(memberId)]?.fullName ?? memberMap[String(memberId)]?.name ?? `#${String(memberId).slice(0,8)}`) : null;
    const payout = s.payoutAmount ? `₹${Number(s.payoutAmount).toLocaleString()}` : null;
    const status = s.status;
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        {memberName && <span><span className="text-gray-400">Member:</span> {memberName}</span>}
        {payout     && <span><span className="text-gray-400">Payout:</span> {payout}</span>}
        {status     && <span><span className="text-gray-400">Status:</span> {status}</span>}
      </div>
    );
  }

  return (
    <Modal title="" onClose={onClose} size="md">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
            <History size={15} className="text-[#1E3A5F]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Slot History</p>
            <p className="text-xs text-gray-400">{monthLabel}</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4 max-h-[420px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
            <Clock size={15} className="animate-spin" /> Loading history…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
            <History size={28} strokeWidth={1.5} />
            <p className="text-sm">No history recorded yet</p>
            <p className="text-xs text-gray-300">Changes will appear here after the next edit</p>
          </div>
        ) : (
          <ol className="relative border-l border-gray-100 ml-2 space-y-5">
            {[...logs].reverse().map((entry) => {
              const cfg = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'bg-gray-100 text-gray-500' };
              const before = renderState(entry.beforeState);
              const after  = renderState(entry.afterState);
              return (
                <li key={entry.id} className="pl-5">
                  {/* dot */}
                  <span className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white bg-[#1E3A5F]" />

                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {entry.createdAt ? new Date(entry.createdAt.endsWith('Z') ? entry.createdAt : entry.createdAt + 'Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    {entry.actorRole && (
                      <span className="text-[10px] text-gray-300 font-medium uppercase tracking-wide">{entry.actorRole}</span>
                    )}
                  </div>

                  {(before || after) && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5 text-xs">
                      {before && (
                        <div className="flex gap-2 items-start">
                          <span className="text-gray-300 font-semibold w-12 flex-shrink-0">Before</span>
                          <div>{before}</div>
                        </div>
                      )}
                      {after && (
                        <div className="flex gap-2 items-start">
                          <span className="text-[#1E3A5F] font-semibold w-12 flex-shrink-0">After</span>
                          <div>{after}</div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="px-6 pb-5 pt-2">
        <Button variant="muted" onClick={onClose} className="w-full">Close</Button>
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
    const name  = s.orgHeld
      ? 'Organization'
      : s.memberId ? (memberMap[String(s.memberId)]?.fullName ?? memberMap[String(s.memberId)]?.name ?? 'Unknown') : 'Unallocated';
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p className="text-sm text-gray-500">
          Select two RESERVED slots to swap their assigned members. Payout amounts stay with their original months.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          <div className="bg-blue-50 border border-blue-100 rounded-lg" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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

        <div className="flex gap-3" style={{ marginTop: 4 }}>
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
  const [historySlot, setHistorySlot] = useState(null);    // slot whose audit history is being viewed
  const [pickerSlot, setPickerSlot] = useState(null);      // slot whose member picker popup is open

  // Local edits keyed by slot.id — only set when a user modifies a row
  const [edits, setEdits] = useState({});

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });

  const { data: allMembers = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: staffList = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const adminOptions = staffList.map((s) => ({
    id: s.id,
    fullName: `${s.fullName ?? s.username} (Admin)`,
  }));
  const memberMap = Object.fromEntries([
    ...adminOptions.map((ao) => [String(ao.id), ao]),
    ...allMembers.map((m) => [String(m.id), m]),
  ]);
  const activeMembers = [...allMembers.filter((m) => m.status === 'ACTIVE')]
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  // Precompute for member picker: which IDs are regular members vs. admins
  const memberIdSet = new Set(activeMembers.map((m) => String(m.id)));

  // Current displayed value for a field — edit state wins over server state
  function getEdit(slot) {
    return edits[slot.id] ?? {
      memberId:     slot.orgHeld ? 'ORG' : String(slot.memberId ?? ''),
      payoutAmount: String(slot.payoutAmount ?? ''),
    };
  }

  // A row is dirty only if the user actually changed something from the server value
  function isDirty(slot) {
    const e = edits[slot.id];
    if (!e) return false;
    const editIsOrg    = e.memberId === 'ORG';
    const serverIsOrg  = slot.orgHeld ?? false;
    const editMemberId = editIsOrg ? null : (e.memberId || null);
    const serverMemberId = slot.memberId ? String(slot.memberId) : null;
    const memberChanged = editMemberId !== serverMemberId || editIsOrg !== serverIsOrg;
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
        memberId:     slot.orgHeld ? 'ORG' : String(slot.memberId ?? ''),
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
      memberId: edit.memberId === 'ORG' ? null : (edit.memberId || null),
      orgHeld: edit.memberId === 'ORG',
      payoutAmount: edit.payoutAmount ? Number(edit.payoutAmount) : null,
      postPayoutContribution: slot.postPayoutContribution ?? null,
    }),
    onSuccess: (updatedSlot, { slot }) => {
      // Immediately update the cache with the server response so the UI
      // doesn't flash "Unallocated" while the background refetch is in flight.
      if (updatedSlot) {
        qc.setQueryData(['reservations', chitId], (old) =>
          Array.isArray(old) ? old.map((s) => s.id === slot.id ? updatedSlot : s) : old
        );
      }
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
  const maxSlots = chit?.durationMonths ?? chit?.totalMembers ?? Infinity;
  const slotsAreFull = active.length >= maxSlots;

  // Extra slots: active slots beyond the chit's member count — admin can delete these directly
  const memberCount = chit?.totalMembers ?? 0;
  const extraSlotIds = memberCount > 0 && active.length > memberCount
    ? new Set(
        [...active]
          .sort((a, b) => (a.monthNumber ?? Infinity) - (b.monthNumber ?? Infinity))
          .slice(memberCount)
          .map((s) => s.id)
      )
    : new Set();

  return (
    <div className="space-y-4">
      {extraSlotIds.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="flex-shrink-0" />
          {extraSlotIds.size} slot{extraSlotIds.size > 1 ? 's' : ''} exceed{extraSlotIds.size === 1 ? 's' : ''} the chit's {memberCount}-member limit. Use the Delete button on the extra slot{extraSlotIds.size > 1 ? 's' : ''} to remove them.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {active.length} active slots{maxSlots < Infinity ? ` / ${maxSlots}` : ''}
          </p>
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
            {!slotsAreFull && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Add Slot
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : slots.length === 0 ? (
          <EmptyState icon={List} title="No schedule yet"
            message="Add reservation slots to build the payout schedule."
            action={canEdit && !slotsAreFull ? 'Add Slot' : undefined}
            onAction={canEdit && !slotsAreFull ? () => setShowAdd(true) : undefined} />
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
                  const memberName = slot.orgHeld
                    ? 'Organization'
                    : memberObj
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
                            <button
                              type="button"
                              onClick={() => setPickerSlot(slot)}
                              className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-[#1E3A5F] transition-colors w-44 text-left"
                            >
                              <span className="flex-1 truncate text-gray-700">
                                {edit.memberId === 'ORG'
                                  ? <span className="flex items-center gap-1.5 font-semibold text-[#1E3A5F]"><Building2 size={12} /> Organization</span>
                                  : edit.memberId
                                    ? (memberMap[edit.memberId]?.fullName ?? memberMap[edit.memberId]?.name ?? 'Unknown')
                                    : <span className="text-gray-400 italic">Unallocated</span>}
                              </span>
                              <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                            </button>
                            {edit.memberId && edit.memberId !== 'ORG' && (
                              <span className="flex-shrink-0">
                                <MemberInfoPopover member={memberMap[edit.memberId]} />
                              </span>
                            )}
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
                            style={{ width: 144 }}
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
                            <span className="text-xs text-red-400 truncate" style={{ maxWidth: 144 }} title={slot.voidReason}>
                              {slot.voidReason}
                            </span>
                          )}
                          {slot.updatedAt && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">
                                {new Date(slot.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <SlotAuditTooltip slot={slot} memberMap={memberMap} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* ── Actions ── */}
                      <td className="px-5 py-3">
                        <div className="flex gap-2 items-center flex-wrap">
                          {canEdit ? (isVoided ? (
                            <>
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
                            </>
                          ) : (
                            <>
                              {dirty && (
                                <Button size="sm"
                                  loading={saveMutation.isPending}
                                  onClick={() => saveMutation.mutate({ slot, edit })}>
                                  <CheckCircle size={13} /> Save
                                </Button>
                              )}
                              {extraSlotIds.has(slot.id) && slot.status !== 'PROCESSED' ? (
                                <Button variant="danger" size="sm"
                                  title="Extra slot beyond member count — delete permanently"
                                  onClick={() => setDeletingSlot(slot)}>
                                  <Trash2 size={13} /> Delete
                                </Button>
                              ) : (
                                <Button variant="danger" size="sm"
                                  onClick={() => setVoidingSlot(slot)}>
                                  <XCircle size={13} /> Void
                                </Button>
                              )}
                            </>
                          )) : (
                            <span className="text-xs text-gray-400 italic">—</span>
                          )}
                          {/* History icon — always visible */}
                          <button
                            type="button"
                            title="View slot history"
                            onClick={() => setHistorySlot(slot)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors cursor-pointer flex-shrink-0"
                          >
                            <History size={14} />
                          </button>
                        </div>
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

      {historySlot && (
        <SlotHistoryModal
          slot={historySlot}
          memberMap={memberMap}
          onClose={() => setHistorySlot(null)}
        />
      )}

      {pickerSlot && (
        <MemberPickerModal
          slots={slots}
          members={activeMembers}
          adminOptions={[]}
          canShowAdmins={false}
          value={getEdit(pickerSlot).memberId}
          onChange={(val) => updateEdit(pickerSlot, 'memberId', val)}
          onClose={() => setPickerSlot(null)}
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
  const [additionalWinners, setAdditionalWinners] = useState([]); // [{ id, memberId, slotId }]
  const [preview, setPreview] = useState(null);

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
  const memberMap = Object.fromEntries([
    ...staffListDraw.map((s) => [String(s.id), { id: s.id, fullName: `${s.fullName ?? s.username} (Admin)`, phone: null }]),
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
  const isOrgDraw = primaryWinnerSlot?.orgHeld === true;
  const cyclePayoutAmount = primaryWinnerSlot?.payoutAmount ? Number(primaryWinnerSlot.payoutAmount) : null;

  // Candidates for additional early payout: all enrolled members (members + any admin) with RESERVED slots
  const activeMemberIds = new Set([
    ...activeMembers.map((m) => String(m.id)),
    ...staffListDraw.map((s) => String(s.id)),
  ]);
  const extraCandidates = (() => {
    const seen = new Set();
    return enrollments.filter((e) => {
      const mid = e.memberId ?? e.id;
      if (seen.has(mid)) return false;
      if (!activeMemberIds.has(String(mid))) return false;
      const memberReserved = reservations.filter((r) => r.memberId === mid && r.status === 'RESERVED');
      // Allow primary winner only if they have >1 reserved slot (one for primary, one for extra)
      if (mid === primaryWinnerSlot?.memberId && memberReserved.length <= 1) return false;
      if (!memberReserved.length) return false;
      seen.add(mid);
      return true;
    });
  })();

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
      const isPrimary  = String(mid) === String(primaryWinnerSlot?.memberId);
      const extraCount = additionalWinners.filter((w) => w.memberId && String(w.memberId) === String(mid)).length;
      const isExtra    = extraCount > 0;
      const isWinner   = isPrimary || isExtra;
      // Total wins for this member (could be primary + multiple extra slots)
      const winCount   = (isPrimary ? 1 : 0) + extraCount;
      const netPayout  = isWinner && cyclePayoutAmount !== null
        ? winCount * cyclePayoutAmount - amountDue
        : null;

      members.push({
        memberId: mid,
        memberName:      memberMap[mid]?.fullName ?? `Member #${mid}`,
        phone:           memberMap[mid]?.phone ?? null,
        previousBalance,
        processedCount:  processedSlots.length,
        reservedCount:   reservedSlots.length,
        reservedSlotNums: reservedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        processedSlotNums: processedSlots.map((r) => r.monthNumber).filter(Boolean).sort((a, b) => a - b),
        amountDue,
        isWinner, isPrimary, isExtra, winCount,
        netPayout,
      });
    }
    // Add org-held RESERVED slots as separate rows in the preview
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

  // Slot IDs to mark PROCESSED when cycle is opened
  const slotsToProcess = [
    ...(primaryWinnerSlot ? [primaryWinnerSlot.id] : []),
    ...additionalWinners.filter((w) => w.slotId).map((w) => w.slotId),
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      await openDraw({
        chitId,
        monthNumber: nextCycleNum,
        dueDate,
        installmentAmount: baseInstallment,
        maxCycles: chit?.totalMembers ?? nextCycleNum,
        members: preview.members.filter((m) => !m.isOrg).map((m) => ({ memberId: m.memberId, amountDue: m.amountDue })),
      });

      // Mark winner slots PROCESSED — commitment is made at cycle open time
      if (slotsToProcess.length > 0) {
        await Promise.all(slotsToProcess.map((sid) => markSlotProcessed({ chitId, reservationId: sid }).catch(() => {})));
      }

      // Allocate winner(s) — records who won this cycle; payout is managed separately in Winners tab
      // Org-held draws have no member winner — skip recordWinner entirely for org slots
      // Group by memberId so same member with multiple slots gets ONE combined winner record
      const primaryAmt = Number(primaryWinnerSlot?.payoutAmount ?? chit?.chitValue ?? 0);
      const winsByMember = {};
      if (primaryWinnerSlot && !primaryWinnerSlot.orgHeld) {
        const mid = String(primaryWinnerSlot.memberId);
        winsByMember[mid] = (winsByMember[mid] ?? 0) + 1;
      }
      for (const aw of additionalWinners) {
        if (aw.memberId && aw.slotId) {
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

  const totalCollection = preview?.members.reduce((s, m) => s + m.amountDue, 0) ?? 0;

  const winnerName = primaryWinnerSlot
    ? (isOrgDraw ? null : (memberMap[primaryWinnerSlot.memberId]?.fullName ?? 'Unknown'))
    : null;

  const totalMembers   = enrollments.length > 0 ? [...new Set(enrollments.map((e) => e.memberId ?? e.id))].length : (chit?.totalMembers ?? 0);
  const processedCount = [...new Set(enrollments.map((e) => e.memberId ?? e.id))].length > 0
    ? reservations.filter((r) => r.status === 'PROCESSED').length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-8 lg:p-10">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl sm:shadow-2xl overflow-hidden flex flex-col sm:flex-row max-h-[82vh]">

        {/* ── Left panel — navy context sidebar ── */}
        <div
          className="flex-shrink-0 sm:w-52 flex flex-col overflow-y-auto"
          style={{ background: 'linear-gradient(160deg, #162D49 0%, #1E3A5F 60%, #243F6A 100%)', padding: '24px 24px', gap: 20, display: 'flex', flexDirection: 'column' }}
        >
          {/* Draw number */}
          <div>
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">Opening</p>
            <p className="text-3xl font-black text-white leading-none" style={{ fontFamily: 'Merriweather, serif' }}>
              Draw #{nextCycleNum}
            </p>
            <p className="text-xs text-white/50 mt-1">{chit?.name}</p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Winner block */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Trophy size={12} style={{ color: '#D4A017' }} />
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
                {isOrgDraw ? 'This Draw' : 'Winner'}
              </p>
            </div>
            {isOrgDraw ? (
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

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Chit progress */}
          <div className="mt-auto">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Progress</p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-black text-white">{nextCycleNum - 1}</span>
              <span className="text-sm text-white/40 mb-0.5">/ {chit?.totalMembers ?? '?'}</span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">draws done</p>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: chit?.totalMembers ? `${Math.min(100, ((nextCycleNum - 1) / chit.totalMembers) * 100)}%` : '0%',
                  background: 'linear-gradient(90deg, #D4A017, #F59E0B)',
                }}
              />
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-2 pt-1">
            {[1, 2].map((s) => (
              <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-5 bg-white' : 'w-1.5 bg-white/25'}`} />
            ))}
            <span className="text-[10px] text-white/30 ml-1">{step === 1 ? 'Configure' : 'Preview'}</span>
          </div>
        </div>

        {/* ── Right panel — white form / preview ── */}
        <div className="flex-1 bg-white flex flex-col min-h-0">

          {/* Header */}
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

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 20, paddingBottom: 20 }}>

            {step === 1 ? (
              <form id="open-draw-form" onSubmit={(e) => { e.preventDefault(); computePreview(); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Due date */}
                <FormField label="Payment Due Date" required>
                  <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </FormField>

                {/* Additional winners */}
                {cyclePayoutAmount && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {additionalWinners.map((aw, idx) => {
                      // RESERVED slots for this additional winner, excluding primary slot and slots already picked by earlier rows
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
                            <FormField label="Slot to settle">
                              <SlotPickerDropdown slots={awSlots} value={aw.slotId}
                                onChange={(v) => updateWinner(aw.id, { slotId: v })}
                                disabled={!aw.memberId} placeholder="Select slot…" />
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

                {/* Due date note */}
                <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>Members will be notified to submit payment by the due date. Winner receives payout upon cycle close.</span>
                </div>

              </form>
            ) : (
              <div className="space-y-4">

                {/* Stats row */}
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

                {/* Member table */}
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
                            className={`transition-colors ${m.isOrg ? 'bg-[#EEF2F8]/40' : m.isPrimary ? 'bg-amber-50/70' : m.isExtra ? 'bg-[#EEF2F8]/60' : 'bg-white hover:bg-gray-50/60'}`}>
                            <td className={`py-2.5 pl-4 pr-3 ${m.isOrg && m.isPrimary ? 'border-l-2 border-[#1E3A5F]' : (m.isPrimary || m.isExtra) ? 'border-l-2' : ''}`}
                              style={(!m.isOrg && (m.isPrimary || m.isExtra)) ? { borderLeftColor: m.isPrimary ? '#D97706' : '#1E3A5F' } : {}}>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {m.isOrg
                                    ? <span className="flex items-center gap-1 font-semibold text-[#1E3A5F] text-sm"><Building2 size={12} /> {m.memberName}</span>
                                    : <span className="font-semibold text-gray-900 text-sm">{m.memberName}</span>}
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
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {m.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={9} />{m.phone}</span>}
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
                              <span className="text-sm font-semibold text-gray-800">₹{m.amountDue.toLocaleString()}</span>
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

                {slotsToProcess.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2.5">
                    <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                    {slotsToProcess.length === 1 ? '1 reservation slot' : `${slotsToProcess.length} reservation slots`} will be marked settled.
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex-shrink-0 border-t border-gray-100 flex gap-3 bg-white" style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 16 }}>
            {step === 1 ? (
              <>
                <Button type="button" variant="muted" onClick={onClose} className="flex-1">Cancel</Button>
                <Button
                  type="submit"
                  form="open-draw-form"
                  disabled={enrollments.length === 0 || additionalWinners.some((w) => !w.memberId || !w.slotId)}
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
  SETTLED:             { bg: 'bg-green-50',  dot: 'bg-green-500',  text: 'Settled'          },
  PARTIALLY_PAID:      { bg: 'bg-amber-50',  dot: 'bg-amber-400',  text: 'Partial'          },
  OUTSTANDING:         { bg: 'bg-red-50',    dot: 'bg-red-400',    text: 'Outstanding'      },
  WAIVED:              { bg: 'bg-gray-50',   dot: 'bg-gray-300',   text: 'Waived'           },
  PAYOUT_DEDUCTED:     { bg: 'bg-purple-50', dot: 'bg-purple-400', text: 'Paid at Payout'   },
  SETTLEMENT_CLEARED:  { bg: 'bg-teal-50',   dot: 'bg-teal-500',   text: 'In Settlement'    },
};

function PaymentStatusBadge({ status, overdue }) {
  const style = STATUS_ROW[status] ?? STATUS_ROW.OUTSTANDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full
      ${status === 'SETTLED'             ? 'bg-green-100 text-green-700'
      : status === 'PARTIALLY_PAID'      ? 'bg-amber-100 text-amber-700'
      : status === 'WAIVED'              ? 'bg-gray-100 text-gray-500'
      : status === 'PAYOUT_DEDUCTED'     ? 'bg-purple-100 text-purple-700'
      : status === 'SETTLEMENT_CLEARED'  ? 'bg-teal-100 text-teal-700'
      : 'bg-red-100 text-red-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.text}
      {overdue && status !== 'SETTLEMENT_CLEARED' && <span className="text-red-500">!</span>}
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
                      <th className="py-2.5 text-right text-xs font-semibold text-gray-500 uppercase" style={{ paddingLeft: 12, paddingRight: 12, minWidth: 80, whiteSpace: 'nowrap' }}>Balance</th>
                      <th className="py-2.5 text-left text-xs font-semibold text-gray-500 uppercase" style={{ paddingLeft: 24, paddingRight: 12, minWidth: 120, whiteSpace: 'nowrap' }}>Status</th>
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
                          <td style={{ paddingLeft: 24, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}><PaymentStatusBadge status={r.status} overdue={r.overdue} /></td>
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
                  const isVoiding  = voidingId === b.id;
                  const isVoided   = b.status === 'VOIDED';
                  const date       = b.createdAt ? new Date(b.createdAt.endsWith('Z') ? b.createdAt : b.createdAt + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                  // Cross-chit: this batch was recorded for a DIFFERENT chit but spilled into this one
                  const isCarryIn  = b.chitId !== chitId;

                  // Allocations for THIS chit only (carry-in batches have mixed allocations)
                  const thisChitAllocs  = (b.allocations ?? []).filter(a => a.chitId === chitId);
                  // Allocations that went to OTHER chits (carry-out from a batch recorded here)
                  const otherChitAllocs = (b.allocations ?? []).filter(a => a.chitId !== chitId);

                  return (
                    <div
                      key={b.id}
                      className={`border rounded-lg p-4 space-y-2 ${
                        isVoided   ? 'border-gray-200 bg-gray-50' :
                        isCarryIn  ? 'border-teal-200 bg-teal-50/40' :
                                     'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Carry-in banner */}
                      {isCarryIn && (
                        <div className="flex items-center gap-1.5 text-xs text-teal-700 font-medium mb-1">
                          <span>↩</span>
                          <span>Carry forward — excess from another chit applied here</span>
                        </div>
                      )}

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-base font-semibold ${isVoided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {isCarryIn
                                ? `₹${Number(thisChitAllocs.reduce((s, a) => s + Number(a.allocatedAmount), 0)).toLocaleString()} applied`
                                : `₹${Number(b.totalAmount).toLocaleString()}`}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_STYLE[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {b.status === 'AWAITING_REMITTANCE' ? 'Pending Remittance' : b.status === 'VOIDED' ? 'Voided' : 'Settled'}
                            </span>
                            {!isCarryIn && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                {BATCH_MODE_LABEL[b.paymentMode] ?? b.paymentMode}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{date}</span>
                        </div>

                        {!isVoided && !isCarryIn && (
                          <button
                            onClick={() => { setVoidingId(isVoiding ? null : b.id); setVoidReason(''); }}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap"
                          >
                            {isVoiding ? 'Cancel' : 'Void'}
                          </button>
                        )}
                      </div>

                      {/* Allocations for this chit */}
                      {(isCarryIn ? thisChitAllocs : b.allocations)?.length > 0 && (
                        <div className="pl-1 space-y-0.5">
                          {(isCarryIn ? thisChitAllocs : b.allocations).map((a, i) => (
                            <p key={i} className={`text-xs ${isCarryIn ? 'text-teal-700 font-medium' : 'text-gray-500'}`}>
                              {isCarryIn ? '↩' : '→'} Draw {a.monthNumber}: ₹{Number(a.allocatedAmount).toLocaleString()}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Carry-out: allocations that spilled from this batch into other chits */}
                      {!isCarryIn && otherChitAllocs.length > 0 && (
                        <div className="pl-1 space-y-0.5 border-t border-amber-100 pt-1.5 mt-1">
                          <p className="text-xs text-amber-600 font-medium mb-0.5">Excess carried forward to other chit(s):</p>
                          {otherChitAllocs.map((a, i) => (
                            <p key={i} className="text-xs text-amber-700">
                              ↪ Draw {a.monthNumber} (other chit): ₹{Number(a.allocatedAmount).toLocaleString()}
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
  const qc = useQueryClient();
  const toast = useToastContext();
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['drawPayments', draw.id],
    queryFn: () => getDrawPayments(draw.id),
    enabled: !!draw.id,
    refetchOnMount: 'always',
  });

  const promisedDateMutation = useMutation({
    mutationFn: ({ recordId, date }) => updatePromisedDate({ recordId, promisedPaymentDate: date || null }),
    onSuccess: (updated) => {
      qc.setQueryData(['drawPayments', draw.id], (old) =>
        (old ?? []).map((p) => p.id === updated.id ? { ...p, promisedPaymentDate: updated.promisedPaymentDate } : p)
      );
      toast.success('Promised date saved');
    },
    onError: () => toast.error('Failed to save date'),
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
    <div className="border-t border-gray-100 overflow-auto max-h-80" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10">Member</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10">Due</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10">Paid</th>
            <th className="py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10" style={{ paddingLeft: 12, paddingRight: 12, minWidth: 80, whiteSpace: 'nowrap' }}>Balance</th>
            <th className="py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10" style={{ paddingLeft: 24, paddingRight: 12, minWidth: 120, whiteSpace: 'nowrap' }}>Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 bg-gray-50 z-10">Promised Date</th>
            <th className="px-3 py-2.5 sticky top-0 bg-gray-50 z-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map((p) => {
            const member = memberMap[p.memberId];
            const style  = STATUS_ROW[p.status] ?? STATUS_ROW.OUTSTANDING;
            const canCollect   = p.status === 'OUTSTANDING' || p.status === 'PARTIALLY_PAID';
            // PAYOUT_DEDUCTED has amountPaid > 0 but no batch — hide the Transactions link
            const hasPaidSomething = Number(p.amountPaid) > 0 && p.status !== 'PAYOUT_DEDUCTED';
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
                <td style={{ paddingLeft: 24, paddingRight: 12, paddingTop: 12, paddingBottom: 12 }}>
                  <PaymentStatusBadge status={p.status} overdue={p.overdue} />
                </td>
                <td className="px-3 py-3">
                  {canCollect ? (
                    <input
                      type="date"
                      defaultValue={p.promisedPaymentDate ?? ''}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 focus:outline-none focus:border-[#1E3A5F] cursor-pointer"
                      title="Date member promised to pay"
                      onChange={(e) => promisedDateMutation.mutate({ recordId: p.id, date: e.target.value || null })}
                    />
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
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

  const [amount, setAmount]         = useState(String(balance));
  const [paymentMode, setPaymentMode] = useState(isWorker ? 'CASH' : 'UPI');
  const [collectedBy, setCollectedBy] = useState('SELF'); // 'SELF' or a staff UUID
  const [notes, setNotes]           = useState('');

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const collectors = staff.filter((s) => (s.role === 'WORKER' || s.role === 'MANAGER') && s.enabled !== false);

  const isCash       = paymentMode === 'CASH';
  const viaTeam      = isCash && collectedBy !== 'SELF';
  const amtNum       = Number(amount || 0);
  const isOverpay    = amtNum > balance && balance > 0;

  function invalidate() {
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
    qc.invalidateQueries({ queryKey: ['draws', chitId] });
    qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, member?.id] });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (viaTeam) {
        // Create a cash pickup request — assigns the worker to go collect from the member.
        // The payment is NOT recorded yet; it appears in Cash Requests until the worker collects.
        return adminCreateCashRequest({
          memberId: paymentRecord.memberId,
          workerId: collectedBy,
          chitId,
          requestedAmount: amtNum,
          notes: notes || null,
        });
      } else {
        // Admin direct (CASH self or UPI/Bank/Cheque) → settled immediately
        return recordPayment({ chitId, memberId: paymentRecord.memberId, amount: amtNum, paymentMode, notes: notes || undefined });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(viaTeam ? 'Cash pickup assigned — visible in Cash Requests' : 'Payment recorded and settled');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record payment'),
  });

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

        {/* Amount */}
        <FormField label="Amount (₹)" required>
          <Input type="number" min="0.01" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} required />
          {isOverpay && (
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ ₹{amtNum.toLocaleString()} exceeds outstanding by <strong>₹{(amtNum - balance).toLocaleString()}</strong> — excess is not stored as credit.
            </p>
          )}
        </FormField>

        {/* Payment mode */}
        {!isWorker && (
          <FormField label="Payment Mode" required>
            <Select value={paymentMode} onChange={(e) => { setPaymentMode(e.target.value); setCollectedBy('SELF'); }}>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
            </Select>
          </FormField>
        )}

        {/* Cash: who has it? */}
        {isCash && (
          <FormField label="Collected by" required>
            <Select value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)}>
              <option value="SELF">Self — I have the cash</option>
              {collectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role === 'WORKER' ? 'Worker' : 'Manager'}: {s.fullName ?? s.username}
                </option>
              ))}
            </Select>
            {viaTeam && (
              <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                A pickup request will be created and assigned to this person. Track it in <em>Cash Requests</em>.
              </p>
            )}
          </FormField>
        )}

        {/* Notes */}
        <FormField label="Reference / Notes">
          <Input placeholder="UPI ref, cheque no., remarks…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            disabled={!amtNum || amtNum <= 0}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1"
          >
            {viaTeam ? `Assign Pickup ₹${amtNum.toLocaleString()}` : `Settle ₹${amtNum.toLocaleString()}`}
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
  const { data: staffListDraws = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const memberMap = Object.fromEntries([
    ...staffListDraws.map((s) => [String(s.id), { id: s.id, fullName: `${s.fullName ?? s.username} (Admin)` }]),
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
  });
  const payoutsByMonth = chitPayouts.reduce((acc, p) => {
    acc[p.monthNumber] = acc[p.monthNumber] ? [...acc[p.monthNumber], p] : [p];
    return acc;
  }, {});

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
      // 1. Find ALL winners for this cycle (multi-winner draws have more than one)
      const cycleWinnerList = winners.filter((w) => w.monthNumber === monthNumber);

      // 2. Cancel ALL payouts for this draw
      const drawPayouts = payoutsByMonth[monthNumber] ?? [];
      for (const payout of drawPayouts) {
        if (payout.status === 'PARTIALLY_DISBURSED') {
          throw new Error('Cannot delete draw — a payout has been partially disbursed. Disburse the remaining amount first.');
        }
        if (payout.status === 'DISBURSED') {
          throw new Error('Cannot delete draw — a payout has already been fully disbursed.');
        }
        if (payout.status === 'PENDING') {
          await revertPayoutDeductions(payout.id).catch(() => null);
          await cancelPayout({ id: payout.id, reason: 'Draw deleted' }).catch(() => null);
        }
      }

      // 3. Revert PROCESSED reservation slot for EACH winner back to RESERVED
      for (const winner of cycleWinnerList) {
        const winnerId = winner.memberId ?? winner.winnerId;
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
      }

      // 3b. For org-held draws (no winner records), revert the most recently processed org slot
      if (cycleWinnerList.length === 0) {
        const orgSlotToRevert = [...reservations]
          .filter((r) => r.orgHeld && r.status === 'PROCESSED')
          .sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))[0];
        if (orgSlotToRevert) {
          await updateReservationSlot({
            chitId,
            reservationId: orgSlotToRevert.id,
            reservationMonth: orgSlotToRevert.reservationMonth,
            memberId: null,
            orgHeld: true,
            payoutAmount: orgSlotToRevert.payoutAmount,
            postPayoutContribution: orgSlotToRevert.postPayoutContribution ?? null,
          }).catch(() => {});
        }
      }

      // 4. Remove all winner records for this cycle
      await deleteWinnerForDraw({ chitId, monthNumber }).catch(() => {});

      // 5. Delete the cycle itself
      await deleteDraw(cycleId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['reservations', chitId] });
      qc.invalidateQueries({ queryKey: ['winners', chitId] });
      qc.invalidateQueries({ queryKey: ['payouts', chitId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'paymentHistory' && String(q.queryKey[1]) === String(chitId) });
      toast.success('Draw deleted — schedule slot restored to RESERVED');
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err.message ?? err.response?.data?.message ?? 'Failed to delete draw'),
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
            const monthPayouts = payoutsByMonth[c.monthNumber] ?? [];
            const fullyCollected = pct === 100 || (c.outstandingCount === 0 && c.settledCount > 0);
            const isDone = c.status === 'CLOSED' || c.status === 'SKIPPED';
            // No-payout draw: all collected, draw closed, but no winner (e.g. unallocated month)
            const isNoPayoutDraw = isDone && cycleWinners.length === 0 && monthPayouts.length === 0 && fullyCollected;
            const isCompleted  = (isDone && monthPayouts.length > 0 && monthPayouts.every((p) => p.status === 'DISBURSED')) || isNoPayoutDraw;

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
                            ? isNoPayoutDraw
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle size={10} /> Completed · No Payout
                                </span>
                              : <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle size={10} /> Completed
                                </span>
                            : <Badge variant={statusBadge(c.status ?? 'OPEN')}>{c.status ?? 'OPEN'}</Badge>
                          }
                          {/* Disbursement status — one badge per payout (multi-winner draws show multiple) */}
                          {monthPayouts.map((p) => p.status === 'DISBURSED' ? (
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle size={10} /> Disbursed ₹{Number(p.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          ) : p.status === 'PENDING' || p.status === 'PARTIALLY_DISBURSED' ? (
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> {p.status === 'PARTIALLY_DISBURSED' ? 'Partial' : 'Pending'} ₹{Number(p.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          ) : null)}
                          {monthPayouts.length === 0 && cycleWinners.length > 0 && (c.status === 'CLOSED' || fullyCollected) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> No Payout Created
                            </span>
                          )}
                          {cycleWinners.length >= 2 && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                              ×{cycleWinners.length} Double Payout
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
                          {monthPayouts.length > 0 && monthPayouts.every((p) => p.status === 'DISBURSED')
                            ? monthPayouts.length > 1
                              ? ` · ${monthPayouts.length} payouts disbursed`
                              : ` · Disbursed ₹${Number(monthPayouts[0].netPayoutAmount).toLocaleString('en-IN')}`
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
  const { data: recStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const memberMap = Object.fromEntries([
    ...(recStaff ?? []).map((s) => [String(s.id), { id: s.id, fullName: `${s.fullName ?? s.username} (Admin)` }]),
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
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff});
  const memberMap = Object.fromEntries([
    ...allStaff.map((s) => [String(s.id), { id: s.id, fullName: `${s.fullName ?? s.username} (Admin)` }]),
    ...allMembers.map((m) => [String(m.id), m]),
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

function TreasuryBadge() {
  const [show, setShow] = useState(false);
  const { data: bal } = useQuery({ queryKey: ['wallet-balance'], queryFn: getWalletBalance});
  const cash = Number(bal?.cashBalance ?? 0);
  const bank = Number(bal?.bankBalance ?? 0);
  const total = Number(bal?.totalBalance ?? 0);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button type="button" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#B8CCE4] bg-[#EEF2F8] text-[#1E3A5F] hover:bg-[#dce6f0] transition-colors cursor-default">
        <Vault size={14} />
      </button>
      {show && (
        <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#1E3A5F] text-white text-xs rounded-xl shadow-xl p-4 z-50 pointer-events-none">
          <p className="font-semibold text-[#D4A017] mb-2">Treasury Balance</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white/70"><Banknote size={11} /> Cash</span>
              <span className="font-semibold">{`₹${cash.toLocaleString('en-IN')}`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white/70"><CreditCard size={11} /> Bank</span>
              <span className="font-semibold">{`₹${bank.toLocaleString('en-IN')}`}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/20 pt-1.5 mt-1">
              <span className="text-white/70">Total</span>
              <span className="font-bold text-[#D4A017]">{`₹${total.toLocaleString('en-IN')}`}</span>
            </div>
          </div>
          <div className="absolute bottom-[-5px] right-4 w-2.5 h-2.5 bg-[#1E3A5F] rotate-45" />
        </div>
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
  const [justCreated, setJustCreated] = useState(false);

  // ── Disburse form state ──
  const [disbMode,  setDisbMode]  = useState('UPI');
  const [refNum,    setRefNum]    = useState('');
  const [disbNotes, setDisbNotes] = useState('');

  // ── Cancel payout form state ──
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason,   setCancelReason]   = useState('');

  // ── Partial disburse amount state ──
  const [disbAmount, setDisbAmount] = useState('');

  // ── Cross-chit balance — for outstanding dues banner ──
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

  const invalidatePayouts = () => {
    qc.invalidateQueries({ queryKey: ['payouts', chitId] });
  };

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
      // Same pattern as createMutation — directly upsert into cache so WinnersTab
      // button stays "Disburse" for PARTIALLY_DISBURSED. invalidatePayouts() would
      // race: refetch can resolve before PARTIALLY_DISBURSED lands, clearing the entry.
      qc.setQueryData(['payouts', chitId], (old) => {
        const without = (old ?? []).filter(
          (x) => !(String(x.monthNumber) === String(p.monthNumber) && String(x.memberId) === String(p.memberId))
        );
        return [...without, p];
      });
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
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
    mutationFn: async () => {
      // Revert PAYOUT_DEDUCTED records before cancelling so installments go back to OUTSTANDING
      await revertPayoutDeductions(payout.id).catch(() => null);
      return cancelPayout({ id: payout.id, reason: cancelReason });
    },
    onSuccess: (p) => {
      setPayout(p);
      invalidatePayouts();
      qc.refetchQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
      toast.success('Payout cancelled');
      setShowCancelForm(false);
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to cancel payout'),
  });


  const net         = payout ? Number(payout.netPayoutAmount) : 0;
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Winner summary ── */}
        <div className="bg-gray-50 rounded-xl text-sm" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: '8px 32px' }}>
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
          <div className="border border-amber-200 bg-amber-50 rounded-xl" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                payout.status === 'PENDING'              ? 'bg-amber-100 text-amber-700' :
                payout.status === 'DISBURSED'            ? 'bg-green-100 text-green-700' :
                payout.status === 'PARTIALLY_DISBURSED'  ? 'bg-blue-100 text-blue-700' :
                payout.status === 'VOIDED'               ? 'bg-red-100 text-red-500' :
                                                           'bg-gray-100 text-gray-500'}`}>
                {payout.status === 'PARTIALLY_DISBURSED' ? 'Partial' : payout.status}
              </span>
              <a
                href={`/payouts/${payout.id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto flex items-center gap-1 text-xs text-[#1E3A5F] hover:underline"
              >
                <ExternalLink size={11} /> Full Details
              </a>
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
                        {new Date(d.disbursedAt.endsWith('Z') ? d.disbursedAt : d.disbursedAt + 'Z').toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
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
                      {new Date(payout.voidedAt.endsWith('Z') ? payout.voidedAt : payout.voidedAt + 'Z').toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
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
          <PayoutCreationForm
            chitId={chitId}
            chit={chit}
            memberId={memberId}
            monthNumber={monthNumber}
            defaultWinningAmount={winner.winningAmount ?? chit?.chitValue}
            defaultAdjustment={winner.discountAmount ?? 0}
            editableAmount
            onSuccess={(p) => {
              setPayout(p);
              setJustCreated(true);
              // Directly upsert into cache so "Create Payout" → "Disburse" switches instantly
              // without a race between setQueryData and an invalidation refetch.
              qc.setQueryData(['payouts', chitId], (old) => {
                const without = (old ?? []).filter(
                  (x) => !(String(x.monthNumber) === String(p.monthNumber) && String(x.memberId) === String(p.memberId))
                );
                return [...without, p];
              });
              // Force-refetch draw payment cards so PAYOUT_DEDUCTED status appears immediately
              qc.refetchQueries({ predicate: (q) => q.queryKey[0] === 'drawPayments' });
              qc.invalidateQueries({ queryKey: ['draws', chitId] });
              qc.invalidateQueries({ queryKey: ['paymentHistory', chitId, memberId] });
            }}
          />
        )}

        {/* ── Just-created confirmation banner ── */}
        {justCreated && payout?.status === 'PENDING' && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Payout created successfully!</p>
              <p className="text-xs text-green-600 mt-0.5">Record the disbursement below to complete the transaction.</p>
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">
                Amount to disburse (₹) <span className="text-gray-400 font-normal">— blank = full ₹{Number(payout.remainingAmount ?? payout.netPayoutAmount).toLocaleString('en-IN')}</span>
              </span>
              <TreasuryBadge />
            </div>
            <FormField>
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

// ─── Status-change dialog (per-status themed) ────────────────────────────────
const STATUS_CHANGE_CFG = {
  ACTIVE: {
    grad: ['#1A7A48', '#145B38'],
    Icon: Play,
    label: 'Activate Chit',
    buttonVariant: 'success',
  },
  COMPLETED: {
    grad: ['#1E3A5F', '#2C5282'],
    Icon: CheckCircle,
    label: 'Mark as Completed',
    buttonVariant: 'primary',
  },
  DRAFT: {
    grad: ['#9A6010', '#7A4C0B'],
    Icon: RotateCcw,
    label: 'Revert to Draft',
    buttonVariant: 'warning',
  },
};

function StatusChangeDialog({
  chit, fromStatus, toStatus,
  pendingStartDate, setPendingStartDate,
  unallocatedCount,
  loading, onConfirm, onClose,
}) {
  const cfg = STATUS_CHANGE_CFG[toStatus];
  if (!cfg) return null;
  const { Icon, grad, label, buttonVariant } = cfg;

  const needsStartDate = toStatus === 'ACTIVE' && fromStatus === 'DRAFT';
  const hasWarning     = toStatus === 'ACTIVE' && unallocatedCount > 0;
  const confirmDisabled = needsStartDate && !pendingStartDate;

  const descriptions = {
    ACTIVE: hasWarning
      ? `${unallocatedCount} slot${unallocatedCount > 1 ? 's are' : ' is'} still UNALLOCATED — no member or payout assigned. Those months will have no winner. Fill them in first, or activate anyway.`
      : `Members will be enrolled and payment cycles will begin from the start date.`,
    COMPLETED: `This closes all active draws and marks the fund as finished. Existing payment records are preserved.`,
    DRAFT: `All current enrollments will be cleared so you can freely edit the schedule. Re-activating will re-sync enrollments.`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 lg:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white w-full rounded-t-3xl sm:rounded-2xl sm:shadow-2xl sm:max-w-sm overflow-hidden max-h-[90vh] flex flex-col">

        {/* Drag pill — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 absolute top-0 left-0 right-0 z-10">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Hero banner */}
        <div
          className="flex flex-col items-center text-center"
          style={{ background: `linear-gradient(150deg, ${grad[0]} 0%, ${grad[1]} 100%)`, paddingTop: 40, paddingBottom: 32, gap: 12 }}
        >
          {/* Icon ring */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', boxShadow: '0 0 0 8px rgba(255,255,255,0.08)' }}
          >
            <Icon size={28} className="text-white" />
          </div>

          {/* Heading */}
          <div>
            <p className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'Merriweather, serif' }}>
              {label}
            </p>
          </div>

          {/* Status transition — plain text */}
          <div className="flex items-center justify-center gap-2.5 mt-1">
            <span className="text-sm font-medium text-white/60">{fromStatus}</span>
            <ArrowRight size={14} className="text-white/40 flex-shrink-0" />
            <span className="text-sm font-bold text-white">{toStatus}</span>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0" style={{ paddingLeft: 28, paddingRight: 28, paddingTop: 24, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Chit identity */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Chit Fund</p>
            <p className="text-base font-semibold text-gray-900 mt-0.5 truncate">{chit.name}</p>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-500 leading-relaxed">{descriptions[toStatus]}</p>

          {/* Unallocated slots warning */}
          {hasWarning && (
            <div className="flex items-start bg-amber-50 border border-amber-200 rounded-xl" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, gap: 10 }}>
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                <span className="font-semibold">{unallocatedCount} slot{unallocatedCount > 1 ? 's' : ''}</span> still unallocated — those months will have no winner.
              </p>
            </div>
          )}

          {/* Start date field */}
          {needsStartDate && (
            <FormField label="Actual Start Date" required>
              <DateInput
                value={pendingStartDate || chit.startDate || ''}
                onChange={(e) => setPendingStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1.5">
                {chit.startDate
                  ? `Anticipated: ${new Date(chit.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}. Change if the actual start differs.`
                  : 'Schedule months will count from this date.'}
              </p>
            </FormField>
          )}
        </div>

        {/* Actions — full-width equal buttons */}
        <div className="flex" style={{ paddingLeft: 28, paddingRight: 28, paddingBottom: 28, paddingTop: 4, gap: 12 }}>
          <Button variant="muted" onClick={onClose} disabled={loading} size="md" className="flex-1">
            Cancel
          </Button>
          <Button
            variant={buttonVariant}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
            size="md"
            className="flex-1"
          >
            {label}
          </Button>
        </div>

      </div>
    </div>
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
              memberId: r.orgHeld ? null : (r.memberId || null),
              orgHeld: r.orgHeld ?? false,
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
  });
  const unallocatedCount = reservations.filter((r) => r.status === 'UNALLOCATED').length;

  const isDestructiveStatus = (s) => s === 'CANCELLED';

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
                      isDestructiveStatus(s) ? 'text-red-600' : s === 'ACTIVE' || s === 'COMPLETED' ? 'text-green-700' : s === 'DRAFT' ? 'text-amber-700' : 'text-gray-700'
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
            title="Cancel Chit Fund"
            description={`This will permanently cancel "${chit.name}". This action cannot be undone.`}
            confirmWord="CANCEL"
            actionLabel="Cancel Chit"
            loading={statusMutation.isPending}
            onConfirm={() => statusMutation.mutate({ status: pendingStatus, startDate: pendingStartDate })}
            onClose={() => setPendingStatus(null)}
          />
        ) : (
          <StatusChangeDialog
            chit={chit}
            fromStatus={status}
            toStatus={pendingStatus}
            pendingStartDate={pendingStartDate}
            setPendingStartDate={setPendingStartDate}
            unallocatedCount={unallocatedCount}
            loading={statusMutation.isPending}
            onConfirm={() => statusMutation.mutate({ status: pendingStatus, startDate: pendingStartDate })}
            onClose={() => { setPendingStatus(null); setPendingStartDate(''); }}
          />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = rawTab ? rawTab.charAt(0).toUpperCase() + rawTab.slice(1) : 'Overview';
  const setActiveTab = (tab) => { const p = new URLSearchParams(searchParams); p.set('tab', tab); setSearchParams(p, { replace: true }); };

  const qc = useQueryClient();
  const toast = useToastContext();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');

  const { data: chit, isLoading } = useQuery({
    queryKey: ['chit', id],
    queryFn: () => getChit(id),
  });

  const renameMutation = useMutation({
    mutationFn: () => updateChitName({ id, name: nameInput.trim(), description: descInput.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chit', id] });
      setEditingName(false);
      toast.success('Chit name updated');
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to update name'),
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
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') renameMutation.mutate(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-2xl font-bold w-full border-b-2 border-[#1E3A5F] bg-transparent outline-none pb-0.5"
                style={{ color: '#1E3A5F', fontFamily: 'Inter, system-ui, sans-serif' }}
                placeholder="Chit name…"
              />
              <input
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }}
                className="text-sm w-full border-b border-gray-300 bg-transparent outline-none pb-0.5 text-gray-500"
                placeholder="Description (optional)…"
              />
              <div className="flex gap-2 pt-1">
                <Button type="button" size="sm" loading={renameMutation.isPending}
                  disabled={!nameInput.trim()}
                  onClick={() => renameMutation.mutate()}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#1E3A5F', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {chit.name}
                </h2>
                {chit.status !== 'DELETED' && (
                  <button
                    type="button"
                    onClick={() => { setNameInput(chit.name); setDescInput(chit.description ?? ''); setEditingName(true); }}
                    className="text-gray-400 hover:text-[#1E3A5F] transition-colors"
                    title="Edit chit name"
                  >
                    <Settings size={15} />
                  </button>
                )}
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
          )}
        </div>
        <HeaderActions chitId={id} chit={chit} />
      </div>

      {/* Stat mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Chit Value',  chit.chitValue ? `₹${Number(chit.chitValue).toLocaleString()}` : '—'],
          ['Installment', installment ? `₹${Number(installment).toLocaleString()}` : '—'],
          ['Duration',    `${chit.durationMonths ?? chit.totalMembers ?? '—'} months`],
        ].map(([label, val]) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{val}</p>
          </div>
        ))}
        {/* Members / Spots — separate card so we can show org-held sub-line */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400">Members / Spots</p>
          <p className="text-base font-bold text-gray-900 mt-0.5">
            {chit.enrolledCount ?? '?'} / {chit.totalMembers}
          </p>
          {(chit.orgHeldSpotsCount ?? 0) > 0 && (
            <p className="text-xs text-[#1E3A5F] mt-0.5 flex items-center gap-1">
              <Building2 size={10} /> {chit.orgHeldSpotsCount} org-held
            </p>
          )}
        </div>
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
