import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, ArrowLeft } from 'lucide-react';
import { getMyInvitations, respondToInvitation } from '../../services/api';

function InvitationCard({ inv, onResponded }) {
  const isOpen = inv.status === 'OPEN';
  const chit = inv.chit ?? {};
  const isReservation = (chit.chitType ?? 'RESERVATION') === 'RESERVATION';
  const myResponse = inv.myResponse ?? {};
  const isApproved = myResponse.approved;
  const isRejected = myResponse.responseStatus === 'REJECTED';
  const responded = myResponse.responseStatus && myResponse.responseStatus !== 'PENDING';

  const [editing, setEditing] = useState(!responded && !isRejected);
  const [interested, setInterested] = useState(
    myResponse.responseStatus === 'INTERESTED' ? true
      : myResponse.responseStatus === 'NOT_INTERESTED' ? false
      : null
  );
  const [spotsRequested, setSpotsRequested] = useState(myResponse.spotsRequested ?? 1);
  const [reason, setReason] = useState(myResponse.reason ?? '');
  const [selectedDraws, setSelectedDraws] = useState(new Set(myResponse.requestedDrawNumbers ?? []));
  const [submitting, setSubmitting] = useState(false);

  const availableSlots = inv.slots ?? [];

  function toggleDraw(num) {
    setSelectedDraws(prev => {
      const n = new Set(prev);
      n.has(num) ? n.delete(num) : n.add(num);
      return n;
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      await respondToInvitation(inv.id, {
        interested,
        reason: interested === false ? (reason || undefined) : undefined,
        spotsRequested: (!isReservation && interested) ? spotsRequested : undefined,
        requestedDrawNumbers: (isReservation && interested) ? [...selectedDraws] : undefined,
      });
      setEditing(false);
      onResponded();
    } catch (err) {
      alert(err.response?.data?.message ?? 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = isReservation
    ? (interested === true ? selectedDraws.size > 0 : interested === false)
    : interested !== null;

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: '#C7D5E8' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E8EEF5', background: '#EEF2F8' }}>
        <div>
          <p className="font-semibold text-sm" style={{ color: '#1E3A5F' }}>{chit.name ?? 'Chit Fund'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Sent {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {isOpen ? 'Open' : 'Closed'}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Chit details */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {[
            ['Monthly Installment', chit.installmentAmount ? `₹${Number(chit.installmentAmount).toLocaleString('en-IN')}` : '—'],
            ['No. of Members', chit.capacity ?? '—'],
            ['Duration', chit.durationMonths ? `${chit.durationMonths} months` : '—'],
            ['Due Date', chit.monthlyDueDate ? `${chit.monthlyDueDate}th of every month` : '—'],
            ['Post-Payout Contribution', chit.defaultPostPayoutContribution ? `₹${Number(chit.defaultPostPayoutContribution).toLocaleString('en-IN')}` : '—'],
            ['Anticipated Start', chit.startDate ?? '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <span className="text-gray-400">{label}: </span>
              <span className="font-medium text-gray-700">{val}</span>
            </div>
          ))}
        </div>

        {/* Admin message — always shown prominently */}
        {inv.message && (
          <div className="rounded-lg px-4 py-3 text-sm text-gray-700" style={{ background: '#EEF2F8', borderLeft: '3px solid #1E3A5F' }}>
            {inv.message}
          </div>
        )}

        {/* Rejected */}
        {isRejected && (
          <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200">
            <p className="font-semibold">Response Not Approved</p>
            {myResponse.adminRejectionReason && (
              <p className="text-xs mt-1 text-red-600">Reason: {myResponse.adminRejectionReason}</p>
            )}
          </div>
        )}

        {/* Approved */}
        {isApproved && (
          <div className="rounded-xl px-4 py-3 text-sm font-medium text-green-700 bg-green-50 border border-green-200">
            ✓ Confirmed — {isReservation
              ? `Draw${(myResponse.approvedDrawNumbers?.length ?? 0) !== 1 ? 's' : ''} ${(myResponse.approvedDrawNumbers ?? myResponse.requestedDrawNumbers ?? []).join(', ')}`
              : `${myResponse.approvedSpots ?? myResponse.spotsRequested ?? '—'} spot${(myResponse.approvedSpots ?? myResponse.spotsRequested) !== 1 ? 's' : ''} enrolled`
            }
          </div>
        )}

        {/* Response form */}
        {!isApproved && !isRejected && editing && isOpen && (
          <>
            {isReservation && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: '#FFFBEB', borderLeft: '3px solid #D97706', color: '#92400E' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>Months shown are estimated based on anticipated start date and may shift if the chit starts earlier or later.</span>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Are you interested?</p>
              <div className="flex gap-2">
                {[true, false].map(val => (
                  <button key={String(val)} type="button" onClick={() => setInterested(val)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-all"
                    style={interested === val
                      ? { background: val ? '#1E3A5F' : '#DC2626', color: '#fff', borderColor: val ? '#1E3A5F' : '#DC2626' }
                      : { background: '#fff', color: '#6B7280', borderColor: '#D1D5DB' }}>
                    {val ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            {interested === false && (
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Reason (optional)</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="E.g. Already enrolled elsewhere…"
                  className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none"
                  style={{ borderColor: '#C7D5E8' }} />
              </div>
            )}

            {interested === true && !isReservation && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">How many spots do you want?</p>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} type="button" onClick={() => setSpotsRequested(n)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-all"
                      style={spotsRequested === n
                        ? { background: '#1E3A5F', color: '#fff', borderColor: '#1E3A5F' }
                        : { background: '#fff', color: '#6B7280', borderColor: '#D1D5DB' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {interested === true && isReservation && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-3">Select your preferred draw slots:</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {availableSlots.map(slot => {
                    const status = slot.slotStatus ?? 'AVAILABLE';
                    const isSelected = selectedDraws.has(slot.monthNumber);
                    const estMonth = slot.reservationMonth
                      ? new Date(slot.reservationMonth).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
                      : '—';
                    let bg, border, color;
                    if (status === 'RESERVED_BY_ME') { bg = '#FEF9C3'; border = '#D4A017'; color = '#92400E'; }
                    else if (status === 'RESERVED_BY_OTHER') { bg = '#F3F4F6'; border = '#D1D5DB'; color = '#9CA3AF'; }
                    else if (isSelected) { bg = '#1E3A5F'; border = '#1E3A5F'; color = '#fff'; }
                    else { bg = '#fff'; border = '#16A34A'; color = '#16A34A'; }
                    return (
                      <button key={slot.monthNumber} type="button"
                        disabled={status !== 'AVAILABLE'}
                        onClick={() => status === 'AVAILABLE' && toggleDraw(slot.monthNumber)}
                        className="rounded-xl flex flex-col items-center justify-center py-2.5 px-1 border-2 transition-all"
                        style={{ background: bg, borderColor: border, color, minHeight: 68 }}>
                        <span className="text-xs font-bold">#{slot.monthNumber}</span>
                        <span className="text-[10px] mt-0.5">{estMonth}</span>
                      </button>
                    );
                  })}
                  {availableSlots.length === 0 && (
                    <p className="col-span-4 text-xs text-gray-400 text-center py-4">No slot data available</p>
                  )}
                </div>
              </div>
            )}

            <button type="button" onClick={submit} disabled={!canSubmit || submitting}
              className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ background: '#1E3A5F' }}>
              {submitting ? 'Submitting…' : 'Submit Response'}
            </button>
          </>
        )}

        {/* Already responded — summary + edit */}
        {!isApproved && !isRejected && responded && !editing && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#EEF2F8' }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: '#1E3A5F' }}>
                Your response: {myResponse.responseStatus === 'INTERESTED' ? '✓ Interested' : '✗ Not Interested'}
              </p>
              {myResponse.responseStatus === 'INTERESTED' && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {isReservation
                    ? `Slots requested: ${(myResponse.requestedDrawNumbers ?? []).join(', ') || '—'}`
                    : `${myResponse.spotsRequested ?? '—'} spot${myResponse.spotsRequested !== 1 ? 's' : ''} requested`}
                </p>
              )}
              {myResponse.reason && <p className="text-xs text-gray-400 mt-0.5">{myResponse.reason}</p>}
            </div>
            {isOpen && (
              <button type="button" onClick={() => setEditing(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer hover:bg-white transition-colors"
                style={{ borderColor: '#C7D5E8', color: '#1E3A5F' }}>
                Edit
              </button>
            )}
          </div>
        )}

        {!isOpen && !responded && !isApproved && !isRejected && (
          <p className="text-xs text-gray-400 text-center py-2">This invitation is closed — response period has ended.</p>
        )}
      </div>
    </div>
  );
}

export default function MemberInvitationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['member-invitations'],
    queryFn: getMyInvitations,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={() => navigate('/member')}
          className="flex items-center gap-1.5 text-sm font-medium hover:underline cursor-pointer"
          style={{ color: '#1E3A5F' }}>
          <ArrowLeft size={15} /> Home
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} style={{ color: '#1E3A5F' }} />
        <h2 className="text-lg font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>Invitations</h2>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : invitations.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: '#C7D5E8' }}>
          <Bell size={28} className="mx-auto mb-3" style={{ color: '#C7D5E8' }} />
          <p className="text-gray-500 font-medium text-sm">No invitations yet</p>
          <p className="text-xs text-gray-400 mt-1">Your admin will send you a payout plan invitation when available.</p>
        </div>
      ) : (
        invitations.map(inv => (
          <InvitationCard key={inv.id} inv={inv} onResponded={() => qc.invalidateQueries({ queryKey: ['member-invitations'] })} />
        ))
      )}
    </div>
  );
}
