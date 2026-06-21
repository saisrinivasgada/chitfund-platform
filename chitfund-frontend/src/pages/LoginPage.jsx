import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../services/api';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { BookOpen, Phone } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginApi(form);
      // Supports both {token, user} and {accessToken, user} shapes
      const token = data?.accessToken ?? data?.token;
      const role = data?.user?.role ?? 'ADMIN';
      const mustChangePassword = data?.user?.mustChangePassword ?? false;
      const userData = {
        name: data?.user?.fullName ?? data?.user?.name ?? data?.user?.username ?? form.username,
        role,
        id: data?.user?.id,
        mustChangePassword,
      };
      login(token, userData);
      if (mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate(role === 'MEMBER' ? '/member' : role === 'WORKER' ? '/tasks' : '/');
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#F8F9FB' }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            <BookOpen size={28} className="text-white" />
          </div>
          <h1
            className="text-3xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            ChitFund
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm">Management Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h2
            className="text-xl font-semibold text-gray-900 mb-1"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Welcome back
          </h2>
          <p className="text-sm text-gray-500 mb-6">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-gray-700">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>

            <button
              type="button"
              onClick={() => setShowForgot((v) => !v)}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1"
            >
              Forgot password?
            </button>
          </form>

          {showForgot && (
            <div className="mt-4 px-4 py-4 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: '#FEF3C7' }}>
                  <Phone size={15} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900 mb-1">Contact your admin</p>
                  <p className="text-sm text-amber-700 leading-relaxed">
                    Your chit fund admin can reset your password and give you a new temporary one to log in with.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    Once you log in with the temporary password, you'll be asked to set a new permanent one.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} ChitFund Management Platform
        </p>
      </div>
    </div>
  );
}
