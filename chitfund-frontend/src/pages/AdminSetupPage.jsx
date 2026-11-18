import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Lock, CheckCircle } from 'lucide-react';
import { setupAdminAccount } from '../services/api';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import LegalAcceptanceCheckbox from '../components/legal/LegalAcceptanceCheckbox';
import { readOneTimeLinkToken, removeOneTimeLinkTokenFromUrl } from '../utils/oneTimeLinkToken';

function passwordError(password) {
  if (password.length < 8 || password.length > 50) return 'Use 8–50 characters.';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)
      || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Include an uppercase letter, a lowercase letter, a number, and a special character.';
  }
  return null;
}

export default function AdminSetupPage() {
  const navigate = useNavigate();
  const [token] = useState(readOneTimeLinkToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Keep the one-time email token out of later browser history and referrer URLs.
    if (token) removeOneTimeLinkTokenFromUrl();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    const issue = passwordError(newPassword);
    if (issue) { setError(issue); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!termsAccepted) { setError('Review and accept the Terms of Service to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await setupAdminAccount({ token, newPassword, termsAccepted });
      setNewPassword('');
      setConfirmPassword('');
      if (result?.loginToken && result?.tenants?.length) {
        navigate('/select-company', {
          replace: true,
          state: { loginToken: result.loginToken, tenants: result.tenants },
        });
      } else {
        // Setup may have succeeded even if the session handoff is unavailable.
        setComplete(true);
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not complete setup. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1E3A5F] flex items-center justify-center">
            <BookOpen size={21} className="text-white" />
          </div>
          <span className="text-xl font-bold text-[#1E3A5F]" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-7 sm:p-9">
          {complete ? (
            <div className="text-center">
              <CheckCircle size={42} className="text-emerald-600 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Your password is ready</h1>
              <p className="text-sm text-gray-600 mb-6">Sign in to open your organization account.</p>
              <Button type="button" className="w-full" onClick={() => navigate('/login', { replace: true })}>Go to sign in</Button>
            </div>
          ) : !token ? (
            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-900 mb-2">Setup link is missing</h1>
              <p className="text-sm text-gray-600 mb-6">Open the link in your approval email. If it has expired, contact support for a new link.</p>
              <a href="mailto:help@thechitwise.com" className="text-sm font-semibold text-[#1E3A5F] underline">Contact support</a>
            </div>
          ) : (
            <>
              <div className="w-11 h-11 rounded-xl bg-[#EFF4FA] flex items-center justify-center mb-5">
                <Lock size={22} className="text-[#1E3A5F]" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>Set up your admin account</h1>
              <p className="text-sm text-gray-600 mt-2 mb-7">Your organization has been approved. Choose a password to continue.</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="admin-new-password" className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                  <Input id="admin-new-password" type="password" autoComplete="new-password" value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={50} required />
                  <p className="text-xs text-gray-500 mt-1.5">8–50 characters with upper and lowercase letters, a number, and a special character.</p>
                </div>
                <div>
                  <label htmlFor="admin-confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <Input id="admin-confirm-password" type="password" autoComplete="new-password" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                <LegalAcceptanceCheckbox
                  id="admin-setup-legal-acceptance"
                  checked={termsAccepted}
                  onChange={setTermsAccepted}
                />
                {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}
                <Button type="submit" loading={loading} disabled={!termsAccepted} className="w-full">Set password and continue</Button>
              </form>
              <p className="text-xs text-gray-500 mt-6">Link expired or already used? <a href="mailto:help@thechitwise.com" className="text-[#1E3A5F] underline">Contact support</a>.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
