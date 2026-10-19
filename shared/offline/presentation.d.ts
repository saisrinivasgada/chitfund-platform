export function offlinePresentation(access: { enabled?: boolean; reason?: string | null } | null | undefined, subscribed?: boolean): {
  showSync: boolean; notSubscribed: boolean;
};
