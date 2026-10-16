import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('dist');
const receipts = new Map();
const cookieId = (org) => createHash('sha256').update(`WEB:actor-${org}:org-${org}:ADMIN`).digest('hex').slice(0, 32);
const user = (org) => ({ id: `actor-${org}`, username: `user-${org}`, fullName: `User ${org}`, role: 'ADMIN' });
const tenant = (org) => ({ tenantId: `org-${org}`, name: `Organisation ${org}`, slug: `org-${org}`, role: 'ADMIN', plan: 'GROWTH', status: 'ACTIVE', offlineEnabled: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const json = (value, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/__test/receipts') return json([...receipts.values()]);
  if (url.pathname === '/__offline-harness') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Offline integration test</title><script type="module">await import("/offline-test-harness.js"); window.harness = window.chitwiseOfflineHarness;</script>');
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const org = ['a', 'b'].find((id) => request.headers.authorization === `Bearer access-${id}`);
    const match = url.pathname.match(/^\/api\/auth\/accounts\/([a-f0-9]{32})\/refresh$/);
    if (match) {
      const owner = ['a', 'b'].find((id) => cookieId(id) === match[1]
        && (request.headers.cookie ?? '').includes(`chitwise_account_${match[1]}=refresh-${id}`));
      return owner ? json({ success: true, data: { accessToken: `access-${owner}`, browserAccountId: match[1], user: user(owner), tenant: tenant(owner) } })
        : json({ message: 'Sign in again' }, 401);
    }
    if (url.pathname === '/api/users/me/offline-access') {
      if (!org) return json({ message: 'Sign in again' }, 401);
      const now = Date.now();
      return json({ success: true, data: { enabled: true, reason: null, actorId: `actor-${org}`, tenantId: `org-${org}`, role: 'ADMIN', serverTime: now,
        grant: { id: `grant-${org}`, actorId: `actor-${org}`, tenantId: `org-${org}`, role: 'ADMIN', issuedAt: now,
          recordUntil: now + 7 * 86400000, actions: ['READ', 'RECORD_PAYMENT'], token: `proof-${org}` } } });
    }
    if (url.pathname === '/api/payments' && request.method === 'POST') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      if (!org || payload.offlineAuthorization !== `proof-${org}`) return json({ message: 'Wrong account' }, 403);
      const operationId = request.headers['x-idempotency-key'];
      const key = `${org}:${operationId}`;
      if (!receipts.has(key)) receipts.set(key, { id: `receipt-${operationId}`, org, operationId, payload });
      return json({ success: true, data: receipts.get(key) });
    }
    if (url.pathname === '/api/users/me/effective-limits') return json({ success: true, data: { plan: 'GROWTH', tenantStatus: 'ACTIVE', offlineEnabled: true } });
    return json({ success: true, data: [] });
  }
  let target = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!target.startsWith(root + '/') && target !== root) { response.writeHead(403); response.end(); return; }
  if (!extname(target)) target = resolve(root, 'index.html');
  try {
    const bytes = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
}).listen(3111, '127.0.0.1');
