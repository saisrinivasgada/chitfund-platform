package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record ResolveOfflinePaymentReviewRequest(
        @NotNull @Pattern(regexp = "APPLY_WITH_EXCESS|LINK_DUPLICATE") String decision,
        @NotBlank @Size(max = 64) String expectedBalanceVersion,
        @NotBlank @Size(min = 5, max = 500) String reason,
        UUID existingReceiptId) { }
