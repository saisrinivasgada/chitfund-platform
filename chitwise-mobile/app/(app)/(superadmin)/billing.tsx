import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListTenants, billingListPayments, billingRecordPayment, superAdminUpdatePlan,
  superAdminSetPlanExpiry,
} from '../../../services/api';
import { C, fmtDate, Badge } from '../../../components/ui';
import { toast } from '../../../components/Toast';

function fmtPaise(p: number | null | undefined) {
  if (p == null) return '₹0';
  return '₹' + (Number(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

const TYPE_COLORS: Record<string, string> = {
  PURCHASE: '#2563EB', RENEWAL: '#16A34A', UPGRADE: '#7C3AED', REFUND: '#DC2626',
};

// Record payment modal
function RecordPaymentModal({ visible, onClose, onDone, tenants }: {
  visible: boolean; onClose: () => void; onDone: () => void; tenants: any[];
}) {
  const [tenantId, setTenantId] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [pType, setPType] = useState('RENEWAL');
  const [plan, setPlan] = useState('');

  const METHODS = ['UPI', 'CASH', 'BANK_TRANSFER'];
  const TYPES   = ['PURCHASE', 'RENEWAL', 'UPGRADE', 'REFUND'];
  const PLANS   = ['BASIC', 'GROWTH', 'ENTERPRISE', 'CUSTOM'];

  const mut = useMutation({
    mutationFn: () => billingRecordPayment({
      tenantId,
      amountPaise: Math.round(Number(amount) * 100),
      paymentMethod: method,
      paymentType: pType,
      ...(plan ? { toPlan: plan } : {}),
    }),
    onSuccess: () => {
      toast.saved('Payment recorded');
      setTenantId(''); setTenantSearch(''); setAmount('');
      onDone();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const matchingTenants = tenants.filter((t: any) =>
    tenantSearch.length > 0 &&
    !tenantId &&
    t.name?.toLowerCase().includes(tenantSearch.toLowerCase())
  );
  const selectedTenant = tenants.find((t: any) => t.id === tenantId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Record Payment</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {/* Org search */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Organization</Text>
          {selectedTenant ? (
            <TouchableOpacity onPress={() => { setTenantId(''); setTenantSearch(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.navy50, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.navy }}>{selectedTenant.name}</Text>
              <Text style={{ fontSize: 14, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                value={tenantSearch}
                onChangeText={setTenantSearch}
                placeholder="Search org name…"
                placeholderTextColor={C.gray400}
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 11, fontSize: 14, color: C.gray900, marginBottom: 6 }}
              />
              {matchingTenants.slice(0, 5).map((t: any) => (
                <TouchableOpacity key={t.id} onPress={() => { setTenantId(t.id); setTenantSearch(t.name); }}
                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                  <Text style={{ fontSize: 14, color: C.gray900 }}>{t.name}</Text>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{t.plan}</Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 8 }} />
            </>
          )}

          {/* Amount */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Amount (₹)</Text>
          <TextInput
            value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0"
            style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, marginBottom: 6 }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {['500', '1000', '2000', '5000', '10000'].map((v) => (
              <TouchableOpacity key={v} onPress={() => setAmount(v)}
                style={{ backgroundColor: amount === v ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: amount === v ? '#fff' : C.gray700 }}>₹{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Type */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Payment Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {TYPES.map((t) => (
              <TouchableOpacity key={t} onPress={() => setPType(t)}
                style={{ backgroundColor: pType === t ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: pType === t ? '#fff' : C.gray700 }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Method */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Method</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {METHODS.map((m) => (
              <TouchableOpacity key={m} onPress={() => setMethod(m)}
                style={{ backgroundColor: method === m ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: method === m ? '#fff' : C.gray700 }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Plan (for upgrade) */}
          {pType === 'UPGRADE' && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>New Plan</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {PLANS.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setPlan(p)}
                    style={{ backgroundColor: plan === p ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: plan === p ? '#fff' : C.gray700 }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <TouchableOpacity
            onPress={() => mut.mutate()}
            disabled={mut.isPending || !tenantId || !amount}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || !tenantId || !amount) ? 0.5 : 1 }}
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

export default function SuperAdminBillingScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showRecord, setShowRecord] = useState(false);

  const { data: payments = [], refetch: refetchPay } = useQuery({
    queryKey: ['sa-billing-payments'],
    queryFn: () => billingListPayments({ size: 50 }),
    staleTime: 60_000,
  });
  const { data: tenants = [], refetch: refetchTenants } = useQuery({
    queryKey: ['sa-tenants-billing'],
    queryFn: () => superAdminListTenants({}),
    staleTime: 120_000,
  });

  const tenantMap = Object.fromEntries((tenants as any[]).map((t: any) => [t.id, t.name]));

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchPay(), refetchTenants()]);
    setRefreshing(false);
  }

  const totalRevenue = (payments as any[])
    .filter((p: any) => p.paymentType !== 'REFUND')
    .reduce((s, p: any) => s + Number(p.amountPaise ?? 0), 0);

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
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.navy }}>Billing Payments</Text>
        <TouchableOpacity
          onPress={() => setShowRecord(true)}
          style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Record</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 }}>
            TOTAL REVENUE
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#D4A017' }}>
            {fmtPaise(totalRevenue)}
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            From {(payments as any[]).length} payments
          </Text>
        </View>

        {/* Payment list */}
        {(payments as any[]).length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>💳</Text>
            <Text style={{ fontSize: 15, color: C.gray500 }}>No payments recorded yet</Text>
          </View>
        ) : (
          (payments as any[]).map((p: any, i: number) => {
            const col = TYPE_COLORS[p.paymentType] ?? C.gray500;
            const isRefund = p.paymentType === 'REFUND';
            return (
              <View key={p.id ?? i} style={{
                backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10,
                borderWidth: 1, borderColor: C.gray100,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>
                      {tenantMap[p.tenantId] ?? p.tenantId}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={{ backgroundColor: col + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: col }}>{p.paymentType}</Text>
                      </View>
                      {p.paymentMethod && (
                        <Text style={{ fontSize: 11, color: C.gray400 }}>{p.paymentMethod}</Text>
                      )}
                      {p.toPlan && (
                        <Text style={{ fontSize: 11, color: C.gray500 }}>→ {p.toPlan}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>
                      {fmtDate(p.paidAt ?? p.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: isRefund ? C.red : C.gray900 }}>
                    {isRefund ? '−' : ''}{fmtPaise(p.amountPaise)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <RecordPaymentModal
        visible={showRecord}
        onClose={() => setShowRecord(false)}
        onDone={() => {
          setShowRecord(false);
          refetchPay();
        }}
        tenants={tenants as any[]}
      />
    </SafeAreaView>
  );
}
