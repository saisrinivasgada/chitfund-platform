import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getOrgUserSetupDetails, sendOrgUserSetupEmailOtp, checkOrgUserSetupEmailOtp, completeOrgUserSetup } from '../services/api';
import { BookOpen, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import OtpCodeInput from '../components/ui/OtpCodeInput';
import DevOtpBanner from '../components/ui/DevOtpBanner';

export default function OrgUserSetupPage() {
  const [params]  = useSearchParams();
  const token      = params.get('token');
  const navigate   = useNavigate();

  const [emailOtp, setEmailOtp]         = useState('');
  const [otpSent, setOtpSent]           = useState(false);
  const [otpSending, setOtpSending]     = useState(false);
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPass, setConfirmPass]   = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [done, setDone]                 = useState(false);
  const [devOtp, setDevOtp]             = useState(null);
  const [otpStatus, setOtpStatus]       = useState('idle'); // idle | loading | success | error
  const [otpError, setOtpError]         = useState('');

  const passwordRules = [
    { label: 'At least 8 characters',           met: newPassword.length >= 8 },
    { label: 'One uppercase letter (A–Z)',       met: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter (a–z)',       met: /[a-z]/.test(newPassword) },
    { label: 'One number (0–9)',                 met: /[0-9]/.test(newPassword) },
    { label: 'One special character (!@#$…)',    met: /[^A-Za-z0-9]/.test(newPassword) },
    { label: 'Passwords match',                  met: newPassword === confirmPass && confirmPass.length > 0 },
  ];
  const allPasswordRulesMet = passwordRules.every(r => r.met);

  const { data: details, isLoading: detailsLoading, error: detailsError } = useQuery({
    queryKey: ['org-user-setup-details', token],
    queryFn: () => getOrgUserSetupDetails(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Invalid setup link. Please contact your administrator.</p>
          <button onClick={() => navigate('/login')} className="text-[#1E3A5F] text-sm underline">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  async function handleSendOtp() {
    setError('');
    setOtpStatus('idle');
    setOtpError('');
    setOtpSending(true);
    try {
      const data = await sendOrgUserSetupEmailOtp(token);
      setOtpSent(true);
      if (data?.devOtp) setDevOtp(data.devOtp);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not send email OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp(code) {
    if (otpStatus === 'success') return;
    setOtpStatus('loading');
    setOtpError('');
    try {
      await checkOrgUserSetupEmailOtp(token, code);
      setOtpStatus('success');
    } catch (err) {
      setOtpStatus('error');
      setOtpError(err.response?.data?.message ?? 'Incorrect code. Please try again.');
      setEmailOtp('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (otpStatus !== 'success') {
      setError('Please verify your email OTP before continuing.');
      return;
    }
    if (!allPasswordRulesMet) {
      setError('Password does not meet all requirements. Check the checklist below.');
      return;
    }
    if (!termsAccepted) { setError('Please accept the Terms of Service to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      await completeOrgUserSetup({ token, emailOtp, newPassword, termsAccepted });
      setDone(true);
    } catch (err) {
      // Show the backend's specific message verbatim (includes breached-password rejection).
      setError(err.response?.data?.message ?? 'Setup failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] px-4">
        <div className="bg-white rounded-3xl p-10 shadow-xl text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Account activated</h2>
          <p className="text-sm text-gray-500 mb-6">Your account is ready. Sign in to ChitWise.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl text-white font-medium text-sm cursor-pointer"
            style={{ backgroundColor: '#1E3A5F' }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (detailsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (detailsError || (details && (details.expired || details.used))) {
    const msg = details?.used
      ? 'This setup link has already been used.'
      : details?.expired
        ? 'This setup link has expired. Contact your administrator to resend it.'
        : 'This setup link is invalid or could not be found.';
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-gray-600 mb-4">{msg}</p>
          <button onClick={() => navigate('/login')} className="text-[#1E3A5F] text-sm underline">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
          <BookOpen size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>ChitWise</h1>
          <p className="text-xs text-gray-400">Chitfund Management Platform</p>
        </div>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#EFF4FA] mb-4">
            <Lock size={22} style={{ color: '#1E3A5F' }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Set up your account
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            You have been invited to join <strong>{details?.orgName}</strong> as <strong>{details?.role}</strong>.
          </p>
        </div>

        {/* Account summary */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-6 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Username</span>
            <span className="font-medium text-gray-800">{details?.username}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Email</span>
            <span className="font-medium text-gray-800">{details?.maskedEmail}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email OTP */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Verify your email</p>
              <p className="text-xs text-gray-500 mt-1">
                We'll send a one-time code to <strong>{details?.maskedEmail}</strong>.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Incorrect email address? Please contact{' '}
                <a href="mailto:support@thechitwise.com" className="underline text-[#1E3A5F]">
                  ChitWise Support
                </a>{' '}
                to update your email address before proceeding with verification.
              </p>
            </div>
            {!otpSent ? (
              <Button type="button" variant="secondary" loading={otpSending} onClick={handleSendOtp}>
                Send verification code
              </Button>
            ) : (
              <>
                <DevOtpBanner otp={devOtp} />
                <OtpCodeInput
                  value={emailOtp}
                  onChange={(v) => { setEmailOtp(v); if (otpStatus === 'error') setOtpStatus('idle'); setOtpError(''); }}
                  onComplete={handleVerifyOtp}
                  length={6}
                  autoFocus
                  status={otpStatus}
                />
                {otpStatus === 'success' && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle size={13} /> Verified
                  </p>
                )}
                {otpError && (
                  <p className="text-xs text-red-600">{otpError}</p>
                )}
                {otpStatus !== 'success' && (
                  <button
                    type="button"
                    className="text-xs text-[#1E3A5F] underline"
                    onClick={handleSendOtp}
                    disabled={otpSending}>
                    Resend code
                  </button>
                )}
              </>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">New password</label>
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Confirm password</label>
            <Input
              type={showPass ? 'text' : 'password'}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Repeat your password"
              required
            />
          </div>

          {newPassword.length > 0 && (
            <div className="space-y-1" data-testid="password-rules">
              {passwordRules.map(({ label, met }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${met ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={`text-xs ${met ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer accent-[#1E3A5F]"
            />
            <span className="text-sm text-gray-600 leading-relaxed">
              I agree to the ChitWise{' '}
              <button
                type="button"
                onClick={() => window.open('/terms', '_blank')}
                className="underline text-[#1E3A5F] hover:opacity-75">
                Terms of Service
              </button>
              {' '}and acknowledge the{' '}
              <button
                type="button"
                onClick={() => window.open('/privacy', '_blank')}
                className="underline text-[#1E3A5F] hover:opacity-75">
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <Button type="submit" loading={loading} disabled={!termsAccepted || otpStatus !== 'success' || !allPasswordRulesMet} className="w-full mt-2">
            Activate account
          </Button>
        </form>
      </div>
    </div>
  );
}
