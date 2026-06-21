package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class AdminWalletEntryResponse {
    private UUID id;
    private AccountType accountType;
    private WalletEntryType entryType;
    private BigDecimal amount;
    private String category;
    private String description;
    private LocalDateTime createdAt;
    private UUID createdBy;
}
