import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Alert, TextInput, Modal, TouchableOpacity, FlatList, Switch,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getActiveCashRequests, collectForRequest, voidCashPickup, cancelCashRequest,
  getCashRequestAuditLog, assignStaffToRequest, listStaff, adminCreateCashRequest, updateCashRequest,
  getMembers, getChits, getChitsForMember, collectPayment, recordPayment,
  getMemberBalance, getPaymentBatches, getAllPaymentBatches, voidPaymentBatch, remitPayment, getPendingRemittance,
  getPendingPayouts, getAllPayouts, createPayout, disbursePayout, cancelPayout, voidPayout, getWinners,
  getWalletBalance, getWalletTransactions, addWalletTransaction, redeemMemberCredit,
  getSettlementPreview, confirmSettlement, getMemberSettlements, recordSettlementTransaction, getPendingSettlements,
  getMemberTotalBalance, getMemberCredit,
} from '../../../services/api';
import { C, T, Card, Badge, Button, Amount, EyeToggle, EmptyState, LoadingScreen, SectionHeader, Divider, fmtDate, fmtDateTime } from '../../../components/ui';
import { toast } from '../../../components/Toast';
import { useUIStore } from '../../../store/uiStore';

const TABS = ['Cash Requests', 'Settlement', 'Record Payment', 'Remittance', 'Payouts', 'History', 'Treasury'] as const;
type Tab = typeof TABS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Status config for cash pickups
const CP_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:   { color: C.red,    bg: '#FEF2F2', label: 'Pending' },
  ASSIGNED:  { color: C.amber,  bg: '#FEF3C7', label: 'Assigned' },
  PICKED_UP: { color: '#16A34A', bg: '#F0FDF4', label: 'Picked Up' },
  COLLECTED: { color: C.navy,   bg: '#EEF2F8', label: 'Collected' },
  CANCELLED: { color: C.gray400, bg: C.gray50,  label: 'Cancelled' },
};

