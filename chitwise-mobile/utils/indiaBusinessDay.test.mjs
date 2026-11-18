import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaBusinessDate, indiaBusinessDayRange, startOfIndiaBusinessDay } from './indiaBusinessDay.ts';

test('India business day is stable across a device midnight in another time zone', () => {
  assert.equal(indiaBusinessDate('2026-11-16T18:29:59.999Z'), '2026-11-16');
  assert.equal(indiaBusinessDate('2026-11-16T18:30:00.000Z'), '2026-11-17');
  assert.equal(startOfIndiaBusinessDay(Date.parse('2026-11-16T18:30:00Z')).toISOString(), '2026-11-16T18:30:00.000Z');
});

test('custom date range covers exactly one India calendar day', () => {
  const range = indiaBusinessDayRange('2026-11-17');
  assert.equal(range?.start.toISOString(), '2026-11-16T18:30:00.000Z');
  assert.equal(range?.end.toISOString(), '2026-11-17T18:29:59.999Z');
  assert.equal(indiaBusinessDayRange('2026-02-30'), null);
});
