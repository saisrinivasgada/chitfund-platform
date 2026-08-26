package com.chitfund.chitservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class AuctionBidResponse {
    private UUID id;
    private UUID memberId;
    private String memberName;
    private BigDecimal bidAmount;
    private BigDecimal discountOffered;
    private LocalDateTime bidTime;
    private boolean winning;
}
