import { useMutation, onlineManager } from '@tanstack/react-query';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { Alert } from 'react-native';

const OFFLINE_FLAG = '__offline__';

function isOfflineError(e: unknown): boolean {
  return e instanceof Error && (e as any)[OFFLINE_FLAG] === true;
}

function makeOfflineError(): Error {
  return Object.assign(new Error('No internet connection. Reconnect and try again.'), {
    [OFFLINE_FLAG]: true,
  });
}

/**
 * Drop-in replacement for useMutation that blocks the call when offline and
 * shows a "No connection" alert. The original onError fires normally for all
 * non-offline errors, so callers don't need to change their error handling.
 */
export function useOnlineMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const originalOnError = options.onError;
  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    mutationFn: options.mutationFn
      ? async (variables: TVariables) => {
          if (!onlineManager.isOnline()) throw makeOfflineError() as unknown as TError;
          return (options.mutationFn as (v: TVariables) => Promise<TData>)(variables);
        }
      : undefined,
    onError: (...args) => {
      const [error] = args;
      if (isOfflineError(error)) {
        Alert.alert(
          "You're offline",
          "This action requires an internet connection. Reconnect and try again.",
          [{ text: 'OK' }],
        );
        return;
      }
      (originalOnError as (...a: typeof args) => unknown)?.(...args);
    },
  });
}
