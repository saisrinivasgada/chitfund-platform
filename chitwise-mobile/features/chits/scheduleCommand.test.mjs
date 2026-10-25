import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChitScheduleCommand } from './scheduleCommand.ts';
for (const operation of ['skip', 'manual shift']) test(`delayed ${operation} for A cannot attach its pending command to selected chit B`, async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  let selected = { id: 'a', scheduleSyncCommandId: null };
  const settle = pending.then(response => { selected = applyChitScheduleCommand(selected, response); });
  const other = { id: 'b', scheduleSyncCommandId: 'b-own-command' }; selected = other;
  finish({ chitId: 'a', commandId: 'a-command', status: 'PENDING' }); await settle;
  assert.equal(selected, other); assert.equal(selected.scheduleSyncCommandId, 'b-own-command');
});
test('a closed selection stays closed and terminal owner results clear only their own pending state', () => {
  assert.equal(applyChitScheduleCommand(null, { chitId: 'a', commandId: 'x', status: 'PENDING' }), null);
  const current = { id: 'a', scheduleSyncCommandId: null };
  const pending = applyChitScheduleCommand(current, { chitId: 'a', commandId: 'x', status: 'PENDING' });
  assert.equal(pending.scheduleSyncCommandId, 'x');
  for (const status of ['COMPLETED', 'REJECTED']) assert.equal(applyChitScheduleCommand(pending, { chitId: 'a', commandId: 'x', status }).scheduleSyncCommandId, null);
});
