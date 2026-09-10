import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMember, getMembers, updateMember, patchMemberStatus, getChitsForMember,
  getPaymentHistory, getMemberTotalBalance, getMemberBalance, getMemberCredit,
  resetMemberPassword, getUserById, sendPaymentReminder, sendWhatsAppReminder,
  softDeleteMember, getMemberAuditHistory, getActiveCashRequests, lockUser, unlockUser,
  getMemberSettlements, recordSettlementTransaction, voidSettlement,
  getMemberPaymentHistoryByChit, createMemberLogin, linkMemberUser, checkUsernameAvailability,
  adminUpdateUserPhone,
  sendReminder, getRemindersForMember, getReminderForAdmin, removeReminder,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { formatPhone } from '../../components/ui/PhoneInput';
import PhoneOtpVerifier from '../../components/ui/PhoneOtpVerifier';
import {
  ArrowLeft, Edit2, User, FileText, History, AlertTriangle,
  UserPlus, ShieldCheck, KeyRound, Eye, Copy, Check, BellRing, Trash2,
  ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Wallet, MessageCircle, HandCoins,
  Layers, ExternalLink, ClipboardList, TrendingUp, TrendingDown, ArrowRight,
  Lock, LockOpen,
} from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

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
function MoreActionsMenu({ member, isAdmin, isManager, userAccount, onCreateLogin, onResetPassword, onReminder, onWhatsApp, onDelete, onHistory, onLock, onUnlock, reminderPending, whatsappPending, lockPending, unlockPending }) {
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
              {(isAdmin || isManager) && (
                userAccount?.locked ? (
                  <MenuButton
                    icon={<LockOpen size={14} className="text-amber-600" />}
                    disabled={unlockPending}
                    onClick={() => { onUnlock(); setOpen(false); }}
                  >
                    {unlockPending ? 'Unlocking…' : 'Unlock Account'}
                  </MenuButton>
                ) : (
                  <MenuButton
                    icon={<Lock size={14} className="text-amber-600" />}
                    disabled={lockPending}
                    onClick={() => { onLock(); setOpen(false); }}
                  >
                    {lockPending ? 'Locking…' : 'Lock Account'}
                  </MenuButton>
                )
              )}
              <MenuButton
                icon={<BellRing size={14} />}
                disabled={reminderPending}
                onClick={() => { onReminder(); setOpen(false); }}
              >
                {reminderPending ? 'Sending…' : 'Send Reminder'}
              </MenuButton>
              {member.phone && (
                <MenuButton
                  icon={<MessageCircle size={14} className="text-green-600" />}
                  disabled={whatsappPending}
                  onClick={() => { onWhatsApp(); setOpen(false); }}
                >
                  {whatsappPending ? 'Sending…' : 'Send WhatsApp'}
                </MenuButton>
              )}
            </>
          ) : (
            <MenuButton
              icon={<UserPlus size={14} />}
              onClick={() => { onCreateLogin(); setOpen(false); }}
            >
              Resend Setup Link
            </MenuButton>
          )}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <MenuButton
                icon={<History size={14} className="text-[#4F46E5]" />}
                onClick={() => { onHistory(); setOpen(false); }}
              >
                Profile History
              </MenuButton>
              <MenuButton
                icon={<HandCoins size={14} className="text-[#1E3A5F]" />}
                onClick={() => { navigate(`/settlement?memberId=${member.id}`); setOpen(false); }}
              >
                Settle Account
              </MenuButton>
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

