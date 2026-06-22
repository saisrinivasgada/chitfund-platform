import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getMyMemberProfile,
  getChitsForMember,
  getMemberTotalBalance,
  getMemberBalance,
  getPaymentHistory,
  getPayoutsForMember,
  getMe,
  createCashRequest,
  getMyCashRequests,
} from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField, { Input, Select } from '../../components/ui/FormField';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import {
  BookOpen, AlertTriangle, Trophy, CreditCard, CheckCircle, Pencil,
  Banknote, Clock, UserCheck, ExternalLink, ChevronDown, ChevronUp,
  TrendingUp, IndianRupee, Phone,
} from 'lucide-react';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent, sub }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ backgroundColor: accent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          <Icon size={13} className="text-white" />
        </div>
      </div>
      <p className={`text-xl font-bold text-white leading-tight ${accent ? 'text-red-200' : ''}`}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{sub}</p>}
    </div>
  );
}

// ─── Per-chit payment accordion ───────────────────────────────────────────────

const MONTH_STATUS = {
  SETTLED:        { bg: '#16A34A', ring: 'bg-green-50 border-green-100', text: 'text-green-700 bg-green-100' },
  PARTIALLY_PAID: { bg: '#D97706', ring: 'bg-amber-50 border-amber-100', text: 'text-amber-700 bg-amber-100' },
  OUTSTANDING:    { bg: '#DC2626', ring: 'bg-red-50 border-red-100',    text: 'text-red-700 bg-red-100' },
  WAIVED:         { bg: '#94A3B8', ring: 'bg-gray-50 border-gray-100',  text: 'text-gray-500 bg-gray-100' },
};

