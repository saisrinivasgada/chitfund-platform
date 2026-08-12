import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { getMyChits, getMyRequests, getMyMemberProfile, getMemberTotalBalance, getMySettlements, getMySettlementById } from '../../../services/api';
import { C, T, Badge, Amount, GlassCard, Card, fmtDate, fmtDateTime, LoadingScreen, SectionHeader } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const SETT_PURPLE = '#7C3AED';
const SETT_PURPLE_LIGHT = '#F5F3FF';
const CASE_COLOR: Record<string, string> = { CASE_A: '#F59E0B', CASE_B1: '#1E3A5F', CASE_B2: '#7C3AED', UNKNOWN: '#9CA3AF' };
const CASE_LABEL: Record<string, string> = { CASE_A: 'Case A', CASE_B1: 'Case B1', CASE_B2: 'Case B2', UNKNOWN: 'Unknown' };

export default function MemberHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [detailSettlement, setDetailSettlement] = React.useState<any>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: requests = [], isLoading: reqLoading, refetch: refetchReqs } = useQuery({
    queryKey: ['member-requests'],
    queryFn: getMyRequests,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
  });

  const memberId = memberProfile?.id;

  const { data: totalBalance } = useQuery({
    queryKey: ['member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId!),
    enabled: !!memberId,
  });

  const { data: settlementsPage, refetch: refetchSettlements } = useQuery({
    queryKey: ['my-settlements'],
    queryFn: () => getMySettlements(0, 5),
  });
  const mySettlements: any[] = settlementsPage?.content ?? [];

  const isLoading = chitsLoading || reqLoading;

  const activeChits    = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const completedChits = (chits as any[]).filter((c) => c.status === 'COMPLETED');
  const pendingReqs    = (requests as any[]).filter((r) => ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(r.status));

  async function openSettlementDetail(s: any) {
    // If chitItems are already in list response, use them directly
    if (s.chitItems && s.chitItems.length > 0) {
      setDetailSettlement(s);
      return;
    }
    // Otherwise fetch full detail
    setDetailLoading(true);
    try {
      const full = await getMySettlementById(s.id);
      setDetailSettlement(full ?? s);
    } catch {
      setDetailSettlement(s);
    } finally {
      setDetailLoading(false);
    }
  }

  function onRefresh() { refetchChits(); refetchReqs(); refetchSettlements(); }

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header — liquid glass on dark */}
        <View style={{
          backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 20,
          overflow: 'hidden',
          shadowColor: C.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
        }}>
          {/* Specular highlight */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, backgroundColor: 'rgba(255,255,255,0.08)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
          <View style={{ position: 'absolute', top: -24, left: -24, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500' }}>Welcome back</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2 }}>
                {user?.fullName?.split(' ')[0] ?? 'Member'}
              </Text>
            </View>
            <ProfileAvatarButton size={44} />
          </View>

          {/* Balance card */}
          {totalBalance != null && (
            <View style={{ backgroundColor: C.white + '1A', borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
                {Number(totalBalance) < 0 ? 'CREDIT BALANCE' : 'OUTSTANDING BALANCE'}
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '800',
                color: Number(totalBalance) > 0 ? C.goldLight
                  : Number(totalBalance) < 0 ? '#4ADE80'
                  : C.white }}>
                ₹{Math.abs(Number(totalBalance)).toLocaleString('en-IN')}
              </Text>
              {Number(totalBalance) > 0 && (
                <Text style={{ fontSize: 12, color: C.goldLight + 'CC', marginTop: 4 }}>Amount you owe across all chits</Text>
              )}
              {Number(totalBalance) < 0 && (
                <Text style={{ fontSize: 12, color: '#4ADE80', marginTop: 4 }}>
                  Credit available — offsets your next installment
                </Text>
              )}
              {Number(totalBalance) === 0 && (
                <Text style={{ fontSize: 12, color: C.white + '88', marginTop: 4 }}>All dues cleared</Text>
              )}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>ACTIVE CHITS</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.white }}>{activeChits.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>COMPLETED</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.white }}>{completedChits.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>PICKUPS</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: pendingReqs.length > 0 ? C.goldLight : C.white }}>
                {pendingReqs.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Active cash requests */}
        {pendingReqs.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title="Cash Pickup Status" />
            {pendingReqs.map((r: any) => (
              <GlassCard key={r.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Amount value={r.requestedAmount} size="sm" />
                  <Badge status={r.status} />
                </View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  {r.status === 'PENDING'   && 'Waiting for staff assignment'}
                  {r.status === 'ASSIGNED'  && 'Staff assigned — they will visit you soon'}
                  {r.status === 'PICKED_UP' && 'Staff collected your cash — awaiting admin confirmation'}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Requested {fmtDate(r.requestedAt)}</Text>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Settlement section */}
        {mySettlements.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title="My Settlements" />
            {mySettlements.map((s: any) => {
              const net = Number(s.netAmount ?? 0);
              const absNet = Math.abs(net);
              const isCollect = net > 0;
              const statusColors: Record<string, string> = {
                FULLY_COLLECTED: C.green, FULLY_DISBURSED: C.green, BALANCED: C.gray500,
                PENDING: C.amber, PARTIALLY_COLLECTED: '#2563EB', PARTIALLY_DISBURSED: '#7C3AED', VOIDED: C.red,
              };
              const statusLabels: Record<string, string> = {
                FULLY_COLLECTED: 'Collected', FULLY_DISBURSED: 'Disbursed', BALANCED: 'Balanced',
                PENDING: 'Pending', PARTIALLY_COLLECTED: 'Partial', PARTIALLY_DISBURSED: 'Partial', VOIDED: 'Voided',
              };
              const sColor = statusColors[s.paymentStatus] ?? C.gray400;
              const sLabel = statusLabels[s.paymentStatus] ?? (s.paymentStatus ?? '');
              return (
                <TouchableOpacity key={s.id} onPress={() => openSettlementDetail(s)} activeOpacity={0.7}>
                  <GlassCard style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: SETT_PURPLE }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 2 }}>{fmtDate(s.settledAt ?? s.createdAt)}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: net === 0 ? C.gray500 : isCollect ? C.red : C.green }}>
                          {net === 0 ? 'Balanced' : `${isCollect ? 'You owe' : 'Fund pays'} ₹${absNet.toLocaleString('en-IN')}`}
                        </Text>
                        {s.notes ? <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }} numberOfLines={1}>"{s.notes}"</Text> : null}
                      </View>
                      <View style={{ backgroundColor: sColor + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: sColor }}>{sLabel}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: C.gray400 }}>Tap to view details →</Text>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* My Chits preview */}
        <View>
          <SectionHeader
            title="My Chit Funds"
            action={
              <TouchableOpacity onPress={() => router.push('/(app)/(member)/chits')}>
                <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text>
              </TouchableOpacity>
            }
          />
          {activeChits.length === 0 ? (
            <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 14, paddingVertical: 20 }}>
              No active chit funds
            </Text>
          ) : (
            activeChits.slice(0, 3).map((c: any) => (
              <GlassCard key={c.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 3 }}>
                      Draw {c.currentDraw ?? 1}/{c.totalDraws ?? '?'}
                    </Text>
                  </View>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
              </GlassCard>
            ))
          )}
        </View>
      </ScrollView>

      {/* Settlement Detail Modal */}
      <Modal visible={!!detailSettlement} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailSettlement(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          {detailLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={SETT_PURPLE} size="large" />
            </View>
          ) : detailSettlement ? (() => {
            const s = detailSettlement;
            const net = Number(s.netAmount ?? 0);
            const absNet = Math.abs(net);
            const isCollect = net > 0;
            const statusColors: Record<string, string> = {
              FULLY_COLLECTED: C.green, FULLY_DISBURSED: C.green, BALANCED: C.gray500,
              PENDING: C.amber, PARTIALLY_COLLECTED: '#2563EB', PARTIALLY_DISBURSED: '#7C3AED', VOIDED: C.red,
            };
            const statusLabels: Record<string, string> = {
              FULLY_COLLECTED: 'Collected', FULLY_DISBURSED: 'Disbursed', BALANCED: 'Balanced',
              PENDING: 'Pending', PARTIALLY_COLLECTED: 'Partial', PARTIALLY_DISBURSED: 'Partial', VOIDED: 'Voided',
            };
            const sColor = statusColors[s.paymentStatus] ?? C.gray400;
            const sLabel = statusLabels[s.paymentStatus] ?? (s.paymentStatus ?? '');
            const chitItems: any[] = s.chitItems ?? [];
            return (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity onPress={() => setDetailSettlement(null)} style={{ marginRight: 14 }}>
                    <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.gray900 }}>Settlement Details</Text>
                </View>

                {/* Summary card */}
                <View style={{ backgroundColor: SETT_PURPLE_LIGHT, borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: SETT_PURPLE }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 2 }}>{fmtDateTime(s.settledAt ?? s.createdAt)}</Text>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: net === 0 ? C.gray500 : isCollect ? C.red : C.green }}>
                        {net === 0 ? 'Balanced' : `${isCollect ? 'You owe' : 'Fund pays'} ₹${absNet.toLocaleString('en-IN')}`}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: sColor + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: sColor }}>{sLabel}</Text>
                    </View>
                  </View>
                  {s.notes ? <Text style={{ fontSize: 12, color: SETT_PURPLE, fontStyle: 'italic' }}>"{s.notes}"</Text> : null}
                  {Number(s.adjustmentAmount ?? 0) !== 0 && (
                    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#DDD6FE', paddingTop: 8 }}>
                      <Text style={{ fontSize: 12, color: C.gray600 }}>
                        Adjustment: {Number(s.adjustmentAmount) > 0 ? '+' : ''}₹{Number(s.adjustmentAmount).toLocaleString('en-IN')}
                        {s.adjustmentReason ? ` — ${s.adjustmentReason}` : ''}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Payment progress */}
                {s.paymentStatus !== 'VOIDED' && s.paymentStatus !== 'BALANCED' && (
                  <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray600, marginBottom: 8 }}>Payment Progress</Text>
                    {isCollect ? (
                      <>
                        <Text style={{ fontSize: 13, color: C.gray700 }}>Total to pay: <Text style={{ fontWeight: '700' }}>₹{absNet.toLocaleString('en-IN')}</Text></Text>
                        <Text style={{ fontSize: 13, color: C.green }}>Collected: ₹{Number(s.collectedAmount ?? 0).toLocaleString('en-IN')}</Text>
                        {Number(s.remainingAmount ?? 0) > 0 && (
                          <Text style={{ fontSize: 13, color: C.amber }}>Remaining: ₹{Number(s.remainingAmount).toLocaleString('en-IN')}</Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, color: C.gray700 }}>Fund to pay you: <Text style={{ fontWeight: '700' }}>₹{absNet.toLocaleString('en-IN')}</Text></Text>
                        <Text style={{ fontSize: 13, color: C.green }}>Disbursed: ₹{Number(s.disbursedAmount ?? 0).toLocaleString('en-IN')}</Text>
                        {Number(s.remainingAmount ?? 0) > 0 && (
                          <Text style={{ fontSize: 13, color: C.amber }}>Pending: ₹{Number(s.remainingAmount).toLocaleString('en-IN')}</Text>
                        )}
                      </>
                    )}
                  </View>
                )}

                {/* Chit breakdown */}
                {chitItems.length > 0 && (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Chit Breakdown</Text>
                    {chitItems.map((ci: any, i: number) => {
                      const caseKey = ci.settlementCase ?? 'UNKNOWN';
                      const caseColor = CASE_COLOR[caseKey] ?? C.gray400;
                      const caseLabel = CASE_LABEL[caseKey] ?? caseKey;
                      const ciNet = Number(ci.netAmount ?? 0);
                      const ciAbs = Math.abs(ciNet);
                      const fundOwes = ciNet < 0;
                      return (
                        <Card key={ci.chitId ?? i} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: caseColor }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{ci.chitName ?? `Chit ${i + 1}`}</Text>
                              <View style={{ backgroundColor: caseColor + '20', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: caseColor }}>{caseLabel}</Text>
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: fundOwes ? C.green : C.red }}>
                                ₹{ciAbs.toLocaleString('en-IN')}
                              </Text>
                              <Text style={{ fontSize: 10, color: fundOwes ? C.green : C.red }}>{fundOwes ? 'Fund pays you' : 'You owe'}</Text>
                            </View>
                          </View>
                          {ci.description ? (
                            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>{ci.description}</Text>
                          ) : null}
                          {Number(ci.unpaidDues ?? 0) > 0 && (
                            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 6 }}>
                              Unpaid dues: ₹{Number(ci.unpaidDues).toLocaleString('en-IN')}
                            </Text>
                          )}
                          {Number(ci.disbursedAmount ?? 0) > 0 && (
                            <Text style={{ fontSize: 12, color: C.gray500 }}>
                              Payout disbursed: ₹{Number(ci.disbursedAmount).toLocaleString('en-IN')}
                            </Text>
                          )}
                        </Card>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            );
          })() : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
