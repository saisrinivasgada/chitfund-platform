import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { acceptLegalUpdate, getLegalReviewStatus, LegalReviewStatus } from '../services/api';
import { roleHomePath } from '../utils/roleRoutes';
import { legalDocumentUrl } from '../../shared/legalDocumentUrl';

const reviewUrl = (document: { version?: string; documentUrl?: string } | undefined, kind: 'terms' | 'privacy') =>
  legalDocumentUrl(document, kind, {
    baseUrl: 'https://thechitwise.com', allowedOrigins: ['https://thechitwise.com'],
  });

function DocumentChange({ title, version, summary, url }: {
  title: string; version?: string; summary?: string; url: string;
}) {
  return <View style={{ paddingVertical: 18, borderTopWidth: 1, borderTopColor: C.gray200 }}>
    <Text style={{ color: C.gray900, fontSize: 16, fontWeight: '700' }}>{title}{version ? ` · version ${version}` : ''}</Text>
    {summary ? <Text style={{ color: C.gray700, fontSize: 14, lineHeight: 21, marginTop: 7 }}>{summary}</Text> : null}
    <Text accessibilityRole="link" onPress={() => Linking.openURL(url)}
      style={{ color: C.navy, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline', marginTop: 9 }}>
      Read the full {title}
    </Text>
  </View>;
}

export default function LegalReviewScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const hub = user?.authSource === 'HUB';
  const [status, setStatus] = useState<LegalReviewStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setStatus(null);
    setError('');
    try {
      setStatus(await getLegalReviewStatus(hub));
    } catch {
      setError('Could not load the updated documents. Connect to the internet and try again.');
    } finally {
      setLoading(false);
    }
  }, [hub, user]);

  useEffect(() => { load(); }, [load]);

  const termsUpdated = status?.terms?.requiresAcceptance === true;
  const privacyUpdated = status?.privacy?.requiresAcknowledgment === true;
  const needsReview = termsUpdated || privacyUpdated;
  const termsUrl = termsUpdated ? reviewUrl(status?.terms, 'terms') : null;
  const privacyUrl = privacyUpdated ? reviewUrl(status?.privacy, 'privacy') : null;
  const invalidStatus = typeof status?.required !== 'boolean' || (status.required && !needsReview)
    || (termsUpdated && !termsUrl) || (privacyUpdated && !privacyUrl);

  const proceed = async () => {
    if (!user || !checked || !needsReview || invalidStatus || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await acceptLegalUpdate({
        termsVersion: termsUpdated ? status!.terms!.version! : null,
        privacyVersion: privacyUpdated ? status!.privacy!.version! : null,
        termsAccepted: termsUpdated,
        privacyAcknowledged: privacyUpdated,
      }, hub);
      if (result?.required) {
        setChecked(false);
        await load();
      } else router.replace(roleHomePath(user.role) as any);
    } catch (err: any) {
      if ([409, 428].includes(err?.response?.status)) {
        setChecked(false);
        await load();
      } else setError('Could not save your response. Please try again when you are online.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => Alert.alert('Sign out?',
    'If you have saved payments that have not synced, signing out may delay their submission.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', onPress: async () => {
        await logout();
        router.replace(hub ? '/(auth)/hub-login' : '/(auth)/login');
      } },
    ]);

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingTop: 36, paddingBottom: 42 }}>
      <Text style={{ color: C.navy, fontSize: 19, fontWeight: '800', marginBottom: 26 }}>ChitWise</Text>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white, padding: 22 }}>
        <Text style={{ color: C.gray900, fontSize: 25, fontWeight: '800' }}>Review updated documents</Text>
        <Text style={{ color: C.gray600, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>Please review what changed before continuing with your account.</Text>
        {loading ? <Text style={{ color: C.gray600 }}>Loading the latest documents…</Text> : null}
        {!loading && termsUpdated && termsUrl ? <DocumentChange title="Terms of Service" version={status?.terms?.version}
          summary={status?.terms?.summary} url={termsUrl} /> : null}
        {!loading && privacyUpdated && privacyUrl ? <DocumentChange title="Privacy Policy" version={status?.privacy?.version}
          summary={status?.privacy?.summary} url={privacyUrl} /> : null}
        {!loading && !error && invalidStatus ? <Text accessibilityRole="alert" style={{ color: C.red, marginTop: 12 }}>The latest document details are unavailable. Please retry.</Text> : null}
        {!loading && !error && !needsReview && !invalidStatus ? <Text style={{ color: C.gray700 }}>Your documents are up to date.</Text> : null}
        {!!error && <Text accessibilityRole="alert" style={{ color: C.red, lineHeight: 20, marginTop: 12 }}>{error}</Text>}

        {!loading && needsReview && !invalidStatus && !error ? <>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setChecked((value) => !value)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 22 }}>
            <View style={{ width: 21, height: 21, borderWidth: 1.5, borderColor: C.navy, borderRadius: 5, backgroundColor: checked ? C.navy : C.white, alignItems: 'center', justifyContent: 'center' }}>
              {checked ? <Text style={{ color: C.white }}>✓</Text> : null}
            </View>
            <Text style={{ color: C.gray700, flex: 1, fontSize: 14, lineHeight: 21 }}>
              {termsUpdated ? 'I have reviewed and agree to the updated Terms of Service' : 'I have reviewed the updated Privacy Policy'}
              {termsUpdated && privacyUpdated ? ', and I acknowledge the updated Privacy Policy.' : '.'}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: C.gray600, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
            By selecting {termsUpdated ? 'Agree & continue' : 'Acknowledge & continue'}, you confirm the statement above. A Privacy Policy acknowledgement does not give consent for a new use of your data.
          </Text>
          <TouchableOpacity onPress={proceed} disabled={!checked || saving}
            style={{ marginTop: 23, borderRadius: 12, backgroundColor: C.navy, padding: 15, alignItems: 'center', opacity: !checked || saving ? 0.5 : 1 }}>
            <Text style={{ color: C.white, fontWeight: '700', fontSize: 15 }}>{saving ? 'Saving…' : termsUpdated ? 'Agree & continue' : 'Acknowledge & continue'}</Text>
          </TouchableOpacity>
        </> : null}
        {!loading && !needsReview && !invalidStatus && !error ? <TouchableOpacity onPress={() => router.replace(roleHomePath(user?.role ?? '') as any)}
          style={{ marginTop: 22, borderRadius: 12, backgroundColor: C.navy, padding: 15, alignItems: 'center' }}>
          <Text style={{ color: C.white, fontWeight: '700' }}>Continue to ChitWise</Text>
        </TouchableOpacity> : null}
        {!loading && (error || invalidStatus) ? <TouchableOpacity onPress={load} style={{ marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: C.gray300, padding: 13, alignItems: 'center' }}>
          <Text style={{ color: C.navy, fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity onPress={signOut} style={{ alignSelf: 'flex-start', marginTop: 28, paddingVertical: 7 }}>
          <Text style={{ color: C.gray600, textDecorationLine: 'underline' }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
