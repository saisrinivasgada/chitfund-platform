package com.chitfund.supportservice.domain.entity;

import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.domain.enums.TicketType;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "support_tickets")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportTicket {

    @Id
    private String id;

    @Column(name = "ticket_number", nullable = false, unique = true)
    private String ticketNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketType type;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_by_name")
    private String createdByName;

    @Column(nullable = false)
    private String subject;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private TicketPriority priority = TicketPriority.NORMAL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private TicketStatus status = TicketStatus.OPEN;

    @Column(name = "assigned_to")
    private String assignedTo;

    @Column(name = "assigned_to_name")
    private String assignedToName;

    @Column(name = "first_response_at")
    private Instant firstResponseAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
