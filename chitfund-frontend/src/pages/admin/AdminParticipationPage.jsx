import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserById, getOrgReservations } from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Building2, CheckCircle, Layers } from 'lucide-react';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';

export default function AdminParticipationPage() {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const { hidden } = useHiddenAmounts();

  const { data: adminUser, isLoading: userLoading } = useQuery({
    queryKey: ['user', adminId],
    queryFn: () => getUserById(adminId),
    enabled: !!adminId,
  });

  const { data: orgSlots = [], isLoading: orgLoading } = useQuery({
    queryKey: ['org-reservations'],
    queryFn: getOrgReservations,
    staleTime: 30_000,
  });

  if (userLoading) return <PageSpinner />;

  const name = adminUser?.fullName ?? adminUser?.username ?? 'Admin';
  const initials = name.slice(0, 2).toUpperCase();
  const activeSlots = orgSlots.filter((s) => s.status === 'RESERVED');
  const realizedSlots = orgSlots.filter((s) => s.status === 'PROCESSED');

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1E3A5F] transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Admin profile card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: '#B45309' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                {name}
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                ★ {adminUser?.role ?? 'Admin'}
              </span>
            </div>
            {adminUser?.username && adminUser.username !== adminUser.fullName && (
              <p className="text-sm text-gray-500 mt-0.5">@{adminUser.username}</p>
            )}
            {adminUser?.email && (
              <p className="text-xs text-gray-400 mt-0.5">{adminUser.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{activeSlots.length}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <Layers size={11} /> Active Org Slots
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{realizedSlots.length}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <CheckCircle size={11} /> Realized Slots
          </p>
        </div>
      </div>

      {/* Organization Holdings (view-only) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Organization Holdings</h3>
          {orgSlots.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">{orgSlots.length} slot{orgSlots.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          These slots belong to the organization and are shared across all admins.
        </p>

        {orgLoading ? (
          <PageSpinner />
        ) : orgSlots.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No organization-held slots yet.</p>
        ) : (
          <div className="space-y-3">
            {activeSlots.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active · {activeSlots.length}</p>
                <div className="space-y-2">
                  {activeSlots.map((s) => (
                    <OrgSlotRow key={s.id} slot={s} />
                  ))}
                </div>
              </div>
            )}
            {realizedSlots.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Realized · {realizedSlots.length}</p>
                <div className="space-y-2">
                  {realizedSlots.map((s) => (
                    <OrgSlotRow key={s.id} slot={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgSlotRow({ slot }) {
  const isRealized = slot.status === 'PROCESSED';
  const date = slot.reservationMonth
    ? new Date(slot.reservationMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${isRealized ? 'bg-gray-50 border-gray-100' : 'border-[#1E3A5F]/20 bg-blue-50/30'}`}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: isRealized ? '#6B7280' : '#1E3A5F' }}
      >
        D{slot.monthNumber}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{slot.chitName ?? 'Unknown Chit'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Draw #{slot.monthNumber} · {date}
          {slot.payoutAmount ? ` · ${hidden ? '••••••' : `₹${Number(slot.payoutAmount).toLocaleString('en-IN')}`}` : ''}
        </p>
        {isRealized && slot.updatedAt && (
          <p className="text-xs text-green-600 mt-0.5">
            Realized {new Date(slot.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        {isRealized ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            <CheckCircle size={11} /> Realized
          </span>
        ) : slot.eligibleToRealize ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            Ready to realize
          </span>
        ) : (
          <span className="text-xs text-gray-400 px-2 py-1">Pending draw</span>
        )}
      </div>
    </div>
  );
}
