import { Modal, View, Text, TouchableOpacity, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';
import { getCapabilityGateInfo } from '../services/api';
import { C } from './ui';

function fmtPaise(p: number) {
  if (!p) return 'Free';
  return '₹' + (p / 100).toLocaleString('en-IN');
}

export default function CapabilityGateModal() {
  const { capabilityGateKey, hideCapabilityGate } = useUIStore();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['capability-gate', capabilityGateKey],
    queryFn: () => getCapabilityGateInfo(capabilityGateKey!),
    enabled: !!capabilityGateKey,
    staleTime: 300_000,
  });

  const info = data as any;

  return (
    <Modal
      visible={!!capabilityGateKey}
      transparent
      animationType="slide"
      onRequestClose={hideCapabilityGate}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={hideCapabilityGate}
      >
        <Pressable
          style={{
            backgroundColor: C.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 36,
            maxHeight: '90%',
          }}
          onPress={() => {}}
        >
          {/* Handle bar */}
          <View style={{ width: 40, height: 4, backgroundColor: C.gray300, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={C.navy} />
            </View>
          ) : info ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Lock icon + name */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: C.navy50,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <Text style={{ fontSize: 28 }}>🔒</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.navy, textAlign: 'center' }}>
                  {info.name ?? 'Feature locked'}
                </Text>
              </View>

              {/* Description */}
              {info.description ? (
                <Text style={{ fontSize: 14, color: C.gray600 ?? C.gray500, textAlign: 'center', lineHeight: 21, marginBottom: 12 }}>
                  {info.description}
                </Text>
              ) : null}

              {/* Why important */}
              {info.importance ? (
                <View style={{
                  backgroundColor: '#FEF3C7',
                  borderRadius: 12, padding: 14, marginBottom: 20,
                  borderLeftWidth: 3, borderLeftColor: C.gold,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber, marginBottom: 4 }}>
                    WHY IT MATTERS FOR CHIT FUNDS
                  </Text>
                  <Text style={{ fontSize: 13, color: C.gray700, lineHeight: 19 }}>
                    {info.importance}
                  </Text>
                </View>
              ) : null}

              {/* Upgrade plans */}
              {(info.upgradePlans ?? []).length > 0 ? (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray500, letterSpacing: 0.8, marginBottom: 10 }}>
                    UNLOCK WITH
                  </Text>
                  {(info.upgradePlans as any[]).map((p: any) => (
                    <View key={p.plan} style={{
                      borderRadius: 14, borderWidth: 1.5, borderColor: C.navy,
                      backgroundColor: C.white, padding: 14, marginBottom: 10,
                    }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: C.navy }}>{p.displayName ?? p.plan}</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>
                          {fmtPaise(p.priceMonthlyInr)}<Text style={{ fontSize: 11, fontWeight: '400', color: C.gray400 }}>/mo</Text>
                        </Text>
                      </View>
                      {(p.features ?? []).slice(0, 3).map((f: string, i: number) => (
                        <Text key={i} style={{ fontSize: 12, color: C.gray600 ?? C.gray500, marginBottom: 2 }}>✓ {f}</Text>
                      ))}
                    </View>
                  ))}
                </>
              ) : null}

              {/* CTAs */}
              <TouchableOpacity
                onPress={() => {
                  hideCapabilityGate();
                  router.push('/(app)/(admin)/billing');
                }}
                style={{
                  backgroundColor: C.gold, borderRadius: 14,
                  paddingVertical: 14, marginTop: 8, alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Upgrade Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={hideCapabilityGate} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: C.gray400 }}>Maybe later</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={{ paddingVertical: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy, textAlign: 'center', marginBottom: 8 }}>
                Feature not available on your plan
              </Text>
              <Text style={{ fontSize: 13, color: C.gray500, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                Upgrade your plan to unlock this feature and more.
              </Text>
              <TouchableOpacity
                onPress={() => { hideCapabilityGate(); router.push('/(app)/(admin)/billing'); }}
                style={{ backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>View Plans</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={hideCapabilityGate} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: C.gray400 }}>Maybe later</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
