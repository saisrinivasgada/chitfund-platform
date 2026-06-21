import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMember, getMembers, updateMember, patchMemberStatus, getChitsForMember,
  getPaymentHistory, getMemberTotalBalance, getMemberBalance, registerUser,
  linkMemberUser, resetMemberPassword, getUserById, sendPaymentReminder,
  softDeleteMember,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import PhoneInput, { formatPhone } from '../../components/ui/PhoneInput';
import {
  ArrowLeft, Edit2, User, Building2, FileText, History, AlertTriangle,
  UserPlus, ShieldCheck, KeyRound, Eye, Copy, Check, BellRing, Trash2,
  ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Wallet,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function NA({ className = '' }) {
  return <span className={`text-xs font-medium text-gray-300 italic ${className}`}>Unavailable</span>;
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-gray-50 last:border-0 gap-1">
      <span className="text-sm text-gray-500 sm:w-40 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 break-all">
        {children ?? (value != null && value !== '' ? value : <NA />)}
      </span>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',      label: 'Active',      color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'INACTIVE',    label: 'Inactive',    color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
  { value: 'BLACKLISTED', label: 'Blacklisted', color: '#DC2626', bg: '#FFF5F5', border: '#FECACA' },
];

// ─── Inline status switcher ───────────────────────────────────────────────────
function StatusSwitcher({ member, disabled }) {
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const ref = useRef(null);
  const qc = useQueryClient();
  const toast = useToastContext();

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mutation = useMutation({
    mutationFn: (data) => patchMemberStatus({ id: member.id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Status updated');
      setPendingStatus(null);
      setReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to update status'),
  });

  function handleSelect(s) {
    if (s.value === member.status) { setOpen(false); return; }
    setPendingStatus(s);
    setOpen(false);
    setReason('');
    setReasonError('');
  }

  function handleConfirm() {
    if (pendingStatus?.value === 'BLACKLISTED' && !reason.trim()) {
      setReasonError('A reason is required when blacklisting.');
      return;
    }
    mutation.mutate({ status: pendingStatus.value, reason: reason.trim() || undefined });
  }

  const current = STATUS_OPTIONS.find((s) => s.value === member.status) ?? STATUS_OPTIONS[0];

  return (
    <>
      <div className="relative inline-flex items-center gap-1" ref={ref}>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
          style={{ color: current.color, backgroundColor: current.bg, borderColor: current.border }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: current.color }} />
          {current.label}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
            title="Change status"
          >
            <ChevronDown size={13} className="text-gray-400" />
          </button>
        )}

        {open && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span style={{ color: s.value === member.status ? s.color : '#374151', fontWeight: s.value === member.status ? 600 : 400 }}>
                  {s.label}
                </span>
                {s.value === member.status && <Check size={12} className="ml-auto" style={{ color: s.color }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reason popup */}
      {pendingStatus && (
        <Modal title={`Change to ${pendingStatus.label}`} onClose={() => setPendingStatus(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Changing <strong>{member.fullName}</strong>'s status to{' '}
              <span className="font-semibold" style={{ color: pendingStatus.color }}>{pendingStatus.label}</span>.
              {pendingStatus.value === 'BLACKLISTED' && ' A reason is required.'}
            </p>
            <FormField label={`Reason ${pendingStatus.value === 'BLACKLISTED' ? '*' : '(optional)'}`}>
              <Textarea
                placeholder="Reason for status change…"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
                rows={3}
              />
              {reasonError && <p className="text-xs text-red-500 mt-1">{reasonError}</p>}
            </FormField>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingStatus(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleConfirm} loading={mutation.isPending} className="flex-1">Save</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── More actions dropdown ────────────────────────────────────────────────────
function MoreActionsMenu({ member, isAdmin, onCreateLogin, onResetPassword, onReminder, onDelete, reminderPending }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const { id } = useParams();

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <MoreHorizontal size={15} />
        More
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
          {member.hasAppAccess ? (
            <>
              <MenuButton
                icon={<Eye size={14} />}
                onClick={() => { navigate(`/admin/member-view/${id}`); setOpen(false); }}
              >
                View as Member
              </MenuButton>
              <MenuButton
                icon={<KeyRound size={14} />}
                onClick={() => { onResetPassword(); setOpen(false); }}
              >
                Reset Password
              </MenuButton>
              <MenuButton
                icon={<BellRing size={14} />}
                disabled={reminderPending}
                onClick={() => { onReminder(); setOpen(false); }}
              >
                {reminderPending ? 'Sending…' : 'Send Reminder'}
              </MenuButton>
            </>
          ) : (
            <MenuButton
              icon={<UserPlus size={14} />}
              onClick={() => { onCreateLogin(); setOpen(false); }}
            >
              Create Login
            </MenuButton>
          )}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <MenuButton
                icon={<Trash2 size={14} />}
                danger
                onClick={() => { onDelete(); setOpen(false); }}
              >
                Delete Member
              </MenuButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon, children, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors cursor-pointer disabled:opacity-50 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Edit member modal ────────────────────────────────────────────────────────
function EditMemberModal({ member, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [form, setForm] = useState({
    fullName: member.fullName ?? '',
    phone: member.phone ?? '',
    phoneCountryCode: member.phoneCountryCode ?? '+91',
    email: member.email ?? '',
    address: member.address ?? '',
    city: member.city ?? '',
    aadhaarLast4: member.aadhaarLast4 ?? '',
    panNumber: member.panNumber ?? '',
    bankName: member.bankName ?? '',
    bankAccountNumber: member.bankAccountNumber ?? '',
    bankIfsc: member.bankIfsc ?? '',
    notes: member.notes ?? '',
    referredById: member.referredById ?? '',
  });

  const { data: activeMembers = [] } = useQuery({
    queryKey: ['members', 'active-for-referral'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 500 }),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (data) => updateMember({ id: member.id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member updated successfully');
      onClose();
    },
    onError: (err) => {
      const fieldErrors = err.response?.data?.fieldErrors;
      if (fieldErrors) {
        toast.error(Object.values(fieldErrors)[0] ?? 'Validation failed');
      } else {
        toast.error(err.response?.data?.message ?? 'Failed to update member');
      }
    },
  });

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <Modal title="Edit Member" onClose={onClose} size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const payload = Object.fromEntries(
            Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
          );
          mutation.mutate(payload);
        }}
        className="space-y-4"
      >
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Personal Information</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" required className="col-span-2">
            <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
          </FormField>

          <div className="col-span-2">
            <PhoneInput
              label="Phone"
              countryCode={form.phoneCountryCode}
              phone={form.phone}
              onCountryChange={(code) => set('phoneCountryCode', code)}
              onPhoneChange={(v) => set('phone', v)}
            />
          </div>

          <FormField label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </FormField>
          <FormField label="City">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </FormField>
          <FormField label="Address" className="col-span-2">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </FormField>
          <FormField label="Aadhaar Last 4">
            <Input maxLength={4} value={form.aadhaarLast4} onChange={(e) => set('aadhaarLast4', e.target.value)} />
          </FormField>
          <FormField label="PAN Number">
            <Input value={form.panNumber} onChange={(e) => set('panNumber', e.target.value.toUpperCase())} />
          </FormField>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Bank Details</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Bank Name">
            <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
          </FormField>
          <FormField label="Account Number">
            <Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
          </FormField>
          <FormField label="IFSC Code" className="col-span-2">
            <Input value={form.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase())} />
          </FormField>
        </div>

        <FormField label="Notes">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>

        <FormField label="Referred By">
          <Select value={form.referredById} onChange={(e) => set('referredById', e.target.value)}>
            <option value="">— No referral —</option>
            {[...activeMembers]
              .filter((m) => m.id !== member.id)
              .sort((a, b) => a.fullName.localeCompare(b.fullName))
              .map((m) => (
                <option key={m.id} value={m.id}>{m.fullName} · {formatPhone(m.phoneCountryCode ?? '+91', m.phone)}</option>
              ))}
          </Select>
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Temp password display ────────────────────────────────────────────────────
function TempPasswordDisplay({ tempPassword, label }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">{label ?? 'Temporary Password'}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-lg font-mono font-bold text-gray-900 tracking-widest select-all">{tempPassword}</code>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
        >
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <p className="text-xs text-amber-600 mt-2">Share this with the member. They must change it on first login.</p>
    </div>
  );
}

// ─── Create login modal ───────────────────────────────────────────────────────
function CreateLoginModal({ member, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const [form, setForm] = useState({ username: '', email: member.email ?? '' });
  const [step, setStep] = useState('form');
  const [tempPassword, setTempPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStep('loading');
    try {
      const authData = await registerUser({ username: form.username, email: form.email });
      const newUserId = authData?.user?.id;
      if (!newUserId) throw new Error('Registration did not return a user ID');
      await linkMemberUser({ memberId: member.id, userId: newUserId });
      qc.invalidateQueries({ queryKey: ['member', member.id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      setTempPassword(authData?.tempPassword ?? '');
      setStep('done');
    } catch (err) {
      toast.error(err.response?.data?.message ?? err.message ?? 'Failed to create login');
      setStep('form');
    }
  }

  if (step === 'done') {
    return (
      <Modal title="Login Created" onClose={onClose} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">App account created for <strong>{member.fullName}</strong>.</p>
          {tempPassword && <TempPasswordDisplay tempPassword={tempPassword} />}
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create Member Login" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Create an app account for <strong>{member.fullName}</strong>. A temporary password will be generated.
        </p>
        <FormField label="Username" required>
          <Input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="e.g. ravi_sharma"
            pattern="^[a-zA-Z0-9_]+$"
            required
          />
        </FormField>
        <FormField label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </FormField>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={step === 'loading'} className="flex-1">
            <UserPlus size={14} /> Create Login
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reset password modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ member, onClose }) {
  const toast = useToastContext();
  const [step, setStep] = useState('confirm');
  const [tempPassword, setTempPassword] = useState('');

  async function handleReset() {
    setStep('loading');
    try {
      const result = await resetMemberPassword(member.userId);
      setTempPassword(result?.tempPassword ?? '');
      setStep('done');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to reset password');
      setStep('confirm');
    }
  }

  if (step === 'done') {
    return (
      <Modal title="Password Reset" onClose={onClose} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Password reset for <strong>{member.fullName}</strong>.</p>
          {tempPassword && <TempPasswordDisplay tempPassword={tempPassword} label="New Temporary Password" />}
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Reset Member Password" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          This will generate a new temporary password for <strong>{member.fullName}</strong> and invalidate their current sessions.
        </p>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleReset} loading={step === 'loading'} className="flex-1 bg-amber-600 hover:bg-amber-700">
            <KeyRound size={14} /> Reset Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Balances section ─────────────────────────────────────────────────────────
const CHIT_STATUS_COLOR = {
  ACTIVE:    { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  COMPLETED: { text: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  PAUSED:    { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  PENDING:   { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

function BalancesSection({ memberId }) {
  const [expanded, setExpanded] = useState({});

  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chitsForMember', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  if (chitsLoading) return null;
  if (chits.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} className="text-[#1E3A5F]" />
        <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Balances
        </h3>
      </div>
      <div className="space-y-2">
        {chits.map((chit) => (
          <ChitBalanceRow
            key={chit.id}
            chit={chit}
            memberId={memberId}
            expanded={!!expanded[chit.id]}
            onToggle={() => setExpanded((prev) => ({ ...prev, [chit.id]: !prev[chit.id] }))}
          />
        ))}
      </div>
    </div>
  );
}

function ChitBalanceRow({ chit, memberId, expanded, onToggle }) {
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['memberBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
    enabled: !!memberId && !!chit.id,
    staleTime: 60_000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['paymentHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: expanded && !!memberId && !!chit.id,
    staleTime: 30_000,
  });

  const outstanding = Number(balance?.totalOutstanding ?? 0);
  const sc = CHIT_STATUS_COLOR[chit.status] ?? CHIT_STATUS_COLOR.ACTIVE;

  const totalDue = history.reduce((s, r) => s + Number(r.amountDue ?? 0), 0);
  const totalPaid = history.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full border"
          style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.border }}
        >
          {chit.status}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 text-left truncate">{chit.name}</span>
        {balanceLoading ? (
          <span className="text-xs text-gray-400 flex-shrink-0">…</span>
        ) : outstanding > 0 ? (
          <span className="text-sm font-semibold text-red-600 flex-shrink-0">
            ₹{outstanding.toLocaleString('en-IN')} due
          </span>
        ) : balance !== undefined ? (
          <span className="text-sm font-medium text-green-600 flex-shrink-0">Clear</span>
        ) : null}
        {expanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-2">
          {histLoading ? (
            <p className="text-xs text-gray-400 py-3 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">No payment records found.</p>
          ) : (
            <>
              <div className="space-y-1.5 mt-1">
                {history.map((r) => {
                  const cycleOutstanding = Number(r.amountDue ?? 0) - Number(r.amountPaid ?? 0);
                  const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
                  const cycleColors = {
                    SETTLED: { text: '#16A34A', bg: '#F0FDF4' },
                    PARTIALLY_PAID: { text: '#D97706', bg: '#FFFBEB' },
                    OUTSTANDING: { text: '#DC2626', bg: '#FFF5F5' },
                    WAIVED: { text: '#9CA3AF', bg: '#F9FAFB' },
                  };
                  const cc = cycleColors[r.status] ?? cycleColors.OUTSTANDING;
                  return (
                    <div key={r.id} className="flex items-center gap-3 py-1.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: '#1E3A5F' }}
                      >
                        {r.monthNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-gray-700">Draw {r.monthNumber}</span>
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                            style={{ color: cc.text, backgroundColor: cc.bg }}
                          >
                            {r.status?.replace('_', ' ')}
                          </span>
                          {r.overdue && (
                            <span className="text-xs text-red-500 flex items-center gap-0.5">
                              <AlertTriangle size={10} /> Overdue
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div
                            className="h-1 rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct === 100 ? '#16A34A' : r.overdue ? '#DC2626' : '#1E3A5F',
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 min-w-[5rem]">
                        <p className="text-xs font-semibold text-gray-800">
                          ₹{Number(r.amountPaid).toLocaleString('en-IN')}
                          <span className="text-gray-400 font-normal"> / ₹{Number(r.amountDue).toLocaleString('en-IN')}</span>
                        </p>
                        {cycleOutstanding > 0 && (
                          <p className="text-xs text-red-500">₹{cycleOutstanding.toLocaleString('en-IN')} pending</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Totals row */}
              <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500">Chit Total</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-800">
                    ₹{totalPaid.toLocaleString('en-IN')}
                    <span className="text-gray-400 font-normal text-xs"> paid of ₹{totalDue.toLocaleString('en-IN')}</span>
                  </span>
                  {outstanding > 0 && (
                    <p className="text-xs text-red-600 font-semibold">₹{outstanding.toLocaleString('en-IN')} outstanding</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payment history section ──────────────────────────────────────────────────
function PaymentHistorySection({ memberId }) {
  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['chitsForMember', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  const [selectedChitId, setSelectedChitId] = useState('');

  // Auto-select first chit once loaded
  useEffect(() => {
    if (chits.length > 0 && !selectedChitId) {
      setSelectedChitId(chits[0].id);
    }
  }, [chits, selectedChitId]);

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['paymentHistory', memberId, selectedChitId],
    queryFn: () => getPaymentHistory({ memberId, chitId: selectedChitId }),
    enabled: !!selectedChitId,
  });

  const statusColor = {
    SETTLED: 'text-green-700 bg-green-50',
    PARTIALLY_PAID: 'text-amber-700 bg-amber-50',
    OUTSTANDING: 'text-gray-600 bg-gray-50',
    WAIVED: 'text-gray-400 bg-gray-50',
  };

  const chitStatusColor = {
    ACTIVE:    '#16A34A',
    COMPLETED: '#6B7280',
    PAUSED:    '#D97706',
    PENDING:   '#2563EB',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            Payment History
          </h3>
        </div>
        {chits.length > 0 && (
          <select
            value={selectedChitId}
            onChange={(e) => setSelectedChitId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          >
            {chits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status}
              </option>
            ))}
          </select>
        )}
      </div>

      {chitsLoading || histLoading ? (
        <PageSpinner />
      ) : chits.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Not enrolled in any chits.</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No payment records for this chit yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((r) => {
            const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
            return (
              <div
                key={r.id}
                className={`flex items-center gap-4 p-3 rounded-lg ${r.overdue ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  M{r.monthNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">Draw {r.monthNumber}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[r.status] ?? 'text-gray-500 bg-gray-50'}`}>
                      {r.status}
                    </span>
                    {r.overdue && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle size={11} /> Overdue
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? '#16A34A' : r.overdue ? '#DC2626' : '#1E3A5F',
                      }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">₹{Number(r.amountPaid).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">of ₹{Number(r.amountDue).toLocaleString()}</p>
                </div>
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-gray-400">Due</p>
                  <p className="text-xs text-gray-600">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : <NA />}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [showEdit, setShowEdit] = useState(false);
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const toast = useToastContext();
  const qc = useQueryClient();

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => getMember(id),
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['memberTotalBalance', id],
    queryFn: () => getMemberTotalBalance(id),
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: userAccount } = useQuery({
    queryKey: ['memberUserAccount', member?.userId],
    queryFn: () => getUserById(member.userId),
    enabled: !!member?.userId,
    staleTime: 60_000,
  });

  const reminderMutation = useMutation({
    mutationFn: () => sendPaymentReminder(member.userId),
    onSuccess: () => toast.success('Payment reminder sent.'),
    onError: () => toast.error('Could not send reminder.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member deleted successfully');
      navigate('/members');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to delete member'),
  });

  if (isLoading) return <PageSpinner />;
  if (!member) return (
    <div className="text-center py-24">
      <p className="text-gray-400">Member not found.</p>
      <Button variant="secondary" onClick={() => navigate('/members')} className="mt-4">
        <ArrowLeft size={14} /> Back to Members
      </Button>
    </div>
  );

  const isDeleted = !!member.deletedAt;
  const phoneDisplay = formatPhone(member.phoneCountryCode ?? '+91', member.phone);

  return (
    <div className="space-y-6">
      {/* Back — always goes to members list, not browser history */}
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} /> Back to Members
      </button>

      {/* Deleted banner */}
      {isDeleted && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <Trash2 size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">This member has been deleted</p>
            <p className="text-xs text-red-500 mt-0.5">
              Deleted {new Date(member.deletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {member.deletedBy && ` · by admin`}{' '}
              — Record is read-only. All data is preserved for audit purposes.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 ${isDeleted ? 'bg-gray-400' : ''}`}
            style={isDeleted ? {} : { backgroundColor: '#1E3A5F' }}
          >
            {(member.fullName ?? '?')[0].toUpperCase()}
          </div>

          {/* Name + meta */}
          <div>
            <h2
              className={`text-2xl font-bold ${isDeleted ? 'text-gray-400 line-through' : ''}`}
              style={isDeleted ? {} : { color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
            >
              {member.fullName}
            </h2>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              {/* Status with inline switcher */}
              {isDeleted ? (
                <Badge variant="danger">Deleted</Badge>
              ) : (
                <StatusSwitcher member={member} disabled={isDeleted} />
              )}

              {/* App access indicator beside status */}
              {member.hasAppAccess && !isDeleted && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100"
                  title={userAccount?.lastLoginAt ? `Last active: ${new Date(userAccount.lastLoginAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Never logged in'}
                >
                  <ShieldCheck size={12} /> App Access
                </span>
              )}
            </div>

            {/* City & outstanding below the status row */}
            <div className="flex items-center flex-wrap gap-2 mt-1">
              {member.city ? (
                <span className="text-sm text-gray-400">{member.city}</span>
              ) : null}
              {!isDeleted && (
                Number(totalOutstanding) > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    ₹{Number(totalOutstanding).toLocaleString('en-IN')} outstanding
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    No outstanding dues
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!isDeleted && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={() => setShowEdit(true)}>
              <Edit2 size={15} /> Edit Member
            </Button>
            <MoreActionsMenu
              member={member}
              isAdmin={isAdmin}
              onCreateLogin={() => setShowCreateLogin(true)}
              onResetPassword={() => setShowReset(true)}
              onReminder={() => reminderMutation.mutate()}
              onDelete={() => setShowDeleteConfirm(true)}
              reminderPending={reminderMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-[#1E3A5F]" />
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
              Personal Information
            </h3>
          </div>
          <InfoRow label="Member ID" value={member.id} />
          <InfoRow label="Full Name" value={member.fullName} />
          <InfoRow label="Phone" value={member.phone ? phoneDisplay : null} />
          <InfoRow label="Email" value={member.email} />
          <InfoRow label="Address" value={member.address} />
          <InfoRow label="City" value={member.city} />
          <InfoRow label="Aadhaar Last 4" value={member.aadhaarLast4 ? `xxxx-xxxx-${member.aadhaarLast4}` : null} />
          <InfoRow label="PAN Number" value={member.panNumber} />
          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-gray-50 last:border-0 gap-1">
            <span className="text-sm text-gray-500 sm:w-40 flex-shrink-0">Referred By</span>
            {member.referredById ? (
              <Link to={`/members/${member.referredById}`} className="text-sm font-medium text-[#1E3A5F] hover:underline">
                {member.referredByName}
              </Link>
            ) : (
              <NA />
            )}
          </div>
        </div>

        {/* Bank Details */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-[#1E3A5F]" />
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
              Bank Details
            </h3>
          </div>
          <InfoRow label="Bank Name" value={member.bankName} />
          <InfoRow label="Account No." value={member.bankAccountNumber} />
          <InfoRow label="IFSC Code" value={member.bankIfsc} />
        </div>
      </div>

      {/* Notes */}
      {member.notes && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={18} className="text-[#1E3A5F]" />
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>Notes</h3>
          </div>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{member.notes}</p>
        </div>
      )}

      {/* Balances */}
      <BalancesSection memberId={id} />

      {/* Payment History */}
      <PaymentHistorySection memberId={id} />

      {/* Modals */}
      {showEdit && <EditMemberModal member={member} onClose={() => setShowEdit(false)} />}
      {showCreateLogin && <CreateLoginModal member={member} onClose={() => setShowCreateLogin(false)} />}
      {showReset && <ResetPasswordModal member={member} onClose={() => setShowReset(false)} />}
      {showDeleteConfirm && (
        <ConfirmDialog
          variant="danger"
          title="Delete Member"
          description={`Are you sure you want to delete ${member.fullName}? This will mark the member as deleted but keep the record. This action cannot be undone.`}
          actionLabel="Delete Member"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
