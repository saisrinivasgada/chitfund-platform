package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CashRequestSummaryResponse {
    private long pending;
    private long assigned;
    private long pickedUp;
    private long partiallyCollected;
    private long cancelled;
    private long collected;
    // Today's counts (since midnight local time)
    private long todayCancelled;
    private long todayCollected;
    private long todayRequested;
}
