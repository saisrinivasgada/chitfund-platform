import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  checkUsernameAvailability, updateMyUserProfile, updateMyMemberProfile, changePassword,
} from '../../services/api';
import { recordProfileChange } from '../../utils/profileHistory';
import PhoneInput from '../ui/PhoneInput';
import Button from '../ui/Button';
import {
  X, Check, Loader, AlertCircle, User, Phone, Mail, MapPin, AtSign,
  UserCircle, Lock, Eye, EyeOff, ShieldCheck,
} from 'lucide-react';

// ─── Shared styled input ──────────────────────────────────────────────────────
function Field({ label, icon: Icon, type = 'text', value, onChange, hint, placeholder, maxLength, disabled, rightSlot, error }) {
  const inputId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium"
        style={{ color: error ? '#EF4444' : focused ? '#1E3A5F' : '#374151', transition: 'color 150ms' }}
      >
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: error ? '#EF4444' : focused ? '#1E3A5F' : '#9CA3AF', transition: 'color 150ms' }}
          >
            <Icon size={15} />
          </span>
        )}
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full py-3 text-sm rounded-xl border focus:outline-none transition-all"
          style={{
            paddingLeft:  Icon      ? '2.5rem'  : '0.875rem',
            paddingRight: rightSlot ? '3rem'    : '0.875rem',
            borderColor: error ? '#EF4444' : focused ? '#1E3A5F' : '#E5E7EB',
            boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.12)' : focused ? '0 0 0 3px rgba(30,58,95,0.10)' : 'none',
            backgroundColor: disabled ? '#F9FAFB' : '#FFFFFF',
            color: disabled ? '#9CA3AF' : '#111827',
          }}
        />
        {rightSlot && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {error ? <p className="text-xs text-red-500 pl-0.5">{error}</p> : hint && <p className="text-xs text-gray-400 pl-0.5">{hint}</p>}
    </div>
  );
}

// ─── Password field with show/hide toggle ─────────────────────────────────────
function PasswordField({ label, value, onChange, hint }) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label={label}
      icon={Lock}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      hint={hint}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          tabIndex={-1}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      }
    />
  );
}

// ─── Username field with live availability check ──────────────────────────────
function UsernameField({ value, currentUsername, onChange, error }) {
  const inputId = useId();
  const [status, setStatus] = useState('idle');
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!value || value === currentUsername) { setStatus('idle'); return; }
    if (value.length < 3) { setStatus('invalid'); return; }
    setStatus('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await checkUsernameAvailability(value);
        setStatus(data.available ? 'available' : 'taken');
      } catch { setStatus('idle'); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [value, currentUsername]);

  const indicator = {
    checking:  <Loader size={13} className="animate-spin text-gray-400" />,
    available: <span className="flex items-center gap-1 text-xs font-medium text-green-600"><Check size={12} />Available</span>,
    taken:     <span className="flex items-center gap-1 text-xs font-medium text-red-500"><AlertCircle size={12} />Taken</span>,
    invalid:   <span className="text-xs text-gray-400">Min 3 chars</span>,
    idle:      null,
  }[status];

  const borderColor = error ? '#EF4444'
    : status === 'available' ? '#22C55E'
    : status === 'taken' ? '#EF4444'
    : focused ? '#1E3A5F'
    : '#E5E7EB';

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium"
        style={{ color: focused ? '#1E3A5F' : '#374151', transition: 'color 150ms' }}
      >
        Username
      </label>
      <div className="relative">
        <span
          className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: focused ? '#1E3A5F' : '#9CA3AF', transition: 'color 150ms' }}
        >
          <AtSign size={15} />
        </span>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={30}
          className="w-full py-3 text-sm rounded-xl border focus:outline-none transition-all"
          style={{
            paddingLeft: '2.5rem',
            paddingRight: '7rem',
            borderColor,
            boxShadow: focused ? '0 0 0 3px rgba(30,58,95,0.10)' : 'none',
          }}
        />
        {indicator && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">{indicator}</span>
        )}
      </div>
      {error
        ? <p className="text-xs text-red-500 pl-0.5">{error}</p>
        : <p className="text-xs text-gray-400 pl-0.5">Letters, numbers, _ and . only</p>
      }
    </div>
  );
}

