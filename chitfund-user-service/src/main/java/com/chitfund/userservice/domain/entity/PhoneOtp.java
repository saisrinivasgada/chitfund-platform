package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "phone_otps")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PhoneOtp {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 20)
    private String phone;

    @Column(name = "country_code", length = 10)
    private String countryCode;

    @Column(name = "verification_code", nullable = false, length = 10)
    private String otpHash;

    @Column(nullable = false, length = 30)
    private String purpose;

    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private boolean verified;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
