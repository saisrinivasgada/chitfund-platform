import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenDrawRequest } from './drawRequest.ts';
const chit = { id: 'chit-a', capacity: 20, installmentAmount: 1000, startDate: '2026-01-31', chitType: 'RESERVATION' };

test('manager opening uses the required server fields and clamps February dues without a timezone shift', () => {
  assert.deepEqual(buildOpenDrawRequest(chit, 2, [{ memberId: 'a' }], [], []), {
    chitId: 'chit-a', monthNumber: 2, dueDate: '2026-02-28', installmentAmount: 1000, maxCycles: 20,
    members: [{ memberId: 'a', amountDue: 1000 }],
  });
  assert.equal(buildOpenDrawRequest({ ...chit, startDate: '2027-12-01', monthlyDueDate: 10 }, 3, [{ memberId: 'a' }], [], []).dueDate, '2028-02-10');
});
test('multiple spots preserve exact dues and post-payout contributions for reservation and lottery chits', () => {
  const input = { ...chit, postPayoutContributionEnabled: true, defaultPostPayoutContribution: 700 };
  const enrolled = [{ memberId: 'a' }, { memberId: 'a' }, { memberId: 'b' }, { memberId: 'c', active: false }];
  const expected = [{ memberId: 'a', amountDue: 1700 }, { memberId: 'b', amountDue: 1000 }];
  assert.deepEqual(buildOpenDrawRequest(input, 2, enrolled, [], [{ memberId: 'a', status: 'PROCESSED' }]).members, expected);
  assert.deepEqual(buildOpenDrawRequest({ ...input, chitType: 'LOTTERY' }, 2, enrolled, [{ memberId: 'a' }], []).members, expected);
});
test('missing member data and invalid financial inputs cannot become an empty or zero-value draw', () => {
  assert.throws(() => buildOpenDrawRequest(chit, 2, [], [], []), /enrolled members/);
  for (const patch of [{ capacity: 0 }, { installmentAmount: 0 }, { installmentAmount: Infinity }, { startDate: null }, { startDate: '2026-02-31' }]) {
    assert.throws(() => buildOpenDrawRequest({ ...chit, ...patch }, 2, [{ memberId: 'a' }], [], []));
  }
  assert.throws(() => buildOpenDrawRequest(chit, 1.5, [{ memberId: 'a' }], [], []), /valid draw number/);
});
