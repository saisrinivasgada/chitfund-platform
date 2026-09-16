package com.chitfund.userservice.service;

import java.util.List;
import java.util.UUID;

public record IdentityNotificationEvent(
        Type type,
        UUID recipientUserId,
        UUID requestId,
        String organizationName,
        List<UUID> affectedTenantIds) {

    public enum Type {
        CHITFUND_REQUEST_CREATED,
        CHITFUND_ACCESS_ACTIVATED,
        PHONE_IDENTITY_REASSIGNED
    }
}
