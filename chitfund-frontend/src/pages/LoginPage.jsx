import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../services/api';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { BookOpen, Phone, ShieldCheck, TrendingUp, Users } from 'lucide-react';

function FeaturePill({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2.5 text-white/80 text-sm">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
        <Icon size={14} className="text-white" />
      </div>
      {text}
    </div>
  );
}

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
    <div className="min-h-screen flex" style={{ backgroundColor: '#F8F9FB' }}>
      {/* ── Left panel: brand ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[44%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: '#1E3A5F' }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(212,160,23,0.15) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 50%)`,
        }} />

        {/* Top: logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#D4A017' }}
            >
              <BookOpen size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Merriweather, serif' }}>
                ChitFund
              </h1>
              <p className="text-xs text-white/50">Management Platform</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white leading-snug mb-4" style={{ fontFamily: 'Merriweather, serif' }}>
            Manage your chit funds with confidence
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Track collections, disbursements, and member activity — all in one place.
          </p>
        </div>

        {/* Middle: feature list */}
        <div className="relative z-10 space-y-4">
          <FeaturePill icon={TrendingUp} text="Real-time collection tracking" />
          <FeaturePill icon={Users} text="Member & chit fund management" />
          <FeaturePill icon={ShieldCheck} text="Secure role-based access" />
          <FeaturePill icon={BookOpen} text="Full payout & payment history" />
        </div>

        {/* Bottom: decorative stat cards */}
        <div className="relative z-10 grid grid-cols-2 gap-3">
          {[
            { label: 'Collections', value: 'Tracked' },
            { label: 'Disbursements', value: 'On time' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-white/50 text-xs mb-1">{label}</p>
              <p className="text-white font-bold text-lg">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: login form ───────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo — only visible on small screens */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
                ChitFund
              </h1>
              <p className="text-xs text-gray-400">Management Platform</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
              Welcome back
            </h2>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
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
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1 cursor-pointer"
            >
              Forgot password?
            </button>
          </form>

          {showForgot && (
            <div className="mt-5 px-4 py-4 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: '#FEF3C7' }}
                >
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

          {/* Divider */}
          <div className="mt-10 pt-6 border-t border-gray-100">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Secure', desc: 'JWT auth' },
                { label: 'Fast', desc: 'Real-time' },
                { label: 'Reliable', desc: 'Always on' },
              ].map(({ label, desc }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
