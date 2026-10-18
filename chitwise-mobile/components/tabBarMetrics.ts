/** Keep the original button area above gesture bars, Android keys and taskbars. */
export function tabBarMetrics(platform: string, bottomInset: number) {
  const inset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  const paddingBottom = Math.max(platform === 'ios' ? 23 : 7, inset);
  return { height: (platform === 'ios' ? 68 : 65) + paddingBottom, paddingBottom };
}
