package com.chitfund.payoutservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PayoutFinancialSyncResponse {
    private String status;
    private long totalOperations;
    private long completedOperations;
    private long pendingOperations;
    private long retryingOperations;
    private String lastErrorCode;
}
