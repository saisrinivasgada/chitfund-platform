import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Share, TouchableOpacity, Alert, Modal, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getBillingInfo, getMyTenantLimits, myBillingPayments,
  requestRenewal, requestPlanUpgrade, getPublicPlans,
} from '../../../services/api';
import { C, T, GlassCard, LoadingScreen, Button } from '../../../components/ui';
import { toast } from '../../../components/Toast';

function InfoRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <Text style={{ fontSize: 13, color: C.gray500 }}>{label}</Text>
      <Text style={[{ fontSize: 13, fontWeight: '600', color: C.gray900 }, valueStyle]}>{value}</Text>
    </View>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    BASIC:      { bg: '#F3F4F6', text: '#374151' },
    GROWTH:     { bg: '#DBEAFE', text: '#1D4ED8' },
    ENTERPRISE: { bg: '#EDE9FE', text: '#6D28D9' },
    CUSTOM:     { bg: '#FEF3C7', text: '#92400E' },
  };
  const c = colors[plan?.toUpperCase()] ?? colors.BASIC;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>{plan ?? 'BASIC'}</Text>
    </View>
  );
}

function fmtDate(dt: string | null | undefined) {
  if (!dt) return null;
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtInr(val: number | null | undefined) {
  if (val == null) return '₹0';
  return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPaise(paise: number | null | undefined) {
  if (paise == null) return '₹0';
  return '₹' + (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── Usage bar ──────────────────────────────────────────────────────────────────
function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const danger  = !unlimited && pct >= 90;
  const warn    = !unlimited && pct >= 70 && pct < 90;
  const barColor = danger ? C.red : warn ? '#F59E0B' : C.navy;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 12, color: C.gray600 ?? C.gray500 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: danger ? C.red : C.gray700 }}>
          {used} / {unlimited ? '∞' : limit}
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: C.gray100, borderRadius: 3, overflow: 'hidden' }}>
        {unlimited ? (
          <View style={{ height: 6, backgroundColor: C.gray200, borderRadius: 3 }} />
        ) : (
          <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: barColor, borderRadius: 3 }} />
        )}
      </View>
    </View>
  );
}

