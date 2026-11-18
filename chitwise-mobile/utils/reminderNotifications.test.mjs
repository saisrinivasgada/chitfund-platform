import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('./reminderNotifications.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function harness(schedule = async () => 'scheduled-1', failCancelAll = false) {
  const stored = new Map();
  const active = new Set();
  const cancelled = [];
  const received = [];
  const storage = {
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => keys.forEach((key) => stored.delete(key)),
  };
  const notifications = {
    scheduleNotificationAsync: async (request) => {
      received.push(request);
      const id = await schedule(request);
      active.add(id);
      return id;
    },
    cancelScheduledNotificationAsync: async (id) => { cancelled.push(id); active.delete(id); },
    cancelAllScheduledNotificationsAsync: async () => {
      if (failCancelAll) throw new Error('OS-wide cancellation unavailable');
      cancelled.push(...active); active.clear();
    },
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => {
    const values = name === '@react-native-async-storage/async-storage'
      ? { default: storage } : name === 'expo-notifications' ? notifications : null;
    if (!values) throw new Error(name);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, stored, active, cancelled, received };
}

test('sign-out cancels and removes previously scheduled reminders', async () => {
  const state = await harness();
  await state.api.scheduleReminderRepeat('member-a', 60, null);
  assert.equal(state.stored.get('reminder_notif_member-a'), 'scheduled-1');
  assert.equal(state.received[0].content.body, 'Open ChitWise to view your reminder.');
  await state.api.cancelAllReminderRepeats();
  assert.equal(state.active.size, 0);
  assert.equal(state.stored.size, 0);
  assert.deepEqual(state.cancelled, ['scheduled-1']);
});

test('a reminder still scheduling during sign-out cannot survive', async () => {
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await harness(async () => { started(); await pending; return 'late-reminder'; });
  const scheduling = state.api.scheduleReminderRepeat('member-a', 60, null);
  await began;
  await state.api.cancelAllReminderRepeats();
  release();
  await scheduling;
  assert.equal(state.active.size, 0);
  assert.equal(state.stored.size, 0);
  assert.ok(state.cancelled.includes('late-reminder'));
});

test('sign-out falls back to cancelling each saved reminder', async () => {
  const state = await harness(async () => 'scheduled-2', true);
  await state.api.scheduleReminderRepeat('member-a', 60, null);
  await state.api.cancelAllReminderRepeats();
  assert.equal(state.active.size, 0);
  assert.equal(state.stored.size, 0);
  assert.deepEqual(state.cancelled, ['scheduled-2']);
});