function ChitAccordion({ memberId, chit }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: balance = 0 } = useQuery({
    queryKey: ['memberPortalBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
    staleTime: 60_000,
  });

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['memberPortalHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: open,
  });

  const outstanding = Number(balance ?? 0);
  const settledCount = history.filter((r) => r.status === 'SETTLED' || r.status === 'WAIVED').length;
  const totalCount = history.length;
  const overdueCount = history.filter((r) => r.overdue).length;

  return (
    <div
      className="rounded-2xl overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ border: outstanding > 0 ? '1px solid #FECACA' : '1px solid #E5E7EB' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ backgroundColor: outstanding > 0 ? '#DC2626' : '#1E3A5F' }}
          >
            <BookOpen size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{chit.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">
                ₹{Number(chit.monthlyContribution ?? 0).toLocaleString('en-IN')}/mo
              </span>
              <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                  <AlertTriangle size={10} /> {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {totalCount > 0 && (
            <div className="hidden sm:block text-right">
              <p className="text-xs text-gray-400">{settledCount}/{totalCount} paid</p>
              <div className="w-20 bg-gray-100 rounded-full h-1.5 mt-1">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${totalCount > 0 ? (settledCount / totalCount) * 100 : 0}%`,
                    backgroundColor: outstanding > 0 ? '#DC2626' : '#16A34A',
                  }}
                />
              </div>
            </div>
          )}
          {outstanding > 0 ? (
            <span className="text-sm font-bold text-red-600">₹{outstanding.toLocaleString('en-IN')}</span>
          ) : (
            <span className="text-sm text-green-600 font-semibold flex items-center gap-1">
              <CheckCircle size={13} /> Clear
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/chits/${chit.id}`, { state: { tab: 'draws' } }); }}
            className="p-1.5 rounded-lg text-gray-300 hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer"
            title="View chit"
          >
            <ExternalLink size={14} />
          </button>
          <div className="text-gray-300">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 bg-gray-50/50">
          {totalCount > 0 && (
            <p className="text-xs text-gray-400 mb-3 font-medium">
              {settledCount} of {totalCount} months settled
            </p>
          )}
          {isLoading ? (
            <div className="py-6 flex justify-center"><PageSpinner /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payment records yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const s = MONTH_STATUS[r.status] ?? MONTH_STATUS.OUTSTANDING;
                const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.ring}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: s.bg }}
                    >
                      {r.monthNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-800">Month {r.monthNumber}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.text}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                        {r.overdue && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle size={9} /> Overdue
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: s.bg }}
                        />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">₹{Number(r.amountPaid).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-400">of ₹{Number(r.amountDue).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payouts section ─────────────────────────────────────────────────────────

const PAYOUT_STYLE = {
  PENDING:             { label: 'Pending',    cls: 'bg-amber-100 text-amber-700' },
  PARTIALLY_DISBURSED: { label: 'Partial',    cls: 'bg-blue-100 text-blue-700' },
  DISBURSED:           { label: 'Disbursed',  cls: 'bg-green-100 text-green-700' },
  CANCELLED:           { label: 'Cancelled',  cls: 'bg-gray-100 text-gray-500' },
};

function MyPayoutsSection({ memberId, chits }) {
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['memberPortalPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const chitNameById = Object.fromEntries(chits.map((c) => [c.id, c.name]));

  if (isLoading || payouts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
          <Trophy size={16} style={{ color: '#D4A017' }} />
        </div>
        <h3 className="font-semibold text-gray-900">Won Draws & Payouts</h3>
        <span className="ml-auto text-xs text-gray-400">{payouts.length} total</span>
      </div>
      <div className="space-y-2">
        {payouts.map((p) => {
          const s = PAYOUT_STYLE[p.status] ?? PAYOUT_STYLE.PENDING;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: '#D4A017' }}
              >
                D{p.monthNumber}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">
                    {chitNameById[p.chitId] ?? 'Chit'} — Draw {p.monthNumber}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">
                    Won ₹{Number(p.winningAmount ?? 0).toLocaleString('en-IN')}
                  </span>
                  {p.netPayoutAmount && (
                    <span className="text-xs font-semibold text-green-700">
                      Net ₹{Number(p.netPayoutAmount).toLocaleString('en-IN')}
                    </span>
                  )}
                  {p.disbursedAt && (
                    <span className="text-xs text-gray-400">
                      Paid {new Date(p.disbursedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Cash pickup request modal ────────────────────────────────────────────────

function CashPickupModal({ memberId, chits, onClose }) {
  const qc = useQueryClient();
  const [chitId, setChitId] = useState(chits[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: createCashRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myCashRequests'] });
      setSubmitted(true);
    },
  });

  if (submitted) {
    return (
      <Modal title="Request Submitted" onClose={onClose} size="sm">
        <div className="space-y-4 text-center py-2">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your cash pickup request has been sent. An admin will assign a worker to collect from you soon.
          </p>
          <Button variant="primary" size="md" className="w-full" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  return (
    <Modal title="Request Cash Pickup" onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            chitId,
            requestedAmount: amount ? parseFloat(amount) : undefined,
            notes: notes || undefined,
          });
        }}
        className="space-y-5"
      >
        <p className="text-sm text-gray-500 leading-relaxed">
          Request a worker to visit you and collect your payment. The admin will assign someone and notify you.
        </p>

        <FormField label="Chit Fund" required>
          <Select value={chitId} onChange={(e) => setChitId(e.target.value)} required>
            {activeChits.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Amount to Pay (₹)" required>
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Note for Worker (optional)">
          <Input
            placeholder="e.g. Available after 6 PM"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        {mutation.isError && (
          <p className="text-sm text-red-600">{mutation.error?.response?.data?.message ?? 'Submission failed'}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="md" loading={mutation.isPending}>
            Submit Request
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Active cash requests ──────────────────────────────────────────────────────

function MyCashRequestsSection() {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
    staleTime: 30_000,
  });

  const active = requests.filter((r) => r.status === 'PENDING' || r.status === 'ASSIGNED');
  if (isLoading || active.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100">
          <Clock size={16} className="text-amber-600" />
        </div>
        <h3 className="font-semibold text-gray-900">Active Cash Pickup Requests</h3>
      </div>
      <div className="space-y-2">
        {active.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50/60 border border-amber-100">
            <div className="flex items-center gap-3">
              {r.status === 'ASSIGNED'
                ? <UserCheck size={16} className="text-blue-600 flex-shrink-0" />
                : <Clock size={16} className="text-amber-500 flex-shrink-0" />}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  ₹{Number(r.requestedAmount).toLocaleString('en-IN')}
                </p>
                {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                r.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {r.status === 'ASSIGNED' ? 'Assigned' : 'Pending'}
              </span>
              {r.status === 'ASSIGNED' && (
                <p className="text-xs text-gray-400 mt-1">Worker on the way</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared content ──────────────────────────────────────────────────────────

export function MemberPortalContent({ memberId }) {
  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['portalChits', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['portalTotalBalance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    enabled: !!memberId,
    staleTime: 60_000,
  });

  const outstanding = Number(totalOutstanding);
  const activeChits = chits.filter((c) => c.status === 'ACTIVE');
  const completedChits = chits.filter((c) => c.status === 'COMPLETED');
  const otherChits = chits.filter((c) => c.status !== 'ACTIVE' && c.status !== 'COMPLETED');

  return (
    <div className="space-y-6">
      {/* Active chits */}
      {!chitsLoading && activeChits.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            Active Chits
          </h3>
          <div className="space-y-3">
            {activeChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </section>
      )}

      {/* Other chits */}
      {!chitsLoading && otherChits.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            Other Chits
          </h3>
          <div className="space-y-3">
            {otherChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </section>
      )}

      {/* Completed chits */}
      {!chitsLoading && completedChits.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            Completed Chits
          </h3>
          <div className="space-y-3">
            {completedChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!chitsLoading && chits.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen size={24} className="text-gray-400" />
          </div>
          <p className="text-gray-600 font-semibold">Not enrolled in any chit fund yet.</p>
          <p className="text-sm text-gray-400 mt-1.5">The admin will add you to a chit fund soon.</p>
        </div>
      )}

      {/* Won payouts */}
      {!chitsLoading && <MyPayoutsSection memberId={memberId} chits={chits} />}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MemberPortalPage() {
  const { user: authUser } = useAuth();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCashRequest, setShowCashRequest] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
    retry: false,
  });

  const { data: userAccount } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
  });

  const { data: myChits = [] } = useQuery({
    queryKey: ['portalChits', member?.id],
    queryFn: () => getChitsForMember(member.id),
    enabled: !!member?.id,
    staleTime: 60_000,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['portalTotalBalance', member?.id],
    queryFn: () => getMemberTotalBalance(member.id),
    enabled: !!member?.id,
    staleTime: 60_000,
  });

  const activeChitsForRequest = myChits.filter((c) => c.status === 'ACTIVE');
  const outstanding = Number(totalOutstanding);

  if (memberLoading) return <PageSpinner />;

  if (!member) {
    return (
      <div className="text-center py-24">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <BookOpen size={24} className="text-gray-400" />
        </div>
        <p className="text-gray-600 font-semibold">No member profile linked to your account.</p>
        <p className="text-sm text-gray-400 mt-1.5">Contact your chit fund admin to link your account.</p>
      </div>
    );
  }

  const initials = (member.fullName ?? 'M').slice(0, 2).toUpperCase();
  const activeCount = myChits.filter((c) => c.status === 'ACTIVE').length;
  const completedCount = myChits.filter((c) => c.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* ── Hero profile card ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden shadow-lg"
        style={{ backgroundColor: '#1E3A5F' }}
      >
        {/* Decorative gradient blob */}
        <div
          className="absolute pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 90% 10%, rgba(212,160,23,0.18) 0%, transparent 60%)',
            inset: 0,
          }}
        />

        <div className="relative p-6 pb-0">
          {/* Top row: avatar + actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md flex-shrink-0"
                style={{ backgroundColor: '#D4A017' }}
              >
                {initials}
              </div>
              <div>
                <h2
                  className="text-xl font-bold text-white leading-tight"
                  style={{ fontFamily: 'Merriweather, serif' }}
                >
                  {member.fullName}
                </h2>
                {userAccount?.username && (
                  <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    @{userAccount.username}
                  </p>
                )}
                {member.phone && (
                  <p className="flex items-center gap-1.5 text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <Phone size={11} />
                    {member.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowCashRequest(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer"
                style={{ backgroundColor: '#D4A017' }}
                title="Request cash pickup"
              >
                <Banknote size={14} />
                <span className="hidden sm:inline">Pay Cash</span>
              </button>
              <button
                onClick={() => setShowEditProfile(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
              >
                <Pencil size={13} />
                <span className="hidden sm:inline">Edit</span>
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-6 pb-6">
            <StatCard
              label="Outstanding"
              value={outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'}
              icon={outstanding > 0 ? AlertTriangle : CheckCircle}
              sub={outstanding > 0 ? 'Due now' : 'All clear'}
            />
            <StatCard
              label="Active Chits"
              value={activeCount}
              icon={TrendingUp}
              sub={activeCount === 1 ? '1 running' : `${activeCount} running`}
            />
            <StatCard
              label="Completed"
              value={completedCount}
              icon={CheckCircle}
              sub={completedCount === 0 ? 'None yet' : 'Finished'}
            />
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showEditProfile && (
        <EditProfileModal
          onClose={() => { setShowEditProfile(false); setHistoryVersion((v) => v + 1); }}
          role="MEMBER"
          currentUser={{ username: userAccount?.username, email: userAccount?.email }}
          currentMember={{ fullName: member.fullName, phone: member.phone, email: member.email, address: member.address, city: member.city }}
          userId={userAccount?.id}
        />
      )}

      {showCashRequest && activeChitsForRequest.length > 0 && (
        <CashPickupModal
          memberId={member.id}
          chits={activeChitsForRequest}
          onClose={() => setShowCashRequest(false)}
        />
      )}

      {showCashRequest && activeChitsForRequest.length === 0 && (
        <Modal title="No Active Chits" onClose={() => setShowCashRequest(false)} size="sm">
          <p className="text-sm text-gray-600">You don't have any active chit funds to make a cash payment for.</p>
          <div className="flex justify-end mt-4">
            <Button variant="muted" size="md" onClick={() => setShowCashRequest(false)}>Close</Button>
          </div>
        </Modal>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <MyCashRequestsSection />
      <ProfileChangeHistory key={historyVersion} userId={userAccount?.id} />
      <MemberPortalContent memberId={member.id} />
    </div>
  );
}
