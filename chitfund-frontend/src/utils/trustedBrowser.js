const TOKENS_KEY = 'chitwise_device_tokens';
const LEGACY_TOKEN_KEY = 'chitwise_device_token';
const ACTIVE_KEYS_KEY = 'chitwise_active_browser_keys';
const MAX_SAVED_TOKENS = 40;

export function browserKeyForUsername(username) {
  const value = username?.trim().toLowerCase();
  return value ? `username:${value}` : null;
}

export function browserKeyForMobile(countryCode, phone, role) {
  const number = phone?.replace(/\D/g, '');
  if (!number) return null;
  const country = (countryCode || '+91').replace(/\D/g, '');
  return `mobile:${country}:${number}:${role || ''}`;
}

export function browserKeyForGoogle(idToken) {
  try {
    // This claim only selects a local token. The backend validates the ID token and
    // checks that the remembered-browser token belongs to the authenticated user.
    const encoded = idToken?.split('.')[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof claims.sub === 'string' && claims.sub ? `google:${claims.sub}` : null;
  } catch { return null; }
}

function readSavedTokens() {
  try {
    const value = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function getStoredDeviceToken(key) {
  if (!key) return null;
  try {
    const entry = readSavedTokens()[key];
    if (typeof entry?.token === 'string') return entry.token;
    // Preserve one previously trusted browser through the storage migration.
    // The server still binds this token to the authenticated user.
    return localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch { return null; }
}

export function saveDeviceToken(key, token) {
  if (!/^(?:username|mobile|google):[a-zA-Z0-9._:+-]{1,280}$/.test(key || '')
      || !/^[a-f0-9]{64}$/i.test(token || '')) return;
  try {
    const saved = readSavedTokens();
    saved[key] = { token, savedAt: Date.now() };
    const entries = Object.entries(saved)
      .filter(([, value]) => typeof value?.token === 'string')
      .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))
      .slice(0, MAX_SAVED_TOKENS);
    localStorage.setItem(TOKENS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* Browser storage unavailable; login itself still succeeds. */ }
}

export function clearDeviceToken(key) {
  try {
    if (!key) {
      localStorage.removeItem(TOKENS_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return;
    }
    const saved = readSavedTokens();
    delete saved[key];
    localStorage.setItem(TOKENS_KEY, JSON.stringify(saved));
    // A legacy token has no account key, so a targeted forget must also drop it.
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch { /* Browser storage unavailable. */ }
}

function readActiveKeys() {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_KEYS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

// Only the lookup key is associated with the user. The raw token remains in the
// existing per-login-method map and the server verifies that it belongs to them.
export function rememberActiveBrowserKey(userId, key) {
  if (!userId || !key) return;
  try {
    const active = readActiveKeys();
    active[userId] = key;
    localStorage.setItem(ACTIVE_KEYS_KEY, JSON.stringify(active));
  } catch { /* Browser storage unavailable. */ }
}

export function getActiveDeviceToken(userId) {
  const key = userId ? readActiveKeys()[userId] : null;
  return typeof key === 'string' ? getStoredDeviceToken(key) : null;
}

export function clearActiveDeviceToken(userId) {
  if (!userId) return;
  try {
    const active = readActiveKeys();
    const key = active[userId];
    if (typeof key === 'string') clearDeviceToken(key);
    delete active[userId];
    localStorage.setItem(ACTIVE_KEYS_KEY, JSON.stringify(active));
  } catch { /* Browser storage unavailable. */ }
}
