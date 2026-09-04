import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function roleRedirect(role) {
  if (role === 'MEMBER') return '/member';
  return '/dashboard';
}

export default function ProxyPage() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    if (!token) { navigate('/login'); return; }

    const claims = decodeJwtPayload(token);
    if (!claims) { navigate('/login'); return; }

    const userData = {
      id:       claims.sub,
      username: claims.username,
      role:     claims.role,
    };

    const tenantData = {
      tenantId:      claims.tenantId,
      tenantSlug:    claims.tenantSlug,
      tenantName:    params.get('tenantName') ?? undefined,
      tenantPlan:    claims.tenantPlan ?? 'BASIC',
      tenantStatus:  'ACTIVE',
      planExpiresAt: null, // proxy sessions bypass plan-expiry gate
    };

    login(token, userData, tenantData, { proxy: true });
    navigate(roleRedirect(claims.role), { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 text-gray-500">
        <div className="w-8 h-8 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Opening proxy session…</p>
      </div>
    </div>
  );
}
