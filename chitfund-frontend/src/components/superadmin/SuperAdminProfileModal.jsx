import { useState, useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { getMe, updateMyUserProfile, sendPhoneChangeOtp, verifyPhoneChangeOtp } from '../../services/api';
import OtpInput from '../ui/OtpInput';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1',  label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
];

const INPUT_CLS = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10 bg-white';

export default function SuperAdminProfileModal({ onClose }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', phoneCountryCode: '+91' });
  const [originalPhone, setOriginalPhone] = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [saved, setSaved]       = useState(false);
  // OTP flow state
  const [otpStep, setOtpStep]   = useState(false); // true = showing OTP input

  useEffect(() => {
    getMe()
      .then((u) => {
        const phone = u.phone || '';
        setForm({
          fullName: u.fullName || '',
          email: u.email || '',
          phone,
          phoneCountryCode: u.phoneCountryCode || '+91',
        });
        setOriginalPhone(phone);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key, val) { setForm((p) => ({ ...p, [key]: val })); }

  const phoneChanged = form.phone !== originalPhone;

  async function handleSave() {
    setError('');
    if (!form.phone || form.phone.trim() === '') {
      setError('Phone number is required.');
      return;
    }
    if (!/^[0-9]{10,15}$/.test(form.phone)) {
      setError('Phone must be 10–15 digits (no spaces or symbols).');
      return;
    }

    // If phone changed, require OTP verification first
    if (phoneChanged) {
      setSaving(true);
      try {
        await sendPhoneChangeOtp({ phone: form.phone, countryCode: form.phoneCountryCode });
        setOtpStep(true);
      } catch (err) {
        setError(err.response?.data?.message ?? 'Failed to send OTP. Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Phone unchanged — save other fields directly
    setSaving(true);
    try {
      await updateMyUserProfile({
        fullName:         form.fullName   || null,
        email:            form.email      || null,
        phone:            form.phone,
        phoneCountryCode: form.phoneCountryCode || '+91',
        username:         undefined,
      });
      setSaved(true);
      setOriginalPhone(form.phone);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err.response?.data?.message ?? err.response?.data?.errors?.[0] ?? 'Failed to save.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleOtpVerify(code) {
    // verifyPhoneChangeOtp saves the phone atomically on the backend
    await verifyPhoneChangeOtp({ phone: form.phone, countryCode: form.phoneCountryCode, code });

    // Now save remaining non-phone fields if any
    if (form.fullName || form.email) {
      await updateMyUserProfile({
        fullName: form.fullName || null,
        email:    form.email    || null,
        username: undefined,
      });
    }

    setOriginalPhone(form.phone);
    setOtpStep(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleOtpResend() {
    await sendPhoneChangeOtp({ phone: form.phone, countryCode: form.phoneCountryCode });
  }

  const initials = form.fullName
    ? form.fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
    : 'SA';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-gray-900">
            {otpStep ? 'Verify new phone' : 'Edit Profile'}
          </h3>
          <button type="button" onClick={otpStep ? () => setOtpStep(false) : onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#1E3A5F]/30 border-t-[#1E3A5F] rounded-full animate-spin" />
          </div>
        ) : otpStep ? (
          <OtpInput
            phone={form.phone}
            countryCode={form.phoneCountryCode}
            onVerify={handleOtpVerify}
            onResend={handleOtpResend}
            onCancel={() => setOtpStep(false)}
          />
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
              >
                {initials}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input className={INPUT_CLS} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Super Admin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input type="email" className={INPUT_CLS} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="admin@chitwise.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone <span className="text-red-400">*</span>
                  {phoneChanged && (
                    <span className="ml-2 text-xs font-normal text-amber-600">OTP required to change</span>
                  )}
                  {!phoneChanged && originalPhone && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-normal text-emerald-600">
                      <CheckCircle size={11} /> Verified
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10 cursor-pointer"
                    value={form.phoneCountryCode}
                    onChange={(e) => set('phoneCountryCode', e.target.value)}
                  >
                    {COUNTRY_CODES.map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className={`${INPUT_CLS} flex-1`}
                    value={form.phone}
                    onChange={(e) => { set('phone', e.target.value.replace(/\D/g, '')); setError(''); }}
                    placeholder="9876543210"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-6 w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: saved ? '#10B981' : '#1E3A5F' }}
            >
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {phoneChanged ? 'Sending OTP…' : 'Saving…'}
                  </span>
                : saved ? '✓ Saved'
                : phoneChanged ? 'Verify & Save'
                : 'Save changes'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
