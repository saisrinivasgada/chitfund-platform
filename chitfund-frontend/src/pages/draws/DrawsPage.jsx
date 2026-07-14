import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChits, getEnrollments, getWinners, recordWinner, getMembers } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import Badge, { statusBadge } from '../../components/ui/Badge';
import FormField, { Input, Select } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  Shuffle, BookOpen, Users, Trophy, CheckCircle,
  ChevronRight, ChevronLeft, Dice5, Gavel, Calendar,
} from 'lucide-react';

// ─── Step indicator ────────────────────────────────────────────────────────
function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              i < current
                ? 'bg-[#16A34A] text-white'
                : i === current
                ? 'bg-[#1E3A5F] text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-16 ${i < current ? 'bg-[#16A34A]' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const STEPS = ['Select Chit', 'Select Draw', 'Draw Winner', 'Confirm'];

// ─── Step 1: Select Chit ───────────────────────────────────────────────────
function Step1SelectChit({ onSelect }) {
  const { data: chits = [], isLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
  });

  const activeChits = chits.filter((c) => c.status === 'ACTIVE');

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Select a Chit Fund
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">Choose the active chit fund to run a draw for.</p>
      </div>

      {activeChits.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-sm text-amber-700">
            No active chit funds found. Activate a chit fund first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeChits.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="text-left bg-white rounded-xl border border-gray-200 shadow-sm hover:border-[#1E3A5F] hover:shadow-md transition-all p-5 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#1E3A5F18' }}
                >
                  <BookOpen size={18} style={{ color: '#1E3A5F' }} />
                </div>
                <Badge variant={statusBadge(c.status)}>{c.status}</Badge>
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1E3A5F] transition-colors">
                {c.name}
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                ₹{c.installmentAmount?.toLocaleString()} &bull; {c.totalMembers} members &bull;{' '}
                <span className="font-medium">{c.winnerSelectionMode}</span>
              </p>
              <div className="mt-3 flex items-center text-sm text-[#1E3A5F] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Select this chit <ChevronRight size={14} className="ml-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Select Month ──────────────────────────────────────────────────
function Step2SelectMonth({ chit, onNext, onBack }) {
  const [month, setMonth] = useState('');

  return (
    <div className="space-y-6 max-w-sm">
      <div>
        <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Select Draw Number
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Enter the draw number for <strong>{chit.name}</strong>
        </p>
      </div>

      <FormField label="Draw Number" required>
        <Input
          type="number"
          min="1"
          max={chit.totalMembers}
          placeholder={`1 – ${chit.totalMembers}`}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </FormField>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          <ChevronLeft size={14} /> Back
        </Button>
        <Button
          onClick={() => onNext(Number(month))}
          disabled={!month || Number(month) < 1}
          className="flex-1"
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Draw ──────────────────────────────────────────────────────────
function Step3Draw({ chit, month, onNext, onBack }) {
  const [winner, setWinner] = useState(null);
  const [bids, setBids] = useState({});
  const [reservedMember, setReservedMember] = useState('');

  const { data: enrollments = [], isLoading: enrollLoading } = useQuery({
    queryKey: ['enrollments', chit.id],
    queryFn: () => getEnrollments(chit.id),
  });

  const { data: existingWinners = [] } = useQuery({
    queryKey: ['winners', chit.id],
    queryFn: () => getWinners(chit.id),
  });

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const memberMap = Object.fromEntries(allMembers.map((m) => [String(m.id), m]));
  const getName = (memberId) => memberMap[String(memberId)]?.fullName ?? memberMap[String(memberId)]?.name ?? 'Unknown';

  const wonMemberIds = new Set(existingWinners.map((w) => String(w.memberId)));
  const eligible = enrollments.filter((e) => !wonMemberIds.has(String(e.memberId)));

  if (enrollLoading) return <PageSpinner />;

  // LOTTERY mode
  if (chit.winnerSelectionMode === 'LOTTERY') {
    function drawLottery() {
      if (eligible.length === 0) return;
      const idx = Math.floor(Math.random() * eligible.length);
      setWinner(eligible[idx]);
    }

    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            Lottery Draw — Draw {month}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {eligible.length} eligible member{eligible.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Eligible members list */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {eligible.map((e) => {
            const name = getName(e.memberId);
            return (
              <div
                key={e.memberId}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  winner && e.memberId === winner.memberId
                    ? 'bg-green-50 border-l-4 border-l-green-500'
                    : ''
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  {name[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-900">{name}</span>
                {winner && e.memberId === winner.memberId && (
                  <span className="ml-auto text-xs font-bold text-green-600 flex items-center gap-1">
                    <Trophy size={12} /> WINNER
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {winner && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <Trophy size={28} className="text-green-500 mx-auto mb-2" />
            <p className="text-base font-bold text-green-800">
              {getName(winner.memberId)} wins Draw {month}!
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            <ChevronLeft size={14} /> Back
          </Button>
          <Button
            onClick={drawLottery}
            variant="warning"
            className="flex-1"
            disabled={eligible.length === 0}
          >
            <Dice5 size={15} /> {winner ? 'Draw Again' : 'Draw Winner'}
          </Button>
          {winner && (
            <Button
              onClick={() => onNext({
                winnerId: winner.memberId,
                winnerName: getName(winner.memberId),
                discountAmount: 0,
              })}
              className="flex-1"
            >
              Confirm <ChevronRight size={14} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // AUCTION mode
  if (chit.winnerSelectionMode === 'AUCTION') {
    const totalValue = (chit.installmentAmount ?? 0) * (chit.totalMembers ?? 0);
    const sortedByBid = [...eligible].sort(
      (a, b) => (bids[b.memberId] ?? 0) - (bids[a.memberId] ?? 0)
    );
    const highestBidder = sortedByBid[0];
    const highestBid = bids[highestBidder?.memberId] ?? 0;

    function awardHighest() {
      if (!highestBidder || highestBid <= 0) return;
      setWinner(highestBidder);
    }

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            Auction — Draw {month}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Enter bid (discount) amounts. Total chit value: ₹{totalValue.toLocaleString()}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Member</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Bid Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {eligible.map((e) => {
                const mid = e.memberId;
                return (
                  <tr key={mid} className={winner && mid === winner.memberId ? 'bg-green-50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {getName(mid)}
                    </td>
                    <td className="px-6 py-3">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={bids[mid] ?? ''}
                        onChange={(ev) =>
                          setBids((b) => ({ ...b, [mid]: Number(ev.target.value) }))
                        }
                        className="w-36"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {winner && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <Gavel size={28} className="text-green-500 mx-auto mb-2" />
            <p className="text-base font-bold text-green-800">
              {getName(winner.memberId)} wins with a bid of ₹{highestBid.toLocaleString()}!
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            <ChevronLeft size={14} /> Back
          </Button>
          <Button
            variant="warning"
            onClick={awardHighest}
            disabled={Object.values(bids).every((v) => !v)}
            className="flex-1"
          >
            <Gavel size={15} /> Award Highest Bidder
          </Button>
          {winner && (
            <Button
              onClick={() => onNext({
                winnerId: winner.memberId,
                winnerName: getName(winner.memberId),
                discountAmount: highestBid,
              })}
              className="flex-1"
            >
              Confirm <ChevronRight size={14} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // RESERVATION mode
  return (
    <div className="space-y-6 max-w-sm">
      <div>
        <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Reservation — Draw {month}
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">Select the member who has reserved this draw.</p>
      </div>

      <FormField label="Reserved Member" required>
        <Select value={reservedMember} onChange={(e) => setReservedMember(e.target.value)}>
          <option value="">— Select member —</option>
          {eligible.map((e) => (
            <option key={e.memberId} value={e.memberId}>
              {getName(e.memberId)}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          <ChevronLeft size={14} /> Back
        </Button>
        <Button
          disabled={!reservedMember}
          onClick={() => onNext({
            winnerId: reservedMember,
            winnerName: getName(reservedMember),
            discountAmount: 0,
          })}
          className="flex-1"
        >
          Assign <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Confirm ───────────────────────────────────────────────────────
function Step4Confirm({ chit, month, winnerData, onBack, onConfirm, loading }) {
  const totalValue = (chit.installmentAmount ?? 0) * (chit.totalMembers ?? 0);
  const winning = totalValue - (winnerData.discountAmount ?? 0);

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Confirm Winner
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">Review and confirm the draw result.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: '#D4A017' }}
          >
            {winnerData.winnerName?.[0]?.toUpperCase() ?? 'W'}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{winnerData.winnerName}</p>
            <p className="text-sm text-gray-500">Winner — Draw {month}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2">
          {[
            ['Chit Fund', chit.name],
            ['Draw Number', month],
            ['Selection Mode', chit.winnerSelectionMode],
            ['Total Chit Value', `₹${totalValue.toLocaleString()}`],
            winnerData.discountAmount
              ? ['Discount (Bid)', `₹${winnerData.discountAmount.toLocaleString()}`]
              : null,
            ['Winning Amount', `₹${winning.toLocaleString()}`],
          ]
            .filter(Boolean)
            .map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-semibold text-gray-900">{val}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          <ChevronLeft size={14} /> Back
        </Button>
        <Button onClick={onConfirm} loading={loading} className="flex-1">
          <Trophy size={15} /> Confirm Winner
        </Button>
      </div>
    </div>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────
function SuccessScreen({ chit, month, winnerData, onReset }) {
  return (
    <div className="flex flex-col items-center text-center py-12 max-w-sm mx-auto space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle size={40} className="text-green-500" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
          Winner Recorded!
        </h3>
        <p className="text-gray-500 text-sm mt-2">
          <strong>{winnerData.winnerName}</strong> has been recorded as the winner for{' '}
          <strong>{chit.name}</strong> — Draw {month}.
        </p>
      </div>
      <Button onClick={onReset} size="lg">
        <Shuffle size={16} /> Run Another Draw
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function DrawsPage() {
  const toast = useToastContext();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [selectedChit, setSelectedChit] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [winnerData, setWinnerData] = useState(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      recordWinner({
        chitId: selectedChit.id,
        monthNumber: selectedMonth,
        winnerId: winnerData.winnerId,
        discountAmount: winnerData.discountAmount ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['winners', selectedChit.id] });
      toast.success('Winner recorded successfully!');
      setSuccess(true);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to record winner');
    },
  });

  function reset() {
    setStep(0);
    setSelectedChit(null);
    setSelectedMonth(null);
    setWinnerData(null);
    setSuccess(false);
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Draw Wizard
          </h2>
        </div>
        <SuccessScreen
          chit={selectedChit}
          month={selectedMonth}
          winnerData={winnerData}
          onReset={reset}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Draw Wizard
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Run lottery, auction, or reservation draws step by step.
        </p>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <StepIndicator steps={STEPS} current={step} />
          <div className="sm:ml-4">
            <p className="text-sm font-semibold text-gray-900">{STEPS[step]}</p>
            {selectedChit && step > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedChit.name}
                {selectedMonth && ` — Draw ${selectedMonth}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 0 && (
          <Step1SelectChit
            onSelect={(chit) => {
              setSelectedChit(chit);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <Step2SelectMonth
            chit={selectedChit}
            onNext={(month) => {
              setSelectedMonth(month);
              setStep(2);
            }}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <Step3Draw
            chit={selectedChit}
            month={selectedMonth}
            onNext={(data) => {
              setWinnerData(data);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step4Confirm
            chit={selectedChit}
            month={selectedMonth}
            winnerData={winnerData}
            onBack={() => setStep(2)}
            onConfirm={() => mutation.mutate()}
            loading={mutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