// ── Plan upgrade modal ────────────────────────────────────────────────────────
function UpgradeModal({
  visible, onClose, plans, currentPlan,
}: {
  visible: boolean; onClose: () => void; plans: any[]; currentPlan: string;
}) {
  const [selected, setSelected] = useState('');
  const qc = useQueryClient();

  const upgradeMut = useMutation({
    mutationFn: () => requestPlanUpgrade(selected),
    onSuccess: () => {
      toast.saved('Upgrade request submitted — our team will reach out shortly');
      qc.invalidateQueries({ queryKey: ['m-billing-info'] });
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to submit upgrade request'),
  });

  const upgradable = plans.filter((p) => p.plan !== currentPlan?.toUpperCase());

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Change Plan</Text>
            <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Select the plan you'd like</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 28, color: C.gray400, lineHeight: 28 }}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {upgradable.map((p) => {
            const isSelected = selected === p.plan;
            const hasDiscount = Number(p.globalDiscountPct ?? 0) > 0;
            return (
              <TouchableOpacity
                key={p.plan}
                onPress={() => setSelected(p.plan)}
                style={{
                  borderRadius: 16, padding: 16,
                  borderWidth: 2,
                  borderColor: isSelected ? C.navy : C.gray200,
                  backgroundColor: isSelected ? C.navy50 : C.white,
                }}
              >
                {hasDiscount && (
                  <View style={{ position: 'absolute', top: -10, right: 14, backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{p.globalDiscountPct}% off</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: isSelected ? C.navy : C.gray900 }}>
                    {p.displayName ?? p.plan}
                  </Text>
                  {isSelected && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#fff', fontWeight: '800' }}>✓</Text>
                    </View>
                  )}
                </View>
                {p.tagline && <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 10 }}>{p.tagline}</Text>}
                {(p.features ?? []).slice(0, 4).map((f: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: isSelected ? C.navy : C.gray400 }}>✓</Text>
                    <Text style={{ fontSize: 12, color: C.gray600 ?? C.gray500 }}>{f}</Text>
                  </View>
                ))}
                <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  {p.plan === 'CUSTOM' ? (
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray700 }}>Custom pricing</Text>
                  ) : (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: isSelected ? C.navy : C.gray900 }}>
                        {fmtPaise(p.effectivePriceInr ?? p.priceMonthlyInr)}
                      </Text>
                      {hasDiscount && (
                        <Text style={{ fontSize: 12, color: C.gray400, textDecorationLine: 'line-through' }}>
                          {fmtPaise(p.priceMonthlyInr)}
                        </Text>
                      )}
                      <Text style={{ fontSize: 12, color: C.gray400 }}>/mo</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200 }}>
          <Button
            label={upgradeMut.isPending ? 'Requesting…' : 'Request Plan Change'}
            onPress={() => upgradeMut.mutate()}
            loading={upgradeMut.isPending}
            disabled={!selected}
            variant="primary"
            fullWidth
          />
          <Text style={{ fontSize: 11, color: C.gray400, textAlign: 'center', marginTop: 8 }}>
            Our team will confirm and process your request within 24 hours.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BillingScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: billing, isLoading, refetch: refetchBilling } = useQuery({
    queryKey: ['m-billing-info'],
    queryFn: getBillingInfo,
    staleTime: 60_000,
  });
  const { data: limits, refetch: refetchLimits } = useQuery({
    queryKey: ['m-tenant-limits'],
    queryFn: getMyTenantLimits,
    staleTime: 120_000,
  });
  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ['m-billing-payments'],
    queryFn: myBillingPayments,
    staleTime: 120_000,
  });
  const { data: publicPlans = [] } = useQuery({
    queryKey: ['public-plans'],
    queryFn: getPublicPlans,
    staleTime: 600_000,
  });

  const qc = useQueryClient();
  const renewalMut = useMutation({
    mutationFn: requestRenewal,
    onSuccess: () => {
      toast.saved('Renewal request submitted — our team will reach out shortly');
      qc.invalidateQueries({ queryKey: ['m-billing-info'] });
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed'),
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchBilling(), refetchLimits(), refetchPayments()]);
    setRefreshing(false);
  }

  function copyReferralCode() {
    if (!billing?.referralCode) return;
    Clipboard.setString(billing.referralCode);
    toast.saved('Referral code copied!');
  }

  function shareReferralCode() {
    if (!billing?.referralCode) return;
    Share.share({
      message: `Use my referral code ${billing.referralCode} when signing up on ChitWise to get a discount on your plan!`,
    });
  }

  if (isLoading && !billing) return <LoadingScreen />;

  const discountActive = billing?.appliedDiscountPct && Number(billing.appliedDiscountPct) > 0;
  const discountExpiry = billing?.promoDiscountUntil ? fmtDate(billing.promoDiscountUntil) : null;
  const isExpired = billing?.planExpiresAt && new Date(billing.planExpiresAt) < new Date();

  function durationLabel() {
    if (!billing?.discountDurationType) return null;
    if (billing.discountDurationType === 'ONCE') return 'First billing cycle only';
    if (billing.discountDurationType === 'MONTHS') return discountExpiry ? `Until ${discountExpiry}` : 'Limited time';
    if (billing.discountDurationType === 'FOREVER') return 'Never expires';
    return null;
  }

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
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>Plan & Billing</Text>
          <Text style={{ fontSize: 12, color: C.gray400 }}>Subscription, usage & credits</Text>
        </View>
        {isExpired && (
          <TouchableOpacity
            onPress={() => Alert.alert(
              'Request Renewal',
              'Submit a renewal request? Our team will process it within 24 hours.',
              [{ text: 'Cancel', style: 'cancel' }, { text: 'Request', onPress: () => renewalMut.mutate() }]
            )}
            style={{ backgroundColor: '#DC2626', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Renew</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Expired banner */}
        {isExpired && (
          <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 20 }}>🚫</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>Plan Expired</Text>
              <Text style={{ fontSize: 12, color: '#B91C1C', marginTop: 2 }}>
                Expired on {fmtDate(billing?.planExpiresAt)}. Contact us to renew.
              </Text>
            </View>
          </View>
        )}

        {/* Plan card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>Current Plan</Text>
            <PlanBadge plan={billing?.plan ?? 'BASIC'} />
          </View>

          <InfoRow label="Plan" value={billing?.planLabel ?? 'Basic'} />
          <InfoRow label="Base price / month" value={fmtPaise(billing?.priceMonthlyInr)} />

          {discountActive && (
            <>
              <InfoRow
                label={`Promo (${billing?.promoLabel ?? ''})`}
                value={`−${Number(billing?.appliedDiscountPct).toFixed(0)}%`}
                valueStyle={{ color: '#059669' }}
              />
              <InfoRow
                label="Your price / month"
                value={fmtPaise(billing?.effectivePriceInr)}
                valueStyle={{ color: C.navy, fontWeight: '700' }}
              />
              {durationLabel() && (
                <View style={{ marginTop: 8, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10 }}>
                  <Text style={{ fontSize: 12, color: '#065F46' }}>{durationLabel()}</Text>
                </View>
              )}
            </>
          )}

          {!discountActive && (
            <InfoRow
              label="Your price / month"
              value={fmtPaise(billing?.priceMonthlyInr)}
              valueStyle={{ color: C.navy, fontWeight: '700' }}
            />
          )}

          {billing?.planExpiresAt && (
            <InfoRow
              label="Plan expires"
              value={fmtDate(billing.planExpiresAt) ?? ''}
              valueStyle={{ color: isExpired ? '#DC2626' : C.gray900 }}
            />
          )}

          {/* Change plan */}
          <TouchableOpacity
            onPress={() => setShowUpgrade(true)}
            style={{
              marginTop: 14, borderWidth: 1.5, borderColor: C.navy,
              borderRadius: 12, paddingVertical: 11, alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>
              {isExpired ? 'Renew / Change Plan' : 'Change Plan'}
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Usage limits */}
        {limits && (
          <GlassCard style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, marginBottom: 16 }}>Plan Usage</Text>
            <UsageBar label="Members"    used={limits.currentMembers ?? 0}  limit={limits.maxMembers ?? -1} />
            <UsageBar label="Chit Funds" used={limits.currentChits ?? 0}    limit={limits.maxChits ?? -1} />
            <UsageBar label="Staff"      used={limits.currentStaff ?? 0}    limit={limits.maxStaff ?? -1} />
            <UsageBar label="Managers"   used={limits.currentManagers ?? 0} limit={limits.maxManagers ?? -1} />
          </GlassCard>
        )}

        {/* Credits card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, marginBottom: 16 }}>Credits</Text>

          <InfoRow
            label="Credit balance"
            value={fmtPaise(billing?.creditBalanceInr)}
            valueStyle={{ color: '#059669', fontSize: 15 }}
          />
          <InfoRow
            label="Estimated next bill"
            value={fmtPaise(billing?.nextBillingEstimate)}
            valueStyle={{ color: C.navy, fontWeight: '700' }}
          />

          {Number(billing?.creditBalanceInr) > 0 && (
            <View style={{ marginTop: 10, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, color: '#1D4ED8' }}>
                Your {fmtPaise(billing?.creditBalanceInr)} credit will be applied to your next invoice automatically.
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Payment history */}
        {(payments as any[]).length > 0 && (
          <GlassCard style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, marginBottom: 16 }}>Payment History</Text>
            {(payments as any[]).map((p: any, i: number) => {
              const typeLabels: Record<string, string> = {
                PURCHASE: 'Purchase', RENEWAL: 'Renewal', UPGRADE: 'Upgrade', REFUND: 'Refund',
              };
              const typeColors: Record<string, string> = {
                PURCHASE: '#1D4ED8', RENEWAL: '#16A34A', UPGRADE: '#7C3AED', REFUND: '#DC2626',
              };
              const col = typeColors[p.paymentType] ?? C.gray500;
              const paymentReceipt = (p.receipts ?? []).find((r: any) => r.type === 'PAYMENT');
              const refundReceipt  = (p.receipts ?? []).find((r: any) => r.type === 'REFUND');

              function shareReceipt(receipt: any) {
                const org = receipt.tenantName ?? p.tenantName ?? '';
                const plan = p.toPlanName ?? p.planName ?? '';
                const period = p.planPeriodStart && p.planPeriodEnd
                  ? `${fmtDate(p.planPeriodStart)} – ${fmtDate(p.planPeriodEnd)}`
                  : '';
                const lines = [
                  '━━━━━━━━━━━━━━━━━━━━',
                  'ChitWise Receipt',
                  '━━━━━━━━━━━━━━━━━━━━',
                  `Receipt No: ${receipt.receiptNumber}`,
                  `Date: ${fmtDate(receipt.issuedAt ?? p.paidAt ?? p.createdAt)}`,
                  org ? `Organization: ${org}` : '',
                  plan ? `Plan: ${plan}` : '',
                  period ? `Period: ${period}` : '',
                  p.paymentMethod ? `Method: ${p.paymentMethod}` : '',
                  p.paymentReference ? `Reference: ${p.paymentReference}` : '',
                  `${receipt.type === 'REFUND' ? 'Refund Amount' : 'Amount Paid'}: ${fmtPaise(receipt.amountPaise)}`,
                  '━━━━━━━━━━━━━━━━━━━━',
                  'This is a computer-generated receipt',
                ].filter(Boolean).join('\n');
                Share.share({ message: lines });
              }

              return (
                <View key={p.id ?? i} style={{
                  paddingVertical: 12,
                  borderBottomWidth: i < (payments as any[]).length - 1 ? 1 : 0,
                  borderBottomColor: C.gray100,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                          {typeLabels[p.paymentType] ?? p.paymentType}
                        </Text>
                        <View style={{ backgroundColor: col + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: col }}>{p.paymentType}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {fmtDate(p.paidAt ?? p.createdAt)} · {p.paymentMethod ?? ''}
                      </Text>
                      {p.toPlanName && <Text style={{ fontSize: 11, color: C.gray500 }}>{p.toPlanName}</Text>}
                      {paymentReceipt && (
                        <Text style={{ fontSize: 10, color: C.navy, marginTop: 2, fontFamily: 'monospace' }}>
                          #{paymentReceipt.receiptNumber}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: p.paymentType === 'REFUND' ? C.red : C.gray900 }}>
                        {p.paymentType === 'REFUND' ? '− ' : ''}
                        {fmtPaise(p.amountPaise)}
                      </Text>
                      {paymentReceipt && (
                        <TouchableOpacity
                          onPress={() => shareReceipt(paymentReceipt)}
                          style={{ backgroundColor: C.navy + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: C.navy }}>⬆ Receipt</Text>
                        </TouchableOpacity>
                      )}
                      {refundReceipt && (
                        <TouchableOpacity
                          onPress={() => shareReceipt(refundReceipt)}
                          style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: C.red }}>⬆ Refund Receipt</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </GlassCard>
        )}

        {/* Referral card */}
        {billing?.referralCode && (
          <GlassCard>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, marginBottom: 4 }}>Referral</Text>
            <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 14 }}>
              Share your code — friends get a discount and you earn billing credits.
            </Text>

            <View style={{ backgroundColor: C.gray50, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy, letterSpacing: 1.5, fontFamily: 'monospace' }}>
                {billing.referralCode}
              </Text>
              <TouchableOpacity onPress={copyReferralCode}
                style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Copy</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={shareReferralCode}
              style={{ backgroundColor: '#EFF4FA', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy }}>Share referral code</Text>
            </TouchableOpacity>
          </GlassCard>
        )}
      </ScrollView>

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        plans={publicPlans as any[]}
        currentPlan={billing?.plan ?? ''}
      />
    </SafeAreaView>
  );
}
