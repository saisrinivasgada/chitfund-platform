import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { registerOrg, getPublicPlans, sendRegistrationOtp, verifyRegistrationOtp, validatePromoCode } from '../services/api';
import useUsernameAvailability, { isValidUsername, normalizeUsernameInput } from '../hooks/useUsernameAvailability';
import {
  BookOpen, Building2, CheckCircle, ChevronRight, ChevronLeft,
  Zap, Shield, Users, BarChart2, Check,
} from 'lucide-react';
import OtpInput from '../components/ui/OtpInput';
import DevOtpBanner from '../components/ui/DevOtpBanner';
import LegalAcceptanceCheckbox from '../components/legal/LegalAcceptanceCheckbox';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { googleProfileHint } from '../utils/googleCredential';
const FEATURES = [
  { icon: Shield,    title: 'Secure & compliant',    desc: 'Role-based access for admins, staff, and members — with full audit trail' },
  { icon: Zap,       title: 'Live draw tracking',    desc: 'Record installments and track pending members per draw in real time' },
  { icon: Users,     title: 'Separate portals',      desc: 'Admin dashboard, staff field app, and member self-service — all included' },
  { icon: BarChart2, title: 'Chit group reports',   desc: 'Draw-wise collection, dividend calculation, and treasury summary — auto-generated' },
];

