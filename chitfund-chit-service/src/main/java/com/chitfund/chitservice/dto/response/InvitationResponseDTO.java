package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.ResponseStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class InvitationResponseDTO {

    private UUID id;
    private UUID invitationId;
    private UUID memberId;
    private ResponseStatus responseStatus;
    private String reason;

    // LOTTERY / AUCTION
    private Integer spotsRequested;
    private Integer approvedSpots;

    // RESERVATION
    private List<Integer> requestedDrawNumbers;
    private List<Integer> approvedDrawNumbers;

    // Current enrollment state in this chit (filled by service)
    private Integer currentEnrollmentSpots;
    private List<Integer> currentReservedDrawNumbers;

    private boolean approved;
    private LocalDateTime approvedAt;
    private LocalDateTime respondedAt;
    private UUID approvedBy;
    private String adminRejectionReason;
}
