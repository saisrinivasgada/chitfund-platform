import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SettlementTab from './SettlementTab';

export default function SettlementPage() {
  const [searchParams] = useSearchParams();
  const { settlementEnabled } = useAuth();
  const initialMemberId = searchParams.get('memberId') ?? '';
  const initialSettlementId = searchParams.get('settlementId') ?? '';
  const initialPaymentId = searchParams.get('paymentId') ?? '';

  if (!settlementEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Settlement not in your plan</h2>
        <p className="text-sm text-gray-500 max-w-sm mb-5">
          The member early-exit settlement feature is not included in your current plan.
          Contact ChitWise support to upgrade and unlock it.
        </p>
        <a
          href="mailto:help@thechitwise.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#1E3A5F' }}
        >
          Contact support to upgrade →
        </a>
      </div>
    );
  }

  return (
    <SettlementTab
      initialMemberId={initialMemberId}
      initialSettlementId={initialSettlementId}
      initialPaymentId={initialPaymentId}
    />
  );
}
