package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class MemberCreditResponse {

    private UUID memberId;
    private BigDecimal balance;
    private List<CreditTransaction> recentTransactions;

    @Data
    @Builder
    public static class CreditTransaction {
        private UUID id;
        private BigDecimal amount;
        private String type;           // "IN" or "OUT"
        private UUID sourceBatchId;
        private UUID chitId;
        private String description;
        private LocalDateTime createdAt;
    }
}
