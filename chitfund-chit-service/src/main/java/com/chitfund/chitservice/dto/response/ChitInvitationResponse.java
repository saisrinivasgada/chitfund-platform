package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.InvitationStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class ChitInvitationResponse {
    private UUID id;
    private UUID chitId;
    private String chitName;
    private String chitType;
    private String winnerSelectionMode;
    private String message;
    private InvitationStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime closedAt;
    private int recipientCount;
    private int responseCount;
    // null in list view, populated in detail view
    private List<InvitationResponseDTO> responses;
}
