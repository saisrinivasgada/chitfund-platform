import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle, Mail, ShieldCheck } from 'lucide-react';
import Button from '../components/ui/Button';
import OtpCodeInput from '../components/ui/OtpCodeInput';
import { Input } from '../components/ui/FormField';
import {
  forgotPasswordResetWithToken,
  getPublicChitfundRequest,
  sendChitfundRequestRecoveryEmailOtp,
  verifyChitfundRequestRecoveryEmailOtp,
} from '../services/api';

function passwordError(value) {
  if (!value || value.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return 'Use uppercase, lowercase, a number, and a special character';
  }
  return null;
}

export default function ChitfundRequestLandingPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [step, setStep] = useState('details');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const { data: request, isLoading, isError } = useQuery({
    queryKey: ['public-chitfund-request', token],
    queryFn: () => getPublicChitfundRequest(token),
    enabled: !!token,
    retry: false,
  });
  const send = useMutation({
    mutationFn: () => sendChitfundRequestRecoveryEmailOtp(token),
    onSuccess: () => { setError(''); setStep('otp'); },
    onError: (e) => setError(e.response?.data?.message ?? 'Email recovery is unavailable'),
  });
  const verify = useMutation({
    mutationFn: () => verifyChitfundRequestRecoveryEmailOtp({ token, code: otp }),
    onSuccess: (data) => { setResetToken(data.resetToken); setError(''); setStep('password'); },
    onError: (e) => setError(e.response?.data?.message ?? 'Incorrect or expired email OTP'),
  });
  const reset = useMutation({
    mutationFn: async () => {
      if (password !== confirm) throw new Error("Passwords don't match");
      const validation = passwordError(password);
      if (validation) throw new Error(validation);
      await forgotPasswordResetWithToken({ resetToken, newPassword: password });
    },
    onSuccess: () => { setError(''); setStep('done'); },
    onError: (e) => setError(e.response?.data?.message ?? e.message ?? 'Password reset failed'),
  });

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <section className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center"><Building2 className="text-[#1E3A5F]" /></div>
      {isLoading && <p className="text-sm text-gray-500">Loading Chitfund Request…</p>}
      {(!token || isError) && <><h1 className="text-xl font-bold">Request link unavailable</h1><p className="text-sm text-gray-500">This link is invalid, expired, or has been replaced. Ask the organization to resend it.</p></>}
      {request && step === 'details' && <>
        <div><h1 className="text-xl font-bold text-gray-900">{request.organizationName} wants to connect</h1><p className="text-sm text-gray-500 mt-2">Sign in to your existing ChitWise account, then verify a fresh phone OTP before accepting. Your other organizations remain private.</p></div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm"><p>Phone: <strong>{request.maskedPhone}</strong></p><p className="mt-1">Expires: {new Date(request.expiresAt).toLocaleString()}</p></div>
        <Link to="/login" className="block"><Button className="w-full"><ShieldCheck size={15}/> Sign in to continue</Button></Link>
        {request.emailRecoveryAvailable ? <button type="button" onClick={() => send.mutate()} className="w-full text-sm font-semibold text-[#1E3A5F] underline" disabled={send.isPending}>Forgot password while accepting? Verify {request.maskedEmail}</button> : <p className="text-xs text-center text-gray-500">Forgot your password? Use normal mobile-OTP recovery on the login page, or ask the organization to raise an Account Access ticket.</p>}
      </>}
      {request && step === 'otp' && <><Mail className="text-[#1E3A5F]"/><h1 className="text-xl font-bold">Verify recovery email</h1><p className="text-sm text-gray-500">Enter the six-digit code sent to {request.maskedEmail}.</p><OtpCodeInput value={otp} onChange={setOtp} length={6}/><Button className="w-full" disabled={otp.length !== 6} loading={verify.isPending} onClick={() => verify.mutate()}>Verify Email</Button></>}
      {request && step === 'password' && <><h1 className="text-xl font-bold">Choose a new password</h1><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password"/><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password"/><Button className="w-full" loading={reset.isPending} onClick={() => reset.mutate()}>Reset Password</Button></>}
      {request && step === 'done' && <><CheckCircle className="text-green-600"/><h1 className="text-xl font-bold">Password updated</h1><p className="text-sm text-gray-500">All existing sessions and trusted devices were revoked. Sign in, open Chitfund Requests, and complete the phone-OTP acceptance.</p><Link to="/login" className="block"><Button className="w-full">Sign in</Button></Link></>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}
    </section>
  </main>;
}
