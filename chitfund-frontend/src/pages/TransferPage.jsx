import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { exchangeTenantHandoff, saveDeviceToken } from '../services/api';
import { rememberActiveBrowserKey } from '../utils/trustedBrowser';
import { BookOpen, AlertCircle } from 'lucide-react';

export default function TransferPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);
  const [transfer] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return { code: fragment.get('handoff'), browserKey: fragment.get('browserKey') };
  });

  const tenantSlug = null;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Remove the single-use code before any API call or later browser navigation.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!transfer.code || !tenantSlug) {
      navigate('/login', { replace: true });
      return;
    }

    async function exchange() {
      try {
        const authData = await exchangeTenantHandoff({ code: transfer.code, tenantSlug });
        if (authData?.tenant?.slug !== tenantSlug) throw new Error('Organization address did not match the selected account.');
        const accessToken = authData?.accessToken ?? authData?.token;
        const role = authData?.user?.role ?? 'MEMBER';
        const scopedTenant = authData?.tenant;
        if (authData.deviceToken && transfer.browserKey) {
          saveDeviceToken(transfer.browserKey, authData.deviceToken);
        }
        login(accessToken, {
          name: authData?.user?.fullName ?? authData?.user?.username,
          role,
          id: authData?.user?.id,
          mustChangePassword: authData?.user?.mustChangePassword ?? false,
        }, {
          tenantId: scopedTenant.tenantId,
          tenantSlug: scopedTenant.slug,
          tenantName: scopedTenant.name,
          tenantPlan: scopedTenant?.plan ?? 'BASIC',
          tenantStatus: scopedTenant?.status ?? 'ACTIVE',
          planExpiresAt: scopedTenant?.planExpiresAt ?? null,
          analyticsEnabled: scopedTenant?.analyticsEnabled === true,
          chatEnabled: scopedTenant?.chatEnabled === true,
          settlementEnabled: scopedTenant?.settlementEnabled === true,
          addOns: Array.isArray(scopedTenant?.addOns) ? scopedTenant.addOns : [],
          offlineEnabled: typeof scopedTenant?.offlineEnabled === 'boolean' ? scopedTenant.offlineEnabled : undefined,
          adminPhone: scopedTenant?.adminPhone ?? null,
          adminEmail: scopedTenant?.adminEmail ?? null,
        });
        rememberActiveBrowserKey(authData?.user?.id, transfer.browserKey);

        if (authData?.user?.mustChangePassword) {
          navigate('/change-password', { replace: true });
        } else if (role === 'MEMBER') {
          navigate('/member', { replace: true });
        } else if (role === 'STAFF' || role === 'AGENT') {
          navigate('/tasks', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        setError(err?.response?.data?.message ?? err?.message ?? 'Transfer link expired. Please log in again.');
      }
    }

    exchange();
  }, [login, navigate, tenantSlug, transfer]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafd] to-[#eef2f7] flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1E3A5F' }}>
          <BookOpen size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>ChitWise</h1>
          <p className="text-xs text-gray-400">Switching organization…</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-gray-100 text-center">
        {error ? (
          <>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-50">
              <AlertCircle size={24} className="text-red-500" />
            </div>
            <p className="text-gray-800 font-semibold mb-1">Switch failed</p>
            <p className="text-sm text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold cursor-pointer transition-colors"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              Back to login
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#1E3A5F', borderTopColor: 'transparent' }} />
            <p className="text-sm text-gray-600">
              Signing you in to your organization…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
