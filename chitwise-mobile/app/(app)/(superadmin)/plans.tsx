import { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminListPlans, superAdminCreatePlan, superAdminUpdatePlan2, superAdminListCapabilities, superAdminAddCapability, superAdminDeleteCapability } from '../../../services/api';
import { C } from '../../../components/ui';
import { toast } from '../../../components/Toast';

function fmtPaise(p: number | null | undefined) {
  if (!p) return '₹0';
  return '₹' + (Number(p) / 100).toLocaleString('en-IN');
}

function PlanFormModal({ visible, plan, onClose, onDone }: {
  visible: boolean;
  plan: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = !!plan;
  const isLive = isEdit && plan.isPublic && plan.isActive;

  const [code,        setCode]        = useState(plan?.plan ?? '');
  const [displayName, setDisplayName] = useState(plan?.displayName ?? '');
  const [tagline,     setTagline]     = useState(plan?.tagline ?? '');
  const [priceStr,    setPriceStr]    = useState(String(plan ? (Number(plan.priceMonthlyInr ?? 0) / 100) : ''));
  const [maxMembers,  setMaxMembers]  = useState(String(plan?.limits?.maxMembers ?? -1));
  const [maxChits,    setMaxChits]    = useState(String(plan?.limits?.maxChits ?? -1));
  const [maxStaff,    setMaxStaff]    = useState(String(plan?.limits?.maxStaff ?? -1));
  const [maxManagers, setMaxManagers] = useState(String(plan?.limits?.maxManagers ?? -1));
  const [featuresStr,      setFeaturesStr]      = useState((plan?.features ?? []).join('\n'));
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(plan?.analyticsEnabled ?? false);
  const [prioritySupport,  setPrioritySupport]  = useState<boolean>(plan?.prioritySupport ?? false);
  const [isActive,         setIsActive]         = useState<boolean>(plan?.active ?? true);
  const [capDefs, setCapDefs] = useState<any[]>([]);
  const [newCapLabel, setNewCapLabel] = useState('');
  const [showAddCap, setShowAddCap] = useState(false);
  const [addingCap, setAddingCap] = useState(false);

  const ENFORCEMENT_MAP: Record<string, string> = {
    'Full analytics':   'analyticsEnabled',
    'Priority support': 'prioritySupport',
  };

  useEffect(() => {
    superAdminListCapabilities().then(setCapDefs).catch(() => {});
  }, []);

  const enabledSet = new Set(featuresStr.split('\n').map((s: string) => s.trim()).filter(Boolean));

  function toggleCapability(label: string, checked: boolean) {
    const lines = featuresStr.split('\n').map((s: string) => s.trim()).filter(Boolean);
    const without = lines.filter((l: string) => l !== label);
    setFeaturesStr(checked ? [...without, label].join('\n') : without.join('\n'));
    const enfField = ENFORCEMENT_MAP[label];
    if (enfField === 'analyticsEnabled') setAnalyticsEnabled(checked);
    if (enfField === 'prioritySupport') setPrioritySupport(checked);
  }

  async function handleAddCapability() {
    const label = newCapLabel.trim();
    if (!label) return;
    setAddingCap(true);
    try {
      const created = await superAdminAddCapability(label);
      setCapDefs((prev: any[]) => [...prev, created]);
      toggleCapability(label, true);
      setNewCapLabel('');
      setShowAddCap(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message ?? 'Failed to add capability');
    } finally { setAddingCap(false); }
  }

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        displayName, tagline,
        priceMonthlyInr: Math.round(Number(priceStr) * 100),
        limits: {
          maxMembers: Number(maxMembers),
          maxChits:   Number(maxChits),
          maxStaff:   Number(maxStaff),
          maxManagers: Number(maxManagers),
        },
        features: featuresStr.split('\n').map((f: string) => f.trim()).filter(Boolean),
        analyticsEnabled,
        prioritySupport,
        active: isActive,
      };
      return isEdit
        ? superAdminUpdatePlan2(plan.plan, body)
        : superAdminCreatePlan({ ...body, plan: code.toUpperCase() });
    },
    onSuccess: () => {
      toast.saved(isEdit ? 'Plan updated' : 'Plan created');
      onDone();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>
            {isEdit ? `Edit ${plan.plan}` : 'New Plan'}
          </Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {!isEdit && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Plan Code</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="GROWTH"
                autoCapitalize="characters"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, letterSpacing: 1 }} />
            </View>
          )}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Display Name</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Growth"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Tagline</Text>
            <TextInput value={tagline} onChangeText={setTagline} placeholder="For growing chit businesses"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Price / month (₹)</Text>
            <TextInput value={priceStr} onChangeText={setPriceStr} keyboardType="numeric" placeholder="999"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 18, color: C.gray900 }} />
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginTop: 4 }}>LIMITS (−1 = unlimited)</Text>

          {[
            { label: 'Max Members',  val: maxMembers,  set: setMaxMembers },
            { label: 'Max Chits',    val: maxChits,    set: setMaxChits },
            { label: 'Max Staff',    val: maxStaff,    set: setMaxStaff },
            { label: 'Max Managers', val: maxManagers, set: setMaxManagers },
          ].map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.gray700 }}>{f.label}</Text>
              <TextInput value={f.val} onChangeText={f.set} keyboardType="numeric"
                style={{ width: 90, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 15, color: C.gray900, textAlign: 'center' }} />
            </View>
          ))}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 5 }}>Features (one per line)</Text>
            <TextInput value={featuresStr} onChangeText={setFeaturesStr} multiline numberOfLines={6}
              placeholder={'Up to 100 members\nUnlimited draws\nPriority support'}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 13, color: C.gray900, minHeight: 120 }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray500, letterSpacing: 0.8 }}>CAPABILITIES</Text>
            <TouchableOpacity onPress={() => setShowAddCap(v => !v)}>
              <Text style={{ fontSize: 12, color: C.navy, fontWeight: '700' }}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {showAddCap && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={newCapLabel} onChangeText={setNewCapLabel}
                placeholder="e.g. SMS notifications" autoFocus
                style={{ flex: 1, borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 13, color: C.gray900 }} />
              <TouchableOpacity onPress={handleAddCapability} disabled={addingCap || !newCapLabel.trim()}
                style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', opacity: addingCap || !newCapLabel.trim() ? 0.5 : 1 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{addingCap ? '…' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {capDefs.length === 0 && (
            <Text style={{ fontSize: 12, color: C.gray400, fontStyle: 'italic' }}>No capabilities yet — tap + Add</Text>
          )}

          {capDefs.map((cap: any) => (
            <View key={cap.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 14 }}>
              <View>
                <Text style={{ fontSize: 14, color: C.gray900 }}>{cap.label}</Text>
                {ENFORCEMENT_MAP[cap.label] && <Text style={{ fontSize: 11, color: '#3B82F6' }}>enforced</Text>}
              </View>
              <Switch value={enabledSet.has(cap.label)} onValueChange={v => toggleCapability(cap.label, v)} trackColor={{ true: C.navy }} />
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Active (visible to orgs)</Text>
            <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#16A34A' }} />
          </View>
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <TouchableOpacity
            onPress={() => {
              if (isLive) {
                Alert.alert(
                  'This plan is live',
                  'Changes will reflect immediately on the landing page, registration, and all user-facing views. Save anyway?',
                  [
                    { text: 'Go back', style: 'cancel' },
                    { text: 'Yes, save', style: 'destructive', onPress: () => mut.mutate() },
                  ]
                );
              } else {
                mut.mutate();
              }
            }}
            disabled={mut.isPending || (!isEdit && !code)}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || (!isEdit && !code)) ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function PlansScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: plans = [], refetch } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: superAdminListPlans,
    staleTime: 60_000,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

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
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.navy }}>Plan Definitions</Text>
        <TouchableOpacity
          onPress={() => setCreating(true)}
          style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {(plans as any[]).length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray700 }}>No Plans Defined</Text>
          </View>
        ) : (
          (plans as any[]).map((p: any) => (
            <View key={p.plan} style={{
              backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12,
              borderWidth: 1, borderColor: C.gray100,
              opacity: p.active ? 1 : 0.55,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>{p.displayName ?? p.plan}</Text>
                    {!p.active && (
                      <View style={{ backgroundColor: C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray500 }}>INACTIVE</Text>
                      </View>
                    )}
                  </View>
                  {p.tagline && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{p.tagline}</Text>}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>
                  {fmtPaise(p.priceMonthlyInr)}<Text style={{ fontSize: 11, color: C.gray400 }}>/mo</Text>
                </Text>
              </View>

              {/* Limits */}
              {p.limits && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {[
                    { label: 'Members',  v: p.limits.maxMembers },
                    { label: 'Chits',    v: p.limits.maxChits },
                    { label: 'Staff',    v: p.limits.maxStaff },
                    { label: 'Managers', v: p.limits.maxManagers },
                  ].map(({ label, v }) => (
                    <View key={label} style={{ backgroundColor: C.navy50, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: C.navy }}>
                        {v === -1 ? '∞' : v} {label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Features */}
              {(p.features ?? []).slice(0, 3).map((f: string, i: number) => (
                <Text key={i} style={{ fontSize: 12, color: C.gray600 ?? C.gray500, marginBottom: 2 }}>✓ {f}</Text>
              ))}
              {(p.features ?? []).length > 3 && (
                <Text style={{ fontSize: 12, color: C.gray400 }}>+{(p.features ?? []).length - 3} more features</Text>
              )}

              <TouchableOpacity
                onPress={() => setEditing(p)}
                style={{ marginTop: 12, backgroundColor: C.navy50, borderRadius: 10, padding: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Edit Plan</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <PlanFormModal
        visible={creating}
        plan={null}
        onClose={() => setCreating(false)}
        onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['sa-plans'] }); }}
      />
      <PlanFormModal
        visible={!!editing}
        plan={editing}
        onClose={() => setEditing(null)}
        onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['sa-plans'] }); }}
      />
    </SafeAreaView>
  );
}
