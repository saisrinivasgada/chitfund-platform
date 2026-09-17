import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { hubGetMe, hubUpdateMe } from '../../services/api';

const INPUT_CLS = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10 bg-white';

export default function HubProfileModal({ onClose }) {
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    hubGetMe()
      .then(u => setForm({ fullName: u.fullName ?? '', email: u.email ?? '' }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const initials = form.fullName
    ? form.fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
    : 'H';

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await hubUpdateMe({ fullName: form.fullName || null, email: form.email || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-gray-900">Edit Profile</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#1E3A5F]/30 border-t-[#1E3A5F] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7c)' }}
              >
                {initials}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input
                  className={INPUT_CLS}
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  className={INPUT_CLS}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@chitwise.com"
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-6 w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: saved ? '#10B981' : '#1E3A5F' }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
