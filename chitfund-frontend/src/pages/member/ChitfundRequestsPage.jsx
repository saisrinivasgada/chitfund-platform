import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyChitfundRequests, sendChitfundRequestOtp, acceptChitfundRequest, declineChitfundRequest } from '../../services/api';
import OtpCodeInput from '../../components/ui/OtpCodeInput';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Building2, CheckCircle, XCircle } from 'lucide-react';

export default function ChitfundRequestsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const { data: requests = [], isLoading } = useQuery({ queryKey: ['my-chitfund-requests'], queryFn: getMyChitfundRequests });
  const accept = useMutation({
    mutationFn: async (request) => {
      await sendChitfundRequestOtp(request.id);
      setSelected(request);
    },
    onError: (e) => setError(e.response?.data?.message ?? 'Could not send OTP'),
  });
  const verify = useMutation({
    mutationFn: () => acceptChitfundRequest({ requestId: selected.id, code: otp }),
    onSuccess: () => { setSelected(null); setOtp(''); qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }); },
    onError: (e) => setError(e.response?.data?.message ?? 'Incorrect or expired OTP'),
  });
  const decline = useMutation({
    mutationFn: declineChitfundRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-chitfund-requests'] }),
  });

  return <div className="max-w-3xl mx-auto space-y-5">
    <div><h1 className="text-xl font-bold text-gray-900">Chitfund Requests</h1><p className="text-sm text-gray-500 mt-1">Organizations asking to connect their member profile to your ChitWise account.</p></div>
    {isLoading ? <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" /> : requests.length === 0 ?
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center"><CheckCircle className="mx-auto text-green-500 mb-3"/><p className="font-semibold">No pending requests</p></div> :
      requests.map((r) => <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex gap-4 items-start">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><Building2 className="text-[#1E3A5F]" size={20}/></div>
        <div className="flex-1"><p className="font-semibold text-gray-900">{r.organizationName}</p><p className="text-xs text-gray-500 mt-1">Phone {r.maskedPhone} · expires {new Date(r.expiresAt).toLocaleString()}</p><p className="text-xs font-semibold text-amber-700 mt-2">{r.status.replaceAll('_',' ')}</p></div>
        {r.status === 'PENDING_MEMBER' && <div className="flex gap-2"><Button variant="secondary" onClick={() => decline.mutate(r.id)}><XCircle size={14}/> Decline</Button><Button onClick={() => accept.mutate(r)} loading={accept.isPending}>Verify & Accept</Button></div>}
        {r.status === 'AWAITING_ADMIN' && <span className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">Activating…</span>}
      </div>)}
    {selected && <Modal title="Verify Chitfund Request" onClose={() => setSelected(null)} size="sm"><div className="space-y-4"><p className="text-sm text-gray-600">Enter the OTP sent to your registered phone. This does not share information from your other organizations.</p><OtpCodeInput value={otp} onChange={setOtp} length={6}/>{error && <p className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={otp.length !== 6} loading={verify.isPending} onClick={() => verify.mutate()}>Accept Request</Button></div></Modal>}
  </div>;
}
