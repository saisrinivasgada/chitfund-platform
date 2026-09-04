import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyInvitations, respondToInvitation } from '../../../services/api';
import { C, T, Badge, GlassCard, Card, LoadingScreen, SectionHeader, EmptyState } from '../../../components/ui';

const fmtINR = (v: number | string) =>
  '₹' + Number(v).toLocaleString('en-IN');

const fmtSlotMonth = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

// ─── Slot Tile ────────────────────────────────────────────────────────────────
function SlotTile({
  slot, isSelected, isMine, isDisabled, onToggle,
}: {
  slot: any;
  isSelected: boolean;
  isMine: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}) {
  let bg = C.white;
  let border = C.green;
  let textColor = C.green;
  let label = '';

  const isTakenByOther = slot.slotStatus === 'RESERVED_BY_OTHER';

  if (isMine) {
    bg = '#FEF9C3'; border = C.gold; textColor = '#92400E'; label = 'Yours';
  } else if (isSelected) {
    bg = C.navy; border = C.navy; textColor = C.white;
  } else if (isTakenByOther) {
    bg = C.gray100; border = C.gray300; textColor = C.gray400; label = 'Taken';
  }

  const canTap = !isDisabled && !isMine && !isTakenByOther;

  return (
    <TouchableOpacity
      disabled={!canTap}
      onPress={onToggle}
      activeOpacity={0.7}
      style={{
        flex: 1, margin: 4, borderRadius: 10, padding: 10,
        backgroundColor: bg, borderWidth: 1.5, borderColor: border,
        alignItems: 'center', minHeight: 72,
        opacity: (isDisabled && !isMine && !isSelected) ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: textColor }}>
        {slot.monthNumber}
      </Text>
      <Text style={{ fontSize: 10, color: textColor, marginTop: 2 }}>
        {fmtSlotMonth(slot.reservationMonth)}*
      </Text>
      {label ? (
        <Text style={{ fontSize: 9, color: textColor, marginTop: 3, fontWeight: '600' }}>{label}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Invitation Card ──────────────────────────────────────────────────────────
function InvitationCard({ inv }: { inv: any }) {
  const qc = useQueryClient();
  const myResponse: any = inv.myResponse ?? {};
  const chit: any = inv.chit ?? {};
  const isReservation = chit.chitType === 'RESERVATION';
  const isClosed = inv.status === 'CLOSED';
  const isApproved = myResponse.approved === true;

  const initialSelected: number[] = myResponse.requestedDrawNumbers ?? [];
  const [selectedDraws, setSelectedDraws] = useState<number[]>(initialSelected);
  const [interested, setInterested] = useState<boolean | null>(
    myResponse.responseStatus === 'INTERESTED' ? true
      : myResponse.responseStatus === 'NOT_INTERESTED' ? false
      : null,
  );
  const [spotsRequested, setSpotsRequested] = useState<number>(myResponse.spotsRequested ?? 1);
  const [reason, setReason] = useState<string>(myResponse.reason ?? '');
  const [isEditing, setIsEditing] = useState(myResponse.responseStatus === 'PENDING');

  const formActive = isEditing && !isApproved && !isClosed;

  const respond = useMutation({
    mutationFn: (body: any) => respondToInvitation(inv.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-invitations'] });
      Alert.alert('Success', 'Your response has been submitted.');
      setIsEditing(false);
    },
    onError: () => Alert.alert('Error', 'Failed to submit. Please try again.'),
  });

  function handleSubmit() {
    if (interested === null) {
      Alert.alert('Select interest', 'Please select Yes or No.');
      return;
    }
    if (isReservation && interested && selectedDraws.length === 0) {
      Alert.alert('Select slots', 'Please select at least one draw slot.');
      return;
    }
    respond.mutate({
      interested,
      reason: interested ? undefined : reason || undefined,
      spotsRequested: !isReservation && interested ? spotsRequested : undefined,
      requestedDrawNumbers: isReservation && interested ? selectedDraws : undefined,
    });
  }

  function toggleDraw(num: number) {
    setSelectedDraws((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num],
    );
  }

  const myDrawNumbers: number[] = myResponse.approvedDrawNumbers ?? myResponse.requestedDrawNumbers ?? [];
  const mySpots: number = myResponse.approvedSpots ?? myResponse.spotsRequested ?? 0;
  const currentHoldings: number[] = inv.memberCurrentDrawNumbers ?? [];
  const currentSpots: number = inv.memberCurrentSpots ?? 0;

  const slots: any[] = inv.slots ?? [];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Card style={{ marginBottom: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy, flex: 1, marginRight: 8 }}>
          {chit.name ?? 'Chit Invitation'}
        </Text>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
          backgroundColor: inv.status === 'OPEN' ? '#D1FAE5' : C.gray100,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: inv.status === 'OPEN' ? C.green : C.gray500 }}>
            {inv.status}
          </Text>
        </View>
      </View>

      {/* Chit Details Grid */}
      <View style={{ backgroundColor: C.navy + '0D', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        {[
          ['Monthly Installment', chit.installmentAmount != null ? fmtINR(chit.installmentAmount) : '—'],
          ['No. of Members', chit.capacity ?? '—'],
          ['Duration', chit.durationMonths ? `${chit.durationMonths} months` : '—'],
          ['Due Date', chit.monthlyDueDate ? `${chit.monthlyDueDate}th of every month` : '—'],
          ['Post-Payout Contribution', chit.defaultPostPayoutContribution != null ? fmtINR(chit.defaultPostPayoutContribution) : '—'],
        ].map(([label, val]) => (
          <View key={label as string} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: C.gray500 }}>{label}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>{String(val)}</Text>
          </View>
        ))}
      </View>

      {/* Admin message */}
      {!!inv.message && (
        <View style={{ backgroundColor: '#EEF2F8', borderRadius: 8, padding: 10, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.navy }}>
          <Text style={{ fontSize: 12, color: C.navy, fontStyle: 'italic' }}>{inv.message}</Text>
        </View>
      )}

      {/* Disclaimer for reservation */}
      {isReservation && (
        <Text style={{ fontSize: 11, color: C.amber, marginBottom: 10 }}>
          ⚠ Months shown are estimated based on anticipated start date and may shift if the chit starts early or late.
        </Text>
      )}

      {/* Current holdings */}
      {isReservation && currentHoldings.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: C.gray600, fontWeight: '600' }}>You currently have:</Text>
          <Text style={{ fontSize: 12, color: C.navy, marginTop: 2 }}>
            Draws: {currentHoldings.join(', ')}
          </Text>
        </View>
      )}
      {!isReservation && currentSpots > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: C.gray600 }}>
            You currently have <Text style={{ fontWeight: '700', color: C.navy }}>{currentSpots} spot{currentSpots > 1 ? 's' : ''}</Text> in this chit.
          </Text>
        </View>
      )}

      {/* Rejected notice */}
      {myResponse.responseStatus === 'REJECTED' && (
        <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#DC2626', fontWeight: '700', marginBottom: 2 }}>Response Not Approved</Text>
          {!!myResponse.adminRejectionReason && (
            <Text style={{ color: '#991B1B', fontSize: 13 }}>Reason: {myResponse.adminRejectionReason}</Text>
          )}
        </View>
      )}

      {/* Approved confirmation */}
      {isApproved && (
        <View style={{ backgroundColor: '#D1FAE5', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          {isReservation ? (
            <Text style={{ color: '#15803D', fontWeight: '700' }}>
              ✓ Confirmed — Draws: {myDrawNumbers.join(', ')}
            </Text>
          ) : (
            <Text style={{ color: '#15803D', fontWeight: '700' }}>
              ✓ Confirmed — {mySpots} spot{mySpots > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* RESERVATION: slot grid */}
      {isReservation && !isApproved && (
        <>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy, marginBottom: 8 }}>
            {formActive ? 'Select your draw slots:' : 'Draw slots:'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            {slots.map((slot: any) => {
              const isMine = slot.slotStatus === 'RESERVED_BY_ME';
              const isSelected = selectedDraws.includes(slot.monthNumber);
              return (
                <View key={slot.id ?? slot.monthNumber} style={{ width: '30%' }}>
                  <SlotTile
                    slot={slot}
                    isSelected={isSelected}
                    isMine={isMine}
                    isDisabled={!formActive}
                    onToggle={() => formActive && toggleDraw(slot.monthNumber)}
                  />
                </View>
              );
            })}
          </View>
          {formActive && selectedDraws.length > 0 && (
            <Text style={{ fontSize: 12, color: C.navy, marginBottom: 8, fontWeight: '600' }}>
              Selected: Draws {selectedDraws.sort((a, b) => a - b).join(', ')}
            </Text>
          )}
        </>
      )}

      {/* LOTTERY / AUCTION: interest form */}
      {!isReservation && !isApproved && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.navy, marginBottom: 8 }}>
            Are you interested?
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {[true, false].map((val) => (
              <TouchableOpacity
                key={String(val)}
                disabled={!formActive}
                onPress={() => formActive && setInterested(val)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                  backgroundColor: interested === val ? C.navy : C.gray100,
                  opacity: !formActive ? 0.6 : 1,
                }}
              >
                <Text style={{ fontWeight: '700', color: interested === val ? C.white : C.gray600 }}>
                  {val ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {interested === true && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: C.gray600, marginBottom: 6 }}>
                {currentSpots > 0
                  ? `Additional spots (currently have ${currentSpots}):`
                  : 'How many spots?'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3, 4].map((n) => (
                  <TouchableOpacity
                    key={n}
                    disabled={!formActive}
                    onPress={() => formActive && setSpotsRequested(n)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                      backgroundColor: spotsRequested === n ? C.navy : C.gray100,
                      opacity: !formActive ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: spotsRequested === n ? C.white : C.gray600 }}>
                      {n === 4 ? '4+' : n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {interested === false && formActive && (
            <TextInput
              placeholder="Reason (optional)"
              placeholderTextColor={C.gray400}
              value={reason}
              onChangeText={setReason}
              multiline
              style={{
                borderWidth: 1, borderColor: C.gray200, borderRadius: 8,
                padding: 10, fontSize: 13, color: C.gray700, minHeight: 60,
                textAlignVertical: 'top',
              }}
            />
          )}

          {interested === false && !formActive && myResponse.reason && (
            <Text style={{ fontSize: 12, color: C.gray500, fontStyle: 'italic' }}>
              Reason: {myResponse.reason}
            </Text>
          )}
        </View>
      )}

      {/* Submit / Edit button */}
      {!isApproved && (
        <>
          {!formActive && !isClosed && (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={{
                backgroundColor: C.navy50, borderWidth: 1, borderColor: '#C7D5E8',
                borderRadius: 8, paddingVertical: 10, alignItems: 'center',
              }}
            >
              <Text style={{ color: C.navy, fontWeight: '600', fontSize: 13 }}>Edit Response</Text>
            </TouchableOpacity>
          )}
          {formActive && (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={respond.isPending}
              style={{
                backgroundColor: C.navy, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
                opacity: respond.isPending ? 0.7 : 1,
              }}
            >
              {respond.isPending ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Text style={{ color: C.white, fontWeight: '700', fontSize: 14 }}>
                  {isReservation && interested && selectedDraws.length > 0
                    ? `Submit (${selectedDraws.length} slot${selectedDraws.length > 1 ? 's' : ''})`
                    : 'Submit Response'}
                </Text>
              )}
            </TouchableOpacity>
          )}
          {isClosed && myResponse.responseStatus === 'PENDING' && (
            <View style={{ backgroundColor: C.gray100, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, color: C.gray500, textAlign: 'center' }}>
                This invitation has been closed.
              </Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function InvitationsScreen() {
  const { data: invitations = [], isLoading, refetch } = useQuery({
    queryKey: ['member-invitations'],
    queryFn: getMyInvitations,
  });

  const pending = invitations.filter(
    (i: any) => i.myResponse?.responseStatus === 'PENDING' && i.status === 'OPEN' && i.myResponse?.responseStatus !== 'REJECTED',
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[T.h2, { flex: 1 }]}>Invitations</Text>
          {pending.length > 0 && (
            <View style={{
              backgroundColor: C.red, borderRadius: 12, minWidth: 24, height: 24,
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
            }}>
              <Text style={{ color: C.white, fontSize: 12, fontWeight: '700' }}>{pending.length}</Text>
            </View>
          )}
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : invitations.length === 0 ? (
          <EmptyState title="No Invitations" message="Admin will send you a payout plan invitation when available." />
        ) : (
          invitations.map((inv: any) => <InvitationCard key={inv.id} inv={inv} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
