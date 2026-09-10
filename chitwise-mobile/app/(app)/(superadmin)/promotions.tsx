import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  superAdminListPromotions, superAdminCreatePromotion, superAdminUpdatePromotion,
  superAdminSetPromotionVisibility, superAdminDeactivatePromotion, superAdminListReferralCredits,
  superAdminListPlans,
} from '../../../services/api';
import { C, fmtDate } from '../../../components/ui';
import { toast } from '../../../components/Toast';

const DURATION_LABELS: Record<string, string> = {
  ONCE: 'Once', MONTHS: 'N Months', FOREVER: 'Forever',
};

function PromoFormModal({ visible, promo, onClose, onDone }: {
  visible: boolean;
  promo: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = !!promo;
  const qc = useQueryClient();

  const [promoType,    setPromoType]    = useState<string>(promo?.promoType ?? 'STANDARD');
  const [code,         setCode]         = useState(promo?.code ?? '');
  const [label,        setLabel]        = useState(promo?.label ?? '');
  const [description,  setDescription]  = useState(promo?.description ?? '');
  const [discountPct,  setDiscountPct]  = useState(String(promo?.discountPct ?? ''));
  const [referrerCred, setReferrerCred] = useState(String(promo?.referrerCreditInr ?? ''));
  const [durationType, setDurationType] = useState<string>(promo?.discountDurationType ?? 'FOREVER');
  const [months,       setMonths]       = useState(String(promo?.discountDurationMonths ?? ''));
  const [maxUses,      setMaxUses]      = useState(String(promo?.maxUses ?? ''));
  const [validFrom,    setValidFrom]    = useState(promo?.validFrom ? promo.validFrom.slice(0, 10) : '');
  const [validUntil,   setValidUntil]   = useState(promo?.validUntil ? promo.validUntil.slice(0, 10) : '');
  const [isPublic,     setIsPublic]     = useState<boolean>(promo?.isPublic ?? false);
  const [selectedPlans, setSelectedPlans] = useState<string[]>(
    promo?.appliesToPlans ? promo.appliesToPlans.split(',').filter(Boolean) : []
  );

  const { data: plans = [] } = useQuery({ queryKey: ['sa-plans'], queryFn: superAdminListPlans, staleTime: 120_000 });
  const activePlans = (plans as any[]).filter((p: any) => p.isActive);

  const DURATION_TYPES = ['ONCE', 'MONTHS', 'FOREVER'];

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        label, description: description || null,
        discountPct: Number(discountPct) || 0,
        referrerCreditInr: promoType === 'REFERRAL' && referrerCred ? Number(referrerCred) : null,
        discountDurationType: durationType,
        discountDurationMonths: durationType === 'MONTHS' ? Number(months) : null,
        maxUses: maxUses ? Number(maxUses) : null,
        validFrom: validFrom ? validFrom + 'T00:00:00' : null,
        validUntil: validUntil ? validUntil + 'T23:59:59' : null,
        isPublic,
        appliesToPlans: selectedPlans.length ? selectedPlans.join(',') : null,
      };
      return isEdit
        ? superAdminUpdatePromotion(promo.id ?? promo.code, body)
        : superAdminCreatePromotion({ ...body, code: code.toUpperCase(), promoType });
    },
    onSuccess: () => {
      toast.saved(isEdit ? 'Promotion updated' : 'Promotion created');
      qc.invalidateQueries({ queryKey: ['sa-promotions'] });
      onDone();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  function togglePlan(plan: string) {
    setSelectedPlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]
    );
  }

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
          {/* Type selector (create only) */}
          {!isEdit && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Type</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['STANDARD', 'REFERRAL'].map((t) => (
                  <TouchableOpacity key={t} onPress={() => setPromoType(t)}
                    style={{ flex: 1, backgroundColor: promoType === t ? C.navy : C.gray100, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: promoType === t ? '#fff' : C.gray700 }}>{t}</Text>
                    <Text style={{ fontSize: 11, color: promoType === t ? 'rgba(255,255,255,0.7)' : C.gray400, marginTop: 2 }}>
                      {t === 'STANDARD' ? 'Promo code' : 'Referral program'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {promoType === 'REFERRAL' && (
            <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 12, color: '#5B21B6' }}>
                Each org gets a unique referral code. Discount goes to the registrant; credit goes to the referrer.
              </Text>
            </View>
          )}

          {!isEdit && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Promo Code *</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="SUMMER25" placeholderTextColor={C.gray400} autoCapitalize="characters"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, letterSpacing: 1 }} />
            </View>
          )}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Label *</Text>
            <TextInput value={label} onChangeText={setLabel} placeholder="Summer 2025 Discount"
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Description</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Shown on registration page" multiline numberOfLines={2}
              placeholderTextColor={C.gray400}
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 60 }} />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Discount % (registrant)</Text>
            <TextInput value={discountPct} onChangeText={setDiscountPct} keyboardType="numeric" placeholder="10"
              style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 20, color: C.gray900 }} />
          </View>

          {promoType === 'REFERRAL' && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Referrer Credit (₹)</Text>
              <TextInput value={referrerCred} onChangeText={setReferrerCred} keyboardType="numeric" placeholder="500"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
            </View>
          )}

          {promoType === 'STANDARD' && activePlans.length > 0 && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Applies to Plans <Text style={{ fontSize: 12, fontWeight: '400', color: C.gray400 }}>(blank = all)</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {activePlans.map((p: any) => {
                  const sel = selectedPlans.includes(p.plan);
                  return (
                    <TouchableOpacity key={p.plan} onPress={() => togglePlan(p.plan)}
                      style={{ backgroundColor: sel ? C.navy : C.gray100, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: sel ? C.navy : C.gray200 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#fff' : C.gray700 }}>{p.displayName ?? p.plan}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Discount Duration</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DURATION_TYPES.map((d) => (
                <TouchableOpacity key={d} onPress={() => setDurationType(d)}
                  style={{ flex: 1, backgroundColor: durationType === d ? C.navy : C.gray100, borderRadius: 8, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: durationType === d ? '#fff' : C.gray700 }}>
                    {DURATION_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {durationType === 'MONTHS' && (
              <TextInput value={months} onChangeText={setMonths} keyboardType="numeric" placeholder="3"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900, marginTop: 8 }} />
            )}
          </View>

          {promoType === 'STANDARD' && (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 }}>Max Uses <Text style={{ fontSize: 12, fontWeight: '400', color: C.gray400 }}>(blank = unlimited)</Text></Text>
              <TextInput value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" placeholder="100"
                style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 12, fontSize: 16, color: C.gray900 }} />
            </View>
          )}

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 }}>Validity</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>From (YYYY-MM-DD)</Text>
                <TextInput value={validFrom} onChangeText={setValidFrom} placeholder="2025-01-01"
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 13, color: C.gray900 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 4 }}>Until (YYYY-MM-DD)</Text>
                <TextInput value={validUntil} onChangeText={setValidUntil} placeholder="2025-12-31"
                  placeholderTextColor={C.gray400}
                  style={{ borderWidth: 1.5, borderColor: C.gray300, borderRadius: 10, padding: 10, fontSize: 13, color: C.gray900 }} />
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 14 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Live (show on registration)</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>Orgs can see and use this code</Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: '#16A34A' }} />
          </View>
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <TouchableOpacity
            onPress={() => mut.mutate()}
            disabled={mut.isPending || (!isEdit && !code) || !label}
            style={{ backgroundColor: C.navy, borderRadius: 14, padding: 15, alignItems: 'center', opacity: (mut.isPending || (!isEdit && !code) || !label) ? 0.5 : 1 }}>
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
  const { data: referralCredits = [] } = useQuery({
    queryKey: ['sa-referral-credits'],
    queryFn: () => superAdminListReferralCredits(),
    staleTime: 60_000,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const visibilityMut = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => superAdminSetPromotionVisibility(id, isPublic),
    onSuccess: (_d, { isPublic }) => {
      qc.invalidateQueries({ queryKey: ['sa-promotions'] });
      toast.saved(isPublic ? 'Promotion is now live' : 'Taken offline');
    },
    onError: (e: any) => toast.cancelled(e.response?.data?.message ?? 'Failed'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => superAdminDeactivatePromotion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-promotions'] }); toast.cancelled('Promotion deactivated'); },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  const promoList = promotions as any[];
  const referralProgram = promoList.find((p: any) => p.promoType === 'REFERRAL');
  const standardPromos = promoList.filter((p: any) => p.promoType !== 'REFERRAL');

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
        <TouchableOpacity onPress={() => setCreating(true)}
          style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Referral Program card */}
        <View style={{ backgroundColor: '#F5F3FF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#DDD6FE' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>🎁</Text>
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#4C1D95' }}>Referral Program</Text>
                <Text style={{ fontSize: 11, color: '#7C3AED' }}>Each org gets a unique referral code</Text>
              </View>
            </View>
            {referralProgram && (
              <TouchableOpacity onPress={() => setEditing(referralProgram)}
                style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {referralProgram ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>Registrant Discount</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#7C3AED' }}>{referralProgram.discountPct}%</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>Referrer Credit</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#7C3AED' }}>₹{referralProgram.referrerCreditInr ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>Total Uses</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#7C3AED' }}>{referralProgram.usesCount ?? 0}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => visibilityMut.mutate({ id: referralProgram.id, isPublic: !referralProgram.isPublic })}
                disabled={visibilityMut.isPending}
                style={{ backgroundColor: referralProgram.isPublic ? '#D1FAE5' : '#E5E7EB', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: referralProgram.isPublic ? '#059669' : C.gray600 }}>
                  {referralProgram.isPublic ? '● Active (tap to disable)' : 'Enable Referral Program'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 13, color: '#7C3AED' }}>No referral program yet — tap + New and choose Referral type.</Text>
            </View>
          )}
        </View>

        {/* Referral credit pipeline */}
        {(referralCredits as any[]).length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
              Referral Credit Pipeline
            </Text>
            {(referralCredits as any[]).map((rc: any) => {
              const isCredited = rc.status === 'CREDITED';
              return (
                <View key={rc.id} style={{
                  backgroundColor: C.white, borderRadius: 12, padding: 12, marginBottom: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderWidth: 1, borderColor: C.gray100,
                }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isCredited ? '#D1FAE5' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{isCredited ? '✅' : '⏳'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: C.gray900 }}>
                      <Text style={{ fontWeight: '700', color: '#7C3AED' }}>{rc.referrerName}</Text>
                      <Text style={{ color: C.gray400 }}> referred </Text>
                      <Text style={{ fontWeight: '700', color: C.navy }}>{rc.referredName}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                      {isCredited ? `₹${rc.creditInr} credited ${fmtDate(rc.creditedAt)}` : `₹${rc.creditInr} pending`}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: isCredited ? '#059669' : C.gray500 }}>₹{rc.creditInr}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Standard promo codes */}
        <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
          Promo Codes
        </Text>

        {standardPromos.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.gray200, borderStyle: 'dashed' }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🎟️</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700 }}>No Promo Codes</Text>
            <Text style={{ fontSize: 13, color: C.gray400, marginTop: 6 }}>Create a promo code to offer discounts.</Text>
          </View>
        ) : (
          standardPromos.map((p: any) => (
            <View key={p.id ?? p.code} style={{
              backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12,
              borderWidth: 1, borderColor: C.gray100,
              opacity: p.isActive === false ? 0.6 : 1,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy, letterSpacing: 1 }}>{p.code}</Text>
                  {p.isPublic && p.isActive !== false ? (
                    <View style={{ backgroundColor: '#D1FAE5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>● LIVE</Text>
                    </View>
                  ) : p.isActive === false ? (
                    <View style={{ backgroundColor: C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray500 }}>INACTIVE</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: C.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.gray500 }}>DRAFT</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#059669' }}>{Number(p.discountPct).toFixed(0)}% off</Text>
              </View>

              {p.label && <Text style={{ fontSize: 13, color: C.gray600 ?? C.gray500, marginBottom: 4 }}>{p.label}</Text>}

              <Text style={{ fontSize: 12, color: C.gray400 }}>
                {DURATION_LABELS[p.discountDurationType ?? p.durationType] ?? p.durationType}
                {(p.discountDurationType === 'MONTHS' || p.durationType === 'MONTHS') && p.discountDurationMonths ? ` · ${p.discountDurationMonths} months` : ''}
                {p.appliesToPlans ? ` · Plans: ${p.appliesToPlans}` : ''}
                {` · ${p.usesCount ?? 0}${p.maxUses ? `/${p.maxUses}` : ''} uses`}
                {p.validUntil ? ` · exp ${fmtDate(p.validUntil)}` : ''}
              </Text>

              {p.isActive !== false && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setEditing(p)}
                    style={{ flex: 1, backgroundColor: C.navy50, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => visibilityMut.mutate({ id: p.id, isPublic: !p.isPublic })}
                    disabled={visibilityMut.isPending}
                    style={{ flex: 1, backgroundColor: p.isPublic ? '#FEF2F2' : '#D1FAE5', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: p.isPublic ? '#DC2626' : '#059669' }}>
                      {p.isPublic ? 'Take Offline' : 'Make Live'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert(
                      'Deactivate Promotion',
                      `Deactivate "${p.code}"? This cannot be undone.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Deactivate', style: 'destructive', onPress: () => deactivateMut.mutate(p.id) },
                      ]
                    )}
                    style={{ backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 14, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray500 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
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
