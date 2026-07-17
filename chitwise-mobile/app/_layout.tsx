import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../store/authStore';
import { LoadingScreen } from '../components/ui';
import { ToastRoot } from '../components/Toast';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
});

// Maps each role to the ONLY route group that role is allowed to access.
const ROLE_GROUP: Record<string, string> = {
  ADMIN:   '(admin)',
  MANAGER: '(manager)',
  STAFF:   '(staff)',
  MEMBER:  '(member)',
};

function redirectByRole(role: string, router: any) {
  const target = ROLE_GROUP[role];
  if (target) {
    router.replace(`/(app)/${target}`);
  } else {
    router.replace('/(auth)/login');
  }
}

function RealtimeUpdater() {
  const { user } = useAuthStore();
  useRealtimeUpdates(!!user);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const seg = segments as string[];
    const inAuth = seg[0] === '(auth)';
    const onForceChange = inAuth && seg[1] === 'force-change-password';

    if (!user && !inAuth) {
      // Not logged in — go to login
      router.replace('/(auth)/login');
      return;
    }

    if (user && user.mustChangePassword && !onForceChange) {
      // Temp password must be changed before anything else
      router.replace('/(auth)/force-change-password');
      return;
    }

    if (user && !user.mustChangePassword && inAuth) {
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
  }, [user, isLoading, segments]);

  if (isLoading) return <LoadingScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <RealtimeUpdater />
        <AuthGuard>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGuard>
        <ToastRoot />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
