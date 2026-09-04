import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listStaff, createStaff, deactivateStaff, activateStaff, softDeleteStaff,
  getOrgSettings, updateOrgDetails, sendSupportNumberOtp, verifySupportNumber,
  getMyTenantLimits, getOrgReservations, realizeOrgPayout,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner, ListSkeleton } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  Plus, Briefcase, UserCheck, UserX, Trash2, Shield, User, Mail, AtSign,
  Copy, Check, AlertTriangle, Users, Building2, Pencil, CheckCircle,
  ArrowLeft, ChevronRight,
} from 'lucide-react';
import PhoneOtpVerifier from '../../components/ui/PhoneOtpVerifier';
import { usePlanLimitHandler } from '../../components/ui/PlanLimitModal';

const ROLE_BADGE = {
  ADMIN:   { label: 'Admin',   variant: 'default' },
  STAFF:   { label: 'Staff',   variant: 'success' },
  MANAGER: { label: 'Manager', variant: 'warning' },
  AGENT:   { label: 'Agent',   variant: 'info' },
};

const INITIAL_FORM = { username: '', email: '', fullName: '', phone: '', phoneCountryCode: '+91', role: 'STAFF' };

const ROLE_OPTIONS = [
  {
    value: 'STAFF',
    label: 'Staff',
    desc: 'Collects cash in the field',
    icon: UserCheck,
    color: '#16A34A',
    bg: '#F0FDF4',
    border: '#BBF7D0',
  },
  {
    value: 'MANAGER',
    label: 'Manager',
    desc: 'Operations oversight, no system edits',
    icon: Briefcase,
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    desc: 'Full platform access',
    icon: Shield,
    color: '#1E3A5F',
    bg: '#EFF3F8',
    border: '#BFCFDE',
  },
];

function StyledInput({ icon: Icon, error, ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 flex items-center" style={{ left: '0.75rem' }}>
          <Icon size={15} />
        </span>
      )}
      <input
        className={`w-full py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 transition-all text-gray-900 placeholder-gray-400 ${
          error ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#1E3A5F]/20'
        }`}
        style={{
          paddingLeft: Icon ? '2.25rem' : '0.875rem',
          paddingRight: '0.875rem',
        }}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function CopyBothButton({ username, password }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const text = `Username: ${username}\nPassword: ${password}`;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand('copy'); document.body.removeChild(el); done();
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5 text-sm font-semibold text-gray-500 hover:text-[#1E3A5F] transition-all"
    >
      {copied ? <><Check size={15} className="text-green-500" /> Copied!</> : <><Copy size={15} /> Copy Username & Password</>}
    </button>
  );
}

function CredentialRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, done));
    } else {
      fallbackCopy(value, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand('copy'); document.body.removeChild(el); done();
  }
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-gray-500 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${mono ? 'font-mono tracking-wide text-[#1E3A5F]' : 'text-gray-900'}`}>
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          title="Copy"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, allowedRoles }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { tenantPlan } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [tempPass, setTempPass] = useState(null);
  const [fe, setFe] = useState({});
  const [phoneVerified, setPhoneVerified] = useState(false);
  const { handleError: handlePlanError, modal: planModal } = usePlanLimitHandler(tenantPlan);

  const availableRoles = ROLE_OPTIONS.filter((r) => allowedRoles.includes(r.value));

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setTempPass(data.tempPassword ?? null);
      const label = ROLE_OPTIONS.find((r) => r.value === form.role)?.label ?? form.role;
      toast.success(`${label} account created`);
    },
    onError: (err) => {
      if (handlePlanError(err)) return;
      const errors = err.response?.data?.fieldErrors;
      if (errors && Object.keys(errors).length > 0) { setFe(errors); return; }
      const code = err.response?.data?.errorCode;
      const msg  = err.response?.data?.message ?? '';
      if (code === 'USER_002') { setFe({ username: 'This username is already taken. Try a different one.' }); return; }
      if (code === 'USER_003') { setFe({ email: 'This email is already in use by another account.' }); return; }
      if (msg.toLowerCase().includes('number exists')) { setFe({ phone: 'A staff account with this mobile number already exists.' }); return; }
      toast.error(msg || 'Failed to create account');
    },
  });

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); setFe((f) => ({ ...f, [key]: undefined })); }

  if (tempPass) {
    return (
      <Modal title="Account Created" onClose={onClose} size="sm">
        <div className="space-y-5">
          <div className="flex flex-col items-center pt-2 pb-1 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <Check size={28} className="text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">Ready to go!</p>
              <p className="text-sm text-gray-400 mt-0.5">Share these credentials with the new team member.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden bg-gray-50">
            <CredentialRow label="Username" value={form.username} />
            <CredentialRow label="Temp Password" value={tempPass} mono />
          </div>
          <CopyBothButton username={form.username} password={tempPass} />
          <p className="text-xs text-center text-gray-400">
            The temporary password expires after first login.
          </p>
          <Button variant="primary" size="md" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <>
    {planModal}
    <Modal title="Add Team Member" onClose={onClose} size="md">
      <form onSubmit={(e) => { e.preventDefault(); setFe({}); mutation.mutate(form); }} className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Role</p>
            <Link
              to="/roles"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#1E3A5F] hover:underline font-medium"
            >
              What can each role do? →
            </Link>
          </div>
          <div className={`grid gap-3 ${availableRoles.length === 1 ? 'grid-cols-1' : availableRoles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {availableRoles.map((r) => {
              const Icon = r.icon;
              const active = form.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set('role', r.value)}
                  className="flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 text-center transition-all cursor-pointer"
                  style={{
                    borderColor: active ? r.color : '#E5E7EB',
                    backgroundColor: active ? r.bg : '#FAFAFA',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: active ? r.color : '#F3F4F6' }}
                  >
                    <Icon size={16} style={{ color: active ? '#fff' : '#9CA3AF' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: active ? r.color : '#374151' }}>
                      {r.label}
                    </p>
                    <p className="text-[11px] leading-snug mt-0.5" style={{ color: active ? r.color : '#9CA3AF' }}>
                      {r.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {form.role === 'ADMIN' && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Admin accounts have full platform access including creating other staff and managing all data. Only add trusted team members.
            </p>
          </div>
        )}
        <br></br>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
          <StyledInput
            icon={User}
            placeholder="Sai Srinivas"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={fe.fullName}
            required
          />
        </div>

        <PhoneOtpVerifier
          label="Mobile Number *"
          phone={form.phone}
          countryCode={form.phoneCountryCode}
          originalPhone={null}
          onPhoneChange={(v) => { set('phone', v); setPhoneVerified(false); }}
          onCountryChange={(code) => set('phoneCountryCode', code)}
          onVerified={setPhoneVerified}
          fieldError={fe.phone}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Username <span className="text-red-500">*</span></label>
          <StyledInput
            icon={AtSign}
            placeholder="sai.staff"
            value={form.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            error={fe.username}
            required
          />
          {!fe.username && <p className="text-xs text-gray-400 pl-0.5">Letters, numbers, _ and . only</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <StyledInput
            icon={Mail}
            type="email"
            placeholder="sai@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={fe.email}
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="muted" onClick={onClose} size="md">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            loading={mutation.isPending}
            disabled={!!form.phone && !phoneVerified}
            size="md"
            title={form.phone && !phoneVerified ? 'Verify the phone number first' : undefined}
          >
            Create Account
          </Button>
        </div>
      </form>
    </Modal>
    </>
  );
}

function CopyableField({ label, value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(done).catch(() => {
        const el = document.createElement('textarea');
        el.value = value; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(el); el.focus(); el.select();
        document.execCommand('copy'); document.body.removeChild(el); done();
      });
    }
  }
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-mono font-semibold text-gray-700 truncate">{value}</p>
        <button
          type="button"
          onClick={copy}
          className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer flex-shrink-0"
          title="Copy"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

function OrgSlotCard({ slot, onRealize, isRealizing }) {
  const isRealized = slot.status === 'PROCESSED';
  const date = slot.reservationMonth
    ? new Date(slot.reservationMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '—';
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${isRealized ? 'bg-gray-50 border-gray-100' : 'border-[#1E3A5F]/20 bg-[#EEF2F8]/30'}`}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: isRealized ? '#6B7280' : '#1E3A5F' }}
      >
        D{slot.monthNumber}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{slot.chitName ?? 'Unknown Chit'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Draw #{slot.monthNumber} · {date}
          {slot.payoutAmount ? ` · ₹${Number(slot.payoutAmount).toLocaleString('en-IN')}` : ''}
        </p>
        {isRealized && slot.updatedAt && (
          <p className="text-xs text-green-600 mt-0.5">
            Realized {new Date(slot.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        {isRealized ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            <CheckCircle size={11} /> Realized
          </span>
        ) : slot.eligibleToRealize ? (
          <Button
            variant="primary"
            size="sm"
            disabled={isRealizing}
            onClick={() => {
              if (window.confirm(`Realize ₹${Number(slot.payoutAmount).toLocaleString('en-IN')} payout for Draw #${slot.monthNumber} to treasury?\n\nThis marks the slot as processed. No cash movement occurs.`)) {
                onRealize(slot);
              }
            }}
          >
            Realize to Treasury
          </Button>
        ) : (
          <span className="text-xs text-gray-400 px-2 py-1">Pending draw</span>
        )}
      </div>
    </div>
  );
}

