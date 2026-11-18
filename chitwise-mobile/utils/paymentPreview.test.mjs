import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedPaymentPreview, isStalePaymentConflict } from './paymentPreview.ts';

const expected = { memberId: 'member-1', chitId: 'chit-1', amount: 1200 };
const preview = {
  memberId: 'member-1', primaryChitId: 'chit-1', requestedAmount: 1200,
  balanceVersion: 'opaque-version', creditAvailable: 200, creditConsumed: 200,
  totalOutstanding: 1000, selectedChitOutstanding: 1000, projectedNewCredit: 400,
  allocations: [{ chitId: 'chit-1', monthNumber: 3, catchUpLine: false, creditApplied: 200, newPaymentApplied: 800 }],
};

test('accepts the server breakdown and derives the cash applied', () => {
  const result = checkedPaymentPreview(preview, expected);
  assert.equal(result.cashApplied, 800);
  assert.equal(result.data.balanceVersion, 'opaque-version');
});

test('refuses mismatched payment identities or inconsistent allocation totals', () => {
  assert.throws(() => checkedPaymentPreview({ ...preview, memberId: 'another' }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, projectedNewCredit: 500 }, expected));
});

test('refuses incomplete or sub-paise financial preview values', () => {
  assert.throws(() => checkedPaymentPreview({ ...preview, creditConsumed: null }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, projectedNewCredit: 400.001 }, expected));
  assert.throws(() => checkedPaymentPreview({ ...preview, allocations: [{ ...preview.allocations[0], newPaymentApplied: '' }] }, expected));
});

test('only the balance conflict triggers a refreshed review', () => {
  assert.equal(isStalePaymentConflict({ response: { status: 409, data: { errorCode: 'GENERAL_006' } } }), true);
  assert.equal(isStalePaymentConflict({ response: { status: 409, data: { errorCode: 'PAY_004' } } }), false);
});