// ─── Edit member — centered modal ────────────────────────────────────────────
function EditMemberPanel({ member, onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const originalPhone = member.phone ?? '';
  const originalCC = member.phoneCountryCode ?? '+91';
  const [form, setForm] = useState({
    fullName: member.fullName ?? '',
    phone: originalPhone,
    phoneCountryCode: originalCC,
    email: member.email ?? '',
    address: member.address ?? '',
    city: member.city ?? '',
    aadhaarLast4: member.aadhaarLast4 ?? '',
    panNumber: member.panNumber ?? '',
    notes: member.notes ?? '',
    referredById: member.referredById ?? '',
  });
  const [phoneVerified, setPhoneVerified] = useState(false);

  const { data: activeMembers = [] } = useQuery({
    queryKey: ['members', 'active-for-referral'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 500 }),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      await updateMember({ id: member.id, ...data });
      // If phone changed and member has a user account, sync it in user-service too
      if (form.phone !== originalPhone && member.userId) {
        await adminUpdateUserPhone({ userId: member.userId, phone: form.phone, countryCode: form.phoneCountryCode });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member updated');
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

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  const phoneChanged = form.phone !== originalPhone;
  const canSave = form.fullName.trim() && (!phoneChanged || phoneVerified);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0"
             style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5490 100%)' }}>
          <div>
            <h2 className="text-base font-bold text-white">Edit Member</h2>
            <p className="text-xs text-blue-200 mt-0.5">{member.fullName}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer">
            ✕
          </button>
        </div>

        {/* Scrollable form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const payload = Object.fromEntries(
              Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
            );
            mutation.mutate(payload);
          }}
          className="flex-1 overflow-y-auto"
        >
          <div className="px-6 py-5 space-y-5">
            {/* Section: Personal */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Personal Information</p>
              <div className="space-y-3">
                <FormField label="Full Name" required>
                  <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus />
                </FormField>
                <PhoneOtpVerifier
                  label="Phone"
                  phone={form.phone}
                  countryCode={form.phoneCountryCode}
                  originalPhone={originalPhone}
                  onPhoneChange={(v) => { set('phone', v); setPhoneVerified(false); }}
                  onCountryChange={(code) => set('phoneCountryCode', code)}
                  onVerified={setPhoneVerified}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Email">
                    <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </FormField>
                  <FormField label="City">
                    <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
                  </FormField>
                </div>
                <FormField label="Address">
                  <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
                </FormField>
              </div>
            </div>

            {/* Section: Identity */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Identity</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Aadhaar Last 4">
                  <Input maxLength={4} value={form.aadhaarLast4} onChange={(e) => set('aadhaarLast4', e.target.value)} placeholder="1234" />
                </FormField>
                <FormField label="PAN Number">
                  <Input value={form.panNumber} onChange={(e) => set('panNumber', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                </FormField>
              </div>
            </div>

            {/* Section: Referral + Notes */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Other</p>
              <div className="space-y-3">
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
                <FormField label="Notes">
                  <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
                </FormField>
              </div>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              loading={mutation.isPending}
              disabled={!canSave}
              className="flex-1"
              title={phoneChanged && !phoneVerified ? 'Verify the new phone number first' : undefined}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Temp password display ────────────────────────────────────────────────────
function TempPasswordDisplay({ tempPassword, username, label }) {
  const [copied, setCopied] = useState(false);
  const textToCopy = username
    ? `Username: ${username}\nPassword: ${tempPassword}`
    : tempPassword;
  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(done).catch(() => fallbackCopy(textToCopy, done));
    } else {
      fallbackCopy(textToCopy, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus(); el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    done();
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">{label ?? 'Login Credentials'}</p>
      <div className="space-y-2 mb-3">
        {username && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600 w-20 shrink-0">Username</span>
            <code className="flex-1 text-sm font-mono font-bold text-gray-900">{username}</code>
          </div>
        )}
        <div className="flex items-center gap-2">
          {username && <span className="text-xs text-amber-600 w-20 shrink-0">Password</span>}
          <code className={`flex-1 font-mono font-bold text-gray-900 tracking-widest select-all ${username ? 'text-sm' : 'text-lg'}`}>{tempPassword}</code>
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex items-center justify-center gap-1.5 w-full text-xs px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors font-semibold"
      >
        {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> {username ? 'Copy Username & Password' : 'Copy Password'}</>}
      </button>
      <p className="text-xs text-amber-600 mt-2">Share these with the member. They must change the password on first login.</p>
    </div>
  );
}

// ─── Resend setup link modal ──────────────────────────────────────────────────
function CreateLoginModal({ member, onClose }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [availability, setAvailability] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [result, setResult]     = useState(null); // { username, tempPassword }
  const [copied, setCopied]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const debounceRef = useRef(null);

  function handleUsernameChange(val) {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9._]/g, '');
    setUsername(cleaned);
    setAvailability(null);
    clearTimeout(debounceRef.current);
    if (!cleaned || cleaned.length < 3) return;
    setAvailability('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await checkUsernameAvailability(cleaned);
        setAvailability(data.available ? 'available' : 'taken');
      } catch {
        setAvailability(null);
      }
    }, 400);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (availability !== 'available') return;
    setLoading(true);
    try {
      const loginData = await createMemberLogin({ username, email: email.trim() || undefined });
      await linkMemberUser({ memberId: member.id, userId: loginData.userId });
      qc.invalidateQueries({ queryKey: ['member', member.id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      setResult({ username, tempPassword: loginData.tempPassword });
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create login');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const text = `Username: ${result.username}\nPassword: ${result.tempPassword}`;
    return (
      <Modal title="Login Created" onClose={onClose} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Share these credentials with <strong>{member.fullName}</strong>. They'll be asked to change the password on first login.</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Username</p>
              <p className="text-lg font-bold text-gray-900 font-mono">{result.username}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Temp Password</p>
              <p className="text-2xl font-bold text-gray-900 font-mono tracking-widest">{result.tempPassword}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#1E3A5F] text-[#1E3A5F] text-sm font-semibold cursor-pointer hover:bg-[#EFF4FA] transition-colors"
          >
            {copied ? <><Check size={14} className="text-green-600" /> Copied!</> : <><Copy size={14} /> Copy Username & Password</>}
          </button>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  const statusIcon = availability === 'checking' ? (
    <span className="text-gray-400 text-xs">Checking…</span>
  ) : availability === 'available' ? (
    <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><Check size={12} /> Available</span>
  ) : availability === 'taken' ? (
    <span className="text-red-500 text-xs font-semibold">Already taken</span>
  ) : null;

  return (
    <Modal title="Create App Login" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">Set a username for <strong>{member.fullName}</strong>. A temporary password will be generated for you to share.</p>

        <FormField label="Username" required>
          <div className="relative">
            <Input
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="e.g. sai.srinivas"
              autoComplete="off"
              className={availability === 'taken' ? 'border-red-400 focus:ring-red-300' : availability === 'available' ? 'border-green-400 focus:ring-green-300' : ''}
            />
            {username.length >= 3 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">{statusIcon}</div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Letters, numbers, dots and underscores only.</p>
        </FormField>

        <FormField label="Email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
          />
        </FormField>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            type="submit"
            className="flex-1"
            loading={loading}
            disabled={availability !== 'available' || !username}
          >
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

// ─── Enrolled chits section ───────────────────────────────────────────────────
const CHIT_STATUS_STYLE = {
  ACTIVE:    { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Active' },
  COMPLETED: { text: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', label: 'Completed' },
  PAUSED:    { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Paused' },
  PENDING:   { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Pending' },
  DRAFT:     { text: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', label: 'Draft' },
};

// Kept temporarily while the newer paginated ChitsTab settles; not rendered directly.
// eslint-disable-next-line no-unused-vars
function EnrolledChitsSection({ memberId }) {
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();

  const { data: chits = [], isLoading } = useQuery({
    queryKey: ['chitsForMember', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  if (isLoading || chits.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={18} className="text-[#1E3A5F]" />
        <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Enrolled Chits
        </h3>
        <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {chits.length}
        </span>
      </div>

      <div className="space-y-2">
        {chits.map((chit) => {
          const s = CHIT_STATUS_STYLE[chit.status] ?? CHIT_STATUS_STYLE.ACTIVE;
          return (
            <button
              key={chit.id}
              type="button"
              onClick={() => navigate(`/chits/${chit.id}`)}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-[#EEF2F8] hover:border-[#C7D5E8] transition-colors cursor-pointer text-left group"
            >
              {/* Status dot + name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
                    style={{ color: s.text, backgroundColor: s.bg, borderColor: s.border }}
                  >
                    {s.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#1E3A5F]">
                    {chit.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  {chit.durationMonths && (
                    <span>{chit.durationMonths} months</span>
                  )}
                  {chit.capacity && (
                    <span>{chit.capacity} members</span>
                  )}
                  {chit.startDate && (
                    <span>Started {new Date(chit.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  )}
                </div>
              </div>

              {/* Amounts */}
              <div className="text-right flex-shrink-0">
                {chit.chitValue && (
                  <p className="text-sm font-bold text-gray-800">
                    {hidden ? '••••••' : `₹${Number(chit.chitValue).toLocaleString('en-IN')}`}
                  </p>
                )}
                {chit.installmentAmount && (
                  <p className="text-xs text-gray-400">
                    {hidden ? '••••••' : `₹${Number(chit.installmentAmount).toLocaleString('en-IN')}/mo`}
                  </p>
                )}
              </div>

              <ExternalLink size={14} className="text-gray-300 group-hover:text-[#1E3A5F] flex-shrink-0 transition-colors" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Balances section ─────────────────────────────────────────────────────────
const CHIT_STATUS_COLOR = {
  ACTIVE:    { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  COMPLETED: { text: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  PAUSED:    { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  PENDING:   { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
};

// Kept temporarily as the detailed balance implementation backing future tab work.
// eslint-disable-next-line no-unused-vars
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
  const { hidden } = useHiddenAmounts();
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['memberBalance', memberId, chit.id],
    queryFn: () => getMemberBalance({ memberId, chitId: chit.id }),
    enabled: !!memberId && !!chit.id,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['paymentHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: expanded && !!memberId && !!chit.id,
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
            {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due
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
                    SETTLED:            { text: '#16A34A', bg: '#F0FDF4' },
                    PARTIALLY_PAID:     { text: '#D97706', bg: '#FFFBEB' },
                    OUTSTANDING:        { text: '#DC2626', bg: '#FFF5F5' },
                    WAIVED:             { text: '#9CA3AF', bg: '#F9FAFB' },
                    PAYOUT_DEDUCTED:    { text: '#1E3A5F', bg: '#EEF2F8' },
                    SETTLEMENT_CLEARED: { text: '#16A34A', bg: '#F0FDF4' },
                  };
                  const cycleStatusLabel = {
                    SETTLED:            'Settled',
                    PARTIALLY_PAID:     'Partial',
                    OUTSTANDING:        'Outstanding',
                    WAIVED:             'Waived',
                    PAYOUT_DEDUCTED:    'Payout Deducted',
                    SETTLEMENT_CLEARED: 'Settlement Cleared',
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
                            {cycleStatusLabel[r.status] ?? r.status?.replace(/_/g, ' ')}
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
                          {hidden ? '••••••' : `₹${Number(r.amountPaid).toLocaleString('en-IN')}`}
                          <span className="text-gray-400 font-normal"> / {hidden ? '••••••' : `₹${Number(r.amountDue).toLocaleString('en-IN')}`}</span>
                        </p>
                        {cycleOutstanding > 0 && (r.status === 'OUTSTANDING' || r.status === 'PARTIALLY_PAID') && (
                          <p className="text-xs text-red-500">{hidden ? '••••••' : `₹${cycleOutstanding.toLocaleString('en-IN')}`} pending</p>
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
                    {hidden ? '••••••' : `₹${totalPaid.toLocaleString('en-IN')}`}
                    <span className="text-gray-400 font-normal text-xs"> paid of {hidden ? '••••••' : `₹${totalDue.toLocaleString('en-IN')}`}</span>
                  </span>
                  {outstanding > 0 && (
                    <p className="text-xs text-red-600 font-semibold">{hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} outstanding</p>
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

// ─── Profile change history (admin-only) ─────────────────────────────────────
function ProfileHistorySection({ memberId, flat = false }) {
  const [open, setOpen] = useState(false);
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['memberAuditHistory', memberId],
    queryFn: () => getMemberAuditHistory(memberId),
    enabled: (flat || open) && !!memberId,
  });

  const ACTION_LABELS = {
    'PROFILE_UPDATED': 'Profile Updated',
    'STATUS_CHANGED':  'Status Changed',
    'CREATED':         'Member Created',
    'DELETED':         'Member Deleted',
  };

  const content = isLoading ? (
    <p className="text-sm text-gray-400 text-center py-4">Loading history…</p>
  ) : logs.length === 0 ? (
    <p className="text-sm text-gray-400 text-center py-6">No profile changes recorded yet</p>
  ) : (
    <div className="space-y-3">
      {logs.map((log, idx) => {
        const actionLabel = ACTION_LABELS[log.action] ?? log.action?.replace(/_/g, ' ') ?? 'Change';
        const isFirst = idx === 0;
        return (
          <div key={log.id ?? idx}
            className={`flex gap-3 pb-3 ${idx < logs.length - 1 ? 'border-b border-gray-50' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isFirst ? 'bg-[#EEF2FF]' : 'bg-gray-100'}`}>
              <Edit2 size={12} className={isFirst ? 'text-[#4F46E5]' : 'text-gray-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{actionLabel}</span>
                {log.actorRole && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#EEF2F8] text-[#1E3A5F] font-medium">{log.actorRole}</span>
                )}
              </div>
              {(log.previousValue || log.newValue) && (
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  {log.previousValue && log.newValue
                    ? `${log.previousValue} → ${log.newValue}`
                    : log.newValue ?? log.previousValue}
                </p>
              )}
              {log.reason && <p className="text-xs text-gray-400 italic mt-1">"{log.reason}"</p>}
              <p className="text-xs text-gray-400 mt-1">
                {log.createdAt
                  ? new Date(log.createdAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: true,
                    })
                  : '—'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (flat) {
    return <div className="px-1 py-2">{content}</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
            <History size={16} className="text-[#4F46E5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Profile Change History</p>
            <p className="text-xs text-gray-500">All edits to this member's profile by any admin</p>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          {content}
        </div>
      )}
    </div>
  );
}

// ─── Payment history section ──────────────────────────────────────────────────
function PaymentHistorySection({ memberId }) {
  const { hidden } = useHiddenAmounts();
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
    SETTLED:            'text-green-700 bg-green-50',
    PARTIALLY_PAID:     'text-amber-700 bg-amber-50',
    OUTSTANDING:        'text-red-700 bg-red-50',
    WAIVED:             'text-gray-400 bg-gray-50',
    PAYOUT_DEDUCTED:    'text-[#1E3A5F] bg-[#EEF2F8]',
    SETTLEMENT_CLEARED: 'text-teal-700 bg-teal-50',
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
          <Select
            value={selectedChitId}
            onChange={(e) => setSelectedChitId(e.target.value)}
          >
            {chits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status}
              </option>
            ))}
          </Select>
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
                  <p className="text-sm font-semibold text-gray-900">{hidden ? '••••••' : `₹${Number(r.amountPaid).toLocaleString()}`}</p>
                  <p className="text-xs text-gray-400">of {hidden ? '••••••' : `₹${Number(r.amountDue).toLocaleString()}`}</p>
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

// ─── Settlement History + Payment Collection ──────────────────────────────────
function PendingSettlementCard({ memberId }) {
  const { hidden } = useHiddenAmounts();
  const navigate = useNavigate();

  const { data: settlementPage } = useQuery({
    queryKey: ['memberSettlements', memberId],
    queryFn: () => getMemberSettlements(memberId, 0, 20),
    enabled: !!memberId,
  });
  const settlements = settlementPage?.content ?? [];
  const TERMINAL = new Set(['FULLY_COLLECTED', 'FULLY_DISBURSED', 'BALANCED', 'VOIDED']);
  const pendingOnes = settlements.filter((s) => !s.supersededById && !TERMINAL.has(s.paymentStatus));

  if (pendingOnes.length === 0) return null;

  return (
    <div className="space-y-2">
      {pendingOnes.map((s) => {
        const remaining = Math.abs(Number(s.remainingAmount ?? 0));
        const isCollect = Number(s.totalAmount ?? 0) > 0;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/settlement?memberId=${memberId}&settlementId=${s.id}`)}
            className="w-full bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center gap-3 text-left hover:border-amber-400 transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100">
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Settlement {isCollect ? 'Payment Pending' : 'Disbursement Pending'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {hidden ? '••••••' : `₹${remaining.toLocaleString('en-IN')}`} remaining to {isCollect ? 'collect' : 'disburse'}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-700">
              Record <ArrowRight size={12} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SettlementHistorySection({ memberId }) {
  const { hidden } = useHiddenAmounts();
  const qc = useQueryClient();
  const toast = useToastContext();

  const { data: settlementPage, isLoading } = useQuery({
    queryKey: ['memberSettlements', memberId],
    queryFn: () => getMemberSettlements(memberId, 0, 20),
    enabled: !!memberId,
  });
  const settlements = settlementPage?.content ?? [];

  const [activeId, setActiveId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [expandedSettlement, setExpandedSettlement] = useState(null);
  const [expandedChitId, setExpandedChitId] = useState(null);
  const [voidId, setVoidId] = useState(null);

  const payMutation = useMutation({
    mutationFn: (vars) => recordSettlementTransaction(vars),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['memberSettlements', memberId] });
      setActiveId(null);
      setPayAmount('');
      setPayMode('');
      setPayRef('');
      setPayNotes('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record payment'),
  });

  const voidMutation = useMutation({
    mutationFn: (settlementId) => voidSettlement(settlementId),
    onSuccess: () => {
      toast.success('Settlement voided — exact payment state restored');
      qc.invalidateQueries({ queryKey: ['memberSettlements', memberId] });
      qc.invalidateQueries({ queryKey: ['members'] });
      setVoidId(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to void settlement'),
  });

  // Draw-level payment details when a chit row is expanded
  const { data: drawDetails = [], isLoading: drawLoading } = useQuery({
    queryKey: ['draw-details', memberId, expandedChitId],
    queryFn: () => getMemberPaymentHistoryByChit(memberId, expandedChitId),
    enabled: !!(memberId && expandedChitId),
  });

  const TERMINAL = ['FULLY_COLLECTED', 'FULLY_DISBURSED', 'BALANCED', 'VOIDED'];
  const hasActive = settlements.some((s) => !s.supersededById && !TERMINAL.includes(s.paymentStatus));
  const [collapsed, setCollapsed] = useState(!hasActive);
  const statusCfg = {
    PENDING:              { bg: 'bg-amber-100', text: 'text-amber-700',  label: 'Pending' },
    PARTIALLY_COLLECTED:  { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]',  label: 'Partial (Collect)' },
    PARTIALLY_DISBURSED:  { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]',  label: 'Partial (Pay)' },
    FULLY_COLLECTED:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Collected' },
    FULLY_DISBURSED:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Disbursed' },
    BALANCED:             { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Balanced' },
    VOIDED:               { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Voided' },
  };

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <HandCoins size={18} className="text-[#1E3A5F]" />
        <h3 className="font-semibold text-gray-900">Settlement History</h3>
      </div>
      <PageSpinner />
    </div>
  );

  if (settlements.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HandCoins size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Settlement History</h3>
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2F8] text-[#1E3A5F]">
            {settlements.length}
          </span>
          {hasActive && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              Active
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{collapsed ? 'Show ▾' : 'Hide ▴'}</span>
      </button>

      {!collapsed && <div className="divide-y divide-gray-100">
        {settlements.map((s) => {
          const net = Number(s.netAmount);
          const absNet = Math.abs(net);
          const isCollect = net > 0;
          const moved = isCollect ? Number(s.collectedAmount ?? 0) : Number(s.disbursedAmount ?? 0);
          const remaining = Math.max(0, absNet - moved);
          const isSuperseded = Boolean(s.supersededById);
          const isTerminal = isSuperseded || TERMINAL.includes(s.paymentStatus);
          const isVoided = s.paymentStatus === 'VOIDED';
          const cfg = isSuperseded
            ? { bg: 'bg-purple-100', text: 'text-purple-700', label: `Superseded · v${s.settlementVersion ?? 1}` }
            : (statusCfg[s.paymentStatus] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: s.paymentStatus });
          const isOpen = activeId === s.id;
          const isExpanded = expandedSettlement === s.id;

          return (
            <div key={s.id} className={isVoided || isSuperseded ? 'opacity-60' : ''}>
              {/* Settlement row */}
              <div className="px-6 py-4 flex items-center gap-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isCollect ? 'bg-red-50' : 'bg-green-50'}`}>
                  {isCollect
                    ? <TrendingUp size={16} className="text-red-600" />
                    : <TrendingDown size={16} className="text-green-600" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {hidden ? '••••••' : `₹${absNet.toLocaleString('en-IN')}`}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isCollect ? 'to collect from member' : 'to pay to member'}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span>{new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {!isTerminal && remaining > 0 && (
                      <span className={isCollect ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                        {hidden ? '••••••' : `₹${remaining.toLocaleString('en-IN')}`} remaining
                      </span>
                    )}
                    {Number(s.creditApplied ?? 0) > 0 && (
                      <span className="font-medium px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#1E3A5F]">
                        Credit ₹{hidden ? '••••' : Number(s.creditApplied).toLocaleString('en-IN')} applied
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Expand / collapse chit details */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedSettlement(isExpanded ? null : s.id);
                      setExpandedChitId(null);
                    }}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(isOpen ? null : s.id);
                        setPayAmount('');
                        setPayMode('');
                        setPayRef('');
                        setPayNotes('');
                      }}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#C7D5E8] text-[#1E3A5F] hover:bg-[#EEF2F8] transition-colors"
                    >
                      {isOpen ? 'Cancel' : 'Record Payment'}
                    </button>
                  )}
                  {!isVoided && !isSuperseded && (
                    <button
                      type="button"
                      onClick={() => setVoidId(s.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-colors"
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>

              {/* Chit breakdown (expanded) */}
              {isExpanded && (s.chitItems ?? []).length > 0 && (
                <div className="mx-6 mb-3 rounded-xl border border-gray-200 overflow-hidden">
                  {(s.chitItems ?? []).map((item) => {
                    const itemNet = Number(item.netAmount);
                    const isItemCollect = itemNet >= 0;
                    const isChitExpanded = expandedChitId === item.chitId;
                    const drawStatusCfg = {
                      SETTLED:            { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Paid' },
                      OUTSTANDING:        { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Outstanding' },
                      PARTIALLY_PAID:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Partial' },
                      WAIVED:             { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Waived' },
                      PAYOUT_DEDUCTED:    { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Deducted' },
                      SETTLEMENT_CLEARED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Settlement Cleared' },
                    };
                    return (
                      <div key={item.chitId} className="border-b border-gray-100 last:border-0">
                        <button
                          type="button"
                          onClick={() => setExpandedChitId(isChitExpanded ? null : item.chitId)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{item.settlementCase?.replace('CASE_','')}</span>
                            <span className="text-sm font-medium text-gray-800 truncate">{item.chitName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${isItemCollect ? 'text-red-600' : 'text-green-700'}`}>
                              {isItemCollect ? '+' : '−'}{hidden ? '••••••' : `₹${Math.abs(itemNet).toLocaleString('en-IN')}`}
                            </span>
                            {isChitExpanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                          </div>
                        </button>
                        {isChitExpanded && (
                          <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                            {item.description && <p className="text-xs text-gray-500 mb-2 italic">{item.description}</p>}
                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                              {Number(item.unpaidDues ?? 0) > 0 && <div><span className="text-gray-500">Unpaid Dues</span><p className="font-semibold text-red-600">₹{Number(item.unpaidDues).toLocaleString('en-IN')}</p></div>}
                              {Number(item.futureInstallments ?? 0) > 0 && <div><span className="text-gray-500">Future Install.</span><p className="font-semibold text-red-600">₹{Number(item.futureInstallments).toLocaleString('en-IN')}</p></div>}
                              {item.payoutStatus === 'PENDING' && Number(item.netPayoutAmount ?? 0) > 0 && <div><span className="text-gray-500">Pending Payout</span><p className="font-semibold text-green-700">₹{Number(item.netPayoutAmount).toLocaleString('en-IN')}</p></div>}
                              {Number(item.payoutCredit ?? 0) > 0 && <div><span className="text-gray-500">Payout Credit</span><p className="font-semibold text-green-700">₹{Number(item.payoutCredit).toLocaleString('en-IN')}</p></div>}
                              {Number(item.totalPaid ?? 0) > 0 && <div><span className="text-gray-500">Total Paid</span><p className="font-semibold text-green-700">₹{Number(item.totalPaid).toLocaleString('en-IN')}</p></div>}
                            </div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">Draw-wise payments</p>
                            {drawLoading ? (
                              <p className="text-xs text-gray-400 text-center py-2">Loading draws…</p>
                            ) : drawDetails.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-2">No draw records found</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {drawDetails.map((draw) => {
                                  const dc = drawStatusCfg[draw.status] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: draw.status };
                                  return (
                                    <div key={draw.id ?? draw.monthNumber} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
                                      <div className="w-6 h-6 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                        {draw.monthNumber}
                                      </div>
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text}`}>{dc.label}</span>
                                      <span className="flex-1" />
                                      <span className="text-xs font-semibold text-gray-700">{hidden ? '••••••' : `₹${Number(draw.amountPaid ?? 0).toLocaleString('en-IN')}`}</span>
                                      <span className="text-xs text-gray-400">/ {hidden ? '••••••' : `₹${Number(draw.amountDue ?? 0).toLocaleString('en-IN')}`}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Credit applied summary */}
              {isExpanded && Number(s.creditApplied ?? 0) > 0 && (
                <div className="mx-6 mb-3 px-4 py-2.5 rounded-xl bg-[#EEF2F8] border border-[#C7D5E8] flex items-center justify-between text-xs">
                  <span className="text-[#1E3A5F] font-medium">Credit balance applied at settlement</span>
                  <span className="font-bold text-[#1E3A5F]">
                    −{hidden ? '••••••' : `₹${Number(s.creditApplied).toLocaleString('en-IN')}`}
                  </span>
                </div>
              )}

              {/* Inline payment form */}
              {isOpen && (
                <div className="mx-6 mb-4 p-4 rounded-xl bg-[#EEF2F8] border border-[#C7D5E8]">
                  <p className="text-xs font-semibold text-[#1E3A5F] mb-3">
                    Record {isCollect ? 'collection from' : 'disbursement to'} member
                    {remaining > 0 && !hidden && ` — ₹${remaining.toLocaleString('en-IN')} remaining`}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Amount (₹) *</label>
                      <input
                        type="number"
                        min="1"
                        max={remaining}
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={`Max ₹${remaining.toLocaleString('en-IN')}`}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Payment Mode *</label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Select mode…</option>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Reference No.</label>
                      <input
                        type="text"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        placeholder="UPI txn / cheque no."
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
                      <input
                        type="text"
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        placeholder="Optional note"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!payAmount || !payMode || payMutation.isPending}
                    loading={payMutation.isPending}
                    onClick={() =>
                      payMutation.mutate({
                        settlementId: s.id,
                        amount: Number(payAmount),
                        mode: payMode,
                        referenceNumber: payRef || null,
                        notes: payNotes || null,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                  >
                    Confirm Payment
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {/* Void confirm dialog */}
      {voidId && (
        <ConfirmDialog
          variant="danger"
          title="Void Settlement"
          description="This restores captured payment statuses, posts linked treasury and credit reversals, and queues member reactivation. Legacy settlements without exact snapshots are refused."
          actionLabel="Void Settlement"
          loading={voidMutation.isPending}
          onConfirm={() => voidMutation.mutate(voidId)}
          onClose={() => setVoidId(null)}
        />
      )}
    </div>
  );
}

// ─── Reminder Modal ───────────────────────────────────────────────────────────

const REPEAT_OPTIONS = [
  { label: 'No repeat', value: '' },
  { label: 'Every 15 min', value: '15' },
  { label: 'Every 30 min', value: '30' },
  { label: 'Every hour', value: '60' },
  { label: 'Every 3 hours', value: '180' },
  { label: 'Once daily (pick a time)', value: 'daily' },
];

function ReminderModal({ memberId, onClose }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [repeatInterval, setRepeatInterval] = useState('');
  const [dailyTime, setDailyTime] = useState('09:00');
  // { [chitId]: { ...chit, customAmount: string } }
  const [selectedChits, setSelectedChits] = useState({});

  const { data: chits = [] } = useQuery({
    queryKey: ['chitsForMember', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  // Fetch outstanding balance for each chit in parallel
  const balanceResults = useQueries({
    queries: chits.map((c) => ({
      queryKey: ['reminder-balance', memberId, c.id],
      queryFn: () => getMemberBalance({ memberId, chitId: c.id }),
      enabled: !!memberId,
      staleTime: 30_000,
    })),
  });
  const outstandingMap = Object.fromEntries(
    chits.map((c, i) => [
      c.id,
      balanceResults[i]?.data?.totalOutstanding != null
        ? Number(balanceResults[i].data.totalOutstanding)
        : null,
    ])
  );

  const total = Object.values(selectedChits).reduce(
    (sum, c) => sum + (parseFloat(c.customAmount) || 0), 0
  );

  const mutation = useMutation({
    mutationFn: () => sendReminder({
      memberProfileId: memberId,
      chits: Object.values(selectedChits).map((c) => ({
        chitId: c.id,
        chitName: c.name,
        cycleNo: c.currentCycle,
        installmentAmount: parseFloat(c.customAmount) || c.installmentAmount,
      })),
      message: message.trim(),
      repeatIntervalMinutes: repeatInterval && repeatInterval !== 'daily' ? Number(repeatInterval) : (repeatInterval === 'daily' ? 1440 : null),
      reminderTime: repeatInterval === 'daily' ? dailyTime : null,
    }),
    onSuccess: () => {
      toast.success('Reminder sent');
      qc.invalidateQueries({ queryKey: ['member-reminders', memberId] });
      onClose();
    },
    onError: () => toast.error('Failed to send reminder'),
  });

  function toggleChit(chit) {
    setSelectedChits((prev) => {
      const next = { ...prev };
      if (next[chit.id]) {
        delete next[chit.id];
      } else {
        const outstanding = outstandingMap[chit.id];
        next[chit.id] = {
          ...chit,
          customAmount: outstanding != null ? String(outstanding) : String(chit.installmentAmount ?? ''),
        };
      }
      return next;
    });
  }

  function setCustomAmount(chitId, value) {
    setSelectedChits((prev) => ({
      ...prev,
      [chitId]: { ...prev[chitId], customAmount: value },
    }));
  }

  return (
    <Modal title="Send Reminder" onClose={onClose} size="md">
      <div className="space-y-4">
        {chits.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Select chits to include</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {chits.map((chit) => {
                const checked = !!selectedChits[chit.id];
                const outstanding = outstandingMap[chit.id];
                return (
                  <div key={chit.id} className={`rounded-lg border transition-colors ${
                    checked ? 'border-[#1E3A5F] bg-[#EEF2F8]' : 'border-gray-200'
                  }`}>
                    <button
                      onClick={() => toggleChit(chit)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        checked ? 'border-[#1E3A5F] bg-[#1E3A5F]' : 'border-gray-300'
                      }`}>
                        {checked && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 block truncate">{chit.name}</span>
                        <span className="text-xs text-gray-500">
                          {outstanding != null
                            ? `₹${outstanding.toLocaleString('en-IN')} unpaid`
                            : chit.installmentAmount
                              ? `₹${Number(chit.installmentAmount).toLocaleString('en-IN')} / month`
                              : ''}
                        </span>
                      </div>
                    </button>
                    {checked && (
                      <div className="px-3 pb-2.5 flex items-center gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">Amount to remind</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={selectedChits[chit.id]?.customAmount ?? ''}
                            onChange={(e) => setCustomAmount(chit.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {total > 0 && (
              <div className="mt-2 flex justify-between items-center px-1 py-1.5 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Total to remind</span>
                <span className="text-sm font-bold text-[#1E3A5F]">₹{total.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1 block">Message <span className="text-red-500">*</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message for the member's notification..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1 block">Auto-repeat on member's phone</label>
          <select
            value={repeatInterval}
            onChange={(e) => setRepeatInterval(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {repeatInterval === 'daily' && (
            <div className="mt-2 flex items-center gap-3">
              <label className="text-sm text-gray-600 flex-shrink-0">Notify at</label>
              <input
                type="time"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <span className="text-xs text-gray-400">member's local time</span>
            </div>
          )}

          {repeatInterval && (
            <p className="text-xs text-gray-400 mt-2">
              {repeatInterval === 'daily'
                ? `Member's app will notify them every day at ${dailyTime} until they set a payment date.`
                : `Member's app will notify them every ${REPEAT_OPTIONS.find(o => o.value === repeatInterval)?.label.toLowerCase()} until they set a payment date.`}
              Notifications stop when member commits to a payment date.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !message.trim()}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-60"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {mutation.isPending ? 'Sending…' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Chits Tab ───────────────────────────────────────────────────────────────

const CHITS_PER_PAGE = 5;

function ChitsTab({ memberId }) {
  const { hidden } = useHiddenAmounts();
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const { data: allChits = [], isLoading } = useQuery({
    queryKey: ['chitsForMember', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });

  // Client-side pagination
  const totalPages = Math.ceil(allChits.length / CHITS_PER_PAGE);
  const chits = allChits.slice(page * CHITS_PER_PAGE, (page + 1) * CHITS_PER_PAGE);

  // Fetch balances for all chits upfront
  const balanceResults = useQueries({
    queries: allChits.map((c) => ({
      queryKey: ['memberBalance', memberId, c.id],
      queryFn: () => getMemberBalance({ memberId, chitId: c.id }),
      enabled: !!memberId,
      staleTime: 60_000,
    })),
  });
  const balanceMap = Object.fromEntries(
    allChits.map((c, i) => [c.id, balanceResults[i]?.data])
  );

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 border-b border-gray-100 last:border-0 animate-pulse bg-gray-50" />
        ))}
      </div>
    );
  }

  if (allChits.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-14 text-center">
        <Layers size={32} className="text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Not enrolled in any chits</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Enrolled Chits</h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{allChits.length}</span>
        </div>
      </div>

      <div>
        {chits.map((chit) => {
          const sc = CHIT_STATUS_COLOR[chit.status] ?? CHIT_STATUS_COLOR.ACTIVE;
          const balance = balanceMap[chit.id];
          const outstanding = Number(balance?.totalOutstanding ?? 0);
          const isExpanded = expandedId === chit.id;

          return (
            <div key={chit.id} className="border-b border-gray-100 last:border-0">
              {/* Row — click anywhere to expand draws; chit name Link navigates to detail */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : chit.id)}
                className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
                  style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.border }}
                >
                  {chit.status}
                </span>
                {/* Chit name — plain text so row click expands draws */}
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{chit.name}</span>
                {/* Icon-only link to chit detail — stopPropagation so row expand doesn't also fire */}
                <Link
                  to={`/chits/${chit.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 text-gray-300 hover:text-[#1E3A5F] transition-colors"
                  title="Open chit detail"
                >
                  <ExternalLink size={14} />
                </Link>
                {/* Balance */}
                {balance === undefined ? (
                  <span className="text-xs text-gray-400 flex-shrink-0">…</span>
                ) : outstanding > 0 ? (
                  <span className="text-sm font-semibold text-red-600 flex-shrink-0">
                    {hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} due
                  </span>
                ) : (
                  <span className="text-sm font-medium text-green-600 flex-shrink-0">Clear</span>
                )}
                {isExpanded
                  ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" />
                  : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
              </div>

              {/* Expanded: draw-by-draw history (same as BalancesSection) */}
              {isExpanded && (
                <ChitDrawsExpanded memberId={memberId} chit={chit} balance={balance} hidden={hidden} />
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-[#1E3A5F] disabled:opacity-40 cursor-pointer">← Prev</button>
          <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-sm text-[#1E3A5F] disabled:opacity-40 cursor-pointer">Next →</button>
        </div>
      )}
    </div>
  );
}

function ChitDrawsExpanded({ memberId, chit, balance, hidden }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['paymentHistory', memberId, chit.id],
    queryFn: () => getPaymentHistory({ memberId, chitId: chit.id }),
    enabled: !!memberId && !!chit.id,
  });

  const outstanding = Number(balance?.totalOutstanding ?? 0);
  const totalDue = history.reduce((s, r) => s + Number(r.amountDue ?? 0), 0);
  const totalPaid = history.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);

  const cycleColors = {
    SETTLED:            { text: '#16A34A', bg: '#F0FDF4' },
    PARTIALLY_PAID:     { text: '#D97706', bg: '#FFFBEB' },
    OUTSTANDING:        { text: '#DC2626', bg: '#FFF5F5' },
    WAIVED:             { text: '#9CA3AF', bg: '#F9FAFB' },
    PAYOUT_DEDUCTED:    { text: '#1E3A5F', bg: '#EEF2F8' },
    SETTLEMENT_CLEARED: { text: '#16A34A', bg: '#F0FDF4' },
  };
  const cycleStatusLabel = {
    SETTLED:            'Settled',
    PARTIALLY_PAID:     'Partial',
    OUTSTANDING:        'Outstanding',
    WAIVED:             'Waived',
    PAYOUT_DEDUCTED:    'Payout Deducted',
    SETTLEMENT_CLEARED: 'Settlement Cleared',
  };

  return (
    <div className="px-5 pb-4 pt-2 bg-white">
      {isLoading ? (
        <p className="text-xs text-gray-400 py-3 text-center">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">No payment records found.</p>
      ) : (
        <>
          <div className="space-y-1.5 mt-1">
            {history.map((r) => {
              const cycleOutstanding = Number(r.amountDue ?? 0) - Number(r.amountPaid ?? 0);
              const pct = r.amountDue > 0 ? Math.round((r.amountPaid / r.amountDue) * 100) : 0;
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
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ color: cc.text, backgroundColor: cc.bg }}>
                        {cycleStatusLabel[r.status] ?? r.status?.replace(/_/g, ' ')}
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
                      {hidden ? '••••••' : `₹${Number(r.amountPaid).toLocaleString('en-IN')}`}
                      <span className="text-gray-400 font-normal"> / {hidden ? '••••••' : `₹${Number(r.amountDue).toLocaleString('en-IN')}`}</span>
                    </p>
                    {cycleOutstanding > 0 && (r.status === 'OUTSTANDING' || r.status === 'PARTIALLY_PAID') && (
                      <p className="text-xs text-red-500">{hidden ? '••••••' : `₹${cycleOutstanding.toLocaleString('en-IN')}`} pending</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500">Chit Total</span>
            <div className="text-right">
              <span className="text-sm font-semibold text-gray-800">
                {hidden ? '••••••' : `₹${totalPaid.toLocaleString('en-IN')}`}
                <span className="text-gray-400 font-normal text-xs"> paid of {hidden ? '••••••' : `₹${totalDue.toLocaleString('en-IN')}`}</span>
              </span>
              {outstanding > 0 && (
                <p className="text-xs text-red-600 font-semibold">{hidden ? '••••••' : `₹${outstanding.toLocaleString('en-IN')}`} outstanding</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Reminders Tab ───────────────────────────────────────────────────────────

function RemindersTab({ memberId, onNewReminder }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null); // "detail" expand
  const [sendAgainId, setSendAgainId] = useState(null);
  const [sendAgainInterval, setSendAgainInterval] = useState('');
  const [sendAgainTime, setSendAgainTime] = useState('09:00');

  const { data, isLoading } = useQuery({
    queryKey: ['member-reminders', memberId, page],
    queryFn: () => getRemindersForMember(memberId, { page, size: 10 }),
    enabled: !!memberId,
    staleTime: 30_000,
  });

  const { data: detail } = useQuery({
    queryKey: ['reminder-detail', expandedId],
    queryFn: () => getReminderForAdmin(expandedId),
    enabled: !!expandedId,
    staleTime: 30_000,
  });

  const cancelMut = useMutation({
    mutationFn: (reminderId) => removeReminder(reminderId),
    onSuccess: () => {
      toast.success('Reminder cancelled');
      qc.invalidateQueries({ queryKey: ['member-reminders', memberId] });
    },
    onError: () => toast.error('Failed to cancel reminder'),
  });

  const sendAgainMut = useMutation({
    mutationFn: (r) => {
      let chits = [];
      try { chits = JSON.parse(r.chitDetails ?? '[]'); } catch { /* Ignore malformed legacy metadata. */ }
      return sendReminder({
        memberProfileId: memberId,
        chits: chits.map((c) => ({
          chitId: c.chitId,
          chitName: c.chitName,
          cycleNo: c.cycleNo,
          installmentAmount: c.installmentAmount,
        })),
        message: r.message,
        repeatIntervalMinutes: sendAgainInterval && sendAgainInterval !== 'daily'
          ? Number(sendAgainInterval)
          : sendAgainInterval === 'daily' ? 1440 : null,
        reminderTime: sendAgainInterval === 'daily' ? sendAgainTime : null,
      });
    },
    onSuccess: () => {
      toast.success('Reminder sent again');
      qc.invalidateQueries({ queryKey: ['member-reminders', memberId] });
      setSendAgainId(null);
    },
    onError: () => toast.error('Failed to send reminder'),
  });

  const rows = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BellRing size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Reminders</h3>
          {(data?.totalElements ?? 0) > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {data.totalElements}
            </span>
          )}
        </div>
        <button
          onClick={onNewReminder}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg cursor-pointer"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          <BellRing size={13} /> New Reminder
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <BellRing size={32} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400 mb-3">No reminders sent yet</p>
          <button
            onClick={onNewReminder}
            className="text-sm font-semibold text-[#1E3A5F] underline cursor-pointer"
          >
            Send first reminder
          </button>
        </div>
      ) : (
        <div>
          {rows.map((r) => {
            const dot = r.readAt
              ? { color: 'bg-green-500', label: 'Read' }
              : r.seenAt
                ? { color: 'bg-yellow-400', label: 'Seen' }
                : { color: 'bg-gray-300', label: 'Sent' };
            let chits = [];
            try { chits = JSON.parse(r.chitDetails ?? '[]'); } catch { /* Ignore malformed legacy metadata. */ }
            const isExpanded = expandedId === r.id;
            const isSendAgain = sendAgainId === r.id;

            return (
              <div key={r.id} className="border-b border-gray-100 last:border-0">
                {/* Main row */}
                <div className="flex items-start gap-3 px-6 py-4">
                  {/* Status dot — click to expand detail */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="mt-1.5 flex-shrink-0 cursor-pointer"
                    title={dot.label}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${dot.color}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="text-left cursor-pointer"
                      >
                        <span className="text-sm font-semibold text-gray-900 block">
                          {chits.length > 0 ? chits.map((c) => c.chitName).join(', ') : 'Reminder'}
                        </span>
                      </button>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {new Date(r.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {r.totalAmount > 0 && (
                        <span className="text-xs text-gray-500">₹{Number(r.totalAmount).toLocaleString('en-IN')}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        r.readAt ? 'bg-green-100 text-green-700'
                          : r.seenAt ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>{dot.label}</span>
                      {r.promisedDate && (
                        <span className="text-xs text-[#1E3A5F] font-medium">
                          Promised: {new Date(r.promisedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        if (isSendAgain) {
                          setSendAgainId(null);
                        } else {
                          setSendAgainId(r.id);
                          setExpandedId(null);
                          if (r.repeatIntervalMinutes === 1440) {
                            setSendAgainInterval('daily');
                            setSendAgainTime(r.reminderTime ?? '09:00');
                          } else {
                            setSendAgainInterval(r.repeatIntervalMinutes ? String(r.repeatIntervalMinutes) : '');
                          }
                        }
                      }}
                      className="text-xs font-semibold text-[#1E3A5F] px-2.5 py-1.5 rounded-lg border border-[#C7D5E8] hover:bg-[#EEF2F8] transition-colors cursor-pointer"
                    >
                      {isSendAgain ? 'Close' : 'Send Again'}
                    </button>
                    <button
                      onClick={() => cancelMut.mutate(r.id)}
                      disabled={cancelMut.isPending}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                      title="Cancel reminder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Send Again inline panel */}
                {isSendAgain && (
                  <div className="mx-6 mb-4 p-4 bg-[#F8F9FC] rounded-lg border border-[#C7D5E8] space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Set frequency for re-send</p>
                    <select
                      value={sendAgainInterval}
                      onChange={(e) => setSendAgainInterval(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
                    >
                      {REPEAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {sendAgainInterval === 'daily' && (
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-600 flex-shrink-0">Notify at</label>
                        <input
                          type="time"
                          value={sendAgainTime}
                          onChange={(e) => setSendAgainTime(e.target.value)}
                          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
                        />
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setSendAgainId(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => sendAgainMut.mutate(r)}
                        disabled={sendAgainMut.isPending}
                        className="px-4 py-1.5 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-60"
                        style={{ backgroundColor: '#1E3A5F' }}
                      >
                        {sendAgainMut.isPending ? 'Sending…' : 'Confirm & Send'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Audit detail expand */}
                {isExpanded && detail && detail.id === r.id && (
                  <div className="mx-6 mb-4 mt-1 border border-gray-100 rounded-lg p-4 bg-gray-50 text-sm space-y-3">
                    {detail.message && (
                      <p className="text-gray-700 italic">"{detail.message}"</p>
                    )}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Trail</p>
                      <AuditEvent icon="📤" label="Sent" ts={detail.sentAt} />
                      <AuditEvent icon="👁" label="Seen (notification opened)" ts={detail.seenAt} empty="Not yet seen" />
                      <AuditEvent icon="📖" label="Read (opened in app)" ts={detail.readAt} empty="Not yet read" />
                      {(() => {
                        let history = [];
                        try { history = JSON.parse(detail.promisedDateHistory ?? '[]'); } catch { /* Ignore malformed legacy metadata. */ }
                        return history.map((h, i) => (
                          <AuditEvent
                            key={i}
                            icon="📅"
                            label={`${i === history.length - 1 ? 'Promise set' : 'Promise updated'} → ${new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            ts={h.setAt}
                          />
                        ));
                      })()}
                    </div>
                    {(() => {
                      let dc = [];
                      try { dc = JSON.parse(detail.chitDetails ?? '[]'); } catch { /* Ignore malformed legacy metadata. */ }
                      return dc.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Included Chits</p>
                          {dc.map((c, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0">
                              <span>{c.chitName}{c.cycleNo ? ` · Cycle ${c.cycleNo}` : ''}</span>
                              {c.installmentAmount && <span className="font-semibold">₹{Number(c.installmentAmount).toLocaleString('en-IN')}</span>}
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-[#1E3A5F] disabled:opacity-40 cursor-pointer">← Prev</button>
          <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-sm text-[#1E3A5F] disabled:opacity-40 cursor-pointer">Next →</button>
        </div>
      )}
    </div>
  );
}

function AuditEvent({ icon, label, ts, empty }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-gray-600 flex-1">{label}</span>
      {ts ? (
        <span className="text-gray-400 flex-shrink-0">{new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      ) : (
        <span className="text-gray-300 flex-shrink-0">{empty ?? '—'}</span>
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
  const isManager = currentUser?.role === 'MANAGER';
  const { hidden } = useHiddenAmounts();
  const [showEdit, setShowEdit] = useState(false);
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProfileHistory, setShowProfileHistory] = useState(false);
  const [showReferralEdit, setShowReferralEdit] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ['Personal', 'Enrolled Chits', 'Payments', 'Reminders'];
  const activeTab = VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'Personal';
  const setActiveTab = (tab) => setSearchParams((prev) => { prev.set('tab', tab); return prev; }, { replace: true });
  const [refSearch, setRefSearch] = useState('');
  const [refId, setRefId] = useState('');
  const [idCopied, setIdCopied] = useState(false);
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
  });

  const { data: memberCredit } = useQuery({
    queryKey: ['memberCredit', id],
    queryFn: () => getMemberCredit(id),
    enabled: !!id,
  });
  const creditBalance = Number(memberCredit?.balance ?? 0);

  const { data: userAccount } = useQuery({
    queryKey: ['memberUserAccount', member?.userId],
    queryFn: () => getUserById(member.userId),
    enabled: !!member?.userId && !!member?.hasAppAccess,
  });

  const reminderMutation = useMutation({
    mutationFn: () => sendPaymentReminder(member.userId),
    onSuccess: () => toast.success('Payment reminder sent.'),
    onError: () => toast.error('Could not send reminder.'),
  });

  const whatsappMutation = useMutation({
    mutationFn: () => sendWhatsAppReminder({
      userId: member.userId,
      phone: member.phone,
      memberName: member.fullName ?? member.name,
      outstandingAmount: totalOutstanding > 0 ? (hidden ? '••••••' : `₹${Number(totalOutstanding).toLocaleString('en-IN')}`) : '',
      chitName: '',
    }),
    onSuccess: (res) => toast.success(res?.message ?? 'WhatsApp reminder sent.'),
    onError: () => toast.error('Could not send WhatsApp message.'),
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

  const lockMemberMut = useMutation({
    mutationFn: () => lockUser(member.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberUserAccount', member.userId] });
      toast.success('Member account locked');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to lock account'),
  });

  const unlockMemberMut = useMutation({
    mutationFn: () => unlockUser(member.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberUserAccount', member.userId] });
      toast.success('Member account unlocked');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to unlock account'),
  });

  const changeRefMutation = useMutation({
    mutationFn: ({ referredById }) => updateMember({
      id,
      fullName: member.fullName,
      phone: member.phone,
      phoneCountryCode: member.phoneCountryCode,
      email: member.email ?? null,
      address: member.address ?? null,
      city: member.city ?? null,
      aadhaarLast4: member.aadhaarLast4 ?? null,
      panNumber: member.panNumber ?? null,
      bankName: member.bankName ?? null,
      bankAccountNumber: member.bankAccountNumber ?? null,
      bankIfsc: member.bankIfsc ?? null,
      notes: member.notes ?? null,
      referredById: referredById ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] });
      toast.success('Referral updated');
      setShowReferralEdit(false);
      setRefSearch('');
      setRefId('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to update referral'),
  });

  const { data: allMembersForRef = [] } = useQuery({
    queryKey: ['members-for-referral'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 500 }),
    enabled: showReferralEdit,
    staleTime: 60_000,
  });

  const { data: activeCashRequests = [] } = useQuery({
    queryKey: ['active-cash-requests'],
    queryFn: getActiveCashRequests,
    enabled: !!id,
  });
  const pendingMemberPickups = activeCashRequests.filter(
    (r) => r.memberId === id && (r.status === 'ASSIGNED' || r.status === 'PICKED_UP' || r.status === 'PENDING'),
  );

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
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Pending cash pickup banner */}
      {pendingMemberPickups.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <ClipboardList size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {pendingMemberPickups.length} pending cash pickup{pendingMemberPickups.length > 1 ? 's' : ''}
            </p>
            <div className="mt-2 space-y-1.5">
              {pendingMemberPickups.map((r) => {
                const stLabel = r.status === 'PICKED_UP'
                  ? 'Picked up — awaiting admin confirmation'
                  : r.status === 'ASSIGNED'
                  ? 'Assigned to staff — not yet picked up'
                  : 'Pending assignment';
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      r.status === 'PICKED_UP' ? 'bg-green-100 text-green-700' :
                      r.status === 'ASSIGNED'  ? 'bg-[#EEF2F8] text-[#1E3A5F]' :
                      'bg-amber-100 text-amber-700'
                    }`}>{stLabel}</span>
                    {r.requestedAmount != null && (
                      <span className="font-semibold">{hidden ? '••••••' : `₹${Number(r.requestedAmount).toLocaleString('en-IN')}`}</span>
                    )}
                    {r.chitName && <span className="text-amber-600">· {r.chitName}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <Link to="/payments" className="text-xs font-semibold text-amber-700 underline whitespace-nowrap hover:text-amber-900">
            View Pickups →
          </Link>
        </div>
      )}

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
              {/* Username tag — only shown when account exists */}
              {userAccount?.username && !isDeleted && (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  @{userAccount.username}
                </span>
              )}
              {/* Locked badge + quick unlock */}
              {userAccount?.locked && !isDeleted && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <Lock size={11} /> Locked
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
                    {hidden ? '••••••' : `₹${Number(totalOutstanding).toLocaleString('en-IN')}`} outstanding
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    No outstanding dues
                  </span>
                )
              )}
              {!isDeleted && creditBalance > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {hidden ? '••••••' : `₹${creditBalance.toLocaleString('en-IN')}`} credit
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!isDeleted && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {member?.userId && (
              <Button
                variant="secondary"
                onClick={() => {
                  // Check if a conversation already exists in the cache; if not, open in draft mode
                  // (conversation is created lazily on first message send, not on button click)
                  const cached = qc.getQueryData(['conversations']);
                  const existing = (cached?.items ?? []).find(
                    (c) => c.memberId === member.userId
                  );
                  const conversation = existing ?? { memberId: member.userId, memberName: member.fullName };
                  window.dispatchEvent(new CustomEvent('open-messages-panel', { detail: { conversation } }));
                }}
              >
                <MessageCircle size={15} /> Message
              </Button>
            )}
            <Button onClick={() => setShowEdit(true)}>
              <Edit2 size={15} /> Edit Member
            </Button>
            <MoreActionsMenu
              member={member}
              isAdmin={isAdmin}
              isManager={isManager}
              userAccount={userAccount}
              onCreateLogin={() => setShowCreateLogin(true)}
              onResetPassword={() => setShowReset(true)}
              onReminder={() => setShowReminderModal(true)}
              onWhatsApp={() => whatsappMutation.mutate()}
              onDelete={() => setShowDeleteConfirm(true)}
              onHistory={() => setShowProfileHistory(true)}
              onLock={() => lockMemberMut.mutate()}
              onUnlock={() => unlockMemberMut.mutate()}
              reminderPending={reminderMutation.isPending}
              whatsappPending={whatsappMutation.isPending}
              lockPending={lockMemberMut.isPending}
              unlockPending={unlockMemberMut.isPending}
            />
          </div>
        )}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 overflow-x-auto">
          {['Personal', 'Enrolled Chits', 'Payments', 'Reminders'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === tab
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Personal ─────────────────────────────────────────────── */}
      {activeTab === 'Personal' && (
        <div className="space-y-4 pt-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-[#1E3A5F]" />
              <h3 className="font-semibold text-gray-900">Personal Information</h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-gray-50 gap-1">
              <span className="text-sm text-gray-500 sm:w-40 flex-shrink-0">Member ID</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 font-mono break-all">{member.id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(member.id).then(() => {
                      setIdCopied(true);
                      setTimeout(() => setIdCopied(false), 2000);
                    });
                  }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1E3A5F] transition-colors flex-shrink-0"
                  title="Copy member ID"
                >
                  {idCopied ? <><Check size={13} className="text-green-600" /><span className="text-green-600">Copied</span></> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <InfoRow label="Full Name" value={member.fullName} />
            <InfoRow label="Phone" value={member.phone ? phoneDisplay : null} />
            <InfoRow label="Email" value={member.email} />
            <InfoRow label="Address" value={member.address} />
            <InfoRow label="City" value={member.city} />
            <InfoRow label="Joined" value={member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
            <InfoRow label="Aadhaar Last 4" value={member.aadhaarLast4 ? `xxxx-xxxx-${member.aadhaarLast4}` : null} />
            <InfoRow label="PAN Number" value={member.panNumber} />
            <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-gray-50 last:border-0 gap-1">
              <span className="text-sm text-gray-500 sm:w-40 flex-shrink-0 pt-0.5">Referred By</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {member.referredById ? (
                    <Link to={`/members/${member.referredById}`} className="text-sm font-medium text-[#1E3A5F] hover:underline">
                      {member.referredByName || member.referredByFullName || `Member #${String(member.referredById).slice(0,8)}`}
                    </Link>
                  ) : (
                    <NA />
                  )}
                  {!isDeleted && (
                    <button
                      type="button"
                      onClick={() => { setShowReferralEdit(v => !v); setRefSearch(''); setRefId(''); }}
                      className="text-xs font-semibold text-[#1E3A5F] underline cursor-pointer hover:text-[#2E5090] ml-1"
                    >
                      {showReferralEdit ? 'Cancel' : (member.referredById ? 'Change' : 'Add')}
                    </button>
                  )}
                </div>
                {showReferralEdit && (
                  <div className="mt-2 p-3 bg-[#EEF2F8] rounded-lg border border-[#C7D5E8] space-y-2">
                    {refId ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-[#C7D5E8]">
                        <span className="text-sm font-medium text-[#1E3A5F] flex-1">{refSearch}</span>
                        <button type="button" onClick={() => { setRefId(''); setRefSearch(''); }}
                          className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none">×</button>
                      </div>
                    ) : (
                      <>
                        <Input
                          autoFocus
                          value={refSearch}
                          onChange={(e) => { setRefSearch(e.target.value); setRefId(''); }}
                          placeholder="Search member by name…"
                        />
                        {refSearch && (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">
                            {member.referredById && (
                              <button type="button"
                                className="w-full text-left px-3 py-2.5 text-xs italic text-gray-400 hover:bg-gray-50 cursor-pointer"
                                onClick={() => { setRefId('NONE'); setRefSearch('— Remove referral —'); }}>
                                — Remove referral —
                              </button>
                            )}
                            {allMembersForRef
                              .filter((m) => m.id !== id && (m.fullName ?? '').toLowerCase().includes(refSearch.toLowerCase()))
                              .slice(0, 6)
                              .map((m) => (
                                <button key={m.id} type="button"
                                  className="w-full text-left px-3 py-2.5 hover:bg-[#EEF2F8] cursor-pointer"
                                  onClick={() => { setRefId(m.id); setRefSearch(m.fullName); }}>
                                  <span className="text-sm font-medium text-gray-800">{m.fullName}</span>
                                  {m.phone && <span className="text-xs text-gray-400 ml-2">{m.phone}</span>}
                                </button>
                              ))}
                            {allMembersForRef.filter((m) => m.id !== id && (m.fullName ?? '').toLowerCase().includes(refSearch.toLowerCase())).length === 0 && (
                              <p className="px-3 py-2.5 text-xs text-gray-400 italic">No members found</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      <Button variant="secondary" size="sm"
                        onClick={() => { setShowReferralEdit(false); setRefSearch(''); setRefId(''); }}>
                        Cancel
                      </Button>
                      <Button size="sm"
                        disabled={!refId || changeRefMutation.isPending}
                        loading={changeRefMutation.isPending}
                        onClick={() => changeRefMutation.mutate({ referredById: refId === 'NONE' ? null : refId })}>
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {member.notes && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-[#1E3A5F]" />
                <h3 className="font-semibold text-gray-900">Notes</h3>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{member.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Chits ────────────────────────────────────────────────── */}
      {activeTab === 'Enrolled Chits' && (
        <div className="pt-2">
          <ChitsTab memberId={id} />
        </div>
      )}

      {/* ── Tab: Payments ─────────────────────────────────────────────── */}
      {activeTab === 'Payments' && (
        <div className="space-y-6 pt-2">
          <PendingSettlementCard memberId={id} />
          <SettlementHistorySection memberId={id} />
          <PaymentHistorySection memberId={id} />
        </div>
      )}

      {/* ── Tab: Reminders ────────────────────────────────────────────── */}
      {activeTab === 'Reminders' && (
        <div className="pt-2">
          <RemindersTab
            memberId={id}
            onNewReminder={() => setShowReminderModal(true)}
          />
        </div>
      )}

      {/* Modals + Panels */}
      {showEdit && <EditMemberPanel member={member} onClose={() => setShowEdit(false)} />}
      {showCreateLogin && <CreateLoginModal member={member} onClose={() => setShowCreateLogin(false)} />}
      {showReset && <ResetPasswordModal member={member} onClose={() => setShowReset(false)} />}
      {showProfileHistory && (
        <Modal title="Profile Change History" onClose={() => setShowProfileHistory(false)} size="md">
          <ProfileHistorySection memberId={id} flat />
        </Modal>
      )}
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
      {showReminderModal && (
        <ReminderModal memberId={id} onClose={() => setShowReminderModal(false)} />
      )}
    </div>
  );
}
