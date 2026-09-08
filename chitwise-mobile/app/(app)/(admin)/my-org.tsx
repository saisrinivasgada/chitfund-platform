import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import {
  getOrgSettings, getBillingInfo, getMyTenantLimits, listStaff, getOrgReservations, realizeOrgPayout,
  updateOrgDetails, sendSupportNumberOtp, verifySupportNumber,
} from '../../../services/api';
import { toast } from '../../../components/Toast';

function LimitRow({ label, used, max }: { label: string; used?: number; max?: number }) {
  const pct = (max && used != null) ? Math.min((used / max) * 100, 100) : 0;
  const color = pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#16A34A';
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>{label}</Text>
        <Text style={{ fontSize: 12, color: C.gray500 }}>{used ?? 0} / {max ?? '∞'}</Text>
      </View>
      {max != null && (
        <View style={{ height: 4, backgroundColor: C.gray200, borderRadius: 2 }}>
          <View style={{ height: 4, width: `${pct}%` as any, backgroundColor: color, borderRadius: 2 }} />
        </View>
      )}
    </View>
  );
}

function EditableRow({
  label, value, field, onSave, saving,
}: {
  label: string; value?: string | null; field: string; onSave: (field: string, val: string) => void; saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() { setDraft(value ?? ''); setEditing(true); }
  function cancel() { setEditing(false); }
  function save() { onSave(field, draft.trim()); setEditing(false); }

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? 8 : 0 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400 }}>{label}</Text>
        {!editing && (
          <TouchableOpacity onPress={startEdit} style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.navy + '12', borderRadius: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy }}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={cancel} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: C.gray300, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray600 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: C.navy, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 14, fontWeight: '500', color: value ? C.gray900 : C.gray300, marginTop: 2 }}>
          {value || 'Not set'}
        </Text>
      )}
    </View>
  );
}

