import { useState, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Modal, ScrollView, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyChits, getMyMemberProfile, getMemberBalance, getPaymentHistory, getDraws, getWinners, getPayoutsForMember, listAuctions, getAuction, placeBid } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Divider, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const MONTH_STATUS_COLOR: Record<string, string> = {
  SETTLED:             C.green,
  PARTIALLY_PAID:      C.amber,
  OUTSTANDING:         C.red,
  WAIVED:              C.gray400,
  PAYOUT_DEDUCTED:     C.navy,
  SETTLEMENT_CLEARED:  C.green,
};

const MONTH_STATUS_LABEL: Record<string, string> = {
  SETTLED:             'Settled',
  PARTIALLY_PAID:      'Partial',
  OUTSTANDING:         'Outstanding',
  WAIVED:              'Waived',
  PAYOUT_DEDUCTED:     'Payout Deducted',
  SETTLEMENT_CLEARED:  'Cleared',
};

function ChitBalance({ memberId, chitId }: { memberId: string; chitId: string }) {
  const { data: bal } = useQuery({
    queryKey: ['member-chit-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId),
    staleTime: 60_000,
  });
  const owing = bal?.outstandingBalance ?? bal?.balance ?? bal ?? null;
  if (owing == null) return null;
  const num = Number(owing);
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
      backgroundColor: num > 0 ? '#FEF3C7' : '#DCFCE7',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: num > 0 ? '#92400E' : '#15803D' }}>
        {num > 0 ? `Owes ₹${num.toLocaleString('en-IN')}` : 'Paid up'}
      </Text>
    </View>
  );
}

