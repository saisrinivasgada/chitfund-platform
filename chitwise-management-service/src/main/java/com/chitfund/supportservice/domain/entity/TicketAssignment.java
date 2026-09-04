package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "ticket_assignments")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketAssignment {

    @Id
    private String id;

    @Column(name = "ticket_id", nullable = false)
    private String ticketId;

    @Column(name = "assigned_to", nullable = false)
    private String assignedTo;

    @Column(name = "assigned_by", nullable = false)
    private String assignedBy;

    private String note;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt;

    @PrePersist
    void onCreate() {
        if (assignedAt == null) assignedAt = Instant.now();
    }
}
