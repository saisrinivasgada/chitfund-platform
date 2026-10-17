package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.*;
import java.time.Instant;

/** Device-reported evidence from older clients; this is never a signing grant. */
public record LegacyOfflineStaffActionRequest(
        @NotBlank @Size(max = 128) String operationId,
        @NotBlank @Pattern(regexp = "MARK_PICKUP|PARTIAL_COLLECT") String action,
        @NotNull Instant recordedAt,
        @NotBlank @Size(max = 32768) String originalPayloadJson,
        @NotBlank @Pattern(regexp = "[0-9a-f]{64}") String originalPayloadHash) { }
