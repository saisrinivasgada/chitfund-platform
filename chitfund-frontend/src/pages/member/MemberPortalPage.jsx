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
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import {
  BookOpen, AlertTriangle, Trophy, CreditCard, CheckCircle, Pencil,
  Banknote, Clock, UserCheck, ExternalLink,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryChip({ label, value, highlight, icon: Icon }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${highlight ? 'bg-red-50 border-red-100' : 'bg-white border-gray-200'}`}>
      {Icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: highlight ? '#FEE2E2' : '#EFF3F8' }}>
          <Icon size={16} className={highlight ? 'text-red-600' : 'text-[#1E3A5F]'} />
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-base font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  );
}

const STATUS_COLOR = {
  SETTLED: 'text-green-700 bg-green-50',
  PARTIALLY_PAID: 'text-amber-700 bg-amber-50',
  OUTSTANDING: 'text-red-700 bg-red-50',
  WAIVED: 'text-gray-400 bg-gray-50',
};

// ─── Per-chit payment accordion ───────────────────────────────────────────────

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

  // Count settled vs total
  const settledCount = history.filter((r) => r.status === 'SETTLED' || r.status === 'WAIVED').length;
  const totalCount = history.length;
  const overdueCount = history.filter((r) => r.overdue).length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}>
            <BookOpen size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{chit.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant={statusBadge(chit.status)}>{chit.status}</Badge>
              <span className="text-xs text-gray-400">₹{Number(chit.monthlyContribution ?? 0).toLocaleString('en-IN')}/mo</span>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                  <AlertTriangle size={10} /> {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 ml-2">
          {outstanding > 0 ? (
            <span className="text-sm font-semibold text-red-600">₹{outstanding.toLocaleString('en-IN')} owed</span>
          ) : (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <CheckCircle size={13} /> Clear
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/chits/${chit.id}`, { state: { tab: 'draws' } }); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EFF3F8] transition-colors cursor-pointer flex-shrink-0"
            title="View chit details"
          >
            <ExternalLink size={14} />
          </button>
          <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50/40">
          {open && totalCount > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              {settledCount} of {totalCount} months settled
            </p>
          )}
          {isLoading ? (
            <div className="py-6 flex justify-center"><PageSpinner /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payment records yet for this chit.</p>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      r.overdue ? 'bg-red-50 border-red-100' :
                      r.status === 'SETTLED' ? 'bg-green-50/60 border-green-100' :
                      'bg-white border-gray-100'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: r.status === 'SETTLED' ? '#16A34A' : r.overdue ? '#DC2626' : '#1E3A5F' }}>
                      {r.monthNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">Month {r.monthNumber}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] ?? 'text-gray-500 bg-gray-50'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                        {r.overdue && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle size={10} /> Overdue
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{
                          width: `${pct}%`,
                          backgroundColor: pct === 100 ? '#16A34A' : r.overdue ? '#DC2626' : '#1E3A5F',
                        }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">₹{Number(r.amountPaid).toLocaleString('en-IN')}</p>
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
  PENDING:   'bg-amber-100 text-amber-700',
  DISBURSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function MyPayoutsSection({ memberId, chits }) {
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['memberPortalPayouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const chitNameById = Object.fromEntries(chits.map((c) => [c.id, c.name]));

  if (isLoading) return <PageSpinner />;
  if (payouts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-[#D4A017]" />
        <h3 className="font-semibold text-gray-900">Won Draws & Payouts</h3>
      </div>
      <div className="space-y-2">
        {payouts.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: '#D4A017' }}>
              C{p.monthNumber}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">
                  {chitNameById[p.chitId] ?? 'Chit'} — Draw {p.monthNumber}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYOUT_STYLE[p.status] ?? ''}`}>
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Won ₹{Number(p.winningAmount ?? 0).toLocaleString('en-IN')}
                {p.netPayoutAmount && ` · Net ₹${Number(p.netPayoutAmount).toLocaleString('en-IN')}`}
                {p.disbursedAt && ` · Paid ${new Date(p.disbursedAt).toLocaleDateString('en-IN')}`}
              </p>
            </div>
          </div>
        ))}
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
            Your cash pickup request has been sent. An admin will assign a worker
            to collect from you soon.
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
          Request a worker to visit you and collect your payment. The admin will
          assign someone and notify you.
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

// ─── My active cash requests section ─────────────────────────────────────────

const REQUEST_STATUS_STYLE = {
  PENDING:   { label: 'Pending',   className: 'bg-amber-100 text-amber-700' },
  ASSIGNED:  { label: 'Assigned',  className: 'bg-blue-100 text-blue-700' },
  COLLECTED: { label: 'Collected', className: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' },
};

function MyCashRequestsSection() {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['myCashRequests'],
    queryFn: getMyCashRequests,
    staleTime: 30_000,
  });

  const active = requests.filter((r) => r.status === 'PENDING' || r.status === 'ASSIGNED');
  if (isLoading || active.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-amber-600" />
        <h3 className="font-semibold text-gray-900">Active Cash Pickup Requests</h3>
      </div>
      <div className="space-y-2">
        {active.map((r) => {
          const s = REQUEST_STATUS_STYLE[r.status] ?? REQUEST_STATUS_STYLE.PENDING;
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-3">
                {r.status === 'ASSIGNED' ? (
                  <UserCheck size={16} className="text-blue-600 flex-shrink-0" />
                ) : (
                  <Clock size={16} className="text-amber-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    ₹{Number(r.requestedAmount).toLocaleString('en-IN')}
                  </p>
                  {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>
                  {s.label}
                </span>
                {r.status === 'ASSIGNED' && (
                  <p className="text-xs text-gray-400 mt-1">Worker on the way</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared content (used by both member self-view and admin proxy view) ─────

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
      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryChip label="Total Outstanding" value={outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'} highlight={outstanding > 0} icon={CreditCard} />
        <SummaryChip label="Active Chits" value={activeChits.length} icon={BookOpen} />
        <SummaryChip label="Completed Chits" value={completedChits.length} icon={CheckCircle} />
        <SummaryChip label="Total Enrolled" value={chits.length} icon={BookOpen} />
      </div>

      {/* Active chits */}
      {!chitsLoading && activeChits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Active Chits</h3>
          <div className="space-y-3">
            {activeChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </div>
      )}

      {/* Other chits */}
      {!chitsLoading && otherChits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Chits</h3>
          <div className="space-y-3">
            {otherChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </div>
      )}

      {/* Completed chits */}
      {!chitsLoading && completedChits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Completed Chits</h3>
          <div className="space-y-3">
            {completedChits.map((c) => (
              <ChitAccordion key={c.id} memberId={memberId} chit={c} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!chitsLoading && chits.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Not enrolled in any chit fund yet.</p>
          <p className="text-sm text-gray-400 mt-1">The admin will add them to a chit fund soon.</p>
        </div>
      )}

      {/* Won payouts */}
      {!chitsLoading && <MyPayoutsSection memberId={memberId} chits={chits} />}
    </div>
  );
}

// ─── Main page (member's own view) ───────────────────────────────────────────

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

  const activeChitsForRequest = myChits.filter((c) => c.status === 'ACTIVE');

  if (memberLoading) return <PageSpinner />;

  if (!member) {
    return (
      <div className="text-center py-24">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <BookOpen size={24} className="text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">No member profile linked to your account.</p>
        <p className="text-sm text-gray-400 mt-1">Contact your chit fund admin to link your account.</p>
      </div>
    );
  }

  const initials = (member.fullName ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h2
                className="text-2xl font-bold truncate"
                style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
              >
                {member.fullName}
              </h2>
              {userAccount?.username && (
                <p className="text-sm text-gray-400">@{userAccount.username}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-400">ID: {member.id}</span>
                {member.phone && <span className="text-xs text-gray-400">· {member.phone}</span>}
                {member.email && <span className="text-xs text-gray-400">· {member.email}</span>}
              </div>
              {member.referredByName && (
                <p className="text-xs text-gray-400 mt-1">
                  Referred by <span className="font-medium text-gray-600">{member.referredByName}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCashRequest(true)}
            >
              <Banknote size={14} className="mr-1.5" />
              Pay Cash
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowEditProfile(true)}>
              <Pencil size={14} /> Edit
            </Button>
          </div>
        </div>
      </div>

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

      <MyCashRequestsSection />

      <ProfileChangeHistory key={historyVersion} userId={userAccount?.id} />

      <MemberPortalContent memberId={member.id} />
    </div>
  );
}
