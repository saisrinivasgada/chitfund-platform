import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GoogleSignInButton from './GoogleSignInButton';
import { setLocalPassword } from '../../services/api';
import { centralGoogleLoginUrl } from '../../utils/tenantHandoff';

function passwordError(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)
    || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Include an uppercase letter, lowercase letter, number, and symbol.';
  }
  return null;
}

export default function SetLocalPasswordDialog({ onClose }) {
  const queryClient = useQueryClient();
  const popupRef = useRef(null);
  const proofStateRef = useRef(null);
  const [googleIdToken, setGoogleIdToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const needsMainSite = Boolean(centralGoogleLoginUrl());

  useEffect(() => {
    function receiveProof(event) {
      if (event.origin !== 'https://thechitwise.com'
        || event.source !== popupRef.current
        || event.data?.type !== 'chitwise:google-proof'
        || event.data?.state !== proofStateRef.current
        || typeof event.data?.idToken !== 'string') return;
      setGoogleIdToken(event.data.idToken);
      setError('');
      proofStateRef.current = null;
      popupRef.current?.close();
      popupRef.current = null;
    }
    window.addEventListener('message', receiveProof);
    return () => {
      window.removeEventListener('message', receiveProof);
      popupRef.current?.close();
    };
  }, []);

  function verifyOnMainSite() {
    setError('');
    const state = crypto.randomUUID();
    proofStateRef.current = state;
    const url = new URL('https://thechitwise.com/auth/google-proof');
    url.searchParams.set('returnOrigin', window.location.origin);
    url.searchParams.set('state', state);
    popupRef.current = window.open(url.toString(), 'chitwise-google-proof', 'width=520,height=680');
    if (!popupRef.current) setError('Your browser blocked the verification window. Allow pop-ups and try again.');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!googleIdToken) { setError('Verify your Google account first.'); return; }
    const validation = passwordError(password);
    if (validation) { setError(validation); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setPending(true);
    try {
      await setLocalPassword({ googleIdToken, newPassword: password });
      setPassword('');
      setConfirm('');
      setGoogleIdToken(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (cause) {
      setError(cause?.response?.data?.message ?? 'Could not set your password. Verify with Google again and retry.');
      setGoogleIdToken(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="set-password-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="set-password-title" className="text-lg font-semibold text-[#1E3A5F]">Set a password</h2>
            <p className="mt-1 text-sm text-gray-600">Choose a password, then verify the Google account linked to ChitWise just before saving. You can use either sign-in method afterward.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl text-gray-500 hover:text-gray-800">×</button>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-gray-700">New password
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" required />
          </label>
          <label className="block text-sm font-medium text-gray-700">Confirm password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" required />
          </label>
          <div>
            {needsMainSite
              ? <button type="button" onClick={verifyOnMainSite} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Verify with Google</button>
              : <GoogleSignInButton onCredential={(token) => { setGoogleIdToken(token); setError(''); }} text="continue_with" />}
            {googleIdToken && <p className="mt-2 text-center text-sm text-green-700">Google account selected. We’ll verify it when you save.</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={pending || !googleIdToken} className="w-full rounded-lg bg-[#1E3A5F] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Set password'}</button>
        </form>
      </div>
    </div>
  );
}
