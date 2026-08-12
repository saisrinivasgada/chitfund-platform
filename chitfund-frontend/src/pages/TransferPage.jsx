import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { selectTenant } from '../services/api';
import { BookOpen, AlertCircle } from 'lucide-react';

export default function TransferPage() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const token    = searchParams.get('token');
  const tenantId = searchParams.get('tenantId');
  const tenantName = searchParams.get('tenantName');

  useEffect(() => {
    if (!token || !tenantId) {
      navigate('/login', { replace: true });
      return;
    }

    async function exchange() {
      try {
        const authData = await selectTenant({ loginToken: token, tenantId });
        const accessToken = authData?.accessToken ?? authData?.token;
        const role = authData?.user?.role ?? 'MEMBER';
        login(accessToken, {
          name: authData?.user?.fullName ?? authData?.user?.username,
          role,
          id: authData?.user?.id,
          mustChangePassword: authData?.user?.mustChangePassword ?? false,
        }, {
          tenantId,
          tenantSlug: authData?.tenantSlug,
          tenantName: tenantName ?? authData?.tenantName,
          tenantPlan: authData?.tenantPlan ?? 'BASIC',
        });

        if (authData?.user?.mustChangePassword) {
          navigate('/change-password', { replace: true });
        } else if (role === 'MEMBER') {
          navigate('/member', { replace: true });
        } else if (role === 'STAFF') {
          navigate('/tasks', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        setError(err?.response?.data?.message ?? 'Transfer link expired. Please log in again.');
      }
    }

    exchange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              {tenantName ? `Switching to ${tenantName}…` : 'Signing you in…'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
