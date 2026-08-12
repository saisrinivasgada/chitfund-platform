import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListTenants, superAdminListRenewalRequests, superAdminListUpgradeRequests,
  superAdminActivateTenant, superAdminClearRenewalRequest, superAdminUpdatePlan,
  billingRecordPayment,
} from '../../../services/api';
import { C, fmtDate, Badge } from '../../../components/ui';
import { toast } from '../../../components/Toast';

type AlertType = 'EXPIRED' | 'PENDING' | 'RENEWAL' | 'UPGRADE' | 'EXPIRING';

interface OrgAlert {
  type: AlertType;
  tenantId: string;
  name: string;
  plan: string;
  expiresAt?: string;
  requestId?: string;
  toPlan?: string;
}

const TYPE_META: Record<AlertType, { label: string; dot: string; bg: string; text: string }> = {
  EXPIRED:  { label: 'Expired',       dot: '#DC2626', bg: '#FEF2F2', text: '#991B1B' },
  PENDING:  { label: 'Pending',       dot: '#F59E0B', bg: '#FFFBEB', text: '#92400E' },
  RENEWAL:  { label: 'Renewal Req',   dot: '#EA580C', bg: '#FFF7ED', text: '#9A3412' },
  UPGRADE:  { label: 'Upgrade Req',   dot: '#2563EB', bg: '#EFF6FF', text: '#1E40AF' },
  EXPIRING: { label: 'Expiring Soon', dot: '#D97706', bg: '#FFFBEB', text: '#92400E' },
};

// Record payment modal
function RecordPaymentModal({ visible, tenant, onClose, onDone }: {
  visible: boolean; tenant: any; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [pType, setPType] = useState('RENEWAL');

  const METHODS = ['UPI', 'CASH', 'BANK_TRANSFER'];
  const TYPES   = ['PURCHASE', 'RENEWAL', 'UPGRADE', 'REFUND'];

  const mut = useMutation({
    mutationFn: () => billingRecordPayment({
      tenantId: tenant?.id,
      amountPaise: Math.round(Number(amount) * 100),
      paymentMethod: method,
      paymentType: pType,
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
            <View style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12 }}>
              <Text
                style={{ fontSize: 16, color: C.gray900 }}
                onPress={() => {}}
              >{amount || '0'}</Text>
            </View>
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
            onPress={() => mut.mutate()}
            disabled={mut.isPending || !amount}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || !amount) ? 0.5 : 1 }}
          >
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

  // Build alerts from tenants + requests
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  const alerts: OrgAlert[] = [];

  // Pending orgs
  (tenants as any[]).filter((t: any) => t.status === 'PENDING').forEach((t: any) => {
    alerts.push({ type: 'PENDING', tenantId: t.id, name: t.name, plan: t.plan });
  });

  // Expired
  (tenants as any[]).filter((t: any) => {
    const exp = t.planExpiresAt ?? t.currentPeriodEnd;
    return exp && new Date(exp) < now && t.status === 'ACTIVE';
  }).forEach((t: any) => {
    alerts.push({ type: 'EXPIRED', tenantId: t.id, name: t.name, plan: t.plan, expiresAt: t.planExpiresAt ?? t.currentPeriodEnd });
  });

  // Expiring soon
  (tenants as any[]).filter((t: any) => {
    const exp = t.planExpiresAt ?? t.currentPeriodEnd;
    if (!exp) return false;
    const d = new Date(exp);
    return d > now && d < soon && t.status === 'ACTIVE';
  }).forEach((t: any) => {
    alerts.push({ type: 'EXPIRING', tenantId: t.id, name: t.name, plan: t.plan, expiresAt: t.planExpiresAt ?? t.currentPeriodEnd });
  });

  // Renewal requests
  (renewals as any[]).forEach((r: any) => {
    const t = (tenants as any[]).find((te: any) => te.id === r.tenantId);
    alerts.push({ type: 'RENEWAL', tenantId: r.tenantId, name: t?.name ?? r.tenantName ?? r.tenantId, plan: t?.plan ?? r.plan ?? '' });
  });

  // Upgrade requests
  (upgrades as any[]).forEach((r: any) => {
    const t = (tenants as any[]).find((te: any) => te.id === r.tenantId);
    alerts.push({ type: 'UPGRADE', tenantId: r.tenantId, name: t?.name ?? r.tenantName ?? r.tenantId, plan: t?.plan ?? '', toPlan: r.toPlan });
  });

  // Sort by priority
  const PRIORITY: Record<AlertType, number> = { EXPIRED: 0, PENDING: 1, RENEWAL: 2, UPGRADE: 3, EXPIRING: 4 };
  alerts.sort((a, b) => (PRIORITY[a.type] ?? 99) - (PRIORITY[b.type] ?? 99));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
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
          <Text style={{ fontSize: 12, color: C.gray400 }}>
            {alerts.length} org{alerts.length !== 1 ? 's' : ''} need attention
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {alerts.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray700 }}>All clear!</Text>
            <Text style={{ fontSize: 13, color: C.gray400, marginTop: 6 }}>No orgs need attention right now.</Text>
          </View>
        ) : (
          alerts.map((alert, i) => {
            const meta = TYPE_META[alert.type];
            const tenant = (tenants as any[]).find((t: any) => t.id === alert.tenantId);
            return (
              <View key={`${alert.type}-${alert.tenantId}-${i}`} style={{
                backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 10,
                borderLeftWidth: 4, borderLeftColor: meta.dot,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
              }}>
                {/* Badge + name */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/(superadmin)/org-detail', params: { id: alert.tenantId } } as any)}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }} numberOfLines={1}>{alert.name}</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      {alert.plan}{alert.toPlan ? ` → ${alert.toPlan}` : ''}{alert.expiresAt ? ` · expires ${fmtDate(alert.expiresAt)}` : ''}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: meta.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: meta.text }}>{meta.label}</Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {alert.type === 'PENDING' && (
                    <TouchableOpacity
                      onPress={() => Alert.alert('Activate Org', `Activate "${alert.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Activate', onPress: () => activateMut.mutate(alert.tenantId) },
                      ])}
                      style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Activate</Text>
                    </TouchableOpacity>
                  )}
                  {alert.type === 'RENEWAL' && (
                    <>
                      <TouchableOpacity
                        onPress={() => setPaymentTenant(tenant)}
                        style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Record Payment</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => clearRenewalMut.mutate(alert.tenantId)}
                        style={{ backgroundColor: C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray600 ?? C.gray500 }}>Dismiss</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {(alert.type === 'EXPIRED' || alert.type === 'EXPIRING' || alert.type === 'UPGRADE') && (
                    <TouchableOpacity
                      onPress={() => setPaymentTenant(tenant)}
                      style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Record Payment</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(app)/(superadmin)/org-detail', params: { id: alert.tenantId } } as any)}
                    style={{ backgroundColor: C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>View Org →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
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
