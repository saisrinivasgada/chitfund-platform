package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class OfflineStaffActionRequest {
    @NotBlank @Size(max = 128) private String operationId;
    @NotNull private UUID requestId;
    @NotBlank @Pattern(regexp = "MARK_PICKUP|PARTIAL_COLLECT") private String action;
    @DecimalMin(value = "0.00", inclusive = false) private BigDecimal collectedAmount;
    @NotNull private LocalDateTime expectedUpdatedAt;
    @NotNull private Instant recordedAt;
    @NotBlank @Size(max = 4096) private String offlineAuthorization;
}
