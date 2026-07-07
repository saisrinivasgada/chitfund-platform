import { useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, Alert, TextInput, Modal, TouchableOpacity, ScrollView, Clipboard,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  listStaff, createStaff, activateStaff, deactivateStaff, changeStaffRole,
  resetMemberPassword, getUserById, getWorkerRequests, getBatchesByCollector,
} from '../../../services/api';
import { C, T, Card, Badge, Button, EmptyState, LoadingScreen, PhoneInput, Amount } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import { toast } from '../../../components/Toast';

const ROLES = ['WORKER', 'MANAGER', 'ADMIN'] as const;
type Role = typeof ROLES[number];

const ROLE_STYLE: Record<Role, { bg: string; text: string; accent: string }> = {
  ADMIN:   { bg: C.navy50,  text: C.navy,     accent: C.navy },
  MANAGER: { bg: '#F5F3FF', text: '#7C3AED',  accent: '#7C3AED' },
  WORKER:  { bg: '#FEF3C7', text: C.amber,    accent: C.amber },
};

const REQUEST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',    color: '#D97706', bg: '#FEF3C7' },
  ASSIGNED:  { label: 'Assigned',   color: '#2563EB', bg: '#EFF6FF' },
  PICKED_UP: { label: 'Picked Up',  color: '#16A34A', bg: '#F0FDF4' },
  COLLECTED: { label: 'Collected',  color: '#16A34A', bg: '#F0FDF4' },
  CANCELLED: { label: 'Cancelled',  color: '#9CA3AF', bg: '#F3F4F6' },
};

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AdminTeamScreen() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  // Role change is now inline — no separate modal
  const [showRoleInline, setShowRoleInline] = useState(false);
  const [newRole, setNewRole] = useState<Role>('WORKER');
  const [tempPassword, setTempPassword] = useState('');
  const [pwdCopied, setPwdCopied] = useState(false);
  const [showPwdInline, setShowPwdInline] = useState(false);

  // Create form
  const [cFullName, setCFullName] = useState('');
  const [cUsername, setCUsername] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState<Role>('WORKER');
  const [cPhone, setCPhone] = useState('');
  const [cPhoneCountryCode, setCPhoneCountryCode] = useState('+91');
  const [cEmail, setCEmail] = useState('');

  const { data: staff = [], isLoading, refetch } = useQuery({
    queryKey: ['m-staff'],
    queryFn: listStaff,
  });

  const { data: selectedUser } = useQuery({
    queryKey: ['m-team-user-status', selected?.id],
    queryFn: () => getUserById(selected!.id),
    enabled: !!selected?.id && showDetail,
    staleTime: 30_000,
  });

  const isCollector = selected?.role === 'WORKER' || selected?.role === 'MANAGER';

  const { data: workerRequests = [] } = useQuery({
    queryKey: ['m-worker-requests', selected?.id],
    queryFn: () => getWorkerRequests(selected!.id),
    enabled: !!selected?.id && showDetail && isCollector,
    staleTime: 30_000,
  });

  const { data: collectorBatches = [] } = useQuery({
    queryKey: ['m-collector-batches', selected?.id],
    queryFn: () => getBatchesByCollector(selected!.id),
    enabled: !!selected?.id && showDetail && isCollector,
    staleTime: 30_000,
  });

  const pendingPickups = (workerRequests as any[]).filter(
    (r) => r.status === 'ASSIGNED' || r.status === 'PICKED_UP',
  );
  const pendingBatches = (collectorBatches as any[]).filter(
    (b) => b.status === 'AWAITING_REMITTANCE',
  );
  const totalCashPending = pendingBatches.reduce(
    (sum: number, b: any) => sum + Number(b.totalAmount ?? b.amount ?? 0), 0,
  );

  const createMut = useMutation({
    mutationFn: () => createStaff({
      fullName: cFullName, username: cUsername, password: cPassword,
      role: cRole, phone: cPhone || undefined, phoneCountryCode: cPhone ? cPhoneCountryCode : undefined, email: cEmail || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-staff'] });
      setShowCreate(false);
      setCFullName(''); setCUsername(''); setCPassword(''); setCPhone(''); setCPhoneCountryCode('+91'); setCEmail(''); setCRole('WORKER');
      toast.created('Staff member created');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => activateStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-staff'] });
      setSelected((prev: any) => prev ? { ...prev, enabled: true } : prev);
      toast.saved('Staff activated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m-staff'] });
      setSelected((prev: any) => prev ? { ...prev, enabled: false } : prev);
      toast.deleted('Staff deactivated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => changeStaffRole(id, role),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['m-staff'] });
      setSelected((prev: any) => prev ? { ...prev, role: vars.role } : prev);
      setShowRoleInline(false);
      toast.saved('Role updated');
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const resetPwdMut = useMutation({
    mutationFn: (userId: string) => resetMemberPassword(userId),
    onSuccess: (data: any) => {
      const tmp = data?.tempPassword ?? data?.password ?? data?.data?.tempPassword ?? '';
      setTempPassword(tmp);
      setPwdCopied(false);
      setShowPwdInline(true);
      qc.invalidateQueries({ queryKey: ['m-team-user-status', selected?.id] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const workers  = (staff as any[]).filter((s) => s.role === 'WORKER');
  const managers = (staff as any[]).filter((s) => s.role === 'MANAGER');
  const admins   = (staff as any[]).filter((s) => s.role === 'ADMIN');

  function openDetail(s: any) {
    setSelected(s);
    setNewRole(s.role as Role);
    setTempPassword('');
    setShowPwdInline(false);
    setPwdCopied(false);
    setShowRoleInline(false);
    setShowDetail(true);
  }

  if (isLoading) return <LoadingScreen />;

  const rs = selected ? (ROLE_STYLE[selected.role as Role] ?? ROLE_STYLE.WORKER) : ROLE_STYLE.WORKER;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={staff as any[]}
        keyExtractor={(s: any) => s.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View>
                <Text style={T.h1}>Team</Text>
                <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
                  {admins.length} admin · {managers.length} manager · {workers.length} workers
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowCreate(true)}
                  style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
                  <Text style={{ color: C.white, fontWeight: '700', fontSize: 13 }}>+ Add Staff</Text>
                </TouchableOpacity>
                <ProfileAvatarButton size={34} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { label: 'Admins', count: admins.length, style: ROLE_STYLE.ADMIN },
                { label: 'Managers', count: managers.length, style: ROLE_STYLE.MANAGER },
                { label: 'Workers', count: workers.length, style: ROLE_STYLE.WORKER },
              ].map((s) => (
                <View key={s.label} style={{ flex: 1, backgroundColor: s.style.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: s.style.text }}>{s.count}</Text>
                  <Text style={{ fontSize: 11, color: s.style.text + 'CC', marginTop: 2 }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No staff" message="Add staff members to manage your chit business." />}
        renderItem={({ item: s }) => {
          const itemRs = ROLE_STYLE[s.role as Role] ?? ROLE_STYLE.WORKER;
          const isActive = s.enabled !== false && s.status !== 'INACTIVE';
          return (
            <TouchableOpacity onPress={() => openDetail(s)} activeOpacity={0.75}>
              <Card style={{ marginBottom: 10, opacity: isActive ? 1 : 0.6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: itemRs.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: itemRs.text }}>
                      {(s.fullName ?? s.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{s.fullName ?? s.username}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500 }}>@{s.username}</Text>
                    {s.phone && <Text style={{ fontSize: 12, color: C.gray400 }}>{s.phone}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={{ backgroundColor: itemRs.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: itemRs.text }}>{s.role}</Text>
                    </View>
                    {!isActive && <Badge status="INACTIVE" />}
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Staff Detail Modal ─────────────────────────────────────────────── */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <View style={{ flex: 1 }}>
              <Text style={T.h2} numberOfLines={1}>{selected?.fullName ?? selected?.username}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: rs.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: rs.text }}>{selected?.role}</Text>
                </View>
                {(selected?.enabled === false || selected?.status === 'INACTIVE') && (
                  <Badge status="INACTIVE" />
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowDetail(false)} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {selected && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

              {/* ── Live status cards (workers / managers only) ── */}
              {isCollector && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <View style={{ flex: 1, backgroundColor: pendingPickups.length > 0 ? '#FFFBEB' : C.gray50, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: pendingPickups.length > 0 ? '#FDE68A' : C.gray200 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: pendingPickups.length > 0 ? C.amber : C.gray400 }}>
                      {pendingPickups.length}
                    </Text>
                    <Text style={{ fontSize: 11, color: pendingPickups.length > 0 ? '#92400E' : C.gray500, marginTop: 2, lineHeight: 14 }}>
                      Pending{'\n'}Pickups
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: pendingBatches.length > 0 ? '#FFF7ED' : C.gray50, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: pendingBatches.length > 0 ? '#FDBA74' : C.gray200 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: pendingBatches.length > 0 ? '#EA580C' : C.gray400 }}>
                      {pendingBatches.length}
                    </Text>
                    <Text style={{ fontSize: 11, color: pendingBatches.length > 0 ? '#9A3412' : C.gray500, marginTop: 2, lineHeight: 14 }}>
                      Pending{'\n'}Remittance
                    </Text>
                  </View>
                  <View style={{ flex: 1.4, backgroundColor: totalCashPending > 0 ? C.navy50 : C.gray50, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: totalCashPending > 0 ? C.navy + '40' : C.gray200 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: totalCashPending > 0 ? C.navy : C.gray400 }} numberOfLines={1}>
                      ₹{totalCashPending > 0 ? Number(totalCashPending).toLocaleString('en-IN') : '0'}
                    </Text>
                    <Text style={{ fontSize: 11, color: totalCashPending > 0 ? C.navy : C.gray500, marginTop: 2, lineHeight: 14 }}>
                      Cash to{'\n'}Remit
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Pending Pickups list ── */}
              {isCollector && pendingPickups.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ ...T.label, marginBottom: 8 }}>PENDING PICKUPS</Text>
                  {pendingPickups.map((r: any) => {
                    const st = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.ASSIGNED;
                    return (
                      <View key={r.id} style={{ backgroundColor: C.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.gray200 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ backgroundColor: st.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: st.color }}>{st.label}</Text>
                          </View>
                          {r.requestedAmount != null && (
                            <Amount value={Number(r.requestedAmount)} size="sm" />
                          )}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                          {r.memberName ?? r.memberId?.slice(0, 8) + '…'}
                        </Text>
                        {r.chitName && (
                          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{r.chitName}</Text>
                        )}
                        <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                          Assigned {fmtDate(r.assignedAt ?? r.createdAt)}
                          {r.status === 'PICKED_UP' && r.pickedUpAt ? ` · Picked up ${fmtDate(r.pickedUpAt)}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Pending Remittance list ── */}
              {isCollector && pendingBatches.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ ...T.label, marginBottom: 8 }}>CASH AWAITING REMITTANCE</Text>
                  {pendingBatches.map((b: any) => (
                    <View key={b.id} style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                            {b.memberName ?? b.memberId?.slice(0, 8) + '…'}
                          </Text>
                          {b.chitName && (
                            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>{b.chitName}</Text>
                          )}
                          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                            Collected {fmtDate(b.collectedAt ?? b.createdAt)}
                            {b.paymentMode ? ` · ${b.paymentMode}` : ''}
                          </Text>
                        </View>
                        <Amount value={Number(b.totalAmount ?? b.amount ?? 0)} size="md" />
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Profile Card ── */}
              <Card style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: rs.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: rs.text }}>
                      {(selected.fullName ?? selected.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>{selected.fullName ?? selected.username}</Text>
                    <Text style={{ fontSize: 13, color: C.gray500 }}>@{selected.username}</Text>
                  </View>
                </View>
                {[
                  selected.phone && { label: 'Phone', value: selected.phone },
                  selected.email && { label: 'Email', value: selected.email },
                  { label: 'Status', value: selected.enabled === false ? 'Inactive' : 'Active' },
                ].filter(Boolean).map((row: any) => (
                  <View key={row.label} style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: C.gray500, width: 60 }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{row.value}</Text>
                  </View>
                ))}
              </Card>

              {/* ── Password Management ── */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowPwdInline(v => !v)}
                style={{ marginBottom: showPwdInline ? 0 : 16 }}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: selectedUser?.mustChangePassword ? '#FFFBEB' : C.navy50,
                  borderRadius: 12,
                  borderBottomLeftRadius: showPwdInline ? 0 : 12,
                  borderBottomRightRadius: showPwdInline ? 0 : 12,
                  padding: 12, borderWidth: 1.5,
                  borderColor: selectedUser?.mustChangePassword ? C.amber : C.navy,
                }}>
                  <Text style={{ fontSize: 20 }}>🔑</Text>
                  <View style={{ flex: 1 }}>
                    {selectedUser?.mustChangePassword ? (
                      <>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>Temporary password active</Text>
                        <Text style={{ fontSize: 12, color: '#92400E', marginTop: 1 }}>Staff hasn't changed it yet. Tap to manage.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Password Management</Text>
                        <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Generate a temporary password for this staff member.</Text>
                      </>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedUser?.mustChangePassword ? C.amber : C.navy }}>
                    {showPwdInline ? '▲ Close' : 'Manage →'}
                  </Text>
                </View>
              </TouchableOpacity>

              {showPwdInline && (
                <View style={{
                  backgroundColor: C.gray50, borderRadius: 12,
                  borderTopLeftRadius: 0, borderTopRightRadius: 0,
                  padding: 16, marginBottom: 16,
                  borderWidth: 1.5, borderTopWidth: 0,
                  borderColor: selectedUser?.mustChangePassword ? C.amber : C.navy,
                }}>
                  {tempPassword ? (
                    <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: C.amber, marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.amber, letterSpacing: 0.5, marginBottom: 8 }}>CURRENT TEMP PASSWORD</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ flex: 1, fontSize: 22, fontWeight: '800', color: C.gray900, letterSpacing: 3 }}>
                          {tempPassword}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { Clipboard.setString(tempPassword); setPwdCopied(true); setTimeout(() => setPwdCopied(false), 2000); }}
                          style={{ backgroundColor: pwdCopied ? C.green + '20' : C.amber + '20', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: pwdCopied ? C.green : C.amber }}>
                            {pwdCopied ? '✓ Copied' : 'Copy'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={{ fontSize: 11, color: '#92400E', marginTop: 8 }}>
                        Generated in this session. Share with the staff member.
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 12, lineHeight: 20 }}>
                      {selectedUser?.mustChangePassword
                        ? "The temporary password was set before this session and can't be retrieved. Regenerate to get a new one."
                        : 'Generate a temporary password for this staff member to log in.'}
                    </Text>
                  )}
                  <Button
                    label={resetPwdMut.isPending ? 'Generating…' : (selectedUser?.mustChangePassword ? 'Regenerate Password' : 'Generate Temporary Password')}
                    variant="primary"
                    fullWidth
                    loading={resetPwdMut.isPending}
                    onPress={() => {
                      Alert.alert(
                        selectedUser?.mustChangePassword ? 'Regenerate Password' : 'Generate Temporary Password',
                        `Generate a temporary password for ${selected?.fullName ?? selected?.username}?\n\nThey'll be prompted to change it on first login.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Generate', onPress: () => resetPwdMut.mutate(selected.id) },
                        ],
                      );
                    }}
                  />
                </View>
              )}

              {/* ── Change Role — inline (fixes iOS transparent-modal-on-pageSheet bug) ── */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { setNewRole(selected.role as Role); setShowRoleInline(v => !v); }}
                style={{ marginBottom: showRoleInline ? 0 : 10 }}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: C.gray50,
                  borderRadius: 12,
                  borderBottomLeftRadius: showRoleInline ? 0 : 12,
                  borderBottomRightRadius: showRoleInline ? 0 : 12,
                  padding: 12, borderWidth: 1.5, borderColor: C.gray200,
                }}>
                  <Text style={{ fontSize: 18 }}>🔄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>Change Role</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Current: {selected.role}</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>
                    {showRoleInline ? '▲ Close' : 'Change →'}
                  </Text>
                </View>
              </TouchableOpacity>

              {showRoleInline && (
                <View style={{
                  backgroundColor: C.gray50, borderRadius: 12,
                  borderTopLeftRadius: 0, borderTopRightRadius: 0,
                  padding: 16, marginBottom: 10,
                  borderWidth: 1.5, borderTopWidth: 0, borderColor: C.gray200,
                }}>
                  {ROLES.map((role) => {
                    const roleRs = ROLE_STYLE[role];
                    const isCurrent = selected?.role === role;
                    return (
                      <TouchableOpacity key={role} onPress={() => setNewRole(role)}
                        style={{ padding: 12, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center',
                          backgroundColor: newRole === role ? roleRs.bg : C.white,
                          borderWidth: 1.5, borderColor: newRole === role ? roleRs.accent : C.gray200 }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: newRole === role ? roleRs.text : C.gray900 }}>{role}</Text>
                            {isCurrent && (
                              <View style={{ backgroundColor: roleRs.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: roleRs.accent + '60' }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: roleRs.text }}>current</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                            {role === 'ADMIN' ? 'Full access — manage everything' : role === 'MANAGER' ? 'Admin-level access' : 'Collect cash pickups only'}
                          </Text>
                        </View>
                        {newRole === role && <Text style={{ fontSize: 16, color: roleRs.accent }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Cancel" variant="ghost" onPress={() => setShowRoleInline(false)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Save Role"
                        variant="primary"
                        loading={roleMut.isPending}
                        disabled={newRole === selected?.role}
                        onPress={() =>
                          Alert.alert('Confirm', `Change ${selected?.fullName ?? selected?.username} to ${newRole}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Change', onPress: () => roleMut.mutate({ id: selected.id, role: newRole }) },
                          ])
                        }
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ── Activate / Deactivate ── */}
              <View style={{ marginBottom: 8 }}>
                {selected.enabled === false || selected.status === 'INACTIVE' ? (
                  <Button label="Activate Staff" variant="success" fullWidth
                    loading={activateMut.isPending}
                    onPress={() => Alert.alert('Activate', `Activate ${selected.fullName ?? selected.username}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Activate', onPress: () => activateMut.mutate(selected.id) },
                    ])} />
                ) : (
                  <Button label="Deactivate Staff" variant="danger" fullWidth
                    loading={deactivateMut.isPending}
                    onPress={() => Alert.alert('Deactivate', `Deactivate ${selected.fullName ?? selected.username}? They will lose access.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Deactivate', style: 'destructive', onPress: () => deactivateMut.mutate(selected.id) },
                    ])} />
                )}
              </View>

            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Create Staff Modal ──────────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
            <Text style={T.h2}>Add Staff Member</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {[
              { label: 'Full Name *', value: cFullName, set: setCFullName, placeholder: 'Ravi Kumar' },
              { label: 'Username *', value: cUsername, set: setCUsername, placeholder: 'ravi_kumar' },
              { label: 'Password *', value: cPassword, set: (v: string) => setCPassword(v.replace(/\s/g, '')), placeholder: 'Min 6 characters', secure: true },
            ].map((f) => (
              <View key={f.label} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>{f.label}</Text>
                <TextInput
                  value={f.value} onChangeText={f.set} placeholder={f.placeholder}
                  secureTextEntry={(f as any).secure}
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }}
                />
              </View>
            ))}
            <View style={{ marginBottom: 14 }}>
              <PhoneInput
                label="Phone"
                countryCode={cPhoneCountryCode}
                phone={cPhone}
                onCountryChange={setCPhoneCountryCode}
                onPhoneChange={setCPhone}
              />
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Email</Text>
              <TextInput value={cEmail} onChangeText={setCEmail} placeholder="ravi@example.com"
                keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 10 }}>Role *</Text>
            {ROLES.map((role) => {
              const roleRs = ROLE_STYLE[role];
              return (
                <TouchableOpacity key={role} onPress={() => setCRole(role)}
                  style={{ padding: 12, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: cRole === role ? roleRs.bg : C.gray50,
                    borderWidth: 2, borderColor: cRole === role ? roleRs.accent : 'transparent' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: cRole === role ? roleRs.text : C.gray900 }}>{role}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      {role === 'ADMIN' ? 'Full access — manage everything' : role === 'MANAGER' ? 'Admin-level access' : 'Collect cash pickups only'}
                    </Text>
                  </View>
                  {cRole === role && <Text style={{ fontSize: 16, color: roleRs.accent }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
            <Button label="Create Staff Member" variant="primary" fullWidth
              onPress={() => createMut.mutate()} loading={createMut.isPending}
              disabled={!cFullName || !cUsername || !cPassword} />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
