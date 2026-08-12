import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListPromotions, superAdminCreatePromotion,
  superAdminUpdatePromotion, superAdminDeletePromotion,
} from '../../../services/api';
import { C, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const DURATION_LABELS: Record<string, string> = {
  ONCE: 'Once', MONTHS: 'Limited months', FOREVER: 'Forever',
};

function PromoFormModal({ visible, promo, onClose, onDone }: {
  visible: boolean;
  promo: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = !!promo;

  const [code,        setCode]        = useState(promo?.code ?? '');
  const [label,       setLabel]       = useState(promo?.label ?? '');
  const [discountPct, setDiscountPct] = useState(String(promo?.discountPct ?? ''));
  const [durationType, setDurationType] = useState<string>(promo?.durationType ?? 'ONCE');
  const [months,      setMonths]      = useState(String(promo?.durationMonths ?? ''));
  const [active,      setActive]      = useState<boolean>(promo?.active ?? true);
  const [global,      setGlobal]      = useState<boolean>(promo?.globalDiscount ?? false);

  const DURATION_TYPES = ['ONCE', 'MONTHS', 'FOREVER'];

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        label, discountPct: Number(discountPct),
        durationType, durationMonths: durationType === 'MONTHS' ? Number(months) : null,
        active, globalDiscount: global,
      };
      return isEdit
        ? superAdminUpdatePromotion(promo.code, body)
        : superAdminCreatePromotion({ ...body, code: code.toUpperCase() });
    },
    onSuccess: () => {
      toast.saved(isEdit ? 'Promotion updated' : 'Promotion created');
      onDone();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>
            {isEdit ? 'Edit Promotion' : 'New Promotion'}
          </Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.gray400 }}>×</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {!isEdit && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Promo Code</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="SUMMER25" placeholderTextColor={C.gray400} autoCapitalize="characters"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, fontFamily: 'monospace', letterSpacing: 1 }} />
            </View>
          )}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Label / Description</Text>
            <TextInput value={label} onChangeText={setLabel} placeholder="Summer 2025 discount"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Discount %</Text>
            <TextInput value={discountPct} onChangeText={setDiscountPct} keyboardType="numeric" placeholder="10"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 20, color: C.gray900 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Duration Type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DURATION_TYPES.map((d) => (
                <TouchableOpacity key={d} onPress={() => setDurationType(d)}
                  style={{ flex: 1, backgroundColor: durationType === d ? C.navy : C.gray100, borderRadius: 8, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: durationType === d ? '#fff' : C.gray700 }}>
                    {DURATION_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {durationType === 'MONTHS' && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Number of Months</Text>
              <TextInput value={months} onChangeText={setMonths} keyboardType="numeric" placeholder="3"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 14 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Global Discount</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>Apply to all orgs without a code</Text>
            </View>
            <Switch value={global} onValueChange={setGlobal} trackColor={{ true: C.navy }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 14 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Active</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>Orgs can use this promo code</Text>
            </View>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: '#16A34A' }} />
          </View>
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <TouchableOpacity
            onPress={() => mut.mutate()}
            disabled={mut.isPending || (!isEdit && !code) || !discountPct}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || (!isEdit && !code) || !discountPct) ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Promotion'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function PromotionsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: promotions = [], refetch } = useQuery({
    queryKey: ['sa-promotions'],
    queryFn: superAdminListPromotions,
    staleTime: 60_000,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const deleteMut = useMutation({
    mutationFn: (code: string) => superAdminDeletePromotion(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-promotions'] }); toast.cancelled('Promotion deleted'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

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
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.navy }}>Promotions</Text>
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
        {(promotions as any[]).length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎟️</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray700 }}>No Promotions Yet</Text>
            <Text style={{ fontSize: 13, color: C.gray400, marginTop: 6 }}>Create promo codes for discounts.</Text>
          </View>
        ) : (
          (promotions as any[]).map((p: any) => (
            <View key={p.code} style={{
              backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12,
              borderWidth: 1, borderColor: C.gray100,
              opacity: p.active ? 1 : 0.6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy, letterSpacing: 1, fontFamily: 'monospace' }}>
                    {p.code}
                  </Text>
                  {p.globalDiscount && (
                    <View style={{ backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>GLOBAL</Text>
                    </View>
                  )}
                  <View style={{ backgroundColor: p.active ? '#F0FDF4' : C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: p.active ? '#16A34A' : C.gray400 }}>
                      {p.active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#059669' }}>
                  {Number(p.discountPct).toFixed(0)}% off
                </Text>
              </View>

              {p.label && <Text style={{ fontSize: 13, color: C.gray600 ?? C.gray500, marginBottom: 6 }}>{p.label}</Text>}

              <Text style={{ fontSize: 12, color: C.gray400 }}>
                Duration: {DURATION_LABELS[p.durationType] ?? p.durationType}
                {p.durationType === 'MONTHS' && p.durationMonths ? ` (${p.durationMonths} months)` : ''}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={() => setEditing(p)}
                  style={{ flex: 1, backgroundColor: C.navy50, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    'Delete Promotion',
                    `Delete promo code "${p.code}"? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(p.code) },
                    ]
                  )}
                  style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <PromoFormModal
        visible={creating}
        promo={null}
        onClose={() => setCreating(false)}
        onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['sa-promotions'] }); }}
      />
      <PromoFormModal
        visible={!!editing}
        promo={editing}
        onClose={() => setEditing(null)}
        onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['sa-promotions'] }); }}
      />
    </SafeAreaView>
  );
}
