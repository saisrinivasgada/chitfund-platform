package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.TrustedDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, UUID> {

    Optional<TrustedDevice> findByTokenHash(String tokenHash);

    @Modifying
    @Transactional
    @Query("DELETE FROM TrustedDevice td WHERE td.userId = :userId")
    void deleteByUserId(UUID userId);

    /** Atomic upsert: inserts a new row or updates the existing row for this user. */
    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO trusted_devices (id, user_id, token_hash, expires_at, created_at)
            VALUES (:id, :userId, :tokenHash, :expiresAt, NOW())
            ON DUPLICATE KEY UPDATE token_hash = :tokenHash, expires_at = :expiresAt
            """, nativeQuery = true)
    void upsertByUserId(
            @org.springframework.data.repository.query.Param("id")        String id,
            @org.springframework.data.repository.query.Param("userId")    String userId,
            @org.springframework.data.repository.query.Param("tokenHash") String tokenHash,
            @org.springframework.data.repository.query.Param("expiresAt") LocalDateTime expiresAt);
}
