package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class PaymentBatchResponse {

    private UUID id;
    private UUID chitId;
    private UUID memberId;
    private BigDecimal totalAmount;
    private PaymentMode paymentMode;
    private BatchStatus status;

    private UUID collectedBy;
    private UUID recordedBy;
    private LocalDateTime collectedAt;
    private LocalDateTime remittedAt;
    private UUID remittedBy;

    private LocalDateTime voidedAt;
    private UUID voidedBy;
    private String voidReason;

    private String notes;
    private LocalDateTime createdAt;

    // How this batch's amount was distributed across months (FIFO order)
    private List<AllocationDetail> allocations;

    @Data
    @Builder
    public static class AllocationDetail {
        private int monthNumber;
        private BigDecimal allocatedAmount;
        private UUID paymentRecordId;
        // The chit this allocation actually went to — may differ from batch.chitId
        // when cross-chit spillover applied the excess to another chit's outstanding.
        private UUID chitId;
    }
}
