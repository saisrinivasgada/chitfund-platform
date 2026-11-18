import test from 'node:test';
import assert from 'node:assert/strict';
import { disbursementFormError } from './disbursementForm.ts';

test('a partial or full payout can be disbursed without exceeding the frozen remaining amount', () => {
  const input = { remaining: '649.75', mode: 'CASH', referenceNumber: '' };
  assert.equal(disbursementFormError({ ...input, amount: '300.25' }), null);
  assert.equal(disbursementFormError({ ...input, amount: '649.75' }), null);
  for (const amount of ['0', '-1', '649.76', '1.001', '', 'NaN']) {
    assert.notEqual(disbursementFormError({ ...input, amount }), null);
  }
});

test('non-cash disbursement requires a traceable transaction or cheque reference', () => {
  for (const mode of ['UPI', 'BANK_TRANSFER', 'CHEQUE']) {
    assert.notEqual(disbursementFormError({ amount: '100', remaining: 100, mode, referenceNumber: '  ' }), null);
    assert.equal(disbursementFormError({ amount: '100', remaining: 100, mode, referenceNumber: 'UTR-123' }), null);
  }
});
