import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListTenants,
  superAdminActivateTenant,
  superAdminSuspendTenant,
  superAdminUpdatePlan,
} from '../../../services/api';
import { useAuthStore } from '../../../store/authStore';
import { C, T, Badge, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  BASIC:      { bg: C.gray100,      text: C.gray600 },
  PRO:        { bg: '#DBEAFE',      text: '#2563EB' },
  ENTERPRISE: { bg: '#EDE9FE',      text: '#7C3AED' },
};

function PlanBadge({ plan }: { plan: string }) {
  const s = PLAN_COLORS[plan] ?? PLAN_COLORS.BASIC;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: s.text }}>{plan}</Text>
    </View>
  );
}

export default function SuperAdminOrgsPage() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['sa-tenants', statusFilter],
    queryFn: () => superAdminListTenants(statusFilter ? { status: statusFilter } : {}),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => superAdminActivateTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.saved('Org activated'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const suspendMut = useMutation({
    mutationFn: (id: string) => superAdminSuspendTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.cancelled('Org suspended'); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });
  const planMut = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => superAdminUpdatePlan(id, plan),
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.saved(`Plan → ${vars.plan}`); },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });

  const all = tenants as any[];
  const filtered = all.filter((t) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total:     all.length,
    active:    all.filter((t) => t.status === 'ACTIVE').length,
    pending:   all.filter((t) => t.status === 'PENDING').length,
    suspended: all.filter((t) => t.status === 'SUSPENDED').length,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200,
      }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={T.h2}>Organizations</Text>
            <View style={{ backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>SUPER ADMIN</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: C.gray500, marginTop: 1 }}>Hello, {user?.fullName?.split(' ')[0]}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.push('/(app)/(superadmin)/alerts' as any)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FEF3C7' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>🔔 Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={logout}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Total',     value: stats.total,     color: C.navy },
            { label: 'Active',    value: stats.active,    color: C.green },
            { label: 'Pending',   value: stats.pending,   color: C.amber },
            { label: 'Suspended', value: stats.suspended, color: C.red },
          ].map(({ label, value, color }) => (
            <View key={label} style={{ flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: C.gray400, textTransform: 'uppercase' }}>{label}</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color, marginTop: 2 }}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Quick nav */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[
            { label: '💳 Billing', route: '/(app)/(superadmin)/billing' },
            { label: '📋 Plans',   route: '/(app)/(superadmin)/plans' },
            { label: '🎟️ Promos',  route: '/(app)/(superadmin)/promotions' },
          ].map((n) => (
            <TouchableOpacity
              key={n.label}
              onPress={() => router.push(n.route as any)}
              style={{ flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.gray200 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or slug…"
          placeholderTextColor={C.gray400}
          style={{
            backgroundColor: C.white, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200,
            padding: 12, fontSize: 14, color: C.gray900, marginBottom: 10,
          }}
        />

        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {[
            { label: 'All',       val: '' },
            { label: 'Active',    val: 'ACTIVE' },
            { label: 'Pending',   val: 'PENDING' },
            { label: 'Suspended', val: 'SUSPENDED' },
          ].map((f) => (
            <TouchableOpacity
              key={f.val}
              onPress={() => setStatusFilter(f.val)}
              style={{
                marginRight: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99,
                backgroundColor: statusFilter === f.val ? C.navy : C.white,
                borderWidth: 1.5, borderColor: statusFilter === f.val ? C.navy : C.gray200,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: statusFilter === f.val ? C.white : C.gray600 }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* List */}
        {isLoading && filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={C.navy} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🏛️</Text>
            <Text style={{ fontSize: 15, color: C.gray500 }}>No organizations found</Text>
          </View>
        ) : (
          filtered.map((t: any) => (
            <TenantCard
              key={t.id}
              tenant={t}
              onPress={() => router.push({ pathname: '/(app)/(superadmin)/org-detail', params: { tenantId: t.id } })}
              onActivate={() => activateMut.mutate(t.id)}
              onSuspend={() => suspendMut.mutate(t.id)}
              onPlan={(plan) => planMut.mutate({ id: t.id, plan })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TenantCard({ tenant, onPress, onActivate, onSuspend, onPlan }: {
  tenant: any;
  onPress: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onPlan: (plan: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <View style={{
      backgroundColor: C.white, borderRadius: 16, marginBottom: 12,
      borderWidth: 1, borderColor: C.gray200,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    }}>
      {/* Main row */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
        {/* Avatar */}
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.white }}>
            {tenant.name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }} numberOfLines={1}>{tenant.name}</Text>
          <Text style={{ fontSize: 12, color: C.gray400, fontFamily: 'Courier', marginTop: 1 }}>@{tenant.slug}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge status={tenant.status} />
            <PlanBadge plan={tenant.plan ?? 'BASIC'} />
            {tenant.memberCount != null && (
              <Text style={{ fontSize: 11, color: C.gray400 }}>{tenant.memberCount} members</Text>
            )}
          </View>
        </View>

        <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
      </TouchableOpacity>

      {/* Action strip */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.gray100, flexDirection: 'row' }}>
        <TouchableOpacity
          onPress={() => setShowActions((v) => !v)}
          style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>Actions ▾</Text>
        </TouchableOpacity>
        <View style={{ width: 1, backgroundColor: C.gray100 }} />
        <TouchableOpacity onPress={onPress} style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>View Details →</Text>
        </TouchableOpacity>
      </View>

      {/* Expanded quick-actions */}
      {showActions && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.gray100, padding: 12, gap: 8 }}>
          {/* Status toggle */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tenant.status !== 'ACTIVE' && (
              <TouchableOpacity onPress={onActivate} style={{ flex: 1, backgroundColor: '#D1FAE5', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>Activate</Text>
              </TouchableOpacity>
            )}
            {tenant.status !== 'SUSPENDED' && (
              <TouchableOpacity onPress={onSuspend} style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>Suspend</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Plan */}
          <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, letterSpacing: 0.5 }}>CHANGE PLAN</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['BASIC', 'PRO', 'ENTERPRISE'].filter((p) => p !== tenant.plan).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => onPlan(p)}
                style={{ flex: 1, backgroundColor: PLAN_COLORS[p]?.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: PLAN_COLORS[p]?.text }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
