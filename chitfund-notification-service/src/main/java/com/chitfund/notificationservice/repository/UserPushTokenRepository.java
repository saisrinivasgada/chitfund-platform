package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.UserPushToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserPushTokenRepository extends JpaRepository<UserPushToken, UUID> {

    List<UserPushToken> findByUserId(UUID userId);

    Optional<UserPushToken> findByToken(String token);

    /**
     * Atomically register or refresh a push token in a single round-trip, keyed on
     * the unique {@code token} column (user_push_tokens.token, added in V5).
     *
     * <p>Two concurrent first-time registrations of the same token no longer race on
     * the unique key: the loser updates the just-inserted row instead of throwing a
     * duplicate-key error (which previously surfaced as a 500). Two concurrent
     * hand-offs resolve to a single last-writer-wins owner rather than an
     * inconsistent read-modify-write.
     *
     * <p>On conflict the existing row is updated <em>in place</em> — only
     * {@code user_id}, {@code platform} and {@code updated_at} change. The row
     * {@code id}, {@code token} and {@code created_at} are preserved, so queued
     * deliveries that reference a token by its row id (see
     * {@code NotificationDeliveryRelay}) still resolve to the same row and the
     * current-owner check stays authoritative after a reassignment.
     *
     * <p>The supplied {@code id} is only used when inserting a brand-new row; it is
     * ignored on conflict. Returns the MySQL affected-row count (1 insert, 2 update).
     */
    @Modifying
    @Query(value = "INSERT INTO user_push_tokens (id, user_id, token, platform, created_at, updated_at) "
            + "VALUES (:id, :userId, :token, :platform, :now, :now) "
            + "ON DUPLICATE KEY UPDATE "
            + "user_id = VALUES(user_id), platform = VALUES(platform), updated_at = VALUES(updated_at)",
            nativeQuery = true)
    int upsertToken(@Param("id") String id,
                    @Param("userId") String userId,
                    @Param("token") String token,
                    @Param("platform") String platform,
                    @Param("now") LocalDateTime now);

    /**
     * Atomically delete a token only when it is still owned by the given user.
     * Returns the number of rows removed (0 when the token was already
     * re-assigned to another user or never existed).
     */
    @Modifying
    @Query("delete from UserPushToken t where t.userId = :userId and t.token = :token")
    int deleteByUserIdAndToken(@Param("userId") UUID userId, @Param("token") String token);

    void deleteByUserId(UUID userId);
}
