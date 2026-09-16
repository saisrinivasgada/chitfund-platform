import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setupAccount, sendSetupEmailOtp } from '../services/api';
import { BookOpen, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import OtpCodeInput from '../components/ui/OtpCodeInput';

export default function SetupAccountPage() {
  const [params]         = useSearchParams();
  const token             = params.get('token');
  const navigate          = useNavigate();

  const [newPassword, setNewPassword]     = useState('');
  const [confirmPass, setConfirmPass]     = useState('');
  const [fullName, setFullName]           = useState('');
  const [username, setUsername]           = useState('');
  const [phoneOtp, setPhoneOtp]           = useState('');
  const [email, setEmail]                 = useState('');
  const [emailOtp, setEmailOtp]           = useState('');
  const [emailOtpSent, setEmailOtpSent]   = useState(false);
  const [emailSending, setEmailSending]   = useState(false);
  const [showPass, setShowPass]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [done, setDone]                   = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirmPass) { setError("Passwords don't match"); return; }
    if (username.trim().length < 3) { setError('Choose a username with at least 3 characters'); return; }
    if (phoneOtp.length !== 6) { setError('Enter the 6-digit OTP sent to the member’s phone'); return; }
    if (!email || !emailOtpSent || emailOtp.length !== 6) { setError('Enter and verify your recovery email before continuing'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!termsAccepted) { setError('Please accept the Terms of Service to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      await setupAccount({ token, username: username.trim(), newPassword, fullName: fullName || undefined,
        phoneOtp, email, emailOtp, termsAccepted });
      setDone(true);
    } catch (err) {
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Verification complete</h2>
          <p className="text-sm text-gray-500 mb-6">Your organization must now confirm app access. You can sign in after confirmation.</p>
          <button onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl text-white font-medium text-sm cursor-pointer"
            style={{ backgroundColor: '#1E3A5F' }}>
            Sign in
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
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#EFF4FA] mb-4">
            <Lock size={22} style={{ color: '#1E3A5F' }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Set up your account
          </h2>
          <p className="text-sm text-gray-500 mt-1">Choose a secure password to activate your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Your name <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="How should we call you?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Username</label>
            <Input type="text" value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              placeholder="Choose your username" required />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Phone OTP</label>
            <p className="text-xs text-gray-500">Enter the code sent to the member’s phone.</p>
            <OtpCodeInput value={phoneOtp} onChange={setPhoneOtp} length={6} />
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Recovery email <span className="text-red-500">*</span></label>
              <p className="text-xs text-gray-500 mt-1">Verify this address now so future organization requests can be recovered safely.</p>
            </div>
            <div className="flex gap-2">
              <Input type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailOtpSent(false); setEmailOtp(''); }}
                placeholder="member@example.com" required />
              <Button type="button" variant="secondary" loading={emailSending} disabled={!email}
                onClick={async () => {
                  setError(''); setEmailSending(true);
                  try { await sendSetupEmailOtp({ token, email }); setEmailOtpSent(true); }
                  catch (err) { setError(err.response?.data?.message ?? 'Could not send email OTP'); }
                  finally { setEmailSending(false); }
                }}>Send OTP</Button>
            </div>
            {emailOtpSent && <OtpCodeInput value={emailOtp} onChange={setEmailOtp} length={6} />}
          </div>

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
              <button type="button" onClick={() => setShowPass((v) => !v)}
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

          {/* Password strength */}
          {newPassword.length > 0 && (
            <div className="space-y-1">
              {[
                { label: 'At least 8 characters', met: newPassword.length >= 8 },
                { label: 'Passwords match', met: newPassword === confirmPass && confirmPass.length > 0 },
              ].map(({ label, met }) => (
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
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer accent-[#1E3A5F]"
            />
            <span className="text-sm text-gray-600 leading-relaxed">
              I agree to the ChitWise{' '}
              <button type="button" onClick={() => window.open('/terms', '_blank')} className="underline text-[#1E3A5F] hover:opacity-75">
                Terms of Service
              </button>
              {' '}and acknowledge the{' '}
              <button type="button" onClick={() => window.open('/privacy', '_blank')} className="underline text-[#1E3A5F] hover:opacity-75">
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <Button type="submit" loading={loading} disabled={!termsAccepted} className="w-full mt-2">
            Activate account
          </Button>
        </form>
      </div>
    </div>
  );
}
