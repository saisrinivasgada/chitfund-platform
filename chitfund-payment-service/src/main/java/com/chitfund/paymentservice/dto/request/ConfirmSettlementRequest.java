package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.SettlementMode;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class ConfirmSettlementRequest {

    @NotNull(message = "memberId is required")
    private UUID memberId;

    @NotEmpty(message = "At least one chit must be included in the settlement")
    private List<ChitItemRequest> chitItems;

    // Admin notes / reason for settlement
    private String notes;

    @Data
    public static class ChitItemRequest {

        @NotNull(message = "chitId is required")
        private UUID chitId;

        // Only relevant for CASE_C; defaults to FAIR if null
        private SettlementMode mode;
    }
}
