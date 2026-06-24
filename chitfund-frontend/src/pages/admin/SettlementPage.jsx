import { useSearchParams } from 'react-router-dom';
import SettlementTab from './SettlementTab';

export default function SettlementPage() {
  const [searchParams] = useSearchParams();
  const initialMemberId = searchParams.get('memberId') ?? '';
  return <SettlementTab initialMemberId={initialMemberId} />;
}
