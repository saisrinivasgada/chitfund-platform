package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Request to preview what a settlement would look like for a given member.
 * chitIds may be omitted — if null/empty, all enrolled chits are included.
 */
@Data
public class SettlementPreviewRequest {

    @NotNull(message = "memberId is required")
    private UUID memberId;

    // If null or empty, service will fetch all chit enrollments for the member
    private List<UUID> chitIds;
}
