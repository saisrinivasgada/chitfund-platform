package com.chitfund.notificationservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * In-app notification stored per recipient so mobile/web can fetch and display
 * them like Instagram/Facebook — with read/unread state, metadata, and clear-all.
 *
 * WHY separate from Notification (SMS/WhatsApp)?
 * The existing Notification entity is an outbound delivery record tied to a channel
 * (SMS, WhatsApp). In-app notifications have a different lifecycle: they persist
 * until the user dismisses them, carry rich metadata for chip rendering, and need
 * a read/unread flag. Keeping them separate avoids polluting the channel-specific
 * table with in-app-only columns.
 */
@Entity
@Table(name = "in_app_notifications", indexes = {
    @Index(name = "idx_ian_recipient", columnList = "recipientId"),
    @Index(name = "idx_ian_recipient_read", columnList = "recipientId, isRead"),
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InAppNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID recipientId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    /** Maps to NotificationEventType string — used by frontend for icon selection. */
    @Column(nullable = false, length = 50)
    private String type;

    /**
     * JSON blob: memberId, workerId, chitId, amount, and any other context.
     * Frontend uses these to resolve names from its local cache.
     *
     * Example: {"memberId":"uuid","chitId":"uuid","amount":"2000.00","workerId":"uuid"}
     */
    @Column(columnDefinition = "text")
    private String metadata;

    /** Optional deep-link path for frontend navigation (e.g. /member/chits/{id}). */
    @Column(length = 255)
    private String link;

    @Column(nullable = false)
    private boolean isRead;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        isRead = false;
    }
}
