import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRefundTime, parseRefundTime } from './refundDate.js';
test('refund date retains the selected local time and rejects rolled-over dates', () => {
  const selected = new Date(2026, 9, 16, 14, 35);
  assert.equal(formatRefundTime(selected), '16/10/2026 14:35');
  assert.equal(parseRefundTime(formatRefundTime(selected)), selected.toISOString());
  for (const invalid of ['31/02/2026 14:35', '16/13/2026 12:00', '16/10/2026 24:00', '16/10/2026 12:60', 'tomorrow']) assert.throws(() => parseRefundTime(invalid));
});
