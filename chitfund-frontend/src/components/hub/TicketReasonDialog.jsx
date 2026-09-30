import { AlertCircle, X } from 'lucide-react';

export default function TicketReasonDialog({ action, reason, setReason, onClose, onConfirm, loading, error }) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="ticket-action-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="ticket-action-title" className="text-base font-bold text-gray-900">{action.title}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">{action.description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-40">
            <X size={17} />
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="ticket-action-reason">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea id="ticket-action-reason" autoFocus rows={4} maxLength={1000}
          value={reason} onChange={event => setReason(event.target.value)}
          placeholder="Explain why this change is needed. This becomes part of the audit history."
          className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
        <div className="mt-1 flex justify-between text-[11px] text-gray-400">
          <span>Visible in the ticket audit trail</span><span>{reason.length}/1000</span>
        </div>
        {error && <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} />{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!reason.trim() || loading}
            className="rounded-xl bg-[#1E3A5F] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {loading ? 'Saving…' : 'Confirm change'}
          </button>
        </div>
      </div>
    </div>
  );
}
