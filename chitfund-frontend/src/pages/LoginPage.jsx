import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginApi, mobileLookup, loginByMobile, selectTenant, forgotPasswordLookup, forgotPasswordSendOtp, forgotPasswordVerifyOtp, forgotPasswordResetWithToken, verifyLoginOtp, resendLoginOtp, saveDeviceToken, adminForgotPassword, adminVerifyResetOtp, adminResetPassword } from '../services/api';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import PhoneInput from '../components/ui/PhoneInput';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Phone, ShieldCheck, TrendingUp, Users, User,
  Building2, ClipboardList, UserCheck, ChevronLeft, LogIn, CheckCircle, Eye, EyeOff,
  Lock, AlertTriangle,
} from 'lucide-react';
import { useRef, useEffect } from 'react';

/* ── Password validation ── */
function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Must contain at least one uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Must contain at least one lowercase letter';
  if (!/[0-9]/.test(pw)) return 'Must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Must contain at least one special character';
  return null;
}

/* ── Admin email-OTP password reset — 3-step flow ── */
function AdminForgotPasswordFlow({ onClose }) {
  const [step, setStep]               = useState('email'); // 'email' | 'otp' | 'password' | 'done'
  const [email, setEmail]             = useState('');
  const [otp, setOtp]                 = useState('');
  const [resetToken, setResetToken]   = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const resendRef = useRef(null);
  useEffect(() => () => clearInterval(resendRef.current), []);

  function startResend(secs) {
    setResendTimer(secs);
    clearInterval(resendRef.current);
    resendRef.current = setInterval(() => {
      setResendTimer((t) => { if (t <= 1) { clearInterval(resendRef.current); return 0; } return t - 1; });
    }, 1000);
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]';

  async function handleSendOtp(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address'); return; }
    setError(''); setLoading(true);
    try {
      await adminForgotPassword(email.trim());
      startResend(60);
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      const data = await adminVerifyResetOtp(email.trim(), otp);
      setResetToken(data.resetToken);
      setStep('password');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Invalid or expired OTP. Please try again.');
      setOtp('');
    } finally { setLoading(false); }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (newPassword !== confirmPass) { setError("Passwords don't match"); return; }
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setError(pwErr); return; }
    setError(''); setLoading(true);
    try {
      await adminResetPassword(resetToken, newPassword);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Reset failed. Please start over.');
    } finally { setLoading(false); }
  }

  if (step === 'done') return (
    <div className="mt-5 px-4 py-5 rounded-xl border border-green-200 bg-green-50">
      <div className="flex items-start gap-3">
        <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-900 mb-1">Password reset successfully!</p>
          <p className="text-sm text-green-700">Sign in with your new password.</p>
          <button type="button" onClick={onClose}
            className="mt-2 text-xs font-medium text-green-700 underline cursor-pointer">← Back to sign in</button>
        </div>
      </div>
    </div>
  );

  if (step === 'password') return (
    <div className="mt-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Set a new password</p>
      <form onSubmit={handleReset} className="space-y-4">
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
            placeholder="At least 8 characters" required className={`${inputCls} pr-10`} />
          <button type="button" onClick={() => setShowPass((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input type={showPass ? 'text' : 'password'} value={confirmPass}
          onChange={(e) => { setConfirmPass(e.target.value); setError(''); }}
          placeholder="Confirm password" required className={inputCls} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Set New Password</Button>
      </form>
    </div>
  );

  if (step === 'otp') return (
    <div className="mt-5 space-y-4">
      <div className="px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-700">OTP sent to <span className="font-semibold">{email}</span>. Check your inbox.</p>
      </div>
      <form onSubmit={handleVerifyOtp} className="space-y-3">
        <input type="text" inputMode="numeric" maxLength={6} value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="6-digit code" autoFocus
          className={`${inputCls} tracking-widest text-center text-lg font-mono`} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} disabled={otp.length !== 6} className="w-full">Verify OTP</Button>
        <div className="flex justify-between text-xs text-gray-400">
          {resendTimer > 0
            ? <span>Resend in {resendTimer}s</span>
            : <button type="button" onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                className="hover:text-gray-600 cursor-pointer">← Resend OTP</button>
          }
          <button type="button" onClick={() => { setStep('email'); setOtp(''); setError(''); }}
            className="hover:text-gray-600 cursor-pointer">Start over</button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-gray-600 font-medium">Reset your admin password</p>
      <form onSubmit={handleSendOtp} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Email address</label>
          <input type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="your-email@example.com" required className={inputCls} autoFocus />
          <p className="text-xs text-gray-400">Enter the email registered to your admin account.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Send OTP</Button>
        <button type="button" onClick={onClose}
          className="w-full text-xs text-gray-400 hover:text-gray-600 cursor-pointer">← Back to sign in</button>
      </form>
    </div>
  );
}

/* ── Forgot password — 4-step flow ── */
const OTP_LOCKOUT_SECS = 300; // 5-minute lockout after wrong OTP

function ForgotPasswordFlow({ onClose }) {
  // step: 'lookup' | 'last4' | 'otp' | 'password' | 'done' | 'locked'
  const [step, setStep]             = useState('lookup');
  const [input, setInput]           = useState('');
  const [lookup, setLookup]         = useState(null); // { userId, maskedPhone, locked, role }
  const [last4, setLast4]           = useState('');
  const [otp, setOtp]               = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  // OTP-wrong lockout: countdown in seconds (0 = allowed)
  const [otpLockout, setOtpLockout] = useState(0);
  const [resendTimer, setResendTimer] = useState(0);
  const [sendCount, setSendCount]     = useState(0);
  const [resendBlocked, setResendBlocked] = useState(false);
  const lockoutRef = useRef(null);
  const resendRef  = useRef(null);

  useEffect(() => () => {
    clearInterval(lockoutRef.current);
    clearInterval(resendRef.current);
  }, []);

  function startLockout() {
    setOtpLockout(OTP_LOCKOUT_SECS);
    clearInterval(lockoutRef.current);
    lockoutRef.current = setInterval(() => {
      setOtpLockout((t) => { if (t <= 1) { clearInterval(lockoutRef.current); return 0; } return t - 1; });
    }, 1000);
  }

  function startResend(seconds) {
    setResendTimer(seconds);
    clearInterval(resendRef.current);
    resendRef.current = setInterval(() => {
      setResendTimer((t) => { if (t <= 1) { clearInterval(resendRef.current); return 0; } return t - 1; });
    }, 1000);
  }

  function fmtSecs(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  async function handleLookup(e) {
    e.preventDefault();
    if (!input.trim()) { setError('Enter your username or phone number'); return; }
    setError(''); setLoading(true);
    try {
      const data = await forgotPasswordLookup({ usernameOrPhone: input.trim() });
      if (data.locked) { setLookup(data); setStep('locked'); return; }
      setLookup(data);
      setStep('last4');
    } catch (err) {
      setError(err.response?.data?.message ?? 'No account found. Check the username or phone number.');
    } finally { setLoading(false); }
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    if (last4.length !== 4) { setError('Enter the last 4 digits of your phone number'); return; }
    setError(''); setLoading(true);
    try {
      await forgotPasswordSendOtp({ userId: lookup.userId, last4 });
      const nextCount = sendCount + 1;
      setSendCount(nextCount);
      setOtp('');
      setOtpLockout(0);
      startResend(nextCount * 60); // 1 min after 1st, 2 min after 2nd, …
      setStep('otp');
    } catch (err) {
      const code = err.response?.data?.errorCode;
      if (code === 'OTP_005') { setResendBlocked(true); setStep('otp'); }
      else setError(err.response?.data?.message ?? 'Phone digits do not match. Try again.');
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otpLockout > 0) return;
    setError(''); setLoading(true);
    try {
      const data = await forgotPasswordVerifyOtp({ userId: lookup.userId, code: otp });
      setResetToken(data.resetToken);
      setStep('password');
    } catch (err) {
      const code = err.response?.data?.errorCode;
      if (code === 'OTP_004') {
        setError('Too many wrong attempts. Request a new OTP.');
        setOtp('');
        setOtpLockout(0);
        clearInterval(lockoutRef.current);
      } else {
        // Wrong OTP — start 5-min lockout
        setError('Incorrect OTP. Try again in 5 minutes.');
        setOtp('');
        startLockout();
      }
    } finally { setLoading(false); }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (newPassword !== confirmPass) { setError("Passwords don't match"); return; }
    const pwError = validatePassword(newPassword);
    if (pwError) { setError(pwError); return; }
    setError(''); setLoading(true);
    try {
      await forgotPasswordResetWithToken({ resetToken, newPassword });
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Reset failed. The link may have expired — start over.');
    } finally { setLoading(false); }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]';

  /* ── Done ── */
  if (step === 'done') return (
    <div className="mt-5 px-4 py-5 rounded-xl border border-green-200 bg-green-50">
      <div className="flex items-start gap-3">
        <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-900 mb-1">Password reset successfully!</p>
          <p className="text-sm text-green-700">Sign in with your new password.</p>
          <button type="button" onClick={onClose}
            className="mt-2 text-xs font-medium text-green-700 underline cursor-pointer">← Back to sign in</button>
        </div>
      </div>
    </div>
  );

  /* ── Locked ── */
  if (step === 'locked') {
    const isAdmin = lookup?.role === 'ADMIN' || lookup?.role === 'SUPER_ADMIN';
    return (
      <div className="mt-5 px-4 py-5 rounded-xl border border-red-200 bg-red-50">
        <div className="flex items-start gap-3">
          <Lock size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900 mb-1">Account locked</p>
            <p className="text-sm text-red-700">
              {isAdmin
                ? 'Your account has been locked. Please contact support to regain access.'
                : 'Your account has been locked. Please contact your administrator to unlock it.'}
            </p>
            <button type="button" onClick={onClose}
              className="mt-3 text-xs font-medium text-red-700 underline cursor-pointer">← Back to sign in</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── New password ── */
  if (step === 'password') return (
    <div className="mt-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Set a new password</p>
      <form onSubmit={handleReset} className="space-y-4">
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" required
            className={`${inputCls} pr-10`} />
          <button type="button" onClick={() => setShowPass((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input type={showPass ? 'text' : 'password'} value={confirmPass}
          onChange={(e) => setConfirmPass(e.target.value)} placeholder="Confirm password" required
          className={inputCls} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Set New Password</Button>
      </form>
    </div>
  );

  /* ── OTP verification ── */
  if (step === 'otp') return (
    <div className="mt-5 space-y-4">
      <div className="px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-700">OTP sent to {lookup?.maskedPhone}. Enter it below.</p>
      </div>
      <form onSubmit={handleVerifyOtp} className="space-y-3">
        <input type="text" inputMode="numeric" maxLength={6} value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="6-digit code" disabled={otpLockout > 0}
          className={`${inputCls} tracking-widest text-center text-lg font-mono disabled:bg-gray-50 disabled:text-gray-400`} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {otpLockout > 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700">Try again in <span className="font-mono font-bold">{fmtSecs(otpLockout)}</span></p>
          </div>
        ) : (
          <Button type="submit" loading={loading} disabled={otp.length !== 6} className="w-full">Verify OTP</Button>
        )}
        <div className="flex justify-between text-xs text-gray-400">
          {resendBlocked
            ? <span className="text-red-500">Max attempts reached — <a href="mailto:help@thechitwise.com" className="underline">help@thechitwise.com</a></span>
            : resendTimer > 0
              ? <span>Resend in {fmtSecs(resendTimer)}</span>
              : <button type="button" onClick={() => { setStep('last4'); setOtp(''); setError(''); setOtpLockout(0); clearInterval(lockoutRef.current); }}
                  className="hover:text-gray-600 cursor-pointer">← Resend OTP</button>
          }
          <button type="button" onClick={() => { setStep('lookup'); setLookup(null); setError(''); }}
            className="hover:text-gray-600 cursor-pointer">Start over</button>
        </div>
      </form>
    </div>
  );

  /* ── Last 4 digits ── */
  if (step === 'last4') return (
    <div className="mt-5 space-y-4">
      <div className="px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-700">We'll send an OTP to <span className="font-bold">{lookup?.maskedPhone}</span>.</p>
        <p className="text-xs text-gray-500 mt-1">First, confirm the last 4 digits of that number.</p>
      </div>
      <form onSubmit={handleSendOtp} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Last 4 digits of your phone</label>
          <input type="text" inputMode="numeric" maxLength={4} value={last4}
            onChange={(e) => { setLast4(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="e.g. 4321" required
            className={`${inputCls} tracking-widest text-center text-lg font-mono w-36 mx-auto`} />
        </div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <Button type="submit" loading={loading} disabled={last4.length !== 4} className="w-full">Send OTP</Button>
        <button type="button" onClick={() => { setStep('lookup'); setError(''); setLast4(''); }}
          className="w-full text-xs text-gray-400 hover:text-gray-600 cursor-pointer">← Change account</button>
      </form>
    </div>
  );

  /* ── Lookup (step 1) ── */
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-gray-600 font-medium">Reset your password</p>
      <form onSubmit={handleLookup} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Username or phone number</label>
          <input type="text" value={input} onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder="e.g. sai.admin or 9876543210" required
            className={inputCls} autoFocus />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Find Account</Button>
        <button type="button" onClick={onClose}
          className="w-full text-xs text-gray-400 hover:text-gray-600 cursor-pointer">← Back to sign in</button>
      </form>
    </div>
  );
}

/* ── Role definitions ── */
const ROLES = [
  {
    key: 'admin',
    icon: Building2,
    title: 'Admin',
    subtitle: 'Manage chit groups, draws & treasury',
    color: '#1E3A5F',
    bg: '#EFF4FA',
    desc: 'You run the chit fund. Access your full dashboard — collections, payouts, member management, reports.',
    bullets: [
      { icon: TrendingUp,  text: 'Full draw & collection dashboard' },
      { icon: Users,       text: 'Member & staff management' },
      { icon: ShieldCheck, text: 'Treasury, payouts & reports' },
      { icon: BookOpen,    text: 'Audit history & role controls' },
    ],
    stats: [
      { label: 'Every action',  value: 'Audit logged' },
      { label: 'Data access',   value: 'Role-scoped' },
    ],
  },
  {
    key: 'staff',
    icon: ClipboardList,
    title: 'Manager / Staff',
    subtitle: 'Collections & field operations',
    color: '#0369A1',
    bg: '#EFF8FF',
    desc: 'You handle day-to-day collections, cash pickups, and remittances.',
    bullets: [
      { icon: TrendingUp,  text: 'Record installment collections' },
      { icon: Users,       text: 'Cash pickup & remittance flow' },
      { icon: ShieldCheck, text: 'Pending task queue' },
      { icon: BookOpen,    text: 'Daily collection summary' },
    ],
    stats: [
      { label: 'Field access',  value: 'Task-scoped' },
      { label: 'Every action',  value: 'Audit logged' },
    ],
  },
  {
    key: 'member',
    icon: UserCheck,
    title: 'Member',
    subtitle: 'Your personal chit portal',
    color: '#059669',
    bg: '#ECFDF5',
    desc: 'View your chit group status, installment history, draw results, and payout schedule.',
    bullets: [
      { icon: TrendingUp,  text: 'Track your installment history' },
      { icon: Users,       text: 'See draw results & rankings' },
      { icon: ShieldCheck, text: 'View your payout schedule' },
      { icon: BookOpen,    text: 'Download receipts anytime' },
    ],
    stats: [
      { label: 'Your records', value: 'Private & yours' },
      { label: 'Login',        value: 'OTP verified' },
    ],
  },
];

const SLIDE = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -32 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
};

function getSubdomainSlug() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts[0] : null;
}

/* ── Mobile login flow ── */
function MobileLoginForm({ onSuccess }) {
  const [step, setStep]         = useState('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone]       = useState('');
  const [accounts, setAccounts] = useState([]);
  const [role, setRole]         = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handlePhoneLookup(e) {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 7) { setError('Enter a valid mobile number'); return; }
    setError(''); setLoading(true);
    try {
      const data = await mobileLookup(phone, countryCode);
      if (!data.accounts || data.accounts.length === 0) { setError('No account found for this mobile number'); return; }
      setAccounts(data.accounts);
      if (data.singleAccount) { setRole(data.accounts[0].role); setStep('password'); }
      else setStep('role');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Lookup failed. Try again.');
    } finally { setLoading(false); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await loginByMobile({ phone, phoneCountryCode: countryCode, password, role });
      await onSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  }

  if (step === 'phone') return (
    <form onSubmit={handlePhoneLookup} className="space-y-5">
      <PhoneInput label="Mobile number" countryCode={countryCode} phone={phone}
        onCountryChange={setCountryCode} onPhoneChange={setPhone} required />
      {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100"><p className="text-sm text-red-600">{error}</p></div>}
      <Button type="submit" loading={loading} className="w-full">Continue</Button>
    </form>
  );

  if (step === 'role') return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-gray-700 mb-3">
        Multiple accounts found for {phone} — which would you like to sign in as?
      </p>
      <div className="space-y-2">
        {accounts.map((acc) => (
          <button key={acc.role} type="button"
            onClick={() => { setRole(acc.role); setStep('password'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5 transition-colors cursor-pointer text-left">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF4FA' }}>
              <User size={16} style={{ color: '#1E3A5F' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{acc.displayLabel}</p>
              <p className="text-xs text-gray-500">{acc.role}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100"><p className="text-sm text-red-600">{error}</p></div>}
      <button type="button" onClick={() => { setStep('phone'); setError(''); }}
        className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer">← Use a different number</button>
    </div>
  );

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <Phone size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-600">{countryCode} {phone}</span>
        {role && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#EFF4FA', color: '#1E3A5F' }}>
            {accounts.find(a => a.role === role)?.displayLabel ?? role}
          </span>
        )}
        <button type="button" onClick={() => { setStep(accounts.length > 1 ? 'role' : 'phone'); setPassword(''); setError(''); }}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Change</button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Password</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
          placeholder="Enter your password" autoComplete="current-password" autoFocus required />
      </div>
      {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100"><p className="text-sm text-red-600">{error}</p></div>}
      <div className="pt-4">
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]           = useState('choose'); // 'choose' | 'login' | 'login-otp'
  const [selectedRole, setSelectedRole] = useState(null); // one of ROLES
  const [loginMode, setLoginMode] = useState('username');
  const [form, setForm]           = useState({ username: '', password: '' });
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showOtpReset, setShowOtpReset] = useState(false);
  const [loginOtpState, setLoginOtpState] = useState(null); // { otpToken, maskedPhone }
  const [loginOtp, setLoginOtp]   = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const [otpResendBlocked, setOtpResendBlocked] = useState(false);
  const otpResendRef = useRef(null);
  useEffect(() => () => clearInterval(otpResendRef.current), []);

  if (isAuthenticated) {
    if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
    if (user?.role === 'SUPER_ADMIN') return <Navigate to="/superadmin" replace />;
    const dest = user?.role === 'MEMBER' ? '/member' : user?.role === 'STAFF' ? '/tasks' : '/dashboard';
    return <Navigate to={dest} replace />;
  }

  async function handleScopedAuth(authResponse, tenantInfo = null) {
    const accessToken = authResponse?.accessToken ?? authResponse?.token;
    const role = authResponse?.user?.role ?? 'ADMIN';
    const mustChangePassword = authResponse?.user?.mustChangePassword ?? false;
    const userData = {
      name: authResponse?.user?.fullName ?? authResponse?.user?.name ?? authResponse?.user?.username,
      role, id: authResponse?.user?.id, mustChangePassword,
    };
    const tenantData = tenantInfo
      ? {
          tenantId:      tenantInfo.tenantId,
          tenantSlug:    tenantInfo.slug,
          tenantName:    tenantInfo.name,
          tenantPlan:    tenantInfo.plan ?? 'BASIC',
          tenantStatus:  tenantInfo.status ?? 'ACTIVE',
          analyticsEnabled: tenantInfo.analyticsEnabled !== false,
          planExpiresAt: tenantInfo.planExpiresAt ?? null,
        }
      : {};
    login(accessToken, userData, tenantData);
    if (mustChangePassword) navigate('/change-password', { replace: true });
    else if (role === 'SUPER_ADMIN') navigate('/superadmin', { replace: true });
    else navigate(role === 'MEMBER' ? '/member' : role === 'STAFF' ? '/tasks' : '/dashboard', { replace: true });
  }

  async function handleLoginResponse(loginResponse) {
    if (!loginResponse.requiresTenantSelection && loginResponse.authResponse) {
      await handleScopedAuth(loginResponse.authResponse);
      return;
    }
    const tenants = loginResponse.tenants ?? [];
    if (tenants.length === 0) {
      setError('No organizations found for this account. Contact your admin.');
      return;
    }

    // Subdomain-based auto-selection: apple.localhost → select apple tenant
    const slug = getSubdomainSlug();
    if (slug) {
      const match = tenants.find(t => t.slug === slug);
      if (match) {
        const authData = await selectTenant({ loginToken: loginResponse.loginToken, tenantId: match.tenantId });
        await handleScopedAuth(authData, match);
        return;
      }
      setError("You don't have an account with this organisation.");
      return;
    }

    if (tenants.length === 1) {
      const authData = await selectTenant({ loginToken: loginResponse.loginToken, tenantId: tenants[0].tenantId });
      await handleScopedAuth(authData, tenants[0]);
    } else {
      navigate('/select-company', { state: { loginToken: loginResponse.loginToken, tenants } });
    }
  }

  async function handleUsernameSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await loginApi(form);
      if (data.requiresOtp) {
        setLoginOtpState({ otpToken: data.otpToken, maskedPhone: data.maskedPhone });
        setLoginOtp('');
        setStep('login-otp');
        return;
      }
      await handleLoginResponse(data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleResendLoginOtp() {
    setError(''); setLoading(true);
    try {
      await resendLoginOtp({ otpToken: loginOtpState.otpToken });
      const nextWait = 60;
      setOtpResendTimer(nextWait);
      clearInterval(otpResendRef.current);
      otpResendRef.current = setInterval(() => {
        setOtpResendTimer(t => { if (t <= 1) { clearInterval(otpResendRef.current); return 0; } return t - 1; });
      }, 1000);
      setLoginOtp('');
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'OTP_005') { setOtpResendBlocked(true); return; }
      const msg = err.response?.data?.message ?? '';
      const secs = msg.match(/(\d+) second/)?.[1];
      if (secs) {
        setOtpResendTimer(Number(secs));
        clearInterval(otpResendRef.current);
        otpResendRef.current = setInterval(() => {
          setOtpResendTimer(t => { if (t <= 1) { clearInterval(otpResendRef.current); return 0; } return t - 1; });
        }, 1000);
      } else {
        setError(msg || 'Failed to resend OTP. Please try again.');
      }
    } finally { setLoading(false); }
  }

  async function handleLoginOtpSubmit(e) {
    e.preventDefault();
    if (!loginOtp || loginOtp.length !== 6) return;
    setError(''); setLoading(true);
    try {
      const data = await verifyLoginOtp({ otpToken: loginOtpState.otpToken, code: loginOtp, rememberDevice });
      if (data.requiresOtp) {
        setError('OTP verification failed. Please try again.');
        return;
      }
      if (rememberDevice && data.deviceToken) {
        saveDeviceToken(data.deviceToken);
      }
      await handleLoginResponse(data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Incorrect OTP. Please try again.');
    } finally { setLoading(false); }
  }

  function pickRole(r) {
    setSelectedRole(r);
    setStep('login');
    setError('');
    setLoginMode(r.key === 'member' ? 'mobile' : 'username');
  }

  const roleObj = selectedRole ?? ROLES[0];

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Left panel: brand ── */}
      <div className="hidden lg:flex lg:w-[44%] flex-col justify-between p-12 relative overflow-hidden" style={{ backgroundColor: '#1E3A5F' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(212,160,23,0.15) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 50%)`,
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-12 cursor-pointer" onClick={() => navigate('/')}>
            <BookOpen size={36} className="text-white flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'Merriweather, serif', color: '#FFFFFF' }}>ChitWise</h1>
              <p className="text-xs text-white/50">India's Chitfund Management Platform</p>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={selectedRole?.key ?? 'default'} {...SLIDE}>
              {selectedRole ? (
                <>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: selectedRole.bg }}>
                    <selectedRole.icon size={26} style={{ color: selectedRole.color }} />
                  </div>
                  <h2 className="text-3xl font-bold leading-snug mb-4" style={{ fontFamily: 'Merriweather, serif', color: '#FFFFFF' }}>
                    Welcome,<br />{selectedRole.title}
                  </h2>
                  <p className="text-white/60 text-sm leading-relaxed mb-8">{selectedRole.desc}</p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-bold leading-snug mb-4" style={{ fontFamily: 'Merriweather, serif', color: '#FFFFFF' }}>
                    Manage your chit funds<br />with confidence
                  </h2>
                  <p className="text-white/60 text-sm leading-relaxed mb-8">
                    India's complete digital platform for chit fund businesses — admin dashboards, staff tools, and member portals.
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={(selectedRole?.key ?? 'default') + '-bullets'} {...SLIDE} className="space-y-4">
              {(selectedRole?.bullets ?? [
                { icon: TrendingUp,  text: 'Real-time draw collection tracking' },
                { icon: Users,       text: 'Separate portals for every role' },
                { icon: ShieldCheck, text: 'Secure role-based access control' },
                { icon: BookOpen,    text: 'Full payout & dividend history' },
              ]).map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2.5 text-white/80 text-sm">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    <Icon size={14} className="text-white" />
                  </div>
                  {text}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-3">
          <AnimatePresence mode="wait" initial={false}>
            {(selectedRole?.stats ?? [
              { label: 'Your data',   value: 'Always private' },
              { label: 'Connections', value: 'HTTPS secured' },
            ]).map(({ label, value }) => (
              <motion.div
                key={label}
                {...SLIDE}
                className="rounded-xl p-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <p className="text-white/50 text-xs mb-1">{label}</p>
                <p className="text-white font-bold text-base">{value}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 bg-white overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="flex items-center gap-3 mb-10 lg:hidden cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1E3A5F' }}>
                <BookOpen size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>ChitWise</h1>
                <p className="text-xs text-gray-400">India's Chitfund Platform</p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} {...SLIDE}>

              {/* ── Step 1: Choose who you are ── */}
              {step === 'choose' && (
                <div>
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Merriweather, serif', color: '#1A202C' }}>
                      Who are you?
                    </h2>
                    <p className="text-sm text-gray-500">Choose your portal to sign in</p>
                  </div>

                  <div className="space-y-3">
                    {ROLES.map((r) => (
                      <motion.button
                        key={r.key}
                        type="button"
                        onClick={() => pickRole(r)}
                        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-gray-100 hover:border-current transition-all cursor-pointer text-left group"
                        style={{ '--tw-border-opacity': 1 }}
                        whileHover={{ scale: 1.02, borderColor: r.color }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                          style={{ backgroundColor: r.bg }}>
                          <r.icon size={20} style={{ color: r.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900">{r.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{r.subtitle}</p>
                        </div>
                        <LogIn size={15} className="text-gray-300 flex-shrink-0" />
                      </motion.button>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                    <p className="text-sm text-gray-400">
                      New to ChitWise?{' '}
                      <button onClick={() => navigate('/register')} className="font-semibold cursor-pointer" style={{ color: '#1E3A5F' }}>
                        Register your chit fund
                      </button>
                    </p>
                    <p className="text-xs text-gray-300 mt-3">
                      <button onClick={() => navigate('/privacy')} className="hover:text-gray-500 cursor-pointer underline">Privacy Policy</button>
                      {' · '}
                      <button onClick={() => navigate('/terms')} className="hover:text-gray-500 cursor-pointer underline">Terms of Service</button>
                    </p>
                  </div>
                </div>
              )}

              {/* ── Step 2: Login form ── */}
              {step === 'login' && (
                <div>
                  {showOtpReset ? (
                    selectedRole?.key === 'admin'
                      ? <AdminForgotPasswordFlow onClose={() => setShowOtpReset(false)} />
                      : <ForgotPasswordFlow onClose={() => setShowOtpReset(false)} />
                  ) : (
                    <>
                      {/* Back button + role badge */}
                      <div className="flex items-center gap-3 mb-8">
                        <button type="button" onClick={() => { setStep('choose'); setSelectedRole(null); setError(''); }}
                          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 cursor-pointer transition-colors">
                          <ChevronLeft size={16} /> Back
                        </button>
                        <div className="flex items-center gap-2 ml-auto px-3 py-1.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: roleObj.bg, color: roleObj.color }}>
                          <roleObj.icon size={12} />
                          {roleObj.title}
                        </div>
                      </div>

                      <div className="mb-7">
                        <h2 className="text-2xl font-bold" style={{ fontFamily: 'Merriweather, serif', color: '#1A202C' }}>
                          {roleObj.key === 'member' ? 'Member sign in' : 'Welcome back'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                          {roleObj.key === 'member'
                            ? 'Sign in to view your chit group, installments & draws'
                            : `Sign in to your ${roleObj.title.toLowerCase()} account`}
                        </p>
                      </div>

                      {/* Login mode tabs */}
                      <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-6">
                        {[
                          { key: 'username', label: 'Username' },
                          { key: 'mobile',   label: 'Mobile number' },
                        ].map(({ key, label }) => (
                          <button key={key} type="button"
                            onClick={() => { setLoginMode(key); setError(''); }}
                            className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${loginMode === key ? 'text-white' : 'text-gray-500 hover:text-gray-700 bg-white'}`}
                            style={loginMode === key ? { backgroundColor: '#1E3A5F' } : {}}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Username login */}
                      {loginMode === 'username' && (
                        <form onSubmit={handleUsernameSubmit} className="space-y-5">
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="username" className="text-sm font-medium text-gray-700">Username</label>
                            <Input id="username" type="text" value={form.username}
                              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                              placeholder="Enter your username" autoComplete="username" required />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
                            <Input id="password" type="password" value={form.password}
                              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value.replace(/\s/g, '') }))}
                              placeholder="Enter your password" autoComplete="current-password" required />
                          </div>
                          {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100"><p className="text-sm text-red-600">{error}</p></div>}
                          <div className="pt-2">
                            <Button type="submit" loading={loading} className="w-full">Sign in</Button>
                          </div>
                          <button type="button" onClick={() => setShowOtpReset(true)}
                            className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1 cursor-pointer">
                            Forgot password?
                          </button>
                        </form>
                      )}

                      {/* Mobile login */}
                      {loginMode === 'mobile' && <MobileLoginForm onSuccess={handleLoginResponse} />}

                      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                        <p className="text-sm text-gray-400">
                          New chit fund?{' '}
                          <button onClick={() => navigate('/register')} className="font-semibold cursor-pointer" style={{ color: '#1E3A5F' }}>
                            Register your organization
                          </button>
                        </p>
                        <p className="text-xs text-gray-300 mt-3">
                          <button onClick={() => navigate('/privacy')} className="hover:text-gray-500 cursor-pointer underline">Privacy Policy</button>
                          {' · '}
                          <button onClick={() => navigate('/terms')} className="hover:text-gray-500 cursor-pointer underline">Terms of Service</button>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Step 3: Login OTP verification ── */}
              {step === 'login-otp' && (
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <button type="button" onClick={() => { setStep('login'); setLoginOtpState(null); setError(''); }}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 cursor-pointer transition-colors">
                      <ChevronLeft size={16} /> Back
                    </button>
                  </div>
                  <div className="mb-7">
                    <h2 className="text-2xl font-bold" style={{ fontFamily: 'Merriweather, serif', color: '#1A202C' }}>
                      Verify your identity
                    </h2>
                    <p className="text-sm text-gray-500 mt-2">
                      A 6-digit OTP was sent to <span className="font-semibold">{loginOtpState?.maskedPhone}</span>.
                    </p>
                  </div>
                  <form onSubmit={handleLoginOtpSubmit} className="space-y-5">
                    <input
                      type="text" inputMode="numeric" maxLength={6} value={loginOtp}
                      onChange={(e) => { setLoginOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                      placeholder="6-digit code" autoFocus
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] tracking-widest text-center text-lg font-mono"
                    />
                    {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100"><p className="text-sm text-red-600">{error}</p></div>}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]/30 cursor-pointer" />
                      <span className="text-sm text-gray-600">Remember this device — skip OTP next time</span>
                    </label>
                    <Button type="submit" loading={loading} disabled={loginOtp.length !== 6} className="w-full">Verify &amp; Sign In</Button>
                    <div className="text-center text-xs text-gray-400 pt-1">
                      {otpResendBlocked
                        ? <span className="text-red-500">Max resends reached — <a href="mailto:help@thechitwise.com" className="underline">contact support</a></span>
                        : otpResendTimer > 0
                          ? <span>Resend OTP in <span className="font-mono font-semibold">{otpResendTimer}s</span></span>
                          : <button type="button" onClick={handleResendLoginOtp} disabled={loading}
                              className="text-[#1E3A5F] hover:underline cursor-pointer disabled:opacity-50">Didn't receive it? Resend OTP</button>
                      }
                    </div>
                  </form>
                </div>
              )}

              </motion.div>
            </AnimatePresence>

          </div>
        </div>
      </div>
    </div>
  );
}
