import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { legalDocumentUrl } from '../../../shared/legalDocumentUrl';
import {
  acceptHubLegalUpdate, acceptLegalUpdate, clearHubSaasToken, clearHubToken,
  getHubLegalReviewStatus, getLegalReviewStatus,
} from '../services/api';

const hasTermsUpdate = (status) => status?.terms?.requiresAcceptance === true;
const hasPrivacyUpdate = (status) => status?.privacy?.requiresAcknowledgment === true;
const reviewUrl = (document, kind) => legalDocumentUrl(document, kind, {
  baseUrl: window.location.origin,
  allowedOrigins: [window.location.origin, 'https://thechitwise.com'],
  relativeSameOrigin: true,
});

function UpdatedDocument({ title, document, href }) {
  return (
    <section className="border-t border-slate-200 py-5 first:border-t-0">
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 shrink-0 text-[#1E3A5F]" size={20} />
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}{document.version ? ` · version ${document.version}` : ''}</h2>
          {document.effectiveDate && <p className="mt-1 text-xs text-slate-500">Effective {document.effectiveDate}</p>}
          {document.summary && <p className="mt-2 text-sm leading-6 text-slate-700">{document.summary}</p>}
          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-[#1E3A5F] underline underline-offset-2">
            Read the full {title}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function LegalReviewPage({ hub = false }) {
  const navigate = useNavigate();
  const { isAuthenticated, isRestoring, requestLogout } = useAuth();
  const signedIn = hub ? !!sessionStorage.getItem('hub_token') : isAuthenticated;
  const restoring = !hub && isRestoring;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (restoring || !signedIn) return;
    let active = true;
    setLoading(true);
    setStatus(null);
    setError('');
    (hub ? getHubLegalReviewStatus() : getLegalReviewStatus()).then((result) => {
      if (active) setStatus(result);
    }).catch(() => {
      if (active) setError('We could not load the updated documents. Connect to the internet and try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt, hub, restoring, signedIn]);

  if (!restoring && !signedIn) return <Navigate to={hub ? '/hub-login' : '/login'} replace />;

  const termsUpdated = hasTermsUpdate(status);
  const privacyUpdated = hasPrivacyUpdate(status);
  const needsReview = termsUpdated || privacyUpdated;
  const incompleteStatus = typeof status?.required !== 'boolean'
    || (status.required === true && !needsReview);
  const validVersions = (!termsUpdated || !!status?.terms?.version)
    && (!privacyUpdated || !!status?.privacy?.version);
  const termsUrl = termsUpdated ? reviewUrl(status?.terms, 'terms') : null;
  const privacyUrl = privacyUpdated ? reviewUrl(status?.privacy, 'privacy') : null;
  const validDocuments = (!termsUpdated || !!termsUrl) && (!privacyUpdated || !!privacyUrl);

  async function submit(event) {
    event.preventDefault();
    if (!checked || !needsReview || !validVersions || !validDocuments || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await (hub ? acceptHubLegalUpdate : acceptLegalUpdate)({
        termsVersion: termsUpdated ? status.terms.version : null,
        privacyVersion: privacyUpdated ? status.privacy.version : null,
        termsAccepted: termsUpdated,
        privacyAcknowledged: privacyUpdated,
      });
      if (result?.required === true) {
        setChecked(false);
        setAttempt((value) => value + 1);
        return;
      }
      const returnKey = hub ? 'hub_legal_return_path' : 'legal_return_path';
      const savedPath = sessionStorage.getItem(returnKey);
      sessionStorage.removeItem(returnKey);
      navigate(savedPath?.startsWith('/') && !savedPath.startsWith('//') && !savedPath.startsWith('/legal-review')
        && !savedPath.startsWith('/hub/legal-review') ? savedPath : hub ? '/hub' : '/dashboard', { replace: true });
    } catch (err) {
      if ([409, 428].includes(err.response?.status)) {
        setChecked(false);
        setAttempt((value) => value + 1);
      } else {
        setError('We could not save your response. Please try again when you are online.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (hub) {
      clearHubToken();
      clearHubSaasToken();
      sessionStorage.removeItem('hub_token');
      sessionStorage.removeItem('hub_saas_token');
      sessionStorage.removeItem('hub_legal_return_path');
      localStorage.removeItem('hub_user');
      navigate('/hub-login', { replace: true });
      return;
    }
    if (await requestLogout()) navigate('/login', { replace: true });
  }

  return (
    <main className="min-h-screen bg-[#F6F8FB] px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-7 flex items-center gap-3 text-[#1E3A5F]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A5F] text-white"><BookOpen size={21} /></span>
          <span className="text-lg font-bold">ChitWise</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-9 sm:py-9">
          <ShieldCheck aria-hidden="true" size={30} className="text-[#1E3A5F]" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">Review updated documents</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Please review what changed before continuing with your account.
          </p>

          {loading ? <p role="status" className="mt-7 text-sm text-slate-600">Loading the latest documents…</p> : (
            <>
              {termsUpdated && termsUrl && <UpdatedDocument title="Terms of Service" document={status.terms} href={termsUrl} />}
              {privacyUpdated && privacyUrl && <UpdatedDocument title="Privacy Policy" document={status.privacy} href={privacyUrl} />}
              {!error && incompleteStatus && <p role="alert" className="mt-6 text-sm text-red-700">The latest document details are unavailable. Please retry.</p>}
              {!error && !needsReview && !incompleteStatus && <p className="mt-6 text-sm text-slate-600">Your documents are up to date.</p>}
              {!error && needsReview && !validVersions && <p role="alert" className="mt-5 text-sm text-red-700">The latest document version is unavailable. Please retry.</p>}
              {!error && needsReview && validVersions && !validDocuments && <p role="alert" className="mt-5 text-sm text-red-700">The full version of the updated document is unavailable. Please retry.</p>}
              {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}

              {needsReview && validVersions && validDocuments && !error && (
                <form onSubmit={submit} className="border-t border-slate-200 pt-6">
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
                    <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} required
                      className="mt-1.5 h-4 w-4 shrink-0 accent-[#1E3A5F]" />
                    <span>
                      {termsUpdated ? 'I have reviewed and agree to the updated Terms of Service' : 'I have reviewed the updated Privacy Policy'}
                      {termsUpdated && privacyUpdated ? ', and I acknowledge the updated Privacy Policy.' : '.'}
                    </span>
                  </label>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    By selecting {termsUpdated ? 'Agree & continue' : 'Acknowledge & continue'}, you confirm the statement above. A Privacy Policy acknowledgement does not give consent for a new use of your data.
                  </p>
                  <button type="submit" disabled={!checked || submitting}
                    className="mt-6 min-h-11 w-full rounded-xl bg-[#1E3A5F] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                    {submitting ? 'Saving…' : termsUpdated ? 'Agree & continue' : 'Acknowledge & continue'}
                  </button>
                </form>
              )}
              {!loading && !needsReview && !incompleteStatus && !error && <button type="button" onClick={() => navigate(hub ? '/hub' : '/dashboard', { replace: true })} className="mt-6 rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-semibold text-white">Continue to ChitWise</button>}
              {(error || incompleteStatus || !validVersions || !validDocuments) && <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-5 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">Try again</button>}
            </>
          )}
          <button type="button" onClick={signOut} className="mt-7 block text-sm text-slate-500 underline underline-offset-2">Sign out</button>
        </div>
      </div>
    </main>
  );
}
