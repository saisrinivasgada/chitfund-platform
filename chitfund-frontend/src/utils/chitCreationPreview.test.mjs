import test from 'node:test';
import assert from 'node:assert/strict';
import { createChitPreview } from './chitCreationPreview.js';

test('separates 20 paying slots from two organization payout slots', () => {
  const schedule = Array.from({ length: 22 }, (_, index) => ({
    memberId: index === 5 || index === 21 ? 'ORG' : '', payoutAmount: '1000',
  }));
  const result = createChitPreview({ payingCount: 20, orgCount: 2, installment: 100,
    postPayoutEnabled: false, postPayoutAmount: 0, schedule });
  assert.equal(result.positions, 22);
  assert.equal(result.monthlyBase, 2000);
  assert.equal(result.collections, 44000);
  assert.equal(result.memberPayouts, 20000);
  assert.equal(result.orgPayouts, 2000);
});

test('uses each payout and post-payout rate, and shows a cash funding gap', () => {
  const result = createChitPreview({ payingCount: 2, orgCount: 1, installment: 1000,
    postPayoutEnabled: true, postPayoutAmount: 1500,
    schedule: [
      { memberId: '', payoutAmount: '2500' },
      { memberId: 'ORG', payoutAmount: '1000' },
      { memberId: '', payoutAmount: '3000' },
    ] });
  assert.equal(result.collections, 7000);
  assert.equal(result.memberPayouts, 5500);
  assert.equal(result.orgPayouts, 1000);
  assert.equal(result.estimatedMargin, 1500);
  assert.equal(result.fundingNeed, 500);
});

test('keeps a loss negative and refuses an incomplete organization schedule', () => {
  const loss = createChitPreview({ payingCount: 2, orgCount: 0, installment: 100,
    postPayoutEnabled: false, postPayoutAmount: 0,
    schedule: [{ memberId: '', payoutAmount: '1000' }, { memberId: '', payoutAmount: '1000' }] });
  assert.equal(loss.estimatedMargin, -1600);
  assert.equal(loss.fundingNeed, 1600);

  const incomplete = createChitPreview({ payingCount: 2, orgCount: 1, installment: 1000,
    postPayoutEnabled: false, postPayoutAmount: 0,
    schedule: Array.from({ length: 3 }, () => ({ memberId: '', payoutAmount: '1000' })) });
  assert.equal(incomplete.complete, false);
});
