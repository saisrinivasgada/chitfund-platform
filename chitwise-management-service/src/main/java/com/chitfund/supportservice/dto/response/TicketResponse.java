package com.chitfund.supportservice.dto.response;

import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.domain.enums.TicketType;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class TicketResponse {
    private String id;
    private String ticketNumber;
    private TicketType type;
    private String tenantId;
    private String createdBy;
    private String createdByName;
    private String subject;
    private String description;
    private TicketPriority priority;
    private TicketStatus status;
    private String assignedTo;
    private String assignedToName;
    private Instant firstResponseAt;
    private Instant resolvedAt;
    private Instant createdAt;
    private Instant updatedAt;
    private long unreadCount;
}
