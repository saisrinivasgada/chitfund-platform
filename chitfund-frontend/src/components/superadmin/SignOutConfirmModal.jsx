import { LogOut } from 'lucide-react';

export default function SignOutConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-8 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mx-auto mb-5">
          <LogOut size={24} className="text-red-500" />
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-2">Sign out?</h3>
        <p className="text-sm text-gray-500 mb-8">You'll be returned to the login screen.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
