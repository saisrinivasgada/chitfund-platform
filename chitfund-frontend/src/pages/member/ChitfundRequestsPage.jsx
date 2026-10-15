import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyChitfundRequests, sendChitfundRequestOtp, acceptChitfundRequest, declineChitfundRequest } from '../../services/api';
import OtpCodeInput from '../../components/ui/OtpCodeInput';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Building2, CheckCircle, XCircle, AlertTriangle, Clock, Ban } from 'lucide-react';

const STATUS_CFG = {
  PENDING_MEMBER:  { label: 'Action required', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  MEMBER_VERIFIED: { label: 'Verified',         cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  AWAITING_ADMIN:  { label: 'Activating…',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ACTIVE:          { label: 'Active',            cls: 'bg-green-50 text-green-700 border-green-200' },
  SUSPENDED:       { label: 'Suspended',         cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  DECLINED:        { label: 'Declined',          cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  EXPIRED:         { label: 'Expired',           cls: 'bg-red-50 text-red-600 border-red-200' },
  REVOKED:         { label: 'Revoked',           cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  ESCALATED:       { label: 'Under review',      cls: 'bg-red-50 text-red-700 border-red-200' },
};

const STATUS_DESC = {
  PENDING_MEMBER:  'Verify your identity to accept or decline this invite.',
  MEMBER_VERIFIED: 'Identity verified. Access is being activated.',
  AWAITING_ADMIN:  'Your verification is complete. Access is being activated.',
  ACTIVE:          'You have active app access to this organisation.',
  SUSPENDED:       'Your app access for this organisation has been suspended. Contact the organisation for details.',
  DECLINED:        'You declined this access request.',
  EXPIRED:         'This request expired. Ask the organisation to send a new one.',
  REVOKED:         'App access was revoked by the organisation.',
  ESCALATED:       'This request is under manual review. ChitWise Support will be in touch.',
};

export default function ChitfundRequestsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-chitfund-requests'],
    queryFn: getMyChitfundRequests,
  });

  const begin = useMutation({
    mutationFn: async (request) => { await sendChitfundRequestOtp(request.id); setSelected(request); },
    onError: (e) => setError(e.response?.data?.message ?? 'Could not send OTP'),
  });
  const verify = useMutation({
    mutationFn: () => acceptChitfundRequest({ requestId: selected.id, code: otp }),
    onSuccess: () => { setSelected(null); setOtp(''); qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }); },
    onError: (e) => setError(e.response?.data?.message ?? 'Incorrect or expired OTP'),
  });
  const decline = useMutation({
    mutationFn: (id) => declineChitfundRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }),
    onError: (e) => setError(e.response?.data?.message ?? 'Could not decline'),
  });

  const pending = requests.filter(r => r.status === 'PENDING_MEMBER');
  const active  = requests.filter(r => r.status === 'ACTIVE');
  const rest    = requests.filter(r => !['PENDING_MEMBER', 'ACTIVE'].includes(r.status));

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ChitWise App Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          Organisations can invite you to connect your member profile to your ChitWise account.
        </p>
      </div>

      {isLoading ? (
        <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-3" />
          <p className="font-semibold text-gray-700">No access requests</p>
        </div>
      ) : (
        <>
          {[...pending, ...active, ...rest].map((r) => {
            const cfg = STATUS_CFG[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
            const desc = STATUS_DESC[r.status];
            const isSuspended = r.status === 'SUSPENDED';
            const isPending = r.status === 'PENDING_MEMBER';

            return (
              <div
                key={r.id}
                className={`bg-white border rounded-2xl p-5 flex gap-4 items-start ${isSuspended ? 'border-orange-200' : r.status === 'ACTIVE' ? 'border-green-200' : 'border-gray-200'}`}
              >
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex-shrink-0 flex items-center justify-center">
                  {isSuspended ? <Ban className="text-orange-500" size={20} /> :
                   r.status === 'EXPIRED' ? <Clock className="text-red-500" size={20} /> :
                   r.status === 'ESCALATED' ? <AlertTriangle className="text-red-600" size={20} /> :
                   <Building2 className="text-[#1E3A5F]" size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{r.organizationName}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  {r.maskedPhone && <p className="text-xs text-gray-500 mt-1">Phone: {r.maskedPhone}</p>}
                  {desc && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{desc}</p>}
                  {r.expiresAt && isPending && (
                    <p className="text-xs text-gray-400 mt-1">Expires {new Date(r.expiresAt).toLocaleString()}</p>
                  )}
                  {r.status === 'ACTIVE' && r.phoneVerificationPending && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-xs font-semibold text-amber-800">Phone verification pending</p>
                      <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                        Your phone number has not yet been verified — this will be completed automatically once SMS is available.
                        Your access is active in the meantime.
                      </p>
                    </div>
                  )}
                  {isSuspended && (
                    <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <p className="text-xs text-orange-800">
                        Contact the organisation or reach us at{' '}
                        <a href="mailto:help@thechitwise.com" className="font-semibold underline">help@thechitwise.com</a>{' '}
                        with your organisation name.
                      </p>
                    </div>
                  )}
                </div>
                {isPending && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button variant="secondary" onClick={() => setDeclineTarget(r)}>
                      <XCircle size={14} /> Decline
                    </Button>
                    <Button onClick={() => begin.mutate(r)} loading={begin.isPending}>
                      Verify &amp; Accept
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {selected && (
        <Modal title="Verify your identity" onClose={() => { setSelected(null); setOtp(''); setError(''); }} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the OTP sent to your registered phone to confirm your connection to{' '}
              <strong>{selected.organizationName}</strong>.
              Your other organisations are not affected.
            </p>
            <OtpCodeInput value={otp} onChange={setOtp} length={6} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              className="w-full"
              disabled={otp.length !== 6}
              loading={verify.isPending}
              onClick={() => verify.mutate()}
            >
              Accept &amp; connect
            </Button>
          </div>
        </Modal>
      )}

      {declineTarget && (
        <ConfirmDialog
          title="Decline access request"
          description={`Decline the request from ${declineTarget.organizationName}? You can ask the organisation to resend it if you change your mind.`}
          actionLabel="Decline"
          loading={decline.isPending}
          onConfirm={() => { decline.mutate(declineTarget.id); setDeclineTarget(null); }}
          onClose={() => setDeclineTarget(null)}
        />
      )}
    </div>
  );
}
