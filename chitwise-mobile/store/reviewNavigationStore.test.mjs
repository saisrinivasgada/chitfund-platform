import test from 'node:test';
import assert from 'node:assert/strict';
import { useReviewNavigationStore as reviews } from './reviewNavigationStore.ts';

test('a consumed review request cannot reopen when its screen mounts again', () => {
  reviews.setState({ scope: null, reviewId: null, sequence: 0 });
  reviews.getState().openReview('org-a', 'review-a');
  const request = reviews.getState();
  assert.equal(request.reviewId, 'review-a');
  request.consumeReview(request.sequence);
  assert.equal(reviews.getState().scope, null);
  assert.equal(reviews.getState().reviewId, null);
  reviews.getState().openReview('org-a');
  assert.ok(reviews.getState().sequence > request.sequence);
  assert.equal(reviews.getState().scope, 'org-a');
});

test('consuming an older request cannot erase a newer account review request', () => {
  reviews.getState().openReview('org-a', 'old');
  const oldSequence = reviews.getState().sequence;
  reviews.getState().openReview('org-b', 'new');
  reviews.getState().consumeReview(oldSequence);
  assert.equal(reviews.getState().scope, 'org-b');
  assert.equal(reviews.getState().reviewId, 'new');
});
