import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyDeletionRequest, requestMyAccountDeletion } from '../services/api';
import { AlertTriangle, ArrowLeft, LockKeyhole, Mail, Trash2 } from 'lucide-react';

const SUPPORT_EMAIL = 'help@thechitwise.com';
const EMAIL_LINK = `mailto:${SUPPORT_EMAIL}?subject=ChitWise%20account%20deletion%20request`;

export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, isProxySession } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const keyRef = useRef(null);
  // Platform, Hub, and proxy sessions need their own identity workflow. Until
  // those endpoints exist, route them through the verified support process.
  const signedIn = Boolean(token && user && !isProxySession && user.role !== 'SUPER_ADMIN'
    && new URLSearchParams(location.search).get('source') !== 'hub');
  const separateAccountReview = Boolean(token && user && !signedIn);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    setChecked(false);
    setRequest(null);
    try {
      setRequest(await getMyDeletionRequest());
      setChecked(true);
    } catch {
      setError('We could not load your request status. You can still contact our privacy team below.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) checkStatus();
  }, [signedIn, user?.id, checkStatus]);

  const submit = async (event) => {
    event.preventDefault();
    if (!checked || confirmation !== 'DELETE' || loading || hasRequest) return;
    setLoading(true);
    setError('');
    keyRef.current ??= crypto.randomUUID();
    try {
      setRequest(await requestMyAccountDeletion(keyRef.current));
      setConfirmation('');
      setChecked(true);
    } catch (err) {
      setError(err?.response?.status === 404
        ? 'Online deletion requests are not yet available. Please email our privacy team below to start your request.'
        : err?.response?.data?.message || 'We could not submit your request. Please try again or contact our privacy team.');
    } finally {
      setLoading(false);
    }
  };

  const hasRequest = Boolean(request?.requestId || (request?.status && request.status !== 'NONE'));

  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <button type="button" onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#1E3A5F] hover:underline">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 size={22} /></div>
          <h1 className="text-2xl font-bold text-[#1E3A5F]">Delete my ChitWise account</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Request removal of your sign-in account and personal data that ChitWise no longer needs.
            We will verify your identity, give you an expected timeline, and confirm when the request is complete.
          </p>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2 font-semibold"><AlertTriangle size={17} className="mt-0.5 shrink-0" /> Financial records may need to stay</div>
            <p className="mt-2 leading-6">
              Chit, installment, payout, payment, receipt, and audit records may be retained where your organisation or applicable law requires them. We will explain what is retained and why. A request to delete your personal login does not cancel a subscription or change an outstanding balance.
              If you have a payment saved for offline syncing, resolve it before the account is removed.
            </p>
          </div>

          {signedIn ? (
            <section className="mt-7" aria-label="Signed-in account deletion request">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#1E3A5F]" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-800">Current signed-in account</p>
                  <p className="mt-1 break-words text-slate-600">{user.fullName || user.name || user.username || 'ChitWise user'}{user.tenantName ? ` · ${user.tenantName}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">This request concerns this sign-in identity across organisations linked to it. Other separately saved sign-ins are separate.</p>
                </div>
              </div>

              {!checked && (loading
                ? <p role="status" className="mt-4 text-sm text-slate-600">Checking for an existing request…</p>
                : <button type="button" onClick={checkStatus} className="mt-4 text-sm font-semibold text-[#1E3A5F] underline">Retry request status</button>)}
              {hasRequest ? (
                <div role="status" className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                  <p className="font-semibold">Request {request.status?.toLowerCase().replaceAll('_', ' ') || 'received'}</p>
                  {request.requestId && <p className="mt-1">Reference: {request.requestId}</p>}
                  {request.nextStep && <p className="mt-2">{request.nextStep}</p>}
                </div>
              ) : checked ? (
                <form onSubmit={submit} className="mt-6">
                  <label htmlFor="delete-confirmation" className="block text-sm font-semibold text-slate-800">Type DELETE to request account deletion</label>
                  <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck="false" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/15" />
                  <button type="submit" disabled={confirmation !== 'DELETE' || loading} className="mt-4 w-full rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                    {loading ? 'Submitting…' : 'Request account deletion'}
                  </button>
                </form>
              ) : null}
              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            </section>
          ) : (
            <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold">{separateAccountReview ? 'Request deletion of this account' : 'No longer have access to the app?'}</p>
              <p className="mt-1 leading-6">Email us and tell us which account you want to close. We will verify you using a registered contact method before acting. Do not send passwords, OTPs, Aadhaar, or PAN.</p>
            </div>
          )}

          <div className="mt-7 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Need help or cannot sign in?</p>
            <p className="mt-1">Contact our privacy team at <a href={EMAIL_LINK} className="font-semibold text-[#1E3A5F] underline">{SUPPORT_EMAIL}</a>.</p>
            <a href={EMAIL_LINK} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#1E3A5F] px-4 py-2.5 font-semibold text-[#1E3A5F] hover:bg-[#EFF4FA]"><Mail size={16} /> Email a deletion request</a>
            <p className="mt-5 text-xs">Read our <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/terms" className="underline">Terms of Service</Link>.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
