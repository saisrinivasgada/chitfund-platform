// Entitlement controls presentation independently of durable delivery of old work.
export function offlinePresentation(access, subscribed) {
  if (access?.enabled === false && access.reason && access.reason !== 'ADD_ON_REQUIRED') {
    return { showSync: subscribed === true, notSubscribed: false };
  }
  const enabled = typeof access?.enabled === 'boolean' ? access.enabled : subscribed;
  return { showSync: enabled === true, notSubscribed: enabled === false };
}
