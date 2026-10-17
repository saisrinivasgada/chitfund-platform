import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshFinancialSnapshots } from './financialRefresh.js';
test('confirmed receipt refreshes member dues and exactly the affected draw instalments', async () => {
  const saved = []; const calls = [];
  await refreshFinancialSnapshots({
    request: async (path, params) => { calls.push({ path, params }); return { success: true, data: path.startsWith('/admin/draws/chit/')
      ? [{ id: 'draw-1', monthNumber: 1 }, { id: 'draw-2', monthNumber: 2 }] : { updated: true } }; },
    saveResponse: async (path, params, response) => saved.push({ path, params, response }),
  }, { memberId: 'member-a', chitId: 'chit-a' }, { id: 'receipt-a', allocations: [{ chitId: 'chit-a', monthNumber: 1, allocatedAmount: 1000 }] });
  assert.ok(saved.some((entry) => entry.path === '/payments/balance' && entry.params.memberId === 'member-a'));
  assert.ok(saved.some((entry) => entry.path === '/payments/history'));
  assert.ok(saved.some((entry) => entry.path === '/admin/draws/draw-1/payments'));
  assert.ok(!calls.some((entry) => entry.path === '/admin/draws/draw-2/payments'));
});
test('a failed read does not undo a confirmed receipt and independent reads still refresh', async () => {
  const saved = [];
  await refreshFinancialSnapshots({ request: async (path) => { if (path === '/payments/balance') throw new Error('Connection interrupted'); return { data: [] }; },
    saveResponse: async (path) => saved.push(path) }, { memberId: 'member-a', chitId: 'chit-a' }, { id: 'receipt-a' });
  assert.ok(saved.includes('/payments/balance/total'));
  assert.ok(saved.includes('/payments/history'));
});
