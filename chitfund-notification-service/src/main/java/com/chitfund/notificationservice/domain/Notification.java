package com.chitfund.notificationservice.domain;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.domain.enums.NotificationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID recipientId;

    private String recipientPhone;
    private String recipientEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private NotificationChannel channel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(50)")
    private NotificationEventType eventType;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private NotificationStatus status;

    @Column(columnDefinition = "text")
    private String errorMessage;

    // Provider's own message ID — useful for delivery status lookup
    @Column(length = 100)
    private String externalId;

    private LocalDateTime sentAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
    }
}
