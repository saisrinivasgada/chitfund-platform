import { useEffect, useRef } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { getLinkingURL } from 'expo-linking';
import { requireOptionalNativeModule } from 'expo';
import { useNavigationContainerRef, useRootNavigationState, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { linkQaPath, linkQaTraceEndpoint } from '../utils/linkQaTrace';

const endpoint = linkQaTraceEndpoint(process.env.EXPO_PUBLIC_LINK_QA_TRACE, process.env.EXPO_PUBLIC_API_URL);
type NativeLinking = {
  addListener(name: 'onURLReceived', listener: (event: { url: string }) => void): { remove(): void };
};

export function NativeLinkDiagnostics() {
  return Platform.OS === 'ios' && endpoint ? <ActiveDiagnostics /> : null;
}

/** Observes only; it never navigates, retries a link or changes authentication. */
function ActiveDiagnostics() {
  const segments = useSegments();
  const root = useRootNavigationState();
  const navigation = useNavigationContainerRef();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const boot = useRef(`${Date.now()}`);
  const snapshot = {
    segments: segments.join('/'), rootReady: navigation.isReady(), authLoading,
    role: user?.role ?? null, rootRoutes: root?.routeNames?.join(',') ?? '',
    appState: AppState.currentState,
  };
  const current = useRef(snapshot);
  current.current = snapshot;
  const emit = useRef((phase: string, url?: string | null) => {
    fetch(endpoint!, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase, boot: boot.current, at: Date.now(), ...current.current,
        linkPath: linkQaPath(url), nativeValue: linkQaPath(getLinkingURL()) }),
    }).catch(() => {});
  }).current;

  useEffect(() => { emit('route-snapshot'); }, [snapshot.segments, snapshot.rootReady,
    snapshot.authLoading, snapshot.role, snapshot.rootRoutes, emit]);

  useEffect(() => {
    emit('observers-attached');
    const rn = Linking.addEventListener('url', ({ url }) => emit('rn-url-event', url));
    const native = requireOptionalNativeModule<NativeLinking>('ExpoLinking');
    const expo = native?.addListener('onURLReceived', ({ url }) => emit('expo-url-event', url));
    const state = AppState.addEventListener('change', (value) => {
      current.current = { ...current.current, appState: value };
      emit('app-state');
    });
    let prior: string | null | undefined;
    const poll = () => {
      const value = getLinkingURL();
      if (value !== prior) { prior = value; emit('native-registry-value', value); }
    };
    poll();
    const timer = setInterval(poll, 250);
    return () => { rn.remove(); expo?.remove(); state.remove(); clearInterval(timer); };
  }, [emit]);
  return null;
}
