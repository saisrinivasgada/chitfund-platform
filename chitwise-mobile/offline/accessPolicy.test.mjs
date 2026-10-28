import assert from 'node:assert/strict';
import test from 'node:test';
import { canRecordOffline, belongsToAccount } from './accessPolicy.ts';

const now = Date.parse('2026-10-15T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

function access(recordUntil = now + 7 * day) {
  return {
    enabled: true, reason: null, tenantId: 'org-a', actorId: 'actor-a', role: 'ADMIN',
    serverTime: now, checkedAt: now,
    grant: {
      id: 'grant-a', actorId: 'actor-a', tenantId: 'org-a', role: 'ADMIN',
      issuedAt: now, recordUntil, actions: ['READ', 'RECORD_PAYMENT'], token: 'signed-proof',
    },
  };
}

test('known subscription expiry allows payments before expiry and stops them at expiry', () => {
  const expiry = now + 2 * day;
  const eligibility = access(expiry);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', expiry - 1), true);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', expiry), false);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', expiry + 1), false);
});

test('seven-day verification deadline only permits new work within the window', () => {
  const eligibility = access();
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 7 * day - 1), true);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 7 * day), false);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 365 * day), false);
});

test('recording eligibility uses server time and rejects clock rollback', () => {
  const eligibility = { ...access(), checkedAt: now + 3 * day };
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 3 * day - 1), false);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 9 * day), true);
  assert.equal(canRecordOffline(eligibility, 'RECORD_PAYMENT', now + 10 * day), false);
});

test('missing access, removed add-on and unauthorised actions cannot create new payments', () => {
  assert.equal(canRecordOffline(undefined, 'RECORD_PAYMENT', now), false);
  assert.equal(canRecordOffline({ ...access(), enabled: false }, 'RECORD_PAYMENT', now), false);
  assert.equal(canRecordOffline({ ...access(), grant: null }, 'RECORD_PAYMENT', now), false);
  assert.equal(canRecordOffline(access(), 'REMIT_CASH', now), false);
});

test('restored eligibility belongs only to the same user, organisation and role', () => {
  const eligibility = access();
  const account = { userId: 'actor-a', tenantId: 'org-a', role: 'ADMIN' };
  assert.equal(belongsToAccount(eligibility, account), true);
  assert.equal(belongsToAccount(eligibility, { ...account, userId: 'actor-b' }), false);
  assert.equal(belongsToAccount(eligibility, { ...account, tenantId: 'org-b' }), false);
  assert.equal(belongsToAccount(eligibility, { ...account, role: 'STAFF' }), false);
});
