import { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, FlatList, TextInput, Modal, Alert, TouchableOpacity, Clipboard, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getMembers, createMember, patchMemberStatus, softDeleteMember, updateMember,
  getChitsForMember, getMemberTotalBalance, getMemberBalance, getMemberCredit, resetMemberPassword, recordPayment,
  getUserById, getAuditLogs, getAllCashRequests, registerUser, linkMemberUser,
} from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Button, fmtDate, EyeToggle, PhoneInput, formatPhone } from '../../../components/ui';
import { toast } from '../../../components/Toast';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

// Per-chit balance badge shown on the enrolled chit card
function ChitBalanceBadge({ memberId, chitId }: { memberId: string; chitId: string }) {
  const { data: balance, isLoading } = useQuery({
    queryKey: ['m-chit-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId),
    staleTime: 60_000,
  });
  if (isLoading) return <Text style={{ fontSize: 11, color: C.gray400 }}>…</Text>;
  const outstanding = Number(balance?.totalOutstanding ?? 0);
  if (outstanding > 0) {
    return <Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>₹{outstanding.toLocaleString('en-IN')} due</Text>;
  }
  if (balance !== undefined) {
    return <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>Clear ✓</Text>;
  }
  return null;
}

// Sub-component for per-card balance (calls its own query so hooks are valid)
function MemberBalance({ memberId }: { memberId: string }) {
  const { data: balance, isLoading } = useQuery({
    queryKey: ['m-member-balance-card', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    staleTime: 60_000,
  });
  if (isLoading) return <Text style={{ fontSize: 11, color: C.gray400 }}>…</Text>;
  const num = Number(balance ?? 0);
  if (num === 0) return null;
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: num > 0 ? C.red : C.green }}>
      {num > 0 ? `Owes ₹${num.toLocaleString('en-IN')}` : `Cr ₹${Math.abs(num).toLocaleString('en-IN')}`}
    </Text>
  );
}

function MemberCreditBadge({ memberId }: { memberId: string }) {
  const { data } = useQuery({
    queryKey: ['m-member-credit-card', memberId],
    queryFn: () => getMemberCredit(memberId),
    staleTime: 60_000,
  });
  const credit = Number(data?.balance ?? 0);
  if (credit <= 0) return null;
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
      Credit ₹{credit.toLocaleString('en-IN')}
    </Text>
  );
}

