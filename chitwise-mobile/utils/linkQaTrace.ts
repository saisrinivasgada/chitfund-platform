/** Opt-in diagnostics may send only to the isolated localhost fixture. */
export function linkQaTraceEndpoint(flag: string | undefined, api: string | undefined): string | null {
  if (flag !== '1' || !/^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):\d+\/api$/.test(api ?? '')) return null;
  try { return `${new URL(api!).origin}/__qa/link-trace`; } catch { return null; }
}

/** Never include query parameters, fragments, usernames or token values. */
export function linkQaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'chitwise:' ? parsed.pathname.slice(0, 200) : '<other-scheme>';
  } catch { return '<invalid-url>'; }
}
