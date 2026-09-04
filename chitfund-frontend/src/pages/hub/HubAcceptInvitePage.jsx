import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { hubAcceptInvite, setHubToken } from '../../services/api';

export default function HubAcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) return <Navigate to="/hub-login" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const data = await hubAcceptInvite({ token, username, password });
      setHubToken(data.token);
      localStorage.setItem('hub_token', data.token);
      localStorage.setItem('hub_user', JSON.stringify({
        id: data.id,
        employeeId: data.employeeId,
        username: data.username,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
      }));
      navigate('/hub', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'The invitation is invalid or has expired');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Set up your Hub account</h1>
          <p className="text-sm text-gray-500 mt-1">Choose the credentials you will use to sign in.</p>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}
        <input className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200" value={username}
          onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={30}
          autoComplete="username" placeholder="Username" required />
        <input className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200" type="password" value={password}
          onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={100}
          autoComplete="new-password" placeholder="Password" required />
        <input className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200" type="password" value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={100}
          autoComplete="new-password" placeholder="Confirm password" required />
        <button disabled={loading} className="w-full py-2.5 rounded-xl text-white font-semibold disabled:opacity-60 bg-[#1E3A5F]">
          {loading ? 'Activating…' : 'Activate account'}
        </button>
      </form>
    </div>
  );
}
