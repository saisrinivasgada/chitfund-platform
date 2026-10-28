// Local simulator fixture. It never connects to a production service.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { openSimulatorLink } from './simulator-link.mjs';

const owners = ['a', 'b', 'c', 'd', 'e'].map((name, index) => {
  const id = (prefix) => `${prefix}0000000-0000-0000-0000-00000000000${index + 1}`;
  const role = name === 'e' ? 'MEMBER' : name === 'd' ? 'MANAGER' : 'ADMIN';
  const tenant = { tenantId: name === 'e' ? '10000000-0000-0000-0000-000000000001' : id('1'), name: `Offline QA Organisation ${name === 'e' ? 'A' : name.toUpperCase()}`, role, plan: 'GROWTH',
    status: 'ACTIVE', planExpiresAt: '2099-12-31T23:59:59', offlineEnabled: true };
  const user = { id: id('2'), username: name === 'e' ? 'offline-member-a' : `offline-${name}`, fullName: role === 'MEMBER' ? 'QA Member A' : `QA ${role === 'MANAGER' ? 'Manager' : 'Admin'} ${name.toUpperCase()}`, role,
    tenantId: tenant.tenantId, enabled: true, hasAppAccess: true, phone: '9000000000' };
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, tenantId: tenant.tenantId, role: user.role, exp: 4102444800 })).toString('base64url'), 'local-qa-only'].join('.');
  return { name, user, tenant, token, refreshToken: `local-qa-refresh-${name}`, memberId: id('3'), chitId: id('4'), secondaryChitId: id('5'),
    due: 1000, secondDue: 500, credit: 0, version: 1, enabled: true, pausePaymentDelivery: false, pauseDownloads: false, drawRequests: [], receipts: new Map(), reviews: new Map(), staffReviews: new Map(), staffReviewStaleOnce: false };
});
let online = true;
let drawFailure = false;
const stateFile = process.env.CHITWISE_QA_STATE_FILE;
if (stateFile && existsSync(stateFile)) {
  const saved = JSON.parse(readFileSync(stateFile, 'utf8')); const state = saved.data ?? saved;
  online = state.online ?? true; drawFailure = state.drawFailure ?? false;
  for (const prior of state.organisations ?? []) {
    const owner = owners.find((item) => item.name === prior.name); if (!owner) continue;
    for (const key of ['due','credit','version','enabled','secondDue','pausePaymentDelivery','pauseDownloads','staffReviewStaleOnce']) if (prior[key] != null) owner[key] = prior[key];
    owner.drawRequests = prior.drawRequests ?? [];
    owner.receipts = new Map((prior.receipts ?? []).map((r) => [r.id,r]));
    owner.reviews = new Map((prior.reviews ?? []).map((r) => [r.id,r]));
    owner.staffReviews = new Map((prior.staffReviews ?? []).map((r) => [r.id,r]));
  }
}
const snapshot = () => ({ online, drawFailure, organisations: owners.filter(owner => owner.name !== 'e').map((owner) => ({ name: owner.name, due: owner.due,
  credit: owner.credit, secondDue: owner.secondDue, version: owner.version, enabled: owner.enabled, pausePaymentDelivery: owner.pausePaymentDelivery, pauseDownloads: owner.pauseDownloads, drawRequests: owner.drawRequests,
  receipts: [...owner.receipts.values()], reviews: [...owner.reviews.values()], staffReviews: [...owner.staffReviews.values()], staffReviewStaleOnce: owner.staffReviewStaleOnce })) });
const member = (owner) => ({ id: owner.memberId, fullName: `QA Member ${owner.name.toUpperCase()}`, name: `QA Member ${owner.name.toUpperCase()}`,
  phone: '9000000001', status: 'ACTIVE', hasAppAccess: true, createdAt: '2026-10-15T12:00:00' });
