package com.chitfund.chitservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChitLifecycleSyncResponse {
    private String status;
    private long totalOperations;
    private long completedOperations;
    private long pendingOperations;
    private long retryingOperations;
    private String lastErrorCode;
}
