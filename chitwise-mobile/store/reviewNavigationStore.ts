import { create } from 'zustand';
export const useReviewNavigationStore = create<{
  scope: string | null; reviewId: string | null; sequence: number;
  openReview(scope: string, reviewId?: string | null): void;
  consumeReview(sequence: number): void;
}>((set) => ({ scope: null, reviewId: null, sequence: 0,
  openReview: (scope, reviewId = null) => set((prior) => ({ scope, reviewId, sequence: prior.sequence + 1 })),
  consumeReview: (sequence) => set((prior) => prior.sequence === sequence ? { scope: null, reviewId: null } : {}),
}));
