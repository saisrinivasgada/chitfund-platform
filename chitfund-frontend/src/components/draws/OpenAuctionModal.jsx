import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormField, { Input } from '../ui/FormField';
import {
  openAuction, getEnrollments, getMembers, getReservations,
  createMemberLogin, linkMemberUser, checkUsernameAvailability,
} from '../../services/api';
import { useToastContext } from '../layout/AppLayout';
import { AlertTriangle, CheckCircle, UserPlus, Gavel } from 'lucide-react';

function toUsername(fullName = '') {
  return fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '').slice(0, 20) || 'member';
}

// Per-member inline account creator used in the pre-check list
function MemberAccountRow({ member, onCreated }) {
  const toast    = useToastContext();
  const qc       = useQueryClient();
  const [username, setUsername]   = useState(() => toUsername(member.fullName));
  const [avail,    setAvail]      = useState(null);
  const [loading,  setLoading]    = useState(false);
  const [done,     setDone]       = useState(false);
  const debounce = useRef(null);

  function onUsernameChange(val) {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9._]/g, '');
    setUsername(cleaned);
    setAvail(null);
    clearTimeout(debounce.current);
    if (!cleaned || cleaned.length < 3) return;
    setAvail('checking');
    debounce.current = setTimeout(async () => {
      try {
        const d = await checkUsernameAvailability(cleaned);
        setAvail(d.available ? 'ok' : 'taken');
      } catch { setAvail(null); }
    }, 400);
  }

  async function create() {
    if (avail !== 'ok') return;
    setLoading(true);
    try {
      const loginData = await createMemberLogin({ username, email: member.email ?? undefined });
      await linkMemberUser({ memberId: member.id, userId: loginData.userId });
      qc.invalidateQueries({ queryKey: ['members'] });
      setDone(true);
      onCreated(member.id, { username, tempPassword: loginData.tempPassword });
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${done ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          {done
            ? <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
            : <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />}
          <p className="text-sm font-semibold text-gray-900">{member.fullName}</p>
          <span className="text-xs text-gray-400">{member.phone}</span>
        </div>
        {done && <span className="text-xs font-medium text-green-700">Account created</span>}
      </div>
      {!done && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="username"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 font-mono bg-white outline-none focus:border-[#1E3A5F]"
          />
          {avail === 'checking' && <span className="text-xs text-gray-400 whitespace-nowrap">Checking…</span>}
          {avail === 'ok'       && <span className="text-xs text-green-600 font-semibold whitespace-nowrap">✓ OK</span>}
          {avail === 'taken'    && <span className="text-xs text-red-500 font-semibold whitespace-nowrap">Taken</span>}
          <button
            type="button"
            onClick={create}
            disabled={avail !== 'ok' || loading}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1E3A5F] text-white cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            <UserPlus size={11} />
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}
    </div>
  );
}

const DURATION_OPTIONS = [
  { label: 'No timer (manual close)', value: '' },
  { label: '30 minutes', value: '30' },
  { label: '1 hour', value: '60' },
  { label: '2 hours', value: '120' },
  { label: 'Custom…', value: 'custom' },
];

// Returns local ISO string in "YYYY-MM-DDTHH:mm" format for datetime-local min attribute
function localISOString(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function OpenAuctionModal({ chitId, chit, draw, onClose }) {
  const toast    = useToastContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState({});  // memberId → { username, tempPassword }
  const [durationMode, setDurationMode] = useState('60');       // '', '30', '60', '120', 'custom'
  const [customClosesAt, setCustomClosesAt] = useState('');
  const [minBidStep, setMinBidStep] = useState('');
  const [commissionType, setCommissionType] = useState('FIXED');   // 'FIXED' | 'PERCENTAGE'
  const [commissionValue, setCommissionValue] = useState('');
  const [showCommissionToMembers, setShowCommissionToMembers] = useState(false);

  const fallbackPayout = chit?.installmentAmount && chit?.totalMembers
    ? (Number(chit.installmentAmount) * Number(chit.totalMembers)).toString()
    : '';

  const [form, setForm] = useState({ scheduledPayoutAmount: fallbackPayout });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    staleTime: 30_000,
  });
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', chitId],
    queryFn: () => getReservations(chitId),
  });

  // Pre-fill payout from the schedule slot for this draw's month number
  useEffect(() => {
    if (!draw?.monthNumber) return;
    const slot = reservations.find(
      (r) => r.monthNumber === draw.monthNumber && r.status !== 'VOIDED'
    );
    if (slot?.payoutAmount) {
      setForm((f) => ({ ...f, scheduledPayoutAmount: String(slot.payoutAmount) }));
    }
  }, [reservations, draw?.monthNumber]);

  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m]));
  const enrolledIds = [...new Set(enrollments.map((e) => String(e.memberId ?? e.id)))];
  const membersWithoutAccess = enrolledIds
    .map((id) => memberMap[id])
    .filter((m) => m && !m.hasAppAccess && !createdAccounts[String(m.id)]);
  const allAccountsReady = membersWithoutAccess.length === 0;

  function handleCreated(memberId, creds) {
    setCreatedAccounts((prev) => ({ ...prev, [String(memberId)]: creds }));
  }

  function computeClosesAt() {
    if (!durationMode) return null;
    if (durationMode === 'custom') {
      if (!customClosesAt) return null;
      // datetime-local gives local time; convert to UTC naive string for backend
      return new Date(customClosesAt).toISOString().replace('Z', '');
    }
    return new Date(Date.now() + Number(durationMode) * 60_000).toISOString().replace('Z', '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.scheduledPayoutAmount) return;
    if (durationMode === 'custom' && !customClosesAt) return;
    setLoading(true);
    try {
      const session = await openAuction({
        chitId,
        monthNumber: draw.monthNumber,
        scheduledPayoutAmount: Number(form.scheduledPayoutAmount),
        closesAt: computeClosesAt(),
        minBidStep: minBidStep ? Number(minBidStep) : undefined,
        commissionType: commissionValue ? commissionType : undefined,
        commissionValue: commissionValue ? commissionValue : undefined,
        showCommissionToMembers,
      });
      onClose();
      navigate(`/chits/${chitId}/auction/${session.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to open auction');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Open Auction — Draw ${draw.monthNumber}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Gross Monthly Pot (₹)" required
          hint="Maximum prize — members bid below this amount">
          <Input
            type="number"
            min="1"
            value={form.scheduledPayoutAmount}
            onChange={(e) => setForm((f) => ({ ...f, scheduledPayoutAmount: e.target.value }))}
            required
          />
        </FormField>

        {/* Auction timer */}
        <FormField label="Auction Duration" hint="Auto-closes when timer expires (ONLINE auctions only)">
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={durationMode}
            onChange={(e) => setDurationMode(e.target.value)}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        {durationMode === 'custom' && (
          <FormField label="Close At" required>
            <Input
              type="datetime-local"
              value={customClosesAt}
              onChange={(e) => setCustomClosesAt(e.target.value)}
              min={localISOString(new Date(Date.now() + 60_000))}
              required
            />
          </FormField>
        )}

        {/* Minimum bid step — ONLINE auctions only */}
        {chit?.auctionMode === 'ONLINE' && (
          <FormField label="Minimum Bid Step (₹)"
            hint="Each bid must be at least this much lower than the current best. Leave blank for any lower bid.">
            <Input
              type="number"
              min="1"
              placeholder="e.g. 500"
              value={minBidStep}
              onChange={(e) => setMinBidStep(e.target.value)}
            />
          </FormField>
        )}

        {/* Admin commission */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Admin Commission on Discount</p>
          <p className="text-xs text-gray-500">
            Amount you keep from the discount before distributing dividend to members. Leave blank for no commission.
          </p>
          <div className="flex gap-2">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value)}
            >
              <option value="FIXED">₹ Fixed amount</option>
              <option value="PERCENTAGE">% of discount</option>
            </select>
            <Input
              type="number"
              min="0"
              placeholder={commissionType === 'PERCENTAGE' ? 'e.g. 10 (= 10%)' : 'e.g. 5000'}
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              className="flex-1"
            />
          </div>
          {commissionValue && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCommissionToMembers}
                onChange={(e) => setShowCommissionToMembers(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show commission to members in the auction room
            </label>
          )}
        </div>

        {/* Member account check */}
        {membersWithoutAccess.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {membersWithoutAccess.length} member{membersWithoutAccess.length > 1 ? 's' : ''} without app account
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Create their accounts now so they can place bids. You can also proceed and create later.
                </p>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {membersWithoutAccess.map((m) => (
                <MemberAccountRow
                  key={m.id}
                  member={m}
                  onCreated={handleCreated}
                />
              ))}
            </div>
          </div>
        )}

        {/* Credentials summary for newly created accounts */}
        {Object.keys(createdAccounts).length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Accounts Created — Share Credentials</p>
            {Object.entries(createdAccounts).map(([mId, creds]) => {
              const m = memberMap[mId];
              return (
                <div key={mId} className="text-xs text-green-800 font-mono bg-white/70 rounded-lg px-3 py-1.5">
                  <span className="font-semibold text-gray-700">{m?.fullName}: </span>
                  {creds.username} / {creds.tempPassword}
                </div>
              );
            })}
          </div>
        )}

        {allAccountsReady && membersWithoutAccess.length === 0 && enrolledIds.length > 0 && Object.keys(createdAccounts).length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">All {enrolledIds.length} enrolled members have app accounts.</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={!form.scheduledPayoutAmount} className="flex-1">
            <Gavel size={14} /> Open Auction
          </Button>
        </div>
      </form>
    </Modal>
  );
}