const chit = (owner) => ({ id: owner.chitId, name: `QA Monthly Chit ${owner.name.toUpperCase()}`, status: 'ACTIVE', chitType: 'RESERVATION',
  chitValue: 20000, installmentAmount: 1000, durationMonths: 20, capacity: 20, memberCount: 1, currentMonth: 1,
  startDate: '2026-10-01', createdAt: '2026-10-01T12:00:00', winnerSelectionMode: 'LOTTERY' });
const chitsFor = (owner) => [chit(owner), { ...chit(owner), id: owner.secondaryChitId, name: `QA Second Chit ${owner.name.toUpperCase()}`, installmentAmount: 500, chitValue: 10000 }];
const page = (records, number, size) => ({ content: records.slice(number * size, (number + 1) * size), number,
  pageNumber: number, page: number, size, pageSize: size, totalElements: records.length, totalPages: Math.ceil(records.length / size),
  last: (number + 1) * size >= records.length, hasMore: (number + 1) * size < records.length });

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost'); let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (data, status = 200) => {
    if (stateFile) { writeFileSync(`${stateFile}.tmp`, JSON.stringify(snapshot())); renameSync(`${stateFile}.tmp`,stateFile); }
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ success: status < 400, data, message: status < 400 ? undefined : data.message, errorCode: data.errorCode }));
  };
  if (url.pathname === '/__qa/open-link' && request.method === 'POST') {
    try { await openSimulatorLink(process.env.CHITWISE_QA_DEVICE, body.link); return send({ opened: true }); }
    catch (error) { return send({ message: error.message }, 400); }
  }
  if (url.pathname === '/__qa/state') {
    if (request.method === 'POST') {
      if (body.online != null) online = body.online;
      if (body.drawFailure != null) drawFailure = body.drawFailure;
      const owner = owners.find((item) => item.name === (body.org ?? 'a'));
      if (typeof body.pauseDownloads === 'boolean') owner.pauseDownloads = body.pauseDownloads;
      if (typeof body.pausePaymentDelivery === 'boolean') owner.pausePaymentDelivery = body.pausePaymentDelivery;
      if (body.seedStaffReview) {
        if ([...owner.staffReviews.values()].some((r) => r.status === 'PENDING')) return send({ message: 'Finish the existing staff review first' }, 409);
        const entry = { id: randomUUID(), kind: 'STAFF_PICKUP', status: 'PENDING', operationId: randomUUID(),
          requestId: '60000000-0000-0000-0000-000000000001', recordedBy: '70000000-0000-0000-0000-000000000001',
          collectorName: 'QA Collector A', originalRole: 'STAFF', memberId: owner.memberId, chitId: owner.chitId,
          authorizationVerified: body.seedStaffReview !== 'LEGACY',
          action: body.seedStaffReview === 'UNKNOWN' ? 'MARK_PICKUP' : 'PARTIAL_COLLECT', amount: body.seedStaffReview === 'UNKNOWN' ? null : 100,
          recordedAt: new Date(Date.now() - 60_000).toISOString(), version: 'staff-v1',
          current: { status: 'ASSIGNED', assignedToOriginalCollector: true, pickedUpByOriginalCollector: false } };
        owner.staffReviews.set(entry.id, entry); owner.staffReviewStaleOnce = body.staffReviewStaleOnce === true;
      }
      for (const key of ['due', 'secondDue', 'enabled']) if (body[key] != null) { owner[key] = body[key]; owner.version++; }
    }
    return send(snapshot());
  }
  if (!online) return request.socket.destroy();
  const session = owners.find((item) => request.headers.authorization === `Bearer ${item.token}`)
    ?? owners.find((item) => item.refreshToken === body.refreshToken);
  const owner = session?.user.role === 'MEMBER' ? { ...owners[0], user: session.user, tenant: { ...owners[0].tenant, role: 'MEMBER' } } : session;
  if (url.pathname === '/api/auth/login') {
    const account = owners.find((item) => item.user.username === body.username);
    return account ? send({ accessToken: account.token, refreshToken: account.refreshToken, user: account.user, tenant: { ...account.tenant, offlineEnabled: account.enabled } })
      : send({ message: 'Use offline-a, offline-b or offline-c for local QA' }, 401);
  }
  if (url.pathname === '/api/auth/refresh') return session
    ? send({ accessToken: session.token, refreshToken: session.refreshToken, user: session.user, tenant: { ...session.tenant, offlineEnabled: owner.enabled } }) : send({ message: 'Unknown local account' }, 401);
  if (!owner) return send({ message: 'Unknown local account' }, 401);
  const path = url.pathname.slice(4);
  if (owner.user.role === 'MEMBER' && (['/members', '/members/offline-pages', '/payments/batches', '/payments/batches/all'].includes(path) || /^\/admin\/draws\/chit\//.test(path) || /^\/chits\/[^/]+\/reservations$/.test(path))) return send({ message: 'Member-only endpoint required' }, 403);
  if (owner.pauseDownloads && request.method === 'GET' && /^\/(members|chits)(\/|$)/.test(path)) return send({ message: 'Local QA first download interrupted' }, 503);
  if (path === '/users/me/offline-access') {
    const now = Date.now();
    return send({ enabled: owner.enabled, reason: owner.enabled ? null : 'ADD_ON_REQUIRED', actorId: owner.user.id, tenantId: owner.tenant.tenantId, role: owner.user.role, serverTime: now,
      grant: owner.enabled ? { id: randomUUID(), actorId: owner.user.id, tenantId: owner.tenant.tenantId, role: owner.user.role, issuedAt: now,
        recordUntil: now + 7 * 86400000, readUntil: now + 7 * 86400000, actions: owner.user.role === 'MEMBER' ? ['READ'] : ['READ', 'RECORD_PAYMENT'], token: `local-proof-${owner.name}` } : null });
  }

  const staffReviewBase = '/payments/offline/staff-actions/reviews';
  if (path === staffReviewBase) return send(page([...owner.staffReviews.values()].filter((r) => r.status === 'PENDING'), Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 20)));
  if (path.startsWith(staffReviewBase + '/')) {
    const entry = owner.staffReviews.get(path.slice(staffReviewBase.length + 1).split('/')[0]);
    if (!entry) return send({ message: 'Unknown local staff review' }, 404);
    if (request.method === 'POST' && path.endsWith('/resolve')) {
      if (!body.confirmed || body.reason?.trim().length < 5) return send({ message: 'Confirm the verified outcome and include a reason' }, 400);
      if (owner.staffReviewStaleOnce) { owner.staffReviewStaleOnce = false; entry.version = 'staff-v2'; return send({ message: 'Pickup changed during review. Refresh and review the latest details.' }, 409); }
      if (body.expectedVersion !== entry.version) return send({ message: 'Pickup changed during review. Refresh and review the latest details.' }, 409);
      if (entry.authorizationVerified === false && (!body.legacyDetailsVerified || (body.decision !== 'CANCEL_MISTAKE' && !Number.isFinite(Date.parse(body.verifiedRecordedAt))))) return send({ message: 'Verify older collection evidence and its actual original time' }, 400);
      if (body.decision !== 'CANCEL_MISTAKE' && (!(body.actualAmount > 0) || (entry.amount != null && body.actualAmount !== entry.amount))) return send({ message: 'Use the actual original collected amount' }, 400);
      if (body.decision === 'RECORD_REFUND' && (!body.reference || !body.refundedAt || !body.paymentMode)) return send({ message: 'Include completed refund evidence' }, 400);
      const status = { RECORD_CUSTODY: 'RECORDED', LINK_CUSTODY: 'LINKED', CANCEL_MISTAKE: 'CANCELLED', RECORD_REFUND: 'REFUNDED' }[body.decision];
      if (!status) return send({ message: 'Choose a pickup decision' }, 400);
      entry.status = status; entry.resolutionReason = body.reason; entry.result = { decision: body, outcome: { id: entry.requestId } };
    }
    return send(entry);
  }
  if (path === '/users/me') return send(owner.user);
  if (path === '/users/me/effective-limits' || path === '/users/me/billing-info') return send({ ...owner.tenant, tenantStatus: 'ACTIVE',
    maxMembers: -1, maxChits: -1, maxStaff: -1, maxManagers: -1, enabledAddOns: owner.enabled ? ['offline_support'] : [] });
  if (path.endsWith('/offline-pages') && (!owner.enabled || request.headers['x-offline-authorization'] !== `local-proof-${owner.name}`)) return send({ message: 'Offline add-on and read grant required' }, 403);
  if (path === '/members/offline-pages' || path === '/chits/offline-pages') return send({ ...page(path.startsWith('/members') ? [member(owner)] : chitsFor(owner), Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 200)), snapshotVersion: `local-v2-${owner.version}` });
  if (path === '/payments/batches/offline-pages') return send({ ...page([...owner.receipts.values()], Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 200)), snapshotVersion: `local-v2-${owner.version}` });
  if (path === '/members' || path === '/chits') return send(page(path === '/members' ? [member(owner)] : chitsFor(owner), Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 20)));
  if (path === `/members/${owner.memberId}` || path === '/members/me') return send(member(owner));
  if (path === `/chits/${owner.chitId}` || path === `/chits/${owner.secondaryChitId}`) return send(chitsFor(owner).find((c) => path.endsWith(c.id)));
  if (path.startsWith('/chits/member/') || path === '/chits/mine') return send(chitsFor(owner));
  if (path.endsWith('/enrollments')) return send([{ id: 'qa-enrollment', memberId: owner.memberId, chitId: owner.chitId, slotNumber: 1, active: true }]);
  if (path === '/payments/balance') {
    const secondary = url.searchParams.get('chitId') === owner.secondaryChitId; const due = secondary ? owner.secondDue : owner.due; const original = secondary ? 500 : 1000;
    return send({ memberId: owner.memberId, chitId: secondary ? owner.secondaryChitId : owner.chitId, totalOutstanding: due,
      months: due ? [{ monthNumber: 1, amountDue: original, amountPaid: original-due, balance: due, dueDate: '2026-10-15', status: due === original ? 'OUTSTANDING' : 'PARTIALLY_PAID' }] : [] });
  }
  if (path === '/payments/history') {
    const secondary = url.searchParams.get('chitId') === owner.secondaryChitId;
    const original = secondary ? 500 : 1000, due = secondary ? owner.secondDue : owner.due;
    return send([{ id: `qa-history-${secondary ? 'second' : 'first'}`, memberId: owner.memberId,
      chitId: secondary ? owner.secondaryChitId : owner.chitId, monthNumber: 1,
      amountDue: original, amountPaid: original - due, balance: due, dueDate: '2026-10-15',
      status: due === 0 ? 'SETTLED' : due === original ? 'OUTSTANDING' : 'PARTIALLY_PAID' }]);
  }
  if (path === '/payments/batches/member') return send([...owner.receipts.values()]);
  const filteredReceipts = () => [...owner.receipts.values()].filter(receipt =>
    (!url.searchParams.get('memberId') || receipt.memberId === url.searchParams.get('memberId'))
    && (!url.searchParams.get('chitId') || receipt.chitId === url.searchParams.get('chitId')));
  if (path === '/payments/batches') {
    if (!url.searchParams.get('memberId') || !url.searchParams.get('chitId')) return send({ message: 'Member and chit IDs are required' }, 400);
    return send(filteredReceipts());
  }
  if (path === '/payments/balance/total') return send(owner.due + owner.secondDue);
  if (path === '/admin/draws/open' && request.method === 'POST') {
    if (!Number.isInteger(body.monthNumber) || body.monthNumber < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate ?? '') || !(body.installmentAmount > 0) || !(body.maxCycles > 0) || !body.members?.length || body.chitId !== owner.chitId || body.members.some(m => m.memberId !== owner.memberId || !(m.amountDue >= 0))) return send({ message: 'Missing required draw fields or wrong account' }, 400);
    owner.drawRequests.push(body);
    return send({ message: drawFailure ? 'Draw changed while opening. Refresh and try again.' : 'This local fixture does not create financial draws.' }, drawFailure ? 409 : 501);
  }
  if (path.startsWith('/admin/draws/chit/') || path.startsWith('/admin/draws/member/chit/')) {
    const selected = path.split('/').at(-1);
    return send([{ id: `qa-draw-${selected}`, chitId: selected, monthNumber: 1, drawDate: '2026-10-15', status: 'COMPLETED' }]);
  }
  if (path.startsWith('/admin/draws/qa-draw-') && path.endsWith('/payments')) {
    const secondary = path.includes(owner.secondaryChitId); const original = secondary ? 500 : 1000; const due = secondary ? owner.secondDue : owner.due;
    return send([{ id: `qa-instalment-${secondary ? 'second' : 'first'}`, memberId: owner.memberId, chitId: secondary ? owner.secondaryChitId : owner.chitId,
      monthNumber: 1, amountDue: original, amountPaid: original-due, balance: due, status: due === 0 ? 'SETTLED' : due === original ? 'OUTSTANDING' : 'PARTIALLY_PAID' }]);
  }
  if (path.startsWith('/payments/credits/')) return send({ memberId: owner.memberId, balance: owner.credit, recentTransactions: [] });
  if (path === '/payments/batches/all') return send(url.searchParams.has('page')
    ? page(filteredReceipts(), Number(url.searchParams.get('page')), Number(url.searchParams.get('size') ?? 50)) : filteredReceipts());
  if (path.startsWith('/payments/batches/') && owner.receipts.has(path.split('/').at(-1))) return send(owner.receipts.get(path.split('/').at(-1)));
  if (['/payments', '/payments/offline/record'].includes(path) && request.method === 'POST') {
    if (owner.pausePaymentDelivery) return send({ message: 'Local QA delivery is held until account B is selected' }, 503);
    if (body.memberId !== owner.memberId || body.offlineAuthorization !== `local-proof-${owner.name}`) return send({ message: 'Wrong account collection' }, 403);
    const operation = request.headers['x-idempotency-key'];
    const closed = [...owner.reviews.values()].find((r) => r.operationId === operation && ['REFUNDED', 'CANCELLED'].includes(r.status));
    if (closed) return send({ reviewId: closed.id, message: 'Collection already closed after review', errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED' }, 409);
    const prior = [...owner.receipts.values()].find((receipt) => receipt.operationId === operation);
    if (prior) return send(prior);
    const requested = body.allocations?.length ? body.allocations : [{ chitId: body.chitId, amount: body.amount }];
    if (new Set(requested.map((a) => a.chitId)).size !== requested.length || requested.some((a) => ![owner.chitId,owner.secondaryChitId].includes(a.chitId) || a.amount <= 0) || Math.abs(requested.reduce((sum,a)=>sum+a.amount,0)-body.amount)>0.0001) return send({message:'Invalid original allocation'},400);
    if (requested.some((a) => a.amount > (a.chitId === owner.chitId ? owner.due : owner.secondDue))) {
      let held = [...owner.reviews.values()].find((review) => review.operationId === operation);
      if (!held) { held = { id: randomUUID(), operationId: operation, ...body, status: 'PENDING', reviewReason: 'DUES_CHANGED', submittedAt: new Date().toISOString() }; owner.reviews.set(held.id, held); }
      return send({ reviewId: held.id, message: 'Saved collection needs admin review. It remains preserved.', errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED' }, 409);
    }
    const receipt = { id: randomUUID(), ...body, totalAmount: body.amount, status: 'COMPLETED', operationId: operation, createdAt: new Date().toISOString(), syncedAt: new Date().toISOString(), allocations: requested.map((a) => ({ ...a, monthNumber: 1 })) };
    owner.receipts.set(receipt.id, receipt); for(const a of requested) { if(a.chitId === owner.chitId) owner.due -= a.amount; else owner.secondDue -= a.amount; } owner.version++; return send(receipt);
  }
  if (path === '/payments/offline/reviews/cancel-unsynced') {
    if (!body.cancellation?.noMoneyCollected || body.cancellation?.reason?.trim().length < 5 || body.original?.offlineAuthorization !== `local-proof-${owner.name}` || body.originalActorId !== owner.user.id) return send({ message: 'Original evidence and no-money confirmation required' }, 400);
    const operation = request.headers['x-idempotency-key'];
    const receipt = [...owner.receipts.values()].find((entry) => entry.operationId === operation);
    if (receipt) return send({ status: 'RECEIPT_EXISTS', receiptId: receipt.id, receipt });
    let review = [...owner.reviews.values()].find((entry) => entry.operationId === operation);
    if (!review) { review = { id: randomUUID(), operationId: operation, ...body.original, status: 'CANCELLED', resolutionReason: body.cancellation.reason, reviewReason: 'CANCELLATION_REQUESTED', submittedAt: new Date().toISOString() }; owner.reviews.set(review.id, review); }
    return send(review);
  }
  if (path === '/payments/offline/reviews') return send(page([...owner.reviews.values()].filter((review) => review.status === 'PENDING'), 0, 20));
  const reviewId = path.match(/^\/payments\/offline\/reviews\/([^/]+)/)?.[1];
  if (reviewId && owner.reviews.has(reviewId)) {
    const review = owner.reviews.get(reviewId);
    if (request.method === 'POST') {
      if (review.status !== 'PENDING') return send(review);
      if (path.endsWith('/cancel')) {
        if (!body.noMoneyCollected || !body.reason || body.reason.length < 5) return send({ message: 'Confirm no money was collected and include a reason' }, 400);
        review.status = 'CANCELLED'; review.resolutionReason = body.reason; return send(review);
      }
      if (path.endsWith('/refund')) {
        if (!body.moneyReturned || Number(body.amount) !== Number(review.amount) || !body.reference || !body.reason) return send({ message: 'Include completed return evidence' }, 400);
        review.status = 'REFUNDED'; review.refund = body; return send(review);
      }
      if (body.expectedBalanceVersion !== String(owner.version)) return send({ message: 'Balances changed; refresh and review again' }, 409);
      if (body.decision === 'APPLY_WITH_EXCESS') {
        const receipt = { ...review, id: randomUUID(), totalAmount: review.amount, status: 'COMPLETED', createdAt: new Date().toISOString(), allocations: [] };
        owner.receipts.set(receipt.id, receipt); owner.credit += Math.max(0, review.amount - owner.due); owner.due = Math.max(0, owner.due - review.amount);
        review.receiptId = receipt.id; review.status = 'APPLIED'; owner.version++;
      }
      return send(review);
    }
    return send({ ...review, balance: { version: String(owner.version), selectedOutstanding: owner.due, totalOutstanding: owner.due, creditBalance: owner.credit }, recentPayments: [...owner.receipts.values()] });
  }
  if (path === '/admin/wallet/balance') return send({ cashBalance: 0, bankBalance: 0, totalBalance: 0 });
  if (path === '/payments/requests/summary') return send({ pending: 0, assigned: 0, pickedUp: 0, partiallyCollected: 0, collected: 0, cancelled: 0 });
  if (path.includes('unread')) return send({ count: 0 });
  return send([]);
}).listen(Number(process.env.CHITWISE_OFFLINE_QA_PORT ?? 3112), '127.0.0.1');
