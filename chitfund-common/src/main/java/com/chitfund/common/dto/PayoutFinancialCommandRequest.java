package com.chitfund.common.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Authenticated payout-service command executed idempotently by payment-service.
 * Fields are intentionally explicit so financial commands remain inspectable and
 * do not depend on Java-serialized implementation details.
 */
public record PayoutFinancialCommandRequest(
        UUID commandId,
        String commandType,
        String tenantId,
        UUID actorId,
        UUID payoutId,
        UUID chitId,
        UUID memberId,
        Integer monthNumber,
        BigDecimal amount,
        String disbursementMode
) {
}
