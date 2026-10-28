import test from 'node:test';
import assert from 'node:assert/strict';
import { outstandingValue } from './balanceValue.js';
test('member balance uses the payment service totalOutstanding before and after settlement', () => {
  assert.equal(outstandingValue({ memberId: 'a', totalOutstanding: 1000, months: [] }), 1000);
  assert.equal(outstandingValue({ memberId: 'a', totalOutstanding: '500.00', months: [] }), 500);
  assert.equal(outstandingValue({ memberId: 'a', totalOutstanding: 0, months: [] }), 0);
  assert.equal(outstandingValue(250), 250);
});
test('missing balance fields and malformed amounts cannot label a member paid up', () => {
  for (const value of [null, undefined, {}, [], '', ' ', true, { totalOutstanding: 'unknown' }, { totalOutstanding: Infinity }, { totalOutstanding: true }, { totalOutstanding: [] }]) {
    assert.equal(outstandingValue(value), null);
  }
});
