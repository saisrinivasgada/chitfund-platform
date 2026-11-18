/** Delay an automatic retry until the server's throttle window has passed. */
export function retryAfterDelayMs(error) {
  if ((error?.response?.status ?? error?.status) !== 429) return null;
  const headers = error.response?.headers;
  const raw = error?.retryAfter ?? headers?.get?.('retry-after') ?? headers?.['retry-after'];
  const numeric = Number(raw);
  const seconds = raw == null ? NaN : Number.isFinite(numeric)
    ? numeric : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

/** Give every client the same clear message when the server throttles a request. */
export function rateLimitMessage(error) {
  if (error?.response?.status !== 429) return null;
  const delay = retryAfterDelayMs(error);
  const serverMessage = error.response.data?.message;
  if (delay == null) {
    return serverMessage || 'Too many requests. Please wait before trying again.';
  }
  const seconds = Math.ceil(delay / 1000);
  const wait = seconds < 60
    ? `${Math.ceil(seconds)} seconds`
    : `${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}`;
  return `Too many requests. Please try again in ${wait}.`;
}
