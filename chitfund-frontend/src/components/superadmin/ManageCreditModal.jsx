import { useState } from 'react';
import { superAdminAddTenantCredit, superAdminDeductTenantCredit } from '../../services/api';
import { PlusCircle, MinusCircle } from 'lucide-react';

export default function ManageCreditModal({ tenant, onClose, onSuccess }) {
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentBalance = tenant.creditBalanceInr ?? 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a positive amount'); return; }
    setSaving(true);
    try {
      if (mode === 'add') {
        await superAdminAddTenantCredit(tenant.id, amt, notes.trim() || undefined);
        onSuccess(`₹${amt} credit added to ${tenant.name}`);
      } else {
        await superAdminDeductTenantCredit(tenant.id, amt, notes.trim() || undefined);
        onSuccess(`₹${amt} credit removed from ${tenant.name}`);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? `Failed to ${mode === 'add' ? 'add' : 'remove'} credit`);
    } finally {
      setSaving(false);
    }
  }

  const isAdd = mode === 'add';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Manage Credits</h3>
        <p className="text-xs text-gray-500 mb-4">
          <strong>{tenant.name}</strong> · Current balance:{' '}
          <strong className="text-emerald-700">₹{currentBalance.toLocaleString('en-IN')}</strong>
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setMode('add'); setError(''); setAmount(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              isAdd
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <PlusCircle size={14} />
            Add
          </button>
          <button
            type="button"
            onClick={() => { setMode('remove'); setError(''); setAmount(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              !isAdd
                ? 'bg-rose-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <MinusCircle size={14} />
            Remove
          </button>
        </div>

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
              placeholder={isAdd ? 'Reason for credit' : 'Reason for removal'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {!isAdd && amount && parseFloat(amount) > currentBalance && (
            <p className="text-xs text-amber-600">Amount exceeds balance — balance will be set to ₹0.</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors cursor-pointer ${
                isAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}>
              {saving ? (isAdd ? 'Adding…' : 'Removing…') : (isAdd ? 'Add Credit' : 'Remove Credit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
