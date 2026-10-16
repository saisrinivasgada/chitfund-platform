import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCoreData } from './preparation.js';

// Recreate the adapter on every run to model app termination. Only the journal
// survives; completed requests cannot be remembered by the running process.
function device({ memberCount = 850, role = 'ADMIN' } = {}) {
  const disk = { manifest: null, roots: new Map(), jobs: new Map(), published: new Map(),
    outbox: [{ id: 'saved-payment', amount: 125 }], lease: null, calls: [], fail: null, failPublish: null };
  const members = Array.from({ length: memberCount }, (_, index) => ({ id: `member-${index}` }));
  const copy = (value) => value == null ? value : structuredClone(value);
  const adapter = () => ({
    role, newId: () => 'cycle-1', loadManifest: async () => copy(disk.manifest),
    claimLease: async () => disk.lease ? null : (disk.lease = 'lease'),
    releaseLease: async () => { disk.lease = null; },
    saveManifest: async (manifest) => { disk.manifest = copy(manifest); return manifest; },
    cleanOldWork: async () => {}, canContinue: async () => true,
    loadRoot: async (cycle, kind) => copy(disk.roots.get(`${cycle}:${kind}`)),
    saveRoot: async (cycle, kind, state) => { disk.roots.set(`${cycle}:${kind}`, copy(state)); },
    publish: async (kind, records) => {
      if (disk.failPublish === kind) throw new Error('Device storage interrupted');
      disk.published.set(kind, copy(records));
    },
    request: async (path, params) => {
      disk.calls.push({ path, ...params });
      if (disk.fail?.(path, params)) throw new Error('Connection interrupted');
      if (path === '/members/me') return { success: true, data: members[0] };
      if (path === '/members') {
        return { success: true, data: { content: members.slice(params.page * params.size, (params.page + 1) * params.size),
          number: params.page, totalElements: members.length, totalPages: Math.ceil(members.length / params.size),
          last: (params.page + 1) * params.size >= members.length } };
      }
      if (path === '/chits/mine') return { success: true, data: [{ id: 'own-chit' }] };
      if (path === '/chits') return { success: true, data: { content: [], pageNumber: params.page,
        totalElements: 0, totalPages: 0, last: true } };
      if (path === '/payments/batches/all') return { success: true, data: { content: [], page: params.page,
        totalElements: 0, hasMore: false } };
      return { success: true, data: [] };
    },
    saveResponse: async () => {},
    addJobs: async (cycle, jobs) => {
      for (const job of jobs) if (!disk.jobs.has(job.key)) disk.jobs.set(job.key, { ...job, done: false });
    },
    nextJobs: async (cycle, limit) => [...disk.jobs.values()].filter((job) => !job.done).slice(0, limit),
    finishJob: async (cycle, key) => { disk.jobs.get(key).done = true; },
    failJob: async () => {},
    jobCounts: async () => { const jobs = [...disk.jobs.values()]; const done = jobs.filter((job) => job.done).length;
      return { total: jobs.length, done, pending: jobs.length - done }; },
  });
  return { disk, members, adapter };
}

test('reopening resumes remaining pages beyond 500 members, even when a refresh is requested', async () => {
  const { disk, adapter } = device();
  const paused = await prepareCoreData(adapter(), { maxRequests: 2 });
  assert.equal(paused.status, 'paused');
  assert.equal(disk.roots.get('cycle-1:members').page, 2);
  assert.equal(disk.published.has('members'), false);
  await prepareCoreData(adapter(), { force: true, maxRequests: 5 });
  assert.deepEqual(disk.calls.filter((call) => call.path === '/members').map((call) => call.page), [0, 1, 2, 3, 4]);
  assert.equal(disk.published.get('members').length, 850);
  assert.deepEqual(disk.outbox, [{ id: 'saved-payment', amount: 125 }]);
});

