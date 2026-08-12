import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { setupAccount, selectTenant } from '../services/api';
import { BookOpen, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';

export default function SetupAccountPage() {
  const [params]         = useSearchParams();
  const token             = params.get('token');
  const { login }         = useAuth();
  const navigate          = useNavigate();

  const [newPassword, setNewPassword]     = useState('');
  const [confirmPass, setConfirmPass]     = useState('');
  const [fullName, setFullName]           = useState('');
  const [showPass, setShowPass]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [done, setDone]                   = useState(false);

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
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await setupAccount({ token, newPassword, fullName: fullName || undefined });
      // result is LoginResponse or AuthResponse
      if (result?.requiresTenantSelection && result.tenants?.length > 0) {
        if (result.tenants.length === 1) {
          const authData = await selectTenant({ loginToken: result.loginToken, tenantId: result.tenants[0].tenantId });
          const userData = { name: authData?.user?.fullName ?? authData?.user?.username, role: authData?.user?.role, id: authData?.user?.id };
          login(authData.accessToken, userData, { tenantId: result.tenants[0].tenantId, tenantSlug: result.tenants[0].slug, tenantName: result.tenants[0].name });
          navigate('/member', { replace: true });
        } else {
          navigate('/select-company', { state: { loginToken: result.loginToken, tenants: result.tenants } });
        }
      } else if (result?.accessToken) {
        const userData = { name: result?.user?.fullName ?? result?.user?.username, role: result?.user?.role, id: result?.user?.id };
        login(result.accessToken, userData);
        navigate('/member', { replace: true });
      } else {
        setDone(true);
      }
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Account activated!</h2>
          <p className="text-sm text-gray-500 mb-6">Your account is ready. Sign in to get started.</p>
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

          <Button type="submit" loading={loading} className="w-full mt-2">
            Activate account
          </Button>
        </form>
      </div>
    </div>
  );
}
