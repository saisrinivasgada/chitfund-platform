package com.chitfund.common.dto;
import java.util.UUID;
/** A committed payment-side decision, never inferred from a transport error. */
public record DrawSkipResult(UUID commandId, String requestHash, String status, String reason) { }
