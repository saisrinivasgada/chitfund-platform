/** Resolve only the immutable policy version the server asked the user to review. */
export function legalDocumentUrl(document, kind, { baseUrl, allowedOrigins, relativeSameOrigin = false }) {
  if (!document?.version || !document?.documentUrl || !['terms', 'privacy'].includes(kind)) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(document.documentUrl, base);
    if (!allowedOrigins.includes(url.origin) || url.username || url.password || url.search || url.hash) return null;
    const prefix = `/api/legal/documents/${kind}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const encodedVersion = url.pathname.slice(prefix.length);
    if (!encodedVersion || encodedVersion.includes('/') || decodeURIComponent(encodedVersion) !== String(document.version)) return null;
    return relativeSameOrigin && url.origin === base.origin ? url.pathname : url.href;
  } catch {
    return null;
  }
}
