import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyMemberProfile, getMe } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Phone, Mail, MapPin, User, Clock, Pencil, FileText } from 'lucide-react';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import Modal from '../../components/ui/Modal';

export default function MemberProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const { data: member, isLoading } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn: getMyMemberProfile,
  });

  const { data: userAccount } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
  });

  const initials = (member?.fullName ?? user?.name ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors flex-shrink-0"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">My Profile</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-32 rounded-2xl bg-gray-100" />
          <div className="h-40 rounded-2xl bg-gray-100" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Avatar + name card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{member?.fullName ?? '—'}</h2>
                {userAccount?.username && (
                  <p className="text-sm text-gray-400 mt-0.5">@{userAccount.username}</p>
                )}
                {member?.status && (
                  <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                    member.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                    member.status === 'BLACKLISTED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {member.status.charAt(0) + member.status.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              {[
                {
                  icon: <Phone size={14} className="text-gray-400 flex-shrink-0" />,
                  label: 'Phone',
                  value: member?.phone
                    ? `${member.phoneCountryCode ? member.phoneCountryCode + ' ' : ''}${member.phone}`
                    : null,
                },
                {
                  icon: <Mail size={14} className="text-gray-400 flex-shrink-0" />,
                  label: 'Email',
                  value: member?.email ?? userAccount?.email ?? null,
                },
                {
                  icon: <MapPin size={14} className="text-gray-400 flex-shrink-0" />,
                  label: 'City',
                  value: member?.city ?? null,
                },
                {
                  icon: <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />,
                  label: 'Address',
                  value: member?.address ?? null,
                },
                {
                  icon: <FileText size={14} className="text-gray-400 flex-shrink-0" />,
                  label: 'PAN',
                  value: member?.panNumber ?? null,
                },
                {
                  icon: <User size={14} className="text-gray-400 flex-shrink-0" />,
                  label: 'Referred by',
                  value: member?.referredByName ?? null,
                },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  {icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 leading-none mb-0.5">{label}</p>
                    <p className={`text-sm ${value ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                      {value ?? 'Unavailable'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer"
            >
              <Pencil size={14} /> Edit Profile
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer"
            >
              <Clock size={14} /> Change History
            </button>
          </div>
        </div>
      )}

      {showEdit && (
        <EditProfileModal
          onClose={() => { setShowEdit(false); setHistoryVersion(v => v + 1); }}
          role="MEMBER"
          currentUser={{ username: userAccount?.username, email: userAccount?.email }}
          currentMember={{ fullName: member?.fullName, phone: member?.phone, email: member?.email, address: member?.address, city: member?.city }}
          userId={userAccount?.id}
        />
      )}
      {showHistory && (
        <Modal title="Profile Change History" onClose={() => setShowHistory(false)} size="md">
          <ProfileChangeHistory key={historyVersion} userId={userAccount?.id} inline />
        </Modal>
      )}
    </div>
  );
}
