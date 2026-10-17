import { create } from 'zustand';
export const useReviewNavigationStore = create<{
  scope: string | null; reviewId: string | null; sequence: number; kind: 'payment' | 'staff';
  openReview(scope: string, reviewId?: string | null, kind?: 'payment' | 'staff'): void;
  consumeReview(sequence: number): void;
}>((set) => ({ scope: null, reviewId: null, sequence: 0, kind: 'payment',
  openReview: (scope, reviewId = null, kind = 'payment') => set((prior) => ({ scope, reviewId, kind, sequence: prior.sequence + 1 })),
  consumeReview: (sequence) => set((prior) => prior.sequence === sequence ? { scope: null, reviewId: null } : {}),
}));
