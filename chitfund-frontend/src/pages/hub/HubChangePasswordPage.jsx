import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff, ShieldCheck, X } from 'lucide-react';
import { hubChangePassword, setHubSaasToken, setHubToken } from '../../services/api';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { label: 'One uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { label: 'One lowercase letter', test: (password) => /[a-z]/.test(password) },
  { label: 'One number', test: (password) => /[0-9]/.test(password) },
  { label: 'One special character', test: (password) => /[^A-Za-z0-9]/.test(password) },
];

export default function HubChangePasswordPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('hub_token');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (token) setHubToken(token); }, [token]);
  if (!token) return <Navigate to="/hub-login" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    const failedRule = PASSWORD_RULES.find((rule) => !rule.test(form.newPassword));
    if (failedRule) {
      setError(`Password requires: ${failedRule.label.toLowerCase()}.`);
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError('New password must be different from the temporary password.');
      return;
    }

    setLoading(true);
    try {
      const data = await hubChangePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setHubToken(data.token);
      setHubSaasToken(data.saasToken ?? null);
      localStorage.setItem('hub_token', data.token);
      if (data.saasToken) localStorage.setItem('hub_saas_token', data.saasToken);
      const hubUser = {
        id: data.id,
        employeeId: data.employeeId,
        username: data.username,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        mustChangePassword: false,
      };
      localStorage.setItem('hub_user', JSON.stringify(hubUser));
      navigate(data.role === 'SUPER_ADMIN' ? '/superadmin' : '/hub', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Unable to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white mb-4 bg-[#1E3A5F]">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            Create your permanent password
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            You signed in with a temporary password. Replace it before continuing to the Hub.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Temporary password</label>
            <div className="relative">
              <input type={showCurrent ? 'text' : 'password'} value={form.currentPassword}
                onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value.replace(/\s/g, '') }))}
                autoComplete="current-password" required className={inputClass} />
              <button type="button" onClick={() => setShowCurrent((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
            <div className="relative">
              <input type={showNew ? 'text' : 'password'} value={form.newPassword}
                onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value.replace(/\s/g, '') }))}
                autoComplete="new-password" required className={inputClass} />
              <button type="button" onClick={() => setShowNew((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.newPassword && (
              <div className="grid grid-cols-2 gap-1.5 mt-3">
                {PASSWORD_RULES.map((rule) => {
                  const valid = rule.test(form.newPassword);
                  return <span key={rule.label} className={`flex items-center gap-1 text-xs ${valid ? 'text-green-600' : 'text-gray-400'}`}>
                    {valid ? <Check size={11} /> : <X size={11} />}{rule.label}
                  </span>;
                })}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
            <input type="password" value={form.confirmPassword}
              onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value.replace(/\s/g, '') }))}
              autoComplete="new-password" required className={inputClass} />
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 bg-[#1E3A5F]">
            {loading ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
