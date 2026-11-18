import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedPaymentPreview, isStalePaymentConflict } from './paymentPreview.js';

const expected = { memberId: 'member-1', chitId: 'chit-1', amount: 1200 };
const preview = {
  memberId: 'member-1', primaryChitId: 'chit-1', requestedAmount: 1200,
  balanceVersion: 'opaque-version', creditAvailable: 200, creditConsumed: 200,
  totalOutstanding: 1000, selectedChitOutstanding: 1000,
  projectedNewCredit: 400,
  allocations: [{ chitId: 'chit-1', monthNumber: 3, catchUpLine: false, creditApplied: 200, newPaymentApplied: 800 }],
};

test('accepts a server preview with credit consumed and exact new-credit remainder', () => {
  const result = checkedPaymentPreview(preview, expected);
  assert.equal(result.cashApplied, 800);
  assert.equal(result.data.balanceVersion, 'opaque-version');
});

test('accepts a zero-cash credit review only when its allocation uses existing credit', () => {
  const creditReview = {
    ...preview,
    requestedAmount: 0,
    projectedNewCredit: 0,
    allocations: [{ ...preview.allocations[0], newPaymentApplied: 0 }],
  };
  const creditExpected = { ...expected, amount: 0 };
  assert.equal(checkedPaymentPreview(creditReview, creditExpected).cashApplied, 0);
  assert.throws(() => checkedPaymentPreview({
    ...creditReview,
    allocations: [{ ...creditReview.allocations[0], newPaymentApplied: 1 }],
  }, creditExpected));
});

test('rejects a preview for another member or amount', () => {
  assert.throws(() => checkedPaymentPreview({ ...preview, memberId: 'member-2' }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, requestedAmount: 1000 }, expected));
});

test('rejects a breakdown that would misstate cash applied or new credit', () => {
  assert.throws(() => checkedPaymentPreview({ ...preview, projectedNewCredit: 500 }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, creditConsumed: 100 }, expected));
});

test('rejects missing money fields, fractional paise, and incomplete catch-up lines', () => {
  assert.throws(() => checkedPaymentPreview({ ...preview, creditAvailable: null }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, requestedAmount: '' }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, projectedNewCredit: 400.001 }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, allocations: [{ ...preview.allocations[0], catchUpLine: undefined }] }, expected));
});

test('refreshes only a stale balance conflict, not another 409 such as a duplicate payment', () => {
  assert.equal(isStalePaymentConflict({ response: { status: 409, data: { errorCode: 'GENERAL_006' } } }), true);
  assert.equal(isStalePaymentConflict({ response: { status: 409, data: { errorCode: 'PAYMENT_DUPLICATE' } } }), false);
});
