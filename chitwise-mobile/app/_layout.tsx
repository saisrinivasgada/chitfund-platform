import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../store/authStore';
import { LoadingScreen } from '../components/ui';
import { ToastRoot } from '../components/Toast';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { TutorialProvider } from '../tutorials/TutorialProvider';
import { getAccountScope } from '../offline/accountScope';
import { createOfflineQueryClient, offlinePersistenceOptions } from '../offline/queryPersistence';
import { SyncRuntime } from '../offline/SyncRuntime';
import { BrandLaunch } from '../components/BrandLaunch';

const hubQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
});
const HUB_BUILD = process.env.EXPO_PUBLIC_APP_VARIANT === 'hub';

function ScopedQueryProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const scope = getAccountScope(user);
  const queryClient = useMemo(() => createOfflineQueryClient(), [scope]);
  const persistence = useMemo(() => scope ? offlinePersistenceOptions(scope) : null, [scope]);

  if (HUB_BUILD || !scope || !persistence) {
    return <QueryClientProvider client={HUB_BUILD ? hubQueryClient : queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider key={scope} client={queryClient} persistOptions={persistence}>
      <SyncRuntime />
      {children}
    </PersistQueryClientProvider>
  );
}

// Maps each role to the ONLY route group that role is allowed to access.
const ROLE_GROUP: Record<string, string> = {
  ADMIN:       '(admin)',
  MANAGER:     '(manager)',
  STAFF:       '(staff)',
  MEMBER:      '(member)',
  SUPER_ADMIN: '(superadmin)',
  SUPPORT_AGENT: '(hub)',
};

function redirectByRole(role: string, router: any) {
  const target = ROLE_GROUP[role];
  if (target) {
    router.replace(`/(app)/${target}`);
  } else {
    router.replace(HUB_BUILD ? '/(auth)/hub-login' : '/(auth)/login');
  }
}

function RealtimeUpdater() {
  const { user } = useAuthStore();
  const organizationSession = !!user && user.authSource !== 'HUB';
  useRealtimeUpdates(organizationSession);
  usePushNotifications(organizationSession);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, accounts, isLoading, loadFromStorage, logout } = useAuthStore();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ addAccount?: string }>();
  const router = useRouter();
  // "Add another account" is reached from Switch Account while a different
  // account is still fully logged in, so the normal "logged in + on an auth
  // screen -> bounce back out" rule must not fire while that pre-existing
  // user is still active. Once a *new* login succeeds, `user` changes identity
  // and this stops applying, so the redirect to the new account's home fires
  // as usual — it only ever suppresses the bounce for the stale/original user.
  const addAccountBaseUserId = useRef<string | null>(null);

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const seg = segments as string[];
    const inAuth = seg[0] === '(auth)';
    const onForceChange = inAuth && seg[1] === 'force-change-password';
    // Instagram/Facebook-style account picker: reachable both when logged out
    // (forced or manual logout lands here, not on a bare login form) and
    // voluntarily while logged in (the "Switch Account" entry point). Excluded
    // from the auth-screen redirects below so visiting it doesn't bounce the
    // user straight back out — the screen itself navigates on a successful switch.
    const onAccountsScreen = inAuth && seg[1] === 'accounts';
    const onAddAccountLoginRoute = inAuth && (seg[1] === 'login' || seg[1] === 'hub-login') && params.addAccount === '1';
    if (onAddAccountLoginRoute) {
      if (addAccountBaseUserId.current === null) addAccountBaseUserId.current = user?.id ?? '';
    } else {
      addAccountBaseUserId.current = null;
    }
    const onAddAccountLogin = onAddAccountLoginRoute && (user?.id ?? '') === addAccountBaseUserId.current;

    const incompatibleSession = user && (HUB_BUILD
      ? user.authSource !== 'HUB'
      : user.authSource === 'HUB' || user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_AGENT');
    if (incompatibleSession) {
      logout();
      router.replace(HUB_BUILD ? '/(auth)/hub-login' : '/(auth)/login');
      return;
    }

    if (!user && !inAuth) {
      // Not logged in — show the account picker if there's something to pick
      // from, otherwise go straight to a bare login form.
      if (!HUB_BUILD && accounts.length > 0) {
        router.replace('/(auth)/accounts' as any);
      } else {
        router.replace(HUB_BUILD ? '/(auth)/hub-login' : '/(auth)/login');
      }
      return;
    }

    if (!user && inAuth) {
      const expectedLogin = HUB_BUILD ? 'hub-login' : 'login';
      const publicMemberFlow = !HUB_BUILD && (seg[1] === 'chitfund-request' || seg[1] === 'setup-account');
      if (seg[1] !== expectedLogin && !publicMemberFlow && !onAccountsScreen) router.replace(`/(auth)/${expectedLogin}` as any);
      return;
    }

    if (user && user.mustChangePassword && !onForceChange) {
      // Temp password must be changed before anything else
      router.replace('/(auth)/force-change-password');
      return;
    }

    if (user && !user.mustChangePassword && inAuth && !onAccountsScreen && !onAddAccountLogin) {
      // Fully logged in but sitting on an auth screen — redirect to correct app section
      redirectByRole(user.role, router);
      return;
    }

    if (user && !user.mustChangePassword && seg[0] === '(app)') {
      // CRITICAL: enforce role↔route-group binding on every navigation.
      // A staff member must never be able to view admin screens (and vice versa).
      const expectedGroup = ROLE_GROUP[user.role];
      const currentGroup  = seg[1]; // e.g. '(admin)', '(staff)', '(member)', '(manager)'
      if (expectedGroup && currentGroup && currentGroup !== expectedGroup) {
        redirectByRole(user.role, router);
      }
    }
  }, [user, isLoading, segments, params.addAccount]);

  if (isLoading) return <LoadingScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [showBrandLaunch, setShowBrandLaunch] = useState(true);
  const finishBrandLaunch = useCallback(() => setShowBrandLaunch(false), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScopedQueryProvider>
        <RealtimeUpdater />
        <AuthGuard>
          <TutorialProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </TutorialProvider>
        </AuthGuard>
        <ToastRoot />
      </ScopedQueryProvider>
      {showBrandLaunch && <BrandLaunch onFinish={finishBrandLaunch} />}
    </GestureHandlerRootView>
  );
}
