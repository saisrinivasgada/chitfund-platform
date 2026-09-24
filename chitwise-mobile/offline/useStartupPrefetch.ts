import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getChits,
  getMembers,
  getDraws,
  getEnrollments,
  getWinners,
  listAuctions,
  getRecentDraws,
  listStaff,
  getWalletBalance,
  getActiveCashRequests,
  getCashRequestSummary,
  getTodaysPaymentBatches,
  getTodaysDraws,
  getTodaysPayouts,
  getPendingRemittance,
  getPendingPayouts,
  getOrgReservations,
  getMyAssignedRequests,
  getMyPendingBatches,
  getMyChits,
  getMyMemberProfile,
  getMyRequests,
  getMySettlements,
  getMyInvitations,
  getMyPaymentBatches,
  getMyCashRequests,
} from '../services/api';

const STALE = 5 * 60 * 1000; // 5 min — skip re-fetch if already fresh

// Prefetch a list of [queryKey, queryFn] pairs in parallel (fire-and-forget).
// Uses prefetchQuery so errors are silently swallowed and nothing blocks the UI.
function prefetchAll(qc: ReturnType<typeof useQueryClient>, tasks: Array<[unknown[], () => Promise<unknown>]>) {
  for (const [queryKey, queryFn] of tasks) {
    qc.prefetchQuery({ queryKey, queryFn, staleTime: STALE });
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function useAdminStartupPrefetch() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Phase 1 — top-level lists (no params needed)
    prefetchAll(qc, [
      [['a-chits'],                    () => getChits()],
      [['a-members'],                  () => getMembers()],
      [['m-chits'],                    () => getChits()],
      [['m-members'],                  () => getMembers()],
      [['a-staff'],                    listStaff],
      [['m-wallet'],                   getWalletBalance],
      [['m-cash-requests'],            getActiveCashRequests],
      [['m-cash-summary'],             getCashRequestSummary],
      [['m-today-batches'],            getTodaysPaymentBatches],
      [['m-today-draws'],              getTodaysDraws],
      [['m-today-payouts'],            getTodaysPayouts],
      [['m-dash-remittance'],          getPendingRemittance],
      [['m-dash-pending-payouts'],     getPendingPayouts],
      [['a-org-reservations'],         getOrgReservations],
      [['act-draws'],                  () => getRecentDraws(60)],
    ]);

    // Phase 2 — per-chit: draws, enrollments, winners, auctions for every active chit
    qc.fetchQuery({ queryKey: ['a-chits'], queryFn: () => getChits(), staleTime: STALE })
      .then((chits: any) => {
        const active = (chits as any[]).filter((c: any) => c.status === 'ACTIVE');
        for (const chit of active) {
          qc.prefetchQuery({ queryKey: ['a-draws',       chit.id], queryFn: () => getDraws(chit.id),       staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['a-enrollments', chit.id], queryFn: () => getEnrollments(chit.id), staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['a-winners',     chit.id], queryFn: () => getWinners(chit.id),     staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['m-auctions',    chit.id], queryFn: () => listAuctions(chit.id),   staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['m-dash-auctions', chit.id], queryFn: () => listAuctions(chit.id), staleTime: STALE });
        }
      })
      .catch(() => { /* network unavailable — will serve from SQLite cache */ });
  }, [qc]);
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export function useManagerStartupPrefetch() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    prefetchAll(qc, [
      [['chits'],             () => getChits()],
      [['members'],           () => getMembers()],
      [['staff'],             listStaff],
      [['wallet-balance'],    getWalletBalance],
      [['cash-requests'],     getActiveCashRequests],
      [['today-batches'],     getTodaysPaymentBatches],
      [['today-draws'],       getTodaysDraws],
      [['today-payouts'],     getTodaysPayouts],
      [['pending-remit'],     getPendingRemittance],
      [['pending-payouts'],   getPendingPayouts],
      [['manager-pickups'],   getMyAssignedRequests],
    ]);

    // Phase 2 — per-chit winners + auctions
    qc.fetchQuery({ queryKey: ['chits'], queryFn: () => getChits(), staleTime: STALE })
      .then((chits: any) => {
        const active = (chits as any[]).filter((c: any) => c.status === 'ACTIVE');
        for (const chit of active) {
          qc.prefetchQuery({ queryKey: ['m-winners',   chit.id], queryFn: () => getWinners(chit.id),   staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['mg-auctions', chit.id], queryFn: () => listAuctions(chit.id), staleTime: STALE });
        }
      })
      .catch(() => {});
  }, [qc]);
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export function useStaffStartupPrefetch() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    prefetchAll(qc, [
      [['chits'],                   () => getChits()],
      [['members', 'all'],          () => getMembers()],
      [['staff'],                   listStaff],
      [['staff-tasks'],             getMyAssignedRequests],
      [['worker-pending-batches'],  getMyPendingBatches],
    ]);
  }, [qc]);
}

// ─── Member ───────────────────────────────────────────────────────────────────

export function useMemberStartupPrefetch() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    prefetchAll(qc, [
      [['member-profile-me'],     getMyMemberProfile],
      [['member-chits'],          getMyChits],
      [['member-requests'],       getMyRequests],
      [['my-settlements'],        () => getMySettlements(0, 20)],
      [['member-invitations'],    getMyInvitations],
      [['my-payment-batches'],    getMyPaymentBatches],
      [['my-cash-requests'],      getMyCashRequests],
    ]);

    // Phase 2 — per-chit winners + auctions (chit detail screen)
    qc.fetchQuery({ queryKey: ['member-chits'], queryFn: getMyChits, staleTime: STALE })
      .then((chits: any) => {
        for (const chit of (chits as any[])) {
          qc.prefetchQuery({ queryKey: ['member-chit-winners', chit.id], queryFn: () => getWinners(chit.id),   staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['member-auctions',     chit.id], queryFn: () => listAuctions(chit.id), staleTime: STALE });
          qc.prefetchQuery({ queryKey: ['auctions',            chit.id], queryFn: () => listAuctions(chit.id), staleTime: STALE });
        }
      })
      .catch(() => {});
  }, [qc]);
}
