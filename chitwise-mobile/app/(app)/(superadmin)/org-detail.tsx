import { useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminGetTenant,
  superAdminListOrgUsers,
  superAdminListOrgChits,
  superAdminActivateTenant,
  superAdminSuspendTenant,
  superAdminSetTenantStatus,
  superAdminReactivateTenant,
  superAdminUpdatePlan,
  superAdminUpdateTenant,
  superAdminAddOrgUser,
  superAdminListRenewalRequests,
  superAdminListUpgradeRequests,
  superAdminClearRenewalRequest,
  billingRecordPayment,
  superAdminGetEffectiveLimits,
  superAdminSetCustomLimits,
  superAdminListCapabilities,
  superAdminListPlans,
  superAdminSetPlanExpiry,
  superAdminCancelTenant,
  superAdminResumeTenant,
  superAdminGetDiscount,
  superAdminSetDiscount,
  superAdminRemoveDiscount,
  superAdminRemoveCustomLimits,
  resetMemberPassword,
  lockUser,
  unlockUser,
} from '../../../services/api';
import { C, T, Badge, fmtDate, Input, Button } from '../../../components/ui';
import { toast } from '../../../components/Toast';

type AlertType = 'EXPIRED' | 'PENDING' | 'RENEWAL' | 'UPGRADE' | 'EXPIRING';
const ALERT_META: Record<AlertType, { label: string; dot: string; bg: string; text: string }> = {
  EXPIRED:  { label: 'Expired',       dot: '#DC2626', bg: '#FEF2F2', text: '#991B1B' },
  PENDING:  { label: 'Pending',       dot: '#F59E0B', bg: '#FFFBEB', text: '#92400E' },
  RENEWAL:  { label: 'Renewal Req',   dot: '#EA580C', bg: '#FFF7ED', text: '#9A3412' },
  UPGRADE:  { label: 'Upgrade Req',   dot: '#2563EB', bg: '#EFF6FF', text: '#1E40AF' },
  EXPIRING: { label: 'Expiring Soon', dot: '#D97706', bg: '#FFFBEB', text: '#92400E' },
};

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  BASIC:      { bg: C.gray100,  text: C.gray600 },
  PRO:        { bg: '#DBEAFE',  text: '#2563EB' },
  ENTERPRISE: { bg: '#EDE9FE',  text: '#7C3AED' },
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  ADMIN:   { bg: '#FEF3C7',  text: '#D97706' },
  MANAGER: { bg: '#DBEAFE',  text: '#2563EB' },
  STAFF:   { bg: '#D1FAE5',  text: '#059669' },
  MEMBER:  { bg: C.gray100,  text: C.gray600 },
};

const CHIT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE:    { bg: '#D1FAE5', text: '#059669' },
  DRAFT:     { bg: C.gray100, text: C.gray500 },
  COMPLETED: { bg: C.navy50,  text: C.navy },
  PAUSED:    { bg: '#FEF3C7', text: '#D97706' },
  CANCELLED: { bg: '#FEE2E2', text: C.red },
};

