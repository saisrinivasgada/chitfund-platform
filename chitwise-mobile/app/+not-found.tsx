import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <Text style={{ fontSize: 72, marginBottom: 16 }}>🔍</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.navy, textAlign: 'center', marginBottom: 8 }}>
        404
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.gray900, textAlign: 'center', marginBottom: 10 }}>
        Page Not Found
      </Text>
      <Text style={{ fontSize: 14, color: C.gray500, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
        The screen you're looking for doesn't exist or has been moved.
      </Text>

      <View style={{ width: '100%', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ backgroundColor: C.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Go Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.replace('/(app)/(admin)')}
          style={{ backgroundColor: C.white, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.gray200 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: C.gray700 }}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
