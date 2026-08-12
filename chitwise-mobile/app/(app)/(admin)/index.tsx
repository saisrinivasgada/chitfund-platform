import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, FlatList } from 'react-native';
import { NotificationsModal } from '../../../components/NotificationsModal';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import {
  getActiveCashRequests, getChits, getMembers,
  getWalletBalance, getUnreadCount,
  adminCreateCashRequest, getAuditLogs,
  getTodaysPaymentBatches, getTodaysDraws, getTodaysPayouts,
  getOrgReservations, realizeOrgPayout, getCashRequestSummary,
  getPendingSettlements,
} from '../../../services/api';
import { C, T, Card, StatCard, GlassCard, Badge, Amount, EyeToggle, fmtDateTime, LoadingScreen, SectionHeader, Button } from '../../../components/ui';
import { toast } from '../../../components/Toast';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showOrgHoldings, setShowOrgHoldings] = useState(false);
  const [activityShowCount, setActivityShowCount] = useState(8);
  const [nrMemberId, setNrMemberId] = useState('');
  const [nrMemberSearch, setNrMemberSearch] = useState('');
  const [nrChitId, setNrChitId] = useState('');
  const [nrAmount, setNrAmount] = useState('');
  const [nrNotes, setNrNotes] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: cashRequests = [], isLoading: crLoading, refetch: refetchCR } = useQuery({ queryKey: ['m-cash-requests'], queryFn: getActiveCashRequests });
  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({ queryKey: ['m-chits'], queryFn: getChits });
  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: wallet, refetch: refetchWallet, isError: walletError } = useQuery({ queryKey: ['m-wallet'], queryFn: getWalletBalance });
  const { data: unread = 0 } = useQuery({ queryKey: ['m-unread'], queryFn: getUnreadCount, refetchInterval: 30_000 });
  const todayIso = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); })();
  const { data: recentActivity = [], refetch: refetchActivity } = useQuery({
    queryKey: ['m-recent-activity'],
    queryFn: () => getAuditLogs({ size: 50, sort: 'createdAt,desc', from: todayIso }),
    staleTime: 30_000,
  });
  const { data: todayBatchesRaw = [], refetch: refetchBatches  } = useQuery({ queryKey: ['m-today-batches'], queryFn: getTodaysPaymentBatches, staleTime: 60_000 });
  const { data: todayDrawsRaw   = [], refetch: refetchDraws    } = useQuery({ queryKey: ['m-today-draws'],   queryFn: getTodaysDraws,          staleTime: 60_000 });
  const { data: todayPayoutsRaw = [], refetch: refetchPayouts  } = useQuery({ queryKey: ['m-today-payouts'], queryFn: getTodaysPayouts,        staleTime: 60_000 });
  const { data: cashSummary,          refetch: refetchSummary  } = useQuery({ queryKey: ['m-cash-summary'],  queryFn: getCashRequestSummary,   staleTime: 60_000 });
  const { data: pendingSettlementsPage, refetch: refetchSettlements } = useQuery({ queryKey: ['m-dash-pending-settlements'], queryFn: () => getPendingSettlements(0, 5), staleTime: 120_000 });
  const pendingSettlements = (pendingSettlementsPage as any)?.content ?? [];
  const pendingSettlementCount = (pendingSettlementsPage as any)?.totalElements ?? 0;

  // Org Holdings — slots the organization holds across chits
  const { data: orgReservations = [], refetch: refetchOrgReservations } = useQuery({
    queryKey: ['a-org-reservations'],
    queryFn: getOrgReservations,
    staleTime: 60_000,
  });

  const newRequestMutation = useMutation({
    mutationFn: () => adminCreateCashRequest(nrMemberId, nrChitId, parseFloat(nrAmount), undefined, nrNotes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      setShowNewRequest(false);
      setNrMemberId(''); setNrMemberSearch(''); setNrChitId(''); setNrAmount(''); setNrNotes('');
      toast.created('Cash pickup request created');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const isLoading = crLoading || chitsLoading || membersLoading;
  function onRefresh() { refetchCR(); refetchChits(); refetchMembers(); refetchWallet(); refetchActivity(); refetchBatches(); refetchDraws(); refetchPayouts(); refetchOrgReservations(); refetchSummary(); refetchSettlements(); }

  const activeChits     = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const activeMembers   = (members as any[]).filter((m) => m.status !== 'INACTIVE' && m.status !== 'DELETED');
  const pendingPickups  = (cashRequests as any[]).filter((r) => r.status === 'ASSIGNED');
  const pendingRequests = (cashRequests as any[]).filter((r) => r.status === 'PENDING');
  const memberMap = Object.fromEntries(
    (members as any[]).map((m: any) => [m.id?.toLowerCase(), m.fullName ?? m.name])
  );

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayBatches    = todayBatchesRaw as any[];
  const todayRemitted   = todayBatches.filter((b) => b.status === 'REMITTED');
  const todayRemittedAmt = todayRemitted.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);
  const todayBank       = todayBatches.filter((b) => ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'ONLINE'].includes(b.paymentMode));
  const todayBankAmt    = todayBank.reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={T.h1}>Dashboard</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: user?.role === 'MANAGER' ? '#F5F3FF' : C.navy50 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: user?.role === 'MANAGER' ? '#7C3AED' : C.navy }}>{user?.role}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>Hello, {user?.fullName?.split(' ')[0]} 👋</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <EyeToggle />
            <TouchableOpacity onPress={() => setShowNotifs(true)}
              style={{ position: 'relative', padding: 8, backgroundColor: C.white, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 18 }}>🔔</Text>
              {(unread as number) > 0 && (
                <View style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, color: C.white, fontWeight: '700' }}>{unread as number}</Text>
                </View>
              )}
            </TouchableOpacity>
            <ProfileAvatarButton size={36} />
          </View>
        </View>

        {/* Wallet Balance — liquid glass on dark */}
        <TouchableOpacity onPress={() => router.push('/(app)/(admin)/payments')} activeOpacity={0.8}>
          <View style={{
            backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 16,
            overflow: 'hidden',
            shadowColor: C.navy, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
          }}>
            {/* Specular highlight — top glass shine */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, backgroundColor: 'rgba(255,255,255,0.08)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
            {/* Orb highlight — top-left diffuse shine */}
            <View style={{ position: 'absolute', top: -24, left: -24, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 }}>TREASURY BALANCE</Text>
            {walletError ? (
              <TouchableOpacity onPress={() => refetchWallet()}>
                <Text style={{ color: C.red + 'CC', fontSize: 14, fontWeight: '600' }}>Could not load — tap to retry</Text>
              </TouchableOpacity>
            ) : (
              <Amount value={(wallet as any)?.totalBalance ?? (wallet as any)?.balance ?? 0} size="xl" color={C.gold} />
            )}
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>Tap to open Finance →</Text>
          </View>
        </TouchableOpacity>

        {/* Stats — glass cards */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <StatCard glass label="Active Chits" value={String(activeChits.length)} accent={C.navy} onPress={() => router.push('/(app)/(admin)/chits')} />
          <StatCard glass label="Active Members" value={String(activeMembers.length)} accent={C.green} onPress={() => router.push({ pathname: '/(app)/(admin)/members', params: { filter: 'Active' } })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <StatCard glass label="Pending Pickups" value={String(pendingPickups.length)} accent={C.amber} onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests', filter: 'ASSIGNED' } })} />
          <StatCard glass label="New Requests" value={String(pendingRequests.length)} accent={C.red} onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests', filter: 'PENDING' } })} />
        </View>
        {(cashSummary as any)?.todayCancelled > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <StatCard
              glass
              label="Cancelled Today"
              value={String((cashSummary as any).todayCancelled)}
              sub={`${(cashSummary as any).cancelled} overall`}
              accent={C.gray400}
              onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests', filter: 'CANCELLED' } })}
            />
            <StatCard
              glass
              label="Collected Today"
              value={String((cashSummary as any).todayCollected ?? 0)}
              sub={`${(cashSummary as any).collected ?? 0} overall`}
              accent={C.green}
              onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests' } })}
            />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <StatCard
            glass
            label="Today's Remitted"
            value={String(todayRemitted.length)}
            sub={todayRemittedAmt > 0 ? `₹${todayRemittedAmt.toLocaleString('en-IN')}` : undefined}
            accent={C.green}
            onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Remittance' } })}
          />
          <StatCard
            glass
            label="Today's Bank Pays"
            value={String(todayBank.length)}
            sub={todayBankAmt > 0 ? `₹${todayBankAmt.toLocaleString('en-IN')}` : undefined}
            accent={C.navy}
            onPress={() => router.push('/(app)/(admin)/activity')}
          />
        </View>

        {/* Org Holdings — only when org holds slots in chits */}
        {(orgReservations as any[]).filter((r: any) => r.status === 'RESERVED').length > 0 && (() => {
          const activeSlots = (orgReservations as any[]).filter((r: any) => r.status === 'RESERVED');
          const pendingAmount = activeSlots.reduce((s: number, r: any) => s + Number(r.payoutAmount ?? 0), 0);
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowOrgHoldings(true)}
              style={{
                backgroundColor: C.navy50, borderRadius: 16, padding: 16, marginBottom: 16,
                borderWidth: 1.5, borderColor: C.navy + '40',
                shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy, letterSpacing: 1, marginBottom: 4 }}>ORG HOLDINGS</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    {activeSlots.length} active slot{activeSlots.length > 1 ? 's' : ''} across chits
                  </Text>
                  {pendingAmount > 0 && (
                    <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600', marginTop: 2 }}>
                      ₹{pendingAmount.toLocaleString('en-IN')} pending realization
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 20, marginLeft: 12 }}>🏛️</Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* Quick Actions */}
        <SectionHeader title="Quick Actions" />
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: '+ Cash Request', onPress: () => setShowNewRequest(true), accent: C.navy },
            { label: 'Cash Pickups', onPress: () => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests' } }), accent: C.amber },
            { label: 'Remittance', onPress: () => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Remittance' } }), accent: C.green },
            { label: 'Payouts', onPress: () => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Payouts' } }), accent: '#7C3AED' },
          ].map((a) => (
            <TouchableOpacity key={a.label} onPress={a.onPress}
              style={{ backgroundColor: a.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ color: C.white, fontWeight: '700', fontSize: 13 }}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Needs Action — PENDING requests only (no worker assigned yet) */}
        {pendingRequests.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title="Needs Action"
              action={<TouchableOpacity onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Cash Requests', filter: 'PENDING' } })}><Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text></TouchableOpacity>}
            />
            {pendingRequests.slice(0, 4).map((r: any) => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[r.memberId?.toLowerCase()] ?? r.memberName ?? `Member …${r.memberId?.slice(-6)}`}
                    </Text>
                    <Amount value={r.requestedAmount} size="sm" />
                    <Text style={{ fontSize: 11, color: C.amber }}>Awaiting staff assignment</Text>
                  </View>
                  <Badge status={r.status} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Pending Settlement Payments */}
        {pendingSettlementCount > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title={`Pending Settlements (${pendingSettlementCount})`}
              action={<TouchableOpacity onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Settlement' } })}><Text style={{ fontSize: 13, color: '#D97706', fontWeight: '600' }}>View all →</Text></TouchableOpacity>}
            />
            {pendingSettlements.map((s: any) => {
              const memberName = memberMap[String(s.memberId).toLowerCase()] ?? String(s.memberId).slice(0, 8) + '…';
              const remaining = Math.abs(Number(s.remainingAmount ?? 0));
              const net = Number(s.totalAmount ?? 0);
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Settlement', memberId: s.memberId } })}
                  activeOpacity={0.8}
                >
                  <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#D97706' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{memberName}</Text>
                        <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                          {net > 0 ? 'Collect' : 'Disburse'} · <Text style={{ color: '#D97706', fontWeight: '600' }}>₹{remaining.toLocaleString('en-IN')} remaining</Text>
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, color: '#D97706' }}>→</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
            {pendingSettlementCount > pendingSettlements.length && (
              <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'Settlement' } })}>
                <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '600', textAlign: 'center', paddingVertical: 8 }}>
                  +{pendingSettlementCount - pendingSettlements.length} more pending →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Today's Activity */}
        {(() => {
          // Prefer audit logs (filtered to today); fall back to real /today endpoints
          const auditItems = (recentActivity as any[]).filter((e) => new Date(e.createdAt).getTime() >= todayStart.getTime());
          const batchItems = todayBatches.map((b: any) => ({
            id: 'b-' + b.id,
            action: b.status === 'REMITTED' ? 'REMITTED' : b.status === 'VOIDED' ? 'VOIDED' : 'COLLECTED',
            entityType: 'PAYMENT',
            actorRole: b.collectedBy ? 'STAFF' : 'ADMIN',
            newValue: `₹${Number(b.amount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}`,
            createdAt: b.remittedAt ?? b.createdAt,
          }));
          const drawItems = (todayDrawsRaw as any[]).map((d: any) => ({
            id: 'd-' + d.id,
            action: d.status === 'SKIPPED' ? 'SKIPPED' : d.status === 'CLOSED' ? 'DRAW CLOSED' : 'DRAW OPENED',
            entityType: 'DRAW',
            actorRole: 'ADMIN',
            newValue: memberMap[(d.winner?.memberId ?? '').toLowerCase()] ? `Winner: ${memberMap[(d.winner?.memberId ?? '').toLowerCase()]}` : undefined,
            createdAt: d.closedAt ?? d.openedAt ?? d.createdAt,
          }));
          const payoutItems = (todayPayoutsRaw as any[]).map((p: any) => ({
            id: 'p-' + p.id,
            action: p.status === 'DISBURSED' ? 'DISBURSED' : p.status === 'CANCELLED' ? 'CANCELLED' : 'PAYOUT CREATED',
            entityType: 'PAYOUT',
            actorRole: 'ADMIN',
            newValue: p.amount ? `₹${Number(p.amount).toLocaleString('en-IN')}` : undefined,
            createdAt: p.disbursedAt ?? p.createdAt,
          }));
          const feed = auditItems.length > 0 ? auditItems : [...batchItems, ...drawItems, ...payoutItems];
          const sorted = [...feed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          return (
            <View style={{ marginBottom: 20 }}>
              <SectionHeader title="Today's Activity"
                action={<TouchableOpacity onPress={() => router.push('/(app)/(admin)/activity')}><Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text></TouchableOpacity>}
              />
              {sorted.length === 0 ? (
                <Text style={{ color: C.gray400, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>No activity today yet</Text>
              ) : sorted.slice(0, activityShowCount).map((entry: any, i: number) => {
                const shown = Math.min(activityShowCount, sorted.length);
                const action = (entry.action ?? '').replace(/_/g, ' ');
                const isNeg = entry.action?.includes('VOID') || entry.action?.includes('CANCEL');
                const dot = isNeg ? C.red : entry.action?.includes('DISBURS') || entry.action?.includes('REMIT') ? C.green : entry.action?.includes('PAYMENT') || entry.action?.includes('COLLECT') ? C.navy : C.amber;
                return (
                  <View key={entry.id ?? i} style={{ flexDirection: 'row', marginBottom: 10, gap: 10 }}>
                    <View style={{ alignItems: 'center', width: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 3, backgroundColor: dot }} />
                      {i < shown - 1 && <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 2 }} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isNeg ? C.red : C.gray900 }}>{action}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {entry.entityType && <Text style={{ fontSize: 11, color: C.gray500 }}>{entry.entityType}</Text>}
                        {entry.newValue && <Text style={{ fontSize: 11, fontWeight: '600', color: C.navy }}>{entry.newValue}</Text>}
                        {entry.actorRole && <Text style={{ fontSize: 11, color: C.gray400 }}>· {entry.actorRole}</Text>}
                      </View>
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{fmtDateTime(entry.createdAt)}</Text>
                    </View>
                  </View>
                );
              })}
              {sorted.length > activityShowCount && (
                <TouchableOpacity onPress={() => setActivityShowCount(c => c + 8)}
                  style={{ marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>Load More ({sorted.length - activityShowCount} remaining)</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
      </ScrollView>

      {/* New Cash Request Modal */}
      <Modal visible={showNewRequest} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewRequest(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={T.h2}>New Cash Request</Text>
            <TouchableOpacity onPress={() => setShowNewRequest(false)}>
              <Text style={{ fontSize: 28, color: C.gray400, lineHeight: 28 }}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Member</Text>
              <TextInput
                value={nrMemberSearch}
                onChangeText={(t) => { setNrMemberSearch(t); if (!t) setNrMemberId(''); }}
                placeholder="Search by name or phone…"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, marginBottom: 6, backgroundColor: C.white }}
              />
              {nrMemberId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.navy }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy, flex: 1 }}>{nrMemberSearch}</Text>
                  <TouchableOpacity onPress={() => { setNrMemberId(''); setNrMemberSearch(''); }}>
                    <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : nrMemberSearch.length > 0 && (
                <ScrollView style={{ maxHeight: 180, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, backgroundColor: C.white }} nestedScrollEnabled>
                  {(members as any[])
                    .filter((m: any) => m.status !== 'INACTIVE' && (
                      (m.fullName ?? '').toLowerCase().includes(nrMemberSearch.toLowerCase()) ||
                      (m.phone ?? '').includes(nrMemberSearch)
                    ))
                    .map((m: any) => (
                      <TouchableOpacity key={m.id} onPress={() => { setNrMemberId(m.id); setNrMemberSearch(m.fullName ?? m.name); }}
                        style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                        <Text style={{ fontSize: 14, color: C.gray900 }}>{m.fullName ?? m.name}</Text>
                        {m.phone && <Text style={{ fontSize: 12, color: C.gray400 }}>{m.phone}</Text>}
                      </TouchableOpacity>
                    ))
                  }
                </ScrollView>
              )}
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Chit Fund</Text>
              <ScrollView style={{ maxHeight: 180, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, backgroundColor: C.white }} nestedScrollEnabled>
                {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').map((c: any) => (
                  <TouchableOpacity key={c.id} onPress={() => setNrChitId(c.id)}
                    style={{ padding: 12, backgroundColor: nrChitId === c.id ? C.navy50 : 'transparent', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                    <Text style={{ fontSize: 14, fontWeight: nrChitId === c.id ? '700' : '400', color: nrChitId === c.id ? C.navy : C.gray900 }}>
                      {c.name} {nrChitId === c.id ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Amount (₹)</Text>
              <TextInput value={nrAmount} onChangeText={setNrAmount} keyboardType="numeric" placeholder="0"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes (optional)</Text>
              <TextInput value={nrNotes} onChangeText={setNrNotes} multiline numberOfLines={3} placeholder="Any notes..."
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 80 }} />
            </View>
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label="Create Request" onPress={() => newRequestMutation.mutate()} loading={newRequestMutation.isPending}
              disabled={!nrMemberId || !nrChitId || !nrAmount} variant="primary" fullWidth />
          </View>
        </SafeAreaView>
      </Modal>

      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} />

      {/* ── Org Holdings Modal ──────────────────────────────────────────────── */}
      <OrgHoldingsModal
        visible={showOrgHoldings}
        onClose={() => setShowOrgHoldings(false)}
        reservations={orgReservations as any[]}
        onRealized={() => { refetchOrgReservations(); setShowOrgHoldings(false); }}
      />

    </SafeAreaView>
  );
}

// ── Org Holdings Modal ────────────────────────────────────────────────────────
function OrgHoldingsModal({ visible, onClose, reservations, onRealized }: {
  visible: boolean;
  onClose: () => void;
  reservations: any[];
  onRealized: () => void;
}) {
  const qc = useQueryClient();

  const realizeMut = useMutation({
    mutationFn: ({ chitId, reservationId }: { chitId: string; reservationId: string }) =>
      realizeOrgPayout(chitId, reservationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a-org-reservations'] });
      toast.saved('Payout realized to treasury');
      onRealized();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to realize payout'),
  });

  const active   = reservations.filter((r) => r.status === 'RESERVED');
  const realized = reservations.filter((r) => r.status === 'PROCESSED');

  function SlotCard({ r }: { r: any }) {
    const canRealize = r.status === 'RESERVED' && r.eligibleToRealize === true;
    return (
      <View style={{
        backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10,
        borderWidth: 1.5, borderColor: r.status === 'PROCESSED' ? C.gray200 : C.navy + '30',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>
              {r.chitName ?? `Chit #${String(r.chitId ?? '').slice(0, 8)}`}
            </Text>
            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
              Draw #{r.monthNumber}{r.reservationMonth ? ` · ${new Date(r.reservationMonth).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
            </Text>
          </View>
          <View style={{
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
            backgroundColor: r.status === 'PROCESSED' ? '#F0FDF4' : C.navy50,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'PROCESSED' ? '#16A34A' : C.navy }}>
              {r.status === 'PROCESSED' ? 'Realized' : 'Active'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <View>
            <Text style={{ fontSize: 11, color: C.gray500 }}>Payout Amount</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>
              ₹{Number(r.payoutAmount ?? 0).toLocaleString('en-IN')}
            </Text>
          </View>
          {canRealize && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Realize to Treasury',
                  `Realize ₹${Number(r.payoutAmount ?? 0).toLocaleString('en-IN')} to treasury for Draw #${r.monthNumber}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Realize', onPress: () => realizeMut.mutate({ chitId: r.chitId, reservationId: r.id }) },
                  ],
                )
              }
              disabled={realizeMut.isPending}
              style={{
                backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 10, opacity: realizeMut.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.white }}>
                {realizeMut.isPending ? 'Processing…' : 'Realize to Treasury'}
              </Text>
            </TouchableOpacity>
          )}
          {r.status === 'PROCESSED' && r.updatedAt && (
            <Text style={{ fontSize: 11, color: C.gray400 }}>
              {new Date(r.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <View>
            <Text style={T.h2}>Organization Holdings</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              Slots held by the organization across chits
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {reservations.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>🏛️</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.gray700 }}>No org holdings yet</Text>
              <Text style={{ fontSize: 13, color: C.gray400, marginTop: 6, textAlign: 'center' }}>
                Create an org-held slot in the chit schedule to get started.
              </Text>
            </View>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 10 }}>
                    ACTIVE · {active.length} SLOT{active.length > 1 ? 'S' : ''}
                  </Text>
                  {active.map((r) => <SlotCard key={r.id} r={r} />)}
                </>
              )}
              {realized.length > 0 && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginTop: 8, marginBottom: 10 }}>
                    REALIZED · {realized.length}
                  </Text>
                  {realized.map((r) => <SlotCard key={r.id} r={r} />)}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
