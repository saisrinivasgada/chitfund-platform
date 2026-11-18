import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingSettlementAmount, parseSettlementPaymentAmount } from './settlementPayment.ts';

test('remaining settlement amount follows the correct money direction', () => {
  assert.equal(remainingSettlementAmount({ netAmount: '1000.00', collectedAmount: '350.25' }), 649.75);
  assert.equal(remainingSettlementAmount({ netAmount: '-1000.00', disbursedAmount: '350.25' }), 649.75);
  assert.equal(remainingSettlementAmount({ netAmount: '1000', collectedAmount: '1000' }), 0);
});

test('partial payment must be positive, precise, and no more than the remaining amount', () => {
  assert.equal(parseSettlementPaymentAmount('300.25', 649.75), 300.25);
  assert.equal(parseSettlementPaymentAmount('649.75', 649.75), 649.75);
  for (const input of ['0', '-1', '649.76', '1.001', '', 'NaN']) {
    assert.equal(parseSettlementPaymentAmount(input, 649.75), null);
  }
});
