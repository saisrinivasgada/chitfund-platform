/** Responses may arrive after the user selects another chit. Apply only to their owner. */
export function applyChitScheduleCommand<T extends { id: string; scheduleSyncCommandId?: string | null }>(
  current: T | null, response: { chitId: string; commandId: string; status: string },
): T | null {
  if (!current || current.id !== response.chitId) return current;
  return { ...current, scheduleSyncCommandId: ['COMPLETED', 'REJECTED'].includes(response.status) ? null : response.commandId };
}
