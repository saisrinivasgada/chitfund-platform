import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMember } from '../../services/api';
import { MemberPortalContent } from '../member/MemberPortalPage';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Eye } from 'lucide-react';

export default function AdminMemberViewPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => getMember(memberId),
    enabled: !!memberId,
  });

  if (isLoading) return <PageSpinner />;

  const initials = (member?.fullName ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      {/* Admin banner */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
        <div className="flex items-center gap-2.5">
          <Eye size={16} className="text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            Admin preview — viewing as <strong>{member?.fullName ?? 'member'}</strong>
          </span>
        </div>
        <button
          onClick={() => navigate(`/members/${memberId}`)}
          className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
        >
          <ArrowLeft size={14} /> Exit preview
        </button>
      </div>

      {/* Member profile header */}
      {member && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: '#1E3A5F' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-2xl font-bold truncate"
                style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
              >
                {member.fullName}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-400">ID: {member.id}</span>
                {member.phone && <span className="text-xs text-gray-400">· {member.phone}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reuse the same member portal content */}
      {memberId && <MemberPortalContent memberId={memberId} />}
    </div>
  );
}
