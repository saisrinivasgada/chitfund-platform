import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { getOrgSettings, getBillingInfo, getMyTenantLimits } from '../../../services/api';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <Text style={{ width: 120, fontSize: 11, fontWeight: '600', color: C.gray400, paddingTop: 1 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: value ? C.gray900 : C.gray300 }}>
        {value || 'Not set'}
      </Text>
    </View>
  );
}

function LimitRow({ label, used, max }: { label: string; used?: number; max?: number }) {
  const pct = (max && used != null) ? Math.min((used / max) * 100, 100) : 0;
  const color = pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#16A34A';
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>{label}</Text>
        <Text style={{ fontSize: 12, color: C.gray500 }}>
          {used ?? 0} / {max ?? '∞'}
        </Text>
      </View>
      {max != null && (
        <View style={{ height: 4, backgroundColor: C.gray200, borderRadius: 2 }}>
          <View style={{ height: 4, width: `${pct}%` as any, backgroundColor: color, borderRadius: 2 }} />
        </View>
      )}
    </View>
  );
}

export default function MyOrgScreen() {
  const router = useRouter();

  const { data: org, isLoading: orgLoading } = useQuery({ queryKey: ['org-settings'], queryFn: getOrgSettings, staleTime: 120_000 });
  const { data: billing } = useQuery({ queryKey: ['m-billing'], queryFn: getBillingInfo, staleTime: 300_000 });
  const { data: limits } = useQuery({ queryKey: ['tenant-limits'], queryFn: getMyTenantLimits, staleTime: 120_000 });

  const planExpiry = (billing as any)?.planExpiresAt;
  const isExpired = planExpiry && new Date(planExpiry) < new Date();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
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
              <TouchableOpacity
                onPress={() => router.push('/(app)/(admin)/billing' as any)}
                style={{ marginTop: 12, backgroundColor: '#DC2626', borderRadius: 10, padding: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Renew Plan</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Org details */}
          <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>DETAILS</Text>
            <InfoRow label="Org Name"    value={(org as any)?.orgName ?? (org as any)?.name} />
            <InfoRow label="Slug"        value={(org as any)?.slug} />
            <InfoRow label="Hub Name"    value={(org as any)?.hubName} />
            <InfoRow label="Hub Address" value={(org as any)?.hubAddress} />
            <InfoRow label="City"        value={(org as any)?.city} />
            <View style={{ height: 4 }} />
          </View>

          {/* Limits */}
          {limits && (
            <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>PLAN LIMITS</Text>
              <LimitRow label="Members"   used={(limits as any)?.currentMembers}   max={(limits as any)?.maxMembers} />
              <LimitRow label="Chit Groups" used={(limits as any)?.currentChits}   max={(limits as any)?.maxChits} />
              <LimitRow label="Staff"     used={(limits as any)?.currentStaff}     max={(limits as any)?.maxStaff} />
              <View style={{ height: 4 }} />
            </View>
          )}

          {/* Quick link to billing */}
          <TouchableOpacity
            onPress={() => router.push('/(app)/(admin)/billing' as any)}
            activeOpacity={0.8}
            style={{ backgroundColor: C.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.gray100, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#D97706' + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>◎</Text>
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Plan & Billing</Text>
                <Text style={{ fontSize: 12, color: C.gray400 }}>Manage subscription & credits</Text>
              </View>
            </View>
            <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
          </TouchableOpacity>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