// CASH REQUESTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function CashRequestsTab({ initialFilter }: { initialFilter?: string }) {
  const { isExpired } = useUIStore();
  const qc = useQueryClient();

  // Status filter (set by clicking legend cards or from URL param)
  const [statusFilter, setStatusFilter] = useState<string | null>(initialFilter ?? null);
  useEffect(() => { setStatusFilter(initialFilter ?? null); }, [initialFilter]);

  // Track / audit
  const [auditTarget, setAuditTarget] = useState<any>(null);

  // Assign worker to existing PENDING request
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignWorkerId, setAssignWorkerId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  // Edit request
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editWorkerId, setEditWorkerId] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Void pickup
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');

  // Setup new cash pickup (admin creates on behalf of member)
  const [showSetup, setShowSetup] = useState(false);
  const [setupMemberId, setSetupMemberId] = useState('');
  const [setupMemberSearch, setSetupMemberSearch] = useState('');
  const [setupChitId, setSetupChitId] = useState('');
  const [setupAmount, setSetupAmount] = useState('');
  const [setupWorkerId, setSetupWorkerId] = useState('');
  const [setupNotes, setSetupNotes] = useState('');

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['m-cash-requests'],
    queryFn: getActiveCashRequests,
    refetchInterval: 30_000,
  });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff });
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: allChits = [] } = useQuery({ queryKey: ['a-chits'], queryFn: getChits });
  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['m-cash-audit', auditTarget?.id],
    queryFn: () => getCashRequestAuditLog(auditTarget.id),
    enabled: !!auditTarget,
  });

  const memberMap = Object.fromEntries([
    ...(staff as any[]).map((s: any) => [s.id, `${s.fullName ?? s.username ?? '—'} (Admin)`]),
    ...(members as any[]).flatMap((m: any) => {
      const name = m.fullName ?? '—';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
  ]);
  const workers = (staff as any[]).filter((s: any) => ['STAFF', 'MANAGER'].includes(s.role));
  const workerMap = Object.fromEntries((staff as any[]).map((w: any) => [w.id, w.fullName ?? w.username ?? '—']));

  // Chits for the selected setup member
  const memberChitsForSetup = (allChits as any[]).filter((c: any) =>
    c.status === 'ACTIVE'
  );

  // Filtered member list for setup modal search
  const filteredSetupMembers = (members as any[]).filter((m: any) =>
    !setupMemberSearch || (m.fullName ?? '').toLowerCase().includes(setupMemberSearch.toLowerCase()) || (m.phone ?? '').includes(setupMemberSearch)
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const collectMut = useMutation({
    mutationFn: (id: string) => collectForRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      qc.invalidateQueries({ queryKey: ['staff-tasks'] });
      qc.invalidateQueries({ queryKey: ['staff-history'] });
      toast.collected('Member account credited');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Collection failed — request may already be collected or cancelled.'),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: any) => voidCashPickup(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      setVoidTarget(null); setVoidReason('');
      toast.voided('Pickup voided — reverted to Assigned');
    },
    onError: (e: any) => Alert.alert('Cannot Void Pickup', e.response?.data?.message ?? 'Void failed — only PICKED_UP requests can be voided.'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelCashRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m-cash-requests'] }),
    onError: (e: any) => Alert.alert('Cannot Cancel', e.response?.data?.message ?? 'Cancellation failed — request may already be collected.'),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, staffId, notes }: any) => assignStaffToRequest(id, staffId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      setAssignTarget(null); setAssignWorkerId(''); setAssignNotes('');
      toast.assigned('Staff assigned');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Assignment failed — please try again.'),
  });

  const editMut = useMutation({
    mutationFn: () => updateCashRequest(editTarget.id, {
      requestedAmount: editAmount ? Number(editAmount) : undefined,
      updateStaff: editWorkerId !== (editTarget.assignedStaffId ?? ''),
      staffId: editWorkerId || null,
      adminNotes: editNotes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      setEditTarget(null);
      toast.assigned('Request updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Update failed'),
  });

  const setupMut = useMutation({
    mutationFn: () => adminCreateCashRequest(
      setupMemberId, setupChitId,
      setupAmount ? Number(setupAmount) : 0,
      setupWorkerId || undefined,
      setupNotes || undefined,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      setShowSetup(false);
      setSetupMemberId(''); setSetupMemberSearch(''); setSetupChitId('');
      setSetupAmount(''); setSetupWorkerId(''); setSetupNotes('');
      toast.created(setupWorkerId ? 'Pickup created & worker assigned' : 'Cash pickup created');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to create pickup — please try again.'),
  });

  const STATUS_ORDER: Record<string, number> = { PICKED_UP: 0, ASSIGNED: 1, PENDING: 2 };
  const sorted = [...(requests as any[])].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );
  const displayed = statusFilter ? sorted.filter((r: any) => r.status === statusFilter) : sorted;

  if (isLoading) return <LoadingScreen />;

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontSize: 13, color: C.gray500 }}>
          {sorted.length > 0 ? `${sorted.length} active pickup${sorted.length !== 1 ? 's' : ''}` : 'No active pickups'}
        </Text>
        <TouchableOpacity
          onPress={() => !isExpired && setShowSetup(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isExpired ? C.gray300 : C.navy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>+ Setup Pickup</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter cards — tap to filter, tap again to clear */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setStatusFilter(null)}
          style={{ flex: 1, backgroundColor: !statusFilter ? C.navy50 : C.gray50, borderRadius: 10, padding: 8, alignItems: 'center',
            borderWidth: 1.5, borderColor: !statusFilter ? C.navy : 'transparent' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: !statusFilter ? C.navy : C.gray400 }}>{sorted.length}</Text>
          <Text style={{ fontSize: 10, color: !statusFilter ? C.navy : C.gray400, marginTop: 1 }}>All</Text>
        </TouchableOpacity>
        {(['PENDING', 'ASSIGNED', 'PICKED_UP'] as const).map((s) => {
          const cfg = CP_STATUS[s];
          const count = sorted.filter((r: any) => r.status === s).length;
          const active = statusFilter === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(active ? null : s)}
              style={{ flex: 1, backgroundColor: active ? cfg.bg : C.gray50, borderRadius: 10, padding: 8, alignItems: 'center',
                borderWidth: 1.5, borderColor: active ? cfg.color : 'transparent' }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: active ? cfg.color : C.gray400 }}>{count}</Text>
              <Text style={{ fontSize: 10, color: active ? cfg.color : C.gray400, marginTop: 1, textAlign: 'center' }}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {displayed.length === 0 && (
        <EmptyState
          title={statusFilter ? `No ${CP_STATUS[statusFilter]?.label ?? statusFilter} pickups` : 'No active pickups'}
          message="Create a pickup request above or wait for members to raise one from their portal."
        />
      )}

      {displayed.map((r: any) => {
        const cfg = CP_STATUS[r.status] ?? CP_STATUS.PENDING;
        return (
          <Card key={r.id} style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: cfg.color }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>
                  {memberMap[r.memberId] ?? `…${r.memberId?.slice(-6)}`}
                </Text>
                <Amount value={r.requestedAmount} size="md" />
              </View>
              <View style={{ backgroundColor: cfg.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
              </View>
            </View>

            {/* Details */}
            {r.assignedStaffId && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Staff</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.amber }}>
                  {workerMap[r.assignedStaffId] ?? '—'}
                </Text>
              </View>
            )}
            {r.scheduledFor && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Scheduled</Text>
                <Text style={{ fontSize: 12, color: C.gray700 }}>{fmtDate(r.scheduledFor)}</Text>
              </View>
            )}
            {r.pickedUpAt && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
                <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>
                  Picked up {fmtDateTime(r.pickedUpAt)}
                </Text>
              </View>
            )}
            {r.notes && (
              <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic', marginBottom: 4 }}>"{r.notes}"</Text>
            )}
            {r.adminNotes && (
              <Text style={{ fontSize: 12, color: C.navy, marginBottom: 4 }}>Admin: {r.adminNotes}</Text>
            )}
            <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 10 }}>Requested {fmtDate(r.requestedAt)}</Text>

            {/* PARTIALLY_COLLECTED → partial amount info + approval warning */}
            {r.status === 'PARTIALLY_COLLECTED' && (
              <>
                <View style={{ backgroundColor: '#F5F3FF', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#C4B5FD' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#7C3AED', marginBottom: 2 }}>
                    Partial — ₹{Number(r.collectedAmount ?? 0).toLocaleString('en-IN')} of ₹{Number(r.requestedAmount).toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6D28D9' }}>
                    Remaining: ₹{(Number(r.requestedAmount) - Number(r.collectedAmount ?? 0)).toLocaleString('en-IN')} needs follow-up
                  </Text>
                </View>
                {r.memberApproved == null && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#FECACA' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626', marginBottom: 2 }}>
                      ⚠ Member has not approved yet
                    </Text>
                    <Text style={{ fontSize: 12, color: '#B91C1C' }}>
                      Member was notified but hasn't confirmed this partial amount. Consider waiting before remitting.
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* PICKED_UP → big "Received from worker" banner */}
            {r.status === 'PICKED_UP' && (
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#86EFAC' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#16A34A', marginBottom: 2 }}>
                  Staff has the cash
                </Text>
                <Text style={{ fontSize: 12, color: '#166534' }}>
                  {workerMap[r.assignedStaffId] ?? 'Staff'} marked this as picked up. Tap "Received" once they hand it to you.
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(r.status === 'PENDING' || r.status === 'ASSIGNED') && !isExpired && (
                <Button label="Edit" variant="outline" size="sm"
                  onPress={() => {
                    setEditTarget(r);
                    setEditAmount(r.requestedAmount != null ? String(r.requestedAmount) : '');
                    setEditWorkerId(r.assignedStaffId ?? '');
                    setEditNotes(r.adminNotes ?? '');
                  }} />
              )}
              {r.status === 'PENDING' && (
                <Button label="Assign Staff" variant="primary" size="sm" disabled={isExpired}
                  onPress={() => { setAssignTarget(r); setAssignWorkerId(''); setAssignNotes(''); }} />
              )}
              {r.status === 'PICKED_UP' && (
                <>
                  <Button label="Received from Staff" variant="success" size="sm"
                    loading={collectMut.isPending}
                    onPress={() => Alert.alert(
                      'Confirm Receipt',
                      `You received ₹${Number(r.requestedAmount).toLocaleString('en-IN')} from ${workerMap[r.assignedStaffId] ?? 'staff'}? This credits the member's account.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Yes, Received', onPress: () => collectMut.mutate(r.id) },
                      ]
                    )} />
                  <Button label="Void Pickup" variant="danger" size="sm"
                    onPress={() => { setVoidTarget(r); setVoidReason(''); }} />
                </>
              )}
              {r.status === 'PARTIALLY_COLLECTED' && (
                <Button
                  label={`Remit ₹${Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN')}`}
                  variant={r.memberApproved == null ? 'outline' : 'success'}
                  size="sm"
                  loading={collectMut.isPending}
                  onPress={() => {
                    const unapproved = r.memberApproved == null;
                    const remaining = Number(r.requestedAmount) - Number(r.collectedAmount ?? 0);
                    Alert.alert(
                      unapproved ? '⚠ Member Not Approved Yet' : 'Confirm Partial Receipt',
                      (unapproved
                        ? 'Member has NOT confirmed this partial amount yet.\n\nAre you sure you want to remit ₹'
                        : 'Confirm you received ₹') +
                        Number(r.collectedAmount ?? r.requestedAmount).toLocaleString('en-IN') +
                        ` from ${workerMap[r.assignedStaffId] ?? 'staff'}? Remaining ₹${remaining.toLocaleString('en-IN')} will need follow-up.`,
                      [
                        { text: 'Not Yet', style: 'cancel' },
                        { text: 'Yes, Received', onPress: () => collectMut.mutate(r.id) },
                      ]
                    );
                  }}
                />
              )}
              {(r.status === 'PENDING' || r.status === 'ASSIGNED' || r.status === 'PICKED_UP' || r.status === 'PARTIALLY_COLLECTED') && (
                <Button label="Cancel" variant="ghost" size="sm"
                  onPress={() => Alert.alert('Cancel Pickup', 'Cancel this cash pickup request?', [
                    { text: 'No', style: 'cancel' },
                    { text: 'Cancel Pickup', style: 'destructive', onPress: () => cancelMut.mutate(r.id) },
                  ])} />
              )}
              <Button label="Audit Trail" variant="outline" size="sm" onPress={() => setAuditTarget(r)} />
            </View>
          </Card>
        );
      })}

      {/* ── Setup Cash Pickup Modal ─────────────────────────────────────────── */}
      <Modal visible={showSetup} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSetup(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200, backgroundColor: C.white }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Setup Cash Pickup</Text>
            <TouchableOpacity onPress={() => setShowSetup(false)}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

            {/* Step 1 — Select Member */}
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>1. Select Member *</Text>
              <TextInput
                value={setupMemberSearch}
                onChangeText={(t) => { setSetupMemberSearch(t); if (!t) setSetupMemberId(''); }}
                placeholder="Search by name or phone…"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 14, color: C.gray900, marginBottom: 8 }}
              />
              {setupMemberSearch.length > 0 && !setupMemberId && (
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {filteredSetupMembers.slice(0, 8).map((m: any) => (
                    <TouchableOpacity key={m.id} onPress={() => { setSetupMemberId(m.id); setSetupMemberSearch(m.fullName); }}
                      style={{ padding: 10, borderRadius: 8, backgroundColor: C.gray50, marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{m.fullName}</Text>
                      {m.phone && <Text style={{ fontSize: 12, color: C.gray500 }}>{m.phone}</Text>}
                    </TouchableOpacity>
                  ))}
                  {filteredSetupMembers.length === 0 && (
                    <Text style={{ fontSize: 13, color: C.gray400, padding: 8 }}>No members found</Text>
                  )}
                </ScrollView>
              )}
              {setupMemberId && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.navy }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy, flex: 1 }}>{setupMemberSearch}</Text>
                  <TouchableOpacity onPress={() => { setSetupMemberId(''); setSetupMemberSearch(''); setSetupChitId(''); }}>
                    <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Step 2 — Select Chit */}
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: setupMemberId ? C.gray200 : C.gray100 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: setupMemberId ? C.gray700 : C.gray400, marginBottom: 10 }}>2. Select Chit *</Text>
              {!setupMemberId ? (
                <Text style={{ fontSize: 12, color: C.gray400 }}>Select a member first</Text>
              ) : (
                <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                  {memberChitsForSetup.length === 0 ? (
                    <Text style={{ fontSize: 13, color: C.gray400 }}>No active chits found</Text>
                  ) : (
                    memberChitsForSetup.map((c: any) => (
                      <TouchableOpacity key={c.id} onPress={() => {
                        setSetupChitId(c.id);
                        setSetupAmount(c.installmentAmount ? String(c.installmentAmount) : '');
                      }}
                        style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                          borderColor: setupChitId === c.id ? C.navy : 'transparent',
                          backgroundColor: setupChitId === c.id ? C.navy50 : C.gray50 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: setupChitId === c.id ? C.navy : C.gray900 }}>{c.name}</Text>
                        {c.installmentAmount && (
                          <Text style={{ fontSize: 12, color: C.gray500 }}>₹{Number(c.installmentAmount).toLocaleString('en-IN')} / month</Text>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              )}
            </View>

            {/* Step 3 — Amount */}
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>3. Amount (₹) *</Text>
              <TextInput
                value={setupAmount}
                onChangeText={setSetupAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '700', color: C.gray900 }}
              />
            </View>

            {/* Step 4 — Assign Staff (optional) */}
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 4 }}>4. Assign Staff</Text>
              <Text style={{ fontSize: 11, color: C.gray400, marginBottom: 10 }}>Optional — leave empty to assign later</Text>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                {/* None option */}
                <TouchableOpacity onPress={() => setSetupWorkerId('')}
                  style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                    borderColor: !setupWorkerId ? C.navy : 'transparent',
                    backgroundColor: !setupWorkerId ? C.navy50 : C.gray50 }}>
                  <Text style={{ fontSize: 13, fontWeight: !setupWorkerId ? '700' : '400', color: !setupWorkerId ? C.navy : C.gray500 }}>
                    Assign later {!setupWorkerId ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
                {workers.map((w: any) => (
                  <TouchableOpacity key={w.id} onPress={() => setSetupWorkerId(w.id)}
                    style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                      borderColor: setupWorkerId === w.id ? C.navy : 'transparent',
                      backgroundColor: setupWorkerId === w.id ? C.navy50 : C.gray50 }}>
                    <Text style={{ fontSize: 14, fontWeight: setupWorkerId === w.id ? '700' : '400', color: setupWorkerId === w.id ? C.navy : C.gray900 }}>
                      {w.fullName ?? w.username} {setupWorkerId === w.id ? '✓' : ''}
                    </Text>
                    {w.phone && <Text style={{ fontSize: 12, color: C.gray500 }}>{w.phone}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Step 5 — Notes */}
            <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>5. Notes (optional)</Text>
              <TextInput
                value={setupNotes}
                onChangeText={setSetupNotes}
                multiline
                placeholder="Any special instructions for the staff member…"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>

            <Button
              label={setupWorkerId ? 'Create Pickup & Assign Staff' : 'Create Pickup Request'}
              variant="primary"
              fullWidth
              loading={setupMut.isPending}
              disabled={!setupMemberId || !setupChitId || !setupAmount || Number(setupAmount) <= 0}
              onPress={() => {
                const existingActive = (requests as any[]).filter(
                  (r: any) => r.memberId === setupMemberId && ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(r.status)
                );
                if (existingActive.length > 0) {
                  Alert.alert(
                    'Active Request Exists',
                    `This member already has ${existingActive.length} active cash pickup request${existingActive.length > 1 ? 's' : ''} (${existingActive.map((r: any) => r.status).join(', ')}). Do you still want to create another one?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Create Anyway', onPress: () => setupMut.mutate() },
                    ]
                  );
                } else {
                  setupMut.mutate();
                }
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Cash Request Modal ─────────────────────────────────────────── */}
      <Modal visible={!!editTarget} animationType="slide" transparent onRequestClose={() => setEditTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Edit Cash Pickup</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {editTarget && (
              <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 16 }}>
                {memberMap[editTarget.memberId]} · {editTarget.status}
              </Text>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Amount */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Amount (₹)</Text>
              <TextInput
                value={editAmount}
                onChangeText={setEditAmount}
                placeholder="Leave blank to keep current"
                placeholderTextColor={C.gray400}
                keyboardType="numeric"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 14 }}
              />

              {/* Staff */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Assigned Staff</Text>
              <TouchableOpacity
                onPress={() => setEditWorkerId('')}
                style={{ padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                  borderColor: editWorkerId === '' ? C.navy : C.gray200,
                  backgroundColor: editWorkerId === '' ? '#EEF2F8' : C.white }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: editWorkerId === '' ? C.navy : C.gray700 }}>— Unassign —</Text>
              </TouchableOpacity>
              {workers.map((w: any) => (
                <TouchableOpacity key={w.id} onPress={() => setEditWorkerId(w.id)}
                  style={{ padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                    borderColor: editWorkerId === w.id ? C.navy : C.gray200,
                    backgroundColor: editWorkerId === w.id ? '#EEF2F8' : C.white }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: editWorkerId === w.id ? C.navy : C.gray700 }}>
                    {w.fullName ?? w.username}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.gray400, textTransform: 'capitalize' }}>{w.role.toLowerCase()}</Text>
                </TouchableOpacity>
              ))}

              {/* Notes */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginTop: 8, marginBottom: 6 }}>Admin Notes</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Internal note (optional)"
                placeholderTextColor={C.gray400}
                multiline
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, minHeight: 64, fontSize: 14, color: C.gray900, marginBottom: 16, textAlignVertical: 'top' }}
              />

              <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 8 }}>
                <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setEditTarget(null)} /></View>
                <View style={{ flex: 1 }}><Button label="Save Changes" variant="primary" loading={editMut.isPending} onPress={() => editMut.mutate()} /></View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Void Pickup Modal ───────────────────────────────────────────────── */}
      <Modal visible={!!voidTarget} animationType="slide" transparent onRequestClose={() => setVoidTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.red, marginBottom: 4 }}>Void Pickup</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
              This reverts the request back to Assigned — the staff member must physically re-collect and re-mark pickup.
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason *</Text>
            <TextInput value={voidReason} onChangeText={setVoidReason} multiline
              placeholder="e.g. Wrong member marked" placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, minHeight: 72, fontSize: 14, color: C.gray900, marginBottom: 16, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Close" variant="ghost" onPress={() => setVoidTarget(null)} /></View>
              <View style={{ flex: 1 }}><Button label="Void Pickup" variant="danger" disabled={!voidReason.trim()} loading={voidMut.isPending}
                onPress={() => voidMut.mutate({ id: voidTarget.id, reason: voidReason })} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Assign Staff Modal ─────────────────────────────────────────────── */}
      <Modal visible={!!assignTarget} animationType="slide" transparent onRequestClose={() => setAssignTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Assign Staff</Text>
                {assignTarget && (
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    {memberMap[assignTarget.memberId]} · ₹{Number(assignTarget.requestedAmount).toLocaleString('en-IN')}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setAssignTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {workers.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.gray400, paddingVertical: 24 }}>No staff members in the team yet</Text>
            ) : (
              <ScrollView style={{ maxHeight: 220, marginBottom: 12 }}>
                {workers.map((w: any) => (
                  <TouchableOpacity key={w.id} onPress={() => setAssignWorkerId(w.id)}
                    style={{ padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 2,
                      borderColor: assignWorkerId === w.id ? C.navy : 'transparent',
                      backgroundColor: assignWorkerId === w.id ? C.navy50 : C.gray50 }}>
                    <Text style={{ fontSize: 14, fontWeight: assignWorkerId === w.id ? '700' : '400', color: assignWorkerId === w.id ? C.navy : C.gray900 }}>
                      {w.fullName ?? w.username} {assignWorkerId === w.id ? '✓' : ''}
                    </Text>
                    {w.phone && <Text style={{ fontSize: 12, color: C.gray500 }}>{w.phone}</Text>}
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{w.role}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes for staff (optional)</Text>
            <TextInput value={assignNotes} onChangeText={setAssignNotes} placeholder="e.g. Visit before 6 PM"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setAssignTarget(null)} /></View>
              <View style={{ flex: 1 }}><Button label="Assign" variant="primary" disabled={!assignWorkerId} loading={assignMut.isPending}
                onPress={() => assignMut.mutate({ id: assignTarget.id, staffId: assignWorkerId, notes: assignNotes })} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Audit Trail Modal ────────────────────────────────────────────────── */}
      <Modal visible={!!auditTarget} animationType="slide" transparent onRequestClose={() => setAuditTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Pickup Trail</Text>
              <TouchableOpacity onPress={() => setAuditTarget(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {auditTarget && (
              <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 16 }}>
                {memberMap[auditTarget.memberId]} · ₹{Number(auditTarget.requestedAmount).toLocaleString('en-IN')}
              </Text>
            )}
            <ScrollView>
              {auditLoading ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
              ) : (auditLog as any[]).length === 0 ? (
                <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No audit entries yet</Text>
              ) : (auditLog as any[]).map((entry: any, i: number) => {
                const dotColor = entry.action === 'PICKUP_VOIDED' || entry.action === 'CANCELLED' ? C.red
                  : entry.action === 'COLLECTED' ? C.navy
                  : entry.action === 'PICKED_UP' ? '#16A34A'
                  : C.amber;
                return (
                  <View key={entry.id ?? i} style={{ flexDirection: 'row', marginBottom: 14 }}>
                    <View style={{ alignItems: 'center', marginRight: 12, width: 20 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dotColor, marginTop: 2 }} />
                      {i < (auditLog as any[]).length - 1 && (
                        <View style={{ width: 2, flex: 1, backgroundColor: C.gray200, marginTop: 4 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>
                        {entry.action?.replace(/_/g, ' ')}
                      </Text>
                      {(entry.fromStatus || entry.toStatus) && (
                        <Text style={{ fontSize: 12, color: C.gray500 }}>
                          {entry.fromStatus} → {entry.toStatus}
                        </Text>
                      )}
                      {entry.performedByRole && (
                        <Text style={{ fontSize: 12, color: C.gray400 }}>by {entry.performedByRole}</Text>
                      )}
                      {entry.reason && (
                        <Text style={{ fontSize: 12, color: C.red, fontStyle: 'italic', marginTop: 2 }}>"{entry.reason}"</Text>
                      )}
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>{fmtDateTime(entry.performedAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD PAYMENT TAB
// ─────────────────────────────────────────────────────────────────────────────
function RecordPaymentTab() {
  const { isExpired } = useUIStore();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState('');
  const [chitId, setChitId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [collectedBy, setCollectedBy] = useState('SELF');
  const [notes, setNotes] = useState('');
  const [voidBatchId, setVoidBatchId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberInfoId, setMemberInfoId] = useState('');

  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff });
  const { data: memberChits = [] } = useQuery({
    queryKey: ['m-member-chits-pay', memberId],
    queryFn: () => getChitsForMember(memberId),
    enabled: !!memberId,
  });
  const { data: balance } = useQuery({
    queryKey: ['m-pay-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId),
    enabled: !!memberId && !!chitId,
  });
  const { data: batches = [] } = useQuery({
    queryKey: ['m-pay-batches', memberId, chitId],
    queryFn: () => getPaymentBatches(memberId, chitId),
    enabled: !!memberId && !!chitId,
  });

  const collectors = (staff as any[]).filter((s: any) => ['STAFF', 'MANAGER'].includes(s.role));
  // Only show chits the member can still pay into
  const payableChits = (memberChits as any[]).filter((c: any) =>
    ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(c.status)
  );
  const selectedChit = payableChits.find((c: any) => c.id === chitId);
  const bal = (balance as any)?.outstanding ?? (balance as any)?.balance ?? null;
  const isCash = mode === 'CASH';
  const isCredit = mode === 'CREDIT';
  const workerCollect = isCash && collectedBy !== 'SELF';
  const amtNum = isCredit ? 0 : (Number(amount) || 0);
  const isOverpay = amtNum > 0 && bal != null && bal > 0 && amtNum > bal;

  const { data: memberCreditData } = useQuery({
    queryKey: ['m-member-credit-pay', memberId],
    queryFn: () => getMemberCredit(memberId),
    enabled: !!memberId,
  });
  const creditBalance = Number((memberCreditData as any)?.balance ?? 0);
  const outstanding = bal != null ? Number(bal) : null;
  const creditCoversAll = outstanding !== null && outstanding > 0 && creditBalance >= outstanding;
  const creditPartial = creditBalance > 0 && !creditCoversAll && outstanding !== null && outstanding > 0;

  useEffect(() => {
    if (creditPartial && outstanding !== null) {
      setAmount(String(Math.max(0, outstanding - creditBalance)));
    }
  }, [creditBalance, outstanding]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────
  const recordMut = useMutation({
    mutationFn: () => workerCollect
      ? collectPayment({ chitId, memberId, amount: amtNum, notes: notes || undefined, overrideCollectedBy: collectedBy })
      : recordPayment({ chitId, memberId, amount: isCredit ? 0 : amtNum, paymentMode: mode, notes: notes || undefined }),
    onSuccess: () => {
      const msg = isCredit
        ? 'Credits applied — outstanding settled'
        : workerCollect
        ? 'Recorded — awaiting remittance from staff'
        : 'Payment recorded — treasury credited';
      toast.saved(msg);
      setAmount(''); setNotes(''); setCollectedBy('SELF');
      if (isCredit) setMode('CASH');
      qc.invalidateQueries({ queryKey: ['m-pay-balance', memberId, chitId] });
      qc.invalidateQueries({ queryKey: ['m-pay-batches', memberId, chitId] });
      qc.invalidateQueries({ queryKey: ['m-pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['m-member-credit-pay', memberId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'draw-payments' });
      if (chitId) qc.invalidateQueries({ queryKey: ['a-draws', chitId] });
      if (!workerCollect) qc.invalidateQueries({ queryKey: ['m-wallet'] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to record payment — please try again.'),
  });

  const voidMut = useMutation({
    mutationFn: () => voidPaymentBatch(voidBatchId, voidReason),
    onSuccess: () => {
      setVoidBatchId(''); setVoidReason('');
      qc.invalidateQueries({ queryKey: ['m-pay-balance', memberId, chitId] });
      qc.invalidateQueries({ queryKey: ['m-pay-batches', memberId, chitId] });
      toast.voided('Payment voided — records reversed');
    },
    onError: (e: any) => Alert.alert('Cannot Void', e.response?.data?.message ?? 'Void failed — payment may be linked to a disbursed payout or already voided.'),
  });

  const remitMut = useMutation({
    mutationFn: (batchId: string) => remitPayment(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-pay-batches', memberId, chitId] });
      qc.invalidateQueries({ queryKey: ['m-wallet'] });
      qc.invalidateQueries({ queryKey: ['m-pending-remittance'] });
      toast.collected('Payment remitted to treasury');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Remittance failed — please try again.'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'];
  const MODE_DESC: Record<string, string> = {
    CASH:          'Physical cash — self or via staff',
    UPI:           'UPI / PhonePe / GPay',
    BANK_TRANSFER: 'NEFT / IMPS / RTGS',
    CHEQUE:        'Cheque deposit',
  };
  const BATCH_COLOR: Record<string, string> = {
    COLLECTED: C.green, REMITTED: C.navy, VOIDED: C.red,
    PENDING: C.amber, AWAITING_REMITTANCE: C.amber,
  };

  const filteredMembers = (members as any[]).filter((m: any) => {
    if (m.status === 'INACTIVE') return false;
    const q = memberSearch.toLowerCase();
    return !q || (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q);
  });

  const submitLabel = isCredit
    ? `Apply ₹${(outstanding ?? 0).toLocaleString('en-IN')} Credits`
    : workerCollect
    ? 'Record Collection (via Staff)'
    : `Record ₹${amtNum > 0 ? amtNum.toLocaleString('en-IN') : '0'} Payment`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* ── Member picker ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <Text style={{ ...T.label, marginBottom: 0, flex: 1 }}>Select Member</Text>
        {memberId && (
          <TouchableOpacity onPress={() => setMemberInfoId(memberId)}
            style={{ backgroundColor: C.navy50, borderRadius: 8, padding: 6 }}>
            <Text style={{ fontSize: 13, color: C.navy, fontWeight: '700' }}>ⓘ Info</Text>
          </TouchableOpacity>
        )}
      </View>
      <TextInput value={memberSearch} onChangeText={setMemberSearch} placeholder="Search name or phone…"
        placeholderTextColor={C.gray400}
        style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900, marginBottom: 8, backgroundColor: C.white }} />
      <ScrollView style={{ maxHeight: 160, marginBottom: 16, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12 }} nestedScrollEnabled>
        {filteredMembers.map((m: any) => (
          <TouchableOpacity key={m.id}
            onPress={() => { setMemberId(m.id); setChitId(''); setAmount(''); setMemberSearch(''); setCollectedBy('SELF'); }}
            style={{ padding: 12, backgroundColor: memberId === m.id ? C.navy50 : 'transparent', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
            <Text style={{ fontSize: 14, fontWeight: memberId === m.id ? '700' : '400', color: memberId === m.id ? C.navy : C.gray900 }}>
              {m.fullName ?? m.name} {memberId === m.id ? '✓' : ''}
            </Text>
            {m.phone && <Text style={{ fontSize: 11, color: C.gray400 }}>{m.phone}</Text>}
          </TouchableOpacity>
        ))}
        {filteredMembers.length === 0 && (
          <Text style={{ padding: 16, color: C.gray400 }}>No members found</Text>
        )}
      </ScrollView>

      {/* Member info sheet */}
      <Modal visible={!!memberInfoId} animationType="slide" transparent onRequestClose={() => setMemberInfoId('')}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            {(() => {
              const mi = (members as any[]).find((m: any) => m.id === memberInfoId);
              if (!mi) return null;
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>{mi.fullName}</Text>
                    <TouchableOpacity onPress={() => setMemberInfoId('')}><Text style={{ fontSize: 24, color: C.gray400 }}>×</Text></TouchableOpacity>
                  </View>
                  {[{ label: 'Phone', value: mi.phone ?? '—' }, { label: 'City', value: mi.city ?? '—' }, { label: 'Address', value: mi.address ?? '—' }, { label: 'Status', value: mi.status }].map((row) => (
                    <View key={row.label} style={{ flexDirection: 'row', marginBottom: 8 }}>
                      <Text style={{ width: 70, fontSize: 13, color: C.gray500 }}>{row.label}</Text>
                      <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500', flex: 1 }}>{row.value}</Text>
                    </View>
                  ))}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Chit picker (ACTIVE / PAUSED / COMPLETED only) ─────────────────── */}
      {memberId && (
        <>
          <Text style={{ ...T.label, marginBottom: 8 }}>Select Chit Fund</Text>
          {payableChits.length === 0 ? (
            <Text style={{ color: C.gray400, marginBottom: 16 }}>No active chits for this member</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {payableChits.map((c: any) => (
                  <TouchableOpacity key={c.id}
                    onPress={() => { setChitId(c.id); setAmount(c.installmentAmount ? String(c.installmentAmount) : ''); }}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: chitId === c.id ? C.navy : C.gray300, backgroundColor: chitId === c.id ? C.navy50 : C.white, minWidth: 110 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: chitId === c.id ? C.navy : C.gray700 }}>{c.name}</Text>
                    <Text style={{ fontSize: 10, color: C.gray400, marginTop: 1 }}>{c.status}</Text>
                    {c.installmentAmount && (
                      <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>₹{Number(c.installmentAmount).toLocaleString('en-IN')}/draw</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </>
      )}

      {/* ── Outstanding balance card ────────────────────────────────────────── */}
      {memberId && chitId && (
        <View style={{ borderRadius: 14, padding: 14, marginBottom: 16, backgroundColor: bal != null && bal > 0 ? '#FEF2F2' : bal != null && bal < 0 ? '#F0FDF4' : C.navy50 }}>
          <Text style={{ fontSize: 11, color: C.gray500, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 }}>Outstanding Balance</Text>
          {bal != null ? (
            <>
              <Text style={{ fontSize: 28, fontWeight: '800', color: bal > 0 ? C.red : bal < 0 ? C.green : C.navy }}>
                ₹{Math.abs(bal).toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                {bal > 0 ? 'Member owes this amount' : bal < 0 ? 'Member has credit (overpaid)' : 'Fully paid up'}
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: C.gray400 }}>Fetching balance…</Text>
          )}
          {selectedChit?.installmentAmount && (
            <Text style={{ fontSize: 11, color: C.gray500, marginTop: 6 }}>
              Installment: ₹{Number(selectedChit.installmentAmount).toLocaleString('en-IN')}/draw
            </Text>
          )}
        </View>
      )}

      {/* ── Credit balance banner ──────────────────────────────────────────── */}
      {chitId && creditBalance > 0 && (
        <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#065F46' }}>Credit Balance Available</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#059669' }}>₹{creditBalance.toLocaleString('en-IN')}</Text>
            </View>
            {creditCoversAll && (
              <TouchableOpacity
                onPress={() => setMode(isCredit ? 'CASH' : 'CREDIT')}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: isCredit ? '#059669' : 'white', borderWidth: 1.5, borderColor: isCredit ? '#059669' : '#6EE7B7' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: isCredit ? 'white' : '#059669' }}>{isCredit ? '✓ Using Credits' : 'Apply Credits'}</Text>
              </TouchableOpacity>
            )}
            {!creditCoversAll && (
              <Text style={{ fontSize: 11, color: '#059669' }}>Auto-applies on payment</Text>
            )}
          </View>
          {isCredit && (
            <Text style={{ fontSize: 11, color: '#059669', marginTop: 6 }}>₹{creditBalance.toLocaleString('en-IN')} credit will cover ₹{(outstanding ?? 0).toLocaleString('en-IN')} outstanding — no cash needed.</Text>
          )}
          {creditPartial && (
            <Text style={{ fontSize: 11, color: '#059669', marginTop: 6 }}>₹{creditBalance.toLocaleString('en-IN')} credit auto-applies → collect remaining <Text style={{ fontWeight: '700' }}>₹{Math.max(0, (outstanding ?? 0) - creditBalance).toLocaleString('en-IN')}</Text></Text>
          )}
        </View>
      )}

      {/* ── Payment form ───────────────────────────────────────────────────── */}
      {chitId && (
        <>
          {/* Amount — hidden when using credits */}
          {!isCredit && (
            <>
          <Text style={{ ...T.label, marginBottom: 6 }}>Amount (₹) *</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900, marginBottom: 8, fontWeight: '700' }} />

          {/* Overpay warning */}
          {isOverpay && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#F59E0B' }}>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>
                ₹{amtNum.toLocaleString('en-IN')} exceeds outstanding ₹{bal!.toLocaleString('en-IN')} — this will create a credit balance.
              </Text>
            </View>
          )}
            </>
          )}

          {/* Payment Mode — hidden when using credits */}
          {!isCredit && (<>
          <Text style={{ ...T.label, marginBottom: 8, marginTop: 6 }}>Payment Mode</Text>
          <View style={{ gap: 6, marginBottom: 16 }}>
            {MODES.map((m) => (
              <TouchableOpacity key={m}
                onPress={() => { setMode(m); if (m !== 'CASH') setCollectedBy('SELF'); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: mode === m ? C.navy : C.gray300, backgroundColor: mode === m ? C.navy50 : C.white }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: mode === m ? C.navy : C.gray300, backgroundColor: mode === m ? C.navy : 'transparent', flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: mode === m ? C.navy : C.gray700 }}>{m.replace(/_/g, ' ')}</Text>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>{MODE_DESC[m]}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          </>)}

          {/* Collected By — CASH mode only ──────────────────────────────────── */}
          {isCash && (
            <>
              <Text style={{ ...T.label, marginBottom: 8 }}>Collected By</Text>

              {/* Self option */}
              <TouchableOpacity onPress={() => setCollectedBy('SELF')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: collectedBy === 'SELF' ? C.navy : C.gray300, backgroundColor: collectedBy === 'SELF' ? C.navy50 : C.white, marginBottom: 6 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: collectedBy === 'SELF' ? C.navy : C.gray300, backgroundColor: collectedBy === 'SELF' ? C.navy : 'transparent', flexShrink: 0 }} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: collectedBy === 'SELF' ? C.navy : C.gray700 }}>Self (I collected it directly)</Text>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>Treasury credited immediately</Text>
                </View>
              </TouchableOpacity>

              {/* Worker / Manager list */}
              {collectors.length === 0 ? (
                <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 14 }}>No staff in team yet</Text>
              ) : (
                <ScrollView style={{ maxHeight: 160, marginBottom: 6, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12 }} nestedScrollEnabled>
                  {collectors.map((w: any) => (
                    <TouchableOpacity key={w.id} onPress={() => setCollectedBy(w.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: C.gray100, backgroundColor: collectedBy === w.id ? '#FFFBEB' : 'transparent' }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, flexShrink: 0, borderColor: collectedBy === w.id ? C.amber : C.gray300, backgroundColor: collectedBy === w.id ? C.amber : 'transparent' }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: collectedBy === w.id ? '700' : '400', color: collectedBy === w.id ? '#92400E' : C.gray900 }}>
                          {w.fullName ?? w.username}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.gray400 }}>{w.role}{w.phone ? ` · ${w.phone}` : ''}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Worker warning banner */}
              {workerCollect && (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#F59E0B' }}>
                  <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '700', marginBottom: 2 }}>Cash stays with staff</Text>
                  <Text style={{ fontSize: 11, color: '#92400E' }}>
                    This will appear in Remittance until the staff member hands the cash to you and you remit it.
                  </Text>
                </View>
              )}
              {!workerCollect && <View style={{ marginBottom: 14 }} />}
            </>
          )}

          {/* Notes */}
          <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Any notes…"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 64, textAlignVertical: 'top', marginBottom: 16 }} />

          {/* Submit */}
          <Button
            label={submitLabel}
            variant={isCredit ? 'success' : workerCollect ? 'primary' : 'success'}
            fullWidth
            disabled={isExpired || (isCredit ? !creditCoversAll : (!amount || amtNum <= 0))}
            loading={recordMut.isPending}
            onPress={() => {
              const workerName = workerCollect
                ? ((collectors as any[]).find((w: any) => w.id === collectedBy)?.fullName ?? 'staff')
                : null;
              const confirmMsg = isCredit
                ? `Apply ₹${creditBalance.toLocaleString('en-IN')} credit balance to settle ₹${(outstanding ?? 0).toLocaleString('en-IN')} outstanding for ${selectedChit?.name}?`
                : workerCollect
                ? `Record ₹${amtNum.toLocaleString('en-IN')} collected by ${workerName} for ${selectedChit?.name}?\n\nCash stays with them until remitted.`
                : `Record ₹${amtNum.toLocaleString('en-IN')} via ${mode.replace(/_/g, ' ')} for ${selectedChit?.name}?`;
              Alert.alert('Confirm Payment', confirmMsg, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Record', onPress: () => recordMut.mutate() },
              ]);
            }}
          />
        </>
      )}

      {/* ── Payment history ────────────────────────────────────────────────── */}
      {memberId && chitId && (batches as any[]).length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ ...T.label, marginBottom: 10 }}>Payment History</Text>
          {(batches as any[]).map((b: any) => {
            const bColor = BATCH_COLOR[b.status] ?? C.gray400;
            const isPendingRemit = b.status === 'AWAITING_REMITTANCE' || b.status === 'COLLECTED';
            return (
              <Card key={b.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: bColor }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>
                        ₹{Number(b.amount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}
                      </Text>
                      <View style={{ backgroundColor: bColor + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: bColor }}>
                          {b.status === 'AWAITING_REMITTANCE' ? 'PENDING REMIT' : b.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>
                      {b.paymentMode === 'CREDIT' ? 'Credit Balance' : (b.paymentMode ?? 'CASH')} · {fmtDate(b.collectedAt ?? b.createdAt)}
                    </Text>
                    {b.collectedByName && (
                      <Text style={{ fontSize: 11, color: C.amber, marginTop: 1 }}>via {b.collectedByName}</Text>
                    )}
                    {b.notes && <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic' }}>"{b.notes}"</Text>}
                  </View>
                </View>
                {isPendingRemit && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Button label="Remit to Treasury" variant="outline" size="sm"
                      loading={remitMut.isPending}
                      onPress={() => Alert.alert('Remit', 'Mark this payment as remitted to treasury?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remit', onPress: () => remitMut.mutate(b.id) },
                      ])} />
                    <Button label="Void" variant="danger" size="sm"
                      onPress={() => { setVoidBatchId(b.id); setVoidReason(''); }} />
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* ── Void batch modal ───────────────────────────────────────────────── */}
      <Modal visible={!!voidBatchId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.red, marginBottom: 12 }}>Void Payment</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Reason *</Text>
            <TextInput value={voidReason} onChangeText={setVoidReason} multiline
              placeholder="e.g. Entered wrong amount, duplicate entry"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, minHeight: 72, fontSize: 14, color: C.gray900, marginBottom: 16, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setVoidBatchId('')} /></View>
              <View style={{ flex: 1 }}><Button label="Void" variant="danger" disabled={!voidReason.trim()} loading={voidMut.isPending} onPress={() => voidMut.mutate()} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUTS TAB  (create + disburse + cancel + void + full list)
// ─────────────────────────────────────────────────────────────────────────────
const PAYOUT_STATUS_COLOR: Record<string, string> = {
  PENDING: C.amber, PARTIALLY_DISBURSED: '#2563EB', DISBURSED: C.green,
  CANCELLED: C.gray400, VOIDED: C.red,
};

function PayoutsTab() {
  const { isExpired } = useUIStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');

  // ── Create Payout state ───────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [cpChitId, setCpChitId] = useState('');
  const [cpWinnerKey, setCpWinnerKey] = useState('');
  const [cpCollectCurrentMonth, setCpCollectCurrentMonth] = useState(false);
  const [cpInstallmentAmt, setCpInstallmentAmt] = useState('');
  const [cpCrossChitCollect, setCpCrossChitCollect] = useState<Record<string, { enabled: boolean; amount: string }>>({});
  const [cpSameChitOtherCollect, setCpSameChitOtherCollect] = useState<Record<string, { enabled: boolean; amount: string }>>({});
  const [cpDiscount, setCpDiscount] = useState('0');
  const [cpNotes, setCpNotes] = useState('');

  // ── Disburse state ────────────────────────────────────────────────────────
  const [disburseTarget, setDisburseTarget] = useState<any>(null);
  const [disburseAmt, setDisburseAmt] = useState('');
  const [disburseMode, setDisburseMode] = useState('CASH');
  const [disburseNotes, setDisburseNotes] = useState('');

  // ── Cancel / Void state ───────────────────────────────────────────────────
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [actionType, setActionType] = useState<'cancel' | 'void'>('cancel');
  const [actionReason, setActionReason] = useState('');

  // ── Base queries ──────────────────────────────────────────────────────────
  const { data: pending = [], isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['m-payouts-pending'], queryFn: getPendingPayouts,
  });
  const { data: allPayouts = [], isLoading: allLoading, refetch: refetchAll } = useQuery({
    queryKey: ['m-payouts-all'], queryFn: () => getAllPayouts(),
    enabled: filter === 'ALL',
  });
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: chits = [] } = useQuery({ queryKey: ['m-chits'], queryFn: getChits });

  // ── Create payout: all payouts for paid-key filtering ─────────────────────
  const { data: cpAllPayouts = [] } = useQuery({
    queryKey: ['m-cp-all-payouts'], queryFn: () => getAllPayouts(),
    enabled: showCreate,
    staleTime: 30_000,
  });

  // ── Create payout: winners for selected chit ──────────────────────────────
  const { data: cpWinners = [], isLoading: cpWinnersLoading } = useQuery({
    queryKey: ['m-cp-winners', cpChitId],
    queryFn: () => getWinners(cpChitId),
    enabled: !!cpChitId,
    staleTime: 60_000,
  });

  // ── Derived maps and list data ────────────────────────────────────────────
  const memberMap = Object.fromEntries(
    (members as any[]).flatMap((m: any) => {
      const entries: [string, any][] = [[m.id, m]];
      if (m.userId) entries.push([m.userId, m]);
      return entries;
    })
  );
  const chitMap = Object.fromEntries((chits as any[]).map((c: any) => [c.id, c.name ?? '—']));
  const displayPayouts = filter === 'PENDING' ? (pending as any[]) : (allPayouts as any[]);
  const isLoading = filter === 'PENDING' ? pendingLoading : allLoading;
  function refetch() { refetchPending(); refetchAll(); }

  const activeChits = (chits as any[]).filter((c: any) => c.status === 'ACTIVE');

  // Paid keys for selected chit (monthNumber:memberId)
  const cpPaidKeys = new Set(
    (cpAllPayouts as any[])
      .filter((p: any) => String(p.chitId) === String(cpChitId) && p.status !== 'CANCELLED')
      .map((p: any) => `${p.monthNumber ?? p.drawNumber}:${String(p.memberId)}`)
  );

  // Unpaid winners for the selected chit
  const cpUnpaidWinners = (cpWinners as any[]).filter((w: any) => {
    const mid = w.memberId ?? w.winnerId;
    return !cpPaidKeys.has(`${w.monthNumber}:${mid}`);
  });

  // Parse selected winner key "monthNumber:memberId"
  const [selMonth, selMid] = cpWinnerKey ? cpWinnerKey.split(':') : [];
  const selectedWinner = cpUnpaidWinners.find((w: any) => {
    const mid = String(w.memberId ?? w.winnerId);
    return String(w.monthNumber) === selMonth && mid === selMid;
  });
  const selectedMemberId = selectedWinner
    ? String(selectedWinner.memberId ?? selectedWinner.winnerId)
    : null;
  const selectedChit = (chits as any[]).find((c: any) => String(c.id) === String(cpChitId));
  const installmentAmount = Number(selectedChit?.installmentAmount ?? 0);

  // ── Create payout: member's other chits ───────────────────────────────────
  const { data: cpMemberChits = [], isLoading: cpMemberChitsLoading } = useQuery({
    queryKey: ['m-cp-member-chits', selectedMemberId],
    queryFn: () => getChitsForMember(selectedMemberId!),
    enabled: !!selectedMemberId,
    staleTime: 60_000,
  });

  const cpOtherActiveChits = (cpMemberChits as any[]).filter(
    (c: any) => String(c.id) !== String(cpChitId) && c.status === 'ACTIVE'
  );
  const cpOtherChitIdStr = cpOtherActiveChits.map((c: any) => c.id).join(',');

  // ── Create payout: current chit balance for winning month ─────────────────
  const { data: cpCurrentBalance, isLoading: cpCurrentBalanceLoading } = useQuery({
    queryKey: ['m-cp-current-balance', selectedMemberId, cpChitId],
    queryFn: () => getMemberBalance(selectedMemberId!, cpChitId),
    enabled: !!selectedMemberId && !!cpChitId,
    staleTime: 60_000,
  });

  // ── Create payout: cross-chit outstanding balances ────────────────────────
  const { data: cpCrossBalances = {}, isLoading: cpCrossBalancesLoading } = useQuery({
    queryKey: ['m-cp-cross-balances', selectedMemberId, cpOtherChitIdStr],
    queryFn: async () => {
      const entries = await Promise.all(
        cpOtherActiveChits.map((c: any) =>
          getMemberBalance(selectedMemberId!, c.id)
            .then((b: any) => [String(c.id), Number(b?.totalOutstanding ?? 0)])
            .catch(() => [String(c.id), 0])
        )
      );
      return Object.fromEntries(entries);
    },
    enabled: cpOtherActiveChits.length > 0 && !!selectedMemberId,
    staleTime: 60_000,
  });

  // Actual remaining installment for the winning month
  const winningMonthRemaining = (() => {
    if (!selectedWinner || !(cpCurrentBalance as any)?.months) return installmentAmount;
    const month = (cpCurrentBalance as any).months.find(
      (m: any) => m.monthNumber === selectedWinner.monthNumber
    );
    return month ? Number(month.balance ?? 0) : 0;
  })();

  // Other chits with outstanding balance > 0
  const cpOtherChitsWithBalance = cpOtherActiveChits.filter(
    (c: any) => ((cpCrossBalances as any)[String(c.id)] ?? 0) > 0
  );

  // ── Same-chit other outstanding months ───────────────────────────────────
  const sameChitOtherMonths = (() => {
    if (!selectedWinner || !(cpCurrentBalance as any)?.months) return [];
    return ((cpCurrentBalance as any).months as any[]).filter(
      (m: any) => m.monthNumber !== selectedWinner.monthNumber && Number(m.balance ?? 0) > 0
    );
  })();

  // ── Calculations ──────────────────────────────────────────────────────────
  const winningAmt = selectedWinner ? Number(selectedWinner.winningAmount ?? 0) : 0;
  const discountNum = Number(cpDiscount) || 0;
  const currentMonthDed = cpCollectCurrentMonth ? (Number(cpInstallmentAmt) || 0) : 0;
  const crossDed = Object.entries(cpCrossChitCollect)
    .filter(([, v]) => v.enabled)
    .reduce((sum, [, v]) => sum + Math.max(0, Number(v.amount) || 0), 0);
  const sameChitDed = Object.entries(cpSameChitOtherCollect)
    .filter(([, v]) => v.enabled)
    .reduce((sum, [, v]) => sum + Math.max(0, Number(v.amount) || 0), 0);
  const totalDeductions = discountNum + currentMonthDed + sameChitDed + crossDed;
  const netPayout = Math.max(0, winningAmt - totalDeductions);
  const isOverDeducted = totalDeductions > winningAmt;
  const settlementLoading = cpMemberChitsLoading || cpCurrentBalanceLoading || cpCrossBalancesLoading;

  function resetCreateForm() {
    setCpChitId('');
    setCpWinnerKey('');
    setCpCollectCurrentMonth(false);
    setCpInstallmentAmt('');
    setCpCrossChitCollect({});
    setCpSameChitOtherCollect({});
    setCpDiscount('0');
    setCpNotes('');
  }

  function toggleCrossChit(cId: string) {
    const balance = (cpCrossBalances as any)[String(cId)] ?? 0;
    setCpCrossChitCollect((prev) => {
      const current = prev[cId];
      if (current?.enabled) return { ...prev, [cId]: { enabled: false, amount: current.amount } };
      return { ...prev, [cId]: { enabled: true, amount: String(balance) } };
    });
  }

  const createMut = useMutation({
    mutationFn: () => {
      const mid = selectedWinner.memberId ?? selectedWinner.winnerId;
      const totalInstDed = currentMonthDed + sameChitDed;
      const instBreakdown = [
        ...(cpCollectCurrentMonth && currentMonthDed > 0 ? [{ month: selectedWinner.monthNumber, amount: currentMonthDed }] : []),
        ...Object.entries(cpSameChitOtherCollect)
          .filter(([, v]) => v.enabled && Number(v.amount) > 0)
          .map(([mNum, v]) => ({ month: Number(mNum), amount: Number(v.amount) })),
      ].sort((a, b) => a.month - b.month);
      return createPayout({
        chitId: cpChitId,
        memberId: mid,
        monthNumber: selectedWinner.monthNumber,
        winningAmount: winningAmt,
        discountAmount: totalDeductions,
        installmentSettlement: totalInstDed || undefined,
        crossChitSettlement: crossDed || undefined,
        manualAdjustment: discountNum,
        notes: cpNotes || undefined,
        collectCurrentMonthInstallment: cpCollectCurrentMonth && installmentAmount > 0,
        installmentMonthBreakdown: instBreakdown.length > 0 ? instBreakdown : undefined,
        crossChitDeductions: Object.entries(cpCrossChitCollect)
          .filter(([, v]) => v.enabled && Number(v.amount) > 0)
          .map(([xChitId, v]) => ({ chitId: xChitId, amount: Number(v.amount) })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-payouts-pending'] });
      qc.invalidateQueries({ queryKey: ['m-payouts-all'] });
      qc.invalidateQueries({ queryKey: ['m-cp-all-payouts'] });
      qc.invalidateQueries({ queryKey: ['m-cp-winners'] });
      setShowCreate(false);
      resetCreateForm();
      const msg = currentMonthDed > 0 || sameChitDed > 0 || crossDed > 0
        ? `Payout created · ₹${totalDeductions.toLocaleString('en-IN')} withheld as settlement`
        : 'Payout created — disburse when ready';
      toast.created(msg);
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to create payout — please try again.'),
  });

  const disburseMut = useMutation({
    mutationFn: () => disbursePayout(disburseTarget.id, {
      amount: Number(disburseAmt), paymentMode: disburseMode, notes: disburseNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-payouts-pending'] });
      qc.invalidateQueries({ queryKey: ['m-payouts-all'] });
      setDisburseTarget(null); setDisburseAmt(''); setDisburseNotes('');
      toast.saved('Payout disbursed successfully');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Disbursement failed — please try again.'),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelPayout(actionTarget.id, actionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-payouts-pending'] });
      qc.invalidateQueries({ queryKey: ['m-payouts-all'] });
      setActionTarget(null); setActionReason('');
      toast.cancelled('Payout cancelled');
    },
    onError: (e: any) => Alert.alert('Cannot Cancel', e.response?.data?.message ?? 'Cancellation failed — payout may be in a state that cannot be cancelled.'),
  });

  const voidMut = useMutation({
    mutationFn: () => voidPayout(actionTarget.id, actionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-payouts-pending'] });
      qc.invalidateQueries({ queryKey: ['m-payouts-all'] });
      setActionTarget(null); setActionReason('');
      toast.voided('Payout voided');
    },
    onError: (e: any) => Alert.alert('Cannot Void', e.response?.data?.message ?? 'Void failed — payout may already be disbursed or in a non-voidable state.'),
  });

  const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Actions row */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Button label="+ Create Payout" variant="primary" size="sm" disabled={isExpired} onPress={() => setShowCreate(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={filter === 'PENDING' ? 'Show All' : 'Show Pending'} variant="outline" size="sm"
            onPress={() => setFilter(f => f === 'PENDING' ? 'ALL' : 'PENDING')} />
        </View>
      </View>

      <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12 }}>
        {displayPayouts.length} {filter === 'PENDING' ? 'pending' : 'total'} payouts
      </Text>

      {displayPayouts.length === 0 && <EmptyState title="No payouts" message={filter === 'PENDING' ? 'No pending payouts.' : 'No payouts recorded yet.'} />}

      {displayPayouts.map((p: any) => {
        const pColor = PAYOUT_STATUS_COLOR[p.status] ?? C.gray300;
        return (
          <Card key={p.id} style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: pColor }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                  {(memberMap[p.memberId ?? p.winnerId] as any)?.fullName ?? 'Unknown'}
                </Text>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  {chitMap[p.chitId] ?? '—'} · Draw #{p.drawNumber ?? p.monthNumber ?? '—'}
                </Text>
                {p.createdAt && <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{fmtDate(p.createdAt)}</Text>}
              </View>
              <View style={{ backgroundColor: pColor + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: pColor }}>{p.status}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 20, marginBottom: 8 }}>
              <View>
                <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Net Payout</Text>
                <Amount value={p.netPayoutAmount ?? p.winningAmount ?? p.payoutAmount ?? 0} size="sm" color={C.green} />
              </View>
              {(p.disbursedAmount ?? 0) > 0 && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Disbursed</Text>
                  <Amount value={p.disbursedAmount} size="sm" color={C.navy} />
                </View>
              )}
              {(p.remainingAmount ?? 0) > 0 && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Remaining</Text>
                  <Amount value={p.remainingAmount} size="sm" color={C.amber} />
                </View>
              )}
              {p.disbursementMode && (
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Mode</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>{p.disbursementMode}</Text>
                </View>
              )}
            </View>
            {p.notes && <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic', marginBottom: 6 }}>"{p.notes}"</Text>}
            {(p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED') && (p.disbursements?.length ?? 0) > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 6 }}>
                  Disbursement{p.disbursements.length > 1 ? ` Transactions (${p.disbursements.length})` : ''}
                </Text>
                {p.disbursements.map((d: any, i: number) => (
                  <View key={d.id} style={{ backgroundColor: C.gray50, borderRadius: 8, padding: 8, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray900 }}>
                        #{i + 1} · ₹{Number(d.amount).toLocaleString('en-IN')}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.gray500 }}>{d.mode?.replace('_', ' ')}</Text>
                    </View>
                    {d.referenceNumber && (
                      <Text style={{ fontSize: 11, color: C.gray400, fontFamily: 'monospace', marginTop: 2 }}>{d.referenceNumber}</Text>
                    )}
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                      {new Date(d.disbursedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {d.notes && <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginTop: 2 }}>{d.notes}</Text>}
                  </View>
                ))}
              </View>
            )}
            <Divider />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(p.status === 'PENDING' || p.status === 'PARTIALLY_DISBURSED') && (
                <Button label="Disburse" variant="success" size="sm" disabled={isExpired} onPress={() => {
                  setDisburseTarget(p);
                  setDisburseAmt(String(p.remainingAmount ?? p.netPayoutAmount ?? p.winningAmount ?? ''));
                  setDisburseMode('CASH');
                  setDisburseNotes('');
                }} />
              )}
              {p.status === 'PENDING' && (
                <Button label="Cancel" variant="ghost" size="sm" onPress={() => {
                  setActionTarget(p); setActionType('cancel'); setActionReason('');
                }} />
              )}
              {/* Void only for PENDING — cannot void once any disbursement has gone out */}
              {p.status === 'PENDING' && (
                <Button label="Void" variant="danger" size="sm" onPress={() => {
                  setActionTarget(p); setActionType('void'); setActionReason('');
                }} />
              )}
            </View>
          </Card>
        );
      })}

      {/* ── Create Payout Modal ──────────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowCreate(false); resetCreateForm(); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={T.h2}>Create Payout</Text>
            <TouchableOpacity onPress={() => { setShowCreate(false); resetCreateForm(); }}>
              <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Step 1: Chit selection */}
            <Text style={{ ...T.label, marginBottom: 8 }}>Select Chit *</Text>
            {activeChits.length === 0 ? (
              <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: C.gray500, fontStyle: 'italic' }}>No active chits found.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {activeChits.map((c: any) => (
                    <TouchableOpacity key={c.id}
                      onPress={() => { setCpChitId(c.id); setCpWinnerKey(''); setCpCollectCurrentMonth(false); setCpCrossChitCollect({}); setCpDiscount('0'); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: cpChitId === c.id ? C.navy : C.gray300, backgroundColor: cpChitId === c.id ? C.navy50 : C.white }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: cpChitId === c.id ? C.navy : C.gray700 }}>{c.name}</Text>
                      {c.totalAmount && <Amount value={c.totalAmount} size="sm" color={cpChitId === c.id ? C.navy : C.green} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Step 2: Winner picker */}
            {cpChitId && (
              <>
                <Text style={{ ...T.label, marginBottom: 8 }}>Select Winner *</Text>
                {cpWinnersLoading ? (
                  <Text style={{ fontSize: 13, color: C.gray400, marginBottom: 16 }}>Loading winners…</Text>
                ) : cpUnpaidWinners.length === 0 ? (
                  <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, color: C.gray500, fontStyle: 'italic' }}>
                      {(cpWinners as any[]).length === 0
                        ? 'No winners recorded for this chit yet. Open the chit to record winners.'
                        : 'All recorded winners already have payouts created.'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 180, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12, marginBottom: 16 }} nestedScrollEnabled>
                    {cpUnpaidWinners.map((w: any) => {
                      const mid = w.memberId ?? w.winnerId;
                      const key = `${w.monthNumber}:${mid}`;
                      const member = (memberMap as any)[String(mid)];
                      const name = member?.fullName ?? `Member #${String(mid).slice(0, 8)}`;
                      return (
                        <TouchableOpacity key={key}
                          onPress={() => { setCpWinnerKey(key); setCpCollectCurrentMonth(false); setCpCrossChitCollect({}); setCpDiscount('0'); }}
                          style={{ padding: 12, backgroundColor: cpWinnerKey === key ? C.navy50 : 'transparent', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                          <Text style={{ fontSize: 14, fontWeight: cpWinnerKey === key ? '700' : '400', color: cpWinnerKey === key ? C.navy : C.gray900 }}>
                            Draw {w.monthNumber} — {name} {cpWinnerKey === key ? '✓' : ''}
                          </Text>
                          <Text style={{ fontSize: 12, color: C.green, fontWeight: '600', marginTop: 2 }}>
                            ₹{Number(w.winningAmount ?? 0).toLocaleString('en-IN')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {/* Step 3: Winner banner + settlement */}
            {selectedWinner && (() => {
              const memberName = (memberMap as any)[String(selectedWinner.memberId ?? selectedWinner.winnerId)]?.fullName ?? 'Winner';
              return (
                <>
                  {/* Winner banner */}
                  <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>
                      Draw {selectedWinner.monthNumber} — {memberName}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#78350F', marginTop: 2 }}>
                      Winning amount: ₹{winningAmt.toLocaleString('en-IN')}
                    </Text>
                    {installmentAmount > 0 && (
                      <Text style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                        Monthly installment: ₹{installmentAmount.toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>

                  {/* Collect at payout section */}
                  <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 12 }}>
                      Collect at Payout
                    </Text>
                    {settlementLoading ? (
                      <Text style={{ fontSize: 13, color: C.gray400 }}>Checking outstanding dues…</Text>
                    ) : (
                      <>
                        {/* Current draw installment toggle */}
                        {installmentAmount > 0 ? (
                          <View style={{ marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500' }}>
                                  Draw {selectedWinner.monthNumber} installment
                                </Text>
                                <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>
                                  ₹{installmentAmount.toLocaleString('en-IN')}/slot
                                  {winningMonthRemaining > 0
                                    ? ` · ₹${winningMonthRemaining.toLocaleString('en-IN')} outstanding`
                                    : ' · already paid'}
                                </Text>
                              </View>
                              <Switch
                                value={cpCollectCurrentMonth}
                                onValueChange={(v) => {
                                  setCpCollectCurrentMonth(v);
                                  if (v) setCpInstallmentAmt(String(winningMonthRemaining || installmentAmount));
                                  else setCpInstallmentAmt('');
                                }}
                                trackColor={{ false: C.gray300, true: C.navy }}
                                thumbColor={C.white}
                              />
                            </View>
                            {cpCollectCurrentMonth && (
                              <View style={{ marginTop: 8 }}>
                                <TextInput
                                  value={cpInstallmentAmt}
                                  onChangeText={setCpInstallmentAmt}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  placeholderTextColor={C.gray400}
                                  style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 8, padding: 10, fontSize: 15, color: C.gray900, fontWeight: '600', marginBottom: 6 }}
                                />
                                <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 4 }}>
                                  Quick set (₹{installmentAmount.toLocaleString('en-IN')} × slots):
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                  {[1, 2, 3, 4].map((n) => (
                                    <TouchableOpacity
                                      key={n}
                                      onPress={() => setCpInstallmentAmt(String(installmentAmount * n))}
                                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: Number(cpInstallmentAmt) === installmentAmount * n ? C.navy : C.gray300, backgroundColor: Number(cpInstallmentAmt) === installmentAmount * n ? C.navy50 : C.white }}>
                                      <Text style={{ fontSize: 12, fontWeight: '700', color: Number(cpInstallmentAmt) === installmentAmount * n ? C.navy : C.gray500 }}>
                                        ×{n}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 13, color: C.gray400, fontStyle: 'italic', marginBottom: 10 }}>
                            No installment amount set for this chit.
                          </Text>
                        )}

                        {/* Same-chit other outstanding months */}
                        {sameChitOtherMonths.length > 0 && (
                          <>
                            <Divider />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginTop: 10, marginBottom: 8 }}>
                              Other outstanding months in this chit
                            </Text>
                            {sameChitOtherMonths.map((m: any) => {
                              const mKey = String(m.monthNumber);
                              const bal = Number(m.balance ?? 0);
                              const state = cpSameChitOtherCollect[mKey];
                              return (
                                <View key={mKey} style={{ marginBottom: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                      <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500' }}>Draw {m.monthNumber} installment</Text>
                                      <Text style={{ fontSize: 11, color: C.red, marginTop: 2 }}>
                                        Outstanding: ₹{bal.toLocaleString('en-IN')}
                                      </Text>
                                    </View>
                                    <Switch
                                      value={state?.enabled ?? false}
                                      onValueChange={(v) => {
                                        setCpSameChitOtherCollect((prev) => {
                                          const cur = prev[mKey];
                                          if (cur?.enabled) return { ...prev, [mKey]: { enabled: false, amount: cur.amount } };
                                          return { ...prev, [mKey]: { enabled: true, amount: String(bal) } };
                                        });
                                      }}
                                      trackColor={{ false: C.gray300, true: C.navy }}
                                      thumbColor={C.white}
                                    />
                                  </View>
                                  {state?.enabled && (
                                    <TextInput
                                      value={state.amount}
                                      onChangeText={(v) => setCpSameChitOtherCollect((prev) => ({ ...prev, [mKey]: { ...prev[mKey], amount: v } }))}
                                      keyboardType="numeric"
                                      placeholder="Amount to collect"
                                      placeholderTextColor={C.gray400}
                                      style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 8, padding: 10, fontSize: 14, color: C.gray900, marginTop: 8 }}
                                    />
                                  )}
                                </View>
                              );
                            })}
                          </>
                        )}

                        {/* Cross-chit outstanding dues */}
                        {cpOtherChitsWithBalance.length > 0 && (
                          <>
                            <Divider />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginTop: 10, marginBottom: 8 }}>
                              Outstanding in other chits
                            </Text>
                            {cpOtherChitsWithBalance.map((c: any) => {
                              const cId = String(c.id);
                              const balance = (cpCrossBalances as any)[cId] ?? 0;
                              const state = cpCrossChitCollect[cId];
                              return (
                                <View key={cId} style={{ marginBottom: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                      <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500' }}>{c.name}</Text>
                                      <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>
                                        Outstanding: ₹{balance.toLocaleString('en-IN')}
                                      </Text>
                                    </View>
                                    <Switch
                                      value={state?.enabled ?? false}
                                      onValueChange={() => toggleCrossChit(cId)}
                                      trackColor={{ false: C.gray300, true: C.navy }}
                                      thumbColor={C.white}
                                    />
                                  </View>
                                  {state?.enabled && (
                                    <TextInput
                                      value={state.amount}
                                      onChangeText={(v) => setCpCrossChitCollect((prev) => ({ ...prev, [cId]: { ...prev[cId], amount: v } }))}
                                      keyboardType="numeric"
                                      placeholder="Amount to collect"
                                      placeholderTextColor={C.gray400}
                                      style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 8, padding: 10, fontSize: 14, color: C.gray900, marginTop: 8 }}
                                    />
                                  )}
                                </View>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </View>

                  {/* Manual discount */}
                  <Text style={{ ...T.label, marginBottom: 6 }}>Manual Discount / Adjustment (₹)</Text>
                  <TextInput
                    value={cpDiscount}
                    onChangeText={setCpDiscount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={C.gray400}
                    style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 16 }}
                  />

                  {/* Net payout summary */}
                  <View style={{ backgroundColor: isOverDeducted ? '#FEF2F2' : '#F0FDF4', borderWidth: 1, borderColor: isOverDeducted ? C.red : C.green, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    {totalDeductions > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, color: C.gray600 }}>Winning amount</Text>
                        <Text style={{ fontSize: 13, color: C.gray600 }}>₹{winningAmt.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {currentMonthDed > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>− Draw {selectedWinner.monthNumber} installment</Text>
                        <Text style={{ fontSize: 12, color: C.red }}>−₹{currentMonthDed.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {Object.entries(cpSameChitOtherCollect)
                      .filter(([, v]) => v.enabled)
                      .map(([mNum, v]) => (
                        <View key={mNum} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: C.gray500 }}>− Draw {mNum} installment</Text>
                          <Text style={{ fontSize: 12, color: C.red }}>
                            −₹{Number(v.amount || 0).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    {Object.entries(cpCrossChitCollect)
                      .filter(([, v]) => v.enabled)
                      .map(([cId, v]) => (
                        <View key={cId} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>
                            − {chitMap[cId] ?? 'Other chit'}
                          </Text>
                          <Text style={{ fontSize: 12, color: C.red }}>
                            −₹{Number(v.amount || 0).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    {discountNum > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>− Manual discount</Text>
                        <Text style={{ fontSize: 12, color: C.red }}>−₹{discountNum.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {totalDeductions > 0 && (
                      <View style={{ borderTopWidth: 1, borderTopColor: isOverDeducted ? '#FECACA' : '#BBF7D0', marginVertical: 8 }} />
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isOverDeducted ? C.red : C.green }}>
                        {isOverDeducted ? 'Over-deducted!' : 'Net Payout'}
                      </Text>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: isOverDeducted ? C.red : C.green }}>
                        ₹{netPayout.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </>
              );
            })()}

            {/* Notes */}
            <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
            <TextInput
              value={cpNotes}
              onChangeText={setCpNotes}
              multiline
              placeholder="Any notes…"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 64, textAlignVertical: 'top' }}
            />
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button
              label="Create Payout"
              variant="primary"
              fullWidth
              disabled={!selectedWinner || winningAmt <= 0 || isOverDeducted || netPayout <= 0}
              loading={createMut.isPending}
              onPress={() => Alert.alert(
                'Create Payout',
                `Create a ₹${netPayout.toLocaleString('en-IN')} payout for ${(memberMap as any)[String(selectedWinner?.memberId ?? selectedWinner?.winnerId)]?.fullName ?? 'Winner'} — Draw #${selectedWinner?.monthNumber}?${totalDeductions > 0 ? `\n\n₹${totalDeductions.toLocaleString('en-IN')} withheld as settlement.` : ''}`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Create', onPress: () => createMut.mutate() },
                ]
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Disburse Modal ───────────────────────────────────────────────────── */}
      <Modal visible={!!disburseTarget} animationType="slide" transparent onRequestClose={() => setDisburseTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.green, marginBottom: 4 }}>Disburse Payout</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
              Winner: {(memberMap[disburseTarget?.memberId ?? disburseTarget?.winnerId] as any)?.fullName ?? '—'}
              {disburseTarget?.status === 'PARTIALLY_DISBURSED' && ' (partial — add another tranche)'}
            </Text>
            <Text style={{ ...T.label, marginBottom: 6 }}>Amount (₹) *</Text>
            <TextInput value={disburseAmt} onChangeText={setDisburseAmt} keyboardType="numeric"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900, fontWeight: '700', marginBottom: 14 }} />
            <Text style={{ ...T.label, marginBottom: 8 }}>Payment Mode</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {MODES.map((m) => (
                <TouchableOpacity key={m} onPress={() => setDisburseMode(m)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 2, borderColor: disburseMode === m ? C.green : C.gray300, backgroundColor: disburseMode === m ? '#F0FDF4' : C.white }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: disburseMode === m ? C.green : C.gray700 }}>{m.replace(/_/g, ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
            <TextInput value={disburseNotes} onChangeText={setDisburseNotes} placeholder="e.g. Paid via NEFT"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setDisburseTarget(null)} /></View>
              <View style={{ flex: 1 }}><Button label="Disburse" variant="success"
                disabled={!disburseAmt || Number(disburseAmt) <= 0} loading={disburseMut.isPending}
                onPress={() => Alert.alert('Confirm', `Disburse ₹${Number(disburseAmt).toLocaleString('en-IN')} via ${disburseMode}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disburse', onPress: () => disburseMut.mutate() },
                ])} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Cancel / Void Modal ──────────────────────────────────────────────── */}
      <Modal visible={!!actionTarget} animationType="slide" transparent onRequestClose={() => setActionTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.red, marginBottom: 4 }}>
              {actionType === 'cancel' ? 'Cancel Payout' : 'Void Payout'}
            </Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
              {actionType === 'void' ? 'Voiding is irreversible. The payout will be marked VOIDED for audit purposes.' : 'Cancel this pending payout.'}
            </Text>
            <Text style={{ ...T.label, marginBottom: 6 }}>Reason *</Text>
            <TextInput value={actionReason} onChangeText={setActionReason} multiline
              placeholder={actionType === 'cancel' ? 'e.g. Member withdrew from chit' : 'e.g. Entered wrong amount'}
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, minHeight: 72, fontSize: 14, color: C.gray900, marginBottom: 16, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Back" variant="ghost" onPress={() => setActionTarget(null)} /></View>
              <View style={{ flex: 1 }}>
                <Button label={actionType === 'cancel' ? 'Cancel Payout' : 'Void Payout'} variant="danger"
                  disabled={!actionReason.trim()}
                  loading={actionType === 'cancel' ? cancelMut.isPending : voidMut.isPending}
                  onPress={() => actionType === 'cancel' ? cancelMut.mutate() : voidMut.mutate()} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TREASURY TAB
// ─────────────────────────────────────────────────────────────────────────────
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function resolveDesc(desc: string | null | undefined, memberMap: Record<string, string>, chitMap: Record<string, string>, staffMap: Record<string, string>): string {
  if (!desc) return '—';
  return desc.replace(UUID_RE, (uuid) => {
    const k = uuid.toLowerCase();
    return memberMap[k] ?? chitMap[k] ?? staffMap[k] ?? uuid.slice(0, 8) + '…';
  });
}

function TreasuryTab() {
  const { isExpired } = useUIStore();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [txAccountType, setTxAccountType] = useState<'CASH' | 'BANK'>('CASH');
  const [txCategory, setTxCategory] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txMemberId, setTxMemberId] = useState('');

  const TX_CATEGORIES_IN  = ['Multiple Payments Collection', 'Multi-Slot Installment Collection', 'Member Payment', 'Chit Payout Return', 'Investment', 'Other Income'];
  const TX_CATEGORIES_OUT = ['Payout Disbursement', 'Multi-Slot Payout Disbursement', 'Credit Balance Return', 'Salary', 'Expense', 'Personal Withdrawal', 'Other Expense'];
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [txShowCount, setTxShowCount] = useState(20);

  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } = useQuery({ queryKey: ['m-wallet'], queryFn: getWalletBalance });
  const { data: txns = [], isLoading: txLoading, refetch: refetchTxns } = useQuery({ queryKey: ['m-wallet-txns'], queryFn: getWalletTransactions, staleTime: 0 });
  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers, staleTime: 120_000 });
  const { data: allChits = [] } = useQuery({ queryKey: ['m-chits'], queryFn: getChits, staleTime: 120_000 });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff, staleTime: 120_000 });

  const memberMap = Object.fromEntries((members as any[]).map((m: any) => [m.id.toLowerCase(), m.fullName ?? '—']));
  const chitMap   = Object.fromEntries((allChits as any[]).map((c: any) => [c.id.toLowerCase(), c.name ?? '—']));
  const staffMap  = Object.fromEntries((staff as any[]).map((s: any) => [s.id.toLowerCase(), s.fullName ?? s.username ?? '—']));

  const isCreditReturn = txCategory === 'Credit Balance Return';
  const { data: txMemberCreditData, isLoading: txCreditLoading } = useQuery({
    queryKey: ['m-treasury-credit', txMemberId],
    queryFn: () => getMemberCredit(txMemberId),
    enabled: isCreditReturn && !!txMemberId,
  });
  const txAvailableCredit = txMemberCreditData ? Number((txMemberCreditData as any).balance ?? 0) : null;

  const addMut = useMutation({
    mutationFn: () => isCreditReturn
      ? redeemMemberCredit({ memberId: txMemberId, amount: Number(txAmount), accountType: txAccountType, notes: txNotes || null })
      : addWalletTransaction({
          amount: Number(txAmount),
          entryType: txType === 'DEPOSIT' ? 'IN' : 'OUT',
          accountType: txAccountType,
          category: txCategory || undefined,
          description: txNotes || undefined,
        }),
    onSuccess: () => {
      setShowAdd(false); setTxAmount(''); setTxCategory(''); setTxNotes(''); setTxMemberId('');
      toast.saved(isCreditReturn ? 'Credit balance returned to member' : `${txType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} recorded`);
      refetchWallet();
      refetchTxns();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to record transaction.'),
  });

  function onRefresh() { refetchWallet(); refetchTxns(); }
  const isLoading = walletLoading || txLoading;

  const w = wallet as any;
  const cashBal = Number(w?.cashBalance ?? 0);
  const bankBal = Number(w?.bankBalance ?? 0);
  const totalBal = Number(w?.totalBalance ?? 0);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Balance Card */}
      <View style={{ backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 11, color: C.white + '80', fontWeight: '600', marginBottom: 8, letterSpacing: 1 }}>TREASURY BALANCE</Text>
        <Text style={{ fontSize: 36, fontWeight: '800', color: C.gold, marginBottom: 8 }}>
          ₹{totalBal.toLocaleString('en-IN')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View>
            <Text style={{ fontSize: 11, color: C.white + '60' }}>CASH</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.white }}>{cashBal < 0 ? '−' : ''}₹{Math.abs(cashBal).toLocaleString('en-IN')}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: C.white + '60' }}>BANK</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.white }}>{bankBal < 0 ? '−' : ''}₹{Math.abs(bankBal).toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Button label="+ Deposit" variant="success" disabled={isExpired} onPress={() => { setShowAdd(true); setTxType('DEPOSIT'); setTxCategory(''); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="− Withdrawal" variant="danger" disabled={isExpired} onPress={() => { setShowAdd(true); setTxType('WITHDRAWAL'); setTxCategory(''); }} />
        </View>
      </View>

      <SectionHeader title={`Transactions (${Math.min(txShowCount, (txns as any[]).length)} of ${(txns as any[]).length})`} />
      {(txns as any[]).length === 0 && <EmptyState title="No transactions" message="Add deposits or withdrawals above." />}
      {(txns as any[]).slice(0, txShowCount).map((tx: any) => {
        const isOut = tx.entryType === 'OUT' || (tx.entryType ?? '').includes('WITHDRAWAL');
        return (
          <TouchableOpacity key={tx.id} onPress={() => setSelectedTx(tx)} activeOpacity={0.75}>
            <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: isOut ? C.red : C.green }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isOut ? C.red : C.green }}>
                      {isOut ? 'OUT' : 'IN'}
                    </Text>
                    {tx.accountType && (
                      <View style={{ backgroundColor: C.gray100, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: C.gray500 }}>{tx.accountType}</Text>
                      </View>
                    )}
                    {tx.category && (
                      <Text style={{ fontSize: 11, color: C.gray400 }}>{tx.category}</Text>
                    )}
                  </View>
                  {(tx.description ?? tx.notes) && (
                    <Text style={{ fontSize: 12, color: C.gray600, marginTop: 3 }}>{resolveDesc(tx.description ?? tx.notes, memberMap, chitMap, staffMap)}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{fmtDateTime(tx.createdAt ?? tx.timestamp)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: isOut ? C.red : C.green }}>
                    {isOut ? '−' : '+'}₹{Number(tx.amount).toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>tap for detail →</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}

      {/* Add Transaction Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: txType === 'DEPOSIT' ? C.green : C.red, marginBottom: 16 }}>
              {txType === 'DEPOSIT' ? '+ Add Deposit' : '− Record Withdrawal'}
            </Text>

            <Text style={{ ...T.label, marginBottom: 8 }}>Account</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['CASH', 'BANK'] as const).map((a) => (
                <TouchableOpacity key={a} onPress={() => setTxAccountType(a)}
                  style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1.5, alignItems: 'center',
                    borderColor: txAccountType === a ? C.navy : C.gray300,
                    backgroundColor: txAccountType === a ? C.navy50 : C.white }}>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: txAccountType === a ? C.navy : C.gray500 }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ ...T.label, marginBottom: 8 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {(txType === 'DEPOSIT' ? TX_CATEGORIES_IN : TX_CATEGORIES_OUT).map((cat) => (
                <TouchableOpacity key={cat} onPress={() => setTxCategory(txCategory === cat ? '' : cat)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5,
                    borderColor: txCategory === cat ? (txType === 'DEPOSIT' ? C.green : C.red) : C.gray300,
                    backgroundColor: txCategory === cat ? (txType === 'DEPOSIT' ? '#F0FDF4' : '#FEF2F2') : C.white }}>
                  <Text style={{ fontSize: 12, fontWeight: '600',
                    color: txCategory === cat ? (txType === 'DEPOSIT' ? C.green : C.red) : C.gray500 }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Credit Balance Return: member picker + credit info */}
            {isCreditReturn && (
              <>
                <Text style={{ ...T.label, marginBottom: 8 }}>Member *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(members as any[]).filter((m: any) => m.status !== 'INACTIVE').map((m: any) => (
                      <TouchableOpacity key={m.id} onPress={() => { setTxMemberId(m.id); setTxAmount(''); }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: txMemberId === m.id ? '#059669' : C.gray300, backgroundColor: txMemberId === m.id ? '#ECFDF5' : C.white }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: txMemberId === m.id ? '#059669' : C.gray700 }}>{m.fullName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {txMemberId && (
                  <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    {txCreditLoading ? (
                      <Text style={{ fontSize: 12, color: '#059669' }}>Loading credit balance…</Text>
                    ) : txAvailableCredit !== null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#065F46' }}>Available Credit</Text>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: '#059669' }}>₹{txAvailableCredit.toLocaleString('en-IN')}</Text>
                        </View>
                        {txAvailableCredit > 0 && (
                          <TouchableOpacity onPress={() => setTxAmount(String(txAvailableCredit))}
                            style={{ backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: 'white' }}>Withdraw All</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}
                    {txAvailableCredit === 0 && <Text style={{ fontSize: 12, color: '#059669' }}>No credit balance to return.</Text>}
                  </View>
                )}
              </>
            )}

            <Text style={{ ...T.label, marginBottom: 6 }}>Amount (₹)</Text>
            <TextInput value={txAmount} onChangeText={setTxAmount} keyboardType="numeric" placeholder="0"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, marginBottom: 16 }} />
            <Text style={{ ...T.label, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput value={txNotes} onChangeText={setTxNotes} placeholder="e.g. Monthly collection" multiline
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 64, textAlignVertical: 'top', marginBottom: 20 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setShowAdd(false)} /></View>
              <View style={{ flex: 1 }}><Button label="Save" variant={txType === 'DEPOSIT' ? 'success' : 'danger'}
                disabled={!txAmount || Number(txAmount) <= 0 || (isCreditReturn && (!txMemberId || txAvailableCredit === 0 || Number(txAmount) > (txAvailableCredit ?? 0)))}
                loading={addMut.isPending}
                onPress={() => addMut.mutate()} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal visible={!!selectedTx} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedTx(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={T.h2}>Transaction Detail</Text>
            <TouchableOpacity onPress={() => setSelectedTx(null)}
              style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          {selectedTx && (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {/* Amount banner */}
              <View style={{
                backgroundColor: (selectedTx.entryType === 'OUT') ? '#FEF2F2' : '#F0FDF4',
                borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: selectedTx.entryType === 'OUT' ? C.red : C.green, marginBottom: 4 }}>
                  {selectedTx.entryType === 'OUT' ? 'OUTGOING' : 'INCOMING'}
                </Text>
                <Text style={{ fontSize: 36, fontWeight: '800', color: selectedTx.entryType === 'OUT' ? C.red : C.green }}>
                  {selectedTx.entryType === 'OUT' ? '−' : '+'}₹{Number(selectedTx.amount).toLocaleString('en-IN')}
                </Text>
              </View>

              {/* Credit withdrawal info banner */}
              {selectedTx.category === 'CREDIT_WITHDRAWAL' && (
                <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>Credit Balance Return</Text>
                  <Text style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>Member's credit balance was returned as cash — credits deducted from their account.</Text>
                </View>
              )}

              {/* Details */}
              <Card style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: C.gray500, fontWeight: '600', marginBottom: 12 }}>TRANSACTION DETAILS</Text>
                {[
                  { label: 'Type', value: selectedTx.entryType === 'OUT' ? 'Withdrawal / Outgoing' : 'Deposit / Incoming' },
                  { label: 'Account', value: selectedTx.accountType ?? '—' },
                  { label: 'Category', value: selectedTx.category === 'CREDIT_WITHDRAWAL' ? 'Credit Balance Return' : (selectedTx.category ?? '—') },
                  { label: 'Description', value: resolveDesc(selectedTx.description ?? selectedTx.notes, memberMap, chitMap, staffMap) },
                  { label: 'Date', value: fmtDateTime(selectedTx.createdAt) },
                  { label: 'ID', value: String(selectedTx.id)?.slice(0, 8) + '…' },
                  { label: 'Created By', value: selectedTx.createdBy ? (staffMap[String(selectedTx.createdBy).toLowerCase()] ?? memberMap[String(selectedTx.createdBy).toLowerCase()] ?? String(selectedTx.createdBy).slice(0, 8) + '…') : '—' },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', marginBottom: 10, gap: 8 }}>
                    <Text style={{ fontSize: 13, color: C.gray500, width: 90, flexShrink: 0 }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500', flex: 1 }}>{row.value}</Text>
                  </View>
                ))}
              </Card>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Treasury Load More */}
      {(txns as any[]).length > txShowCount && (
        <TouchableOpacity onPress={() => setTxShowCount(c => c + 20)}
          style={{ margin: 16, marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>Load More ({(txns as any[]).length - txShowCount} remaining)</Text>
        </TouchableOpacity>
      )}
      {(txns as any[]).length > 20 && (txns as any[]).length <= txShowCount && (
        <Text style={{ textAlign: 'center', color: C.gray400, margin: 16, fontSize: 12 }}>All {(txns as any[]).length} transactions shown</Text>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTLEMENT TAB
// ─────────────────────────────────────────────────────────────────────────────
const SETT_PURPLE = '#7C3AED';
const SETT_PURPLE_LIGHT = '#F5F3FF';
const SETT_PURPLE_BORDER = '#DDD6FE';

const CASE_COLOR: Record<string, string> = {
  CASE_A: C.amber, CASE_B1: C.navy, CASE_B2: '#7C3AED', UNKNOWN: C.gray400,
};
const CASE_LABEL: Record<string, string> = {
  CASE_A: 'Case A', CASE_B1: 'Case B1', CASE_B2: 'Case B2', UNKNOWN: 'Unknown',
};

function SettlementTab({ initialMemberId }: { initialMemberId?: string }) {
  const { isExpired } = useUIStore();
  const qc = useQueryClient();

  // Step state: 'pick' | 'preview' | 'payment' | 'history'
  const [step, setStep] = useState<'pick' | 'preview' | 'payment' | 'history'>('pick');
  const [memberId, setMemberId] = useState(initialMemberId ?? '');
  const [memberSearch, setMemberSearch] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [confirmedSettlement, setConfirmedSettlement] = useState<any>(null);

  // Adjustment / notes
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [notes, setNotes] = useState('');

  // Payment step
  const [payMode, setPayMode] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Expand/collapse per chit
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Pending settlements pagination
  const [pendingPage, setPendingPage] = useState(0);
  // History pagination
  const [histPage, setHistPage] = useState(0);

  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: histData, isLoading: histLoading } = useQuery({
    queryKey: ['m-settlement-history', memberId, histPage],
    queryFn: () => getMemberSettlements(memberId, histPage, 10),
    enabled: !!memberId && step === 'history',
  });
  const history = histData?.content ?? [];
  const histTotalPages = histData?.totalPages ?? 0;

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['m-settlement-pending', pendingPage],
    queryFn: () => getPendingSettlements(pendingPage, 10),
  });
  const pendingSettlements = pendingData?.content ?? [];
  const pendingTotalPages = pendingData?.totalPages ?? 0;
  const pendingTotalElements = pendingData?.totalElements ?? 0;

  const activeMembers = (members as any[]).filter((m: any) => m.status !== 'INACTIVE');
  const filteredMembers = activeMembers.filter((m: any) => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q);
  });
  const selectedMember = (members as any[]).find((m: any) => m.id === memberId);

  const previewMut = useMutation({
    mutationFn: () => getSettlementPreview(memberId),
    onSuccess: (data) => { setPreview(data); setStep('preview'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Preview failed'),
  });

  const confirmMut = useMutation({
    mutationFn: () => {
      const chitItems = (preview?.chitItems ?? []).map((ci: any) => ({
        chitId: ci.chitId,
        mode: ci.currentMode ?? undefined,
      }));
      const adj = adjAmount ? Number(adjAmount) : null;
      return confirmSettlement(memberId, chitItems, notes || undefined, adj, adjReason || undefined);
    },
    onSuccess: (settlement) => {
      qc.invalidateQueries({ queryKey: ['m-members'] });
      qc.invalidateQueries({ queryKey: ['m-settlement-history', memberId] });
      const net = Math.abs(Number(settlement?.netAmount ?? 0));
      if (net > 0 && settlement?.id) {
        setConfirmedSettlement(settlement);
        setStep('payment');
      } else {
        toast.saved('Settlement confirmed — member marked Inactive. Accounts balanced.');
        resetAll();
      }
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Settlement failed — please try again.'),
  });

  const recordPayMut = useMutation({
    mutationFn: () => recordSettlementTransaction(
      confirmedSettlement.id,
      Math.abs(Number(confirmedSettlement.netAmount)),
      payMode,
      payRef || null,
      payNotes || null,
    ),
    onSuccess: () => {
      toast.saved('Payment recorded — settlement complete.');
      qc.invalidateQueries({ queryKey: ['m-settlement-pending'] });
      qc.invalidateQueries({ queryKey: ['m-settlement-history'] });
      resetAll();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to record payment'),
  });

  function resetAll() {
    setStep('pick'); setMemberId(''); setMemberSearch(''); setPreview(null);
    setAdjAmount(''); setAdjReason(''); setNotes('');
    setPayMode('CASH'); setPayRef(''); setPayNotes('');
    setConfirmedSettlement(null); setExpanded({});
  }

  // ── Net amount with adjustment ─────────────────────────────────────────────
  const baseNet = Number(preview?.grandTotal ?? 0);
  const adjNum = adjAmount ? Number(adjAmount) : 0;
  const finalNet = baseNet + adjNum;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* ── Awaiting Settlement Payment ─────────────────────────────────── */}
      {(pendingSettlements.length > 0 || pendingLoading) && (
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>Awaiting Settlement Payment</Text>
              {pendingTotalElements > 0 && (
                <View style={{ backgroundColor: '#FDE68A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>{pendingTotalElements}</Text>
                </View>
              )}
            </View>
          </View>

          {pendingLoading ? (
            <Text style={{ color: C.gray400, textAlign: 'center', padding: 16 }}>Loading…</Text>
          ) : pendingSettlements.map((s: any) => {
            const net = Number(s.netAmount ?? 0);
            const absNet = Math.abs(net);
            const moved = net > 0 ? Number(s.collectedAmount ?? 0) : Number(s.disbursedAmount ?? 0);
            const remaining = Math.max(0, absNet - moved);
            const isCollect = net > 0;
            const memberName = (members as any[]).find((m: any) => m.id === s.memberId)?.fullName ?? `…${String(s.memberId).slice(-6)}`;
            const statusLabel = { PENDING: 'Unpaid', PARTIALLY_COLLECTED: 'Partial', PARTIALLY_DISBURSED: 'Partial' }[s.paymentStatus as string] ?? s.paymentStatus;
            const statusColor = { PENDING: C.amber, PARTIALLY_COLLECTED: '#2563EB', PARTIALLY_DISBURSED: '#7C3AED' }[s.paymentStatus as string] ?? C.gray400;
            return (
              <Card key={s.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: C.amber }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{memberName}</Text>
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                      {new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: isCollect ? C.red : C.green }}>
                      ₹{absNet.toLocaleString('en-IN')}
                    </Text>
                    <Text style={{ fontSize: 10, color: isCollect ? C.red : C.green, marginTop: 1 }}>
                      {isCollect ? 'Collect' : 'Pay'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ backgroundColor: statusColor + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                    </View>
                    {remaining > 0 && (
                      <Text style={{ fontSize: 11, color: C.gray500 }}>₹{remaining.toLocaleString('en-IN')} remaining</Text>
                    )}
                  </View>
                </View>
                <Button label="Record Payment" variant="primary" size="sm"
                  onPress={() => {
                    setConfirmedSettlement(s);
                    setPayMode('CASH');
                    setPayRef('');
                    setPayNotes('');
                    setStep('payment');
                  }} />
              </Card>
            );
          })}

          {/* Pagination for pending */}
          {pendingTotalPages > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: C.gray400 }}>Page {pendingPage + 1}/{pendingTotalPages}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="← Prev" variant="ghost" size="sm" disabled={pendingPage === 0}
                  onPress={() => setPendingPage(p => p - 1)} />
                <Button label="Next →" variant="ghost" size="sm" disabled={pendingPage >= pendingTotalPages - 1}
                  onPress={() => setPendingPage(p => p + 1)} />
              </View>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: C.gray200, marginTop: 12, marginBottom: 4 }} />
        </View>
      )}

      {/* Banner */}
      <View style={{ backgroundColor: SETT_PURPLE_LIGHT, borderRadius: 12, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: SETT_PURPLE }}>
        <Text style={{ fontSize: 13, color: SETT_PURPLE, fontWeight: '700' }}>Member Settlement</Text>
        <Text style={{ fontSize: 12, color: '#6D28D9', marginTop: 4 }}>
          Discontinue a member and close all chit obligations. Irreversible — creates a full audit trail.
        </Text>
      </View>

      {/* ── STEP: PICK MEMBER ─────────────────────────────────────────────── */}
      {(step === 'pick' || step === 'history') && (
        <>
          <Text style={{ ...T.label, marginBottom: 8 }}>Select Member</Text>
          <TextInput
            value={memberSearch}
            onChangeText={(t) => { setMemberSearch(t); if (!t) setMemberId(''); }}
            placeholder="Search name or phone…"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900, marginBottom: 8, backgroundColor: C.white }}
          />
          <ScrollView style={{ maxHeight: 200, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12, marginBottom: 16 }} nestedScrollEnabled>
            {filteredMembers.map((m: any) => (
              <TouchableOpacity key={m.id}
                onPress={() => { setMemberId(m.id); setMemberSearch(m.fullName ?? ''); setPreview(null); }}
                style={{ padding: 12, backgroundColor: memberId === m.id ? SETT_PURPLE_LIGHT : 'transparent', borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                <Text style={{ fontSize: 14, fontWeight: memberId === m.id ? '700' : '400', color: memberId === m.id ? SETT_PURPLE : C.gray900 }}>
                  {m.fullName ?? m.name} {memberId === m.id ? '✓' : ''}
                </Text>
                {m.phone && <Text style={{ fontSize: 11, color: C.gray400 }}>{m.phone}</Text>}
              </TouchableOpacity>
            ))}
            {filteredMembers.length === 0 && (
              <Text style={{ padding: 16, color: C.gray400 }}>No active members found</Text>
            )}
          </ScrollView>

          {memberId && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={{ flex: 2 }}>
                <Button label="Preview Settlement" variant="primary" loading={previewMut.isPending}
                  disabled={isExpired}
                  onPress={() => previewMut.mutate()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={step === 'history' ? 'Back' : 'History'} variant="ghost"
                  onPress={() => setStep(step === 'history' ? 'pick' : 'history')} />
              </View>
            </View>
          )}

          {/* Settlement History */}
          {step === 'history' && (
            <>
              <Text style={{ ...T.label, marginBottom: 12 }}>
                HISTORY — {selectedMember?.fullName?.toUpperCase()}
              </Text>
              {histLoading && <Text style={{ color: C.gray400, textAlign: 'center', padding: 20 }}>Loading…</Text>}
              {!histLoading && (history as any[]).length === 0 && (
                <EmptyState title="No settlements" message="No settlement records for this member." />
              )}
              {(history as any[]).map((s: any, i: number) => (
                <Card key={s.id ?? i} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: SETT_PURPLE }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: SETT_PURPLE }}>Settlement #{i + 1}</Text>
                    <Amount value={Math.abs(Number(s.netAmount ?? s.totalAmount ?? 0))} size="sm" color={C.green} />
                  </View>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDateTime(s.settledAt ?? s.createdAt)}</Text>
                  {s.notes && <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic', marginTop: 4 }}>"{s.notes}"</Text>}
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {/* ── STEP: PREVIEW ────────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <>
          {/* Member + back */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setStep('pick')} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.gray900 }}>{selectedMember?.fullName}</Text>
              <Text style={{ fontSize: 12, color: C.gray400 }}>Settlement Preview</Text>
            </View>
          </View>

          {/* Per-chit cards */}
          {(preview.chitItems ?? []).map((ci: any, i: number) => {
            const caseKey = ci.settlementCase ?? 'UNKNOWN';
            const caseColor = CASE_COLOR[caseKey] ?? C.gray400;
            const caseLabel = CASE_LABEL[caseKey] ?? caseKey;
            const net = Number(ci.netAmount ?? 0);
            const netAbs = Math.abs(net);
            const fundOwes = net < 0;
            const isOpen = expanded[ci.chitId ?? i];
            return (
              <Card key={ci.chitId ?? i} style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: caseColor }}>
                {/* Header row */}
                <TouchableOpacity
                  onPress={() => setExpanded(prev => ({ ...prev, [ci.chitId ?? i]: !prev[ci.chitId ?? i] }))}
                  style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: caseColor + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: caseColor }}>{caseLabel}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>
                        {ci.chitName ?? `Chit ${i + 1}`}
                      </Text>
                    </View>
                    {ci.description && (
                      <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 6 }} numberOfLines={2}>
                        {ci.description}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: fundOwes ? C.green : C.red }}>
                        {fundOwes ? 'Fund pays ₹' : 'Member owes ₹'}{netAbs.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 18, color: C.gray400, marginLeft: 8 }}>{isOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {/* Expanded breakdown */}
                {isOpen && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                    {ci.unpaidDues != null && Number(ci.unpaidDues) !== 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>Unpaid dues</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.red }}>
                          ₹{Math.abs(Number(ci.unpaidDues)).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    {ci.futureInstallments != null && Number(ci.futureInstallments) !== 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>Future installments</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.red }}>
                          ₹{Math.abs(Number(ci.futureInstallments)).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    {ci.fundOwesForReserved != null && Number(ci.fundOwesForReserved) !== 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>Fund credit (reserved)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.green }}>
                          –₹{Math.abs(Number(ci.fundOwesForReserved)).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    {ci.totalPaidIn != null && (ci.settlementCase === 'CASE_B1' || ci.settlementCase === 'CASE_B2') && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, color: C.gray500 }}>Total paid in (refund)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.green }}>
                          ₹{Math.abs(Number(ci.totalPaidIn)).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700 }}>Net</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: fundOwes ? C.green : C.red }}>
                        {fundOwes ? '–' : '+'}₹{netAbs.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })}

          {/* Empty chitItems guard — member has no chit enrollments */}
          {(preview.chitItems ?? []).length === 0 && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: '#FDE68A' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 }}>No Chit Enrollments Found</Text>
              <Text style={{ fontSize: 13, color: '#92400E' }}>
                This member has no active chit enrollments to settle. Add them to a chit first, or select a different member.
              </Text>
              <View style={{ marginTop: 12 }}>
                <Button label="← Back" variant="ghost" onPress={() => setStep('pick')} />
              </View>
            </View>
          )}

          {/* Summary, Adjustment, Notes, Confirm — only shown when there are chit items */}
          {(preview.chitItems ?? []).length > 0 && (
          <>
          <Card style={{ marginBottom: 16, backgroundColor: SETT_PURPLE_LIGHT, borderWidth: 1.5, borderColor: SETT_PURPLE_BORDER }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: SETT_PURPLE, marginBottom: 8 }}>Summary</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, color: '#6D28D9' }}>Base net</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: baseNet < 0 ? C.green : C.red }}>
                {baseNet < 0 ? '–' : '+'}₹{Math.abs(baseNet).toLocaleString('en-IN')}
              </Text>
            </View>
            {adjNum !== 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: '#6D28D9' }}>Adjustment</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: adjNum > 0 ? C.red : C.green }}>
                  {adjNum > 0 ? '+' : '–'}₹{Math.abs(adjNum).toLocaleString('en-IN')}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: SETT_PURPLE_BORDER }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#4C1D95' }}>
                {finalNet < 0 ? 'Fund pays member' : finalNet > 0 ? 'Member pays fund' : 'No money changes hands'}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: finalNet < 0 ? C.green : finalNet > 0 ? C.red : C.gray400 }}>
                ₹{Math.abs(finalNet).toLocaleString('en-IN')}
              </Text>
            </View>
          </Card>

          {/* Adjustment (optional) */}
          <Text style={{ ...T.label, marginBottom: 6 }}>Adjustment Amount (optional)</Text>
          <TextInput value={adjAmount} onChangeText={setAdjAmount} keyboardType="numeric"
            placeholder="e.g. +500 or -500"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 15, color: C.gray900, marginBottom: 10 }} />

          {adjAmount !== '' && (
            <>
              <Text style={{ ...T.label, marginBottom: 6 }}>Adjustment Reason *</Text>
              <TextInput value={adjReason} onChangeText={setAdjReason}
                placeholder="e.g. Admin goodwill, penalty waived"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 10 }} />
            </>
          )}

          {/* Notes */}
          <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline
            placeholder="e.g. Member relocating, settled amicably"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60, textAlignVertical: 'top', marginBottom: 20 }} />

          <Button
            label={`Confirm Settlement${finalNet !== 0 ? ` — ₹${Math.abs(finalNet).toLocaleString('en-IN')}` : ''}`}
            variant="primary" fullWidth disabled={isExpired || (adjAmount !== '' && !adjReason.trim())}
            loading={confirmMut.isPending}
            onPress={() => Alert.alert(
              'Confirm Settlement',
              `Settle ${selectedMember?.fullName}?\n\n${finalNet < 0 ? `Fund refunds ₹${Math.abs(finalNet).toLocaleString('en-IN')} to member.` : finalNet > 0 ? `Member owes ₹${Math.abs(finalNet).toLocaleString('en-IN')} to fund.` : 'No money changes hands.'}\n\nMember will be marked Inactive. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', style: 'destructive', onPress: () => confirmMut.mutate() },
              ]
            )}
          />
          </>
          )}
        </>
      )}

      {/* ── STEP: PAYMENT RECORDING ───────────────────────────────────────── */}
      {step === 'payment' && confirmedSettlement && (
        <>
          <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1.5, borderColor: '#86EFAC' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 4 }}>
              Settlement Confirmed
            </Text>
            <Text style={{ fontSize: 12, color: '#166534' }}>
              {selectedMember?.fullName ?? 'Member'} is now Inactive. Record how the payment was made.
            </Text>
          </View>

          <Card style={{ marginBottom: 20, backgroundColor: SETT_PURPLE_LIGHT, borderWidth: 1.5, borderColor: SETT_PURPLE_BORDER }}>
            <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>Amount to record</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: SETT_PURPLE }}>
              ₹{Math.abs(Number(confirmedSettlement.netAmount ?? 0)).toLocaleString('en-IN')}
            </Text>
            <Text style={{ fontSize: 12, color: '#6D28D9', marginTop: 4 }}>
              {Number(confirmedSettlement.netAmount ?? 0) < 0 ? 'Fund pays member' : 'Member pays fund'}
            </Text>
          </Card>

          {/* Payment mode */}
          <Text style={{ ...T.label, marginBottom: 8 }}>Payment Mode</Text>
          <View style={{ gap: 8, marginBottom: 16 }}>
            {(['CASH', 'BANK_TRANSFER', 'UPI'] as const).map((m) => (
              <TouchableOpacity key={m}
                onPress={() => setPayMode(m)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 2,
                  borderColor: payMode === m ? SETT_PURPLE : C.gray300,
                  backgroundColor: payMode === m ? SETT_PURPLE_LIGHT : C.white }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                  borderColor: payMode === m ? SETT_PURPLE : C.gray300,
                  backgroundColor: payMode === m ? SETT_PURPLE : 'transparent' }} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: payMode === m ? SETT_PURPLE : C.gray700 }}>
                  {m === 'BANK_TRANSFER' ? 'Bank Transfer' : m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reference */}
          {payMode !== 'CASH' && (
            <>
              <Text style={{ ...T.label, marginBottom: 6 }}>Reference / UTR (optional)</Text>
              <TextInput value={payRef} onChangeText={setPayRef}
                placeholder={payMode === 'UPI' ? 'UPI transaction ID' : 'NEFT / RTGS reference'}
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 10 }} />
            </>
          )}

          {/* Notes */}
          <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
          <TextInput value={payNotes} onChangeText={setPayNotes} multiline
            placeholder="Any notes about this payment…"
            placeholderTextColor={C.gray400}
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60, textAlignVertical: 'top', marginBottom: 20 }} />

          <Button label="Record Payment" variant="success" fullWidth loading={recordPayMut.isPending}
            onPress={() => recordPayMut.mutate()} />
          <View style={{ marginTop: 10 }}>
            <Button label="Record Later" variant="ghost" fullWidth
              onPress={() => {
                toast.saved('Settlement done. Record payment later from settlement history.');
                resetAll();
              }} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMITTANCE TAB
// ─────────────────────────────────────────────────────────────────────────────
function RemittanceTab() {
  const qc = useQueryClient();
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');

  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff });
  const { data: allChits = [] } = useQuery({ queryKey: ['m-chits'], queryFn: getChits, staleTime: 60_000 });
  const { data: pendingItems = [], isLoading, refetch } = useQuery({
    queryKey: ['m-pending-remittance'],
    queryFn: getPendingRemittance,
    refetchInterval: 30_000,
  });
  // PICKED_UP cash requests: worker has cash, admin needs to physically collect
  const { data: allRequests = [] } = useQuery({
    queryKey: ['m-cash-requests'],
    queryFn: getActiveCashRequests,
    refetchInterval: 30_000,
  });

  const memberMap = Object.fromEntries((members as any[]).flatMap((m: any) => {
    const name = m.fullName ?? '—';
    return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
  }));
  const staffMap = Object.fromEntries((staff as any[]).map((s: any) => [s.id, s.fullName ?? s.username ?? '—']));
  const chitMap = Object.fromEntries((allChits as any[]).map((c: any) => [c.id, c.name ?? c.chitName ?? '—']));
  const pickedUpRequests = (allRequests as any[]).filter((r: any) => r.status === 'PICKED_UP');

  const remitMut = useMutation({
    mutationFn: (batchId: string) => remitPayment(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['m-wallet'] });
      qc.invalidateQueries({ queryKey: ['m-pay-history'] });
      toast.collected('Cash collected — member account credited');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Remittance failed — batch may already be remitted or voided.'),
  });

  const voidMut = useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) => voidPaymentBatch(batchId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-pending-remittance'] });
      setVoidTarget(null); setVoidReason('');
      toast.cancelled('Remittance cancelled — payment rolled back');
    },
    onError: (e: any) => Alert.alert('Cannot Cancel', e.response?.data?.message ?? 'Cancellation failed — batch may already be remitted or linked to a disbursed payout.'),
  });

  const collectPickupMut = useMutation({
    mutationFn: (requestId: string) => collectForRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-cash-requests'] });
      qc.invalidateQueries({ queryKey: ['m-wallet'] });
      qc.invalidateQueries({ queryKey: ['m-pay-history'] });
      qc.invalidateQueries({ queryKey: ['m-pending-remittance'] });
      toast.collected('Cash received — account credited');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Collection failed — request may already be collected or cancelled.'),
  });

  if (isLoading) return <LoadingScreen />;

  const total = (pendingItems as any[]).reduce((s, b) => s + Number(b.amount ?? b.totalAmount ?? 0), 0);

  function onRefresh() { refetch(); }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* ── PICKED_UP section: worker has physically collected, admin needs to take cash ── */}
      {pickedUpRequests.length > 0 && (
        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#86EFAC' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803D' }}>
              {pickedUpRequests.length} pickup{pickedUpRequests.length !== 1 ? 's' : ''} ready — collect cash from staff
            </Text>
          </View>
          {pickedUpRequests.map((r: any) => (
            <View key={r.id} style={{ backgroundColor: C.white, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>{memberMap[r.memberId] ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  Staff: {staffMap[r.assignedStaffId] ?? '—'} · ₹{Number(r.requestedAmount).toLocaleString('en-IN')}
                </Text>
                {r.pickedUpAt && (
                  <Text style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>
                    Picked up {fmtDateTime(r.pickedUpAt)}
                  </Text>
                )}
              </View>
              <Button
                label="Collect"
                variant="success"
                size="sm"
                loading={collectPickupMut.isPending}
                onPress={() => Alert.alert(
                  'Confirm Cash Received',
                  `You received ₹${Number(r.requestedAmount).toLocaleString('en-IN')} from ${staffMap[r.assignedStaffId] ?? 'staff'}?\n\nMember account will be credited and treasury updated.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, Received', onPress: () => collectPickupMut.mutate(r.id) },
                  ]
                )}
              />
            </View>
          ))}
        </View>
      )}

      {/* ── Pending remittance batches ── */}
      {(pendingItems as any[]).length === 0 && pickedUpRequests.length === 0 ? (
        <EmptyState title="All clear" message="No payments pending remittance." />
      ) : (pendingItems as any[]).length === 0 ? null : (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 13, color: C.gray500 }}>
              {(pendingItems as any[]).length} batch{(pendingItems as any[]).length !== 1 ? 'es' : ''} awaiting remittance
            </Text>
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Amount value={total} size="sm" />
            </View>
          </View>

          {(pendingItems as any[]).map((batch: any) => (
            <Card key={batch.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.amber }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                    {memberMap[batch.memberId] ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    {chitMap[batch.chitId] ?? batch.chitName ?? '—'}
                  </Text>
                  {batch.collectedBy && staffMap[batch.collectedBy] && (
                    <Text style={{ fontSize: 12, color: C.amber, marginTop: 2, fontWeight: '600' }}>
                      Collector: {staffMap[batch.collectedBy]}
                    </Text>
                  )}
                </View>
                <Amount value={batch.amount ?? batch.totalAmount ?? 0} size="md" />
              </View>
              {batch.paymentMode === 'CREDIT' && (
                <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: '#059669', fontWeight: '600' }}>Settled via Credit Balance — no cash collected</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: batch.paymentMode === 'CREDIT' ? '#ECFDF5' : '#FEF3C7', borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, color: batch.paymentMode === 'CREDIT' ? '#059669' : C.amber, fontWeight: '600' }}>
                    {batch.paymentMode === 'CREDIT' ? 'Credit Balance' : (batch.paymentMode ?? 'CASH')}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(batch.collectedAt ?? batch.createdAt)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  label="Collect"
                  variant="success"
                  size="sm"
                  loading={remitMut.isPending}
                  onPress={() => Alert.alert(
                    'Confirm Cash Received',
                    `Confirm you received ₹${Number(batch.amount ?? batch.totalAmount ?? 0).toLocaleString('en-IN')} from ${staffMap[batch.collectedBy] ?? 'collector'}?\n\nPayment will be credited to member.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm Received', onPress: () => remitMut.mutate(batch.id) },
                    ]
                  )}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => Alert.alert(
                    'Cancel Remittance',
                    `Cancel this ₹${Number(batch.amount ?? batch.totalAmount ?? 0).toLocaleString('en-IN')} remittance? The member's payment record will be rolled back.`,
                    [
                      { text: 'Back', style: 'cancel' },
                      { text: 'Cancel Remittance', style: 'destructive', onPress: () => voidMut.mutate({ batchId: batch.id, reason: 'Cancelled from Remittance' }) },
                    ]
                  )}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      {/* Void reason modal (for when more context is needed) */}
      <Modal visible={!!voidTarget} animationType="slide" transparent onRequestClose={() => setVoidTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.red, marginBottom: 8 }}>Cancel Remittance</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Reason *</Text>
            <TextInput value={voidReason} onChangeText={setVoidReason} multiline
              placeholder="e.g. Entered wrong amount, duplicate entry"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, minHeight: 72, fontSize: 14, color: C.gray900, marginBottom: 16, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Back" variant="ghost" onPress={() => setVoidTarget(null)} /></View>
              <View style={{ flex: 1 }}><Button label="Cancel Remittance" variant="danger" disabled={!voidReason.trim()} loading={voidMut.isPending}
                onPress={() => voidMut.mutate({ batchId: voidTarget.id, reason: voidReason })} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY TAB  — all payment batches with member + chit filters
// ─────────────────────────────────────────────────────────────────────────────
const BATCH_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  COMPLETED:           { bg: '#DCFCE7', color: '#16A34A', label: 'Completed' },
  AWAITING_REMITTANCE: { bg: '#FEF3C7', color: C.amber,   label: 'Pending Remit' },
  VOIDED:              { bg: C.gray100, color: C.gray400,  label: 'Voided' },
};

function drawLabel(allocations: any[]): string {
  if (!allocations?.length) return '—';
  const nums = allocations.map((a: any) => a.monthNumber).sort((a: number, b: number) => a - b);
  return nums.length === 1 ? `Draw ${nums[0]}` : `Draws ${nums.join(', ')}`;
}

function HistoryTab() {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [chitId, setChitId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [histShowCount, setHistShowCount] = useState(20);

  const { data: members = [] } = useQuery({ queryKey: ['m-members'], queryFn: getMembers, staleTime: 60_000 });
  const { data: allChits = [] } = useQuery({ queryKey: ['m-chits-hist'], queryFn: getChits, staleTime: 60_000 });
  const { data: staff = [] } = useQuery({ queryKey: ['m-staff'], queryFn: listStaff, staleTime: 60_000 });

  const payableChitsForMember = memberId
    ? (allChits as any[]).filter((c: any) => c.status !== 'DRAFT')
    : (allChits as any[]).filter((c: any) => c.status !== 'DRAFT');

  const { data: batches = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['m-pay-history', memberId, chitId],
    queryFn: () => getAllPaymentBatches({
      ...(memberId ? { memberId } : {}),
      ...(chitId ? { chitId } : {}),
    }),
    staleTime: 30_000,
  });

  const memberMap = Object.fromEntries((members as any[]).flatMap((m: any) => {
    const name = m.fullName ?? '—';
    return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
  }));
  const chitMap = Object.fromEntries((allChits as any[]).map((c: any) => [c.id, c.name ?? '—']));
  const staffMap = Object.fromEntries((staff as any[]).map((s: any) => [s.id, s.fullName ?? s.username ?? '—']));

  const filteredMembers = (members as any[]).filter((m: any) => {
    const q = memberSearch.toLowerCase();
    return !q || (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q);
  });

  const allDisplayedBatches = statusFilter
    ? (batches as any[]).filter((b: any) => b.status === statusFilter)
    : (batches as any[]);
  const displayedBatches = allDisplayedBatches.slice(0, histShowCount);

  const STATUS_PILLS = [
    { key: '', label: 'All' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'AWAITING_REMITTANCE', label: 'Pending' },
    { key: 'VOIDED', label: 'Voided' },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* ── Member filter ── */}
      <Text style={{ ...T.label, marginBottom: 6 }}>Filter by Member</Text>
      <TextInput
        value={memberSearch}
        onChangeText={(t) => { setMemberSearch(t); if (!t) { setMemberId(''); setChitId(''); } }}
        placeholder="Search member…"
        placeholderTextColor={C.gray400}
        style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900, marginBottom: 6 }}
      />
      {memberSearch.length > 0 && !memberId && (
        <ScrollView style={{ maxHeight: 140, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, marginBottom: 10 }} nestedScrollEnabled>
          {filteredMembers.slice(0, 8).map((m: any) => (
            <TouchableOpacity key={m.id}
              onPress={() => { setMemberId(m.id); setMemberSearch(m.fullName); setChitId(''); }}
              style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 14, color: C.gray900 }}>{m.fullName}</Text>
              {m.phone && <Text style={{ fontSize: 11, color: C.gray400 }}>{m.phone}</Text>}
            </TouchableOpacity>
          ))}
          {filteredMembers.length === 0 && (
            <Text style={{ padding: 12, color: C.gray400 }}>No members found</Text>
          )}
        </ScrollView>
      )}
      {memberId && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 8, marginBottom: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.navy }} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, flex: 1 }}>{memberSearch}</Text>
          <TouchableOpacity onPress={() => { setMemberId(''); setMemberSearch(''); setChitId(''); }}>
            <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chit filter (chips) ── */}
      <Text style={{ ...T.label, marginBottom: 6 }}>Filter by Chit</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setChitId('')}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
              borderColor: !chitId ? C.navy : C.gray300, backgroundColor: !chitId ? C.navy50 : C.white }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: !chitId ? C.navy : C.gray500 }}>All Chits</Text>
          </TouchableOpacity>
          {payableChitsForMember.map((c: any) => (
            <TouchableOpacity key={c.id} onPress={() => setChitId(c.id)}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                borderColor: chitId === c.id ? C.navy : C.gray300, backgroundColor: chitId === c.id ? C.navy50 : C.white }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: chitId === c.id ? C.navy : C.gray500 }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Status filter pills ── */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
        {STATUS_PILLS.map((p) => (
          <TouchableOpacity key={p.key} onPress={() => { setStatusFilter(p.key); setHistShowCount(20); }}
            style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, alignItems: 'center',
              borderColor: statusFilter === p.key ? C.navy : C.gray200,
              backgroundColor: statusFilter === p.key ? C.navy50 : C.white }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: statusFilter === p.key ? C.navy : C.gray400 }}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Results ── */}
      {isLoading ? (
        <LoadingScreen />
      ) : isError ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 14, color: C.gray500, marginBottom: 12 }}>Failed to load history</Text>
          <Button label="Retry" variant="outline" size="sm" onPress={() => refetch()} />
        </View>
      ) : displayedBatches.length === 0 ? (
        <EmptyState title="No payments" message={memberId || chitId ? 'No payments match these filters.' : 'No payment history yet.'} />
      ) : (
        <>
          <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 10 }}>
            {Math.min(histShowCount, allDisplayedBatches.length)} of {allDisplayedBatches.length} payment{allDisplayedBatches.length !== 1 ? 's' : ''}
          </Text>
          {displayedBatches.map((b: any) => {
            const st = BATCH_STATUS_STYLE[b.status] ?? { bg: C.gray100, color: C.gray500, label: b.status };
            return (
              <Card key={b.id} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: st.color }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                      {memberMap[b.memberId] ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500 }}>
                      {chitMap[b.chitId] ?? '—'}
                      {b.allocations?.length ? '  ·  ' + drawLabel(b.allocations) : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.green }}>
                      ₹{Number(b.totalAmount ?? b.amount ?? 0).toLocaleString('en-IN')}
                    </Text>
                    <View style={{ backgroundColor: st.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {/* Mode chip */}
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor:
                    b.paymentMode === 'CREDIT' ? '#ECFDF5' : b.paymentMode === 'CASH' ? '#FEF3C7' : b.paymentMode === 'UPI' ? '#F3E8FF' : b.paymentMode === 'BANK_TRANSFER' ? '#DBEAFE' : C.gray100 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color:
                      b.paymentMode === 'CREDIT' ? '#059669' : b.paymentMode === 'CASH' ? C.amber : b.paymentMode === 'UPI' ? '#7C3AED' : b.paymentMode === 'BANK_TRANSFER' ? '#2563EB' : C.gray600 }}>
                      {b.paymentMode === 'CREDIT' ? 'Credit Balance' : (b.paymentMode ?? 'CASH').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  {/* Collector (CASH only) */}
                  {b.paymentMode === 'CASH' && b.collectedBy && (
                    <Text style={{ fontSize: 11, color: C.gray500 }}>
                      via {staffMap[b.collectedBy] ?? b.collectedBy?.slice(0, 8)}
                    </Text>
                  )}
                  {/* Date */}
                  <Text style={{ fontSize: 11, color: C.gray400, marginLeft: 'auto' }}>
                    {fmtDateTime(b.collectedAt ?? b.createdAt)}
                  </Text>
                </View>
              </Card>
            );
          })}
          {allDisplayedBatches.length > histShowCount && (
            <TouchableOpacity onPress={() => setHistShowCount(c => c + 20)}
              style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>Load More ({allDisplayedBatches.length - histShowCount} remaining)</Text>
            </TouchableOpacity>
          )}
          {allDisplayedBatches.length > 20 && allDisplayedBatches.length <= histShowCount && (
            <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 12, fontSize: 12 }}>All {allDisplayedBatches.length} payments shown</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPaymentsScreen() {
  const params = useLocalSearchParams<{ tab?: string; filter?: string; memberId?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('Cash Requests');

  useEffect(() => {
    const t = params.tab === 'settlement' ? 'Settlement' : params.tab as Tab;
    if (t && TABS.includes(t)) setActiveTab(t);
  }, [params.tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={T.h1}>Finance</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <EyeToggle />
          <ProfileAvatarButton size={34} />
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.gray200 }}
        contentContainerStyle={{ paddingHorizontal: 16 }}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: activeTab === tab ? C.navy : 'transparent', marginRight: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: activeTab === tab ? C.navy : C.gray400 }}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'Cash Requests'  && <CashRequestsTab initialFilter={params.filter} />}
        {activeTab === 'Record Payment' && <RecordPaymentTab />}
        {activeTab === 'Remittance'     && <RemittanceTab />}
        {activeTab === 'History'        && <HistoryTab />}
        {activeTab === 'Payouts'        && <PayoutsTab />}
        {activeTab === 'Treasury'       && <TreasuryTab />}
        {activeTab === 'Settlement'     && <SettlementTab initialMemberId={params.memberId} />}
      </View>
    </SafeAreaView>
  );
}
