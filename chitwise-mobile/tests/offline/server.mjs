// Local simulator fixture. It never connects to a production service.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const owners = ['a', 'b'].map((name, index) => {
  const id = (prefix) => `${prefix}0000000-0000-0000-0000-00000000000${index + 1}`;
  const tenant = { tenantId: id('1'), name: `Offline QA Organisation ${name.toUpperCase()}`, role: 'ADMIN', plan: 'GROWTH',
    status: 'ACTIVE', planExpiresAt: '2099-12-31T23:59:59', offlineEnabled: true };
  const user = { id: id('2'), username: `offline-${name}`, fullName: `QA Admin ${name.toUpperCase()}`, role: 'ADMIN',
    tenantId: tenant.tenantId, enabled: true, hasAppAccess: true, phone: '9000000000' };
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, tenantId: tenant.tenantId, role: user.role, exp: 4102444800 })).toString('base64url'), 'local-qa-only'].join('.');
  return { name, user, tenant, token, refreshToken: `local-qa-refresh-${name}`, memberId: id('3'), chitId: id('4'),
    due: 1000, credit: 0, version: 1, enabled: true, receipts: new Map(), reviews: new Map() };
});
let online = true;
const member = (owner) => ({ id: owner.memberId, fullName: `QA Member ${owner.name.toUpperCase()}`, name: `QA Member ${owner.name.toUpperCase()}`,
  phone: '9000000001', status: 'ACTIVE', hasAppAccess: true, createdAt: '2026-10-15T12:00:00' });
const chit = (owner) => ({ id: owner.chitId, name: `QA Monthly Chit ${owner.name.toUpperCase()}`, status: 'ACTIVE', chitType: 'MONTHLY',
  chitValue: 20000, installmentAmount: 1000, durationMonths: 20, capacity: 20, memberCount: 1, currentMonth: 1,
  startDate: '2026-10-01', createdAt: '2026-10-01T12:00:00', winnerSelectionMode: 'LOTTERY' });