function ChitDetailModal({ chit, memberId, onClose }: { chit: any; memberId: string; onClose: () => void }) {
  const [modalTab, setModalTab] = useState<'history' | 'auction'>('history');
  const [bidAmount, setBidAmount] = useState('');
  const qc = useQueryClient();

  const isAuctionChit = chit.chitType === 'AUCTION' || chit.winnerSelectionMode === 'AUCTION';

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['member-chit-history', memberId, chit.id],
    queryFn: () => getPaymentHistory(memberId, chit.id),
    enabled: !!memberId && !!chit.id,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['member-chit-draws', chit.id],
    queryFn: () => getDraws(chit.id),
    enabled: !!chit.id,
  });

  const { data: winners = [] } = useQuery({
    queryKey: ['member-chit-winners', chit.id],
    queryFn: () => getWinners(chit.id),
    enabled: !!chit.id,
  });

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const { data: auctionSessions = [] } = useQuery({
    queryKey: ['member-auctions', chit.id],
    queryFn: () => listAuctions(chit.id),
    enabled: !!chit.id && isAuctionChit && modalTab === 'auction',
    refetchInterval: modalTab === 'auction' ? 10_000 : false,
  });
  const sessions = auctionSessions as any[];
  const activeAuction = sessions.find((s: any) => s.status === 'OPEN');
  const recentClosedAuction = !activeAuction
    ? [...sessions].filter((s: any) => s.status === 'CLOSED').sort((a, b) => b.monthNumber - a.monthNumber)[0]
    : null;
  const displayAuction = activeAuction ?? recentClosedAuction;

  const isAuctionExpired = activeAuction?.closesAt
    ? new Date(activeAuction.closesAt) < new Date()
    : false;

  const { data: auctionDetail } = useQuery({
    queryKey: ['member-auction-detail', chit.id, displayAuction?.id],
    queryFn: () => getAuction(chit.id, displayAuction!.id),
    enabled: !!displayAuction?.id && modalTab === 'auction',
    refetchInterval: activeAuction && modalTab === 'auction' ? 8_000 : false,
  });

  // Countdown timer for live auction
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!activeAuction?.closesAt) { setSecondsLeft(null); return; }
    const target = new Date(activeAuction.closesAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeAuction?.closesAt]);

  function fmtCountdown(secs: number): string {
    if (secs <= 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const bidMut = useMutation({
    mutationFn: () => placeBid({ chitId: chit.id, auctionId: activeAuction!.id, bidAmount: Number(bidAmount) }),
    onSuccess: () => {
      setBidAmount('');
      qc.invalidateQueries({ queryKey: ['member-auction-detail', chit.id, displayAuction?.id] });
      qc.invalidateQueries({ queryKey: ['member-auctions', chit.id] });
    },
  });

  const bids: any[] = (auctionDetail as any)?.bids ?? [];
  const sortedBids = [...bids].sort((a, b) => Number(a.bidAmount) - Number(b.bidAmount));
  const myBid = bids.find((b: any) => b.memberId === memberId);

  // Stats derived from auction detail
  const scheduledPayout = Number((auctionDetail as any)?.scheduledPayoutAmount ?? 0);
  const winningBidAmt   = sortedBids[0] ? Number(sortedBids[0].bidAmount) : null;
  const discount        = winningBidAmt != null ? scheduledPayout - winningBidAmt : null;
  const totalSpots      = Number((auctionDetail as any)?.totalSpots ?? 0);

  // Commission (live preview — for PERCENTAGE type, compute against current best discount)
  const commType  = (auctionDetail as any)?.commissionType as string | null;
  const commValue = Number((auctionDetail as any)?.commissionValue ?? 0);
  const showCommission = !!(auctionDetail as any)?.showCommissionToMembers;
  const hasCommission = !!commType && commValue > 0;
  const commissionPreview = hasCommission && discount != null
    ? commType === 'PERCENTAGE'
      ? Math.min(discount * commValue / 100, discount)
      : Math.min(commValue, discount)
    : 0;
  const dividendPerSpot = discount != null && totalSpots > 0
    ? Math.max(0, discount - commissionPreview) / totalSpots
    : null;

  // After close, backend already computed it
  const closedDividend      = Number((auctionDetail as any)?.dividendPerSpot ?? 0);
  const closedWonAmt        = Number((auctionDetail as any)?.wonAmount ?? 0);
  const closedDiscount      = Number((auctionDetail as any)?.discountAmount ?? 0);
  const closedCommission    = Number((auctionDetail as any)?.commissionAmount ?? 0);
  const closedWinnerId      = (auctionDetail as any)?.winnerId;

  const winnerByMonth = Object.fromEntries((winners as any[]).map((w: any) => [w.monthNumber, w]));
  const myPayout = (allPayouts as any[]).find((p: any) => p.chitId === chit.id);
  const histArr = history as any[];
  const settledCount = histArr.filter((r: any) => ['SETTLED', 'WAIVED', 'PAYOUT_DEDUCTED', 'SETTLEMENT_CLEARED'].includes(r.status)).length;
  const totalPaid = histArr.reduce((s, r: any) => s + Number(r.amountPaid ?? 0), 0);
  const outstanding = histArr.reduce((s, r: any) => s + Math.max(0, Number(r.amountDue ?? 0) - Number(r.amountPaid ?? 0)), 0);

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }} numberOfLines={1}>{chit.name}</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                {modalTab === 'history' ? 'Payment history' : 'Live auction'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ paddingLeft: 16 }}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 4-stat info strip */}
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

          {/* Tabs — auction chits only */}
          {isAuctionChit && (
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              {(['history', 'auction'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setModalTab(tab)}
                  style={{
                    flex: 1, paddingVertical: 12, alignItems: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: modalTab === tab ? C.navy : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: modalTab === tab ? C.navy : C.gray400 }}>
                    {tab === 'history' ? 'History' : `Auction${activeAuction ? ' 🔴' : ''}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {modalTab === 'auction' ? (
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
                /* ── Closed auction result ── */
                <View>
                  <View style={{
                    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, marginBottom: 16,
                    borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>🏆</Text>
                    {closedWinnerId === memberId ? (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>You won Draw #{recentClosedAuction.monthNumber}!</Text>
                        <Text style={{ fontSize: 13, color: '#78350F', marginTop: 4 }}>
                          Winning bid: ₹{closedWonAmt.toLocaleString('en-IN')} · Payout coming soon.
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>Draw #{recentClosedAuction.monthNumber} Closed</Text>
                        <Text style={{ fontSize: 13, color: '#78350F', marginTop: 4 }}>
                          Winning bid: ₹{closedWonAmt.toLocaleString('en-IN')}
                        </Text>
                      </>
                    )}
                    {closedDiscount > 0 && totalSpots > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#92400E', textTransform: 'uppercase' }}>Discount</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>₹{closedDiscount.toLocaleString('en-IN')}</Text>
                        </View>
                        {showCommission && closedCommission > 0 && (
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 10, color: '#C2410C', textTransform: 'uppercase' }}>Commission</Text>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#C2410C' }}>₹{closedCommission.toLocaleString('en-IN')}</Text>
                          </View>
                        )}
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#92400E', textTransform: 'uppercase' }}>Dividend / Slot</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>₹{closedDividend.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#92400E', textTransform: 'uppercase' }}>Total Slots</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>{totalSpots}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View>
                  {/* ── Live auction header ── */}
                  <View style={{
                    backgroundColor: '#FFF0F0', borderRadius: 14, padding: 14, marginBottom: 12,
                    borderWidth: 1, borderColor: '#FECACA',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C' }}>🔴 Auction Live — Draw #{activeAuction.monthNumber}</Text>
                      {secondsLeft != null && (
                        <Text style={{
                          fontSize: secondsLeft <= 60 ? 15 : 12,
                          fontWeight: secondsLeft <= 60 ? '800' : '600',
                          color: secondsLeft <= 60 ? '#DC2626' : '#EF4444',
                          marginTop: 3, fontVariant: ['tabular-nums'],
                        }}>
                          {secondsLeft <= 0 ? 'Timer expired' : `⏱ ${fmtCountdown(secondsLeft)}`}
                        </Text>
                      )}
                    </View>
                    {sortedBids.length > 0 && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Winning bid</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>
                          ₹{Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Stats row: scheduled payout, discount, [commission], dividend/spot, total bids */}
                  {scheduledPayout > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'Pot', value: `₹${scheduledPayout.toLocaleString('en-IN')}`, highlight: false },
                        { label: 'Discount', value: discount != null ? `₹${discount.toLocaleString('en-IN')}` : '—', highlight: false },
                        ...(showCommission && hasCommission ? [{ label: 'Commission', value: `₹${commissionPreview.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, highlight: true }] : []),
                        { label: 'Div/Slot', value: dividendPerSpot != null ? `₹${dividendPerSpot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—', highlight: false },
                        { label: 'Bids', value: String(bids.length), highlight: false },
                      ].map(({ label, value, highlight }) => (
                        <View key={label} style={{
                          minWidth: 60, flex: 1, backgroundColor: highlight ? '#FFF7ED' : C.gray50,
                          borderRadius: 10, padding: 10, alignItems: 'center',
                          borderWidth: 1, borderColor: highlight ? '#FED7AA' : C.gray100,
                        }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: highlight ? '#C2410C' : C.gray900 }}>{value}</Text>
                          <Text style={{ fontSize: 10, color: highlight ? '#F97316' : C.gray400, marginTop: 1 }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Member bid status banner */}
                  {myBid ? (
                    sortedBids[0]?.memberId === memberId ? (
                      /* Winning */
                      <View style={{
                        backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, marginBottom: 16,
                        borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 12,
                      }}>
                        <Text style={{ fontSize: 26 }}>🏆</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803D', marginBottom: 2 }}>You are winning!</Text>
                          <Text style={{ fontSize: 11, color: '#166534' }}>
                            Your bid of ₹{Number(myBid.bidAmount).toLocaleString('en-IN')} is the lowest. Stay alert — someone may outbid you.
                          </Text>
                        </View>
                      </View>
                    ) : (
                      /* Outbid */
                      <View style={{
                        backgroundColor: '#FFF7ED', borderRadius: 14, padding: 14, marginBottom: 16,
                        borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', gap: 12,
                      }}>
                        <Text style={{ fontSize: 26 }}>⚠️</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#C2410C', marginBottom: 2 }}>You've been outbid</Text>
                          <Text style={{ fontSize: 11, color: '#92400E' }}>
                            Your bid of ₹{Number(myBid.bidAmount).toLocaleString('en-IN')} is no longer winning.
                            {sortedBids[0] && ` Someone is leading at ₹${Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}.`}
                            {' '}Bid lower to compete.
                          </Text>
                        </View>
                      </View>
                    )
                  ) : (
                    /* Hasn't bid yet but auction is live and bids exist */
                    sortedBids.length > 0 && (
                      <View style={{
                        backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, marginBottom: 16,
                        borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', gap: 12,
                      }}>
                        <Text style={{ fontSize: 26 }}>🔔</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 }}>You haven't bid yet</Text>
                          <Text style={{ fontSize: 11, color: '#1E40AF' }}>
                            Someone is currently winning at ₹{Number(sortedBids[0].bidAmount).toLocaleString('en-IN')}. Bid lower to compete.
                          </Text>
                        </View>
                      </View>
                    )
                  )}

                  {/* Leaderboard */}
                  {sortedBids.length > 0 && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Current Bids</Text>
                      {sortedBids.slice(0, 5).map((b: any, idx: number) => (
                        <View key={b.memberId ?? idx} style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1,
                          borderColor: b.memberId === memberId ? '#BFDBFE' : C.gray100,
                          backgroundColor: b.memberId === memberId ? '#EFF6FF' : C.white,
                        }}>
                          <View style={{
                            width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: idx === 0 ? '#FCD34D' : C.gray100,
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: idx === 0 ? '#92400E' : C.gray500 }}>
                              {idx + 1}
                            </Text>
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                            {b.memberName ?? (b.memberId === memberId ? 'You' : `Bidder ${idx + 1}`)}
                            {b.memberId === memberId ? ' (You)' : ''}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>
                            ₹{Number(b.bidAmount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Place / update bid — hidden when auction has expired */}
                  {isAuctionExpired ? (
                    <View style={{
                      backgroundColor: '#FFF7ED', borderRadius: 16, padding: 20,
                      borderWidth: 1, borderColor: '#FED7AA', alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 28, marginBottom: 10 }}>⏰</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#C2410C', marginBottom: 6 }}>
                        Auction Time's Up
                      </Text>
                      <Text style={{ fontSize: 13, color: '#92400E', textAlign: 'center', lineHeight: 20 }}>
                        Bidding has closed. The admin is finalizing the result — the winner will be announced shortly.
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
                      {(auctionDetail as any)?.minBidStep
                        ? ` Min step: ₹${Number((auctionDetail as any).minBidStep).toLocaleString('en-IN')} — bid ₹${(winningBidAmt! - Number((auctionDetail as any).minBidStep)).toLocaleString('en-IN')} or lower.`
                        : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <View style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center',
                        backgroundColor: C.white, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray200,
                        paddingHorizontal: 12,
                      }}>
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
                        style={{
                          backgroundColor: !bidAmount || bidMut.isPending ? C.gray200 : C.navy,
                          borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '700', color: !bidAmount || bidMut.isPending ? C.gray400 : C.white }}>
                          {bidMut.isPending ? '…' : myBid ? 'Update' : 'Bid'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {bidMut.isError && (() => {
                      const msg: string = (bidMut.error as any)?.response?.data?.message ?? '';
                      const isEnded = msg.toLowerCase().includes('ended') || msg.toLowerCase().includes('not open');
                      return isEnded ? (
                        <View style={{
                          marginTop: 10, backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14,
                          borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                        }}>
                          <Text style={{ fontSize: 20 }}>⏰</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#C2410C', marginBottom: 2 }}>Auction has ended</Text>
                            <Text style={{ fontSize: 12, color: '#92400E' }}>
                              Bidding is now closed. The winner will be announced by the admin shortly.
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 12, color: C.red, marginTop: 8 }}>
                          {msg || 'Failed to place bid. Try again.'}
                        </Text>
                      );
                    })()}
                    {bidMut.isSuccess && (
                      <Text style={{ fontSize: 12, color: C.green, marginTop: 8 }}>Bid placed!</Text>
                    )}
                  </View>
                  )}
                </View>
              )
            ) : (
              /* ── History Tab ── */
              <>
                {/* Summary row */}
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

                {/* My payout section */}
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
                          <Text style={{ fontSize: 14, fontWeight: '700', color }}>{`₹${Number(myPayout.netPayoutAmount ?? 0).toLocaleString('en-IN')}`}</Text>
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

                {/* Draw-by-draw list */}
                {histLoading ? (
                  <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
                ) : histArr.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No payment records yet</Text>
                ) : (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Draw History</Text>
                    {histArr.map((r: any) => {
                      const color = MONTH_STATUS_COLOR[r.status] ?? C.gray400;
                      const label = MONTH_STATUS_LABEL[r.status] ?? r.status;
                      const won = winnerByMonth[r.monthNumber] && winnerByMonth[r.monthNumber].memberId === memberId;
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
        </View>
      </View>
    </Modal>
  );
}

export default function MemberChitsScreen() {
  const [selected, setSelected] = useState<any>(null);

  const { data: chits = [], isLoading: chitsLoading, refetch } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
  });

  const memberId = memberProfile?.id;
  const isLoading = chitsLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={chits as any[]}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={T.h1}>My Chit Funds</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').length} active · tap to see details
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No chit funds" message="You haven't been enrolled in any chit funds yet." />
        }
        renderItem={({ item: c }) => (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setSelected(c)}>
            <Card style={{ marginBottom: 14 }}>
              {/* Chit name + status */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={2}>{c.name}</Text>
                <Badge status={c.status} />
              </View>
              {c.chitType === 'LOTTERY' && (
                <View style={{ alignSelf: 'flex-start', backgroundColor: C.navy50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy }}>🎲 LOTTERY</Text>
                </View>
              )}
              {memberId && (
                <View style={{ marginBottom: 8 }}>
                  <ChitBalance memberId={memberId} chitId={c.id} />
                </View>
              )}

              {/* Key stats */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Monthly</Text>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Draw</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    {c.currentDraw ?? 1} / {c.totalDraws ?? '?'}
                  </Text>
                </View>
                {c.totalAmount && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Total Value</Text>
                    <Amount value={c.totalAmount} size="sm" color={C.green} />
                  </View>
                )}
              </View>

              {/* Progress bar */}
              {c.totalDraws && c.currentDraw && (
                <>
                  <Divider />
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: C.gray400 }}>Progress</Text>
                      <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>
                        {Math.round((c.currentDraw / c.totalDraws) * 100)}%
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: C.gray200, borderRadius: 3 }}>
                      <View style={{
                        height: 6, borderRadius: 3,
                        backgroundColor: c.status === 'COMPLETED' ? C.green : C.navy,
                        width: `${Math.min(100, (c.currentDraw / c.totalDraws) * 100)}%`,
                      }} />
                    </View>
                  </View>
                </>
              )}

              <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>View details →</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {selected && memberId && (
        <ChitDetailModal chit={selected} memberId={memberId} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}
