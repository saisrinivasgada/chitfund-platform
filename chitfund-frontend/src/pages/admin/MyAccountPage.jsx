import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe } from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import Button from '../../components/ui/Button';
import { ArrowLeft, Pencil } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: '#D4A017' }}
          >
            {initials}
          </div>
          <div>
            <h2
              className="text-2xl font-bold"
              style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
            >
              {me.fullName ?? me.name ?? me.username}
            </h2>
            {me.username && (
              <p className="text-sm text-gray-400 mb-1">@{me.username}{me.phone ? ` · ${me.phone}` : ''}</p>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
              ★ {authUser?.role ?? 'Admin'}
            </span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowEditProfile(true)} className="flex-shrink-0">
          <Pencil size={14} /> Edit Profile
        </Button>
      </div>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => { setShowEditProfile(false); setHistoryVersion((v) => v + 1); }}
          role={authUser?.role ?? 'ADMIN'}
          currentUser={{ fullName: me.fullName, username: me.username, email: me.email, phone: me.phone }}
          userId={me.id}
        />
      )}

      <ProfileChangeHistory key={historyVersion} userId={me.id} />
    </div>
  );
}
