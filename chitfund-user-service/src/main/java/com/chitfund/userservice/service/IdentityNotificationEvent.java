package com.chitfund.userservice.service;

import java.util.List;
import java.util.UUID;

public record IdentityNotificationEvent(
        Type type,
        UUID recipientUserId,
        UUID requestId,
        String organizationName,
        List<UUID> affectedTenantIds,
        // Present only for CHITFUND_ACCESS_ACTIVATED — used to call member-service post-commit
        UUID activationTenantId,
        UUID activationMemberId,
        // Fallback email when the user record has no verified email yet (e.g. revoke before setup)
        String requestedEmail) {

    public enum Type {
        CHITFUND_REQUEST_CREATED,
        CHITFUND_ACCESS_ACTIVATED,
        CHITFUND_REQUEST_REVOKED,
        PHONE_IDENTITY_REASSIGNED
    }
}
