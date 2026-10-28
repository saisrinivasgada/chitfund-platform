/** Serialise storage mutations so concurrent account operations cannot lose updates. */
export function serializeActions<T extends object>(state: T): T {
  let tail: Promise<unknown> = Promise.resolve();
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key,
    typeof value === 'function' ? (...args: unknown[]) => {
      const next = tail.then(() => value(...args));
      tail = next.catch(() => undefined);
      return next;
    } : value,
  ])) as T;
}
