import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hubLogin, setHubSaasToken, setHubToken } from '../../services/api';

export default function HubLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inactivity = searchParams.get('reason') === 'inactivity';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await hubLogin({ username, password });
      setHubToken(data.token);
      setHubSaasToken(data.saasToken ?? null);
      sessionStorage.setItem('hub_token', data.token);
      if (data.saasToken) sessionStorage.setItem('hub_saas_token', data.saasToken);
      else sessionStorage.removeItem('hub_saas_token');
      localStorage.setItem('hub_user', JSON.stringify({
        id: data.id,
        employeeId: data.employeeId,
        username: data.username,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        mustChangePassword: data.mustChangePassword === true,
        canManageIdentityCases: data.canManageIdentityCases === true,
        platformOwner: data.platformOwner === true,
      }));
      navigate(data.mustChangePassword
        ? '/hub/change-password'
        : data.role === 'SUPER_ADMIN' ? '/superadmin' : '/hub', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message;
      setError(msg || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  const passwordHelpHref = `mailto:help@thechitwise.com?subject=${encodeURIComponent('ChitWise Hub password reset request')}&body=${encodeURIComponent(
    `Hello ChitWise Help,\n\nI need a temporary password for my Hub account.${username.trim() ? `\nUsername: ${username.trim()}` : ''}\n\nThank you.`,
  )}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/hub-logo.svg" alt="ChitWise Hub" className="inline-block w-20 h-20 rounded-2xl mb-4 shadow-sm" />
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            ChitWise Hub
          </h1>
          <p className="text-sm text-gray-500 mt-1">Employee portal — sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {inactivity && !error && (
            <div className="bg-amber-50 text-amber-800 text-sm rounded-xl px-4 py-2.5">
              You were signed out due to inactivity. Please sign in again.
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
              placeholder="your-username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="text-center pt-1">
            <a
              href={passwordHelpHref}
              className="text-sm text-gray-400 hover:text-[#1E3A5F] transition-colors"
            >
              Forgot password? Email ChitWise Help
            </a>
            <p className="text-[11px] text-gray-400 mt-1">
              Help will issue a temporary password for your account.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
