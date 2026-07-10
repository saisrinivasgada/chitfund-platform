import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMe, getOrgReservations, realizeOrgPayout } from '../../services/api';
import { PageSpinner } from '../../components/ui/Spinner';
import EditProfileModal from '../../components/profile/EditProfileModal';
import ProfileChangeHistory from '../../components/profile/ProfileChangeHistory';
import Button from '../../components/ui/Button';
import { ArrowLeft, Building2, Pencil, CheckCircle } from 'lucide-react';
import { useToastContext } from '../../components/layout/AppLayout';

function OrgSlotCard({ slot, onRealize, isRealizing }) {
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
          {slot.payoutAmount ? ` · ₹${Number(slot.payoutAmount).toLocaleString('en-IN')}` : ''}
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
          <Button
            variant="primary"
            size="sm"
            disabled={isRealizing}
            onClick={() => {
              if (window.confirm(`Realize ₹${Number(slot.payoutAmount).toLocaleString('en-IN')} payout for Draw #${slot.monthNumber} to treasury?\n\nThis marks the slot as processed. No cash movement occurs.`)) {
                onRealize(slot);
              }
            }}
          >
            Realize to Treasury
          </Button>
        ) : (
          <span className="text-xs text-gray-400 px-2 py-1">Pending draw</span>
        )}
      </div>
    </div>
  );
}

export default function MyAccountPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const qc = useQueryClient();
  const toast = useToastContext();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

  const { data: orgSlots = [], isLoading: orgLoading } = useQuery({
    queryKey: ['org-reservations'],
    queryFn: getOrgReservations,
    staleTime: 30_000,
  });

  const realizeMut = useMutation({
    mutationFn: realizeOrgPayout,
    onSuccess: () => {
      toast.success('Payout realized to treasury');
      qc.invalidateQueries({ queryKey: ['org-reservations'] });
    },
    onError: (e) => {
      toast.error(e.response?.data?.message ?? 'Failed to realize payout');
    },
  });

  if (meLoading) return <PageSpinner />;
  if (!me) return <p className="text-center py-20 text-gray-400">Could not load account information.</p>;

  const initials = (me.fullName ?? me.name ?? me.username ?? 'A').slice(0, 2).toUpperCase();
  const activeSlots = orgSlots.filter((s) => s.status === 'RESERVED');
  const realizedSlots = orgSlots.filter((s) => s.status === 'PROCESSED');

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <ArrowLeft size={16} className="text-gray-600" />
      </button>

      {/* Header */}
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
              ★ Admin
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

      {/* Org Holdings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-[#1E3A5F]" />
          <h3 className="font-semibold text-gray-900">Organization Holdings</h3>
          {orgSlots.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">{orgSlots.length} slot{orgSlots.length !== 1 ? 's' : ''}</span>
          )}
        </div>

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
                    <OrgSlotCard
                      key={s.id}
                      slot={s}
                      onRealize={(slot) => realizeMut.mutate({ chitId: slot.chitId, reservationId: slot.id })}
                      isRealizing={realizeMut.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
            {realizedSlots.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Realized · {realizedSlots.length}</p>
                <div className="space-y-2">
                  {realizedSlots.map((s) => (
                    <OrgSlotCard key={s.id} slot={s} onRealize={() => {}} isRealizing={false} />
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
