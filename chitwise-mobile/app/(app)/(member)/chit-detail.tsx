import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyChits, getMyMemberProfile, getMemberBalance,
  getPaymentHistory, getDraws, getWinners, getPayoutsForMember,
  listAuctions, getAuction, placeBid,
} from '../../../services/api';
import { C, fmtDate } from '../../../components/ui';

const MONTH_STATUS_COLOR: Record<string, string> = {
  SETTLED:            C.green,
  PARTIALLY_PAID:     C.amber,
  OUTSTANDING:        C.red,
  WAIVED:             C.gray400,
  PAYOUT_DEDUCTED:    C.navy,
  SETTLEMENT_CLEARED: C.green,
};

const MONTH_STATUS_LABEL: Record<string, string> = {
  SETTLED:            'Settled',
  PARTIALLY_PAID:     'Partial',
  OUTSTANDING:        'Outstanding',
  WAIVED:             'Waived',
  PAYOUT_DEDUCTED:    'Payout Deducted',
  SETTLEMENT_CLEARED: 'Cleared',
};

function fmtCountdown(secs: number) {
  if (secs <= 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ChitDetailScreen() {
  const { chitId, fromReminderId } = useLocalSearchParams<{ chitId: string; fromReminderId?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'history' | 'auction'>('history');
  const [bidAmount, setBidAmount] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Data fetches
  const { data: chits = [], isLoading: chitsLoading } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
    staleTime: 60_000,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
    staleTime: 300_000,
  });

  const chit: any = (chits as any[]).find((c: any) => c.id === chitId);
  const memberId: string = memberProfile?.id ?? '';
  const isAuctionChit = chit?.chitType === 'AUCTION' || chit?.winnerSelectionMode === 'AUCTION';

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['member-chit-history', memberId, chitId],
    queryFn: () => getPaymentHistory(memberId, chitId!),
    enabled: !!memberId && !!chitId,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['member-chit-draws', chitId],
    queryFn: () => getDraws(chitId!),
    enabled: !!chitId,
  });

  const { data: winners = [] } = useQuery({
    queryKey: ['member-chit-winners', chitId],
    queryFn: () => getWinners(chitId!),
    enabled: !!chitId,
  });

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: bal } = useQuery({
    queryKey: ['member-chit-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId!),
    enabled: !!memberId && !!chitId,
  });

  const { data: auctionSessions = [] } = useQuery({
    queryKey: ['member-auctions', chitId],
    queryFn: () => listAuctions(chitId!),
    enabled: !!chitId && isAuctionChit && tab === 'auction',
    refetchInterval: tab === 'auction' ? 10_000 : false,
  });

  const sessions = auctionSessions as any[];
  const activeAuction = sessions.find((s: any) => s.status === 'OPEN');
  const recentClosedAuction = !activeAuction
    ? [...sessions].filter((s: any) => s.status === 'CLOSED').sort((a, b) => b.monthNumber - a.monthNumber)[0]
    : null;
  const displayAuction = activeAuction ?? recentClosedAuction;

  const { data: auctionDetail } = useQuery({
    queryKey: ['member-auction-detail', chitId, displayAuction?.id],
    queryFn: () => getAuction(chitId!, displayAuction!.id),
    enabled: !!displayAuction?.id && tab === 'auction',
    refetchInterval: activeAuction && tab === 'auction' ? 8_000 : false,
  });

  // Auction countdown
  useEffect(() => {
    if (!activeAuction?.closesAt) { setSecondsLeft(null); return; }
    const target = new Date(activeAuction.closesAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeAuction?.closesAt]);

  const bidMut = useMutation({
    mutationFn: () => placeBid({ chitId: chitId!, auctionId: activeAuction!.id, bidAmount: Number(bidAmount) }),
    onSuccess: () => {
      setBidAmount('');
      qc.invalidateQueries({ queryKey: ['member-auction-detail', chitId, displayAuction?.id] });
      qc.invalidateQueries({ queryKey: ['member-auctions', chitId] });
    },
  });

  // Derived auction values
  const bids: any[] = (auctionDetail as any)?.bids ?? [];
  const sortedBids = [...bids].sort((a, b) => Number(a.bidAmount) - Number(b.bidAmount));
  const myBid = bids.find((b: any) => b.memberId === memberId);
  const scheduledPayout = Number((auctionDetail as any)?.scheduledPayoutAmount ?? 0);
  const winningBidAmt = sortedBids[0] ? Number(sortedBids[0].bidAmount) : null;
  const discount = winningBidAmt != null ? scheduledPayout - winningBidAmt : null;
  const totalSpots = Number((auctionDetail as any)?.totalSpots ?? 0);
  const commType = (auctionDetail as any)?.commissionType as string | null;
  const commValue = Number((auctionDetail as any)?.commissionValue ?? 0);
  const showCommission = !!(auctionDetail as any)?.showCommissionToMembers;
  const hasCommission = !!commType && commValue > 0;
  const commissionPreview = hasCommission && discount != null
    ? commType === 'PERCENTAGE' ? Math.min(discount * commValue / 100, discount) : Math.min(commValue, discount)
    : 0;
  const dividendPerSpot = discount != null && totalSpots > 0
    ? Math.max(0, discount - commissionPreview) / totalSpots : null;
  const closedDividend = Number((auctionDetail as any)?.dividendPerSpot ?? 0);
  const closedWonAmt = Number((auctionDetail as any)?.wonAmount ?? 0);
  const closedDiscount = Number((auctionDetail as any)?.discountAmount ?? 0);
  const closedCommission = Number((auctionDetail as any)?.commissionAmount ?? 0);
  const closedWinnerId = (auctionDetail as any)?.winnerId;
  const isAuctionExpired = activeAuction?.closesAt ? new Date(activeAuction.closesAt) < new Date() : false;

  // Derived history values
  const winnerByMonth = Object.fromEntries((winners as any[]).map((w: any) => [w.monthNumber, w]));
  const myPayout = (allPayouts as any[]).find((p: any) => p.chitId === chitId);
  const histArr = history as any[];
  const settledCount = histArr.filter((r: any) => ['SETTLED', 'WAIVED', 'PAYOUT_DEDUCTED', 'SETTLEMENT_CLEARED'].includes(r.status)).length;
  const totalPaid = histArr.reduce((s, r: any) => s + Number(r.amountPaid ?? 0), 0);
  const outstanding = histArr.reduce((s, r: any) => s + Math.max(0, Number(r.amountDue ?? 0) - Number(r.amountPaid ?? 0)), 0);

  const balOwing = bal?.outstandingBalance ?? bal?.balance ?? bal ?? null;
  const balNum = balOwing != null ? Number(balOwing) : null;

  if (chitsLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.navy} />
      </SafeAreaView>
    );
  }

  if (!chit) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
        <View style={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, color: C.navy }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, color: C.gray500 }}>Chit not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity
          onPress={() => {
            if (fromReminderId) {
              // Return to reminders screen and reopen this reminder's detail modal
              router.push({ pathname: '/(app)/(member)/reminders', params: { openReminderId: fromReminderId } } as any);
            } else {
              router.back();
            }
          }}
          style={{ marginRight: 12, padding: 4 }}
        >
          <Text style={{ fontSize: 22, color: C.navy }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }} numberOfLines={1}>{chit.name}</Text>
          <Text style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>
            {tab === 'history' ? 'Payment history' : 'Live auction'}
          </Text>
        </View>
        {balNum != null && (
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: balNum > 0 ? '#FEF3C7' : '#DCFCE7' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: balNum > 0 ? '#92400E' : '#15803D' }}>
              {balNum > 0 ? `Owes ₹${balNum.toLocaleString('en-IN')}` : 'Paid up'}
            </Text>
          </View>
        )}
      </View>

      {/* 4-stat strip */}
      <View style={{ flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 12, paddingHorizontal: 8 }}>
        {[
          { label: 'Chit Value', value: chit.totalAmount ? `₹${Number(chit.totalAmount).toLocaleString('en-IN')}` : '—' },
          { label: 'Installment', value: chit.installmentAmount ? `₹${Number(chit.installmentAmount).toLocaleString('en-IN')}` : '—' },
          { label: 'Duration', value: chit.totalDraws ? `${chit.totalDraws} mo` : '—' },
          { label: 'Members', value: chit.memberCount != null ? String(chit.memberCount) : '—' },
        ].map(({ label, value }, i, arr) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: 'rgba(255,255,255,0.15)' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#D4A017' }}>{value}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Tab bar — auction chits only */}
      {isAuctionChit && (
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
          {(['history', 'auction'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? C.navy : 'transparent' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: tab === t ? C.navy : C.gray400 }}>
                {t === 'history' ? 'History' : `Auction${activeAuction ? ' 🔴' : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {tab === 'auction' ? (
          /* ── Auction Tab ── */
          !displayAuction ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🏷️</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, marginBottom: 4 }}>No auction yet</Text>
              <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>
                The admin will open an auction when it's draw time.
              </Text>
            </View>
          ) : recentClosedAuction && !activeAuction ? (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🏆</Text>
              {closedWinnerId === memberId ? (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>You won Draw #{recentClosedAuction.monthNumber}!</Text>
                  <Text style={{ fontSize: 13, color: '#78350F', marginTop: 4, textAlign: 'center' }}>
                    Winning bid: ₹{closedWonAmt.toLocaleString('en-IN')} · Payout coming soon.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>Draw #{recentClosedAuction.monthNumber} Closed</Text>
                  <Text style={{ fontSize: 13, color: '#78350F', marginTop: 4 }}>Winning bid: ₹{closedWonAmt.toLocaleString('en-IN')}</Text>
                </>
              )}
              {closedDiscount > 0 && totalSpots > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
                  {[
                    { label: 'Discount', value: `₹${closedDiscount.toLocaleString('en-IN')}` },
                    ...(showCommission && closedCommission > 0 ? [{ label: 'Commission', value: `₹${closedCommission.toLocaleString('en-IN')}` }] : []),
                    { label: 'Dividend/Slot', value: `₹${closedDividend.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
                    { label: 'Total Slots', value: String(totalSpots) },
                  ].map(({ label, value }) => (
                    <View key={label} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#92400E', textTransform: 'uppercase' }}>{label}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>{value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View>
              {/* Live auction header */}
              <View style={{ backgroundColor: '#FFF0F0', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C' }}>🔴 Auction Live — Draw #{activeAuction.monthNumber}</Text>
                  {secondsLeft != null && (
                    <Text style={{ fontSize: secondsLeft <= 60 ? 15 : 12, fontWeight: secondsLeft <= 60 ? '800' : '600', color: secondsLeft <= 60 ? '#DC2626' : '#EF4444', marginTop: 3, fontVariant: ['tabular-nums'] }}>
                      {secondsLeft <= 0 ? 'Timer expired' : `⏱ ${fmtCountdown(secondsLeft)}`}
                    </Text>
                  )}
                </View>
                {sortedBids.length > 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Winning bid</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>₹{Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}</Text>
                  </View>
                )}
              </View>

              {/* Stats */}
              {scheduledPayout > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Pot', value: `₹${scheduledPayout.toLocaleString('en-IN')}`, highlight: false },
                    { label: 'Discount', value: discount != null ? `₹${discount.toLocaleString('en-IN')}` : '—', highlight: false },
                    ...(showCommission && hasCommission ? [{ label: 'Commission', value: `₹${commissionPreview.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, highlight: true }] : []),
                    { label: 'Div/Slot', value: dividendPerSpot != null ? `₹${dividendPerSpot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—', highlight: false },
                    { label: 'Bids', value: String(bids.length), highlight: false },
                  ].map(({ label, value, highlight }) => (
                    <View key={label} style={{ minWidth: 60, flex: 1, backgroundColor: highlight ? '#FFF7ED' : C.gray50, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: highlight ? '#FED7AA' : C.gray100 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: highlight ? '#C2410C' : C.gray900 }}>{value}</Text>
                      <Text style={{ fontSize: 10, color: highlight ? '#F97316' : C.gray400, marginTop: 1 }}>{label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Bid status banner */}
              {myBid ? (
                sortedBids[0]?.memberId === memberId ? (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 26 }}>🏆</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803D', marginBottom: 2 }}>You are winning!</Text>
                      <Text style={{ fontSize: 11, color: '#166534' }}>Your bid of ₹{Number(myBid.bidAmount).toLocaleString('en-IN')} is the lowest.</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#FFF7ED', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 26 }}>⚠️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#C2410C', marginBottom: 2 }}>You've been outbid</Text>
                      <Text style={{ fontSize: 11, color: '#92400E' }}>
                        Your bid ₹{Number(myBid.bidAmount).toLocaleString('en-IN')} is no longer winning.
                        {sortedBids[0] && ` Leading: ₹${Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}.`}
                      </Text>
                    </View>
                  </View>
                )
              ) : sortedBids.length > 0 ? (
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ fontSize: 26 }}>🔔</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 }}>You haven't bid yet</Text>
                    <Text style={{ fontSize: 11, color: '#1E40AF' }}>Someone is winning at ₹{Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}.</Text>
                  </View>
                </View>
              ) : null}

              {/* Leaderboard */}
              {sortedBids.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Current Bids</Text>
                  {sortedBids.slice(0, 5).map((b: any, idx: number) => (
                    <View key={b.memberId ?? idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: b.memberId === memberId ? '#BFDBFE' : C.gray100, backgroundColor: b.memberId === memberId ? '#EFF6FF' : C.white }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: idx === 0 ? '#FCD34D' : C.gray100 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: idx === 0 ? '#92400E' : C.gray500 }}>{idx + 1}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                        {b.memberName ?? (b.memberId === memberId ? 'You' : `Bidder ${idx + 1}`)}
                        {b.memberId === memberId ? ' (You)' : ''}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>₹{Number(b.bidAmount).toLocaleString('en-IN')}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Bid input */}
              {isAuctionExpired ? (
                <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FED7AA', alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 10 }}>⏰</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#C2410C', marginBottom: 6 }}>Auction Time's Up</Text>
                  <Text style={{ fontSize: 13, color: '#92400E', textAlign: 'center', lineHeight: 20 }}>
                    Bidding has closed. The admin is finalizing the result.
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: C.gray50, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.gray100 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy, marginBottom: 6 }}>
                    {myBid ? 'Update Your Bid' : 'Place Your Bid'}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 14 }}>
                    Bid the lowest amount you'd accept as payout. The lowest bid wins.
                    {winningBidAmt != null && ` Current best: ₹${winningBidAmt.toLocaleString('en-IN')}.`}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray200, paddingHorizontal: 12 }}>
                      <Text style={{ fontSize: 15, color: C.gray500, marginRight: 4 }}>₹</Text>
                      <TextInput
                        style={{ flex: 1, fontSize: 16, fontWeight: '600', color: C.gray900, paddingVertical: 12 }}
                        placeholder="Enter amount"
                        placeholderTextColor={C.gray400}
                        keyboardType="numeric"
                        value={bidAmount}
                        onChangeText={setBidAmount}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => bidMut.mutate()}
                      disabled={!bidAmount || bidMut.isPending}
                      style={{ backgroundColor: !bidAmount || bidMut.isPending ? C.gray200 : C.navy, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: !bidAmount || bidMut.isPending ? C.gray400 : C.white }}>
                        {bidMut.isPending ? '…' : myBid ? 'Update' : 'Bid'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {bidMut.isError && (
                    <Text style={{ fontSize: 12, color: C.red, marginTop: 8 }}>
                      {(bidMut.error as any)?.response?.data?.message || 'Failed to place bid. Try again.'}
                    </Text>
                  )}
                  {bidMut.isSuccess && <Text style={{ fontSize: 12, color: C.green, marginTop: 8 }}>Bid placed!</Text>}
                </View>
              )}
            </View>
          )
        ) : (
          /* ── History Tab ── */
          <>
            {/* Summary cards */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.gray100 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Months Paid</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.gray900, marginTop: 2 }}>
                  {settledCount}<Text style={{ fontSize: 13, fontWeight: '400', color: C.gray400 }}>/{histArr.length}</Text>
                </Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: outstanding > 0 ? '#FFF5F5' : '#F0FDF4', borderWidth: 1, borderColor: outstanding > 0 ? '#FECACA' : '#BBF7D0' }}>
                <Text style={{ fontSize: 11, color: outstanding > 0 ? C.red : C.green }}>Outstanding</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: outstanding > 0 ? C.red : C.green, marginTop: 2 }}>
                  {outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.gray100 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Total Paid</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.gray900, marginTop: 2 }}>
                  ₹{totalPaid.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            {/* My payout */}
            {myPayout && (() => {
              const isDisbursed = myPayout.status === 'DISBURSED' || myPayout.status === 'PARTIALLY_DISBURSED';
              const color = isDisbursed ? C.green : C.amber;
              return (
                <View style={{ backgroundColor: isDisbursed ? '#F0FDF4' : '#FFFBEB', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: isDisbursed ? '#BBF7D0' : '#FDE68A' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>My Payout — Draw #{myPayout.monthNumber}</Text>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + '20' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{isDisbursed ? 'Disbursed' : 'Pending'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Won</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>₹{Number(myPayout.winningAmount ?? 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Net</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color }}>₹{Number(myPayout.netPayoutAmount ?? 0).toLocaleString('en-IN')}</Text>
                    </View>
                    {isDisbursed && myPayout.disbursedAt && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Paid On</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>{fmtDate(myPayout.disbursedAt)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Draw history */}
            {histLoading ? (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <ActivityIndicator color={C.navy} />
              </View>
            ) : histArr.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No payment records yet</Text>
            ) : (
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Draw History</Text>
                {histArr.map((r: any) => {
                  const color = MONTH_STATUS_COLOR[r.status] ?? C.gray400;
                  const label = MONTH_STATUS_LABEL[r.status] ?? r.status;
                  const won = winnerByMonth[r.monthNumber]?.memberId === memberId;
                  const pct = r.amountDue > 0 ? Math.min(100, Math.round((r.amountPaid / r.amountDue) * 100)) : 0;
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.gray100, backgroundColor: C.white }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: C.white }}>{r.monthNumber}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>Draw {r.monthNumber}</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: color + '18' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
                          </View>
                          {won && <Text style={{ fontSize: 10, fontWeight: '700', color: '#D4A017' }}>🏆 Won</Text>}
                        </View>
                        <View style={{ height: 4, backgroundColor: C.gray100, borderRadius: 2, marginBottom: 4 }}>
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: `${pct}%` as any }} />
                        </View>
                        <Text style={{ fontSize: 11, color: C.gray500 }}>
                          ₹{Number(r.amountPaid ?? 0).toLocaleString('en-IN')} / ₹{Number(r.amountDue ?? 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
