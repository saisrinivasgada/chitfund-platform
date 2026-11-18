import assert from 'node:assert/strict';
import test from 'node:test';
import { centralGoogleLoginUrl, googleProofTargetOrigin, loginTenantSlug, tenantSlugFromHostname, tenantHandoffUrl } from './tenantHandoff.js';

const code = 'a'.repeat(64);
const options = { enabled: true, hostname: 'thechitwise.com' };

test('only tenant hosts are recognized as tenant subdomains', () => {
  assert.equal(tenantSlugFromHostname('thechitwise.com'), null);
  assert.equal(tenantSlugFromHostname('app.thechitwise.com'), null);
  assert.equal(tenantSlugFromHostname('hub.thechitwise.com'), null);
  assert.equal(tenantSlugFromHostname('admin.thechitwise.com'), null);
  assert.equal(tenantSlugFromHostname('alpha.thechitwise.com'), 'alpha');
  assert.equal(tenantSlugFromHostname('alpha.localhost'), 'alpha');
  assert.equal(tenantSlugFromHostname('alpha.other.com'), null);
});

test('tenant Google login starts on the registered main origin and returns to that tenant', () => {
  assert.equal(centralGoogleLoginUrl('alpha.thechitwise.com'), 'https://thechitwise.com/login?tenant=alpha');
  assert.equal(centralGoogleLoginUrl('www.thechitwise.com'), 'https://thechitwise.com/login');
  assert.equal(centralGoogleLoginUrl('thechitwise.com'), null);
  assert.equal(centralGoogleLoginUrl('alpha.localhost'), null);
  assert.equal(loginTenantSlug('thechitwise.com', '?tenant=alpha'), 'alpha');
  assert.equal(loginTenantSlug('alpha.thechitwise.com', '?tenant=beta'), 'alpha');
  assert.equal(loginTenantSlug('thechitwise.com', '?tenant=hub'), null);
  assert.equal(loginTenantSlug('thechitwise.com', '?tenant=alpha.evil.com'), null);
  assert.equal(loginTenantSlug('evil.example', '?tenant=alpha'), null);
});

test('Google re-verification can send its proof only to a ChitWise tenant origin', () => {
  assert.equal(googleProofTargetOrigin('https://alpha.thechitwise.com'), 'https://alpha.thechitwise.com');
  assert.equal(googleProofTargetOrigin('https://evil.example'), null);
  assert.equal(googleProofTargetOrigin('http://alpha.thechitwise.com'), null);
  assert.equal(googleProofTargetOrigin('https://alpha.thechitwise.com.evil.example'), null);
  assert.equal(googleProofTargetOrigin('https://alpha.thechitwise.com/path'), null);
});

test('handoff code stays in a fragment on the exact HTTPS tenant host', () => {
  const url = tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.thechitwise.com' },
    'alpha', 'google:123', options);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://alpha.thechitwise.com');
  assert.equal(parsed.pathname, '/auth/transfer');
  assert.equal(parsed.search, '');
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('handoff'), code);
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('browserKey'), 'google:123');
});

test('handoff refuses a mismatched host, bad code, and localhost redirect', () => {
  assert.equal(tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://evil.example' }, 'alpha', null, options), null);
  assert.equal(tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'http://alpha.thechitwise.com' }, 'alpha', null, options), null);
  assert.equal(tenantHandoffUrl({ handoffCode: 'short', tenantPortalUrl: 'https://alpha.thechitwise.com' }, 'alpha', null, options), null);
  assert.equal(tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.thechitwise.com' },
    'alpha', null, { enabled: true, hostname: 'localhost' }), null);
  assert.equal(tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.thechitwise.com' },
    'alpha', null, { enabled: true, hostname: 'beta.localhost' }), null);
});

test('handoff also exchanges on the current tenant host for Google browser trust', () => {
  const url = tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.thechitwise.com' },
    'alpha', 'google:123', { enabled: true, hostname: 'alpha.thechitwise.com' });
  assert.equal(new URL(url).hostname, 'alpha.thechitwise.com');
  assert.equal(new URL(url).pathname, '/auth/transfer');
});

test('a staging build can bind login, Google proof, and handoff to its own domain', () => {
  const domain = 'staging.thechitwise.com';
  assert.equal(tenantSlugFromHostname('alpha.staging.thechitwise.com', domain), 'alpha');
  assert.equal(tenantSlugFromHostname('alpha.thechitwise.com', domain), null);
  assert.equal(centralGoogleLoginUrl('alpha.staging.thechitwise.com', domain),
    'https://staging.thechitwise.com/login?tenant=alpha');
  assert.equal(loginTenantSlug(domain, '?tenant=alpha', domain), 'alpha');
  assert.equal(googleProofTargetOrigin('https://alpha.staging.thechitwise.com', domain),
    'https://alpha.staging.thechitwise.com');
  assert.equal(googleProofTargetOrigin('https://alpha.thechitwise.com', domain), null);
  const url = tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.staging.thechitwise.com' },
    'alpha', null, { enabled: true, hostname: domain, portalDomain: domain });
  assert.equal(new URL(url).origin, 'https://alpha.staging.thechitwise.com');
  assert.equal(tenantHandoffUrl({ handoffCode: code, tenantPortalUrl: 'https://alpha.thechitwise.com' },
    'alpha', null, { enabled: true, hostname: domain, portalDomain: domain }), null);
});
