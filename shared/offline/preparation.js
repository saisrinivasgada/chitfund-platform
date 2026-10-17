import { requestKey } from './readSnapshots.js';

const PAGE_SIZE = 200;
const envelopeData = (response) => response?.data ?? response;
const collection = (value) => Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : value?.id ? [value] : null;
const job = (path, params = {}, extra = {}) => ({ path, params, ...extra, key: requestKey(path, params) });

function roots(role) {
  return role === 'MEMBER'
    ? [{ kind: 'members', path: '/members/me', paged: false }, { kind: 'chits', path: '/chits/mine', paged: true },
      { kind: 'batches', path: '/payments/batches/member', paged: true }]
    : [{ kind: 'members', path: '/members', paged: true }, { kind: 'chits', path: '/chits', paged: true },
      { kind: 'batches', path: role === 'STAFF' ? '/payments/batches/mine' : '/payments/batches/all', paged: true }];
}

function pairJobs(memberId, chitId, role) {
  const params = { memberId, chitId };
  return [job('/payments/balance', params), job('/payments/history', params),
    ...(role === 'ADMIN' ? [job('/payments/batches', params)] : [])];
}

function initialJobs(role, members, chits) {
  const result = [];
  if (role === 'MEMBER') {
    const memberId = members[0]?.id;
    if (!memberId) throw new Error('Member profile was not included in the organisation download');
    result.push(job('/payments/balance/total', { memberId }), job('/payments/credits/' + memberId), job('/payments/requests/my-requests'));
    for (const chit of chits) result.push(job('/chits/' + chit.id), job('/chits/' + chit.id + '/winners'),
      job('/chits/' + chit.id + '/auction'), job('/admin/draws/member/chit/' + chit.id), ...pairJobs(memberId, chit.id, role));
    return result;
  }
  if (role === 'STAFF') return [job('/payments/requests/mine', {}, { kind: 'staff-tasks' }),
    job('/payments/requests/mine/history', {}, { kind: 'staff-tasks' })];
  for (const member of members) result.push(job('/members/' + member.id),
    job('/chits/member/' + member.id, {}, { kind: 'member-chits', memberId: member.id }),
    job('/payments/balance/total', { memberId: member.id }), job('/payments/credits/' + member.id));
  for (const chit of chits) result.push(job('/chits/' + chit.id), job('/chits/' + chit.id + '/enrollments'),
    job('/chits/' + chit.id + '/winners'), job('/chits/' + chit.id + '/reservations'),
    job('/chits/' + chit.id + '/auction'),
    job('/admin/draws/chit/' + chit.id, {}, { kind: 'draws' }));
  for (const path of ['/payments/requests/active', '/payments/requests/summary', '/payments/pending-remittance',
    '/payments/batches/today', '/admin/draws/today', '/admin/wallet/balance', '/users/staff',
    '/payouts/pending', '/payouts/today']) result.push(job(path));
  if (role === 'MANAGER') result.push(job('/payments/requests/mine', {}, { kind: 'staff-tasks' }),
    job('/payments/requests/mine/history', {}, { kind: 'staff-tasks' }));
  result.push(job('/chits/org-reservations'), job('/admin/draws/recent', { days: 60 }));
  return result;
}

function relatedJobs(request, data, role) {
  if (request.kind === 'member-chits') return (collection(data) ?? []).flatMap((chit) => pairJobs(request.memberId, chit.id, role));
  if (request.kind === 'draws') return (collection(data) ?? []).map((draw) => job('/admin/draws/' + draw.id + '/payments'));
  if (request.kind === 'staff-tasks') return (collection(data) ?? []).flatMap((task) => task.memberId && task.chitId
    ? [job('/members/' + task.memberId), job('/chits/' + task.chitId), ...pairJobs(task.memberId, task.chitId, role)] : []);
  return [];
}

/**
 * Platform adapters durably journal roots/jobs and hold an account-scoped lease.
 * Only completed full lists are published; interrupted work never replaces them.
 */