const page = (records, number, size) => ({ content: records.slice(number * size, (number + 1) * size), number,
  pageNumber: number, page: number, size, pageSize: size, totalElements: records.length, totalPages: Math.ceil(records.length / size),
  last: (number + 1) * size >= records.length, hasMore: (number + 1) * size < records.length });

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost'); let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (data, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ success: status < 400, data, message: status < 400 ? undefined : data.message, errorCode: data.errorCode }));
  };
  if (url.pathname === '/__qa/state') {
    if (request.method === 'POST') {
      if (body.online != null) online = body.online;
      const owner = owners.find((item) => item.name === (body.org ?? 'a'));
      for (const key of ['due', 'enabled']) if (body[key] != null) { owner[key] = body[key]; owner.version++; }
    }
    return send({ online, organisations: owners.map((owner) => ({ name: owner.name, due: owner.due,
      receipts: [...owner.receipts.values()], reviews: [...owner.reviews.values()] })) });
  }
  if (!online) return request.socket.destroy();
  const owner = owners.find((item) => request.headers.authorization === `Bearer ${item.token}`)
    ?? owners.find((item) => item.refreshToken === body.refreshToken);
  if (url.pathname === '/api/auth/login') {
    const account = owners.find((item) => item.user.username === body.username);
    return account ? send({ accessToken: account.token, refreshToken: account.refreshToken, user: account.user, tenant: account.tenant })
      : send({ message: 'Use offline-a or offline-b for local QA' }, 401);
  }
  if (url.pathname === '/api/auth/refresh') return owner
    ? send({ accessToken: owner.token, refreshToken: owner.refreshToken, user: owner.user, tenant: owner.tenant }) : send({ message: 'Unknown local account' }, 401);
  if (!owner) return send({ message: 'Unknown local account' }, 401);
  const path = url.pathname.slice(4);
  if (path === '/users/me/offline-access') {
    const now = Date.now();
    return send({ enabled: owner.enabled, actorId: owner.user.id, tenantId: owner.tenant.tenantId, role: 'ADMIN', serverTime: now,
      grant: owner.enabled ? { id: randomUUID(), actorId: owner.user.id, tenantId: owner.tenant.tenantId, role: 'ADMIN', issuedAt: now,
        recordUntil: now + 7 * 86400000, readUntil: now + 7 * 86400000, actions: ['READ', 'RECORD_PAYMENT'], token: `local-proof-${owner.name}` } : null });
  }
  if (path === '/users/me') return send(owner.user);
  if (path === '/users/me/effective-limits' || path === '/users/me/billing-info') return send({ ...owner.tenant, tenantStatus: 'ACTIVE',
    maxMembers: -1, maxChits: -1, maxStaff: -1, maxManagers: -1, enabledAddOns: owner.enabled ? ['offline_support'] : [] });
  if (path === '/members' || path === '/chits') return send(page([path === '/members' ? member(owner) : chit(owner)], Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 20)));
  if (path === `/members/${owner.memberId}` || path === '/members/me') return send(member(owner));
  if (path === `/chits/${owner.chitId}`) return send(chit(owner));
  if (path.startsWith('/chits/member/') || path === '/chits/mine') return send([chit(owner)]);
  if (path.endsWith('/enrollments')) return send([{ id: 'qa-enrollment', memberId: owner.memberId, chitId: owner.chitId, slotNumber: 1, active: true }]);
  if (path === '/payments/balance') return send({ memberId: owner.memberId, chitId: owner.chitId, totalOutstanding: owner.due,
    months: [{ monthNumber: 1, amountDue: 1000, amountPaid: 1000 - owner.due, balance: owner.due, dueDate: '2026-10-15', status: owner.due ? 'OUTSTANDING' : 'SETTLED' }] });
  if (path === '/payments/balance/total') return send({ memberId: owner.memberId, totalOutstanding: owner.due, creditBalance: owner.credit, chits: [] });
  if (path.startsWith('/payments/credits/')) return send({ memberId: owner.memberId, balance: owner.credit, recentTransactions: [] });
  if (path === '/payments/batches/all') return send(page([...owner.receipts.values()], Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 50)));
  if (path.startsWith('/payments/batches/') && owner.receipts.has(path.split('/').at(-1))) return send(owner.receipts.get(path.split('/').at(-1)));
  if (path === '/payments' && request.method === 'POST') {
    if (body.memberId !== owner.memberId || body.offlineAuthorization !== `local-proof-${owner.name}`) return send({ message: 'Wrong account collection' }, 403);
    const operation = request.headers['x-idempotency-key'];
    const prior = [...owner.receipts.values()].find((receipt) => receipt.operationId === operation);
    if (prior) return send(prior);
    if (body.amount > owner.due) {
      let held = [...owner.reviews.values()].find((review) => review.operationId === operation);
      if (!held) { held = { id: randomUUID(), operationId: operation, ...body, status: 'PENDING', reviewReason: 'DUES_CHANGED', submittedAt: new Date().toISOString() }; owner.reviews.set(held.id, held); }
      return send({ reviewId: held.id, message: 'Saved collection needs admin review. It remains preserved.', errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED' }, 409);
    }
    const receipt = { id: randomUUID(), ...body, totalAmount: body.amount, status: 'COMPLETED', operationId: operation, createdAt: new Date().toISOString(), syncedAt: new Date().toISOString(), allocations: [] };
    owner.receipts.set(receipt.id, receipt); owner.due -= body.amount; owner.version++; return send(receipt);
  }
  if (path === '/payments/offline/reviews') return send(page([...owner.reviews.values()].filter((review) => review.status === 'PENDING'), 0, 20));
  const reviewId = path.match(/^\/payments\/offline\/reviews\/([^/]+)/)?.[1];
  if (reviewId && owner.reviews.has(reviewId)) {
    const review = owner.reviews.get(reviewId);
    if (request.method === 'POST') {
      if (review.status !== 'PENDING') return send(review);
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