function OrgHoldingsSection() {
  const qc = useQueryClient();
  const toast = useToastContext();

  const { data: orgSlots = [], isLoading: orgLoading } = useQuery({
    queryKey: ['org-reservations'],
    queryFn: getOrgReservations,
    staleTime: 30_000,
  });

  const realizeMut = useMutation({
    mutationFn: realizeOrgPayout,
    onSuccess: () => {
      toast.success('Payout realized to treasury');
      qc.invalidateQueries({ queryKey: ['org-reservations'] });
    },
    onError: (e) => {
      toast.error(e.response?.data?.message ?? 'Failed to realize payout');
    },
  });

  const activeSlots = orgSlots.filter((s) => s.status === 'RESERVED');
  const realizedSlots = orgSlots.filter((s) => s.status === 'PROCESSED');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={18} className="text-[#1E3A5F]" />
        <h3 className="font-semibold text-gray-900">Organization Holdings</h3>
        {orgSlots.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{orgSlots.length} slot{orgSlots.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      {orgLoading ? (
        <PageSpinner />
      ) : orgSlots.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No organization-held slots yet.</p>
      ) : (
        <div className="space-y-3">
          {activeSlots.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active · {activeSlots.length}</p>
              <div className="space-y-2">
                {activeSlots.map((s) => (
                  <OrgSlotCard
                    key={s.id}
                    slot={s}
                    onRealize={(slot) => realizeMut.mutate({ chitId: slot.chitId, reservationId: slot.id })}
                    isRealizing={realizeMut.isPending}
                  />
                ))}
              </div>
            </div>
          )}
          {realizedSlots.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Realized · {realizedSlots.length}</p>
              <div className="space-y-2">
                {realizedSlots.map((s) => (
                  <OrgSlotCard key={s.id} slot={s} onRealize={() => {}} isRealizing={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrgDetailsSection({ isAdmin }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { tenantId } = useAuth();

  const { data: orgSettings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: getOrgSettings,
    staleTime: 60_000,
  });

  const [editingName, setEditingName] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [editingReg, setEditingReg] = useState(false);
  const [orgRegNum, setOrgRegNum] = useState('');

  const [changingPhone, setChangingPhone] = useState(false);
  const [supportPhone, setSupportPhone] = useState('');
  const [supportOtpSent, setSupportOtpSent] = useState(false);
  const [supportOtp, setSupportOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const orgDetailsMut = useMutation({
    mutationFn: updateOrgDetails,
    onSuccess: () => {
      toast.success('Saved');
      setEditingName(false);
      setEditingReg(false);
      qc.invalidateQueries({ queryKey: ['org-settings'] });
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to update'),
  });

  async function handleSendSupportOtp() {
    if (!supportPhone.trim()) return;
    setOtpLoading(true);
    try {
      await sendSupportNumberOtp(supportPhone.trim());
      setSupportOtpSent(true);
      toast.success('OTP sent to ' + supportPhone);
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifySupportOtp() {
    if (!supportOtp.trim()) return;
    setOtpLoading(true);
    try {
      await verifySupportNumber(supportPhone.trim(), supportOtp.trim());
      toast.success('Support number saved');
      setSupportPhone(''); setSupportOtp(''); setSupportOtpSent(false); setChangingPhone(false);
      qc.invalidateQueries({ queryKey: ['org-settings'] });
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Invalid OTP');
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Building2 size={18} className="text-[#1E3A5F]" />
        <h2 className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Merriweather, serif' }}>My Organization</h2>
      </div>

      <div className="space-y-5">
        {/* Admin-only: Org ID */}
        {isAdmin && tenantId && (
          <CopyableField label="Organization ID" value={tenantId} />
        )}

        {/* Admin-only: Org Name */}
        {isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400">Organization Name</p>
              {!editingName && (
                <button
                  onClick={() => { setOrgName(orgSettings?.name ?? ''); setEditingName(true); }}
                  className="text-xs font-medium text-[#1E3A5F] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                />
                <button
                  onClick={() => orgDetailsMut.mutate({ orgName: orgName.trim(), businessRegNumber: orgSettings?.businessRegNumber ?? '' })}
                  disabled={!orgName.trim() || orgDetailsMut.isPending}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {orgDetailsMut.isPending ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer">Cancel</button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-900">{orgSettings?.name ?? '—'}</p>
            )}
          </div>
        )}

        {/* Admin-only: Registration Number */}
        {isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400">Registration Number <span className="font-normal text-gray-300">(optional)</span></p>
              {!editingReg && (
                <button
                  onClick={() => { setOrgRegNum(orgSettings?.businessRegNumber ?? ''); setEditingReg(true); }}
                  className="text-xs font-medium text-[#1E3A5F] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
            {editingReg ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={orgRegNum}
                  onChange={e => setOrgRegNum(e.target.value)}
                  placeholder="e.g. LLPIN AA-1234 or CIN U12345..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                />
                <button
                  onClick={() => orgDetailsMut.mutate({ orgName: orgSettings?.name ?? '', businessRegNumber: orgRegNum.trim() })}
                  disabled={orgDetailsMut.isPending}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {orgDetailsMut.isPending ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingReg(false)} className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer">Cancel</button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {orgSettings?.businessRegNumber || <span className="text-gray-400 font-normal">Not set</span>}
              </p>
            )}
          </div>
        )}

        {/* Support Phone — admin and manager */}
        <div className={isAdmin ? 'border-t border-gray-100 pt-4' : ''}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">Support Phone Number</p>
            {!changingPhone && (
              <button
                onClick={() => { setSupportPhone(''); setSupportOtpSent(false); setSupportOtp(''); setChangingPhone(true); }}
                className="text-xs font-medium text-[#1E3A5F] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Pencil size={11} /> {orgSettings?.supportPhoneNumber ? 'Change' : 'Add'}
              </button>
            )}
          </div>
          {!changingPhone ? (
            <p className="text-sm font-semibold text-gray-900">
              {orgSettings?.supportPhoneNumber
                ? <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-green-500" />{orgSettings.supportPhoneNumber}</span>
                : <span className="text-gray-400 font-normal">Not set · members won't see a support button</span>
              }
            </p>
          ) : (
            <div className="space-y-2 mt-2">
              <p className="text-xs text-gray-400">Members and staff will see this number to call or message you for support.</p>
              {!supportOtpSent ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={supportPhone}
                    onChange={e => setSupportPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                  />
                  <button
                    onClick={handleSendSupportOtp}
                    disabled={!supportPhone.trim() || otpLoading}
                    className="px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40 whitespace-nowrap cursor-pointer"
                    style={{ backgroundColor: '#1E3A5F' }}
                  >
                    {otpLoading ? 'Sending…' : 'Send OTP'}
                  </button>
                  <button onClick={() => setChangingPhone(false)} className="text-xs text-gray-400 hover:text-gray-700 px-2 cursor-pointer">Cancel</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Enter the OTP sent to <strong>{supportPhone}</strong></p>
                  <div className="flex gap-2">
                    <input
                      value={supportOtp}
                      onChange={e => setSupportOtp(e.target.value)}
                      placeholder="6-digit OTP"
                      maxLength={6}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                    />
                    <button
                      onClick={handleVerifySupportOtp}
                      disabled={!supportOtp.trim() || otpLoading}
                      className="px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40 cursor-pointer"
                      style={{ backgroundColor: '#1E3A5F' }}
                    >
                      {otpLoading ? 'Verifying…' : 'Verify & Save'}
                    </button>
                    <button onClick={() => { setSupportOtpSent(false); setSupportOtp(''); setChangingPhone(false); }} className="text-xs text-gray-400 hover:text-gray-700 px-2 cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyOrgPage() {
  const navigate = useNavigate();
  const toast = useToastContext();
  const { user: currentUser, tenantName, planExpiresAt } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();
  const qc = useQueryClient();
  const [view, setView] = useState('org'); // 'org' | 'team'
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', { deleted: showDeleted }],
    queryFn: () => listStaff({ deleted: showDeleted }),
  });

  const { data: limits } = useQuery({
    queryKey: ['myTenantLimits'],
    queryFn: getMyTenantLimits,
    staleTime: 60_000,
  });

  const activeStaffCount = staff.filter((s) => !s.deletedAt && s.enabled && (s.role === 'MANAGER' || s.role === 'STAFF')).length;
  const maxStaff = limits?.maxStaff ?? null;

  const toggleMutation = useMutation({
    mutationFn: ({ type, id }) =>
      type === 'deactivate' ? deactivateStaff(id) : activateStaff(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(vars.type === 'deactivate' ? 'Account deactivated' : 'Account reactivated');
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Action failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }) => softDeleteStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff account deleted');
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Delete failed');
    },
  });

  // Roles a manager/admin can add
  const allowedRoles = isAdmin ? ['STAFF', 'MANAGER', 'ADMIN'] : ['STAFF'];

  const visibleStaff = isManager ? staff.filter((s) => s.role !== 'ADMIN') : staff;

  // ── Org view ─────────────────────────────────────────────────────────────
  if (view === 'org') {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        {(isAdmin || isManager) && <OrgDetailsSection isAdmin={isAdmin} />}
        {isAdmin && <OrgHoldingsSection />}

        {/* Team entry button */}
        <button
          onClick={() => setView('team')}
          className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-[#1E3A5F]/40 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EFF3F8] flex items-center justify-center">
              <Users size={17} className="text-[#1E3A5F]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Team</p>
              <p className="text-xs text-gray-400">
                {isManager ? 'View and manage staff' : 'Manage admins, managers and staff'}
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400 group-hover:text-[#1E3A5F] transition-colors" />
        </button>
      </div>
    );
  }

  // ── Team view ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Back to org */}
      <button
        onClick={() => { setView('org'); setShowDeleted(false); }}
        className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1E3A5F] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} /> Back to My Organization
      </button>

      {/* Team section header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Team
          </h1>
          {tenantName && (
            <p className="text-base font-semibold text-gray-700 mt-0.5">{tenantName}</p>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {isManager ? 'View managers and staff' : 'Manage admins, managers and staff'}
          </p>
          {maxStaff !== null && maxStaff !== -1 && (
            <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
              activeStaffCount >= maxStaff
                ? 'bg-red-50 text-red-600 border border-red-200'
                : activeStaffCount >= maxStaff - 1
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              <Users size={12} />
              {activeStaffCount} / {maxStaff} staff slots used
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Button
              variant={showDeleted ? 'danger' : 'secondary'}
              onClick={() => setShowDeleted((v) => !v)}
            >
              <Trash2 size={14} />
              {showDeleted ? 'Show Active' : 'Show Deleted'}
            </Button>
          )}
          {!showDeleted && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowAdd(true)}
              disabled={isExpired || (maxStaff !== null && maxStaff !== -1 && activeStaffCount >= maxStaff)}
              title={
                isExpired
                  ? 'Plan expired — renew to add team members'
                  : maxStaff !== null && maxStaff !== -1 && activeStaffCount >= maxStaff
                  ? `Staff limit reached (${maxStaff} max on this plan)`
                  : undefined
              }
            >
              <Plus size={16} className="mr-1.5" />
              Add Team Member
            </Button>
          )}
        </div>
      </div>

      {isLoading ? <ListSkeleton rows={5} cols={4} /> : visibleStaff.length === 0 ? (
        <EmptyState
          icon={showDeleted ? Trash2 : Briefcase}
          title={showDeleted ? 'No deleted staff' : 'No team members yet'}
          message={
            showDeleted
              ? 'No staff accounts have been deleted yet.'
              : 'Add staff and managers to start assigning cash collection tasks.'
          }
          action={!showDeleted ? 'Add first member' : undefined}
          onAction={!showDeleted && !isExpired ? () => setShowAdd(true) : undefined}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <br></br>
          <Table columns={['Name', 'Username', 'Role', 'Status', 'Actions']}>
            {visibleStaff.map((s) => {
              const roleCfg = ROLE_BADGE[s.role] ?? { label: s.role, variant: 'default' };
              const isActive = s.enabled && !s.locked;
              const isSelf = s.id === currentUser?.id;
              const isDeleted = !!s.deletedAt;
              // Manager can only act on STAFF; admin can act on anyone
              const canAct = !isDeleted && !isSelf && (isAdmin || (isManager && s.role === 'STAFF'));
              return (
                <Tr
                  key={s.id}
                  className={isDeleted ? 'opacity-60' : ''}
                  onClick={() => !isDeleted && navigate(`/staff/${s.id}`)}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isDeleted ? 'bg-gray-400' : ''}`}
                        style={isDeleted ? {} : { backgroundColor: '#1E3A5F' }}
                      >
                        {(s.fullName ?? s.username ?? 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {isSelf ? (
                            <span className="text-sm font-medium" style={{ color: '#1E3A5F' }}>
                              {s.fullName ?? s.username}
                            </span>
                          ) : (
                            <Link
                              to={`/staff/${s.id}`}
                              className={`text-sm font-medium hover:underline ${isDeleted ? 'line-through text-gray-400' : ''}`}
                              style={isDeleted ? {} : { color: '#1E3A5F' }}
                            >
                              {s.fullName ?? s.username}
                            </Link>
                          )}
                          {isSelf && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EFF3F8] text-[#1E3A5F]">
                              You
                            </span>
                          )}
                        </div>
                        {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                        {isDeleted && s.deletedAt && (
                          <p className="text-xs text-red-400">
                            Deleted {new Date(s.deletedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-sm text-gray-700">{s.username}</span>
                  </Td>
                  <Td>
                    <Badge variant={roleCfg.variant}>{roleCfg.label}</Badge>
                  </Td>
                  <Td>
                    {isDeleted ? (
                      <Badge variant="danger">Deleted</Badge>
                    ) : (
                      <Badge variant={isActive ? 'success' : 'danger'}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    {canAct ? (
                      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {isActive ? (
                          <Button
                            variant="muted"
                            size="sm"
                            onClick={() => setConfirmAction({ type: 'deactivate', staff: s })}
                          >
                            <UserX size={14} className="mr-1" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => setConfirmAction({ type: 'activate', staff: s })}
                          >
                            <UserCheck size={14} className="mr-1" />
                            Reactivate
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmAction({ type: 'delete', staff: s })}
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </div>
      )}

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} allowedRoles={allowedRoles} />}

      {confirmAction && (
        <ConfirmDialog
          variant={confirmAction.type === 'delete' || confirmAction.type === 'deactivate' ? 'danger' : 'primary'}
          title={
            confirmAction.type === 'delete'
              ? 'Delete Staff Account'
              : confirmAction.type === 'deactivate'
              ? 'Deactivate Account'
              : 'Reactivate Account'
          }
          description={
            confirmAction.type === 'delete'
              ? `This will permanently mark ${confirmAction.staff.fullName ?? confirmAction.staff.username}'s account as deleted. The record is kept but the account cannot be used.`
              : confirmAction.type === 'deactivate'
              ? `${confirmAction.staff.fullName ?? confirmAction.staff.username} will no longer be able to log in.`
              : `${confirmAction.staff.fullName ?? confirmAction.staff.username} will regain access immediately.`
          }
          actionLabel={
            confirmAction.type === 'delete'
              ? 'Delete Account'
              : confirmAction.type === 'deactivate'
              ? 'Deactivate'
              : 'Reactivate'
          }
          loading={toggleMutation.isPending || deleteMutation.isPending}
          onConfirm={() =>
            confirmAction.type === 'delete'
              ? deleteMutation.mutate({ id: confirmAction.staff.id })
              : toggleMutation.mutate({ type: confirmAction.type, id: confirmAction.staff.id })
          }
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
