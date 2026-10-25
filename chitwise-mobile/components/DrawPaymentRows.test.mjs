import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transpile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const [source, statusSource] = await Promise.all([transpile('./DrawPaymentRows.tsx'), transpile('../utils/paymentStatus.ts')]);
async function render(payment, props = {}) {
  const context = vm.createContext({});
  const statuses = new vm.SourceTextModule(statusSource, { context }); await statuses.link(() => {}); await statuses.evaluate();
  const queries = [], collected = [];
  const deps = {
    'react/jsx-runtime': jsxRuntime,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button' },
    '@tanstack/react-query': { useQuery: (q) => { queries.push(q); return { data: [payment], isLoading: false }; } },
    '../services/api': { getDrawPayments: async () => [payment] },
    './ReadDataBoundary': { ReadDataBoundary: ({ children }) => children },
    './ui': { C: { green: '#090', navy: '#009', red: '#900', amber: '#990', gray100: '#eee', gray400: '#aaa', gray700: '#777', gray900: '#111' } },
    '../utils/paymentStatus': statuses.namespace,
  };
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link((name) => { const values = deps[name]; assert.ok(values, name); return new vm.SyntheticModule(Object.keys(values), function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
  await mod.evaluate(); let renderer;
  await act(async () => { renderer = create(React.createElement(mod.namespace.DrawPaymentRows, {
    drawId: 'draw', drawStatus: 'OPEN', memberMap: { member: 'Member A' }, onCollect: (id) => collected.push(id), ...props,
  })); });
  return { renderer, queries, collected, dispose: async () => act(async () => renderer.unmount()) };
}
const partial = { id: 'p', memberId: 'member', status: 'PARTIAL_CREDIT', amountDue: 1000, amountPaid: 500, balance: 500 };
for (const prefix of ['draw-payments', 'm-draw-payments']) {
  test(`${prefix}: partial credit remains due, collectible and half paid`, async () => {
    const app = await render(partial, { queryKeyPrefix: prefix });
    const labels = app.renderer.root.findAllByType('Text').map((n) => n.children.join('')).join(' ');
    assert.match(labels, /0\/1 cleared/); assert.match(labels, /Partial Credit/); assert.match(labels, /₹500 due/); assert.doesNotMatch(labels, /Clear ✓/);
    assert.ok(app.renderer.root.findAllByType('View').some((v) => v.props.style?.width === '50%'));
    assert.equal(app.queries[0].queryKey[0], prefix);
    await act(async () => app.renderer.root.findByType('Button').props.onPress());
    assert.deepEqual(app.collected, ['member']); await app.dispose();
  });
}
test('closed draws and pending local payments cannot be collected again', async () => {
  for (const [payment, props] of [[partial, { drawStatus: 'CLOSED' }], [{ ...partial, _pendingSync: true }, {}]]) {
    const app = await render(payment, props); assert.equal(app.renderer.root.findAllByType('Button').length, 0);
    assert.match(JSON.stringify(app.renderer.toJSON()), /500/); await app.dispose();
  }
});
test('fully credit-covered instalments are cleared without a collection action', async () => {
  const app = await render({ ...partial, status: 'CREDIT_COVERED', amountPaid: 1000, balance: 0 });
  assert.match(JSON.stringify(app.renderer.toJSON()), /Clear ✓/); assert.equal(app.renderer.root.findAllByType('Button').length, 0); await app.dispose();
});