export default function OrgDetailPage() {
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'chits'>('users');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [reactivateSlug, setReactivateSlug] = useState('');
  const [showCustomLimits, setShowCustomLimits] = useState(false);
  const [showSetExpiry, setShowSetExpiry] = useState(false);
  const [showSetDiscount, setShowSetDiscount] = useState(false);
  // Credentials surfaced after a password reset — shown once, never re-fetchable.
  const [resetCreds, setResetCreds] = useState<{ username: string; password: string } | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const { data: org, isLoading: orgLoading, refetch: refetchOrg } = useQuery({
    queryKey: ['sa-org', tenantId],
    queryFn: () => superAdminGetTenant(tenantId!),
    enabled: !!tenantId,
  });
  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['sa-org-users', tenantId],
    queryFn: () => superAdminListOrgUsers(tenantId!),
    enabled: !!tenantId,
  });
  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({
    queryKey: ['sa-org-chits', tenantId],
    queryFn: () => superAdminListOrgChits(tenantId!),
    enabled: !!tenantId,
  });
  const { data: allRenewals = [], refetch: refetchRenewals } = useQuery({
    queryKey: ['sa-renewals'],
    queryFn: superAdminListRenewalRequests,
    staleTime: 60_000,
  });
  const { data: allUpgrades = [], refetch: refetchUpgrades } = useQuery({
    queryKey: ['sa-upgrades'],
    queryFn: superAdminListUpgradeRequests,
    staleTime: 60_000,
  });
  const { data: effectiveLimits, refetch: refetchLimits } = useQuery({
    queryKey: ['sa-org-limits', tenantId],
    queryFn: () => superAdminGetEffectiveLimits(tenantId!),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: superAdminListPlans,
    staleTime: 300_000,
  });
  const { data: capDefs = [] } = useQuery({
    queryKey: ['super-capabilities'],
    queryFn: superAdminListCapabilities,
    staleTime: 300_000,
  });
  const { data: discount, refetch: refetchDiscount } = useQuery({
    queryKey: ['sa-org-discount', tenantId],
    queryFn: () => superAdminGetDiscount(tenantId!),
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const activateMut = useMutation({
    mutationFn: () => superAdminActivateTenant(tenantId!),
    onSuccess: () => { refetchOrg(); toast.saved('Org activated'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const suspendMut = useMutation({
    mutationFn: () => superAdminSuspendTenant(tenantId!),
    onSuccess: () => { refetchOrg(); toast.cancelled('Org suspended'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const rejectMut = useMutation({
    mutationFn: () => superAdminSetTenantStatus(tenantId!, 'REJECTED'),
    onSuccess: () => { refetchOrg(); toast.cancelled('Registration rejected'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const reactivateMut = useMutation({
    mutationFn: (slug?: string) => superAdminReactivateTenant(tenantId!, slug),
    onSuccess: () => { refetchOrg(); setShowReactivate(false); toast.saved('Reactivated — now pending'); },
    onError: (e: any) => Alert.alert('Slug Conflict', e.response?.data?.message ?? 'Failed to reactivate'),
  });
  const planMut = useMutation({
    mutationFn: (plan: string) => superAdminUpdatePlan(tenantId!, plan),
    onSuccess: (_d, plan) => { refetchOrg(); setShowPlanMenu(false); toast.saved(`Plan → ${plan}`); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const clearRenewalMut = useMutation({
    mutationFn: () => superAdminClearRenewalRequest(tenantId!),
    onSuccess: () => { refetchRenewals(); toast.saved('Renewal cleared'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const recordPaymentMut = useMutation({
    mutationFn: ({ amount, method, pType }: { amount: string; method: string; pType: string }) =>
      billingRecordPayment({ tenantId: tenantId!, amountPaise: Math.round(Number(amount) * 100), paymentMethod: method, type: pType }),
    onSuccess: () => { setShowRecordPayment(false); refetchOrg(); toast.saved('Payment recorded'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const setExpiryMut = useMutation({
    mutationFn: (expiresAt: string) => superAdminSetPlanExpiry(tenantId!, expiresAt),
    onSuccess: () => { refetchOrg(); setShowSetExpiry(false); toast.saved('Plan expiry updated'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to set expiry'),
  });
  const cancelTenantMut = useMutation({
    mutationFn: () => superAdminCancelTenant(tenantId!),
    onSuccess: () => { refetchOrg(); toast.cancelled('Cancellation scheduled — access continues until plan expires'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to schedule cancellation'),
  });
  const resumeTenantMut = useMutation({
    mutationFn: () => superAdminResumeTenant(tenantId!),
    onSuccess: () => { refetchOrg(); toast.saved('Subscription resumed'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to resume subscription'),
  });
  const setDiscountMut = useMutation({
    mutationFn: (body: any) => superAdminSetDiscount(tenantId!, body),
    onSuccess: () => { refetchDiscount(); refetchOrg(); setShowSetDiscount(false); toast.saved('Discount saved'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to save discount'),
  });
  const removeDiscountMut = useMutation({
    mutationFn: () => superAdminRemoveDiscount(tenantId!),
    onSuccess: () => { refetchDiscount(); refetchOrg(); toast.cancelled('Discount removed'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to remove discount'),
  });
  const removeCustomLimitsMut = useMutation({
    mutationFn: () => superAdminRemoveCustomLimits(tenantId!, 'BASIC'),
    onSuccess: () => { refetchLimits(); refetchOrg(); setShowPlanMenu(false); toast.saved('Custom limits removed — reverted to BASIC'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to remove custom limits'),
  });
  const resetPwdMut = useMutation({
    mutationFn: (userId: string) => resetMemberPassword(userId),
    onSuccess: (res: any) => { setResetCreds({ username: res?.username ?? '—', password: res?.tempPassword ?? '—' }); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to reset password'),
    onSettled: () => setBusyUserId(null),
  });
  const lockMut = useMutation({
    mutationFn: ({ userId, locked }: { userId: string; locked: boolean }) =>
      locked ? unlockUser(userId) : lockUser(userId),
    onSuccess: (_d, v) => { refetchUsers(); toast.saved(v.locked ? 'Account unlocked' : 'Account locked'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
    onSettled: () => setBusyUserId(null),
  });

  function onRefresh() { refetchOrg(); refetchUsers(); refetchChits(); refetchRenewals(); refetchUpgrades(); refetchLimits(); refetchDiscount(); }

  const orgData = org as any;

  // Build alerts for this specific tenant
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const orgAlerts: { type: AlertType; label?: string }[] = [];
  if (orgData?.status === 'PENDING') orgAlerts.push({ type: 'PENDING' });
  const exp = orgData?.planExpiresAt ?? orgData?.currentPeriodEnd;
  if (exp && new Date(exp) < now && orgData?.status === 'ACTIVE') {
    orgAlerts.push({ type: 'EXPIRED' });
  } else if (exp && new Date(exp) > now && new Date(exp) < soon && orgData?.status === 'ACTIVE') {
    orgAlerts.push({ type: 'EXPIRING' });
  }
  const hasRenewal = (allRenewals as any[]).some((r: any) => r.tenantId === tenantId);
  if (hasRenewal) orgAlerts.push({ type: 'RENEWAL' });
  const upgradeReq = (allUpgrades as any[]).find((r: any) => r.tenantId === tenantId);
  if (upgradeReq) orgAlerts.push({ type: 'UPGRADE', label: upgradeReq.toPlan });
  const userList = users as any[];
  const chitList = chits as any[];

  const roleCounts = {
    ADMIN:   userList.filter((u) => u.role === 'ADMIN').length,
    MANAGER: userList.filter((u) => u.role === 'MANAGER').length,
    STAFF:   userList.filter((u) => u.role === 'STAFF' || u.role === 'WORKER').length,
    MEMBER:  userList.filter((u) => u.role === 'MEMBER').length,
  };

  if (orgLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.navy} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <Text style={T.h2} numberOfLines={1}>{orgData?.name ?? 'Organization'}</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={orgLoading || usersLoading || chitsLoading} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={{
          backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 16,
          shadowColor: C.navy, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white }}>{orgData?.name?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.white }} numberOfLines={1}>{orgData?.name}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Courier', marginTop: 2 }}>@{orgData?.slug}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowRename(true)}
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10 }}
            >
              <Text style={{ fontSize: 16 }}>✏️</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
              backgroundColor: orgData?.status === 'ACTIVE' ? '#D1FAE5' : orgData?.status === 'SUSPENDED' ? '#FEE2E2' : orgData?.status === 'REJECTED' ? '#F3F4F6' : '#FEF3C7',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: orgData?.status === 'ACTIVE' ? '#059669' : orgData?.status === 'SUSPENDED' ? C.red : orgData?.status === 'REJECTED' ? '#6B7280' : '#D97706' }}>
                {orgData?.status}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.white }}>{orgData?.plan ?? 'BASIC'}</Text>
            </View>
            {orgData?.contactEmail && (
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} numberOfLines={1}>{orgData.contactEmail}</Text>
            )}
          </View>
        </View>

        {/* Quick stats */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Admins',   value: roleCounts.ADMIN,   color: '#D97706' },
            { label: 'Managers', value: roleCounts.MANAGER, color: '#2563EB' },
            { label: 'Staff',    value: roleCounts.STAFF,   color: '#059669' },
            { label: 'Members',  value: roleCounts.MEMBER,  color: C.navy },
          ].map(({ label, value, color }) => (
            <View key={label} style={{ flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color, marginTop: 2 }}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {orgData?.status === 'REJECTED' ? (
            <TouchableOpacity
              onPress={() => { setReactivateSlug(orgData?.slug ?? ''); setShowReactivate(true); }}
              style={{ flex: 1, backgroundColor: '#D1FAE5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>Reactivate</Text>
            </TouchableOpacity>
          ) : orgData?.status !== 'ACTIVE' ? (
            <TouchableOpacity
              onPress={() => activateMut.mutate()}
              disabled={activateMut.isPending}
              style={{ flex: 1, backgroundColor: '#D1FAE5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>
                {activateMut.isPending ? 'Activating…' : 'Activate'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {orgData?.status === 'PENDING' && (
            <TouchableOpacity
              onPress={() => Alert.alert('Reject Request', `Reject ${orgData?.name}? The slug will be freed for others.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => rejectMut.mutate() },
              ])}
              disabled={rejectMut.isPending}
              style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280' }}>
                {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
              </Text>
            </TouchableOpacity>
          )}
          {orgData?.status !== 'SUSPENDED' && orgData?.status !== 'REJECTED' && (
            <TouchableOpacity
              onPress={() => Alert.alert('Suspend Org', `Suspend ${orgData?.name}? Members won't be able to log in.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Suspend', style: 'destructive', onPress: () => suspendMut.mutate() },
              ])}
              disabled={suspendMut.isPending}
              style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>
                {suspendMut.isPending ? 'Suspending…' : 'Suspend'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowPlanMenu(true)}
            style={{ flex: 1, backgroundColor: C.navy50, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Change Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowCustomLimits(true)}
            style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>Set Limits</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowSetExpiry(true)}
            style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>Set Expiry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAddUser(true)}
            style={{ flex: 1, backgroundColor: C.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>+ User</Text>
          </TouchableOpacity>
          {orgData?.status === 'ACTIVE' && (
            orgData?.cancellationRequestedAt ? (
              <TouchableOpacity
                onPress={() => resumeTenantMut.mutate()}
                disabled={resumeTenantMut.isPending}
                style={{ flex: 1, backgroundColor: C.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.white }}>
                  {resumeTenantMut.isPending ? 'Resuming…' : 'Resume Sub'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Schedule Cancellation',
                  `Schedule cancellation for ${orgData?.name}? They keep access until the plan expires.`,
                  [
                    { text: 'Keep Plan', style: 'cancel' },
                    { text: 'Schedule', style: 'destructive', onPress: () => cancelTenantMut.mutate() },
                  ],
                )}
                disabled={cancelTenantMut.isPending}
                style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>
                  {cancelTenantMut.isPending ? 'Scheduling…' : 'Cancel Sub'}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        {/* Cancellation-pending banner */}
        {orgData?.cancellationRequestedAt && (
          <View style={{
            backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14,
            padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <Text style={{ fontSize: 20 }}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>Cancellation scheduled</Text>
              <Text style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                Access continues until {fmtDate(orgData?.planExpiresAt) ?? 'plan expiry'}.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => resumeTenantMut.mutate()}
              disabled={resumeTenantMut.isPending}
              style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.white }}>
                {resumeTenantMut.isPending ? '…' : 'Resume'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Org discount */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 16,
          borderWidth: 1, borderColor: C.gray100,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700 }}>Org Discount</Text>
            {discount ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setShowSetDiscount(true)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Remove Discount', 'Remove this org discount?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeDiscountMut.mutate() },
                ])}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.red }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowSetDiscount(true)}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>+ Set</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: discount ? '#059669' : C.gray400, marginTop: 6 }}>
            {discount
              ? ((discount as any).discountType === 'FIXED_PAISE'
                  ? `₹${(Number((discount as any).discountValue) / 100).toLocaleString('en-IN')} off`
                  : `${Number((discount as any).discountValue)}% off`)
              : 'None'}
          </Text>
          {discount && (discount as any).reason && (
            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{(discount as any).reason}</Text>
          )}
          {discount && (discount as any).expiresAt && (
            <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
              Expires {fmtDate((discount as any).expiresAt)}
            </Text>
          )}
        </View>

        {/* Plan usage bars */}
        {effectiveLimits && (
          <View style={{ backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.gray100 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700 }}>Plan Usage</Text>
              {(effectiveLimits as any).hasCustomLimits && (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>CUSTOM LIMITS</Text>
                </View>
              )}
            </View>
            {[
              { label: 'Active Chits', used: (effectiveLimits as any).activeChitsCount ?? 0, max: (effectiveLimits as any).maxActiveChits },
              { label: 'Members',      used: (effectiveLimits as any).memberCount ?? 0,      max: (effectiveLimits as any).maxMembers },
              { label: 'Staff',        used: (effectiveLimits as any).staffCount ?? 0,       max: (effectiveLimits as any).maxStaff },
            ].map(({ label, used, max }) => {
              const unlimited = max === -1 || max == null;
              const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
              const over = !unlimited && used >= max;
              return (
                <View key={label} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: C.gray600 ?? C.gray500 }}>{label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: over ? C.red : C.gray700 }}>
                      {used} / {unlimited ? '∞' : max}
                    </Text>
                  </View>
                  {!unlimited && (
                    <View style={{ height: 6, backgroundColor: C.gray100, borderRadius: 3 }}>
                      <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: over ? C.red : pct > 80 ? '#D97706' : '#059669', borderRadius: 3 }} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Alerts for this org */}
        {orgAlerts.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8 }}>ALERTS</Text>
            {orgAlerts.map((alert, i) => {
              const meta = ALERT_META[alert.type];
              return (
                <View key={`${alert.type}-${i}`} style={{
                  backgroundColor: meta.bg, borderRadius: 14, padding: 14, marginBottom: 8,
                  borderLeftWidth: 4, borderLeftColor: meta.dot,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: meta.text }}>{meta.label}</Text>
                      {alert.type === 'EXPIRED' && exp && (
                        <Text style={{ fontSize: 12, color: meta.text, opacity: 0.7, marginTop: 2 }}>
                          Expired {fmtDate(exp)}
                        </Text>
                      )}
                      {alert.type === 'EXPIRING' && exp && (
                        <Text style={{ fontSize: 12, color: meta.text, opacity: 0.7, marginTop: 2 }}>
                          Expires {fmtDate(exp)}
                        </Text>
                      )}
                      {alert.type === 'UPGRADE' && alert.label && (
                        <Text style={{ fontSize: 12, color: meta.text, opacity: 0.7, marginTop: 2 }}>
                          Requested: {orgData?.plan} → {alert.label}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {alert.type === 'PENDING' && (
                      <TouchableOpacity
                        onPress={() => Alert.alert('Activate Org', `Activate "${orgData?.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Activate', onPress: () => activateMut.mutate() },
                        ])}
                        style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                          {activateMut.isPending ? 'Activating…' : 'Activate'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(alert.type === 'EXPIRED' || alert.type === 'EXPIRING' || alert.type === 'UPGRADE' || alert.type === 'RENEWAL') && (
                      <TouchableOpacity
                        onPress={() => setShowRecordPayment(true)}
                        style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Record Payment</Text>
                      </TouchableOpacity>
                    )}
                    {alert.type === 'RENEWAL' && (
                      <TouchableOpacity
                        onPress={() => clearRenewalMut.mutate()}
                        style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: meta.text }}>
                          {clearRenewalMut.isPending ? 'Clearing…' : 'Dismiss'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Tabs */}
        <View style={{ flexDirection: 'row', backgroundColor: C.gray100, borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {(['users', 'chits'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10,
                backgroundColor: activeTab === tab ? C.white : 'transparent',
                shadowColor: activeTab === tab ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === tab ? C.navy : C.gray500 }}>
                {tab === 'users' ? `Users (${userList.length})` : `Chits (${chitList.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Users list */}
        {activeTab === 'users' && (
          usersLoading ? (
            <ActivityIndicator color={C.navy} style={{ marginTop: 20 }} />
          ) : userList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>👥</Text>
              <Text style={{ color: C.gray400 }}>No users yet</Text>
            </View>
          ) : (
            userList.map((u: any) => (
              <View key={u.userId ?? u.id} style={{
                backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 8,
                borderWidth: 1, borderColor: C.gray200,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 10,
                    backgroundColor: ROLE_COLORS[u.role]?.bg ?? C.gray100,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: ROLE_COLORS[u.role]?.text ?? C.gray600 }}>
                      {u.fullName?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{u.fullName}</Text>
                      <View style={{ backgroundColor: ROLE_COLORS[u.role]?.bg ?? C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: ROLE_COLORS[u.role]?.text ?? C.gray600 }}>{u.role}</Text>
                      </View>
                      {!u.enabled && (
                        <View style={{ backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: C.red }}>DISABLED</Text>
                        </View>
                      )}
                      {u.locked && (
                        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>LOCKED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>@{u.username}</Text>
                    {u.phone && <Text style={{ fontSize: 12, color: C.gray400 }}>{u.phone}</Text>}
                    {u.email && <Text style={{ fontSize: 12, color: C.gray400 }}>{u.email}</Text>}
                  </View>
                </View>
                {u.joinedAt && (
                  <Text style={{ fontSize: 11, color: C.gray300, marginTop: 8, textAlign: 'right' }}>
                    Joined {fmtDate(u.joinedAt)}
                  </Text>
                )}

                {/* Per-user actions */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                  <TouchableOpacity
                    onPress={() => Alert.alert(
                      'Reset Password',
                      `Reset the password for ${u.fullName}? A temporary password will be generated.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Reset', style: 'destructive', onPress: () => { setBusyUserId(u.userId ?? u.id); resetPwdMut.mutate(u.userId ?? u.id); } },
                      ],
                    )}
                    disabled={busyUserId === (u.userId ?? u.id)}
                    style={{ flex: 1, backgroundColor: C.gray100, borderRadius: 9, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700 }}>
                      {busyUserId === (u.userId ?? u.id) && resetPwdMut.isPending ? '…' : 'Reset Password'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setBusyUserId(u.userId ?? u.id); lockMut.mutate({ userId: u.userId ?? u.id, locked: !!u.locked }); }}
                    disabled={busyUserId === (u.userId ?? u.id)}
                    style={{
                      flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center',
                      backgroundColor: u.locked ? '#D1FAE5' : '#FEE2E2',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: u.locked ? '#059669' : C.red }}>
                      {busyUserId === (u.userId ?? u.id) && lockMut.isPending ? '…' : u.locked ? 'Unlock' : 'Lock'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        )}

        {/* Chits list */}
        {activeTab === 'chits' && (
          chitsLoading ? (
            <ActivityIndicator color={C.navy} style={{ marginTop: 20 }} />
          ) : chitList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
              <Text style={{ color: C.gray400 }}>No chits yet</Text>
            </View>
          ) : (
            chitList.map((c: any) => {
              const sc = CHIT_STATUS_COLORS[c.status] ?? { bg: C.gray100, text: C.gray500 };
              return (
                <View key={c.id} style={{
                  backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 8,
                  borderWidth: 1, borderColor: C.gray200,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{c.name}</Text>
                      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{c.type}</Text>
                    </View>
                    <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: sc.text }}>{c.status}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, fontWeight: '600' }}>VALUE</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>₹{Number(c.totalValue ?? 0).toLocaleString('en-IN')}</Text>
                    </View>
                    {c.totalSeats != null && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400, fontWeight: '600' }}>SEATS</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{c.enrolledCount ?? 0}/{c.totalSeats}</Text>
                      </View>
                    )}
                    {c.durationMonths != null && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400, fontWeight: '600' }}>DURATION</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{c.durationMonths}m</Text>
                      </View>
                    )}
                    {c.startDate && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400, fontWeight: '600' }}>STARTED</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{fmtDate(c.startDate)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )
        )}
      </ScrollView>

      {/* Plan picker modal */}
      <Modal visible={showPlanMenu} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{
            backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
            paddingBottom: 40,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy, marginBottom: 16 }}>Change Plan</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 16 }}>
              Current plan: <Text style={{ fontWeight: '700', color: C.navy }}>{orgData?.plan ?? 'BASIC'}</Text>
            </Text>
            {['BASIC', 'PRO', 'ENTERPRISE'].filter((p) => p !== orgData?.plan).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => planMut.mutate(p)}
                disabled={planMut.isPending}
                style={{
                  backgroundColor: PLAN_COLORS[p]?.bg, borderRadius: 14, padding: 16, marginBottom: 10,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: PLAN_COLORS[p]?.text }}>
                  Upgrade to {p}
                </Text>
                {planMut.isPending ? <ActivityIndicator size="small" color={PLAN_COLORS[p]?.text} /> : <Text style={{ color: PLAN_COLORS[p]?.text }}>→</Text>}
              </TouchableOpacity>
            ))}
            {(effectiveLimits as any)?.hasCustomLimits && (
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Remove Custom Limits',
                  'Remove this org’s custom limits and revert it to the BASIC plan?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeCustomLimitsMut.mutate() },
                  ],
                )}
                disabled={removeCustomLimitsMut.isPending}
                style={{ borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 14, padding: 16, marginBottom: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.red }}>
                  {removeCustomLimitsMut.isPending ? 'Removing…' : 'Remove Custom Limits'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowPlanMenu(false)} style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={{ color: C.gray400, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add user modal */}
      {showAddUser && (
        <AddUserModal
          tenantId={tenantId!}
          onClose={() => setShowAddUser(false)}
          onAdded={() => { setShowAddUser(false); refetchUsers(); }}
        />
      )}

      {/* Rename modal */}
      {showRename && (
        <RenameModal
          tenantId={tenantId!}
          currentName={orgData?.name ?? ''}
          currentSlug={orgData?.slug ?? ''}
          onClose={() => setShowRename(false)}
          onRenamed={() => { setShowRename(false); refetchOrg(); }}
        />
      )}

      {/* Record payment for alerts */}
      <RecordPaymentModal
        visible={showRecordPayment}
        orgName={orgData?.name ?? ''}
        orgPlan={orgData?.plan ?? ''}
        onClose={() => setShowRecordPayment(false)}
        onRecord={(amount, method, pType) => recordPaymentMut.mutate({ amount, method, pType })}
        loading={recordPaymentMut.isPending}
      />

      {/* Custom limits modal */}
      {showCustomLimits && (
        <SetCustomLimitsModal
          tenantId={tenantId!}
          existing={effectiveLimits as any}
          plans={plans as any[]}
          capDefs={capDefs as any[]}
          onClose={() => setShowCustomLimits(false)}
          onSaved={() => { setShowCustomLimits(false); refetchOrg(); refetchLimits(); toast.saved('Custom limits saved'); }}
        />
      )}

      {/* Reactivate modal */}
      <Modal visible={showReactivate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReactivate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.gray200 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Reactivate Registration</Text>
            <TouchableOpacity onPress={() => setShowReactivate(false)}>
              <Text style={{ fontSize: 24, color: C.gray400 }}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 14, color: C.gray500, lineHeight: 20 }}>
              Reactivating <Text style={{ fontWeight: '700', color: C.navy }}>{orgData?.name}</Text> will move it back to PENDING. Verify the subdomain is available.
            </Text>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Subdomain</Text>
              <TextInput
                value={reactivateSlug}
                onChangeText={t => setReactivateSlug(t.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'monospace', color: C.navy }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {reactivateSlug !== (orgData?.slug ?? '') && (
                <Text style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>
                  Changed from original: {orgData?.slug}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => reactivateMut.mutate(reactivateSlug !== orgData?.slug ? reactivateSlug : undefined)}
              disabled={reactivateMut.isPending || !reactivateSlug}
              style={{ backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: reactivateMut.isPending ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {reactivateMut.isPending ? 'Reactivating…' : 'Reactivate'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Set plan expiry */}
      {showSetExpiry && (
        <SetExpiryModal
          currentExpiry={orgData?.planExpiresAt}
          saving={setExpiryMut.isPending}
          onClose={() => setShowSetExpiry(false)}
          onSave={(iso) => setExpiryMut.mutate(iso)}
        />
      )}

      {/* Set org discount */}
      {showSetDiscount && (
        <SetDiscountModal
          existing={discount as any}
          saving={setDiscountMut.isPending}
          onClose={() => setShowSetDiscount(false)}
          onSave={(body) => setDiscountMut.mutate(body)}
        />
      )}

      {/* Credentials after a password reset — shown once */}
      <Modal visible={!!resetCreds} animationType="fade" transparent onRequestClose={() => setResetCreds(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Password Reset</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 4 }}>
              Share these credentials with the user — they won't be shown again.
            </Text>
            {[
              { label: 'Username', value: resetCreds?.username },
              { label: 'Temporary password', value: resetCreds?.password },
            ].map(({ label, value }) => (
              <View key={label} style={{ marginTop: 14, backgroundColor: C.gray50, borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400 }}>{label.toUpperCase()}</Text>
                <Text selectable style={{ fontSize: 16, fontWeight: '700', color: C.navy, fontFamily: 'monospace', marginTop: 3 }}>
                  {value}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              onPress={() => setResetCreds(null)}
              style={{ marginTop: 18, backgroundColor: C.navy, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.white }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Set plan expiry ───────────────────────────────────────────────────────────
function SetExpiryModal({ currentExpiry, saving, onClose, onSave }: {
  currentExpiry?: string; saving: boolean; onClose: () => void; onSave: (iso: string) => void;
}) {
  function toInput(d?: string) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }
  function plus30() { return new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10); }

  const [date, setDate] = useState(currentExpiry ? toInput(currentExpiry) : plus30());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Set Plan Expiry</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 24, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 16 }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Expiry date (YYYY-MM-DD)</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2026-12-31"
              placeholderTextColor={C.gray400}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.navy }}
            />
            {currentExpiry && (
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                Currently expires {fmtDate(currentExpiry)}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: '+30 days', days: 30 },
              { label: '+90 days', days: 90 },
              { label: '+1 year', days: 365 },
            ].map(({ label, days }) => (
              <TouchableOpacity
                key={label}
                onPress={() => setDate(new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10))}
                style={{ flex: 1, backgroundColor: C.gray100, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => onSave(`${date}T00:00:00`)}
            disabled={!valid || saving}
            style={{ backgroundColor: C.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: !valid || saving ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Save Expiry'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Set org discount ──────────────────────────────────────────────────────────
function SetDiscountModal({ existing, saving, onClose, onSave }: {
  existing?: any; saving: boolean; onClose: () => void; onSave: (body: any) => void;
}) {
  const [dType, setDType] = useState<'PERCENTAGE' | 'FIXED_PAISE'>(existing?.discountType ?? 'PERCENTAGE');
  const [value, setValue] = useState(
    existing
      ? (existing.discountType === 'FIXED_PAISE'
          ? String(Number(existing.discountValue) / 100)
          : String(existing.discountValue))
      : '',
  );
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ? String(existing.expiresAt).slice(0, 10) : '');
  const valid = Number(value) > 0;

  function save() {
    // Fixed discounts are stored in paise; percentages are stored as-is.
    onSave({
      discountType: dType,
      discountValue: dType === 'FIXED_PAISE' ? Number(value) * 100 : Number(value),
      reason: reason.trim() || null,
      expiresAt: expiresAt ? `${expiresAt}T00:00:00` : null,
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>{existing ? 'Edit' : 'Set'} Discount</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 24, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Discount type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['PERCENTAGE', '% Percent'], ['FIXED_PAISE', '₹ Fixed']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setDType(val)}
                  style={{
                    flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: dType === val ? C.navy : C.gray200,
                    backgroundColor: dType === val ? C.navy50 : C.white,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: dType === val ? C.navy : C.gray500 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>
              {dType === 'PERCENTAGE' ? 'Percent off' : 'Amount off (₹)'}
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              placeholder={dType === 'PERCENTAGE' ? '20' : '500'}
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.navy }}
            />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Loyalty discount"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.navy }}
            />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 }}>Expires on (optional, YYYY-MM-DD)</Text>
            <TextInput
              value={expiresAt}
              onChangeText={setExpiresAt}
              placeholder="2026-12-31"
              placeholderTextColor={C.gray400}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.navy }}
            />
          </View>
          <TouchableOpacity
            onPress={save}
            disabled={!valid || saving}
            style={{ backgroundColor: C.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: !valid || saving ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Save Discount'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Record Payment Modal ───────────────────────────────────────────────────────
function RecordPaymentModal({ visible, orgName, orgPlan, onClose, onRecord, loading }: {
  visible: boolean;
  orgName: string;
  orgPlan: string;
  onClose: () => void;
  onRecord: (amount: string, method: string, pType: string) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [pType, setPType] = useState('RENEWAL');

  const METHODS = ['UPI', 'CASH', 'BANK_TRANSFER'];
  const TYPES   = ['PURCHASE', 'RENEWAL', 'UPGRADE', 'REFUND'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Record Payment</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ backgroundColor: C.navy50, borderRadius: 12, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{orgName}</Text>
            <Text style={{ fontSize: 12, color: C.gray500 }}>Plan: {orgPlan}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Amount (₹)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {['500', '1000', '2000', '5000'].map((v) => (
                <TouchableOpacity key={v} onPress={() => setAmount(v)}
                  style={{ backgroundColor: amount === v ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: amount === v ? '#fff' : C.gray700 }}>₹{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Payment Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t} onPress={() => setPType(t)}
                  style={{ backgroundColor: pType === t ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: pType === t ? '#fff' : C.gray700 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Payment Method</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {METHODS.map((m) => (
                <TouchableOpacity key={m} onPress={() => setMethod(m)}
                  style={{ backgroundColor: method === m ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: method === m ? '#fff' : C.gray700 }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <TouchableOpacity
            onPress={() => onRecord(amount, method, pType)}
            disabled={loading || !amount}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (loading || !amount) ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {loading ? 'Recording…' : 'Record Payment'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Add User Modal ─────────────────────────────────────────────────────────────
function AddUserModal({ tenantId, onClose, onAdded }: {
  tenantId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone]     = useState('');
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState('MANAGER');
  const [password, setPassword] = useState('');

  const addMut = useMutation({
    mutationFn: () => superAdminAddOrgUser(tenantId, {
      fullName, phone, email: email || undefined, role,
      password: password || undefined, phoneCountryCode: '+91',
    }),
    onSuccess: () => { toast.saved('User added'); onAdded(); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed to add user'),
  });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={T.h2}>Add User to Org</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Input label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="e.g. Rahul Kumar" />
          <Input label="Phone *" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="rahul@example.com" keyboardType="email-address" />
          <Input label="Password (optional)" value={password} onChangeText={setPassword} placeholder="Leave blank to auto-generate" secureTextEntry />

          {/* Role picker */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Role *</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['ADMIN', 'MANAGER', 'STAFF'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: role === r ? C.navy : C.gray100,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: role === r ? C.white : C.gray600 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <Button
            label="Add User"
            onPress={() => addMut.mutate()}
            loading={addMut.isPending}
            disabled={!fullName || !phone}
            fullWidth
            size="lg"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Set Custom Limits Modal ───────────────────────────────────────────────────
function SetCustomLimitsModal({ tenantId, existing, plans, capDefs, onClose, onSaved }: {
  tenantId: string;
  existing: any;
  plans: any[];
  capDefs: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const CHIT_TYPES = ['RESERVATION', 'LOTTERY', 'AUCTION'];
  const existingAllowedTypes = existing?.allowedChitTypes
    ? existing.allowedChitTypes.split(',').map((s: string) => s.trim()).filter((t: string) => CHIT_TYPES.includes(t))
    : ['RESERVATION'];

  const [maxChits,    setMaxChits]    = useState(String(existing?.maxActiveChits ?? 5));
  const [maxMembers,  setMaxMembers]  = useState(String(existing?.maxMembers ?? 100));
  const [maxStaff,    setMaxStaff]    = useState(String(existing?.maxStaff ?? 3));
  const [allowedTypes, setAllowedTypes] = useState<string[]>(existingAllowedTypes);
  const [enabledCaps, setEnabledCaps]   = useState<string[]>(existing?.enabledCapabilities ?? []);
  const [priceStr,    setPriceStr]    = useState(existing?.priceMonthlyInr ? String(existing.priceMonthlyInr / 100) : '0');
  const [notes,       setNotes]       = useState(existing?.notes ?? '');

  const mut = useMutation({
    mutationFn: () => superAdminSetCustomLimits(tenantId, {
      maxActiveChits: Number(maxChits),
      maxMembers:     Number(maxMembers),
      maxStaff:       Number(maxStaff),
      allowedChitTypes: allowedTypes.join(','),
      enabledCapabilities: enabledCaps,
      priceMonthlyInr: Math.round(Number(priceStr) * 100),
      notes: notes || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-org-limits', tenantId] }); onSaved(); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to save'),
  });

  function toggleType(t: string) {
    setAllowedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function toggleCap(key: string) {
    setEnabledCaps(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Set Custom Limits</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {/* Numeric limits */}
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500, letterSpacing: 0.8 }}>LIMITS (−1 = unlimited)</Text>
          {[
            { label: 'Max Active Chits', val: maxChits,   set: setMaxChits },
            { label: 'Max Members',      val: maxMembers, set: setMaxMembers },
            { label: 'Max Staff',        val: maxStaff,   set: setMaxStaff },
          ].map(({ label, val, set }) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.gray700 }}>{label}</Text>
              <TextInput
                value={val} onChangeText={set} keyboardType="numeric"
                style={{ width: 80, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 15, color: C.gray900, textAlign: 'center' }}
              />
            </View>
          ))}

          {/* Allowed chit types */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8 }}>ALLOWED CHIT TYPES</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CHIT_TYPES.map(t => (
                <TouchableOpacity key={t} onPress={() => toggleType(t)}
                  style={{ flex: 1, backgroundColor: allowedTypes.includes(t) ? '#FEF3C7' : C.gray100, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: allowedTypes.includes(t) ? '#D97706' : C.gray200 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: allowedTypes.includes(t) ? '#D97706' : C.gray500 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Capabilities */}
          {capDefs.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 8 }}>CAPABILITIES</Text>
              {capDefs.map((cap: any) => (
                <TouchableOpacity key={cap.key} onPress={() => toggleCap(cap.key)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: enabledCaps.includes(cap.key) ? '#F0FDF4' : C.gray50, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: C.gray900 }}>{cap.label}</Text>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: enabledCaps.includes(cap.key) ? '#059669' : C.gray300, alignItems: 'center', justifyContent: 'center' }}>
                    {enabledCaps.includes(cap.key) && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Monthly price */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Monthly Price (₹)</Text>
            <TextInput value={priceStr} onChangeText={setPriceStr} keyboardType="decimal-pad" placeholder="0"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
          </View>

          {/* Notes */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Notes (internal)</Text>
            <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="e.g. Negotiated pricing"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60 }} />
          </View>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <Button
            label={mut.isPending ? 'Saving…' : 'Save Custom Limits'}
            onPress={() => mut.mutate()}
            loading={mut.isPending}
            disabled={allowedTypes.length === 0}
            fullWidth size="lg"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Rename Modal ──────────────────────────────────────────────────────────────
function RenameModal({ tenantId, currentName, currentSlug, onClose, onRenamed }: {
  tenantId: string;
  currentName: string;
  currentSlug: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [slug, setSlug] = useState(currentSlug);

  const renameMut = useMutation({
    mutationFn: () => superAdminUpdateTenant(tenantId, { name, slug }),
    onSuccess: () => { toast.saved('Organization renamed'); onRenamed(); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed to rename'),
  });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={T.h2}>Rename Organization</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Input label="Organization Name *" value={name} onChangeText={setName} placeholder="e.g. Kethaki Chitfunds" />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>URL Slug</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 12, backgroundColor: C.gray50 }}>
                <Text style={{ fontSize: 13, color: C.gray500 }}>chitwise.app/</Text>
              </View>
              <TextInput
                value={slug}
                onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="org-slug"
                placeholderTextColor={C.gray400}
                autoCapitalize="none"
                style={{ flex: 1, padding: 12, fontSize: 14, color: C.gray900 }}
              />
            </View>
            <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Lowercase letters, digits, hyphens only</Text>
          </View>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <Button
            label="Save Changes"
            onPress={() => renameMut.mutate()}
            loading={renameMut.isPending}
            disabled={!name}
            fullWidth
            size="lg"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
