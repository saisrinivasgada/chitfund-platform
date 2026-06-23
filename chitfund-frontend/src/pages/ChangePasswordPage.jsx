import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../services/api';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { BookOpen, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError('New password must be different from the current one.');
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      updateUser({ mustChangePassword: false });
      navigate(user?.role === 'MEMBER' ? '/member' : '/');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F8F9FB' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            <BookOpen size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            ChitWise
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm">Management Platform</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF3F8' }}>
              <ShieldCheck size={18} className="text-[#1E3A5F]" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Set Your Password</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            {user?.mustChangePassword
              ? 'Your account was set up with a temporary password. Please set a permanent one to continue.'
              : 'Change your account password.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current (temp) password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {user?.mustChangePassword ? 'Temporary Password' : 'Current Password'}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={form.currentPassword}
                  onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  className="pr-10"
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={form.newPassword}
                  onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                  className="pr-10"
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.newPassword.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                      form.newPassword.length >= 8 + i * 4
                        ? i < 2 ? 'bg-red-400' : i === 2 ? 'bg-amber-400' : 'bg-green-400'
                        : 'bg-gray-200'
                    }`} />
                  ))}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                className={
                  form.confirmPassword && form.confirmPassword !== form.newPassword
                    ? 'border-red-300 bg-red-50'
                    : ''
                }
                placeholder="Repeat new password"
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full mt-2">
              Set New Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
