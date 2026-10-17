export function legacyStaffEvidence(operation: { operationId: string; action: string; payload: any; payloadHash: string; createdAt: number }): {
  operationId: string; action: string; recordedAt: string; originalPayloadJson: string; originalPayloadHash: string;
};