function FieldLabel({ children, required }) {
  return (
    <label className="block text-sm font-semibold text-gray-700 mb-3">
      {children}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
}

function TextInput({ className = '', error, ...props }) {
  return (
    <input
      className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-900 placeholder-gray-400
        bg-white transition-all outline-none
        hover:border-gray-300
        ${error
          ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/10'
          : 'border-gray-200 focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10'
        } ${className}`}
      {...props}
    />
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1.5">{msg}</p>;
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3 mb-5 sm:mb-8">
      <div className="w-1 h-5 rounded-full" style={{ backgroundColor: '#1E3A5F' }} />
      <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{children}</span>
    </div>
  );
}

function fmtPrice(effectivePaise, originalPaise, discountPct) {
  if (effectivePaise === 0) return 'Free';
  const effective = '₹' + (effectivePaise / 100).toLocaleString('en-IN') + '/mo';
  if (discountPct && originalPaise !== effectivePaise) {
    return { effective, original: '₹' + (originalPaise / 100).toLocaleString('en-IN'), discountPct };
  }
  return effective;
}

export default function RegisterOrgPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    orgName: '', adminFullName: '', adminUsername: '', adminEmail: '',
    adminPhone: '', adminPhoneCountryCode: '+91', plan: 'BASIC',
    promoCode: '',
  });
  const usernameStatus = useUsernameAvailability(form.adminUsername);
  const [plans, setPlans]             = useState([]);
  const planScrollRef = useRef(null);
  const [planCanLeft, setPlanCanLeft] = useState(false);
  const [planCanRight, setPlanCanRight] = useState(true);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [fe, setFe]                   = useState({});
  const [done, setDone]               = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState(null);
  // Promo code state
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult]         = useState(null); // null | { valid, discountPct, label, referralOrgName, errorMessage }
  // Phone OTP state
  const [phoneVerificationId, setPhoneVerificationId] = useState(null);
  const phoneVerified = Boolean(phoneVerificationId);
  const [showOtp, setShowOtp]             = useState(false);
  const [otpSending, setOtpSending]       = useState(false);
  const [devOtp, setDevOtp]               = useState(null);

  useEffect(() => {
    const planParam = searchParams.get('plan')?.toUpperCase();
    getPublicPlans().then(data => {
      setPlans(data);
      if (planParam && data.find(p => p.plan === planParam)) {
        set('plan', planParam);
      } else if (data.length > 0 && !data.find(p => p.plan === form.plan)) {
        set('plan', data[0].plan);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = planScrollRef.current;
    if (!el) return;
    const check = () => {
      setPlanCanLeft(el.scrollLeft > 4);
      setPlanCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [plans]);

  function set(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
    setFe((f) => ({ ...f, [key]: undefined }));
  }

  function handleOrgNameChange(e) {
    set('orgName', e.target.value);
  }

  function handleGoogleCredential(idToken) {
    try {
      const profile = googleProfileHint(idToken);
      setForm((current) => ({
        ...current,
        adminEmail: profile.email,
        adminFullName: current.adminFullName || profile.name,
      }));
      setGoogleIdToken(idToken);
      setFe((current) => ({ ...current, adminEmail: undefined }));
      setError('');
    } catch (credentialError) {
      setGoogleIdToken(null);
      setError(credentialError.message);
    }
  }

  async function handleSendOtp() {
    if (!/^[6-9][0-9]{9}$/.test(form.adminPhone)) {
      setError('Enter a valid 10-digit Indian mobile number before verifying.');
      return;
    }
    setOtpSending(true);
    setError('');
    setPhoneVerificationId(null);
    try {
      const data = await sendRegistrationOtp({ phone: form.adminPhone, countryCode: form.adminPhoneCountryCode });
      if (data?.devOtp) setDevOtp(data.devOtp);
      setShowOtp(true);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleOtpVerify(code) {
    const result = await verifyRegistrationOtp({ phone: form.adminPhone, countryCode: form.adminPhoneCountryCode, code });
    if (!result?.verificationToken) throw new Error('Phone verification did not complete. Please try again.');
    setPhoneVerificationId(result.verificationToken);
    setShowOtp(false);
  }

  async function handleOtpResend() {
    setPhoneVerificationId(null);
    const data = await sendRegistrationOtp({ phone: form.adminPhone, countryCode: form.adminPhoneCountryCode });
    if (data?.devOtp) setDevOtp(data.devOtp);
  }

  async function handleValidatePromo() {
    const code = form.promoCode.trim();
    if (!code) return;
    setPromoValidating(true);
    setPromoResult(null);
    try {
      const result = await validatePromoCode(code, form.plan);
      setPromoResult(result);
    } catch {
      setPromoResult({ valid: false, errorMessage: 'Could not validate code.' });
    } finally {
      setPromoValidating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!isValidUsername(form.adminUsername)) {
      setFe((f) => ({ ...f, adminUsername: 'Use 3–30 characters: lowercase English letters, numbers, periods, or underscores. Start with a letter or number.' }));
      return;
    }
    if (usernameStatus === 'taken') {
      setFe((f) => ({ ...f, adminUsername: 'This username is already taken.' }));
      return;
    }
    if (form.adminEmail.length > 100) {
      setFe((f) => ({ ...f, adminEmail: 'Use an email address with at most 100 characters.' }));
      return;
    }
    if (!phoneVerified) {
      setError('Please verify your phone number before submitting.');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms of Service to continue.');
      return;
    }
    setLoading(true);
    setFe({});
    try {
      await registerOrg({ ...form, phoneVerificationId, termsAccepted,
        ...(googleIdToken ? { googleIdToken } : {}) });
      setDone(true);
    } catch (err) {
      const fieldErrors = err.response?.data?.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        setFe(fieldErrors);
        // scroll to first error
        const firstField = Object.keys(fieldErrors)[0];
        document.querySelector(`[data-field="${firstField}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const code = err.response?.data?.errorCode;
      const msg  = err.response?.data?.message ?? '';
      if (googleIdToken && (err.response?.status === 401 || /google token/i.test(msg))) {
        setError('Your Google sign-in has expired. Choose your Google account again, then submit.');
      } else if (code === 'USER_002' || msg.toLowerCase().includes('username')) {
        setFe({ adminUsername: 'This username is already taken.' });
      } else if (code === 'USER_003' || msg.toLowerCase().includes('email')) {
        setFe({ adminEmail: 'This email is already registered.' });
      } else {
        setError(msg || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Success screen ── */
  if (done) {
    const steps = [
      { label: 'Application received',        desc: 'Your request is in our system.',                        done: true  },
      { label: 'Under review',                desc: "We'll review your application and email you when there is an update.", done: false },
      { label: 'Approval update',             desc: `We'll email ${form.adminEmail} with next steps.`,       done: false },
      { label: 'Your org goes live',          desc: googleIdToken ? 'Continue with Google after approval.' : 'Set your password, then sign in.', done: false },
    ];
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] px-4 py-10">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-10 pb-6 text-center" style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2d5280 100%)' }}>
            <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Merriweather, serif' }}>
              You're in the queue!
            </h2>
            <p className="text-white/70 text-sm">
              <strong className="text-white">{form.orgName}</strong> has been submitted for review.
            </p>
            <p className="text-white/60 text-xs mt-2">
              Check <strong className="text-white/80">{form.adminEmail}</strong> for updates about your application.
            </p>
          </div>

          {/* Steps */}
          <div className="px-8 py-6">
            <div className="space-y-4">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${s.done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {s.done ? <CheckCircle size={16} /> : i + 1}
                    </div>
                    {i < steps.length - 1 && <div className="w-px flex-1 mt-1 min-h-[20px]" style={{ backgroundColor: '#E5E7EB' }} />}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm font-semibold ${s.done ? 'text-gray-900' : 'text-gray-500'}`}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 p-4 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700 leading-relaxed">
              <strong>What happens next?</strong> Keep an eye on <strong>{form.adminEmail}</strong>. {googleIdToken
                ? 'Once approved, sign in with this same Google account and verify your mobile number.'
                : "Once approved, you'll receive a link to set your password. We won't email you a password."}
            </div>
          </div>

          <div className="px-8 pb-8">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3.5 rounded-xl text-white font-semibold cursor-pointer transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              Back to login
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              Questions? Reach us at <span className="text-gray-600 font-medium">help@thechitwise.com</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main page ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafd] to-[#eef2f7]">

      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
            <BookOpen size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>ChitWise</span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-sm text-gray-500 hover:text-gray-800 cursor-pointer transition-colors"
        >
          Already registered? Sign in →
        </button>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12 sm:pb-20 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20 items-start">

        {/* ── Left: Marketing — hidden on mobile ── */}
        <div className="hidden lg:block lg:sticky lg:top-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8"
            style={{ backgroundColor: '#EFF4FA', color: '#1E3A5F' }}
          >
            <Zap size={13} />
            Trusted by chitfund businesses
          </div>

          <h1
            className="text-5xl font-extrabold text-gray-900 leading-snug mb-6"
            style={{ fontFamily: 'Merriweather, serif' }}
          >
            India's smartest<br />
            <span style={{ color: '#1E3A5F' }}>chitfund platform</span>
          </h1>

          <p className="text-gray-500 text-base leading-relaxed mb-12 max-w-sm">
            Built for Indian chit fund businesses — manage draws, installments, payouts, member portals, and admin dashboards all in one place.
          </p>

          <div className="space-y-7">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#EFF4FA' }}
                >
                  <Icon size={19} style={{ color: '#1E3A5F' }} />
                </div>
                <div className="pt-0.5">
                  <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 flex items-center gap-3 text-sm text-gray-400">
            <div className="flex -space-x-2">
              {['K', 'P', 'R', 'S'].map((l) => (
                <div
                  key={l}
                  className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {l}
                </div>
              ))}
            </div>
            <span>Join <strong className="text-gray-600">100+</strong> chit funds already on ChitWise</span>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-10">

          {/* Header */}
          <div className="flex items-center gap-4 mb-7 sm:mb-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#EFF4FA' }}
            >
              <Building2 size={23} style={{ color: '#1E3A5F' }} />
            </div>
            <div>
              <h2
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: 'Merriweather, serif' }}
              >
                Register your organization
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">Free to start — no credit card required</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>

            {/* ── Organization section ── */}
            <div className="mb-8 sm:mb-12">
              <SectionHeading>Organization</SectionHeading>
              <div className="space-y-7">
                <div data-field="orgName">
                  <FieldLabel required>Organization name</FieldLabel>
                  <TextInput
                    value={form.orgName}
                    onChange={handleOrgNameChange}
                    placeholder="Kethaki Chitfunds"
                    required
                    error={fe.orgName}
                  />
                  <FieldError msg={fe.orgName} />
                </div>
              </div>
            </div>

            {/* ── Administrator section ── */}
            <div className="mb-8 sm:mb-12">
              <SectionHeading>Administrator account</SectionHeading>
              <div className="space-y-7">
                {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-2">How would you like to sign in?</p>
                    <GoogleSignInButton onCredential={handleGoogleCredential} text="continue_with" />
                    {googleIdToken ? (
                      <div className="text-center mt-3">
                        <p className="text-xs text-emerald-700">Google account selected: {form.adminEmail}</p>
                        <button type="button" onClick={() => setGoogleIdToken(null)} className="text-xs text-[#1E3A5F] underline mt-2">Use email instead</button>
                      </div>
                    ) : <p className="text-xs text-gray-500 text-center mt-3">Or continue below with email and set your password after approval.</p>}
                  </div>
                )}
                <div data-field="adminFullName">
                  <FieldLabel required>Full name</FieldLabel>
                  <TextInput
                    value={form.adminFullName}
                    onChange={(e) => set('adminFullName', e.target.value)}
                    placeholder="Sai Srinivas"
                    required
                    error={fe.adminFullName}
                  />
                  <FieldError msg={fe.adminFullName} />
                </div>
                <div data-field="adminUsername">
                  <FieldLabel required>
                    Username
                    <span className="text-gray-400 font-normal ml-1 text-xs">
                      {googleIdToken ? '— your account name' : '— for logging in'}
                    </span>
                  </FieldLabel>
                  <TextInput
                    value={form.adminUsername}
                    onChange={(e) => set('adminUsername', normalizeUsernameInput(e.target.value))}
                    placeholder="sai.srinivas"
                    required
                    minLength={3}
                    maxLength={30}
                    error={fe.adminUsername}
                  />
                  {fe.adminUsername ? <FieldError msg={fe.adminUsername} /> : (
                    <p className={`text-xs mt-2 ${usernameStatus === 'taken' ? 'text-red-500' : usernameStatus === 'available' ? 'text-emerald-600' : 'text-gray-400'}`} aria-live="polite">
                      {usernameStatus === 'checking' ? 'Checking username…'
                        : usernameStatus === 'available' ? '✓ Username available'
                        : usernameStatus === 'taken' ? 'This username is already taken.'
                        : usernameStatus === 'unknown' ? 'Could not check now. We will check when you submit.'
                        : 'Use 3–30 lowercase English letters, numbers, periods, or underscores. Starts with a letter or number.'}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">{googleIdToken
                    ? 'You will use the same Google account to sign in after approval.'
                    : "If approved, we'll email you a link to set your password. We won't send a password by email."}</p>
                </div>
                <div data-field="adminEmail">
                  <FieldLabel required>Email</FieldLabel>
                  <TextInput
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => set('adminEmail', e.target.value)}
                    maxLength={100}
                    readOnly={Boolean(googleIdToken)}
                    placeholder="admin@example.com"
                    required
                    error={fe.adminEmail}
                  />
                  <FieldError msg={fe.adminEmail} />
                </div>
                <div data-field="adminPhone">
                  <FieldLabel required>
                    Phone
                    {phoneVerified && (
                      <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <Check size={12} /> Verified
                      </span>
                    )}
                  </FieldLabel>

                  {showOtp ? (
                    <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50 space-y-3">
                      <DevOtpBanner otp={devOtp} />
                      <OtpInput
                        phone={form.adminPhone}
                        countryCode={form.adminPhoneCountryCode}
                        channel="whatsapp"
                        onVerify={handleOtpVerify}
                        onResend={handleOtpResend}
                        onCancel={() => setShowOtp(false)}
                      />
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <span className="flex w-24 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700" aria-label="India country code plus 91">
                        🇮🇳 +91
                      </span>
                      <TextInput
                        type="tel"
                        value={form.adminPhone}
                        onChange={(e) => { set('adminPhone', e.target.value.replace(/\D/g, '')); setPhoneVerificationId(null); }}
                        placeholder="9876543210"
                        required
                        className="flex-1"
                        error={fe.adminPhone}
                      />
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={otpSending || phoneVerified || !form.adminPhone}
                        className="flex-shrink-0 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        style={phoneVerified
                          ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                          : { backgroundColor: '#1E3A5F', color: '#fff' }}
                      >
                        {otpSending ? '…' : phoneVerified ? '✓' : 'Verify'}
                      </button>
                    </div>
                  )}
                  <FieldError msg={fe.adminPhone} />
                </div>
              </div>
            </div>

            {/* ── Plan section ── */}
            <div className="mb-8 sm:mb-12">
              <SectionHeading>Choose your plan</SectionHeading>
              {plans.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#1E3A5F]/20 border-t-[#1E3A5F] rounded-full animate-spin" />
                </div>
              ) : (
                <div className="relative">
                  {planCanLeft && (
                    <button type="button" onClick={() => planScrollRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                      className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
                      style={{
                        backdropFilter: 'blur(16px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                        backgroundColor: 'rgba(255,255,255,0.65)',
                        border: '1px solid rgba(255,255,255,0.85)',
                        boxShadow: '0 4px 16px rgba(30,58,95,0.12), inset 0 1px 0 rgba(255,255,255,1)',
                      }}>
                      <ChevronLeft size={18} style={{ color: '#1E3A5F', filter: 'drop-shadow(0 1px 1px rgba(30,58,95,0.2))' }} />
                    </button>
                  )}
                  {planCanRight && (
                    <button type="button" onClick={() => planScrollRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                      className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
                      style={{
                        backdropFilter: 'blur(16px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                        backgroundColor: 'rgba(255,255,255,0.65)',
                        border: '1px solid rgba(255,255,255,0.85)',
                        boxShadow: '0 4px 16px rgba(30,58,95,0.12), inset 0 1px 0 rgba(255,255,255,1)',
                      }}>
                      <ChevronRight size={18} style={{ color: '#1E3A5F', filter: 'drop-shadow(0 1px 1px rgba(30,58,95,0.2))' }} />
                    </button>
                  )}
                <div ref={planScrollRef} className="flex gap-4 overflow-x-auto pt-5 pb-2 -mx-1 px-1 items-stretch" style={{ scrollbarWidth: 'none' }}>
                  {plans.map((p) => {
                    const isCustom = p.plan === 'CUSTOM';
                    const selected = form.plan === p.plan;
                    const priceInfo = fmtPrice(p.effectivePriceInr, p.priceMonthlyInr, p.globalDiscountPct);
                    const priceStr = typeof priceInfo === 'string' ? priceInfo : priceInfo.effective;
                    const hasDiscount = typeof priceInfo === 'object';

                    return (
                      <button
                        type="button"
                        key={p.plan}
                        onClick={() => set('plan', p.plan)}
                        style={{ minWidth: 220 }}
                        className={`relative text-left rounded-2xl border-2 p-6 transition-all cursor-pointer flex flex-col flex-shrink-0 ${
                          selected ? 'border-[#1E3A5F] bg-[#f0f5fb]' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        {(() => {
                          let eb;
                          try {
                            eb = JSON.parse(p.badges || '[]').filter(b => b.enabled && b.text);
                          } catch {
                            eb = [];
                          }
                          if (eb.length) return (
                            <div className="absolute -top-3 left-3 flex gap-1 flex-wrap max-w-[90%]">
                              {eb.slice(0, 2).map((b, bi) => (
                                <span key={bi} className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap shadow-sm"
                                  style={{ backgroundColor: b.color }}>{b.text}</span>
                              ))}
                              {eb.length > 2 && <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white bg-gray-400">+{eb.length - 2}</span>}
                            </div>
                          );
                          if (hasDiscount) return (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap bg-emerald-600">
                              {priceInfo.discountPct}% off
                            </span>
                          );
                          return null;
                        })()}
                        <p className={`text-base font-bold mb-0.5 ${selected ? 'text-[#1E3A5F]' : 'text-gray-800'}`}>{p.displayName}</p>
                        <p className="text-xs text-gray-400 mb-5">{p.tagline}</p>
                        <ul className="space-y-3 flex-1">
                          {(p.features ?? []).map((f) => (
                            <li key={f} className="flex items-start gap-2">
                              <Check size={13} className="flex-shrink-0 mt-0.5" style={{ color: selected ? '#1E3A5F' : '#9ca3af' }} />
                              <span className="text-xs text-gray-500 leading-snug">{f}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-6">
                          <span className={`text-sm font-bold ${selected ? 'text-[#1E3A5F]' : 'text-gray-600'}`}>{priceStr}</span>
                          {hasDiscount && (
                            <span className="text-xs text-gray-400 line-through ml-2">{priceInfo.original}</span>
                          )}
                          {!isCustom && <span className="text-xs text-gray-400 ml-1">/mo</span>}
                          {isCustom && <p className="text-xs text-gray-400 mt-1">Our team will reach out to discuss pricing</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4">You can upgrade anytime after activation.</p>
            </div>

            {/* Promo / Referral code */}
            <div className="mb-8">
              <SectionHeading>Promo or Referral code <span className="font-normal text-gray-400">(optional)</span></SectionHeading>
              <div className="flex gap-2">
                <input
                  value={form.promoCode}
                  onChange={e => { set('promoCode', e.target.value.toUpperCase()); setPromoResult(null); }}
                  placeholder="e.g. SUMMER25 or REF-KETHAKI"
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                />
                <button
                  type="button"
                  onClick={handleValidatePromo}
                  disabled={promoValidating || !form.promoCode.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors disabled:opacity-40"
                >
                  {promoValidating ? '…' : 'Apply'}
                </button>
              </div>
              {promoResult && (
                <div className={`mt-2 flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${
                  promoResult.valid
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {promoResult.valid ? (
                    <>
                      <Check size={15} className="mt-0.5 flex-shrink-0 text-green-600" />
                      <span>
                        <strong>{promoResult.discountPct}% off</strong> applied
                        {promoResult.referralOrgName && <> · Referred by <strong>{promoResult.referralOrgName}</strong></>}
                        {promoResult.label && <> · {promoResult.label}</>}
                      </span>
                    </>
                  ) : (
                    <span>{promoResult.errorMessage}</span>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3.5 rounded-xl bg-red-50 border border-red-100 mb-6">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            {form.plan === 'CUSTOM' && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 leading-relaxed mb-5">
                You've selected the <strong>Custom plan</strong>. Submit your details and our sales team will contact you to design a plan that works for you.
              </div>
            )}

            <LegalAcceptanceCheckbox
              id="register-legal-acceptance"
              checked={termsAccepted}
              onChange={setTermsAccepted}
              className="mb-5"
            />

            <button
              type="submit"
              disabled={loading || !termsAccepted}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </span>
              ) : (
                <>Submit application <ChevronRight size={18} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
