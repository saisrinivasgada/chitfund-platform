package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Optional;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface AccountSetupTokenRepository extends JpaRepository<AccountSetupToken, UUID> {

    Optional<AccountSetupToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM AccountSetupToken t WHERE t.tokenHash = :hash")
    Optional<AccountSetupToken> findByTokenHashForUpdate(@Param("hash") String hash);

    // Latest unused token for this user (for resend) — used by TenantService
    Optional<AccountSetupToken> findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(UUID userId);

    List<AccountSetupToken> findAllByChitfundRequestIdAndUsedAtIsNull(UUID chitfundRequestId);

    // All active (unused, unexpired) tokens for a user+purpose — for concurrent revocation
    List<AccountSetupToken> findAllByUserIdAndPurposeAndUsedAtIsNull(UUID userId, SetupTokenPurpose purpose);

    // True only when this user has a genuine, unused, unexpired ORG_USER_INVITE token.
    // Tighter than mustChangePassword || emailVerificationRequired, which also fires
    // during password-reset and email-change workflows.
    @Query("SELECT COUNT(t) > 0 FROM AccountSetupToken t WHERE t.userId = :userId " +
           "AND t.purpose = com.chitfund.userservice.domain.enums.SetupTokenPurpose.ORG_USER_INVITE " +
           "AND t.usedAt IS NULL AND t.expiresAt > :now")
    boolean existsActiveOrgUserInvite(@Param("userId") UUID userId, @Param("now") LocalDateTime now);

    // Batch variant for listing — avoids N+1 when rendering org-user lists.
    @Query("SELECT t.userId FROM AccountSetupToken t WHERE t.userId IN :userIds " +
           "AND t.purpose = com.chitfund.userservice.domain.enums.SetupTokenPurpose.ORG_USER_INVITE " +
           "AND t.usedAt IS NULL AND t.expiresAt > :now")
    Set<UUID> findUserIdsWithActiveOrgInvite(
            @Param("userIds") Collection<UUID> userIds, @Param("now") LocalDateTime now);

    // Freshness guard for resend: returns a token created at or after `since` that is
    // still unused. Used to de-duplicate rapid back-to-back resend requests.
    @Query("SELECT t FROM AccountSetupToken t WHERE t.userId = :userId " +
           "AND t.purpose = com.chitfund.userservice.domain.enums.SetupTokenPurpose.ORG_USER_INVITE " +
           "AND t.usedAt IS NULL AND t.createdAt >= :since " +
           "ORDER BY t.createdAt DESC")
    Optional<AccountSetupToken> findFreshActiveOrgInvite(
            @Param("userId") UUID userId, @Param("since") LocalDateTime since);
}
