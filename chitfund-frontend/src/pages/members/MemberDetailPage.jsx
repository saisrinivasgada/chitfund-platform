import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMember, getMembers, updateMember, patchMemberStatus, getChitsForMember,
  getPaymentHistory, getMemberTotalBalance, getMemberBalance, getMemberCredit,
  resendSetupLink, resetMemberPassword, getUserById, sendPaymentReminder, sendWhatsAppReminder,
  softDeleteMember, getMemberAuditHistory, getActiveCashRequests, lockUser, unlockUser,
  getMemberSettlements, recordSettlementTransaction, voidSettlement,
  getMemberPaymentHistoryByChit, createMemberLogin, linkMemberUser, checkUsernameAvailability,
  adminUpdateUserPhone,
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
import PhoneOtpVerifier from '../../components/ui/PhoneOtpVerifier';
import {
  ArrowLeft, Edit2, User, Building2, FileText, History, AlertTriangle,
  UserPlus, ShieldCheck, KeyRound, Eye, Copy, Check, BellRing, Trash2,
  ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Wallet, MessageCircle, HandCoins,
  Layers, ExternalLink, ClipboardList, TrendingUp, TrendingDown, ArrowRight, Banknote,
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
             style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' }}>
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
  PENDING:   { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Pending' },
  DRAFT:     { text: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', label: 'Draft' },
};

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
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer text-left group"
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
                  {chit.totalMembers && (
                    <span>{chit.totalMembers} members</span>
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
                    PAYOUT_DEDUCTED:    { text: '#7C3AED', bg: '#F5F3FF' },
                    SETTLEMENT_CLEARED: { text: '#0F766E', bg: '#F0FDFA' },
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#EFF6FF] text-blue-700 font-medium">{log.actorRole}</span>
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
    PAYOUT_DEDUCTED:    'text-purple-700 bg-purple-50',
    SETTLEMENT_CLEARED: 'text-teal-700 bg-teal-50',
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
  const pendingOnes = settlements.filter((s) => !TERMINAL.has(s.paymentStatus));

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
      toast.success('Settlement voided — payment records reverted to Outstanding');
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
  const hasActive = settlements.some((s) => !TERMINAL.includes(s.paymentStatus));
  const [collapsed, setCollapsed] = useState(!hasActive);
  const statusCfg = {
    PENDING:              { bg: 'bg-amber-100', text: 'text-amber-700',  label: 'Pending' },
    PARTIALLY_COLLECTED:  { bg: 'bg-blue-100',  text: 'text-blue-700',   label: 'Partial (Collect)' },
    PARTIALLY_DISBURSED:  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Partial (Pay)' },
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
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
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
          const isTerminal = TERMINAL.includes(s.paymentStatus);
          const isVoided = s.paymentStatus === 'VOIDED';
          const cfg = statusCfg[s.paymentStatus] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: s.paymentStatus };
          const isOpen = activeId === s.id;
          const isExpanded = expandedSettlement === s.id;

          return (
            <div key={s.id} className={isVoided ? 'opacity-60' : ''}>
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
                      <span className="font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
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
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      {isOpen ? 'Cancel' : 'Record Payment'}
                    </button>
                  )}
                  {!isVoided && (
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
                      PAYOUT_DEDUCTED:    { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Deducted' },
                      SETTLEMENT_CLEARED: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Settlement Cleared' },
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
                <div className="mx-6 mb-3 px-4 py-2.5 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-between text-xs">
                  <span className="text-purple-700 font-medium">Credit balance applied at settlement</span>
                  <span className="font-bold text-purple-800">
                    −{hidden ? '••••••' : `₹${Number(s.creditApplied).toLocaleString('en-IN')}`}
                  </span>
                </div>
              )}

              {/* Inline payment form */}
              {isOpen && (
                <div className="mx-6 mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs font-semibold text-blue-800 mb-3">
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
          description="This will void the settlement and revert all SETTLEMENT_CLEARED payment records to Outstanding. The member can be re-settled after voiding. This cannot be undone."
          actionLabel="Void Settlement"
          loading={voidMutation.isPending}
          onConfirm={() => voidMutation.mutate(voidId)}
          onClose={() => setVoidId(null)}
        />
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
                      r.status === 'ASSIGNED'  ? 'bg-blue-100 text-blue-700' :
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
              onReminder={() => reminderMutation.mutate()}
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

      {/* Info Cards */}
      <div>
        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-[#1E3A5F]" />
            <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
              Personal Information
            </h3>
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
                    className="text-xs font-semibold text-[#1E3A5F] underline cursor-pointer hover:text-blue-700 ml-1"
                  >
                    {showReferralEdit ? 'Cancel' : (member.referredById ? 'Change' : 'Add')}
                  </button>
                )}
              </div>

              {showReferralEdit && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                  {refId ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
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
                                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 cursor-pointer"
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

      {/* Enrolled Chits */}
      <EnrolledChitsSection memberId={id} />

      {/* Balances */}
      <BalancesSection memberId={id} />

      {/* Credit Balance Card */}
      {!isDeleted && creditBalance > 0 && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
              <Banknote size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Credit Balance</p>
              <p className="text-2xl font-bold text-emerald-700 mt-0.5">
                {hidden ? '••••••' : `₹${creditBalance.toLocaleString('en-IN')}`}
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Will auto-apply to any outstanding dues when next payment is recorded.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/payments?memberId=${id}`)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              Apply <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Pending Settlement Quick-Action Card */}
      <PendingSettlementCard memberId={id} />

      {/* Settlement History + payment collection */}
      <SettlementHistorySection memberId={id} />

      {/* Payment History */}
      <PaymentHistorySection memberId={id} />

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
    </div>
  );
}
