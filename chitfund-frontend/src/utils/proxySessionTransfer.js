const BOOTSTRAP_KEY = 'chitwise.proxy.bootstrap';
const MAX_BOOTSTRAP_AGE_MS = 60_000;

export function openProxyWindow() {
  return window.open('', '_blank');
}

export function transferProxySession(proxyWindow, result, tenantName) {
  if (!proxyWindow || proxyWindow.closed) throw new Error('Allow pop-ups to open this proxy session.');
  if (!result?.token) throw new Error('The proxy session did not include an access token.');

  // The blank tab inherits this origin. Store only in that tab, then load a URL
  // without credentials so the token cannot enter address bars or HTTP logs.
  proxyWindow.sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify({
    token: result.token,
    tenantName: tenantName ?? '',
    createdAt: Date.now(),
  }));
  proxyWindow.opener = null;
  proxyWindow.location.replace(`${window.location.origin}/proxy`);
}

export function consumeProxyBootstrap() {
  const raw = sessionStorage.getItem(BOOTSTRAP_KEY);
  sessionStorage.removeItem(BOOTSTRAP_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value?.token || !Number.isFinite(value.createdAt)
        || Date.now() - value.createdAt > MAX_BOOTSTRAP_AGE_MS
        || value.createdAt > Date.now() + 5_000) return null;
    return value;
  } catch {
    return null;
  }
}
