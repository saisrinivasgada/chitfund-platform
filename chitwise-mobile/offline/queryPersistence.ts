import { QueryClient, type Query } from '@tanstack/react-query';
import { createEncryptedQueryPersister } from './database';

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_CACHE_BUSTER = 'chitwise-mobile-cache-v1';

// Only business data that is useful without connectivity is persisted. Auth,
// OTP, identity cases, employee management and other sensitive Hub data are
// intentionally excluded even though the database is encrypted.
const PERSISTED_QUERY_PREFIXES = new Set([
  'm-cash-requests',
  'm-chits',
  'm-members',
  'm-wallet',
  'm-wallet-txns',
  'm-recent-activity',
  'm-today-batches',
  'm-today-draws',
  'm-today-payouts',
  'm-cash-summary',
  'm-dash-pending-settlements',
  'm-dash-pending-payouts',
  'm-dash-all-payouts',
  'm-dash-remittance',
  'm-dash-limits',
  'm-dash-winners',
  'm-pay-balance',
  'm-pay-batches',
  'm-member-chits-pay',
  'm-member-credit-pay',
  'a-chits',
  'a-members',
  'a-draws',
  'a-enrollments',
  'a-winners',
  'a-reservations',
  'a-chit-payouts',
  'a-chit-batches',
  'a-staff',
  'a-org-reservations',
  'draw-payments',
  'staff-tasks',
  'staff-history',
  'worker-pending-batches',
  'members',
  'chits',
  'staff',
  'today-draws',
  'today-batches',
  'today-payouts',
  'pending-remit',
  'pending-payouts',
  'cash-requests',
  'manager-pickups',
  'wallet-balance',
  'member-chits',
  'member-profile-me',
  'member-requests',
  'member-total-balance',
  'my-settlements',
  'member-invitations',
  'member-chit-balance',
  'member-chit-history',
  'member-chit-draws',
  'member-chit-winners',
  'member-payouts',
  'my-payment-batches',
  'member-reminders',
  'm-cash-requests-member',
  'my-cash-requests',
]);

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const prefix = String(query.queryKey[0] ?? '');
  return PERSISTED_QUERY_PREFIXES.has(prefix);
}

export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: CACHE_MAX_AGE,
        retry: 2,
        networkMode: 'online',
      },
      mutations: {
        retry: false,
        networkMode: 'online',
      },
    },
  });
}

export function offlinePersistenceOptions(accountScope: string) {
  return {
    persister: createEncryptedQueryPersister(accountScope),
    maxAge: CACHE_MAX_AGE,
    buster: OFFLINE_CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
