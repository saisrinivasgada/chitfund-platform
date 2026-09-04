import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { getAuction, placeBid, closeAuction, extendAuction, voidAuction, getMembers, listStaff, getEnrollments } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToastContext } from '../../components/layout/AppLayout';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import FormField, { Input } from '../../components/ui/FormField';
import Modal from '../../components/ui/Modal';
import { Trophy, Gavel, TrendingDown, CheckCircle, Timer, Plus, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Countdown Hook ────────────────────────────────────────────────────────────
function useCountdown(closesAtStr) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!closesAtStr) { setSecondsLeft(null); return; }
    const target = new Date(closesAtStr).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAtStr]);

  return secondsLeft;
}

// ─── Offline Close Modal ───────────────────────────────────────────────────────
function OfflineCloseModal({ chitId, auctionId, memberMap, onClose }) {
  const qc    = useQueryClient();
  const toast = useToastContext();
  const [winnerId,  setWinnerId]  = useState('');
  const [wonAmount, setWonAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () => closeAuction({ chitId, auctionId, winnerId, wonAmount: Number(wonAmount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auction', chitId, auctionId] });
      toast.success('Auction closed — payment records created');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to close auction'),
  });

  const members = Object.entries(memberMap).map(([id, name]) => ({ id, name }));

  return (
    <Modal title="Close Offline Auction" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Enter the winner and the amount they agreed to accept from the physical meeting.
        </p>
        <FormField label="Winner" required>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={winnerId}
            onChange={(e) => setWinnerId(e.target.value)}
          >
            <option value="">Select winner…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Won Amount (₹)" required>
          <Input
            type="number"
            placeholder="e.g. 15500"
            value={wonAmount}
            onChange={(e) => setWonAmount(e.target.value)}
          />
        </FormField>
        <div className="flex gap-3 pt-1">
          <Button variant="muted" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            size="md" className="flex-1"
            disabled={!winnerId || !wonAmount}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Close & Record Winner
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Extend Time Modal ─────────────────────────────────────────────────────────
function ExtendTimeModal({ chitId, auctionId, onExtended, onClose }) {
  const toast = useToastContext();
  const [minutes, setMinutes] = useState('15');

  const mutation = useMutation({
    mutationFn: () => extendAuction({ chitId, auctionId, additionalMinutes: Number(minutes) }),
    onSuccess: (updated) => {
      toast.success(`Timer extended by ${minutes} minutes`);
      onExtended(updated);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to extend timer'),
  });

  return (
    <Modal title="Extend Auction Timer" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Add more time to the running auction. The new deadline will be broadcast to all bidders instantly.</p>
        <div className="grid grid-cols-4 gap-2">
          {['5', '10', '15', '30'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={`py-2 rounded-xl text-sm font-semibold border transition-colors
                ${minutes === m ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#1E3A5F]'}`}
            >
              +{m}m
            </button>
          ))}
        </div>
        <FormField label="Or enter custom minutes">
          <Input
            type="number"
            min="1"
            max="120"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </FormField>
        <div className="flex gap-3 pt-1">
          <Button variant="muted" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            size="md" className="flex-1"
            disabled={!minutes || Number(minutes) < 1}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Plus size={14} /> Add {minutes}m
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Auction Room ─────────────────────────────────────────────────────────
export default function AuctionRoomPage() {
  const { chitId, auctionId } = useParams();
  const { user }  = useAuth();
  const toast     = useToastContext();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const stompRef  = useRef(null);
  const prevBidCountRef = useRef(0);

  const isAdmin  = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [bidAmount,        setBidAmount]        = useState('');
  const [proxyMemberId,    setProxyMemberId]    = useState('');
  const [proxyBidAmount,   setProxyBidAmount]   = useState('');
  const [showOfflineClose, setShowOfflineClose] = useState(false);
  const [showExtendTime,   setShowExtendTime]   = useState(false);
  const [liveData,         setLiveData]         = useState(null);
  const wasWinningRef = useRef(false);

  const { data: auction, isLoading } = useQuery({
    queryKey: ['auction', chitId, auctionId],
    queryFn: () => getAuction(chitId, auctionId),
    refetchOnWindowFocus: false,
  });

  const { data: members  = [] } = useQuery({ queryKey: ['members'],  queryFn: getMembers });
  const { data: staffList = [] } = useQuery({ queryKey: ['staff'],   queryFn: listStaff });
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
    enabled: isAdmin,
  });

  const memberMap = Object.fromEntries([
    ...staffList.map((s) => [String(s.id), s.fullName ?? s.username ?? '—']),
    ...members.map((m)   => [String(m.id), m.fullName ?? m.name ?? '—']),
  ]);

  // Active enrolled members — backend rejects past winners with a clear error
  const biddableEnrolledMembers = enrollments
    .filter((e) => e.active)
    .map((e) => ({ id: String(e.memberId), name: memberMap[String(e.memberId)] ?? '—' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const data    = liveData ?? auction;
  const isOpen   = data?.status === 'OPEN';
  const isClosed = data?.status === 'CLOSED';
  const isOnline = data?.auctionMode === 'ONLINE';

  const secondsLeft = useCountdown(isOpen ? data?.closesAt : null);
  const timerUrgent = secondsLeft !== null && secondsLeft <= 60;

  // ── WebSocket (ONLINE mode only) ───────────────────────────────────────────
  useEffect(() => {
    if (!auctionId || !isOnline) return;

    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE}/ws/auction`),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        client.subscribe(`/topic/auction/${auctionId}`, (msg) => {
          try {
            const updated = JSON.parse(msg.body);
            setLiveData((prev) => {
              const prevCount    = prev?.bids?.length ?? prevBidCountRef.current;
              const newCount     = updated?.bids?.length ?? 0;
              const newLeaderId  = updated?.bids?.[0]?.memberId;
              const myMemberId   = user?.memberId;

              if (newCount > prevCount && updated.status === 'OPEN') {
                const winnerName = memberMap[String(newLeaderId)] ?? 'Someone';
                toast.info(`${winnerName} bid ₹${fmt(updated.bids[0]?.bidAmount)} — now leading!`);

                // Tell the bidder they've been outbid if they were previously winning
                if (myMemberId && wasWinningRef.current && String(newLeaderId) !== String(myMemberId)) {
                  toast.warning("You've been outbid! Place a lower bid to take the lead.");
                }
              }
              wasWinningRef.current = !!myMemberId && String(newLeaderId) === String(myMemberId);
              prevBidCountRef.current = newCount;
              return updated;
            });
          } catch { /* ignore WebSocket message parse errors */ }
        });
      },
      onDisconnect: () => setLiveData(null),
      reconnectDelay: 3000,
    });
    client.activate();
    stompRef.current = client;
    return () => client.deactivate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, isOnline]);

  const bidMutation = useMutation({
    mutationFn: () => placeBid({ chitId, auctionId, bidAmount: Number(bidAmount) }),
    onSuccess: (updated) => {
      setLiveData(updated);
      setBidAmount('');
      toast.success('Bid placed!');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Bid failed'),
  });

  const proxyBidMutation = useMutation({
    mutationFn: () => placeBid({
      chitId, auctionId,
      bidAmount: Number(proxyBidAmount),
      onBehalfOfMemberId: proxyMemberId,
    }),
    onSuccess: (updated) => {
      setLiveData(updated);
      setProxyBidAmount('');
      setProxyMemberId('');
      const name = memberMap[proxyMemberId] ?? 'Member';
      toast.success(`Bid of ₹${fmt(proxyBidAmount)} placed for ${name}`);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Proxy bid failed'),
  });

  const closeOnlineMutation = useMutation({
    mutationFn: () => closeAuction({ chitId, auctionId }),
    onSuccess: (updated) => {
      setLiveData(updated);
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      toast.success('Auction closed — payment records created');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to close auction'),
  });

  const voidMutation = useMutation({
    mutationFn: () => voidAuction({ chitId, auctionId }),
    onSuccess: (updated) => {
      setLiveData(updated);
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['auction', chitId, auctionId] });
      toast.success('Auction voided — open a fresh auction for this draw');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to void auction'),
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <div className="p-8 text-center text-gray-500">Auction not found.</div>;

  const bids = data.bids ?? [];
  const winningBid = bids[0];
  // Use the slot count from the backend (one per enrollment row; multi-spot members count multiple times).
  // Falls back to bids.length only as a last resort — never use org-wide member count.
  const totalSpots = data.totalSpots || bids.length || 1;
  const hasCommission = !!data.commissionType && Number(data.commissionValue) > 0;

  // Live preview of discount/commission/dividend based on current winning bid
  const liveDiscount = winningBid ? Number(data.scheduledPayoutAmount) - Number(winningBid.bidAmount) : 0;
  const commissionPreview = hasCommission
    ? data.commissionType === 'PERCENTAGE'
      ? liveDiscount * Number(data.commissionValue) / 100
      : Math.min(Number(data.commissionValue), liveDiscount)
    : 0;
  const dividendPreview = totalSpots > 0 ? Math.max(0, liveDiscount - commissionPreview) / totalSpots : 0;

  // Show commission breakdown to this viewer?
  const showCommission = isAdmin || data.showCommissionToMembers;

  // Member-facing bid status: derive from the bids list + current user's memberId
  const myMemberId = user?.memberId ? String(user.memberId) : null;
  const myBestBid  = myMemberId
    ? bids.find((b) => String(b.memberId) === myMemberId) // bids sorted best-first; first match = my best
    : null;
  const iAmWinning = !!myBestBid && !!winningBid && String(winningBid.memberId) === myMemberId;
  const iAmLoosing = !!myBestBid && !iAmWinning;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate(`/chits/${chitId}`)}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1 flex items-center gap-1"
          >
            ← Back to Chit
          </button>
          <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
            Auction Room — Draw {data.monthNumber}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.auctionMode === 'ONLINE' ? 'Live online bidding' : 'Offline auction'} ·
            Scheduled payout: ₹{fmt(data.scheduledPayoutAmount)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Countdown timer */}
          {isOpen && isOnline && secondsLeft !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-mono font-bold
              ${timerUrgent ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-[#EEF2F8] text-[#1E3A5F]'}`}>
              <Timer size={14} />
              {formatCountdown(secondsLeft)}
            </div>
          )}
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full
            ${isOpen ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
            <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {isOpen ? 'LIVE' : 'CLOSED'}
          </span>
        </div>
      </div>

      {/* Expired timer warning */}
      {isOpen && isOnline && secondsLeft === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
          Timer has expired — auction is being auto-closed. If it stays open, close it manually below.
        </div>
      )}

      {/* Member bid-status banner (non-admin, auction open) */}
      {!isAdmin && isOpen && myMemberId && (
        iAmWinning ? (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-green-800">You are winning! 🏆</p>
              <p className="text-sm text-green-700">
                Your bid of ₹{fmt(myBestBid.bidAmount)} is the lowest — you currently hold the lead.
                Stay alert in case someone outbids you.
              </p>
            </div>
          </div>
        ) : iAmLoosing ? (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="font-bold text-orange-800">You've been outbid</p>
              <p className="text-sm text-orange-700">
                Your bid of ₹{fmt(myBestBid.bidAmount)} is no longer winning.{' '}
                {winningBid && (
                  <><strong>{memberMap[String(winningBid.memberId)] ?? 'Someone'}</strong> is leading at ₹{fmt(winningBid.bidAmount)}. </>
                )}
                Bid lower to take the lead.
              </p>
            </div>
          </div>
        ) : (
          /* Member hasn't bid yet — show who is winning */
          winningBid && (
            <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: '#EEF2F8', border: '1px solid #C7D5E8' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#C7D5E8' }}>
                <Gavel size={18} style={{ color: '#1E3A5F' }} />
              </div>
              <div>
                <p className="font-bold" style={{ color: '#1E3A5F' }}>You haven't bid yet</p>
                <p className="text-sm" style={{ color: '#2E5090' }}>
                  <strong>{memberMap[String(winningBid.memberId)] ?? 'Someone'}</strong> is currently winning at ₹{fmt(winningBid.bidAmount)}.
                  Bid lower to compete.
                </p>
              </div>
            </div>
          )
        )
      )}

      {/* Winner banner (closed) */}
      {isClosed && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <Trophy size={32} className="text-amber-500 mx-auto mb-2" />
          <p className="text-lg font-bold text-amber-900">
            {memberMap[String(data.winnerId)] ?? '—'} won ₹{fmt(data.wonAmount)}
          </p>
          {/* Commission-aware breakdown */}
          {showCommission && hasCommission ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {[
                { label: 'Discount', value: `₹${fmt(data.discountAmount)}` },
                { label: 'Admin Commission', value: `₹${fmt(data.commissionAmount)}`, highlight: true },
                { label: 'Distributable', value: `₹${fmt(Number(data.discountAmount) - Number(data.commissionAmount))}` },
                { label: 'Dividend/Spot', value: `₹${fmt(data.dividendPerSpot)}` },
              ].map(({ label, value, highlight }) => (
                <div key={label} className={`rounded-xl px-3 py-2 ${highlight ? 'bg-orange-100' : 'bg-amber-100'}`}>
                  <p className={`font-bold ${highlight ? 'text-orange-800' : 'text-amber-900'}`}>{value}</p>
                  <p className="text-xs text-amber-700">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700 mt-1">
              Discount: ₹{fmt(data.discountAmount)} · Dividend per spot: ₹{fmt(data.dividendPerSpot)}
            </p>
          )}
          <p className="text-xs text-amber-600 mt-2">Payment records have been created for all members.</p>
          {isAdmin && (
            <div className="flex justify-center gap-3 mt-4">
              {data.auctionMode === 'ONLINE' && (
                <Button
                  variant="secondary" size="sm"
                  loading={false}
                  onClick={() => setShowExtendTime(true)}
                  title="Reopen this auction and add more time for bidding"
                >
                  <Timer size={14} /> Extend & Reopen
                </Button>
              )}
              <Button
                variant="danger" size="sm"
                loading={voidMutation.isPending}
                onClick={() => {
                  if (window.confirm('This will reverse the winner assignment and payment records. Proceed with re-auction?')) {
                    voidMutation.mutate();
                  }
                }}
                title="Void this result and open a fresh auction for the same draw"
              >
                <RotateCcw size={14} /> Re-auction
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Current winner (open) */}
      {isOpen && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Trophy size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Currently Winning</p>
              {winningBid ? (
                <p className="text-xl font-bold text-gray-900">
                  {memberMap[String(winningBid.memberId)] ?? '—'}
                  <span className="text-base font-semibold text-green-700 ml-2">₹{fmt(winningBid.bidAmount)}</span>
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">No bids yet — be the first!</p>
              )}
            </div>
          </div>

          {winningBid && (
            <div className={`grid gap-3 mt-2 ${showCommission && hasCommission ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
              {[
                { label: 'Discount',        value: `₹${fmt(liveDiscount)}` },
                ...(showCommission && hasCommission ? [
                  { label: 'Commission', value: `₹${fmt(commissionPreview)}`, muted: true },
                ] : []),
                { label: 'Dividend/Spot',   value: `₹${fmt(dividendPreview)}` },
                { label: 'Total Bids',      value: bids.length },
              ].map(({ label, value, muted }) => (
                <div key={label} className={`rounded-xl p-3 text-center ${muted ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <p className={`text-base font-bold ${muted ? 'text-orange-700' : 'text-gray-800'}`}>{value}</p>
                  <p className={`text-xs ${muted ? 'text-orange-500' : 'text-gray-400'}`}>{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bid form (ONLINE + open) — members only, admins use the proxy panel below */}
      {!isAdmin && isOpen && isOnline && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Gavel size={16} className="text-[#1E3A5F]" /> Place Your Bid
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Enter the payout amount you want to accept. Must be lower than the current winning bid.
            {data.minBidStep && <span className="font-medium text-gray-600"> Minimum step: ₹{fmt(data.minBidStep)}.</span>}
            {winningBid && (
              <span className="font-medium text-gray-600"> Current best: ₹{fmt(winningBid.bidAmount)}
                {data.minBidStep && ` — bid ₹${fmt(winningBid.bidAmount - Number(data.minBidStep))} or lower`}.
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="number"
                placeholder={`Less than ₹${fmt(winningBid?.bidAmount ?? data.scheduledPayoutAmount)}`}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
            </div>
            <Button
              size="md"
              disabled={!bidAmount || bidMutation.isPending}
              loading={bidMutation.isPending}
              onClick={() => bidMutation.mutate()}
            >
              Bid ₹{bidAmount ? fmt(bidAmount) : '—'}
            </Button>
          </div>
        </div>
      )}

      {/* Admin proxy bid panel */}
      {isAdmin && isOpen && isOnline && (
        <div className="rounded-2xl p-5" style={{ background: '#EEF2F8', border: '1px solid #C7D5E8' }}>
          <h3 className="font-semibold mb-1 flex items-center gap-2" style={{ color: '#1E3A5F' }}>
            <Gavel size={15} style={{ color: '#1E3A5F' }} /> Place Bid on Behalf of Member
          </h3>
          <p className="text-xs mb-4" style={{ color: '#2E5090' }}>
            For members who can't use the app. This bid is recorded in their name and fully audited.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <select
                className="w-full rounded-xl px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2" style={{ border: '1px solid #C7D5E8' }}
                value={proxyMemberId}
                onChange={(e) => setProxyMemberId(e.target.value)}
              >
                <option value="">Select member…</option>
                {biddableEnrolledMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 flex-1">
              <Input
                type="number"
                placeholder={`Less than ₹${fmt(winningBid?.bidAmount ?? data.scheduledPayoutAmount)}`}
                value={proxyBidAmount}
                onChange={(e) => setProxyBidAmount(e.target.value)}
                className="flex-1"
              />
              <Button
                size="md"
                disabled={!proxyMemberId || !proxyBidAmount || proxyBidMutation.isPending}
                loading={proxyBidMutation.isPending}
                onClick={() => proxyBidMutation.mutate()}
              >
                Bid
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && isOpen && (
        <div className="flex justify-end gap-3 flex-wrap">
          {isOnline && (
            <Button
              variant="secondary" size="md"
              onClick={() => setShowExtendTime(true)}
            >
              <Timer size={15} /> Add Time
            </Button>
          )}
          {isOnline ? (
            <Button
              variant="danger" size="md"
              loading={closeOnlineMutation.isPending}
              onClick={() => closeOnlineMutation.mutate()}
              disabled={bids.length === 0}
              title={bids.length === 0 ? 'Need at least one bid to close' : undefined}
            >
              <CheckCircle size={15} /> Close Auction
            </Button>
          ) : (
            <Button variant="danger" size="md" onClick={() => setShowOfflineClose(true)}>
              <CheckCircle size={15} /> Record Winner & Close
            </Button>
          )}
        </div>
      )}

      {/* Bid leaderboard */}
      {bids.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingDown size={16} className="text-[#1E3A5F]" /> All Bids
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {bids.map((bid, i) => (
              <div
                key={bid.id}
                className={`flex items-center justify-between px-5 py-3.5 ${bid.winning ? 'bg-amber-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${bid.winning ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {memberMap[String(bid.memberId)] ?? '—'}
                      {bid.winning && (
                        <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          WINNING
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(bid.bidTime).toLocaleTimeString('en-IN')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">₹{fmt(bid.bidAmount)}</p>
                  <p className="text-xs text-gray-400">disc: ₹{fmt(bid.discountOffered)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showOfflineClose && (
        <OfflineCloseModal
          chitId={chitId}
          auctionId={auctionId}
          memberMap={memberMap}
          onClose={() => setShowOfflineClose(false)}
        />
      )}

      {showExtendTime && (
        <ExtendTimeModal
          chitId={chitId}
          auctionId={auctionId}
          onExtended={(updated) => setLiveData(updated)}
          onClose={() => setShowExtendTime(false)}
        />
      )}
    </div>
  );
}
