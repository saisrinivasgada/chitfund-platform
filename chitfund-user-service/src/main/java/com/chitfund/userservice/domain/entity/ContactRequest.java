package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "contact_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContactRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 20)
    private String type; // PROSPECT | ORG_SUPPORT

    @Column(length = 200)
    private String name;

    @Column(length = 200)
    private String email;

    @Column(length = 50)
    private String phone;

    @Column(length = 500)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    private UUID tenantId;

    @Column(length = 200)
    private String tenantName;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "NEW"; // NEW | OPEN | ON_HOLD | RESOLVED | CLOSED

    @Column(nullable = false, length = 10)
    @Builder.Default
    private String preferredContact = "EMAIL"; // EMAIL | SMS | BOTH

    private LocalDateTime holdUntil;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
