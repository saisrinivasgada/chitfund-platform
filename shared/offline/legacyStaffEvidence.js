/** Wrap unchanged old bytes for quarantine; never create retrospective authority. */
export function legacyStaffEvidence(operation) {
  if (!['MARK_PICKUP', 'PARTIAL_COLLECT'].includes(operation.action) || !operation.payload?.requestId
      || operation.payload.offlineAuthorization || !/^[0-9a-f]{64}$/.test(operation.payloadHash ?? '')) {
    throw Object.assign(new Error('The older pickup needs local recovery. Its original data remains preserved.'), { code: 'LOCAL_RECOVERY_REQUIRED' });
  }
  const date = new Date(operation.payload.recordedAt ?? operation.createdAt);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error('The older pickup time needs local recovery. Its original data remains preserved.'), { code: 'LOCAL_RECOVERY_REQUIRED' });
  return { operationId: operation.operationId, action: operation.action, recordedAt: date.toISOString(),
    originalPayloadJson: JSON.stringify(operation.payload), originalPayloadHash: operation.payloadHash };
}
