package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.NotificationType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "varchar(36)")
    private UUID id;

    // null = role-based broadcast; non-null = specific user
    @Column(columnDefinition = "varchar(36)")
    private UUID recipientUserId;

    // null = user-specific; non-null = broadcast to this role ("ADMIN", "MANAGER", etc.)
    @Column(length = 20)
    private String recipientRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(60)")
    private NotificationType type;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(length = 50)
    private String entityType;

    @Column(columnDefinition = "varchar(36)")
    private UUID entityId;

    @Column(length = 300)
    private String link;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
