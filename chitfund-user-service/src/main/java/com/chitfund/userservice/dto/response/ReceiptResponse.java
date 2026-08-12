package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ReceiptResponse {

    private String id;
    private String receiptNumber;
    private String paymentId;
    private String tenantId;
    private String tenantName;
    private String type;          // PAYMENT | REFUND
    private long   amountPaise;
    private LocalDateTime issuedAt;
}
