import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe, getTrustedDevices, forgetTrustedDevice, forgetCurrentBrowser } from '../../services/api';
import { getActiveDeviceToken, clearActiveDeviceToken } from '../../utils/trustedBrowser';
import { PageSpinner } from '../../components/ui/Spinner';
import EditProfileModal from '../../components/profile/EditProfileModal';
import SetLocalPasswordDialog from '../../components/auth/SetLocalPasswordDialog';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import { ArrowLeft, Pencil, MonitorSmartphone, Trash2 } from 'lucide-react';

function formatBrowserDate(value) {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${day}T12:00:00`));
}

function InfoRow({ label, value, onEdit, phoneRow }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-gray-100 last:border-0">
      <div className="w-28 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${value ? 'text-gray-800' : 'text-gray-300'}`}>
          {value || 'Not set'}
        </span>
        {phoneRow && value && (
          <span className="ml-2 text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">OTP verified</span>
        )}
      </div>
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer flex-shrink-0"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

export default function MyAccountPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [removingBrowserId, setRemovingBrowserId] = useState(null);
  const [browserError, setBrowserError] = useState('');

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

  const {
    data: trustedBrowsers = [],
    isLoading: browsersLoading,
    isError: browsersLoadError,
    refetch: refetchBrowsers,
  } = useQuery({
    queryKey: ['trusted-browsers', me?.id],
    queryFn: () => getTrustedDevices(me.id),
    enabled: Boolean(me?.id),
    retry: false,
  });

  const removeBrowser = async (browser) => {
    setBrowserError('');
    setRemovingBrowserId(browser.id);
    try {
      const currentToken = browser.current ? getActiveDeviceToken(me.id) : null;
      if (currentToken) {
        await forgetCurrentBrowser(currentToken);
        clearActiveDeviceToken(me.id);
      } else {
        await forgetTrustedDevice(browser.id);
      }
      await refetchBrowsers();
    } catch {
      setBrowserError('Could not forget this browser. Please try again.');
    } finally {
      setRemovingBrowserId(null);
    }
  };

  if (meLoading) return <PageSpinner />;
  if (!me) return <p className="text-center py-20 text-gray-400">Could not load account information.</p>;

  const initials = (me.fullName ?? me.name ?? me.username ?? 'A').slice(0, 2).toUpperCase();
  const role = authUser?.role ?? 'Admin';

  const roleColor = {
    ADMIN: '#1E3A5F', MANAGER: '#7C3AED', STAFF: '#059669',
    MEMBER: '#D97706', SUPER_ADMIN: '#9F1239',
  }[role] ?? '#1E3A5F';

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
          style={{ backgroundColor: '#D4A017' }}
        >
          {initials}
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            {me.fullName ?? me.name ?? me.username}
          </h2>
          {me.username && (
            <p className="text-sm text-gray-400 mb-1">@{me.username}</p>
          )}
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: roleColor + '18', color: roleColor }}
          >
            ★ {role}
          </span>
        </div>
      </div>

      {/* Profile info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-1">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Profile</p>
        </div>
        <div className="px-5 pb-2">
          <InfoRow label="Full Name" value={me.fullName ?? me.name} onEdit={() => setShowEditProfile(true)} />
          <InfoRow label="Username"  value={me.username ? `@${me.username}` : null} onEdit={() => setShowEditProfile(true)} />
          <InfoRow label="Email"     value={me.email}    onEdit={() => setShowEditProfile(true)} />
          <InfoRow
            label="Phone"
            value={me.phone ? `${me.phoneCountryCode ?? '+91'} ${me.phone}` : null}
            onEdit={() => setShowEditProfile(true)}
            phoneRow
          />
        </div>
      </div>

      {/* Security card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-1">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Security</p>
        </div>
        <div className="px-5 pb-2">
          <div className="flex items-center gap-3 py-3.5">
            <div className="w-28 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sign-in method</span>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800">{me.hasLocalPassword === false ? 'Google sign-in' : me.googleEmail ? 'Google and password' : 'Password'}</span>
            </div>
            {me.hasLocalPassword === false && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <button type="button" onClick={() => setShowSetPassword(true)}
                className="text-sm font-semibold text-[#1E3A5F] hover:underline cursor-pointer">
                Set a password
              </button>
            )}
            {me.hasLocalPassword !== false && (
              <button
                onClick={() => setShowEditProfile(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer"
                aria-label="Change password"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Remembered browsers can skip the login phone code until trust expires. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Remembered browsers</p>
          <p className="mt-2 text-sm text-gray-600">
            These browsers can skip the sign-in verification code. Signing in on your phone will not forget this browser.
          </p>
        </div>
        <div className="px-5 pb-4">
          {(browsersLoadError || browserError) && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {browserError || 'Could not load remembered browsers. Please try again.'}
            </p>
          )}
          {browsersLoadError && (
            <button type="button" onClick={() => refetchBrowsers()}
              className="text-sm font-semibold text-[#1E3A5F] hover:underline cursor-pointer">
              Try again
            </button>
          )}
          {browsersLoading && <p className="text-sm text-gray-500 py-3">Loading browsers…</p>}
          {!browsersLoading && !browsersLoadError && trustedBrowsers.length === 0 && (
            <p className="text-sm text-gray-500 py-3">No remembered browsers.</p>
          )}
          {!browsersLoading && !browsersLoadError && trustedBrowsers.map((browser) => (
            <div key={browser.id} className="flex items-center gap-3 py-3 border-t border-gray-100">
              <MonitorSmartphone size={18} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {browser.deviceName || 'Browser'}
                  {browser.current && <span className="ml-2 text-xs font-medium text-indigo-600">This browser</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {formatBrowserDate(browser.createdAt) && `Added ${formatBrowserDate(browser.createdAt)}`}
                  {formatBrowserDate(browser.expiresAt) && ` · Expires ${formatBrowserDate(browser.expiresAt)}`}
                  {browser.expired && ' · Expired'}
                </p>
              </div>
              <button type="button" onClick={() => removeBrowser(browser)}
                disabled={removingBrowserId !== null}
                aria-label={browser.current ? 'Forget this browser' : `Forget ${browser.deviceName || 'browser'}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 cursor-pointer">
                <Trash2 size={15} aria-hidden="true" />
                {removingBrowserId === browser.id ? 'Forgetting…' : browser.current ? 'Forget this browser' : 'Forget'}
              </button>
            </div>
          ))}
          {trustedBrowsers.length > 0 && (
            <p className="pt-2 text-xs text-gray-400">Browser names are approximate. A forgotten browser will need a verification code at its next sign in.</p>
          )}
        </div>
      </div>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => { setShowEditProfile(false); setHistoryVersion((v) => v + 1); }}
          role={authUser?.role ?? 'ADMIN'}
          currentUser={{ fullName: me.fullName, username: me.username, email: me.email, phone: me.phone, phoneCountryCode: me.phoneCountryCode, hasLocalPassword: me.hasLocalPassword }}
          userId={me.id}
        />
      )}

      {showSetPassword && <SetLocalPasswordDialog onClose={() => setShowSetPassword(false)} />}

      <ProfileChangeHistory key={historyVersion} userId={me.id} />

      <div className="rounded-2xl border border-red-100 bg-white p-5 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900">Account deletion</h3>
        <p className="mt-1 text-sm text-gray-600">Request removal of your ChitWise sign-in account. Financial records that must be kept are explained before you submit.</p>
        <button type="button" onClick={() => navigate('/delete-account')}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline">
          <Trash2 size={15} /> Delete my account
        </button>
      </div>
    </div>
  );
}
