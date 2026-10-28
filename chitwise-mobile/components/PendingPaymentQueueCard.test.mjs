import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = ts.transpileModule(await readFile(new URL('./PendingPaymentQueueCard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
async function app() {
  let user = { id: 'admin', role: 'ADMIN', scope: 'org-a' }, finish, fail, guard;
  let row = { operationId: 'payment', accountScope: 'org-a', actorId: 'admin', action: 'RECORD_PAYMENT', status: 'RETRYABLE_FAILURE', createdAt: 1,
    payload: { amount: 1500, memberId: 'member', allocations: [{ chitId: 'one', amount: 1000 }, { chitId: 'two', amount: 500 }] } };
  const calls = [], timers = new Set(), auth = selector => selector({ user });
  auth.getState = () => ({ user });
  const deps = {
    react: React, 'react/jsx-runtime': jsxRuntime,
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'react-native': { Keyboard: { dismiss() {} }, Modal: ({ visible, children }) => visible ? children : null,
      ScrollView: 'Scroll', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' },
    '../store/reviewNavigationStore': { useReviewNavigationStore: { getState: () => ({ openReview: (...args) => calls.push(['review', ...args]) }) } },
    '../services/api': { getMember() {}, getChit() {} },
    '@tanstack/react-query': { useQueries: ({ queries }) => queries.map((_, i) => ({ data: { name: `Chit ${i + 1}` } })), useQuery: () => ({ data: { fullName: 'Member A' } }),
      useQueryClient: () => ({ invalidateQueries: async () => calls.push(['invalidate']) }) },
    './ui': { C: {} },
    '../offline/accountScope': { getAccountScope: account => account?.scope ?? null },
    '../offline/database': { getCompletedOperationCount: async () => 0, getOperation: async (_, scope) => scope === row.accountScope ? structuredClone(row) : null,
      getVisibleOperations: async scope => scope === row.accountScope ? [structuredClone(row)] : [] },
    '../offline/cancelSavedPayment': { cancelSavedPayment: async (...args) => {
      calls.push(['cancel', ...args.slice(0, 4)]); guard = args[4];
      return new Promise((resolve, reject) => { finish = value => { row = { ...row, ...value }; resolve(structuredClone(row)); }; fail = reject; });
    } },
    '../offline/syncEngine': { refreshSyncState: async scope => calls.push(['refresh', scope]), synchronizeAccount: async scope => calls.push(['sync', scope]) },
    '../store/authStore': { useAuthStore: auth },
    '../offline/useOfflinePresentation': { useOfflinePresentation: () => ({ showSync: true }) },
    '../store/syncStore': { useSyncStore: () => ({ pendingCount: 1, conflictCount: 0, failedCount: 0, status: 'pending' }) },
  };
  const context = vm.createContext({ Error, setInterval: callback => { timers.add(callback); return callback; }, clearInterval: id => timers.delete(id) });
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => { const values = deps[name]; assert.ok(values, name); return new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context }); });
  await mod.evaluate(); let renderer;
  const render = () => React.createElement(mod.namespace.PendingPaymentQueueCard);
  await act(async () => { renderer = create(render()); });
  const press = async node => act(async () => { node.props.onPress(); });
  await press(renderer.root.findByProps({ testID: 'saved-payments-summary' }));
  await press(renderer.root.findByProps({ testID: 'saved-payment-payment' }));
  await act(async () => renderer.root.findByType('Input').props.onChangeText('Mistaken entry; no money collected'));
  await press(renderer.root.findByProps({ accessibilityLabel: 'I confirm no money was collected' }));
  const cancelButton = () => renderer.root.findAllByType('Button').find(node => node.findAllByType('Text').some(text => text.children.join('') === 'Cancel payment'));
  return { renderer, calls, start: () => press(cancelButton()), text: () => JSON.stringify(renderer.toJSON()),
    finish: async value => act(async () => finish(value)), fail: async message => act(async () => fail(new Error(message))), guard: () => guard(),
    switchAccount: async () => act(async () => { user = { ...user, scope: 'org-b' }; renderer.update(render()); }),
    poll: async value => act(async () => { row = { ...row, ...value }; for (const callback of timers) callback(); }),
    dispose: async () => act(async () => renderer.unmount()) };
}

test('cancellation shows an honest busy state while a sender finishes, then shows server-verification status', async () => {
  const screen = await app(); await screen.start();
  assert.match(screen.text(), /Checking sync before cancellation/);
  assert.equal(screen.renderer.root.findByType('Input').props.editable, false);
  assert.equal(screen.renderer.root.findByProps({ accessibilityLabel: 'Close saved payments' }).props.disabled, true);
  await screen.poll({ status: 'SYNCING' });
  assert.match(screen.text(), /Checking payment/); assert.equal(screen.renderer.root.findByType('Input').props.editable, false);
  await screen.finish({ status: 'QUEUED', serverReceipt: { cancellationRequest: { reason: 'Mistaken entry', noMoneyCollected: true } } });
  assert.match(screen.text(), /Cancellation waiting for verification/); assert.doesNotMatch(screen.text(), /Checking sync before/);
  assert.ok(screen.calls.some(call => call[0] === 'sync')); await screen.dispose();
});

test('a receipt or review won during cancellation replaces stale cancel controls with the appropriate server action', async () => {
  for (const outcome of [{ status: 'SUCCEEDED', serverReceiptId: 'receipt' }, { status: 'CONFLICT', serverReviewId: 'review' }]) {
    const screen = await app(); await screen.start(); await screen.finish(outcome);
    assert.equal(screen.renderer.root.findAllByType('Input').length, 0);
    assert.doesNotMatch(screen.text(), /Checking sync before/);
    assert.match(screen.text(), outcome.serverReceiptId ? /Open History to view the receipt or use Void/ : /Review transaction/);
    assert.ok(!screen.calls.some(call => call[0] === 'sync')); await screen.dispose();
  }
});

test('failed cancellation refreshes its details and leaves the reason available for a retry', async () => {
  const screen = await app(); await screen.start(); await screen.fail('Sync is still checking. Cancellation has not been saved.');
  assert.match(screen.text(), /Cancellation has not been saved/);
  assert.equal(screen.renderer.root.findByType('Input').props.value, 'Mistaken entry; no money collected');
  assert.equal(screen.renderer.root.findByType('Input').props.editable, true); await screen.dispose();
});

test('switching accounts or unmounting invalidates a waiting cancellation without reopening old details', async () => {
  const screen = await app(); await screen.start(); assert.equal(screen.guard(), true);
  await screen.switchAccount(); assert.equal(screen.guard(), false);
  await screen.fail('Account changed');
  assert.doesNotMatch(screen.text(), /Account changed|Saved payment details|Mistaken entry/); await screen.dispose();
  const removed = await app(); await removed.start(); await removed.dispose(); assert.equal(removed.guard(), false);
  await removed.fail('Account changed');
});
