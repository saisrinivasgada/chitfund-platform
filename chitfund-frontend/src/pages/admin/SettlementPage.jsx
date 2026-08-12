import { useSearchParams } from 'react-router-dom';
import SettlementTab from './SettlementTab';

export default function SettlementPage() {
  const [searchParams] = useSearchParams();
  const initialMemberId = searchParams.get('memberId') ?? '';
  const initialSettlementId = searchParams.get('settlementId') ?? '';
  const initialPaymentId = searchParams.get('paymentId') ?? '';
  return (
    <SettlementTab
      initialMemberId={initialMemberId}
      initialSettlementId={initialSettlementId}
      initialPaymentId={initialPaymentId}
    />
  );
}
