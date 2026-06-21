package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class AdminWalletBalanceResponse {
    private BigDecimal cashBalance;
    private BigDecimal bankBalance;
    private BigDecimal totalBalance;
    private List<AdminWalletEntryResponse> recentTransactions;
}
