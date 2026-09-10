import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import { getMe, getMyMemberProfile } from '../../../services/api';
import { C } from '../../../components/ui';
import EditProfileModal from '../../../components/EditProfileModal';

function InfoRow({ label, value, onEdit }: { label: string; value?: string | null; onEdit: () => void }) {
  return (
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.gray100 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: value ? C.gray900 : C.gray300 }}>
          {value || 'Not set'}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: C.gray300 }}>✎</Text>
    </TouchableOpacity>
  );
}

type ProfileTab = 'profile' | 'security' | 'history' | 'accounts';

const MEMBER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE:      { bg: '#DCFCE7', text: '#15803D' },
  BLACKLISTED: { bg: '#FEE2E2', text: '#B91C1C' },
  INACTIVE:    { bg: '#F3F4F6', text: '#6B7280' },
};

export default function MemberMyAccountScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [editTab, setEditTab] = useState<ProfileTab | null>(null);
  const showEdit = editTab !== null;
  const setShowEdit = (v: boolean) => setEditTab(v ? 'profile' : null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: memberMe } = useQuery({ queryKey: ['member-me'], queryFn: getMyMemberProfile });

  const initials = ((me?.fullName ?? me?.username ?? 'M') as string).slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>My Account</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Avatar card */}
        <View style={{ backgroundColor: C.white, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
          <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#D4A017', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff' }}>{initials}</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.navy, marginBottom: 4 }}>
            {me?.fullName ?? me?.username ?? '—'}
          </Text>
          {me?.username && (
            <Text style={{ fontSize: 13, color: C.gray400, marginBottom: 6 }}>@{me.username}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ backgroundColor: '#D97706' + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>MEMBER</Text>
            </View>
            {memberMe?.status && (() => {
              const s = MEMBER_STATUS_COLORS[memberMe.status] ?? MEMBER_STATUS_COLORS.INACTIVE;
              return (
                <View style={{ backgroundColor: s.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: s.text }}>{memberMe.status}</Text>
                </View>
              );
            })()}
          </View>
        </View>

        {/* Login account fields */}
        <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>LOGIN ACCOUNT</Text>
          <InfoRow label="Full Name" value={me?.fullName} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Username" value={me?.username ? `@${me.username}` : null} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Email" value={me?.email} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Phone (tap to change via OTP)" value={me?.phone ? `${me.phoneCountryCode ?? '+91'} ${me.phone}` : null} onEdit={() => setShowEdit(true)} />
          <View style={{ height: 4 }} />
        </View>

        {/* Member profile fields */}
        <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>MEMBER PROFILE</Text>
          <InfoRow label="Member Name" value={memberMe?.fullName} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Member Phone" value={memberMe?.phone} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Contact Email" value={memberMe?.email} onEdit={() => setShowEdit(true)} />
          <InfoRow label="Address" value={memberMe?.address} onEdit={() => setShowEdit(true)} />
          <InfoRow label="City" value={memberMe?.city} onEdit={() => setShowEdit(true)} />
          {/* Read-only — PAN and referrer are set by the admin, not self-editable */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 2 }}>PAN</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: memberMe?.panNumber ? C.gray900 : C.gray300 }}>
                {memberMe?.panNumber || 'Not set'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray400, marginBottom: 2 }}>Referred By</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: memberMe?.referredByName ? C.gray900 : C.gray300 }}>
                {memberMe?.referredByName || 'Not set'}
              </Text>
            </View>
          </View>
          <View style={{ height: 4 }} />
        </View>

        {/* Security */}
        <View style={{ backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, paddingTop: 14, paddingBottom: 4 }}>SECURITY</Text>
          <TouchableOpacity onPress={() => setEditTab('security')} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Change Password</Text>
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>Update your login password</Text>
            </View>
            <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditTab('accounts')} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.gray100 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Saved Accounts</Text>
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>Switch or manage linked accounts</Text>
            </View>
            <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditTab('history')} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.gray100 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>Profile Change History</Text>
              <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>What changed on your account</Text>
            </View>
            <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
          </TouchableOpacity>
          <View style={{ height: 4 }} />
        </View>

      </ScrollView>

      {showEdit && (
        <EditProfileModal visible initialTab={editTab!} onClose={() => setEditTab(null)} />
      )}
    </SafeAreaView>
  );
}
