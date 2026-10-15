package com.chitfund.userservice.outbox;

import java.util.UUID;

public record SetupEmailCommand(
        String deliveryId,
        UUID requestId,
        UUID candidateUserId,
        String toEmail,
        String fullName,
        String orgName,
        int attempts,
        String leaseToken) {
}
