import { useState, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, TextInput, Modal, ScrollView, TouchableOpacity, Linking, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMembersPage, getMemberTotalBalance, getChitsForMember, getMemberBalance, grantAppAccessSendOtp, grantAppAccessVerify, revokeAppAccess } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, fmtDate, Button, formatPhone } from '../../../components/ui';
import { toast } from '../../../components/Toast';

function MemberBalance({ memberId }: { memberId: string }) {
  const { data: bal } = useQuery({
    queryKey: ['m-member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId),
    staleTime: 120_000,
  });
  if (bal == null) return null;
  const num = Number(bal);
  return (
    <Text style={{ fontSize: 12, fontWeight: '600', color: num > 0 ? C.red : C.green, marginTop: 2 }}>
      {num > 0 ? `Owes ₹${num.toLocaleString('en-IN')}` : 'Paid up'}
    </Text>
  );
}

function ChitBalanceBadge({ memberId, chitId }: { memberId: string; chitId: string }) {
  const { data: balance } = useQuery({
    queryKey: ['m-chit-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId),
    staleTime: 60_000,
  });
  const outstanding = Number(balance?.totalOutstanding ?? 0);
  if (outstanding > 0) {
    return <Text style={{ fontSize: 11, fontWeight: '700', color: C.red }}>₹{outstanding.toLocaleString('en-IN')} due</Text>;
  }
  if (balance !== undefined) {
    return <Text style={{ fontSize: 11, fontWeight: '700', color: C.green }}>Clear ✓</Text>;
  }
  return null;
}

function MemberDetailModal({ member, onClose }: { member: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: chits = [] } = useQuery({
    queryKey: ['m-member-chits', member.id],
    queryFn: () => getChitsForMember(member.id),
    staleTime: 60_000,
  });
  const { data: totalBalance } = useQuery({
    queryKey: ['m-member-total-balance', member.id],
    queryFn: () => getMemberTotalBalance(member.id),
    staleTime: 60_000,
  });
  const bal = Number(totalBalance ?? 0);

  // OTP grant flow state
  const [grantStep, setGrantStep] = useState<'idle' | 'confirm' | 'otp'>('idle');
  const [grantMaskedPhone, setGrantMaskedPhone] = useState('');
  const [grantOtp, setGrantOtp] = useState('');
  const [grantError, setGrantError] = useState('');

  const grantSendOtpMut = useMutation({
    mutationFn: () => grantAppAccessSendOtp(member.id),
    onSuccess: (data: any) => { setGrantMaskedPhone(data?.maskedPhone ?? ''); setGrantStep('otp'); setGrantError(''); },
    onError: (e: any) => setGrantError(e.response?.data?.message ?? 'Failed to send OTP'),
  });

  const grantVerifyMut = useMutation({
    mutationFn: () => grantAppAccessVerify(member.id, grantOtp),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mgr-members-page'] });
      setGrantStep('idle'); setGrantOtp('');
      toast.success(member.fullName + ' now has app access');
    },
    onError: (e: any) => setGrantError(e.response?.data?.message ?? 'OTP incorrect or expired'),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeAppAccess(member.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mgr-members-page'] }); toast.success('App access revoked'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to revoke'),
  });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }} numberOfLines={1}>{member.fullName ?? member.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <Badge status={member.status ?? 'ACTIVE'} />
              {member.memberCode && <Text style={{ fontSize: 11, color: C.gray400 }}>#{member.memberCode}</Text>}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: C.gray100, borderRadius: 8 }}>
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Balance card */}
          {totalBalance !== undefined && (
            <Card style={{ marginBottom: 14, backgroundColor: bal > 0 ? '#FEF2F2' : '#F0FDF4', borderWidth: 1.5, borderColor: bal > 0 ? '#FECACA' : '#BBF7D0' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray500, marginBottom: 4 }}>OUTSTANDING BALANCE</Text>
              <Amount value={Math.abs(bal)} size="lg" color={bal > 0 ? C.red : C.green} />
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                {bal > 0 ? 'Member owes this amount' : bal < 0 ? 'Overpaid — credit balance' : 'No outstanding dues'}
              </Text>
            </Card>
          )}

          {/* Contact info */}
          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 10, letterSpacing: 0.5 }}>CONTACT INFO</Text>
            {member.phone && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: C.gray500, width: 64 }}>Phone</Text>
                <Text style={{ fontSize: 13, color: C.gray900, flex: 1 }}>
                  {member.phone.startsWith('+') ? member.phone : `+91 ${member.phone}`}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const num = member.phone.startsWith('+') ? member.phone : `+91${member.phone}`;
                    Linking.openURL(`tel:${num}`);
                  }}
                  style={{ backgroundColor: C.green + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1.5, borderColor: C.green }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.green }}>📞 Call</Text>
                </TouchableOpacity>
              </View>
            )}
            {member.email && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, color: C.gray500, width: 64 }}>Email</Text>
                <Text style={{ fontSize: 13, color: C.gray900 }}>{member.email}</Text>
              </View>
            )}
            {member.address && (
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: C.gray500, width: 64 }}>Address</Text>
                <Text style={{ fontSize: 13, color: C.gray900, flex: 1 }}>{member.address}</Text>
              </View>
            )}
            {member.joinedAt && (
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: C.gray500, width: 64 }}>Joined</Text>
                <Text style={{ fontSize: 13, color: C.gray900 }}>{fmtDate(member.joinedAt)}</Text>
              </View>
            )}
          </Card>

          {/* App access */}
          <Card style={{ marginBottom: 14, borderWidth: 1.5, borderColor: member.appAccessGranted ? '#86EFAC' : C.gray200 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900, marginBottom: 4 }}>
              {member.appAccessGranted ? 'App Access Active' : 'App Access'}
            </Text>
            {member.appAccessGranted ? (
              <Button label={revokeMut.isPending ? 'Revoking…' : 'Revoke App Access'} variant="danger" fullWidth loading={revokeMut.isPending}
                onPress={() => Alert.alert('Revoke Access', `${member.fullName} will no longer be able to log in. Revoke?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Revoke', style: 'destructive', onPress: () => revokeMut.mutate() },
                ])} />
            ) : grantStep === 'otp' ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, color: C.gray500, lineHeight: 18 }}>OTP sent to <Text style={{ fontWeight: '700' }}>{grantMaskedPhone}</Text>.{'\n'}Ask member to read out the 6-digit code.</Text>
                <TextInput
                  value={grantOtp}
                  onChangeText={(v) => { setGrantOtp(v.replace(/\D/g, '').slice(0, 6)); setGrantError(''); }}
                  placeholder="6-digit OTP" keyboardType="numeric" maxLength={6} autoFocus
                  style={{ borderWidth: 1, borderColor: grantError ? C.red : C.gray300, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 6, textAlign: 'center' }}
                />
                {grantError ? <Text style={{ fontSize: 12, color: C.red }}>{grantError}</Text> : null}
                <Button label={grantVerifyMut.isPending ? 'Verifying…' : 'Verify & Grant'} variant="primary" fullWidth loading={grantVerifyMut.isPending} disabled={grantOtp.length !== 6} onPress={() => grantVerifyMut.mutate()} />
                <TouchableOpacity onPress={() => { setGrantStep('idle'); setGrantOtp(''); setGrantError(''); }} style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 13, color: C.gray400 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : grantStep === 'confirm' ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, color: C.gray600, lineHeight: 18 }}>
                  Granting access to <Text style={{ fontWeight: '700' }}>{member.phone ? formatPhone(member.phoneCountryCode ?? '+91', member.phone) : 'this member'}</Text>.{'\n'}OTP will be sent — ask member to read it out.
                </Text>
                {grantError ? <Text style={{ fontSize: 12, color: C.red }}>{grantError}</Text> : null}
                <Button label={grantSendOtpMut.isPending ? 'Sending OTP…' : 'Send OTP'} variant="primary" fullWidth loading={grantSendOtpMut.isPending} onPress={() => grantSendOtpMut.mutate()} />
                <TouchableOpacity onPress={() => { setGrantStep('idle'); setGrantError(''); }} style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 13, color: C.gray400 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Button label="Grant App Access via OTP" variant="primary" fullWidth onPress={() => setGrantStep('confirm')} />
            )}
          </Card>

          {/* Enrolled chits */}
          {(chits as any[]).length > 0 && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, letterSpacing: 0.5, marginBottom: 10 }}>
                ENROLLED CHITS ({(chits as any[]).length})
              </Text>
              {(chits as any[]).map((chit: any) => (
                <Card key={chit.id} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>{chit.name}</Text>
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                        ₹{Number(chit.chitValue ?? 0).toLocaleString('en-IN')} · {chit.capacity} members
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge status={chit.status} />
                      <ChitBalanceBadge memberId={member.id} chitId={chit.id} />
                    </View>
                  </View>
                </Card>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function ManagerMembersScreen() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: membersInfinite, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['mgr-members-page', debouncedSearch],
    queryFn: ({ pageParam }) => getMembersPage({ page: pageParam as number, search: debouncedSearch, size: 30 }),
    getNextPageParam: (lastPage: any) => lastPage.last ? undefined : (lastPage.number + 1),
    initialPageParam: 0,
  });
  const members = membersInfinite?.pages.flatMap((p: any) => p.content) ?? [];
  const totalElements = membersInfinite?.pages[0]?.totalElements ?? 0;

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={members}
        keyExtractor={(m: any) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={T.h1}>Members</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2, marginBottom: 12 }}>
              {totalElements} total
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or phone…"
              placeholderTextColor={C.gray400}
              style={{
                backgroundColor: C.surface, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200,
                paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.gray900,
              }}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No members found" message="Try a different search." />}
        ListFooterComponent={isFetchingNextPage ? (
          <ActivityIndicator color={C.navy} style={{ marginVertical: 16 }} />
        ) : null}
        renderItem={({ item: m }) => (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setSelected(m)}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{m.fullName ?? m.name}</Text>
                  {m.phone && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{m.phone}</Text>}
                  {m.memberCode && <Text style={{ fontSize: 11, color: C.gray400 }}>#{m.memberCode}</Text>}
                  <MemberBalance memberId={m.id} />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge status={m.status} />
                  <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {selected && <MemberDetailModal member={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}
