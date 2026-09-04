package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.InvitationStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class MyInvitationDTO {

    private UUID id;
    private InvitationStatus status;
    private String message;
    private ChitSummary chit;
    private InvitationResponseDTO myResponse;
    // Only populated for RESERVATION chits
    private List<SlotInfo> slots;

    @Data
    @Builder
    public static class ChitSummary {
        private UUID id;
        private String name;
        private String chitType;
        private String winnerSelectionMode;
        private BigDecimal installmentAmount;
        private BigDecimal defaultPostPayoutContribution;
        private Integer capacity;
        private Integer durationMonths;
        private Integer monthlyDueDate;
        private LocalDate startDate;
    }
}
