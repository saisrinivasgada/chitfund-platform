package com.chitfund.common.offline;

import java.time.Instant;

/** Internal verification request; actor and tenant come from the authenticated caller. */
public record OfflineReconciliationRequest(String actorId, String tenantId, String role,
                                            String action, String token, Instant recordedAt) { }
