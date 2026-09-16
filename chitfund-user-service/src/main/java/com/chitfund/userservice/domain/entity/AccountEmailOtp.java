package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "account_email_otps")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountEmailOtp {
    @Id
    @Column(length = 36)
    private String id;
    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;
    @Column(nullable = false)
    private String email;
    @Column(name = "verification_code", nullable = false, length = 10)
    private String verificationCode;
    @Column(nullable = false, length = 40)
    private String purpose;
    @Column(nullable = false)
    private int attempts;
    @Column(nullable = false)
    private boolean verified;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
