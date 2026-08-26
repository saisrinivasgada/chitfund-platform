package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class ApplyAuctionDividendRequest {

    @NotNull private UUID chitId;
    @NotNull @Min(1) private Integer monthNumber;

    @NotNull @DecimalMin("0.01") private BigDecimal grossInstallmentAmount;
    @NotNull @DecimalMin("0.00") private BigDecimal dividendPerSpot;

    @NotNull private List<MemberSpot> memberSpots;

    @Data
    public static class MemberSpot {
        @NotNull private UUID memberId;
        @Min(1)  private int spots;
    }
}
