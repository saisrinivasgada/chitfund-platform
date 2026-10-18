import test from 'node:test';
import assert from 'node:assert/strict';
import { openSimulatorLink } from './simulator-link.mjs';
const device = 'b94b5405-0b3d-4fc8-a29f-6ed69ffd8d13';
const link = 'chitwise:///(app)/(admin)/payments?tab=Record%20Payment';
const devices = (name = 'ChitWiseOfflineCI') => JSON.stringify({ devices: { ios: [{ udid: device, name, isAvailable: true, state: 'Booted' }] } });
test('only the selected isolated simulator receives the unchanged app route', async () => {
  const calls=[];
  await openSimulatorLink(device,link,async(command,args)=>{calls.push([command,args]);return {stdout:devices()};});
  assert.deepEqual(calls.at(-1),['xcrun',['simctl','openurl',device,link]]);
});
test('foreign devices, external links and shell-like input cannot open anything', async () => {
  for(const [id,url] of [[null,link],['emulator-5554',link],[device,'https://example.test/'],[device,'file:///tmp/payment']]) {
    let called=false;
    await assert.rejects(openSimulatorLink(id,url,async()=>{called=true;}));assert.equal(called,false);
  }
  let calls=0;
  await assert.rejects(openSimulatorLink(device,link,async()=>{calls++;return {stdout:devices('Vasu')};}),/QA simulator/);
  assert.equal(calls,1);
});
test('an absent browser service is harmless and does not skip the app link', async () => {
  for (const message of ['No such process', 'found nothing to terminate']) {
  const calls=[];
  await openSimulatorLink(device,link,async(_command,args)=>{
    calls.push(args);if(args[1]==='terminate')throw Object.assign(new Error(),{code:3,stderr:message});
    return {stdout:devices()};
  });
  assert.equal(calls.at(-1)[1],'openurl');
  }
});
test('unexpected simulator failures remain failures and never become passing UI checks', async () => {
  let opened=false;
  await assert.rejects(openSimulatorLink(device,link,async(_command,args)=>{
    if(args[1]==='terminate')throw Object.assign(new Error('Permission denied'),{stderr:'Permission denied'});
    if(args[1]==='openurl')opened=true;return {stdout:devices()};
  }),/Permission denied/);
  assert.equal(opened,false);
});
