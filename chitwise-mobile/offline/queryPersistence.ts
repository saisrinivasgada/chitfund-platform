import { QueryClient, type Query } from '@tanstack/react-query';
import { hasOfflineAccess, restoreOfflineAccess } from './access';
import { createEncryptedQueryPersister } from './database';
import { mayKeepReadSnapshot, shouldRetryRead } from '../../shared/offline/readSnapshots';

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_CACHE_BUSTER = 'chitwise-mobile-cache-v1';

// Only business data that is useful without connectivity is persisted. Auth,
// OTP, identity cases, employee management and other sensitive Hub data are
// intentionally excluded even though the database is encrypted.
const PERSISTED_QUERY_PREFIXES = new Set([
  // Dashboard / shared
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
  'm-wallet-balance',
  'm-all-batches-7d',
  'm-member-total-balance',
  // Manager — chit detail (parity with the admin a-* equivalents below)
  'm-enrollments',
  'm-draws',
  'm-winners',
  'm-reservations',
  'm-chit-payouts',
  'm-draw-payments',
  'mg-auctions',
  'mgr-members-page',
  'manager-pending-batches',
  'manager-pickup-history',
  // Admin — chits / draws
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
  'a-payment-history',
  'a-chit-audit',
  'draw-payments',
  // Admin — member detail screens
  'm-member-balance-card',   // total-balance badge in member list
  'm-member-credit-card',    // credit badge in member list
  'm-member-balance',        // total-balance in member detail panel
  'm-member-credit',         // credit balance in member detail panel
  'm-member-chits',          // enrolled chits in member detail
  'm-member-settlements',    // settlements in member detail
  'm-member-reminders',      // scheduled reminders in member detail
  'm-collect-chit-balance',  // balance shown when opening collect modal
  'm-chit-balance',          // per-chit outstanding badge
  'm-members-page',          // paginated member list
  'm-user-status',           // linked-user status in member detail
  'm-chitfund-requests',     // chitfund join requests per member
  // Staff / manager / other roles
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
  // A failed refresh must not erase the last successful downloaded value.
  if (query.state.data === undefined || !query.state.dataUpdatedAt) return false;
  if (!mayKeepReadSnapshot(query.state.error)) return false;
  const prefix = String(query.queryKey[0] ?? '');
  return PERSISTED_QUERY_PREFIXES.has(prefix);
}

export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: CACHE_MAX_AGE,
        retry: (failureCount, error) => shouldRetryRead(failureCount, error),
        networkMode: 'always',
      },
      mutations: {
        retry: false,
        networkMode: 'always',
      },
    },
  });
}

export function offlinePersistenceOptions(accountScope: string) {
  const disk = createEncryptedQueryPersister(accountScope);
  return {
    // Keep a stable provider while add-on metadata loads/changes. Switching
    // provider types remounts forms and can discard an in-progress selection.
    persister: {
      persistClient: (client: Parameters<typeof disk.persistClient>[0]) => hasOfflineAccess(accountScope) ? disk.persistClient(client) : Promise.resolve(),
      restoreClient: async () => { await restoreOfflineAccess(accountScope); return hasOfflineAccess(accountScope) ? disk.restoreClient() : undefined; },
      removeClient: () => disk.removeClient(),
    },
    // Cached reads can be shown with their age even after recording access
    // expires. The outbox is independent and never subject to cache cleanup.
    maxAge: Infinity,
    buster: OFFLINE_CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
