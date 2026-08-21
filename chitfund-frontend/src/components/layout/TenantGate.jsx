import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { requestRenewal, getMyBillingInfo } from '../../services/api';
import { AlertTriangle, PhoneCall, Mail, Clock } from 'lucide-react';

const SUPPORT_EMAIL = 'saisrinivasgada@gmail.com';
const SUPPORT_WHATSAPP = 'https://wa.me/919999999999'; // update with real number

function ContactSupportModal({ reason }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mx-auto mb-4">
          <PhoneCall size={24} className="text-amber-600" />
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-2">Contact ChitWise Support</h3>
        <p className="text-sm text-gray-500 mb-6">{reason}</p>
        <div className="space-y-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Account Issue - ${reason}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Mail size={15} />
            Email Support
          </a>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#25D366' }}
          >
            <PhoneCall size={15} />
            WhatsApp Support
          </a>
          <button
            className="text-xs text-gray-400 hover:text-gray-600 mt-1 cursor-pointer"
            onClick={() => { /* raise ticket — placeholder */ alert('Ticket system coming soon!'); }}
          >
            Raise a support ticket →
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingActivationScreen({ orgName }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-10 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 mx-auto mb-5">
          <Clock size={28} className="text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Pending Activation</h2>
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-semibold">{orgName}</span> is awaiting approval from ChitWise.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          Your account has been created successfully. Our team will review and activate your organization shortly — usually within 24 hours.
        </p>
        <div className="space-y-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Activation Request - ${orgName}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Mail size={15} />
            Email Support
          </a>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#25D366' }}
          >
            <PhoneCall size={15} />
            WhatsApp Support
          </a>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="text-xs text-gray-400 hover:text-gray-600 mt-2 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function SuspendedAdminScreen({ orgName }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-10 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 mx-auto mb-5">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Account Suspended</h2>
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-semibold">{orgName}</span> has been suspended by ChitWise.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          All operations are paused. Please contact support to resolve this.
        </p>
        <div className="space-y-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Account Suspended - ${orgName}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Mail size={15} />
            Email Support
          </a>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#25D366' }}
          >
            <PhoneCall size={15} />
            WhatsApp Support
          </a>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="text-xs text-gray-400 hover:text-gray-600 mt-2 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactAdminScreen({ orgName, reason }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const msg = reason === 'suspended'
    ? `${orgName} has been suspended. Your access is temporarily unavailable.`
    : `${orgName}'s plan has expired. You cannot access the portal until the admin renews.`;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-10 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 mx-auto mb-5">
          <AlertTriangle size={28} className="text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Access Unavailable</h2>
        <p className="text-sm text-gray-500 mb-8">{msg} Please contact your organization admin.</p>
        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="text-sm font-medium text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function PlanExpiredAdminBanner({ orgName, plan }) {
  const navigate = useNavigate();
  return (
    <div className="w-full px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-3 text-sm bg-red-600 text-white">
      <Clock size={15} className="flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="font-semibold">{orgName}</span> — your {plan ?? 'current'} plan has <span className="font-semibold">expired</span>. Creating chits, running draws, and recording payments is blocked.
      </span>
      <button
        onClick={() => navigate('/billing')}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
      >
        Go to Billing →
      </button>
    </div>
  );
}

function ExpiryWarningBanner({ daysLeft, orgName, plan, onDismiss }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const isUrgent = daysLeft <= 2;
  const label = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

  async function handleRenew() {
    setSending(true);
    try {
      await requestRenewal();
      setSent(true);
    } catch {
      // ignore, still show UI
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`w-full px-5 py-3 flex items-center gap-3 text-sm ${isUrgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
      <Clock size={15} className="flex-shrink-0" />
      <span className="flex-1">
        {sent
          ? <><span className="font-semibold">Renewal request sent!</span> Our team will contact you shortly.</>
          : <><span className="font-semibold">{orgName}</span> — your {plan} plan expires <span className="font-semibold">{label}</span>. Renew now to avoid interruption.</>
        }
      </span>
      {!sent && (
        <button
          onClick={handleRenew}
          disabled={sending}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Renew Now'}
        </button>
      )}
      <button onClick={onDismiss} className="flex-shrink-0 text-white/70 hover:text-white cursor-pointer ml-1 text-lg leading-none">
        ×
      </button>
    </div>
  );
}

export default function TenantGate() {
  const { user, tenantId, tenantName, tenantPlan, tenantStatus, planExpiresAt, isProxySession, isAuthenticated } = useAuth();
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    const key = `banner_dismissed_${tenantId}`;
    const val = sessionStorage.getItem(key);
    return val === 'true';
  });

  const role = user?.role;
  const now = new Date();

  // Always fetch billing info for admin — gives us fresh planExpiresAt (JWT can be stale)
  // and credit balance to suppress the banner when credit covers the renewal
  const { data: billing } = useQuery({
    queryKey: ['my-billing-info'],
    queryFn: getMyBillingInfo,
    enabled: isAuthenticated && !!tenantId && role === 'ADMIN',
    staleTime: 5 * 60 * 1000,
  });

  // Prefer fresh planExpiresAt from billing API over stale JWT value
  const effectiveExpiresAt = billing?.planExpiresAt ?? planExpiresAt;
  const expiresAt = effectiveExpiresAt ? new Date(effectiveExpiresAt) : null;
  const isExpired = expiresAt && expiresAt < now;
  const daysLeft = expiresAt && !isExpired
    ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
    : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 7;

  const creditCoversRenewal = billing
    ? Number(billing.creditBalanceInr ?? 0) >= Number(billing.effectivePriceInr ?? 0)
    : false;

  // Super-admin has no tenant — always pass through
  if (!tenantId || role === 'SUPER_ADMIN') {
    return <Outlet />;
  }

  // ── PENDING ACTIVATION ──────────────────────────────────────────────────────
  if (tenantStatus === 'PENDING') {
    return <PendingActivationScreen orgName={tenantName} />;
  }

  // ── SUSPENDED ───────────────────────────────────────────────────────────────
  if (tenantStatus === 'SUSPENDED') {
    if (role === 'ADMIN') {
      // Admin can view data but all writes blocked at backend; show persistent banner
      return (
        <>
          <div className="w-full px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-3 text-sm bg-red-700 text-white">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="font-semibold">{tenantName}</span> has been <span className="font-semibold">suspended</span>. You can view data but creating or modifying records is blocked. Contact ChitWise support.
            </span>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Account Suspended - ${tenantName}`}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors whitespace-nowrap">
              Contact Support
            </a>
          </div>
          <Outlet />
        </>
      );
    }
    return <ContactAdminScreen orgName={tenantName} reason="suspended" />;
  }

  // ── PLAN EXPIRED ────────────────────────────────────────────────────────────
  if (isExpired) {
    if (role === 'ADMIN') {
      // Admin can still navigate; individual pages gate create actions
      return (
        <>
          <PlanExpiredAdminBanner orgName={tenantName} plan={tenantPlan} />
          <Outlet />
        </>
      );
    }
    if (role === 'MEMBER') {
      // Member can view their data but cash requests are blocked (handled per-page)
      return (
        <>
          <div className="w-full px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-sm bg-amber-600 text-white">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="font-semibold">{tenantName}</span>'s plan has expired. You can view your details, but cash requests are temporarily unavailable. Contact your administrator.
            </span>
          </div>
          <Outlet />
        </>
      );
    }
    return <ContactAdminScreen orgName={tenantName} reason="expired" />;
  }

  // ── PROXY SESSION BANNER ─────────────────────────────────────────────────
  const proxyBanner = isProxySession && (
    <div className="w-full px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-sm bg-violet-700 text-white">
      <span className="text-xs font-bold uppercase tracking-widest opacity-75">Proxy</span>
      <span className="flex-1 min-w-0">
        Viewing as <span className="font-semibold">{user?.username}</span>
        {tenantName && <> · <span className="font-semibold">{tenantName}</span></>}
        {role && <> · <span className="opacity-75">{role}</span></>}
      </span>
      <button
        onClick={() => window.close()}
        className="flex-shrink-0 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors whitespace-nowrap"
      >
        Close tab
      </button>
    </div>
  );

  // ── EXPIRING SOON (admin only) + normal outlet ───────────────────────────
  return (
    <>
      {proxyBanner}
      {expiringSoon && role === 'ADMIN' && !bannerDismissed && !creditCoversRenewal && (
        <ExpiryWarningBanner
          daysLeft={daysLeft}
          orgName={tenantName}
          plan={tenantPlan}
          onDismiss={() => {
            sessionStorage.setItem(`banner_dismissed_${tenantId}`, 'true');
            setBannerDismissed(true);
          }}
        />
      )}
      <Outlet />
    </>
  );
}