test('lost connection retries only the uncommitted page, preserving an older complete snapshot', async () => {
  const { disk, adapter } = device();
  disk.published.set('members', [{ id: 'previous-snapshot' }]);
  disk.fail = (path, params) => path === '/members' && params.page === 2;
  await assert.rejects(prepareCoreData(adapter()), /Connection interrupted/);
  assert.deepEqual(disk.published.get('members'), [{ id: 'previous-snapshot' }]);
  disk.fail = null;
  await prepareCoreData(adapter(), { maxRequests: 5 });
  assert.deepEqual(disk.calls.filter((call) => call.path === '/members').map((call) => call.page), [0, 1, 2, 2, 3, 4]);
});

test('a stop after saving the last chunk retries publication without redownloading any chunks', async () => {
  const { disk, adapter } = device({ memberCount: 250 });
  disk.failPublish = 'members';
  await assert.rejects(prepareCoreData(adapter()), /Device storage interrupted/);
  disk.failPublish = null;
  await prepareCoreData(adapter(), { maxRequests: 2 });
  assert.deepEqual(disk.calls.filter((call) => call.path === '/members').map((call) => call.page), [0, 1]);
  assert.equal(disk.published.get('members').length, 250);
});

test('successful detail downloads are not repeated when a peer request fails', async () => {
  const { disk, adapter } = device({ memberCount: 1 });
  disk.fail = (path) => path === '/chits/member/member-0';
  const paused = await prepareCoreData(adapter(), { maxRequests: 20 });
  assert.equal(paused.status, 'paused');
  disk.fail = null;
  const complete = await prepareCoreData(adapter(), { maxRequests: 30 });
  assert.equal(complete.status, 'ready');
  assert.equal(disk.calls.filter((call) => call.path === '/members/member-0').length, 1);
  assert.equal(disk.calls.filter((call) => call.path === '/chits/member/member-0').length, 2);
});

test('changing page totals restarts only the inconsistent list and never discards payments', async () => {
  const { disk, members, adapter } = device({ memberCount: 450 });
  await prepareCoreData(adapter(), { maxRequests: 1 });
  members.push({ id: 'new-member' });
  await assert.rejects(prepareCoreData(adapter()), /list changed/);
  assert.equal(disk.roots.get('cycle-1:members').page, 0);
  assert.equal(disk.published.has('members'), false);
  await prepareCoreData(adapter(), { maxRequests: 5 });
  assert.equal(disk.published.get('members').length, 451);
  assert.equal(disk.outbox[0].id, 'saved-payment');
});

test('a member preparation never requests organisation member lists or another member history', async () => {
  const { disk, adapter } = device({ memberCount: 1, role: 'MEMBER' });
  const result = await prepareCoreData(adapter(), { maxRequests: 30 });
  assert.equal(result.status, 'ready');
  assert.ok(disk.calls.some((call) => call.path === '/admin/draws/member/chit/own-chit'));
  assert.ok(disk.calls.every((call) => call.path !== '/members' && call.path !== '/payments/batches/all'));
  assert.ok(disk.calls.filter((call) => call.path === '/payments/history').every((call) => call.memberId === 'member-0'));
});

test('a second worker cannot download chunks while the account lease is held', async () => {
  const { disk, adapter } = device();
  disk.lease = 'another-worker';
  await prepareCoreData(adapter());
  assert.equal(disk.calls.length, 0);
});

test('payment batch chunks resume with the server page/hasMore contract', async () => {
  const { disk, adapter } = device({ memberCount: 0 });
  const batchAdapter = () => {
    const current = adapter(); const request = current.request;
    current.request = async (path, params) => path === '/payments/batches/all'
      ? (disk.calls.push({ path, ...params }), { success: true, data: {
        content: [{ id: `batch-${params.page}` }], page: params.page, totalElements: 3, hasMore: params.page < 2,
      } }) : request(path, params);
    return current;
  };
  await prepareCoreData(batchAdapter(), { maxRequests: 3 });
  assert.equal(disk.roots.get('cycle-1:batches').page, 1);
  await prepareCoreData(batchAdapter(), { maxRequests: 2 });
  assert.deepEqual(disk.calls.filter((call) => call.path === '/payments/batches/all').map((call) => call.page), [0, 1, 2]);
  assert.equal(disk.published.get('batches').length, 3);
});
