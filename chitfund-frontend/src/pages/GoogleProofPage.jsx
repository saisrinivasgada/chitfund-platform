import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { googleProofTargetOrigin } from '../utils/tenantHandoff';

export default function GoogleProofPage() {
  const params = new URLSearchParams(window.location.search);
  const targetOrigin = googleProofTargetOrigin(params.get('returnOrigin'));
  const state = params.get('state');
  const ready = window.location.origin === 'https://thechitwise.com'
    && targetOrigin && /^[0-9a-f-]{36}$/.test(state ?? '') && window.opener;

  function returnCredential(idToken) {
    if (!ready || !idToken) return;
    window.opener.postMessage({ type: 'chitwise:google-proof', state, idToken }, targetOrigin);
    window.close();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8fafd] p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-[#1E3A5F]">Verify your Google account</h1>
        {ready ? (
          <>
            <p className="my-5 text-sm text-gray-600">Continue with the Google account linked to ChitWise. Then return to the open account page to set your password.</p>
            <GoogleSignInButton onCredential={returnCredential} text="continue_with" />
          </>
        ) : (
          <p role="alert" className="mt-5 text-sm text-red-600">This verification link is invalid. Close this window and try again from your account page.</p>
        )}
      </div>
    </main>
  );
}
