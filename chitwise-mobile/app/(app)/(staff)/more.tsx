import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, T } from '../../../components/ui';
import { useAuthStore } from '../../../store/authStore';
import { ToolkitSettingsRow } from '../../../components/ToolkitSettingsRow';
import { MoreSection } from '../../../components/MoreNavigation';
import { TutorialSettingsRow } from '../../../tutorials/TutorialProvider';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

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

        <MoreSection title="App settings"><ToolkitSettingsRow /><TutorialSettingsRow /></MoreSection>

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
