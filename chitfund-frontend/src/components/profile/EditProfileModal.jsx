import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checkUsernameAvailability, updateMyUserProfile, updateMyMemberProfile } from '../../services/api';
import { recordProfileChange } from '../../utils/profileHistory';
import PhoneInput from '../ui/PhoneInput';
import Button from '../ui/Button';
import { X, Check, Loader, AlertCircle, User, Phone, Mail, MapPin, AtSign, UserCircle } from 'lucide-react';

// ─── Labeled input ────────────────────────────────────────────────────────────
function FloatField({ label, icon: Icon, type = 'text', value, onChange, hint, maxLength, disabled, rightSlot }) {
  const inputId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-medium mb-1.5"
        style={{ color: focused ? '#1E3A5F' : '#6B7280', transition: 'color 150ms' }}
      >
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: focused ? '#1E3A5F' : '#9CA3AF', transition: 'color 150ms' }}
          >
            <Icon size={14} />
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
          className={`w-full ${Icon ? 'pl-9' : 'pl-3'} ${rightSlot ? 'pr-28' : 'pr-3'} py-2.5 text-sm rounded-xl border focus:outline-none`}
          style={{
            borderColor: focused ? '#1E3A5F' : '#E5E7EB',
            boxShadow: focused ? '0 0 0 3px rgba(30,58,95,0.08)' : 'none',
            backgroundColor: disabled ? '#F9FAFB' : '#FFFFFF',
            color: disabled ? '#9CA3AF' : '#111827',
            transition: 'border-color 150ms, box-shadow 150ms',
          }}
        />
        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {hint && <p className="mt-1 pl-1 text-xs" style={{ color: '#9CA3AF' }}>{hint}</p>}
    </div>
  );
}

// ─── Username field with availability check ───────────────────────────────────
function UsernameField({ value, currentUsername, onChange }) {
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
    checking: <Loader size={13} className="animate-spin" style={{ color: '#9CA3AF' }} />,
    available: <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16A34A' }}><Check size={12} />Available</span>,
    taken: <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#DC2626' }}><AlertCircle size={12} />Taken</span>,
    invalid: <span className="text-xs" style={{ color: '#9CA3AF' }}>Min 3 chars</span>,
    idle: null,
  }[status];

  const borderColor = status === 'available' ? '#22C55E'
    : status === 'taken' ? '#EF4444'
    : focused ? '#1E3A5F'
    : '#E5E7EB';

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-medium mb-1.5"
        style={{ color: focused ? '#1E3A5F' : '#6B7280', transition: 'color 150ms' }}
      >
        Username
      </label>
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: focused ? '#1E3A5F' : '#9CA3AF', transition: 'color 150ms' }}
        >
          <AtSign size={14} />
        </span>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={30}
          className="w-full pl-9 pr-28 py-2.5 text-sm rounded-xl border focus:outline-none"
          style={{
            borderColor,
            boxShadow: focused ? '0 0 0 3px rgba(30,58,95,0.08)' : 'none',
            transition: 'border-color 150ms, box-shadow 150ms',
          }}
        />
        {indicator && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{indicator}</span>
        )}
      </div>
      <p className="mt-1 pl-1 text-xs" style={{ color: '#9CA3AF' }}>Letters, numbers, _ and . only</p>
    </div>
  );
}