export async function prepareCoreData(adapter, { force = false, maxRequests = 40, deadline = Infinity } = {}) {
  let manifest = await adapter.loadManifest();
  if (manifest?.status === 'ready' && !force && Date.now() - manifest.lastCompleteAt < 300_000) return manifest;
  const lease = await adapter.claimLease();
  if (!lease) return manifest;
  let requests = 0;
  try {
    manifest = await adapter.loadManifest();
    if (manifest?.status === 'ready' && !force && Date.now() - manifest.lastCompleteAt < 300_000) return manifest;
    if (!manifest || manifest.status === 'ready') {
      manifest = { cycle: adapter.newId(), role: adapter.role, phase: 'roots', rootsDone: [],
        status: 'preparing', startedAt: Date.now(), lastCompleteAt: manifest?.lastCompleteAt ?? null, completed: 0, total: 0 };
      await adapter.saveManifest(manifest, lease);
      await adapter.cleanOldWork(manifest.cycle);
    }
    manifest.status = 'preparing';
    const mayContinue = async () => requests < maxRequests && Date.now() < deadline && await adapter.canContinue();
    for (const root of roots(adapter.role)) {
      if (manifest.rootsDone.includes(root.kind)) continue;
      let state = await adapter.loadRoot(manifest.cycle, root.kind) ?? { items: [], page: 0, complete: false };
      if (adapter.requiresRootSnapshots && state.page > 0 && !state.complete && !state.snapshotVersion) {
        state = { items: [], page: 0, complete: false };
        await adapter.saveRoot(manifest.cycle, root.kind, state);
      }
      // Upgrade older journals without another network download.
      if (adapter.commitRootChunk && Array.isArray(state.items)) {
        const records = state.items;
        state = { ...state, items: undefined, count: records.length, chunks: records.length ? 1 : 0 };
        if (records.length) await adapter.commitRootChunk(manifest.cycle, root.kind, 0, records, state);
        else await adapter.saveRoot(manifest.cycle, root.kind, state);
      }
      const resetRoot = async () => adapter.saveRoot(manifest.cycle, root.kind,
        adapter.commitRootChunk ? { page: 0, count: 0, chunks: 0, complete: false } : { items: [], page: 0, complete: false });
      while (!state.complete && await mayContinue()) {
        const params = root.paged ? { page: state.page, size: PAGE_SIZE } : {};
        let response;
        try { response = await adapter.request(root.path, params, state.snapshotVersion); }
        catch (error) {
          if ((error?.status ?? error?.response?.status) === 409) await resetRoot();
          throw error;
        }
        requests++;
        if (!await adapter.canContinue()) throw new Error('Account access or connection changed; data preparation is paused');
        if (response?.success === false) throw new Error(response.message ?? 'Server did not confirm the download');
        const data = envelopeData(response);
        const items = collection(data);
        if (!items || items.some((item) => !item?.id)) throw new Error('Downloaded list did not include stable record identities');
        const snapshotVersion = response?.snapshotVersion ?? data?.snapshotVersion;
        if (state.snapshotVersion != null && snapshotVersion !== state.snapshotVersion) {
          await resetRoot();
          throw new Error('This list changed while downloading. Preparation will restart that list safely.');
        }
        if (root.paged && adapter.requiresRootSnapshots && (typeof snapshotVersion !== 'string' || !snapshotVersion)) throw new Error('Server did not confirm a stable download version');
        const responsePage = data?.number ?? data?.pageNumber ?? data?.page;
        if (root.paged && responsePage != null && responsePage !== state.page) throw new Error('Server returned a different download page');
        if (state.totalElements != null && data?.totalElements != null && state.totalElements !== data.totalElements) {
          await resetRoot();
          throw new Error('This list changed while downloading. Preparation will restart that list safely.');
        }
        const priorIds = new Set((state.items ?? []).map((item) => item.id));
        if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => priorIds.has(item.id))) {
          await resetRoot();
          throw new Error('This list changed between download pages. Preparation will retry.');
        }
        const complete = !root.paged || data.last === true || data.hasMore === false
          || (Number.isInteger(data.totalPages) && state.page + 1 >= data.totalPages);
        if (root.paged && !Number.isInteger(data.totalPages) && typeof data.hasMore !== 'boolean') throw new Error('Server did not confirm pagination coverage');
        const nextState = { page: state.page + 1, complete, snapshotVersion,
          totalElements: data?.totalElements ?? state.totalElements,
          ...(adapter.commitRootChunk ? { count: (state.count ?? 0) + items.length, chunks: (state.chunks ?? 0) + 1 }
            : { items: [...state.items, ...items] }) };
        if (complete && nextState.totalElements != null && (nextState.count ?? nextState.items.length) !== nextState.totalElements) {
          await resetRoot();
          throw new Error('Downloaded record count did not match the server. Preparation will retry.');
        }
        await adapter.saveResponse(root.path, params, response);
        if (root.kind === 'batches' && adapter.role !== 'STAFF') {
          // The list already contains the complete receipt DTO, including its
          // allocations. Reuse it for offline detail screens without N extra GETs.
          for (const receipt of items) await adapter.saveResponse('/payments/batches/' + receipt.id, {}, { success: true, data: receipt });
        }
        if (adapter.commitRootChunk) await adapter.commitRootChunk(manifest.cycle, root.kind, state.chunks ?? 0, items, nextState);
        else await adapter.saveRoot(manifest.cycle, root.kind, nextState);
        state = nextState;
        manifest.completed++;
        manifest.message = `Saving ${root.kind}`;
        await adapter.saveManifest(manifest, lease);
      }
      if (!state.complete) return await adapter.saveManifest({ ...manifest, status: 'paused' }, lease);
      // Publishing and checkpointing are separate durable writes. A process can
      // stop between them: reuse the completed root without downloading it again.
      await adapter.publish(root.kind, adapter.commitRootChunk
        ? { format: 'chunks-v1', cycle: manifest.cycle, kind: root.kind, chunks: state.chunks, count: state.count, snapshotStartedAt: manifest.startedAt } : state.items);
      manifest.rootsDone.push(root.kind);
      manifest[root.kind + 'Count'] = state.count ?? state.items.length;
      await adapter.saveManifest(manifest, lease);
    }
    if (manifest.phase === 'roots') {
      if (adapter.loadRootChunk) {
        const memberRoot = await adapter.loadRoot(manifest.cycle, 'members');
        const memberProfile = adapter.role === 'MEMBER' ? await adapter.loadRootChunk(manifest.cycle, 'members', 0) : [];
        // Seed work page by page. A restart can repeat inserts, never requests;
        // job identities are unique and completed jobs are never reset.
        if (adapter.role !== 'MEMBER') await adapter.addJobs(manifest.cycle, initialJobs(adapter.role, [], []));
        for (const kind of ['members', 'chits']) {
          const rootState = kind === 'members' ? memberRoot : await adapter.loadRoot(manifest.cycle, kind);
          for (let index = manifest.seeded?.[kind] ?? 0; index < rootState.chunks; index++) {
            if (Date.now() >= deadline || !await adapter.canContinue()) return await adapter.saveManifest({ ...manifest, status: 'paused' }, lease);
            const records = await adapter.loadRootChunk(manifest.cycle, kind, index);
            const jobs = initialJobs(adapter.role, kind === 'members' ? records : memberProfile, kind === 'chits' ? records : []);
            await adapter.addJobs(manifest.cycle, jobs);
            manifest.seeded = { ...manifest.seeded, [kind]: index + 1 };
            await adapter.saveManifest(manifest, lease);
          }
        }
      } else {
        const members = (await adapter.loadRoot(manifest.cycle, 'members')).items;
        const chits = (await adapter.loadRoot(manifest.cycle, 'chits')).items;
        await adapter.addJobs(manifest.cycle, initialJobs(adapter.role, members, chits));
      }
      manifest.phase = 'details';
      await adapter.saveManifest(manifest, lease);
    }
    while (await mayContinue()) {
      const batch = await adapter.nextJobs(manifest.cycle, Math.min(3, maxRequests - requests));
      if (!batch.length) break;
      // Each response remains pinned to this adapter's account, including after a switch.
      const outcomes = await Promise.allSettled(batch.map(async (request) => {
        const response = await adapter.request(request.path, request.params);
        if (!await adapter.canContinue()) throw new Error('Account access or connection changed; data preparation is paused');
        if (response?.success === false) throw new Error(response.message ?? 'Server did not confirm the download');
        await adapter.saveResponse(request.path, request.params, response);
        await adapter.addJobs(manifest.cycle, relatedJobs(request, envelopeData(response), adapter.role));
        await adapter.finishJob(manifest.cycle, request.key);
      }));
      requests += batch.length;
      let failure;
      for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        if (outcome.status === 'rejected') {
          failure ??= outcome.reason;
          await adapter.failJob(manifest.cycle, batch[i].key, String(outcome.reason?.message ?? 'Download interrupted').slice(0, 300));
        }
      }
      const counts = await adapter.jobCounts(manifest.cycle);
      manifest.total = counts.total;
      manifest.detailsDone = counts.done;
      manifest.message = failure ? String(failure.message ?? 'Connect to continue preparing data').slice(0, 300) : 'Saving related details';
      await adapter.saveManifest(manifest, lease);
      if (failure) return await adapter.saveManifest({ ...manifest, status: 'paused' }, lease);
    }
    const counts = await adapter.jobCounts(manifest.cycle);
    manifest.total = counts.total;
    manifest.detailsDone = counts.done;
    const ready = counts.pending === 0;
    manifest.status = ready ? 'ready' : 'paused';
    if (ready) { manifest.lastCompleteAt = Date.now(); manifest.message = 'Core offline data is ready'; }
    return await adapter.saveManifest(manifest, lease);
  } catch (error) {
    if (manifest) await adapter.saveManifest({ ...manifest, status: 'paused', message: String(error.message ?? 'Download interrupted').slice(0, 300) }, lease);
    throw error;
  } finally { await adapter.releaseLease(lease); }
}
