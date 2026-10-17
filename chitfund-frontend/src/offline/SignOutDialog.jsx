import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { signOutWarning } from '../../../shared/offline/signOutPolicy';

export default function SignOutDialog({ selection, all, busy, unavailable, error, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKey=(event)=>{if(event.key==='Escape'&&!busy)onCancel();};
    window.addEventListener('keydown',handleKey);return()=>window.removeEventListener('keydown',handleKey);
  },[busy,onCancel]);
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="sign-out-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
      <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-5"><LogOut size={23} /></div>
      <h2 id="sign-out-title" className="text-lg font-bold text-slate-900">{selection.count ? 'Delete unsynced payments and sign out?' : all ? 'Sign out of all accounts?' : 'Sign out?'}</h2>
      <p className="text-sm text-slate-600 mt-3 leading-6">{signOutWarning(selection.count, all)}</p>
      {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-6">
        <button autoFocus disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-50">Cancel</button>
        <button disabled={busy || unavailable} onClick={onConfirm} className="rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing out…' : selection.count ? 'Sign out and delete' : 'Sign out'}</button>
      </div>
    </section>
  </div>, document.body);
}
