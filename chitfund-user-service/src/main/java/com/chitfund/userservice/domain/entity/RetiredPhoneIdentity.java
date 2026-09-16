package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity @Table(name = "retired_phone_identities")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class RetiredPhoneIdentity {
    @Id private UUID id;
    @Column(name = "operation_id", nullable = false, unique = true) private String operationId;
    @Column(name = "user_id", nullable = false, columnDefinition = "char(36)") private UUID userId;
    @Column(name = "phone_hash", nullable = false, length = 64) private String phoneHash;
    @Column(name = "country_code") private String countryCode;
    @Column(name = "retired_at", nullable = false) private LocalDateTime retiredAt;
    @PrePersist void create() { if (id == null) id = UUID.randomUUID(); if (retiredAt == null) retiredAt = LocalDateTime.now(); }
}
