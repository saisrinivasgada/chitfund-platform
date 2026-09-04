package com.chitfund.paymentservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
public class OpenMonthRequest {

    @NotNull
    private UUID chitId;

    @NotNull
    @Min(1)
    private Integer monthNumber;

    @NotNull
    private LocalDate dueDate;

    // Base installment stored on the cycle record for display/reports
    @NotNull
    @DecimalMin("0.01")
    private BigDecimal installmentAmount;

    // chit.capacity — caps how many real (non-SKIPPED) cycles can be opened
    @NotNull
    @Min(1)
    private Integer maxCycles;

    // ONLINE or OFFLINE when this is an auction draw; null for lottery/reservation
    private String auctionMode;

    @NotNull
    @Valid
    @Size(min = 1, message = "At least one member is required")
    private List<MemberAmount> members;

    @Data
    public static class MemberAmount {
        @NotNull
        private UUID memberId;

        @NotNull
        @DecimalMin("0.00")
        private BigDecimal amountDue;
    }
}
