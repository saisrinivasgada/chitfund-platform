import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe } from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import { ArrowLeft, Pencil } from 'lucide-react';

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
  const [historyVersion, setHistoryVersion] = useState(0);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

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
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password</span>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800">••••••••</span>
            </div>
            <button
              onClick={() => setShowEditProfile(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#EFF4FA] transition-colors cursor-pointer"
            >
              <Pencil size={13} />
            </button>
          </div>
        </div>
      </div>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => { setShowEditProfile(false); setHistoryVersion((v) => v + 1); }}
          role={authUser?.role ?? 'ADMIN'}
          currentUser={{ fullName: me.fullName, username: me.username, email: me.email, phone: me.phone, phoneCountryCode: me.phoneCountryCode }}
          userId={me.id}
        />
      )}

      <ProfileChangeHistory key={historyVersion} userId={me.id} />
    </div>
  );
}
