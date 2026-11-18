export function readOneTimeLinkToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get('token')
    ?? new URLSearchParams(window.location.search).get('token');
}

export function removeOneTimeLinkTokenFromUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}
