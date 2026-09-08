import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListTenants, superAdminListRenewalRequests, superAdminListUpgradeRequests,
  superAdminActivateTenant, superAdminClearRenewalRequest,
  superAdminGetAllLimitsBulk, superAdminChitUsageSummary, superAdminMemberUsageSummary,
  superAdminResumeTenant, billingRecordPayment,
} from '../../../services/api';
import { C, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';

type AlertType = 'OVER_LIMIT' | 'EXPIRED' | 'PENDING' | 'CANCELLATION' | 'RENEWAL' | 'UPGRADE' | 'EXPIRING';

interface OrgAlert {
  type: AlertType;
  tenantId: string;
  name: string;
  plan: string;
  expiresAt?: string;
  toPlan?: string;
  detail?: string;
}

const TYPE_META: Record<AlertType, { label: string; dot: string; bg: string; text: string }> = {
  OVER_LIMIT:   { label: 'Over Limit',     dot: '#DC2626', bg: '#FEF2F2', text: '#991B1B' },
  EXPIRED:      { label: 'Expired',        dot: '#DC2626', bg: '#FEF2F2', text: '#991B1B' },
  PENDING:      { label: 'Pending',        dot: '#F59E0B', bg: '#FFFBEB', text: '#92400E' },
  CANCELLATION: { label: 'Cancel Pending', dot: '#FB7185', bg: '#FFF1F2', text: '#9F1239' },
  RENEWAL:      { label: 'Renewal Req',    dot: '#EA580C', bg: '#FFF7ED', text: '#9A3412' },
  UPGRADE:      { label: 'Upgrade Req',    dot: '#2563EB', bg: '#EFF6FF', text: '#1E40AF' },
  EXPIRING:     { label: 'Expiring Soon',  dot: '#D97706', bg: '#FFFBEB', text: '#92400E' },
};

const PRIORITY: Record<AlertType, number> = {
  OVER_LIMIT: 0, EXPIRED: 1, PENDING: 2, CANCELLATION: 3, RENEWAL: 4, UPGRADE: 5, EXPIRING: 6,
};

function RecordPaymentModal({ visible, tenant, onClose, onDone }: {
  visible: boolean; tenant: any; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [pType, setPType] = useState('RENEWAL');
  const METHODS = ['UPI', 'CASH', 'BANK_TRANSFER'];
  const TYPES   = ['PURCHASE', 'RENEWAL', 'UPGRADE'];

  const mut = useMutation({
    mutationFn: () => billingRecordPayment({
      tenantId: tenant?.id,
      amountPaise: Math.round(Number(amount) * 100),
      paymentMethod: method,
      type: pType,
    }),
    onSuccess: () => { toast.saved('Payment recorded'); onDone(); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Record Payment</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {tenant && (
            <View style={{ backgroundColor: C.navy50, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{tenant.name}</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>Plan: {tenant.plan}</Text>
            </View>
          )}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Amount (₹)</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
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
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Method</Text>
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
          <TouchableOpacity onPress={() => mut.mutate()} disabled={mut.isPending || !amount}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || !amount) ? 0.5 : 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {mut.isPending ? 'Recording…' : 'Record Payment'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function AlertsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [paymentTenant, setPaymentTenant] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<AlertType | null>(null);

  const { data: tenants = [], refetch: refetchTenants } = useQuery({
    queryKey: ['sa-tenants-all'],
    queryFn: () => superAdminListTenants({}),
    staleTime: 60_000,
  });
  const { data: renewals = [], refetch: refetchRenewals } = useQuery({
    queryKey: ['sa-renewals'],
    queryFn: superAdminListRenewalRequests,
    staleTime: 60_000,
  });
  const { data: upgrades = [], refetch: refetchUpgrades } = useQuery({
    queryKey: ['sa-upgrades'],
    queryFn: superAdminListUpgradeRequests,
    staleTime: 60_000,
  });
  const { data: limitsBulk = [] } = useQuery({
    queryKey: ['sa-limits-bulk'],
    queryFn: superAdminGetAllLimitsBulk,
    staleTime: 120_000,
  });
  const { data: chitUsage = [] } = useQuery({
    queryKey: ['sa-chit-usage'],
    queryFn: superAdminChitUsageSummary,
    staleTime: 120_000,
  });
  const { data: memberUsage = [] } = useQuery({
    queryKey: ['sa-member-usage'],
    queryFn: superAdminMemberUsageSummary,
    staleTime: 120_000,
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchTenants(), refetchRenewals(), refetchUpgrades()]);
    setRefreshing(false);
  }

  const activateMut = useMutation({
    mutationFn: (id: string) => superAdminActivateTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants-all'] }); toast.saved('Org activated'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const clearRenewalMut = useMutation({
    mutationFn: (tenantId: string) => superAdminClearRenewalRequest(tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-renewals'] }); toast.saved('Renewal cleared'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const resumeMut = useMutation({
    mutationFn: (id: string) => superAdminResumeTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants-all'] }); toast.saved('Cancellation reversed'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });

  // Build alerts
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const renewalIds = new Set((renewals as any[]).map((r: any) => r.tenantId ?? r.id));

  const limitsMap = Object.fromEntries((limitsBulk as any[]).map((l: any) => [l.tenantId, l]));
  const chitMap = Object.fromEntries((chitUsage as any[]).map((u: any) => [u.tenantId, Number(u.activeCount ?? 0)]));
  const memberMap = Object.fromEntries((memberUsage as any[]).map((u: any) => [u.tenantId, Number(u.memberCount ?? 0)]));

  const alerts: OrgAlert[] = [];

  // OVER_LIMIT
  (tenants as any[]).filter((t: any) => t.status === 'ACTIVE').forEach((t: any) => {
    const lim = limitsMap[t.id];
    if (!lim) return;
    const v: string[] = [];
    if (lim.maxActiveChits > 0 && (chitMap[t.id] ?? 0) > lim.maxActiveChits)
      v.push(`Chits: ${chitMap[t.id]}/${lim.maxActiveChits}`);
    if (lim.maxMembers > 0 && (memberMap[t.id] ?? 0) > lim.maxMembers)
      v.push(`Members: ${memberMap[t.id]}/${lim.maxMembers}`);
    if (v.length > 0)
      alerts.push({ type: 'OVER_LIMIT', tenantId: t.id, name: t.name, plan: t.plan, detail: v.join(' · ') });
  });

  // EXPIRED
  (tenants as any[]).filter((t: any) => {
    const exp = t.planExpiresAt ?? t.currentPeriodEnd;
    return exp && new Date(exp) < now && t.status === 'ACTIVE' && !renewalIds.has(t.id);
  }).forEach((t: any) => {
    alerts.push({ type: 'EXPIRED', tenantId: t.id, name: t.name, plan: t.plan, expiresAt: t.planExpiresAt ?? t.currentPeriodEnd });
  });

  // PENDING
  (tenants as any[]).filter((t: any) => t.status === 'PENDING').forEach((t: any) => {
    alerts.push({ type: 'PENDING', tenantId: t.id, name: t.name, plan: t.plan });
  });

  // CANCELLATION
  (tenants as any[]).filter((t: any) => t.cancellationRequestedAt).forEach((t: any) => {
    alerts.push({ type: 'CANCELLATION', tenantId: t.id, name: t.name, plan: t.plan, expiresAt: t.planExpiresAt, detail: `Requested ${fmtDate(t.cancellationRequestedAt)}` });
  });

  // RENEWAL requests
  (renewals as any[]).forEach((r: any) => {
    const t = (tenants as any[]).find((te: any) => te.id === (r.tenantId ?? r.id));
    alerts.push({ type: 'RENEWAL', tenantId: r.tenantId ?? r.id, name: t?.name ?? r.tenantName ?? r.tenantId, plan: t?.plan ?? r.plan ?? '' });
  });

  // UPGRADE requests
  (upgrades as any[]).forEach((r: any) => {
    const t = (tenants as any[]).find((te: any) => te.id === r.tenantId);
    alerts.push({ type: 'UPGRADE', tenantId: r.tenantId, name: t?.name ?? r.tenantName ?? r.tenantId, plan: t?.plan ?? '', toPlan: r.toPlan ?? r.requestedPlan });
  });

  // EXPIRING soon
  (tenants as any[]).filter((t: any) => {
    const exp = t.planExpiresAt ?? t.currentPeriodEnd;
    if (!exp) return false;
    const d = new Date(exp);
    return d > now && d < soon && t.status === 'ACTIVE' && !renewalIds.has(t.id);
  }).forEach((t: any) => {
    const daysLeft = Math.ceil((new Date(t.planExpiresAt ?? t.currentPeriodEnd).getTime() - now.getTime()) / 86400000);
    alerts.push({ type: 'EXPIRING', tenantId: t.id, name: t.name, plan: t.plan, expiresAt: t.planExpiresAt ?? t.currentPeriodEnd, detail: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` });
  });

  alerts.sort((a, b) => (PRIORITY[a.type] ?? 99) - (PRIORITY[b.type] ?? 99));

  // Count per type for filter pills
  const typeCounts: Partial<Record<AlertType, number>> = {};
  alerts.forEach((a) => { typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1; });
  const pillDefs = (Object.entries(typeCounts) as [AlertType, number][]).filter(([, count]) => count > 0);

  const visible = activeFilter ? alerts.filter((a) => a.type === activeFilter) : alerts;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.gray200,
        backgroundColor: C.white,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Alerts</Text>
          <Text style={{ fontSize: 12, color: alerts.length > 0 ? C.red : C.gray400 }}>
            {alerts.length > 0 ? `${visible.length}${activeFilter ? ` of ${alerts.length}` : ''} need attention` : 'All clear'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter pills */}
        {pillDefs.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {pillDefs.map(([type, count]) => {
              const meta = TYPE_META[type];
              const isActive = activeFilter === type;
              return (
                <TouchableOpacity key={type} onPress={() => setActiveFilter(isActive ? null : type)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: isActive ? C.navy : C.white,
                    borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7,
                    borderWidth: 1.5, borderColor: isActive ? C.navy : C.gray200,
                  }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isActive ? '#fff' : meta.dot }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#fff' : C.gray700 }}>{meta.label}</Text>
                  <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : C.gray100, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isActive ? '#fff' : C.gray600 }}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {activeFilter && (
              <TouchableOpacity onPress={() => setActiveFilter(null)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, color: C.gray400 }}>✕ Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        <View style={{ padding: 16 }}>
          {visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray700 }}>All clear!</Text>
              <Text style={{ fontSize: 13, color: C.gray400, marginTop: 6 }}>No orgs need attention right now.</Text>
            </View>
          ) : (
            visible.map((alert, i) => {
              const meta = TYPE_META[alert.type];
              const tenant = (tenants as any[]).find((t: any) => t.id === alert.tenantId);
              return (
                <View key={`${alert.type}-${alert.tenantId}-${i}`} style={{
                  backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 10,
                  borderLeftWidth: 4, borderLeftColor: meta.dot,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/(superadmin)/org-detail', params: { id: alert.tenantId } } as any)}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }} numberOfLines={1}>{alert.name}</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                        {alert.plan}{alert.toPlan ? ` → ${alert.toPlan}` : ''}{alert.expiresAt ? ` · exp ${fmtDate(alert.expiresAt)}` : ''}{alert.detail ? ` · ${alert.detail}` : ''}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: meta.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8, flexShrink: 0 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: meta.text }}>{meta.label}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {alert.type === 'PENDING' && (
                      <TouchableOpacity
                        onPress={() => Alert.alert('Activate Org', `Activate "${alert.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Activate', onPress: () => activateMut.mutate(alert.tenantId) },
                        ])}
                        style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Activate</Text>
                      </TouchableOpacity>
                    )}
                    {alert.type === 'CANCELLATION' && (
                      <TouchableOpacity
                        onPress={() => Alert.alert('Reverse Cancellation', `Reverse cancellation for "${alert.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reverse', onPress: () => resumeMut.mutate(alert.tenantId) },
                        ])}
                        style={{ backgroundColor: '#FB7185', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Resume</Text>
                      </TouchableOpacity>
                    )}
                    {(alert.type === 'OVER_LIMIT' || alert.type === 'EXPIRED' || alert.type === 'EXPIRING' || alert.type === 'UPGRADE') && (
                      <TouchableOpacity
                        onPress={() => setPaymentTenant(tenant ?? { id: alert.tenantId, name: alert.name, plan: alert.plan })}
                        style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Record Payment</Text>
                      </TouchableOpacity>
                    )}
                    {alert.type === 'RENEWAL' && (
                      <>
                        <TouchableOpacity
                          onPress={() => setPaymentTenant(tenant ?? { id: alert.tenantId, name: alert.name, plan: alert.plan })}
                          style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Collect & Renew</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => clearRenewalMut.mutate(alert.tenantId)}
                          style={{ backgroundColor: C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>Dismiss</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(app)/(superadmin)/org-detail', params: { id: alert.tenantId } } as any)}
                      style={{ backgroundColor: C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>View Org →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <RecordPaymentModal
        visible={!!paymentTenant}
        tenant={paymentTenant}
        onClose={() => setPaymentTenant(null)}
        onDone={() => { setPaymentTenant(null); qc.invalidateQueries({ queryKey: ['sa-tenants-all'] }); }}
      />
    </SafeAreaView>
  );
}
