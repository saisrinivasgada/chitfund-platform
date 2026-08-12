import { useState } from 'react';
import { superAdminAddTenantCredit } from '../../services/api';

export default function AddCreditModal({ tenant, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a positive amount'); return; }
    setSaving(true);
    try {
      await superAdminAddTenantCredit(tenant.id, amt, notes.trim() || undefined);
      onSuccess(`₹${amt} credit added to ${tenant.name}`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to add credit');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Add Credit</h3>
        <p className="text-xs text-gray-500 mb-4">
          Credit will be deducted from <strong>{tenant.name}</strong>'s next billing.
          Current balance: <strong className="text-emerald-700">₹{(tenant.creditBalanceInr ?? 0).toLocaleString('en-IN')}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
            <input
              type="number" min="1" step="1" required autoFocus
              value={amount} onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="500"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input
              type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reason for credit"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? 'Adding…' : 'Add Credit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
