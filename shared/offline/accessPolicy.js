export function belongsToAccount(access, account) {
  return !!access && access.actorId === account.userId && access.tenantId === account.tenantId && access.role === account.role;
}

export function canRecordOffline(access, action, now = Date.now()) {
  if (!access?.enabled || !access.grant || !Number.isFinite(access.checkedAt)
      || !Number.isFinite(access.serverTime) || now < access.checkedAt) return false;
  const serverNow = access.serverTime + now - access.checkedAt;
  const deadline = action === 'READ' ? access.grant.readUntil ?? access.grant.recordUntil : access.grant.recordUntil;
  return serverNow >= access.grant.issuedAt && serverNow < deadline && access.grant.actions.includes(action);
}

export function recordingPauseMessage(access, now = Date.now()) {
  if (!access?.enabled) return 'Offline access & sync is not enabled for this organisation. Connect to continue.';
  const serverNow = access.serverTime + now - access.checkedAt;
  if (access.reason === 'SUBSCRIPTION_EXPIRED' || (access.grant
      && access.grant.recordUntil < (access.grant.readUntil ?? access.grant.recordUntil)
      && serverNow >= access.grant.recordUntil)) {
    return 'Subscription expired. New offline payments are paused. Saved payments remain here and will still sync.';
  }
  return 'Connect to verify access before recording another offline payment. Your saved payments are preserved.';
}

export function requireOfflineRecording(access, action, now = Date.now()) {
  if (!canRecordOffline(access, action, now)) throw new Error(recordingPauseMessage(access, now));
  return access.grant;
}

/** A fresh sign-in denial supersedes an older cached grant; later verification can restore access. */
export function effectiveOfflineAccess(access, subscribed, checkedAt) {
  if (access && subscribed === false && Number.isFinite(checkedAt)
      && (!Number.isFinite(access.checkedAt) || access.checkedAt <= checkedAt)) {
    return { ...access, enabled: false, reason: 'ADD_ON_REQUIRED', grant: null };
  }
  return access;
}