// ─── Segment tab switcher ─────────────────────────────────────────────────────
function SegmentTabs({ active, onChange }) {
  const tabs = [
    { id: 'profile',  label: 'Profile',  icon: User },
    { id: 'security', label: 'Security', icon: ShieldCheck },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-gray-100">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            active === id
              ? 'bg-white shadow-sm text-[#1E3A5F]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
      <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function EditProfileModal({ onClose, role, currentUser, currentMember, userId }) {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('profile');

  // Profile fields
  const [fullName,              setFullName]              = useState(currentUser?.fullName ?? '');
  const [username,              setUsername]              = useState(currentUser?.username ?? '');
  const [email,                 setEmail]                 = useState(currentUser?.email ?? '');
  const [phone,                 setPhone]                 = useState(currentUser?.phone ?? '');
  const [phoneCountryCode,      setPhoneCountryCode]      = useState(currentUser?.phoneCountryCode ?? '+91');
  const [memberFullName,        setMemberFullName]        = useState(currentMember?.fullName ?? '');
  const [memberPhone,           setMemberPhone]           = useState(currentMember?.phone ?? '');
  const [memberPhoneCountryCode,setMemberPhoneCountryCode]= useState(currentMember?.phoneCountryCode ?? '+91');
  const [memberEmail,           setMemberEmail]           = useState(currentMember?.email ?? '');
  const [address,               setAddress]               = useState(currentMember?.address ?? '');
  const [city,                  setCity]                  = useState(currentMember?.city ?? '');

  // Security fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [profileError,  setProfileError]  = useState('');
  const [profileFe,     setProfileFe]     = useState({});
  const [securityError, setSecurityError] = useState('');
  const [profileSaved,  setProfileSaved]  = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);

  const userMutation = useMutation({
    mutationFn: updateMyUserProfile,
    onSuccess: (data) => {
      updateUser({
        name: data.fullName ?? data.username,
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        phone: data.phone,
        phoneCountryCode: data.phoneCountryCode,
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['myUserAccount'] });
    },
  });

  const memberMutation = useMutation({
    mutationFn: updateMyMemberProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myMemberProfile'] });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setSecuritySaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(onClose, 1000);
    },
    onError: (err) => {
      setSecurityError(err.response?.data?.message ?? 'Failed to change password. Check your current password.');
    },
  });

  const computeChanges = useCallback(() => {
    const cu = currentUser ?? {};
    const cm = currentMember ?? {};
    const changes = [];
    if (role !== 'MEMBER') {
      if (fullName         !== (cu.fullName         ?? ''))    changes.push({ field: 'Full Name',          from: cu.fullName         ?? '',    to: fullName });
      if (phone            !== (cu.phone            ?? ''))    changes.push({ field: 'Phone',              from: cu.phone            ?? '',    to: phone });
      if (phoneCountryCode !== (cu.phoneCountryCode ?? '+91')) changes.push({ field: 'Phone Country Code', from: cu.phoneCountryCode ?? '+91', to: phoneCountryCode });
    }
    if (username !== (cu.username ?? '')) changes.push({ field: 'Username', from: cu.username ?? '', to: username });
    if (email    !== (cu.email    ?? '')) changes.push({ field: 'Email',    from: cu.email    ?? '', to: email });
    if (role === 'MEMBER') {
      if (memberFullName !== (cm.fullName ?? '')) changes.push({ field: 'Full Name',     from: cm.fullName ?? '', to: memberFullName });
      if (memberPhone    !== (cm.phone    ?? '')) changes.push({ field: 'Phone',         from: cm.phone    ?? '', to: memberPhone });
      if (memberEmail    !== (cm.email    ?? '')) changes.push({ field: 'Contact Email', from: cm.email    ?? '', to: memberEmail });
      if (address        !== (cm.address  ?? '')) changes.push({ field: 'Address',       from: cm.address  ?? '', to: address });
      if (city           !== (cm.city     ?? '')) changes.push({ field: 'City',          from: cm.city     ?? '', to: city });
    }
    return changes;
  }, [fullName, username, email, phone, phoneCountryCode, memberFullName, memberPhone, memberEmail, address, city, currentUser, currentMember, role]);

  async function handleSaveProfile() {
    setProfileError('');
    setProfileFe({});
    try {
      const ops = [];
      const cu = currentUser ?? {};
      const userChanged = fullName !== (cu.fullName ?? '') || username !== (cu.username ?? '')
        || email !== (cu.email ?? '') || phone !== (cu.phone ?? '')
        || phoneCountryCode !== (cu.phoneCountryCode ?? '+91');
      if (userChanged) {
        ops.push(userMutation.mutateAsync({
          fullName: fullName || undefined,
          username: username || undefined,
          email: email || undefined,
          phone: phone || undefined,
          phoneCountryCode: phoneCountryCode || undefined,
        }));
      }
      if (role === 'MEMBER') {
        const cm = currentMember ?? {};
        const memberChanged = memberFullName !== (cm.fullName ?? '') || memberPhone !== (cm.phone ?? '')
          || memberPhoneCountryCode !== (cm.phoneCountryCode ?? '+91') || memberEmail !== (cm.email ?? '')
          || address !== (cm.address ?? '') || city !== (cm.city ?? '');
        if (memberChanged) {
          ops.push(memberMutation.mutateAsync({
            fullName: memberFullName || undefined,
            phone: memberPhone || undefined,
            phoneCountryCode: memberPhoneCountryCode || undefined,
            email: memberEmail || undefined,
            address: address || undefined,
            city: city || undefined,
          }));
        }
      }
      if (ops.length === 0) { onClose(); return; }
      await Promise.all(ops);
      const changes = computeChanges();
      if (userId && changes.length > 0) recordProfileChange(userId, changes);
      setProfileSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      const errors = err.response?.data?.fieldErrors;
      if (errors && Object.keys(errors).length > 0) { setProfileFe(errors); return; }
      const code = err.response?.data?.errorCode;
      const msg  = err.response?.data?.message ?? '';
      if (code === 'USER_002') { setProfileFe({ username: 'This username is already taken. Try a different one.' }); return; }
      if (code === 'USER_003') { setProfileFe({ email: 'This email is already in use by another account.' }); return; }
      if (msg.toLowerCase().includes('phone') || msg.toLowerCase().includes('number')) { setProfileFe({ phone: msg }); return; }
      setProfileError(msg || 'Failed to save changes. Please try again.');
    }
  }

  function handleChangePassword() {
    setSecurityError('');
    if (!currentPassword) { setSecurityError('Enter your current password.'); return; }
    if (newPassword.length < 8) { setSecurityError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setSecurityError('Passwords do not match.'); return; }
    passwordMutation.mutate({ currentPassword, newPassword });
  }

  const isProfileBusy = userMutation.isPending || memberMutation.isPending;
  const isSecurityBusy = passwordMutation.isPending;

  const passwordStrength = (() => {
    if (!newPassword) return null;
    let score = 0;
    if (newPassword.length >= 8)  score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 2) return { label: 'Weak',   color: '#EF4444', width: '33%' };
    if (score <= 3) return { label: 'Fair',   color: '#F59E0B', width: '60%' };
    return             { label: 'Strong', color: '#16A34A', width: '100%' };
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col border border-gray-100"
        style={{ maxWidth: '480px', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
              Account Settings
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Update your profile and security</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>

        {/* Segment tabs */}
        <div className="px-6 pb-2">
          <SegmentTabs active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-4 flex-1">

          {/* ── Profile tab ── */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <Field
                label="Full Name"
                icon={UserCircle}
                placeholder="Sai Srinivas"
                value={role === 'MEMBER' ? memberFullName : fullName}
                onChange={(v) => { (role === 'MEMBER' ? setMemberFullName : setFullName)(v); setProfileFe((f) => ({ ...f, fullName: undefined })); }}
                error={profileFe.fullName}
              />

              <UsernameField
                value={username}
                currentUsername={currentUser?.username}
                onChange={(v) => { setUsername(v); setProfileFe((f) => ({ ...f, username: undefined })); }}
                error={profileFe.username}
              />

              <Field
                label="Email"
                icon={Mail}
                type="email"
                placeholder="sai@example.com"
                value={email}
                onChange={(v) => { setEmail(v); setProfileFe((f) => ({ ...f, email: undefined })); }}
                error={profileFe.email}
              />

              {role === 'MEMBER' ? (
                <PhoneInput
                  label="Phone"
                  countryCode={memberPhoneCountryCode}
                  phone={memberPhone}
                  onCountryChange={setMemberPhoneCountryCode}
                  onPhoneChange={(v) => { setMemberPhone(v); setProfileFe((f) => ({ ...f, phone: undefined })); }}
                  error={profileFe.phone}
                />
              ) : (
                <PhoneInput
                  label="Phone"
                  countryCode={phoneCountryCode}
                  phone={phone}
                  onCountryChange={setPhoneCountryCode}
                  onPhoneChange={(v) => { setPhone(v); setProfileFe((f) => ({ ...f, phone: undefined })); }}
                  error={profileFe.phone}
                />
              )}

              {role === 'MEMBER' && (
                <>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Contact Details</p>
                    <div className="space-y-4">
                      <Field
                        label="Contact Email"
                        icon={Mail}
                        type="email"
                        placeholder="sai@example.com"
                        value={memberEmail}
                        onChange={setMemberEmail}
                        hint="Shown to your admin — separate from login email"
                      />
                      <Field label="Street / Area" icon={MapPin} placeholder="123 MG Road, Hyderabad" value={address} onChange={setAddress} />
                      <Field label="City" placeholder="Hyderabad" value={city} onChange={setCity} />
                    </div>
                  </div>
                </>
              )}

              <ErrorBanner message={profileError} />
            </div>
          )}

          {/* ── Security tab ── */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border" style={{ backgroundColor: '#EEF2F8', borderColor: '#B8CCE4' }}>
                <ShieldCheck size={15} color="#1E3A5F" className="flex-shrink-0 mt-0.5" />
                <p className="text-sm" style={{ color: '#1E3A5F' }}>
                  Choose a strong password you don't use anywhere else.
                </p>
              </div>

              <PasswordField
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />

              <div className="space-y-1.5">
                <PasswordField
                  label="New Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  hint="Minimum 8 characters"
                />
                {passwordStrength && (
                  <div className="flex items-center gap-3 pt-0.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: passwordStrength.width, backgroundColor: passwordStrength.color }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <PasswordField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                hint={
                  confirmPassword && newPassword !== confirmPassword
                    ? 'Passwords do not match'
                    : confirmPassword && newPassword === confirmPassword
                    ? 'Passwords match'
                    : undefined
                }
              />

              <ErrorBanner message={securityError} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>

          {activeTab === 'profile' && (
            <Button
              variant={profileSaved ? 'success' : 'primary'}
              size="md"
              loading={isProfileBusy}
              disabled={profileSaved}
              onClick={handleSaveProfile}
            >
              {profileSaved ? <><Check size={14} /> Saved</> : 'Save Changes'}
            </Button>
          )}

          {activeTab === 'security' && (
            <Button
              variant={securitySaved ? 'success' : 'primary'}
              size="md"
              loading={isSecurityBusy}
              disabled={securitySaved || !currentPassword || !newPassword || !confirmPassword}
              onClick={handleChangePassword}
            >
              {securitySaved ? <><Check size={14} /> Password Changed</> : 'Update Password'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
