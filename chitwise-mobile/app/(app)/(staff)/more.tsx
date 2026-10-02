import { View, Text, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import { useToolkitStore } from '../../../store/toolkitStore';
import { TutorialSettingsRow } from '../../../tutorials/TutorialProvider';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const OPACITY_STEPS = [
  { label: 'Ghost', value: 0.25 }, { label: 'Dim', value: 0.5 },
  { label: 'Normal', value: 0.75 }, { label: 'Full', value: 1.0 },
];
const SIZE_STEPS = [
  { label: 'S', value: 36 }, { label: 'M', value: 44 }, { label: 'L', value: 52 },
];

function ToolkitSettingsCard() {
  const { enabled, opacity, buttonSize, setEnabled, setOpacity, setButtonSize } = useToolkitStore();

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: C.gray100,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: enabled ? 14 : 0 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.navy + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>⌗</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Quick Toolkit</Text>
          <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>Floating calculator & screen refresh</Text>
        </View>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: C.navy, false: C.gray200 }} thumbColor="#fff" />
      </View>

      {enabled && (
        <>
          <View style={{ height: 1, backgroundColor: C.gray100, marginBottom: 14 }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>BUTTON OPACITY</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {OPACITY_STEPS.map((s) => (
              <TouchableOpacity key={s.label} onPress={() => setOpacity(s.value)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: Math.abs(opacity - s.value) < 0.05 ? C.navy : C.gray100 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Math.abs(opacity - s.value) < 0.05 ? '#fff' : C.gray600 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 8 }}>BUTTON SIZE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SIZE_STEPS.map((s) => (
              <TouchableOpacity key={s.label} onPress={() => setButtonSize(s.value)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: buttonSize === s.value ? C.navy : C.gray100 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: buttonSize === s.value ? '#fff' : C.gray600 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: C.gray400, marginTop: 12 }}>
            Tap → calculator · Long-press → refresh · Drag to move
          </Text>
        </>
      )}
    </View>
  );
}

export default function StaffMoreScreen() {
  const { user } = useAuthStore();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <View>
            <Text style={T.h1}>More</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>Tools & settings</Text>
          </View>
          <ProfileAvatarButton size={38} />
        </View>

        <View style={{ gap: 10 }}>
          <TutorialSettingsRow />
          <ToolkitSettingsCard />
        </View>

        <View style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.gray400 }}>
            {user?.fullName ?? user?.username} · Staff
          </Text>
          <Text style={{ fontSize: 11, color: C.gray300, marginTop: 3 }}>ChitWise</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
