package com.chitfund.userservice.outbox;

import java.util.UUID;

public record MemberDeactivationCommand(
        String deliveryId,
        UUID requestId,
        UUID tenantId,
        UUID memberId,
        UUID userId,
        int attempts,
        String leaseToken
) {}
