package com.chitfund.paymentservice.dto.request;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
public record ResolveOfflineStaffReviewRequest(
        @NotBlank @Pattern(regexp = "RECORD_CUSTODY|LINK_CUSTODY|CANCEL_MISTAKE|RECORD_REFUND") String decision,
        @NotBlank String expectedVersion, @NotBlank @Size(min = 5, max = 500) String reason,
        @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 13, fraction = 2) BigDecimal actualAmount,
        boolean confirmed, String paymentMode, @Size(max = 200) String reference, Instant refundedAt) { }