export default function AdminMembersScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(params.filter ?? null);
  const [selected, setSelected] = useState<any>(null);
  const [memberShowCount, setMemberShowCount] = useState(20);

  useEffect(() => { setStatusFilter(params.filter ?? null); setMemberShowCount(20); }, [params.filter]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditInline, setShowEditInline] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [showPwdInline, setShowPwdInline] = useState(false);
  const [pwdCopied, setPwdCopied] = useState(false);

  // Create login
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [clUsername, setClUsername] = useState('');
  const [clEmail, setClEmail] = useState('');
  const [clTempPassword, setClTempPassword] = useState('');
  const [clCopied, setClCopied] = useState(false);

  // Status change inline
  const [showStatusInline, setShowStatusInline] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');

  // Edit form state
  const [eName, setEName] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [ePhoneCode, setEPhoneCode] = useState('+91');
  const [eEmail, setEEmail] = useState('');
  const [eCity, setECity] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eAadhaar, setEAadhaar] = useState('');
  const [ePan, setEPan] = useState('');
  const [eNotes, setENotes] = useState('');

  // Collect payment from member detail
  const [showCollect, setShowCollect] = useState(false);
  const [collectChitId, setCollectChitId] = useState('');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState('CASH');
  const [collectNotes, setCollectNotes] = useState('');

  // Create form - all fields matching web + backend
  const [cFullName, setCFullName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cPhoneCountryCode, setCPhoneCountryCode] = useState('+91');
  const [cEmail, setCEmail] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cCity, setCCity] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cAadhaar, setCAAadhaar] = useState('');
  const [cPan, setCPan] = useState('');
  const [cBankName, setCBankName] = useState('');
  const [cBankAccount, setCBankAccount] = useState('');
  const [cBankIfsc, setCBankIfsc] = useState('');
  const [cReferredById, setCReferredById] = useState('');
  const [cReferralSearch, setCReferralSearch] = useState('');

  // Change referral on existing member
  const [showReferralChange, setShowReferralChange] = useState(false);
  const [newReferralId, setNewReferralId] = useState('');
  const [newReferralSearch, setNewReferralSearch] = useState('');

  const { data: members = [], isLoading, refetch } = useQuery({ queryKey: ['m-members'], queryFn: getMembers });

  const createMutation = useMutation({
    mutationFn: () => createMember({
      fullName: cFullName, phone: cPhone, phoneCountryCode: cPhoneCountryCode,
      email: cEmail || null,
      address: cAddress || null, city: cCity || null, notes: cNotes || null,
      aadhaarLast4: cAadhaar || null, panNumber: cPan || null,
      bankName: cBankName || null, bankAccountNumber: cBankAccount || null,
      bankIfsc: cBankIfsc ? cBankIfsc.toUpperCase() : null,
      referredById: cReferredById || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-members'] });
      setShowCreate(false);
      setCFullName(''); setCPhone(''); setCPhoneCountryCode('+91'); setCEmail(''); setCAddress(''); setCCity(''); setCNotes('');
      setCAAadhaar(''); setCPan(''); setCBankName(''); setCBankAccount(''); setCBankIfsc('');
      setCReferredById(''); setCReferralSearch('');
      toast.created('Member created');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const changeReferralMutation = useMutation({
    mutationFn: () => updateMember(selected?.id, {
      fullName: selected?.fullName,
      phone: selected?.phone,
      referredById: newReferralId === 'none' ? null : (newReferralId || null),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-members'] });
      setShowReferralChange(false);
      setNewReferralId(''); setNewReferralSearch('');
      toast.saved('Referral updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: any) => patchMemberStatus(id, status, reason),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['m-members'] });
      setSelected((prev: any) => prev ? { ...prev, status: vars.status } : prev);
      setShowStatusInline(false);
      setNewStatus('');
      setStatusReason('');
      const labels: Record<string, string> = { ACTIVE: 'activated', INACTIVE: 'deactivated', SUSPENDED: 'suspended', BLACKLISTED: 'blacklisted' };
      toast.saved(`Member ${labels[vars.status] ?? 'updated'}`);
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-members'] });
      setShowDetail(false);
      toast.deleted('Member deleted');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to delete member'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: (userId: string) => resetMemberPassword(userId),
    onSuccess: (data: any) => {
      const tmp = data?.tempPassword ?? data?.password ?? data?.data?.tempPassword ?? '';
      setTempPassword(tmp);
      setPwdCopied(false);
      setShowPwdInline(true);
      qc.invalidateQueries({ queryKey: ['m-user-status', selected?.userId] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to reset password'),
  });

  const createLoginMutation = useMutation({
    mutationFn: async () => {
      const authData = await registerUser({ username: clUsername.trim(), email: clEmail.trim() });
      const newUserId = authData?.user?.id;
      if (!newUserId) throw new Error('Registration did not return a user ID');
      await linkMemberUser(selected!.id, newUserId);
      return authData;
    },
    onSuccess: (data: any) => {
      setClTempPassword(data?.tempPassword ?? '');
      setClCopied(false);
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['m-user-status', selected?.userId] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? e.message ?? 'Failed to create login'),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateMember(selected!.id, {
      fullName: eName || null,
      phone: ePhone || null,
      phoneCountryCode: ePhoneCode || null,
      email: eEmail || null,
      city: eCity || null,
      address: eAddress || null,
      aadhaarLast4: eAadhaar || null,
      panNumber: ePan || null,
      notes: eNotes || null,
    }),
    onSuccess: (data: any) => {
      setShowEditInline(false);
      setSelected((prev: any) => ({ ...prev, ...data }));
      qc.invalidateQueries({ queryKey: ['m-members'] });
      toast.saved('Member updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to update member'),
  });

  const collectMutation = useMutation({
    mutationFn: () => recordPayment({
      memberId: selected?.id,
      chitId: collectChitId,
      amount: Number(collectAmount),
      paymentMode: collectMode,
      notes: collectNotes || undefined,
    }),
    onSuccess: () => {
      setShowCollect(false);
      setCollectChitId(''); setCollectAmount(''); setCollectMode('CASH'); setCollectNotes('');
      qc.invalidateQueries({ queryKey: ['m-member-balance-card', selected?.id] });
      qc.invalidateQueries({ queryKey: ['m-member-balance', selected?.id] });
      toast.saved('Payment recorded');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const { data: memberChits = [] } = useQuery({
    queryKey: ['m-member-chits', selected?.id],
    queryFn: () => getChitsForMember(selected!.id),
    enabled: !!selected?.id && showDetail,
  });

  const { data: memberBalance } = useQuery({
    queryKey: ['m-member-balance', selected?.id],
    queryFn: () => getMemberTotalBalance(selected!.id),
    enabled: !!selected?.id && showDetail,
  });

  const { data: memberCreditData } = useQuery({
    queryKey: ['m-member-credit', selected?.id],
    queryFn: () => getMemberCredit(selected!.id),
    enabled: !!selected?.id && showDetail,
    staleTime: 60_000,
  });
  const memberCreditBalance = Number(memberCreditData?.balance ?? 0);

  // Fetch user account status to show mustChangePassword indicator persistently
  const { data: memberUser } = useQuery({
    queryKey: ['m-user-status', selected?.userId],
    queryFn: () => getUserById(selected!.userId),
    enabled: !!selected?.userId && showDetail,
    staleTime: 30_000,
  });

  // Profile change history from audit log — admin only
  const [showProfileHistory, setShowProfileHistory] = useState(false);
  const { data: profileHistory = [] } = useQuery({
    queryKey: ['m-profile-history', selected?.id],
    queryFn: () => getAuditLogs({ entityType: 'MEMBER', entityId: selected!.id, size: 30, sort: 'createdAt,desc' }),
    enabled: !!selected?.id && showDetail && showProfileHistory,
    staleTime: 60_000,
  });

  // Pending cash pickup requests for this member
  const { data: allMemberRequests = [] } = useQuery({
    queryKey: ['m-member-cash-requests', selected?.id],
    queryFn: () => getAllCashRequests({ memberId: selected!.id }),
    enabled: !!selected?.id && showDetail,
    staleTime: 60_000,
  });
  const pendingMemberRequests = (allMemberRequests as any[]).filter(
    (r) => r.status === 'ASSIGNED' || r.status === 'PICKED_UP' || r.status === 'PENDING',
  );

  const filtered = (members as any[]).filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q) || (m.email ?? '').toLowerCase().includes(q);
    let matchesStatus = true;
    if (statusFilter === 'Active') matchesStatus = m.status === 'ACTIVE';
    else if (statusFilter === 'Inactive') matchesStatus = m.status === 'INACTIVE';
    else if (statusFilter === 'Suspended') matchesStatus = m.status === 'SUSPENDED';
    return matchesSearch && matchesStatus;
  });

  function openDetail(m: any) {
    setSelected(m);
    setTempPassword('');
    setShowPwdInline(false);
    setShowStatusInline(false);
    setShowEditInline(false);
    setShowProfileHistory(false);
    setNewStatus('');
    setStatusReason('');
    setShowCreateLogin(false);
    setClUsername('');
    setClEmail('');
    setClTempPassword('');
    setShowDetail(true);
  }

  function openEdit(m: any) {
    setEName(m.fullName ?? '');
    setEPhone(m.phone ?? '');
    setEPhoneCode(m.phoneCountryCode ?? '+91');
    setEEmail(m.email ?? '');
    setECity(m.city ?? '');
    setEAddress(m.address ?? '');
    setEAadhaar(m.aadhaarLast4 ?? '');
    setEPan(m.panNumber ?? '');
    setENotes(m.notes ?? '');
    setShowEditInline(true);
    // Collapse other inline panels
    setShowPwdInline(false);
    setShowStatusInline(false);
  }

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={T.h1}>Members</Text>
            <Text style={{ fontSize: 13, color: C.gray500 }}>{filtered.length} of {(members as any[]).length}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <EyeToggle />
            <TouchableOpacity onPress={() => setShowCreate(true)}
              style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
              <Text style={{ color: C.white, fontWeight: '700', fontSize: 13 }}>+ Add</Text>
            </TouchableOpacity>
            <ProfileAvatarButton size={34} />
          </View>
        </View>
        <TextInput value={search} onChangeText={(t) => { setSearch(t); setMemberShowCount(20); }} placeholder="Search name, phone, email…"
          placeholderTextColor={C.gray400}
          style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.gray900, backgroundColor: C.white, marginBottom: 10 }} />
        {/* Status filter tabs */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[null, 'Active', 'Inactive', 'Suspended'].map((f) => {
            const label = f ?? 'All';
            const active = statusFilter === f;
            const count = f === null ? (members as any[]).length
              : (members as any[]).filter((m) => m.status === f.toUpperCase()).length;
            return (
              <TouchableOpacity key={label} onPress={() => setStatusFilter(f)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: active ? C.navy : C.white,
                  borderWidth: 1.5, borderColor: active ? C.navy : C.gray300 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? C.white : C.gray500 }}>
                  {label} {count > 0 ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList style={{ flex: 1 }} data={filtered.slice(0, memberShowCount)} keyExtractor={(m: any) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32 }}
        ListEmptyComponent={<EmptyState title="No members" message={search ? 'Try a different search' : 'No members yet'} />}
        ListFooterComponent={filtered.length > memberShowCount ? (
          <TouchableOpacity onPress={() => setMemberShowCount(c => c + 20)}
            style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>Load More ({filtered.length - memberShowCount} remaining)</Text>
          </TouchableOpacity>
        ) : filtered.length > 20 ? (
          <Text style={{ textAlign: 'center', color: C.gray400, marginTop: 12, fontSize: 12 }}>All {filtered.length} members shown</Text>
        ) : null}
        renderItem={({ item: m }) => (
          <TouchableOpacity onPress={() => openDetail(m)} activeOpacity={0.7}>
            <Card style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: m.status === 'ACTIVE' ? C.green : C.gray300 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>{(m.fullName ?? '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }} numberOfLines={1}>{m.fullName ?? 'Unknown'}</Text>
                    {(m.hasAppAccess || m.userId) && (
                      <View style={{ backgroundColor: C.navy50, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: C.navy }}>APP</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: C.gray500 }}>{m.phone ?? m.email ?? 'No contact'}</Text>
                  {m.city && <Text style={{ fontSize: 11, color: C.gray400 }}>{m.city}</Text>}
                  <MemberBalance memberId={m.id} />
                  <MemberCreditBadge memberId={m.id} />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge status={m.status ?? 'ACTIVE'} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* ── Member Detail Modal ──────────────────────────────────────────────── */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <View style={{ flex: 1 }}>
              <Text style={T.h2} numberOfLines={1}>{selected?.fullName ?? 'Member'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Badge status={selected?.status ?? 'ACTIVE'} />
                {(selected?.hasAppAccess || selected?.userId) && (
                  <View style={{ backgroundColor: C.navy50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy }}>App Login Active</Text>
                  </View>
                )}
              </View>
              {selected?.id && (
                <Text style={{ fontSize: 10, color: C.gray400, marginTop: 3, fontFamily: 'monospace' }}>
                  ID: {selected.id}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setShowDetail(false)} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {selected && (
              <>
                {/* Outstanding Balance */}
                {memberBalance !== undefined && (
                  <Card style={{ marginBottom: 16, backgroundColor: Number(memberBalance) > 0 ? '#FEF2F2' : '#F0FDF4', borderWidth: 1.5, borderColor: Number(memberBalance) > 0 ? '#FECACA' : '#BBF7D0' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray500, marginBottom: 4 }}>OUTSTANDING BALANCE</Text>
                    <Amount value={Math.abs(Number(memberBalance))} size="lg" color={Number(memberBalance) > 0 ? C.red : C.green} />
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      {Number(memberBalance) > 0 ? 'Member owes this amount' : Number(memberBalance) < 0 ? 'Overpaid — credit balance' : 'No outstanding dues'}
                    </Text>
                  </Card>
                )}

                {/* Credit balance */}
                {memberCreditBalance > 0 && (
                  <Card style={{ marginBottom: 16, backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: '#6EE7B7' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#065F46', marginBottom: 4 }}>CREDIT BALANCE</Text>
                    <Amount value={memberCreditBalance} size="lg" color="#059669" />
                    <Text style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                      Available to offset future dues
                    </Text>
                  </Card>
                )}

                {/* App Login section */}
                {(selected?.userId || selected?.linkedUserId || selected?.hasAppAccess) ? (
                  /* ── Has login: password management ── */
                  <>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowPwdInline(v => !v)}
                      style={{ marginBottom: showPwdInline ? 0 : 14 }}
                    >
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: memberUser?.mustChangePassword ? '#FFFBEB' : C.navy50,
                        borderRadius: 12, borderBottomLeftRadius: showPwdInline ? 0 : 12,
                        borderBottomRightRadius: showPwdInline ? 0 : 12,
                        padding: 12, borderWidth: 1.5,
                        borderColor: memberUser?.mustChangePassword ? C.amber : C.navy,
                      }}>
                        <Text style={{ fontSize: 20 }}>🔑</Text>
                        <View style={{ flex: 1 }}>
                          {memberUser?.mustChangePassword ? (
                            <>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>Temporary password active</Text>
                              <Text style={{ fontSize: 12, color: '#92400E', marginTop: 1 }}>Member hasn't changed it yet. Tap to manage.</Text>
                            </>
                          ) : (
                            <>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Password Management</Text>
                              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Generate a new temporary password for this member.</Text>
                            </>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: memberUser?.mustChangePassword ? C.amber : C.navy, fontWeight: '700' }}>
                          {showPwdInline ? '▲ Close' : 'Manage →'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {showPwdInline && (
                      <View style={{
                        backgroundColor: C.gray50, borderRadius: 12,
                        borderTopLeftRadius: 0, borderTopRightRadius: 0,
                        padding: 16, marginBottom: 14, borderWidth: 1.5, borderTopWidth: 0,
                        borderColor: memberUser?.mustChangePassword ? C.amber : C.navy,
                      }}>
                        {tempPassword ? (
                          <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: C.amber, marginBottom: 12 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: C.amber, letterSpacing: 0.5, marginBottom: 10 }}>NEW TEMP PASSWORD</Text>
                            {memberUser?.username && (
                              <View style={{ marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, color: '#92400E', marginBottom: 2 }}>USERNAME</Text>
                                <Text style={{ fontSize: 16, fontWeight: '800', color: C.gray900, letterSpacing: 1 }}>{memberUser.username}</Text>
                              </View>
                            )}
                            <View style={{ marginBottom: 10 }}>
                              <Text style={{ fontSize: 11, color: '#92400E', marginBottom: 2 }}>PASSWORD</Text>
                              <Text style={{ fontSize: 22, fontWeight: '800', color: C.gray900, letterSpacing: 3 }}>{tempPassword}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                const text = memberUser?.username
                                  ? `Username: ${memberUser.username}\nPassword: ${tempPassword}`
                                  : tempPassword;
                                Clipboard.setString(text);
                                setPwdCopied(true);
                                setTimeout(() => setPwdCopied(false), 2500);
                              }}
                              style={{ backgroundColor: pwdCopied ? C.green + '20' : C.amber + '20', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: pwdCopied ? C.green : C.amber }}>
                                {pwdCopied ? '✓ Copied!' : (memberUser?.username ? 'Copy Username & Password' : 'Copy Password')}
                              </Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 11, color: '#92400E', marginTop: 8 }}>Generated in this session. Share with the member.</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12, lineHeight: 20 }}>
                            {memberUser?.mustChangePassword
                              ? "The temporary password was set before this session and can't be retrieved. Regenerate to get a new one."
                              : 'Generate a new temporary password for this member to log into the app.'}
                          </Text>
                        )}
                        <Button
                          label={resetPwdMutation.isPending ? 'Generating…' : (memberUser?.mustChangePassword ? 'Regenerate Password' : 'Generate Temporary Password')}
                          variant="primary" fullWidth loading={resetPwdMutation.isPending}
                          onPress={() => {
                            const uid = selected?.userId ?? selected?.linkedUserId;
                            if (!uid) { Alert.alert('Error', 'No user account linked.'); return; }
                            Alert.alert(
                              memberUser?.mustChangePassword ? 'Regenerate Password' : 'Generate Temporary Password',
                              `Generate a temporary password for ${selected?.fullName}?`,
                              [{ text: 'Cancel', style: 'cancel' }, { text: 'Generate', onPress: () => resetPwdMutation.mutate(uid) }],
                            );
                          }}
                        />
                      </View>
                    )}
                  </>
                ) : (
                  /* ── No login: create login section ── */
                  <Card style={{ marginBottom: 14, borderWidth: 1.5, borderColor: C.gray200 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900, marginBottom: 4 }}>No App Login</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 12, lineHeight: 18 }}>
                      This member doesn't have an app account yet. Create one to give them access.
                    </Text>

                    {clTempPassword ? (
                      /* Done state — show credentials */
                      <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: '#6EE7B7' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46', letterSpacing: 0.5, marginBottom: 10 }}>LOGIN CREATED</Text>
                        <View style={{ marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, color: '#047857', marginBottom: 2 }}>USERNAME</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: C.gray900, letterSpacing: 1 }}>{clUsername}</Text>
                        </View>
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ fontSize: 11, color: '#047857', marginBottom: 2 }}>TEMP PASSWORD</Text>
                          <Text style={{ fontSize: 22, fontWeight: '800', color: C.gray900, letterSpacing: 3 }}>{clTempPassword}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => { Clipboard.setString(`Username: ${clUsername}\nPassword: ${clTempPassword}`); setClCopied(true); setTimeout(() => setClCopied(false), 2500); }}
                          style={{ backgroundColor: clCopied ? C.green + '20' : '#D1FAE5', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: clCopied ? C.green : '#059669' }}>{clCopied ? '✓ Copied!' : 'Copy Username & Password'}</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: '#047857', marginTop: 8 }}>Share these with the member. They'll be asked to change the password on first login.</Text>
                      </View>
                    ) : showCreateLogin ? (
                      /* Form */
                      <View style={{ gap: 10 }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Username *</Text>
                          <TextInput
                            value={clUsername} onChangeText={setClUsername}
                            placeholder="e.g. sai_srinivas" autoCapitalize="none"
                            placeholderTextColor={C.gray400}
                            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 11, fontSize: 14, color: C.gray900 }}
                          />
                        </View>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Email *</Text>
                          <TextInput
                            value={clEmail} onChangeText={setClEmail}
                            placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none"
                            placeholderTextColor={C.gray400}
                            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 11, fontSize: 14, color: C.gray900 }}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity onPress={() => { setShowCreateLogin(false); setClUsername(''); setClEmail(''); }}
                            style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray300, alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray600 }}>Cancel</Text>
                          </TouchableOpacity>
                          <Button
                            label={createLoginMutation.isPending ? 'Creating…' : 'Create Login'}
                            variant="primary" style={{ flex: 1 }}
                            loading={createLoginMutation.isPending}
                            disabled={!clUsername.trim() || !clEmail.trim()}
                            onPress={() => createLoginMutation.mutate()}
                          />
                        </View>
                      </View>
                    ) : (
                      <Button
                        label="Create App Login"
                        variant="outline" fullWidth
                        onPress={() => { setClUsername(''); setClEmail(selected?.email ?? ''); setShowCreateLogin(true); }}
                      />
                    )}
                  </Card>
                )}

                {/* Contact Info */}
                <Card style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 10, letterSpacing: 0.5 }}>CONTACT INFO</Text>
                  {/* Phone row with +91 and call button */}
                  {selected.phone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, color: C.gray500, width: 70 }}>Phone</Text>
                      <Text style={{ fontSize: 13, color: C.gray900, flex: 1, fontWeight: '500' }}>
                        {selected.phone.startsWith('+') ? selected.phone : `+91 ${selected.phone}`}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          const num = selected.phone.startsWith('+') ? selected.phone : `+91${selected.phone}`;
                          Linking.openURL(`tel:${num}`);
                        }}
                        style={{ backgroundColor: C.green + '15', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: C.green }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>📞 Call</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {[
                    { label: 'Email', value: selected.email ?? '—' },
                    { label: 'Address', value: selected.address ?? '—' },
                    { label: 'City', value: selected.city ?? '—' },
                    { label: 'Joined', value: fmtDate(selected.createdAt) },
                  ].map((row) => (
                    <View key={row.label} style={{ flexDirection: 'row', marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, color: C.gray500, width: 70 }}>{row.label}</Text>
                      <Text style={{ fontSize: 13, color: C.gray900, flex: 1, fontWeight: '500' }}>{row.value}</Text>
                    </View>
                  ))}
                </Card>

                {/* Financial Info */}
                {(selected.bankName || selected.aadhaarLast4 || selected.panNumber) && (
                  <Card style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 10, letterSpacing: 0.5 }}>FINANCIAL DETAILS</Text>
                    {[
                      selected.bankName && { label: 'Bank', value: selected.bankName },
                      selected.bankAccountNumber && { label: 'Account', value: selected.bankAccountNumber },
                      selected.bankIfsc && { label: 'IFSC', value: selected.bankIfsc },
                      selected.aadhaarLast4 && { label: 'Aadhaar', value: `XXXX XXXX ${selected.aadhaarLast4}` },
                      selected.panNumber && { label: 'PAN', value: selected.panNumber },
                    ].filter(Boolean).map((row: any) => (
                      <View key={row.label} style={{ flexDirection: 'row', marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, color: C.gray500, width: 70 }}>{row.label}</Text>
                        <Text style={{ fontSize: 13, color: C.gray900, flex: 1, fontWeight: '500' }}>{row.value}</Text>
                      </View>
                    ))}
                  </Card>
                )}

                {/* Notes */}
                {selected.notes && (
                  <Card style={{ marginBottom: 12, backgroundColor: C.gray50 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 4 }}>NOTES</Text>
                    <Text style={{ fontSize: 13, color: C.gray700, fontStyle: 'italic' }}>"{selected.notes}"</Text>
                  </Card>
                )}

                {/* Referral */}
                <Card style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, letterSpacing: 0.5 }}>REFERRED BY</Text>
                    <TouchableOpacity onPress={() => {
                      setNewReferralId(''); setNewReferralSearch('');
                      setShowReferralChange(true);
                    }}>
                      <Text style={{ fontSize: 12, color: C.navy, fontWeight: '700' }}>
                        {selected.referredByName ? 'Change →' : 'Add →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {selected.referredByName ? (
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{selected.referredByName}</Text>
                  ) : (
                    <Text style={{ fontSize: 13, color: C.gray400, fontStyle: 'italic' }}>No referral recorded</Text>
                  )}
                </Card>

                {/* Enrolled Chits */}
                <Text style={{ ...T.label, marginBottom: 8 }}>ENROLLED CHITS</Text>
                {(memberChits as any[]).length === 0 ? (
                  <Text style={{ color: C.gray400, marginBottom: 16 }}>Not enrolled in any chits</Text>
                ) : (
                  (memberChits as any[]).map((c: any) => (
                    <TouchableOpacity key={c.id} activeOpacity={0.75}
                      onPress={() => {
                        setShowDetail(false);
                        setTimeout(() => router.push({ pathname: '/(app)/(admin)/chits', params: { openChitId: c.id } }), 300);
                      }}>
                      <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: c.status === 'ACTIVE' ? C.green : C.gray300 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{c.name}</Text>
                            {c.installmentAmount && <Amount value={c.installmentAmount} size="sm" color={C.navy} />}
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Badge status={c.status} />
                            <ChitBalanceBadge memberId={selected.id} chitId={c.id} />
                          </View>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))
                )}

                {/* Actions */}
                <Text style={{ ...T.label, marginBottom: 10, marginTop: 8 }}>ACTIONS</Text>
                <View style={{ gap: 10 }}>
                  {/* Edit member — inline (no modal stacking) */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => showEditInline ? setShowEditInline(false) : openEdit(selected)}
                    style={{ marginBottom: showEditInline ? 0 : 0 }}
                  >
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: showEditInline ? C.navy : C.white,
                      borderRadius: 12,
                      borderBottomLeftRadius: showEditInline ? 0 : 12,
                      borderBottomRightRadius: showEditInline ? 0 : 12,
                      padding: 14, borderWidth: 1.5,
                      borderColor: showEditInline ? C.navy : C.gray200,
                    }}>
                      <Text style={{ fontSize: 18 }}>✏️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: showEditInline ? C.white : C.gray900 }}>Edit Member</Text>
                        <Text style={{ fontSize: 12, color: showEditInline ? C.white + 'cc' : C.gray400, marginTop: 1 }}>
                          {showEditInline ? 'Tap to close' : 'Update contact, identity, bank details'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: showEditInline ? C.white : C.navy, fontWeight: '700' }}>
                        {showEditInline ? '▲ Close' : 'Edit →'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {showEditInline && (
                    <View style={{
                      backgroundColor: C.gray50, borderRadius: 12,
                      borderTopLeftRadius: 0, borderTopRightRadius: 0,
                      padding: 16, gap: 14,
                      borderWidth: 1.5, borderTopWidth: 0,
                      borderColor: C.navy,
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray400, letterSpacing: 0.5 }}>PERSONAL INFO</Text>
                      {([
                        { label: 'Full Name *', value: eName, set: setEName, placeholder: 'Full name' },
                        { label: 'Email', value: eEmail, set: setEEmail, placeholder: 'email@example.com', keyboard: 'email-address' as const },
                        { label: 'City', value: eCity, set: setECity, placeholder: 'City' },
                        { label: 'Address', value: eAddress, set: setEAddress, placeholder: 'Address' },
                        { label: 'Aadhaar Last 4', value: eAadhaar, set: setEAadhaar, placeholder: '1234', keyboard: 'numeric' as const, maxLen: 4 },
                        { label: 'PAN Number', value: ePan, set: (v: string) => setEPan(v.toUpperCase()), placeholder: 'ABCDE1234F', maxLen: 10 },
                      ] as any[]).map(({ label, value, set, placeholder, keyboard, maxLen }) => (
                        <View key={label}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>{label}</Text>
                          <TextInput value={value} onChangeText={set} placeholder={placeholder}
                            keyboardType={keyboard ?? 'default'} maxLength={maxLen}
                            placeholderTextColor={C.gray400} autoCapitalize="none"
                            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, backgroundColor: C.white }} />
                        </View>
                      ))}
                      <PhoneInput
                        label="Phone"
                        countryCode={ePhoneCode}
                        phone={ePhone}
                        onCountryChange={setEPhoneCode}
                        onPhoneChange={setEPhone}
                      />
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes</Text>
                        <TextInput value={eNotes} onChangeText={setENotes} placeholder="Any notes…" multiline
                          placeholderTextColor={C.gray400}
                          style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, backgroundColor: C.white, minHeight: 60, textAlignVertical: 'top' }} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Button label="Cancel" variant="ghost" onPress={() => setShowEditInline(false)} />
                        </View>
                        <View style={{ flex: 2 }}>
                          <Button
                            label={updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                            variant="primary"
                            loading={updateMutation.isPending}
                            disabled={!eName.trim()}
                            onPress={() => updateMutation.mutate()}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                  {/* Status switcher — inline, no modal stacking */}
                  {!showStatusInline ? (
                    <TouchableOpacity
                      onPress={() => { setNewStatus(selected.status ?? 'ACTIVE'); setShowStatusInline(true); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>Member Status</Text>
                        <Text style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>Currently: {selected.status ?? 'ACTIVE'}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: C.navy, fontWeight: '700' }}>Change →</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: C.navy + '30', gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>Change Status</Text>
                        <TouchableOpacity onPress={() => { setShowStatusInline(false); setNewStatus(''); setStatusReason(''); }}>
                          <Text style={{ fontSize: 13, color: C.gray400 }}>✕ Cancel</Text>
                        </TouchableOpacity>
                      </View>
                      {[
                        { value: 'ACTIVE',      label: 'Active',      color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
                        { value: 'INACTIVE',    label: 'Inactive',    color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
                        { value: 'SUSPENDED',   label: 'Suspended',   color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                        { value: 'BLACKLISTED', label: 'Blacklisted', color: '#DC2626', bg: '#FFF5F5', border: '#FECACA' },
                      ].map((s) => (
                        <TouchableOpacity key={s.value} onPress={() => setNewStatus(s.value)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1.5,
                            borderColor: newStatus === s.value ? s.color : C.gray200,
                            backgroundColor: newStatus === s.value ? s.bg : C.white }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                          <Text style={{ fontSize: 14, flex: 1, fontWeight: newStatus === s.value ? '700' : '400', color: newStatus === s.value ? s.color : C.gray700 }}>
                            {s.label}
                          </Text>
                          {selected.status === s.value && (
                            <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic' }}>current</Text>
                          )}
                          {newStatus === s.value && selected.status !== s.value && (
                            <Text style={{ fontSize: 11, color: s.color, fontWeight: '700' }}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>
                          Reason {newStatus === 'BLACKLISTED' ? '*' : '(optional)'}
                        </Text>
                        <TextInput
                          value={statusReason}
                          onChangeText={setStatusReason}
                          placeholder="Reason for status change…"
                          multiline
                          placeholderTextColor={C.gray400}
                          style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 56, textAlignVertical: 'top' }}
                        />
                      </View>
                      <Button
                        label={statusMutation.isPending ? 'Saving…' : 'Save Status'}
                        variant="primary"
                        fullWidth
                        loading={statusMutation.isPending}
                        disabled={!newStatus || newStatus === selected.status}
                        onPress={() => {
                          if (newStatus === 'BLACKLISTED' && !statusReason.trim()) {
                            Alert.alert('Reason required', 'Please enter a reason for blacklisting this member.');
                            return;
                          }
                          statusMutation.mutate({ id: selected.id, status: newStatus, reason: statusReason.trim() || undefined });
                        }}
                      />
                    </View>
                  )}

                  {!(selected.userId || selected.linkedUserId) && (
                    <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.gray200 }}>
                      <Text style={{ fontSize: 13, color: C.gray500, textAlign: 'center' }}>No app login — member hasn't been linked to a user account</Text>
                    </View>
                  )}
                </View>

                {/* Pending Cash Pickup Requests */}
                {pendingMemberRequests.length > 0 && (
                  <View style={{ marginTop: 16, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber, letterSpacing: 0.5 }}>PENDING CASH PICKUPS</Text>
                      <View style={{ backgroundColor: C.amber, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: C.white }}>{pendingMemberRequests.length}</Text>
                      </View>
                    </View>
                    {pendingMemberRequests.map((r: any) => {
                      const stColor = r.status === 'PICKED_UP' ? '#16A34A' : r.status === 'ASSIGNED' ? '#2563EB' : C.amber;
                      const stBg    = r.status === 'PICKED_UP' ? '#F0FDF4' : r.status === 'ASSIGNED' ? '#EFF6FF' : '#FFFBEB';
                      const stLabel = r.status === 'PICKED_UP' ? 'Picked Up — pending admin confirm' :
                                      r.status === 'ASSIGNED'  ? 'Assigned to worker' : 'Awaiting assignment';
                      return (
                        <View key={r.id} style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: '#FDE68A' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ backgroundColor: stBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: stColor }}>{stLabel}</Text>
                            </View>
                            {r.requestedAmount != null && (
                              <Amount value={Number(r.requestedAmount)} size="sm" />
                            )}
                          </View>
                          {r.workerName && (
                            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Worker: {r.workerName}</Text>
                          )}
                          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                            {fmtDate(r.assignedAt ?? r.createdAt)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Profile Change History (admin-only) */}
                <View style={{ marginTop: 20, marginBottom: 4 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowProfileHistory(v => !v)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 14, borderRadius: 12,
                      borderBottomLeftRadius: showProfileHistory ? 0 : 12,
                      borderBottomRightRadius: showProfileHistory ? 0 : 12,
                      borderWidth: 1.5,
                      borderColor: C.gray200,
                      backgroundColor: showProfileHistory ? C.navy50 : C.white,
                    }}>
                    <Text style={{ fontSize: 18 }}>📋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: showProfileHistory ? C.navy : C.gray900 }}>Profile Change History</Text>
                      <Text style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>All edits made to this member's profile</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>{showProfileHistory ? '▲ Close' : 'View →'}</Text>
                  </TouchableOpacity>

                  {showProfileHistory && (
                    <View style={{
                      backgroundColor: C.gray50, borderRadius: 12,
                      borderTopLeftRadius: 0, borderTopRightRadius: 0,
                      padding: 14, borderWidth: 1.5, borderTopWidth: 0, borderColor: C.gray200,
                    }}>
                      {(profileHistory as any[]).length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                          <Text style={{ fontSize: 13, color: C.gray400 }}>No profile changes recorded yet</Text>
                        </View>
                      ) : (
                        (profileHistory as any[]).map((log: any, idx: number) => {
                          const action = log.action ?? '';
                          const icon = action.includes('PROFILE') ? '✏️' : action.includes('STATUS') ? '🔄' : action.includes('CREAT') ? '➕' : '📝';
                          const actionLabel = action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                          return (
                            <View key={log.id ?? idx} style={{
                              flexDirection: 'row', gap: 10, paddingBottom: 12,
                              borderBottomWidth: idx < (profileHistory as any[]).length - 1 ? 1 : 0,
                              borderBottomColor: C.gray200, marginBottom: 12,
                            }}>
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Text style={{ fontSize: 14 }}>{icon}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{actionLabel}</Text>
                                {log.previousValue || log.newValue ? (
                                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                                    {log.previousValue && log.newValue
                                      ? `${log.previousValue} → ${log.newValue}`
                                      : log.newValue ?? log.previousValue}
                                  </Text>
                                ) : null}
                                {log.reason ? <Text style={{ fontSize: 11, color: C.gray400, fontStyle: 'italic', marginTop: 2 }}>"{log.reason}"</Text> : null}
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(log.createdAt)}</Text>
                                  {log.actorRole && <Text style={{ fontSize: 11, color: C.gray400 }}>· {log.actorRole}</Text>}
                                </View>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>

                {/* Settle + Delete — bottom of detail */}
                <View style={{ marginTop: 24, gap: 10, paddingBottom: 8 }}>
                  <Button label="Settle Account" variant="outline" fullWidth
                    onPress={() => {
                      setShowDetail(false);
                      setTimeout(() => router.push({ pathname: '/(app)/(admin)/payments', params: { tab: 'settlement', memberId: selected.id } }), 300);
                    }} />
                  {selected.status !== 'DELETED' && (
                    <Button label="Delete Member" variant="danger" fullWidth
                      loading={deleteMutation.isPending}
                      onPress={() =>
                        Alert.alert('Delete Member', `Permanently delete ${selected.fullName}? This cannot be undone.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(selected.id) },
                        ])} />
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Collect Payment Modal ─────────────────────────────────────────────── */}
      <Modal visible={showCollect} animationType="slide" transparent onRequestClose={() => setShowCollect(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Collect Payment</Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{selected?.fullName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCollect(false)}>
                <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ ...T.label, marginBottom: 6 }}>Amount (₹)</Text>
            <TextInput value={collectAmount} onChangeText={setCollectAmount} keyboardType="numeric" placeholder="0"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '700', color: C.gray900, marginBottom: 14 }} />

            <Text style={{ ...T.label, marginBottom: 8 }}>Payment Mode</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((m) => (
                <TouchableOpacity key={m} onPress={() => setCollectMode(m)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: collectMode === m ? C.navy : C.gray300,
                    backgroundColor: collectMode === m ? C.navy50 : C.white }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: collectMode === m ? C.navy : C.gray500 }}>
                    {m.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ ...T.label, marginBottom: 6 }}>Notes (optional)</Text>
            <TextInput value={collectNotes} onChangeText={setCollectNotes} placeholder="Any notes…" multiline
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 56, textAlignVertical: 'top', marginBottom: 16 }} />

            <Button label={`Record ₹${Number(collectAmount || 0).toLocaleString('en-IN')} Payment`}
              variant="success" fullWidth size="lg"
              disabled={!collectChitId || !collectAmount || Number(collectAmount) <= 0}
              loading={collectMutation.isPending}
              onPress={() => collectMutation.mutate()} />
          </View>
        </View>
      </Modal>

      {/* ── Create Member Modal ────────────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={T.h2}>Add Member</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Personal Info */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray400, letterSpacing: 0.5 }}>PERSONAL INFORMATION</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Full Name *</Text>
              <TextInput value={cFullName} onChangeText={setCFullName} placeholder="Sai Srinivas"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <PhoneInput
              label="Phone"
              required
              countryCode={cPhoneCountryCode}
              phone={cPhone}
              onCountryChange={setCPhoneCountryCode}
              onPhoneChange={setCPhone}
            />
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Email</Text>
              <TextInput value={cEmail} onChangeText={setCEmail} placeholder="email@example.com"
                keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>City</Text>
              <TextInput value={cCity} onChangeText={setCCity} placeholder="Hyderabad"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Address</Text>
              <TextInput value={cAddress} onChangeText={setCAddress} placeholder="House No, Street, Area"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>

            {/* Identity */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray400, letterSpacing: 0.5, marginTop: 4 }}>IDENTITY</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Aadhaar (last 4 digits)</Text>
              <TextInput value={cAadhaar} onChangeText={setCAAadhaar} placeholder="1234" maxLength={4}
                keyboardType="numeric" placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>PAN Number</Text>
              <TextInput value={cPan} onChangeText={(t) => setCPan(t.toUpperCase())} placeholder="ABCDE1234F"
                maxLength={10} autoCapitalize="characters" placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>

            {/* Referral */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray400, letterSpacing: 0.5, marginTop: 4 }}>REFERRAL</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Referred By</Text>
              <TextInput value={cReferralSearch} onChangeText={(t) => { setCReferralSearch(t); if (!t) setCReferredById(''); }}
                placeholder="Search member name…" placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 6 }} />
              {cReferralSearch.length > 0 && !cReferredById && (
                <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled>
                  {(members as any[]).filter((m: any) =>
                    (m.fullName ?? '').toLowerCase().includes(cReferralSearch.toLowerCase())
                  ).slice(0, 6).map((m: any) => (
                    <TouchableOpacity key={m.id} onPress={() => { setCReferredById(m.id); setCReferralSearch(m.fullName); }}
                      style={{ padding: 10, backgroundColor: C.gray50, borderRadius: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: C.gray900 }}>{m.fullName}</Text>
                      {m.phone && <Text style={{ fontSize: 11, color: C.gray500 }}>{m.phone}</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {cReferredById && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, flex: 1 }}>{cReferralSearch}</Text>
                  <TouchableOpacity onPress={() => { setCReferredById(''); setCReferralSearch(''); }}>
                    <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label="Create Member" variant="primary" onPress={() => createMutation.mutate()}
              loading={createMutation.isPending} disabled={!cFullName || !cPhone} fullWidth />
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Change Referral Modal ──────────────────────────────────────────────── */}
      <Modal visible={showReferralChange} animationType="slide" transparent onRequestClose={() => setShowReferralChange(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Change Referral</Text>
              <TouchableOpacity onPress={() => setShowReferralChange(false)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 14 }}>
              Who referred {selected?.fullName}?
            </Text>
            <TextInput
              value={newReferralSearch}
              onChangeText={(t) => { setNewReferralSearch(t); if (!t) setNewReferralId(''); }}
              placeholder="Search member name…"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, marginBottom: 8 }}
            />
            {newReferralSearch.length > 0 && !newReferralId && (
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                {/* Clear option */}
                <TouchableOpacity onPress={() => { setNewReferralId('none'); setNewReferralSearch('— No referral —'); }}
                  style={{ padding: 10, backgroundColor: C.gray50, borderRadius: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: C.gray500, fontStyle: 'italic' }}>— Remove referral —</Text>
                </TouchableOpacity>
                {(members as any[])
                  .filter((m: any) => m.id !== selected?.id && (m.fullName ?? '').toLowerCase().includes(newReferralSearch.toLowerCase()))
                  .slice(0, 7)
                  .map((m: any) => (
                    <TouchableOpacity key={m.id} onPress={() => { setNewReferralId(m.id); setNewReferralSearch(m.fullName); }}
                      style={{ padding: 10, backgroundColor: C.gray50, borderRadius: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{m.fullName}</Text>
                      {m.phone && <Text style={{ fontSize: 11, color: C.gray500 }}>{m.phone}</Text>}
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            )}
            {newReferralId && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, flex: 1 }}>{newReferralSearch}</Text>
                <TouchableOpacity onPress={() => { setNewReferralId(''); setNewReferralSearch(''); }}>
                  <Text style={{ fontSize: 16, color: C.gray400 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setShowReferralChange(false)} /></View>
              <View style={{ flex: 1 }}>
                <Button label="Save" variant="primary"
                  disabled={!newReferralId}
                  loading={changeReferralMutation.isPending}
                  onPress={() => changeReferralMutation.mutate()} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
