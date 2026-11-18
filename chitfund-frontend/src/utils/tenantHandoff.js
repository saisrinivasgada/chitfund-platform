const PORTAL_DOMAIN = import.meta.env?.VITE_TENANT_PORTAL_DOMAIN?.trim().toLowerCase() || 'thechitwise.com';
export const RESERVED_TENANT_SLUGS = new Set([
  'hub', 'www', 'api', 'app', 'mail', 'admin', 'support', 'help',
  'status', 'cdn', 'static', 'assets', 'login', 'signup', 'register',
  'dashboard', 'billing', 'dev', 'staging', 'test', 'demo',
]);

export function tenantSlugFromHostname(hostname = window.location.hostname, portalDomain = PORTAL_DOMAIN) {
  const host = hostname.toLowerCase();
  if (host.endsWith('.localhost')) {
    const localSlug = host.slice(0, -'.localhost'.length);
    return localSlug && !localSlug.includes('.') ? localSlug : null;
  }
  const suffix = `.${portalDomain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return slug && !slug.includes('.') && !RESERVED_TENANT_SLUGS.has(slug) ? slug : null;
}

// Google requires an authorized JavaScript origin. New tenant subdomains cannot
// be registered one by one, so sign-in starts on the main site and hands off.
export function centralGoogleLoginUrl(hostname = window.location.hostname, portalDomain = PORTAL_DOMAIN) {
  const host = hostname.toLowerCase();
  if (host === portalDomain || host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1') return null;
  if (!host.endsWith(`.${portalDomain}`)) return null;
  const slug = tenantSlugFromHostname(host, portalDomain);
  const query = slug ? `?tenant=${encodeURIComponent(slug)}` : '';
  return `https://${portalDomain}/login${query}`;
}

export function googleProofTargetOrigin(rawOrigin, portalDomain = PORTAL_DOMAIN) {
  try {
    const url = new URL(rawOrigin);
    return url.origin === rawOrigin && url.protocol === 'https:' && tenantSlugFromHostname(url.hostname, portalDomain)
      ? url.origin : null;
  } catch {
    return null;
  }
}

export function loginTenantSlug(hostname = window.location.hostname, search = window.location.search, portalDomain = PORTAL_DOMAIN) {
  const hostSlug = tenantSlugFromHostname(hostname, portalDomain);
  if (hostSlug) return hostSlug;
  if (hostname.toLowerCase() !== portalDomain) return null;
  const slug = new URLSearchParams(search).get('tenant')?.toLowerCase();
  return slug && /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug) && !RESERVED_TENANT_SLUGS.has(slug)
    ? slug : null;
}

export function tenantHandoffEnabled() {
  return import.meta.env?.VITE_TENANT_HANDOFF_ENABLED === 'true';
}

export function tenantHandoffActive({ enabled = tenantHandoffEnabled(), hostname = window.location.hostname } = {}) {
  if (!enabled) return false;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1') return false;
  return true;
}

export function shouldHandoffToTenant(slug, options = {}) {
  return tenantHandoffActive(options) && !!slug && !RESERVED_TENANT_SLUGS.has(slug);
}

export function tenantHandoffUrl(authData, slug, browserKey = null, options = {}) {
  if (!shouldHandoffToTenant(slug, options) || !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) return null;
  if (!/^[a-f0-9]{64}$/i.test(authData?.handoffCode ?? '')) return null;
  try {
    const portal = new URL(authData.tenantPortalUrl);
    if (portal.origin !== `https://${slug}.${options.portalDomain ?? PORTAL_DOMAIN}`) return null;
    portal.pathname = '/auth/transfer';
    portal.search = '';
    portal.hash = new URLSearchParams({
      handoff: authData.handoffCode,
      ...(browserKey ? { browserKey } : {}),
    }).toString();
    return portal.toString();
  } catch {
    return null;
  }
}
