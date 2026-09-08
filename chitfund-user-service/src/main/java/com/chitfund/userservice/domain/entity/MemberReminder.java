package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "member_reminders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 36)
    private String orgId;

    @Column(nullable = false)
    private UUID senderId;

    @Column(length = 200)
    private String senderName;

    @Column(nullable = false)
    private UUID memberUserId;

    @Column(nullable = false)
    private UUID memberProfileId;

    @Column(columnDefinition = "TEXT")
    private String message;

    // JSON: [{chitId, chitName, cycleNo, installmentAmount}]
    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String chitDetails = "[]";

    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    private Integer repeatIntervalMinutes;

    @Column(length = 5)
    private String reminderTime; // HH:MM, used with daily repeat

    private LocalDateTime seenAt;
    private LocalDateTime readAt;
    private LocalDate promisedDate;

    // JSON: [{date: "YYYY-MM-DD", setAt: "ISO datetime"}]
    @Column(columnDefinition = "TEXT")
    private String promisedDateHistory;

    @Column(name = "is_archived", nullable = false)
    @Builder.Default
    private boolean archived = false;
    private LocalDateTime archivedAt;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
