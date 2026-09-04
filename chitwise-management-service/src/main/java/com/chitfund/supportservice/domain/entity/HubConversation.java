package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "hub_conversations")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HubConversation {

    @Id
    private String id;

    @Column(name = "employee1_id", nullable = false)
    private String employee1Id;

    @Column(name = "employee2_id", nullable = false)
    private String employee2Id;

    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    @Column(name = "last_message_preview")
    private String lastMessagePreview;

    @Column(name = "employee1_unread", nullable = false)
    @Builder.Default
    private int employee1Unread = 0;

    @Column(name = "employee2_unread", nullable = false)
    @Builder.Default
    private int employee2Unread = 0;

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
    void onUpdate() { updatedAt = Instant.now(); }
}