// ─── Section divider label ────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
        {children}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: '#F3F4F6' }} />
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function EditProfileModal({ onClose, role, currentUser, currentMember, userId }) {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(currentUser?.fullName ?? '');
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');

  const [memberFullName, setMemberFullName] = useState(currentMember?.fullName ?? '');
  const [memberPhone, setMemberPhone] = useState(currentMember?.phone ?? '');
  const [memberPhoneCountryCode, setMemberPhoneCountryCode] = useState(currentMember?.phoneCountryCode ?? '+91');
  const [memberEmail, setMemberEmail] = useState(currentMember?.email ?? '');
  const [address, setAddress] = useState(currentMember?.address ?? '');
  const [city, setCity] = useState(currentMember?.city ?? '');

  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const userMutation = useMutation({
    mutationFn: updateMyUserProfile,
    onSuccess: (data) => {
      updateUser({
        name: data.fullName ?? data.username,
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        phone: data.phone,
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

  const computeChanges = useCallback(() => {
    const cu = currentUser ?? {};
    const cm = currentMember ?? {};
    const changes = [];

    if (role !== 'MEMBER') {
      if (fullName !== (cu.fullName ?? '')) changes.push({ field: 'Full Name', from: cu.fullName ?? '', to: fullName });
      if (phone !== (cu.phone ?? '')) changes.push({ field: 'Phone', from: cu.phone ?? '', to: phone });
    }
    if (username !== (cu.username ?? '')) changes.push({ field: 'Username', from: cu.username ?? '', to: username });
    if (email !== (cu.email ?? '')) changes.push({ field: 'Email', from: cu.email ?? '', to: email });

    if (role === 'MEMBER') {
      if (memberFullName !== (cm.fullName ?? '')) changes.push({ field: 'Full Name', from: cm.fullName ?? '', to: memberFullName });
      if (memberPhone !== (cm.phone ?? '')) changes.push({ field: 'Phone', from: cm.phone ?? '', to: memberPhone });
      if (memberEmail !== (cm.email ?? '')) changes.push({ field: 'Contact Email', from: cm.email ?? '', to: memberEmail });
      if (address !== (cm.address ?? '')) changes.push({ field: 'Address', from: cm.address ?? '', to: address });
      if (city !== (cm.city ?? '')) changes.push({ field: 'City', from: cm.city ?? '', to: city });
    }

    return changes;
  }, [fullName, username, email, phone, memberFullName, memberPhone, memberPhoneCountryCode, memberEmail, address, city, currentUser, currentMember, role]);

  const handleSave = useCallback(async () => {
    setError('');
    try {
      const ops = [];

      const cu = currentUser ?? {};
      const userChanged =
        fullName !== (cu.fullName ?? '') ||
        username !== (cu.username ?? '') ||
        email !== (cu.email ?? '') ||
        phone !== (cu.phone ?? '');
      if (userChanged) {
        ops.push(userMutation.mutateAsync({
          fullName: fullName || undefined,
          username: username || undefined,
          email: email || undefined,
          phone: phone || undefined,
        }));
      }

      if (role === 'MEMBER') {
        const cm = currentMember ?? {};
        const memberChanged =
          memberFullName !== (cm.fullName ?? '') ||
          memberPhone !== (cm.phone ?? '') ||
          memberPhoneCountryCode !== (cm.phoneCountryCode ?? '+91') ||
          memberEmail !== (cm.email ?? '') ||
          address !== (cm.address ?? '') ||
          city !== (cm.city ?? '');
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

      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to save changes. Please try again.');
    }
  }, [
    fullName, username, email, phone,
    memberFullName, memberPhone, memberPhoneCountryCode, memberEmail, address, city,
    currentUser, currentMember, role,
    userMutation, memberMutation, onClose, userId, computeChanges,
  ]);

  const isBusy = userMutation.isPending || memberMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-gray-100" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
              <User size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: '#1E3A5F' }}>Edit Profile</h2>
              <p className="text-xs text-gray-400">Update your account details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <SectionLabel>Account</SectionLabel>

          <FloatField
            label="Full Name"
            icon={UserCircle}
            value={role === 'MEMBER' ? memberFullName : fullName}
            onChange={role === 'MEMBER' ? setMemberFullName : setFullName}
          />

          <UsernameField
            value={username}
            currentUsername={currentUser?.username}
            onChange={setUsername}
          />

          <FloatField
            label="Email"
            icon={Mail}
            type="email"
            value={email}
            onChange={setEmail}
          />

          {role === 'MEMBER' ? (
            <PhoneInput
              label="Phone"
              countryCode={memberPhoneCountryCode}
              phone={memberPhone}
              onCountryChange={setMemberPhoneCountryCode}
              onPhoneChange={setMemberPhone}
            />
          ) : (
            <FloatField
              label="Phone"
              icon={Phone}
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 15))}
              hint="Digits only"
            />
          )}

          {role === 'MEMBER' && (
            <>
              <SectionLabel>Contact Details</SectionLabel>

              <FloatField
                label="Contact Email"
                icon={Mail}
                type="email"
                value={memberEmail}
                onChange={setMemberEmail}
                hint="Shown to your admin — separate from login email"
              />

              <FloatField
                label="Street / Area"
                icon={MapPin}
                value={address}
                onChange={setAddress}
              />

              <FloatField
                label="City"
                value={city}
                onChange={setCity}
              />
            </>
          )}

          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          <Button variant="muted" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant={saved ? 'success' : 'primary'}
            size="md"
            loading={isBusy}
            disabled={saved}
            onClick={handleSave}
          >
            {saved ? <><Check size={14} /> Saved</> : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