function SupportPhoneSection({ currentPhone }: { currentPhone?: string | null }) {
  const qc = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      await sendSupportNumberOtp(phone.trim());
      setOtpSent(true);
      toast.noted('OTP sent to ' + phone.trim());
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message ?? 'Failed to send OTP');
    } finally { setLoading(false); }
  }

  async function verifyOtp() {
    if (!otp.trim()) return;
    setLoading(true);
    try {
      await verifySupportNumber(phone.trim(), otp.trim());
      toast.saved('Support number updated');
      qc.invalidateQueries({ queryKey: ['org-settings'] });
      setChanging(false); setPhone(''); setOtp(''); setOtpSent(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message ?? 'Invalid OTP');
    } finally { setLoading(false); }
  }

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: changing ? 8 : 0 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400 }}>SUPPORT PHONE</Text>
        {!changing && (
          <TouchableOpacity onPress={() => setChanging(true)} style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.navy + '12', borderRadius: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.navy }}>Change</Text>
          </TouchableOpacity>
        )}
      </View>
      {!changing && (
        <Text style={{ fontSize: 14, fontWeight: '500', color: currentPhone ? C.gray900 : C.gray300, marginTop: 2 }}>
          {currentPhone || 'Not set'}
        </Text>
      )}
      {changing && (
        <View style={{ gap: 8 }}>
          {!otpSent ? (
            <>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 9876543210"
                keyboardType="phone-pad"
                autoFocus
                style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setChanging(false)} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: C.gray300, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray600 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={sendOtp} disabled={loading || !phone.trim()} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: C.navy, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{loading ? 'Sending…' : 'Send OTP'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 12, color: C.gray500 }}>OTP sent to {phone}</Text>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                placeholder="Enter OTP"
                keyboardType="number-pad"
                autoFocus
                style={{ borderWidth: 1.5, borderColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.gray900 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); }} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: C.gray300, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray600 }}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={verifyOtp} disabled={loading || !otp.trim()} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: C.navy, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{loading ? 'Verifying…' : 'Verify'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function MyOrgScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: org, isLoading: orgLoading } = useQuery({ queryKey: ['org-settings'], queryFn: getOrgSettings, staleTime: 120_000 });
  const { data: billing } = useQuery({ queryKey: ['m-billing'], queryFn: getBillingInfo, staleTime: 300_000 });
  const { data: limits } = useQuery({ queryKey: ['tenant-limits'], queryFn: getMyTenantLimits, staleTime: 120_000 });
  const { data: staff } = useQuery({ queryKey: ['org-staff-summary'], queryFn: listStaff, staleTime: 120_000 });
  const { data: orgSlots = [] } = useQuery({ queryKey: ['org-reservations'], queryFn: getOrgReservations, staleTime: 60_000 });

  const realizeMut = useMutation({
    mutationFn: ({ chitId, reservationId }: { chitId: string; reservationId: string }) => realizeOrgPayout(chitId, reservationId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-reservations'] }); Alert.alert('Success', 'Payout realized to treasury'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to realize payout'),
  });

  const updateMut = useMutation({
    mutationFn: updateOrgDetails,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-settings'] }); toast.saved('Saved'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to update'),
  });

  function handleSave(field: string, value: string) {
    const payload: any = {};
    if (field === 'orgName') payload.orgName = value;
    else if (field === 'businessRegNumber') payload.businessRegNumber = value;
    else if (field === 'address') payload.address = value;
    updateMut.mutate(payload);
  }

  const planExpiry = (billing as any)?.planExpiresAt;
  const isExpired = planExpiry && new Date(planExpiry) < new Date();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>My Organization</Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>Org details & subscription</Text>
        </View>
      </View>

      {orgLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Org banner */}
          <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 20, marginBottom: 16, shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 26 }}>🏢</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 }} numberOfLines={1}>
              {(org as any)?.orgName ?? (org as any)?.name ?? 'My Organization'}
            </Text>
            {(org as any)?.slug && (
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>chitwise.app/{(org as any).slug}</Text>
            )}
          </View>

          {/* Plan card */}
          <View style={{ backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Subscription</Text>
              <View style={{ backgroundColor: isExpired ? '#FEE2E2' : '#D1FAE5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isExpired ? '#DC2626' : '#059669' }}>
                  {isExpired ? 'EXPIRED' : 'ACTIVE'}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy, marginBottom: 4 }}>
              {(billing as any)?.planName ?? 'Starter'}
            </Text>
            {planExpiry && (
              <Text style={{ fontSize: 12, color: isExpired ? '#DC2626' : C.gray500 }}>
                {isExpired ? 'Expired on' : 'Renews on'}{' '}
                {new Date(planExpiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            )}
            {isExpired && (
              <TouchableOpacity onPress={() => router.push('/(app)/(admin)/billing' as any)}
                style={{ marginTop: 12, backgroundColor: '#DC2626', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Renew Plan</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Editable org details */}
          <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>DETAILS</Text>
            <EditableRow label="ORG NAME" value={(org as any)?.orgName ?? (org as any)?.name} field="orgName" onSave={handleSave} saving={updateMut.isPending} />
            <EditableRow label="BUSINESS REG NO." value={(org as any)?.businessRegNumber} field="businessRegNumber" onSave={handleSave} saving={updateMut.isPending} />
            <EditableRow label="ADDRESS" value={(org as any)?.hubAddress ?? (org as any)?.address} field="address" onSave={handleSave} saving={updateMut.isPending} />
            <SupportPhoneSection currentPhone={(org as any)?.supportPhoneNumber} />
            <View style={{ paddingVertical: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400 }}>SLUG</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: C.gray900, marginTop: 2 }}>{(org as any)?.slug ?? '—'}</Text>
            </View>
            {(org as any)?.city && (
              <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400 }}>CITY</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: C.gray900, marginTop: 2 }}>{(org as any).city}</Text>
              </View>
            )}
            <View style={{ height: 4 }} />
          </View>

          {/* Limits */}
          {limits && (
            <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>PLAN LIMITS</Text>
              <LimitRow label="Members"    used={(limits as any)?.currentMembers} max={(limits as any)?.maxMembers} />
              <LimitRow label="Chit Groups" used={(limits as any)?.currentChits}  max={(limits as any)?.maxChits} />
              <LimitRow label="Staff"      used={(limits as any)?.currentStaff}   max={(limits as any)?.maxStaff} />
              <View style={{ height: 4 }} />
            </View>
          )}

          {/* Team section */}
          {staff != null && (
            <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8 }}>TEAM</Text>
                <TouchableOpacity onPress={() => router.push('/(app)/(admin)/team' as any)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Manage →</Text>
                </TouchableOpacity>
              </View>
              {(staff as any[]).slice(0, 3).map((s: any) => {
                const roleColor: Record<string, string> = { ADMIN: C.navy, MANAGER: '#7C3AED', STAFF: '#059669', AGENT: '#D97706' };
                return (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.navy + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{(s.fullName || s.username || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{s.fullName || s.username}</Text>
                      <Text style={{ fontSize: 11, color: C.gray400 }}>@{s.username}</Text>
                    </View>
                    <View style={{ backgroundColor: (roleColor[s.role] ?? C.navy) + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: roleColor[s.role] ?? C.navy }}>{s.role}</Text>
                    </View>
                  </View>
                );
              })}
              {(staff as any[]).length > 3 && (
                <TouchableOpacity onPress={() => router.push('/(app)/(admin)/team' as any)} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.gray100 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>+{(staff as any[]).length - 3} more → View all</Text>
                </TouchableOpacity>
              )}
              {(staff as any[]).length === 0 && (
                <View style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.gray100 }}>
                  <Text style={{ fontSize: 13, color: C.gray400 }}>No team members yet</Text>
                  <TouchableOpacity onPress={() => router.push('/(app)/(admin)/team' as any)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>Add your first staff member →</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={{ height: 4 }} />
            </View>
          )}

          {/* Org Holdings */}
          {(orgSlots as any[]).length > 0 && (() => {
            const active = (orgSlots as any[]).filter((s: any) => s.status === 'RESERVED');
            const realized = (orgSlots as any[]).filter((s: any) => s.status === 'PROCESSED');
            return (
              <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8 }}>ORG HOLDINGS</Text>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{(orgSlots as any[]).length} slot{(orgSlots as any[]).length !== 1 ? 's' : ''}</Text>
                </View>
                {active.length > 0 && (
                  <>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8 }}>ACTIVE · {active.length}</Text>
                    {active.map((s: any) => {
                      const date = s.reservationMonth
                        ? new Date(s.reservationMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                        : '—';
                      return (
                        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2F8', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.navy + '20' }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>D{s.monthNumber}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{s.chitName ?? 'Unknown Chit'}</Text>
                            <Text style={{ fontSize: 11, color: C.gray500, marginTop: 1 }}>
                              Draw #{s.monthNumber} · {date}{s.payoutAmount ? ` · ₹${Number(s.payoutAmount).toLocaleString('en-IN')}` : ''}
                            </Text>
                          </View>
                          {s.eligibleToRealize ? (
                            <TouchableOpacity
                              onPress={() => Alert.alert('Realize Payout', `Realize ₹${Number(s.payoutAmount).toLocaleString('en-IN')} for Draw #${s.monthNumber} to treasury?`,
                                [{ text: 'Cancel', style: 'cancel' }, { text: 'Realize', onPress: () => realizeMut.mutate({ chitId: s.chitId, reservationId: s.id }) }])}
                              disabled={realizeMut.isPending}
                              style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{realizeMut.isPending ? '…' : 'Realize'}</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ fontSize: 11, color: C.gray400 }}>Pending</Text>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
                {realized.length > 0 && (
                  <>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8, marginTop: active.length > 0 ? 4 : 0 }}>REALIZED · {realized.length}</Text>
                    {realized.slice(0, 3).map((s: any) => (
                      <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: C.gray100, backgroundColor: C.gray50 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>D{s.monthNumber}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>{s.chitName ?? 'Unknown Chit'}</Text>
                          <Text style={{ fontSize: 11, color: C.green }}>✓ Realized</Text>
                        </View>
                        {s.payoutAmount && <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500 }}>₹{Number(s.payoutAmount).toLocaleString('en-IN')}</Text>}
                      </View>
                    ))}
                  </>
                )}
                <View style={{ height: 4 }} />
              </View>
            );
          })()}

          {/* Quick links */}
          {[
            { icon: '◎', label: 'Plan & Billing', sub: 'Manage subscription & credits', color: '#D97706', path: '/(app)/(admin)/billing' },
            { icon: '👥', label: 'Team Management', sub: 'Add and manage staff members', color: C.navy, path: '/(app)/(admin)/team' },
          ].map(({ icon, label, sub, color, path }) => (
            <TouchableOpacity key={path} onPress={() => router.push(path as any)} activeOpacity={0.8}
              style={{ backgroundColor: C.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.gray100, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{icon}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{label}</Text>
                  <Text style={{ fontSize: 12, color: C.gray400 }}>{sub}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
            </TouchableOpacity>
          ))}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
